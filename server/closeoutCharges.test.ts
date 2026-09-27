/**
 * A close-out on a bid with a MARKED-UP charge agrees with the bid screen.
 *
 * ── What a close-out holds, measured 2026-09-27 ──────────────────────────────
 * No money. It freezes the estimated HOURS (`bid_closeouts.estimatedHours`,
 * and per line) and compares them with the actual hours. The money beside
 * them is the profitability report's REVENUE, priced from the bid at report
 * time (`server/analytics.ts`, `priceBid`), with the marked-up charges in it.
 *
 * So this pins both halves against the bid screen, on a bid whose charge
 * would show if either left it out:
 *   • the saved estimate is the bid screen's labor hours;
 *   • the report's revenue is the bid screen's price, charge included.
 *
 * ── Why it was written, and why it passed before the change it came with ──
 * On 2026-09-27 `estimateFor` was changed to price the bid WITH its charges,
 * after a note (since corrected) claimed a close-out saved an estimate "a
 * charge short". A charge carries no labor hours, so it could not: this suite
 * passed against the code before that change as well as after it. It stays as
 * the check that the claim is false, and that it stays false.
 *
 * Fixture id 9881 is distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9881;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-closeout-charges-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = await getDb();
  if (db) await db.delete(bids).where(eq(bids.userId, USER));
}

let bidId = 0;

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
      openId: `test-closeout-charges-${USER}`,
      name: "Close-out charges fixture",
    });
  }
  await clean();

  const bid = (await caller().bids.create({ name: "Close-out charges" }))!;
  bidId = bid.id;
  // 4 × ($30 material at 20% markup, 1.5 h at $70).
  await db!.insert(bidLineItems).values({
    bidId,
    name: "close-out charges line",
    qty: "4",
    snapshotMaterialCost: "30.0000",
    snapshotLaborHours: "1.5000",
    snapshotLaborRate: "70.0000",
    snapshotModifierPct: "0.0000",
    snapshotMarkupPct: "0.2000",
    snapshotUnpricedParts: 0,
  });
  await caller().bidExtras.expenses.addToBid({
    bidId,
    name: "Permit",
    amount: 180,
    markedUp: true,
  });
  await caller().bidExtras.expenses.addToBid({
    bidId,
    name: "Dump fee",
    amount: 45,
  });
});

afterAll(async () => {
  if (hasDb) await clean();
});

withDb("a close-out on a bid with a marked-up charge", () => {
  it("saves the bid screen's hours, and reports the bid screen's price", async () => {
    const screen = (await caller().bids.get({ id: bidId })).totals;
    // The charge is inside the price the screen shows — the case this is for.
    expect(screen.finalPrice).toBeGreaterThan(180);

    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 7,
      closedAt: "2026-03-10",
    });
    const state = await caller().closeout.get({ bidId });
    expect(state.closeout).not.toBeNull();
    expect(Number(state.closeout!.estimatedHours)).toBeCloseTo(
      screen.totalLaborHours,
      2
    );
    expect(state.estimate!.totalHours).toBeCloseTo(screen.totalLaborHours, 2);

    const report = await caller().analytics.profitability({
      from: "2026-01-01",
      to: "2026-06-30",
    });
    expect(report.overall.jobs).toBe(1);
    expect(report.overall.revenue).toBeCloseTo(screen.finalPrice, 2);
  });
});
