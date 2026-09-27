/**
 * Direct cost ADDS UP on screen: Materials + Labor + Marked-up charges.
 *
 * ── The fault this pins ──────────────────────────────────────────────────────
 * A bid with a $210 marked-up permit read Materials $71.60, Labor $0.00,
 * Direct cost $281.60 — $210 inside Direct cost with no row naming it
 * (found 2026-09-27). The number was right: a marked-up charge joins the
 * direct cost AT ITS COST so it takes overhead and profit with the work
 * (shared/bidExtras.ts, "Where expenses sit in the price"). What was missing
 * was the row, and a total whose parts cannot be seen reads as an app that
 * cannot add.
 *
 * ── At cost, never at its billed amount ──────────────────────────────────────
 * The row is the charges' COST. Their overhead and profit are in the Overhead
 * and Profit rows below Direct cost, with the work's. Showing the billed amount
 * here would count that markup twice. The fixture has overhead and profit on,
 * so the two amounts differ and the test can tell them apart.
 *
 * Fixture id 9891 is distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bids, pricingDefaults, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9891;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-direct-cost-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(eq(bids.userId, USER));
  await db
    .delete(pricingDefaults)
    .where(inArray(pricingDefaults.userId, [USER]));
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
      openId: `test-direct-cost-${USER}`,
      name: "Direct cost fixture",
    });
  }
  await clean();
  await caller().bids.setPricingDefaults({
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: 0.1,
    profitMethod: "markup",
    profitValue: 0.2,
    productivityPct: 0,
  });

  const bid = (await caller().bids.create({ name: "Direct cost adds up" }))!;
  bidId = bid.id;
  await db!.insert(bidLineItems).values({
    bidId,
    name: "direct cost line",
    qty: "4",
    snapshotMaterialCost: "17.9000",
    snapshotLaborHours: "0.2500",
    snapshotLaborRate: "60.0000",
    snapshotModifierPct: "0.0000",
    snapshotUnpricedParts: 0,
  });
  for (const charge of [
    { name: "Permit", amount: 210, markedUp: true },
    { name: "Inspection", amount: 35.5, markedUp: true },
    { name: "Dump fee", amount: 40 },
  ]) {
    await caller().bidExtras.expenses.addToBid({ bidId, ...charge });
  }
});

afterAll(async () => {
  if (hasDb) await clean();
});

withDb("Direct cost adds up on screen", () => {
  it("names the marked-up charges, at cost, so the rows sum to Direct cost", async () => {
    const { totals } = await caller().bids.get({ id: bidId });

    // The marked-up charges at COST: 210 + 35.50. The dump fee is not one.
    expect(totals.markedUpCharges).toBeCloseTo(245.5, 2);
    expect(
      totals.materialCost + totals.laborCost + totals.markedUpCharges
    ).toBeCloseTo(totals.directCost, 2);

    // Not the billed amount: that carries overhead and profit, which are in
    // their own rows further down. With 10% and 20% on, the two differ.
    const billed = totals.expenseLines
      .filter(line => line.markedUp)
      .reduce((sum, line) => sum + line.charged, 0);
    expect(billed).toBeGreaterThan(totals.markedUpCharges + 1);
  });

  it("gives the proposal's Your figures the same row", async () => {
    const proposal = await caller().proposals.document({ bidId });
    const t = proposal.internalTotals;
    expect(t.markedUpCharges).toBeCloseTo(245.5, 2);
    expect(t.materialCost + t.laborCost + t.markedUpCharges).toBeCloseTo(
      t.directCost,
      2
    );
  });
});
