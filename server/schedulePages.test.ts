/**
 * `bidPdfs.schedulePages` / `db.schedulePagesOf` — which pages of a plan
 * could hold a panel schedule, from the text stored at upload. The viewer
 * reads ONLY these for schedules; before, it read every page of the set,
 * which on the 500-sheet test set walked the whole 270 MB file
 * (references/stress-results-b.md round 3). Fixture user 9858.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfSheetText, bidPdfs, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9858;
dropFixtureUsersAfterAll([USER, 9859]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-schedule-pages-${USER}`, role: "user" },
  } as unknown as TrpcContext);

let pdfId = 0;

withDb("which pages could hold a panel schedule", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    const [u] = await db.select().from(users).where(eq(users.id, USER));
    if (!u)
      await db.insert(users).values({
        id: USER,
        openId: `test-schedule-pages-${USER}`,
        name: "Schedule pages fixture",
      });
    const bid = (await caller().bids.create({
      name: `Schedule pages ${Date.now()}`,
      trades: ["electrical"],
    }))!;
    const [pdf] = await db.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "E.pdf",
      storageKey: `test/${bid.id}/e.pdf`,
      byteSize: 1024,
      pageCount: 4,
      sortOrder: 0,
    });
    pdfId = pdf.insertId;
  });

  afterAll(async () => {
    if (!hasDb) return;
    await (await getDb())!.delete(bidPdfs).where(eq(bidPdfs.id, pdfId));
  });

  it("is null until the stored text covers every page — the viewer then reads them all", async () => {
    const db = (await getDb())!;
    await db.insert(bidPdfSheetText).values(
      [1, 2, 3].map(pageNumber => ({
        bidPdfId: pdfId,
        userId: USER,
        pageNumber,
        text: pageNumber === 2 ? "PANEL LP-1 ckt load" : "FLOOR PLAN",
        hasTextLayer: true,
      }))
    );
    expect(await caller().bidPdfs.schedulePages({ bidPdfId: pdfId })).toEqual({
      pages: null,
    });
  });

  it("names the pages whose text has a CKT header, any case, and only those", async () => {
    const db = (await getDb())!;
    await db.insert(bidPdfSheetText).values({
      bidPdfId: pdfId,
      userId: USER,
      pageNumber: 4,
      text: "SCHEDULE CKT. DESCRIPTION",
      hasTextLayer: true,
    });
    expect(await caller().bidPdfs.schedulePages({ bidPdfId: pdfId })).toEqual({
      pages: [2, 4],
    });
  });

  it("refuses another company's plan", async () => {
    const db = (await getDb())!;
    const [o] = await db.select().from(users).where(eq(users.id, 9859));
    if (!o)
      await db.insert(users).values({
        id: 9859,
        openId: "test-schedule-pages-9859",
        name: "Another shop",
      });
    const other = appRouter.createCaller({
      user: { id: 9859, openId: "test-schedule-pages-9859", role: "user" },
    } as unknown as TrpcContext);
    await expect(
      other.bidPdfs.schedulePages({ bidPdfId: pdfId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
