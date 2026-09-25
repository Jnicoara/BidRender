/**
 * Sheet numbers and titles read at upload (viewer piece 2), through the router
 * and against a real database.
 *
 * The rule this exists for: **a number a person typed survives every later
 * read.** It is enforced in the SQL of `db.recordSheetReads`, so this test
 * goes through the real write rather than a mock — remove the IF() there and
 * "a hand edit survives a second read" goes red.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfSheets, bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7591;
const OTHER_USER = 7592;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-sheet-identity-${userId}`, role: "user" },
  } as unknown as TrpcContext);

async function newPlan() {
  const db = await getDb();
  if (!db) throw new Error("No database for this test");
  const bid = await callerFor(USER).bids.create({
    name: `Sheet identity test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  });
  const [pdf] = await db.insert(bidPdfs).values({
    bidId: bid!.id,
    userId: USER,
    filename: "E-Series.pdf",
    storageKey: `test/${bid!.id}/e-series-${Math.random()}.pdf`,
    byteSize: 1024,
    pageCount: 3,
    sortOrder: 0,
  });
  return pdf.insertId;
}

/** What a reading pass sends: page 1 from its label, page 2 off its title block. */
const firstRead = [
  {
    pageNumber: 1,
    text: { text: "E-101 LIGHTING PLAN", hasTextLayer: true },
    number: { value: "E-101", source: "label" as const },
    title: { value: "LIGHTING PLAN", source: "label" as const },
  },
  {
    pageNumber: 2,
    text: { text: "E-102 POWER PLAN", hasTextLayer: true },
    number: { value: "E-102", source: "titleblock" as const },
    title: { value: null, source: null },
  },
  {
    // A scan: read, and nothing on it.
    pageNumber: 3,
    text: { text: "", hasTextLayer: false },
    number: { value: null, source: null },
    title: { value: null, source: null },
  },
];

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id,
        openId: `test-sheet-identity-${id}`,
        name: `Sheet identity test user ${id}`,
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  // Plans, and the numbers and text read from them, cascade from bids.
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("sheet numbers read at upload", () => {
  it("stores what was read, and counts every page reached — scans included", async () => {
    const bidPdfId = await newPlan();
    await callerFor(USER).bidPdfs.recordSheetReads({
      bidPdfId,
      pages: firstRead,
    });

    const got = await callerFor(USER).bidPdfs.sheetIdentities({ bidPdfId });
    expect(got.pagesRead).toBe(3);
    expect(got.pages.map(p => [p.sheetNumber, p.sheetNumberSource])).toEqual([
      ["E-101", "label"],
      ["E-102", "titleblock"],
      [null, null],
    ]);
    expect(got.pages[0].sheetTitle).toBe("LIGHTING PLAN");
  });

  it("a hand edit survives a second read", async () => {
    const bidPdfId = await newPlan();
    const caller = callerFor(USER);
    await caller.bidPdfs.recordSheetReads({ bidPdfId, pages: firstRead });

    // A person corrects page 2 and clears page 1's number on purpose.
    await caller.bidPdfs.setSheetNumber({
      bidPdfId,
      pageNumber: 2,
      sheetNumber: "E-201",
    });
    await caller.bidPdfs.setSheetNumber({
      bidPdfId,
      pageNumber: 1,
      sheetNumber: null,
    });

    // The same read again — it finds what it found before.
    await caller.bidPdfs.recordSheetReads({ bidPdfId, pages: firstRead });

    const got = await caller.bidPdfs.sheetIdentities({ bidPdfId });
    expect(got.pages[1]).toMatchObject({
      sheetNumber: "E-201",
      sheetNumberSource: "user",
    });
    // Cleared by a person stays cleared: NOT the reader's E-101 again.
    expect(got.pages[0]).toMatchObject({
      sheetNumber: null,
      sheetNumberSource: "user",
    });
    // The title is still the reader's; it has no user source here.
    expect(got.pages[0].sheetTitle).toBe("LIGHTING PLAN");
  });

  it("a re-read replaces an earlier READ, including with nothing", async () => {
    const bidPdfId = await newPlan();
    const caller = callerFor(USER);
    await caller.bidPdfs.recordSheetReads({ bidPdfId, pages: firstRead });
    await caller.bidPdfs.recordSheetReads({
      bidPdfId,
      pages: [
        {
          pageNumber: 2,
          number: { value: null, source: null },
          title: { value: null, source: null },
        },
      ],
    });
    const got = await caller.bidPdfs.sheetIdentities({ bidPdfId });
    expect(got.pages[1]).toMatchObject({
      sheetNumber: null,
      sheetNumberSource: null,
    });
  });

  it("a field left out of a batch is left alone", async () => {
    const bidPdfId = await newPlan();
    const caller = callerFor(USER);
    await caller.bidPdfs.recordSheetReads({ bidPdfId, pages: firstRead });
    // Titles arrive last, in their own batch, with no number field.
    await caller.bidPdfs.recordSheetReads({
      bidPdfId,
      pages: [
        { pageNumber: 2, title: { value: "POWER PLAN", source: "titleblock" } },
      ],
    });
    const got = await caller.bidPdfs.sheetIdentities({ bidPdfId });
    expect(got.pages[1]).toMatchObject({
      sheetNumber: "E-102",
      sheetTitle: "POWER PLAN",
    });
  });

  it("lists every sheet on the bid for 'go to sheet', typed titles winning", async () => {
    const bidPdfId = await newPlan();
    const caller = callerFor(USER);
    await caller.bidPdfs.recordSheetReads({ bidPdfId, pages: firstRead });
    // Page 1 also has a sheet row, renamed by hand; pages 2 and 3 only a read.
    const db = await getDb();
    await db!.insert(bidPdfSheets).values({
      bidPdfId,
      userId: USER,
      pageNumber: 1,
      name: "Level 1 lights",
      nameSource: "user",
    });
    const [pdf] = await db!
      .select({ bidId: bidPdfs.bidId })
      .from(bidPdfs)
      .where(eq(bidPdfs.id, bidPdfId));

    const list = await caller.bidPdfs.sheetJumpList({ bidId: pdf.bidId });
    expect(list.map(s => [s.pageNumber, s.number, s.title])).toEqual([
      [1, "E-101", "Level 1 lights"],
      [2, "E-102", "Sheet 2"],
      [3, null, "Sheet 3"],
    ]);
    await expect(
      callerFor(OTHER_USER).bidPdfs.sheetJumpList({ bidId: pdf.bidId })
    ).rejects.toThrow();
  });

  it("another company can neither read nor write a plan's numbers", async () => {
    const bidPdfId = await newPlan();
    await expect(
      callerFor(OTHER_USER).bidPdfs.sheetIdentities({ bidPdfId })
    ).rejects.toThrow();
    await expect(
      callerFor(OTHER_USER).bidPdfs.setSheetNumber({
        bidPdfId,
        pageNumber: 1,
        sheetNumber: "X-1",
      })
    ).rejects.toThrow();
  });
});
