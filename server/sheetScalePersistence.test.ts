/**
 * A SHEET'S SCALE IS THE SHEET'S, AND IT STAYS.
 *
 * ── What these guard, and why it is worth its own file ───────────────────────
 * Every measured length on a sheet is a multiple of its scale, so a scale that
 * quietly reverts or bleeds onto the wrong page is not a lost setting — it is a
 * set of wrong numbers that look exactly like right ones. Nothing on screen
 * says "this is the scale you set an hour ago" versus "this is the scale you
 * set on the page before".
 *
 * Three ways it could go wrong, all asked for by name on 2026-09-21:
 *
 *   switching pages     sheet 11's scale must not follow you to sheet 12
 *   leaving and back    a scale set, then the bid closed and reopened
 *   reloading           a fresh fetch with nothing cached client-side
 *
 * The last two are the same thing on the server — a query with no memory of the
 * previous one — and that IS the test. What a browser reload actually
 * exercises beyond this is React Query's cache, which vitest cannot reach here
 * (vitest.config.ts covers server/**, client/src/lib/** and scripts/**, not
 * components). So this file proves the data survives, and the screen was
 * checked by hand; see the note in the commit.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 6767;
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-scale-persist-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/**
 * A bid with one document and its sheet rows already built.
 *
 * `ensureSheets` is what the viewer calls once it has parsed the PDF; without
 * it there are no sheet rows to carry a scale, which is how the first run of
 * this file failed — four expected, zero found.
 */
async function newDocument(pageCount = 4) {
  const bid = await caller().bids.create({
    name: `Scale persistence ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  });
  const database = await getDb();
  const [result] = await database!.insert(bidPdfs).values({
    bidId: bid!.id,
    userId: USER,
    filename: "E-Series.pdf",
    storageKey: `test/${bid!.id}/e-series.pdf`,
    byteSize: 1024,
    pageCount,
    sortOrder: 0,
  });
  const bidPdfId = result.insertId;
  await caller().bidPdfs.ensureSheets({ bidPdfId, pageCount });
  return { bidId: bid!.id, bidPdfId };
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-scale-persist-${USER}`,
      name: "Scale persistence fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

describe.skipIf(!hasDb)("a scale belongs to one sheet", () => {
  it("does not follow you to the next page", async () => {
    const { bidPdfId } = await newDocument(4);
    const sheets = await caller().bidPdfs.sheets({ bidPdfId });
    expect(sheets.length).toBe(4);

    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1" = 10'`,
    });
    await caller().bidPdfs.setSheetScale({
      id: sheets[2].id,
      scaleText: `3/16" = 1'-0"`,
    });

    // The two sheets from the real job, on one document, as they actually are.
    const after = await caller().bidPdfs.sheets({ bidPdfId });
    expect(after[0].scaleRatio).toBe(120);
    expect(after[1].scaleRatio).toBeNull();
    expect(after[2].scaleRatio).toBe(64);
    expect(after[3].scaleRatio).toBeNull();
  });

  it("survives leaving the bid and coming back", async () => {
    const { bidId, bidPdfId } = await newDocument(2);
    const sheets = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheets[0].id,
      scaleText: `1/8" = 1'-0"`,
    });

    // Going away and back is, to the server, a fresh read of the bid and then
    // of its sheets — no state carried between them.
    const reopened = await caller().bids.get({ id: bidId });
    expect(reopened).toBeTruthy();
    const afterReturn = await caller().bidPdfs.sheets({ bidPdfId });
    expect(afterReturn[0].scaleRatio).toBe(96);
    expect(afterReturn[0].scaleText).toBe(`1/8" = 1'-0"`);
  });

  it("survives a reload, which is a query with no memory", async () => {
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1:80`,
    });

    // A second, independent caller: nothing shared with the one that wrote it.
    const fresh = appRouter.createCaller({
      user: { id: USER, openId: `test-scale-persist-${USER}`, role: "user" },
    } as unknown as TrpcContext);
    const [reloaded] = await fresh.bidPdfs.sheets({ bidPdfId });
    expect(reloaded.scaleRatio).toBe(80);
  });

  it("keeps the exact calibrated ratio, not a rounded one", async () => {
    // Calibration sends six decimals. Losing them would move every measured
    // length on the sheet by a hair, invisibly and for ever.
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1:64.015002`,
    });
    const [reloaded] = await caller().bidPdfs.sheets({ bidPdfId });
    expect(reloaded.scaleRatio).toBeCloseTo(64.015002, 6);
  });

  it("clearing one sheet leaves the others alone", async () => {
    const { bidPdfId } = await newDocument(3);
    const sheets = await caller().bidPdfs.sheets({ bidPdfId });
    for (const sheet of sheets) {
      await caller().bidPdfs.setSheetScale({
        id: sheet.id,
        scaleText: `1/4" = 1'-0"`,
      });
    }
    await caller().bidPdfs.clearSheetScale({ id: sheets[1].id });

    const after = await caller().bidPdfs.sheets({ bidPdfId });
    expect(after.map(s => s.scaleRatio)).toEqual([48, null, 48]);
  });
});

describe.skipIf(!hasDb)("whether a scale has been checked", () => {
  it("starts unchecked, and says so rather than guessing", async () => {
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    const set = await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/8" = 1'-0"`,
    });
    expect(set.scaleCheckedAt).toBeNull();
  });

  it("records a check, and it survives a reload", async () => {
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/8" = 1'-0"`,
    });
    await caller().bidPdfs.confirmSheetScale({ id: sheet.id });

    const [reloaded] = await caller().bidPdfs.sheets({ bidPdfId });
    expect(reloaded.scaleCheckedAt).toBeTruthy();
  });

  it("FORGETS the check when the scale changes", async () => {
    /*
      The one that matters. A confirmation belongs to the ratio it was made
      against; carrying it over would put a "checked" badge on a number nobody
      has ever verified — the badge lying in the only direction that counts.
    */
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/8" = 1'-0"`,
    });
    await caller().bidPdfs.confirmSheetScale({ id: sheet.id });
    expect(
      (await caller().bidPdfs.sheets({ bidPdfId }))[0].scaleCheckedAt
    ).toBeTruthy();

    const changed = await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/4" = 1'-0"`,
    });
    expect(changed.scaleCheckedAt).toBeNull();
  });

  it("forgets the check when the scale is cleared", async () => {
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: `1/8" = 1'-0"`,
    });
    await caller().bidPdfs.confirmSheetScale({ id: sheet.id });
    const cleared = await caller().bidPdfs.clearSheetScale({ id: sheet.id });
    expect(cleared.scaleCheckedAt).toBeNull();
    expect(cleared.scaleRatio).toBeNull();
  });

  it("refuses to record a check on a sheet with no scale", async () => {
    const { bidPdfId } = await newDocument(1);
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId });
    await expect(
      caller().bidPdfs.confirmSheetScale({ id: sheet.id })
    ).rejects.toThrow(/no scale/i);
  });

  it("checking one sheet says nothing about another", async () => {
    const { bidPdfId } = await newDocument(2);
    const sheets = await caller().bidPdfs.sheets({ bidPdfId });
    for (const sheet of sheets) {
      await caller().bidPdfs.setSheetScale({
        id: sheet.id,
        scaleText: `1/8" = 1'-0"`,
      });
    }
    await caller().bidPdfs.confirmSheetScale({ id: sheets[0].id });

    const after = await caller().bidPdfs.sheets({ bidPdfId });
    expect(after[0].scaleCheckedAt).toBeTruthy();
    expect(after[1].scaleCheckedAt).toBeNull();
  });
});
