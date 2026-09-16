/**
 * The plan-upload size limit and its refusals.
 *
 * ── Why the boundary is tested from both sides ───────────────────────────────
 * A limit is only two things: the largest file that works and the smallest that
 * does not. Everything between is the same code path. So these press right up
 * against the limit from each side rather than sampling somewhere in the middle,
 * because an off-by-one here either turns away a plan set the app promised to
 * take or quietly accepts one past the bound.
 *
 * ── How the "just under" case is checked without S3 ──────────────────────────
 * `createUploadTicket` asks storage for a signed URL, and there is no storage
 * configured in tests. So the accepting path is exercised through
 * `confirmAttach`, which runs the SAME `checkPdfUpload` and then only touches
 * the database — a file just under the limit produces a real row, which is the
 * assertion that matters.
 *
 * For the ticket itself, the useful signal is WHICH failure comes back: an
 * oversized file must be refused by validation with a sentence about the limit,
 * never reach storage at all.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  MAX_PDF_BYTES,
  checkPdfUpload,
  formatBytes,
  looksLikePdf,
} from "../shared/uploadLimits";
import { bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7777;
const OTHER_USER = 7778;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-pdf-upload-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

const MB = 1024 * 1024;

async function newBid(userId = USER) {
  const bid = await callerFor(userId).bids.create({
    name: `Upload test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  });
  return bid!;
}

/** A storage key of the shape createUploadTicket issues. */
const keyFor = (bidId: number, filename: string, userId = USER) =>
  `bid-plans/${userId}/${bidId}/${filename}`;

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-pdf-upload-${id}`,
        name: `Upload test user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

// ── The rule itself ──────────────────────────────────────────────────────────

describe("the size limit", () => {
  it("is 2GB", () => {
    expect(MAX_PDF_BYTES).toBe(2 * 1024 * 1024 * 1024);
  });

  it("clears a scanned commercial set, which is why it was raised", () => {
    // The case each earlier ceiling turned away: a full set printed and
    // re-scanned at 300dpi colour, which is the most common large file in this
    // trade. The last two sizes are the ones 500MB refused.
    for (const size of [200 * MB, 450 * MB, 900 * MB, 1600 * MB]) {
      expect(
        checkPdfUpload({ filename: "Scanned set.pdf", byteSize: size }).ok
      ).toBe(true);
    }
  });

  it("accepts a file one byte under the limit", () => {
    expect(
      checkPdfUpload({ filename: "E1.pdf", byteSize: MAX_PDF_BYTES - 1 }).ok
    ).toBe(true);
  });

  it("accepts a file exactly at the limit", () => {
    // The limit is inclusive: "up to 2GB" has to mean 2GB works.
    expect(
      checkPdfUpload({ filename: "E1.pdf", byteSize: MAX_PDF_BYTES }).ok
    ).toBe(true);
  });

  it("refuses a file one byte over the limit", () => {
    const result = checkPdfUpload({
      filename: "E1.pdf",
      byteSize: MAX_PDF_BYTES + 1,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts every size the earlier ceilings turned away", () => {
    // 30MB was the original limit, 150MB the one after it. Each of these was
    // refused by one of them and must not be refused again.
    for (const size of [40 * MB, 80 * MB, 120 * MB, 149 * MB, 160 * MB]) {
      expect(
        checkPdfUpload({ filename: "Scanned set.pdf", byteSize: size }).ok
      ).toBe(true);
    }
  });

  it("refuses an empty file", () => {
    const result = checkPdfUpload({ filename: "E1.pdf", byteSize: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/empty/i);
  });
});

describe("what the refusal says", () => {
  it("names the file, its size, the limit, and what to do", () => {
    const result = checkPdfUpload({
      filename: "Tower A - Electrical.pdf",
      byteSize: 3 * 1024 * MB,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");

    // Each of these is load-bearing: which file, how far over, and the way out.
    expect(result.message).toContain("Tower A - Electrical.pdf");
    expect(result.message).toContain("3GB");
    expect(result.message).toContain(formatBytes(MAX_PDF_BYTES));
    expect(result.message).toMatch(/split/i);
  });

  it("says something different, and useful, for a file that is not a PDF", () => {
    const result = checkPdfUpload({ filename: "Plans.dwg", byteSize: 4 * MB });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toContain("Plans.dwg");
    expect(result.message).toMatch(/PDF/);
    // Not the size message — a 4MB file is nowhere near the limit.
    expect(result.message).not.toContain(formatBytes(MAX_PDF_BYTES));
  });

  it("does not read like a validation error", () => {
    const result = checkPdfUpload({
      filename: "E1.pdf",
      byteSize: MAX_PDF_BYTES + MB,
    });
    if (result.ok) throw new Error("expected a refusal");
    for (const jargon of [
      "invalid",
      "failed",
      "error",
      "exceeded maximum",
      "null",
      "undefined",
    ]) {
      expect(result.message.toLowerCase()).not.toContain(jargon);
    }
  });

  it("accepts a .PDF in any case", () => {
    expect(checkPdfUpload({ filename: "E1.PDF", byteSize: MB }).ok).toBe(true);
    expect(checkPdfUpload({ filename: "E1.Pdf", byteSize: MB }).ok).toBe(true);
  });
});

describe("formatting a size", () => {
  it("prints the limit as a round number", () => {
    expect(formatBytes(MAX_PDF_BYTES)).toBe("2GB");
  });

  it("prints a real file size to one decimal", () => {
    expect(formatBytes(Math.round(87.4 * MB))).toBe("87.4MB");
  });

  it("uses KB and B below a megabyte", () => {
    expect(formatBytes(4096)).toBe("4 KB");
    expect(formatBytes(512)).toBe("512 B");
  });
});

describe("recognising a PDF by its bytes", () => {
  const bytesOf = (text: string) =>
    Uint8Array.from(text.split("").map(c => c.charCodeAt(0)));

  it("accepts a real PDF header", () => {
    expect(looksLikePdf(bytesOf("%PDF-1.7"))).toBe(true);
  });

  it("rejects a file renamed to .pdf", () => {
    // The case this exists for: a .docx or .dwg renamed, which passes every
    // other check and then fails to open with nothing explaining why.
    expect(looksLikePdf(bytesOf("PK "))).toBe(false);
    expect(looksLikePdf(bytesOf("<!DOCT"))).toBe(false);
  });

  it("rejects a file too short to tell", () => {
    expect(looksLikePdf(bytesOf("%PD"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

// ── Through the API ──────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("asking for an upload ticket", () => {
  /**
   * Pin the storage backend, so these assert the app and not the machine.
   *
   * On-disk is the one backend that needs no credentials and touches no
   * network: its upload URL points at this server, so a ticket can be issued
   * and inspected anywhere. Nothing is written — a ticket is only a signed
   * URL — so the folder named here never has to exist.
   */
  const savedStorage: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const name of ["PLAN_STORAGE", "LOCAL_STORAGE_DIR"]) {
      savedStorage[name] = process.env[name];
    }
    process.env.PLAN_STORAGE = "disk";
    process.env.LOCAL_STORAGE_DIR ||= "./.local-storage";
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(savedStorage)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("refuses an oversized file before it ever reaches storage", async () => {
    // The distinction that matters: this comes back as the SIZE message, not
    // as a storage error. Validation has to happen first, or an oversized
    // upload starts and dies somewhere the user cannot read.
    //
    // Sized off the constant rather than a literal — the previous literal was
    // 200MB, which stopped being oversized the moment the limit was raised and
    // turned this into a test that reached storage and failed for the wrong
    // reason.
    const bid = await newBid();
    await expect(
      caller().bidPdfs.createUploadTicket({
        bidId: bid.id,
        filename: "Huge.pdf",
        byteSize: MAX_PDF_BYTES + MB,
      })
    ).rejects.toThrow(
      new RegExp(`over the ${formatBytes(MAX_PDF_BYTES)} limit`, "i")
    );
  });

  it("refuses a file that is not a PDF by name", async () => {
    const bid = await newBid();
    await expect(
      caller().bidPdfs.createUploadTicket({
        bidId: bid.id,
        filename: "Plans.dwg",
        byteSize: 4 * MB,
      })
    ).rejects.toThrow(/have to be PDFs/i);
  });

  it("gets PAST validation for a file just under the limit", async () => {
    /**
     * Asserted by the ticket being ISSUED, not by the failure that follows.
     *
     * This used to read "storage is not configured in tests, so the ticket
     * cannot be issued — the failure proves the size check passed". That made
     * the test depend on the developer's machine being unconfigured: on one
     * with LOCAL_STORAGE_DIR set, a ticket came back and the test failed
     * having proved the very thing it was asserting. A size check that passes
     * is a ticket, so that is what is checked.
     */
    const bid = await newBid();
    const ticket = await caller().bidPdfs.createUploadTicket({
      bidId: bid.id,
      filename: "Big but fine.pdf",
      byteSize: MAX_PDF_BYTES - 1,
    });
    expect(ticket.storageKey).toContain("Big but fine");
    expect(ticket.uploadUrl).toBeTruthy();
  });

  it("refuses another user's bid", async () => {
    const bid = await newBid();
    await expect(
      callerFor(OTHER_USER).bidPdfs.createUploadTicket({
        bidId: bid.id,
        filename: "E1.pdf",
        byteSize: MB,
      })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("confirming an upload", () => {
  it("attaches a file just under the limit", async () => {
    const bid = await newBid();
    const attached = await caller().bidPdfs.confirmAttach({
      bidId: bid.id,
      filename: "Scanned set.pdf",
      storageKey: keyFor(bid.id, "Scanned set.pdf"),
      byteSize: MAX_PDF_BYTES - 1,
    });

    expect(attached.byteSize).toBe(MAX_PDF_BYTES - 1);
    const list = await caller().bidPdfs.list({ bidId: bid.id });
    expect(list).toHaveLength(1);
  });

  it("attaches a file exactly at the limit", async () => {
    const bid = await newBid();
    const attached = await caller().bidPdfs.confirmAttach({
      bidId: bid.id,
      filename: "Exactly 150.pdf",
      storageKey: keyFor(bid.id, "Exactly 150.pdf"),
      byteSize: MAX_PDF_BYTES,
    });
    expect(attached.byteSize).toBe(MAX_PDF_BYTES);
  });

  it("refuses a file one byte over, and records nothing", async () => {
    const bid = await newBid();
    await expect(
      caller().bidPdfs.confirmAttach({
        bidId: bid.id,
        filename: "One byte too far.pdf",
        storageKey: keyFor(bid.id, "One byte too far.pdf"),
        byteSize: MAX_PDF_BYTES + 1,
      })
    ).rejects.toThrow(
      new RegExp(`over the ${formatBytes(MAX_PDF_BYTES)} limit`, "i")
    );

    // The check that a rejected upload leaves no half-attached sheet behind.
    expect(await caller().bidPdfs.list({ bidId: bid.id })).toHaveLength(0);
  });

  it("refuses a storage key belonging to someone else", async () => {
    // Without this, naming another contractor's key would attach their plans
    // to your bid.
    const bid = await newBid();
    await expect(
      caller().bidPdfs.confirmAttach({
        bidId: bid.id,
        filename: "Theirs.pdf",
        storageKey: `bid-plans/${OTHER_USER}/999/Theirs.pdf`,
        byteSize: MB,
      })
    ).rejects.toThrow(/does not belong to this bid/i);
  });

  it("refuses a key from a different bid of the same user", async () => {
    const mine = await newBid();
    const other = await newBid();
    await expect(
      caller().bidPdfs.confirmAttach({
        bidId: mine.id,
        filename: "E1.pdf",
        storageKey: keyFor(other.id, "E1.pdf"),
        byteSize: MB,
      })
    ).rejects.toThrow(/does not belong to this bid/i);
  });

  it("refuses another user's bid", async () => {
    const bid = await newBid();
    await expect(
      callerFor(OTHER_USER).bidPdfs.confirmAttach({
        bidId: bid.id,
        filename: "E1.pdf",
        storageKey: keyFor(bid.id, "E1.pdf", OTHER_USER),
        byteSize: MB,
      })
    ).rejects.toThrow(/not found/i);
  });
});
