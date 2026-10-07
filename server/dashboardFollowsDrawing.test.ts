/**
 * The dashboard card follows the DRAWING on an unlocked bid, as the bid does.
 *
 * ── The fault this pins ──────────────────────────────────────────────────────
 * A line that follows the plans stores its quantity only when it is SENT (or
 * sent again) and when the bid is LOCKED. On an unlocked bid the bid screen
 * re-derives it from the marks and runs on every read (`getBidLineItems` →
 * `withPlanCounts`); the dashboard summed the stored column in SQL. So a count
 * marked after sending moved the bid's total and not the card's, and a count
 * whose marks were all removed stayed "not priced" on the card while the bid
 * said nothing was missing (todo.md, "Dashboard vs bid screen still differ";
 * owner chose option 2, 2026-09-27: re-derive those bids on the dashboard).
 *
 * Counted symbols are what this drives, because they need no scale or
 * calibration to move; traced runs go through the same `withPlanCounts`.
 *
 * Fixture id 9911 is distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffStamps, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { behindTheLock } from "./behindTheLock.testHelper";
import { bidNotPricedCount } from "../client/src/lib/notPricedTotal";

const USER = 9911;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-dashboard-drawing-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = await getDb();
  if (db) await db.delete(bids).where(eq(bids.userId, USER));
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  const [existing] = await db!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await db!.insert(users).values({
      id: USER,
      openId: `test-dashboard-drawing-${USER}`,
      name: "Dashboard follows drawing fixture",
    });
  }
  await clean();
});

afterAll(async () => {
  if (hasDb) await clean();
});

/** A bid with two sheets to mark on. */
async function planBid(name: string) {
  const bid = (await caller().bids.create({ name }))!;
  const db = await getDb();
  const [pdf] = await db!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1-E2.pdf",
    storageKey: `test/${bid.id}/e1-e2.pdf`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 2,
    outline: [],
  });
  return { bidId: bid.id, sheets: sheets.map(sheet => sheet.id) };
}

async function mark(
  bidId: number,
  sheetId: number,
  groupId: number,
  n: number,
  y: number
) {
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: Array.from({ length: n }, (_, i) => ({ x: i + 1, y })),
  });
}

/** The card and the bid screen, side by side. */
async function bothSides(bidId: number) {
  const bid = await caller().bids.get({ id: bidId });
  const card = (await caller().bids.dashboard()).find(b => b.id === bidId)!;
  return { bid, card };
}

withDb("the card follows the drawing on an unlocked bid", () => {
  it("moves with marks added after the count was sent", async () => {
    const { bidId, sheets } = await planBid("Follows drawing: added");
    const f1 = await caller().takeoffGroups.create({ bidId, label: "Type F1" });
    await mark(bidId, sheets[0], f1.id, 3, 1);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f1.id });
    await caller().bids.updateLine({ bidId, id: lineId, materialCost: 38 });

    // The drawing changes: two more marks, nothing re-sent.
    await mark(bidId, sheets[1], f1.id, 2, 2);

    const { bid, card } = await bothSides(bidId);
    expect(Number(bid.lines[0].qty)).toBe(5);
    expect(bid.totals.materialCost).toBe(190); // 5 × $38
    expect(card.totalDue).toBeCloseTo(bid.totals.totalDue, 2);
    expect(card.finalPrice).toBeCloseTo(bid.totals.finalPrice, 2);
  });

  it("stops counting a line as not priced once its marks are gone", async () => {
    const { bidId, sheets } = await planBid("Follows drawing: emptied");
    const f2 = await caller().takeoffGroups.create({ bidId, label: "Type F2" });
    await mark(bidId, sheets[0], f2.id, 4, 1);
    await caller().takeoffGroups.sendToBid({ id: f2.id }); // no price typed

    // The drawing changes: every mark removed. Quantity 0 — nothing missing.
    const db = await getDb();
    await db!.delete(takeoffStamps).where(eq(takeoffStamps.groupId, f2.id));

    const { bid, card } = await bothSides(bidId);
    expect(Number(bid.lines[0].qty)).toBe(0);
    // What the bid screen shows, counted the way it counts it.
    const onScreen = bidNotPricedCount(bid.lines);
    expect(onScreen).toEqual({ lines: 0, parts: 0, hours: 0 });
    expect(card.notPriced).toEqual(onScreen);
  });

  it("keeps a LOCKED bid's numbers on both, whatever the drawing does", async () => {
    const { bidId, sheets } = await planBid("Follows drawing: locked");
    const f3 = await caller().takeoffGroups.create({ bidId, label: "Type F3" });
    await mark(bidId, sheets[0], f3.id, 3, 1);
    const { lineId } = await caller().takeoffGroups.sendToBid({ id: f3.id });
    await caller().bids.updateLine({ bidId, id: lineId, materialCost: 10 });
    await caller().bids.lockQuantities({ bidId });

    // Behind the lock: the app refuses new marks on a locked bid since
    // 2026-09-29; this is a drawing that moved before that rule.
    await behindTheLock(bidId, () => mark(bidId, sheets[1], f3.id, 6, 2));

    const { bid, card } = await bothSides(bidId);
    expect(Number(bid.lines[0].qty)).toBe(3); // held by the lock
    expect(card.totalDue).toBeCloseTo(bid.totals.totalDue, 2);
  });
});
