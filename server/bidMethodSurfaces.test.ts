/**
 * BID METHODS, WIRED (references/bid-methods-plan.md § 7; todo.md "Bid
 * methods — wiring left", steps 1–3). One hand-priced line on a bid of each
 * method, and every surface that prices a bid must say the same number:
 * the bid screen, the Dashboard card (summed in SQL, `costSums`), "Find a
 * bid", and analytics (`outcomesReport`, which priced every bid by the old
 * math until 2026-10-16).
 *
 * The line: 2 × $50 material at a frozen 25% markup, 0.5 h each (1 h) at a
 * frozen $80 cost and $120 charge rate. The bid: 10% overhead, 10% profit
 * (markup). By hand:
 *
 *   old math      (100 + 80 + 25 markup) × 1.10 × 1.10      = $248.05
 *   Cost + O&P    (100 + 80), no markup,   × 1.10 × 1.10    = $217.80
 *   Markup + rate 100 + 25 + 1 h × $120, no O&P             = $245.00
 *
 * A second A bid's line froze NO charge rate (its role has none): its labor
 * is Not priced — no cost and no charge, never billed at cost (owner Q5) —
 * so it is $125.00 (material and markup only), on every surface.
 *
 * Fixture user 9962, distinct from every other suite.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, getPricingDefaults } from "./db";
import {
  bidLineItems,
  bids,
  laborRates,
  pricingDefaults,
} from "../drizzle/schema";
import {
  as,
  bidWithSheet,
  countOf,
  freshUser,
  onOldMath,
  rate,
} from "./bidBuilders.testHelper";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { outcomesReport } from "./analytics";

const USER = 9962;
const c = as(USER);
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

async function bidWithLine(
  name: string,
  chargeRate: string | null
): Promise<number> {
  const bid = (await c.bids.create({ name }))!;
  await c.bids.update({
    id: bid.id,
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: 0.1,
    profitMethod: "markup",
    profitValue: 0.1,
  });
  await (await getDb())!.insert(bidLineItems).values({
    bidId: bid.id,
    name: "method surfaces line",
    qty: "2",
    snapshotMaterialCost: "50.0000",
    snapshotLaborHours: "0.5000",
    snapshotLaborRate: "80.0000",
    snapshotChargeRate: chargeRate,
    snapshotModifierPct: "0.0000",
    snapshotMarkupPct: "0.2500",
    snapshotUnpricedParts: 0,
  });
  return bid.id;
}

async function setMethod(
  bidId: number,
  method: "cost_op" | "markup_rate" | null
) {
  await (await getDb())!
    .update(bids)
    .set({ pricingMethod: method })
    .where(eq(bids.id, bidId));
}

const ids = { old: 0, costOp: 0, rate: 0, rateUnset: 0 };

beforeAll(async () => {
  if (!hasDb) return;
  await freshUser(USER);
  ids.old = await bidWithLine("Methods: old math", "120.0000");
  await onOldMath(ids.old);
  ids.costOp = await bidWithLine("Methods: Cost + O&P", "120.0000");
  ids.rate = await bidWithLine("Methods: Markup + rate", "120.0000");
  await setMethod(ids.rate, "markup_rate");
  ids.rateUnset = await bidWithLine("Methods: rate, none set", null);
  await setMethod(ids.rateUnset, "markup_rate");
}, 60_000);

const screen = async (id: number) => (await c.bids.get({ id })).totals;

withDb("a bid priced by its method", () => {
  it("a new bid takes its company's method: Cost + O&P when none is chosen", async () => {
    const fresh = (await c.bids.create({ name: "Methods: fresh" }))!;
    expect(fresh.pricingMethod).toBe("cost_op");
    // A company that chose Markup + charge rate: its next bid is on it.
    await getPricingDefaults(USER); // makes the row a fresh company lacks
    await (await getDb())!
      .update(pricingDefaults)
      .set({ pricingMethod: "markup_rate" })
      .where(eq(pricingDefaults.userId, USER));
    try {
      const next = (await c.bids.create({ name: "Methods: after choice" }))!;
      expect(next.pricingMethod).toBe("markup_rate");
    } finally {
      await (await getDb())!
        .update(pricingDefaults)
        .set({ pricingMethod: null })
        .where(eq(pricingDefaults.userId, USER));
    }
  });

  it("prices each method to the hand-checked figure", async () => {
    expect((await screen(ids.old)).finalPrice).toBeCloseTo(248.05, 2);
    expect((await screen(ids.costOp)).finalPrice).toBeCloseTo(217.8, 2);
    expect((await screen(ids.rate)).finalPrice).toBeCloseTo(245, 2);
    expect((await screen(ids.rateUnset)).finalPrice).toBeCloseTo(125, 2);
  });

  it("the Dashboard card and Find a bid say the bid screen's total, on every method", async () => {
    const cards = await c.bids.dashboard();
    const found = await c.bids.search({ text: "Methods:", archive: "live" });
    for (const [key, id] of Object.entries(ids)) {
      const { totalDue } = await screen(id);
      const card = cards.find(b => b.id === id);
      expect(card?.totalDue, `${key}: card`).toBeCloseTo(totalDue, 2);
      const row = found.items.find(b => b.id === id);
      expect(row?.totalDue, `${key}: Find a bid`).toBeCloseTo(totalDue, 2);
    }
  });

  it("analytics values the bids by their methods", async () => {
    const report = await outcomesReport(USER, {}, new Date());
    let sum = 0;
    for (const b of (await c.bids.dashboard()).filter(x => !x.isSample))
      sum += (await screen(b.id)).finalPrice;
    expect(report.totals.totalValue).toBeCloseTo(sum, 2);
  });

  it("adding a line freezes the role's charge rate beside its cost — NULL when it has none", async () => {
    const db = (await getDb())!;
    const charged = await rate(c, "Methods journeyman", 80);
    await db
      .update(laborRates)
      .set({ chargeRate: "125.0000" })
      .where(eq(laborRates.id, charged));
    const uncharged = await rate(c, "Methods helper", 40);

    const frozen = async (rateId: number, name: string) => {
      const asm = (await c.assemblies.create({
        name: `${name} assembly`,
        category: "Devices",
        trade: "electrical",
        projectType: null,
        baseLaborHours: 0.5,
        laborRateId: rateId,
        materials: [],
        modifierIds: [],
      }))!;
      const { bidId, sheetId } = await bidWithSheet(c, USER, name);
      const g = await countOf(c, bidId, sheetId, asm.id, [{ n: 3, y: 2000 }]);
      await c.takeoffGroups.sendToBid({ id: g });
      const [line] = await db
        .select()
        .from(bidLineItems)
        .where(eq(bidLineItems.bidId, bidId));
      return line;
    };
    const a = await frozen(charged, "Methods: frozen charge");
    expect(Number(a.snapshotLaborRate)).toBe(80);
    expect(a.snapshotChargeRate).not.toBeNull();
    expect(Number(a.snapshotChargeRate)).toBe(125);
    // Changing the role later never reaches the line (the freeze).
    await db
      .update(laborRates)
      .set({ chargeRate: "999.0000" })
      .where(eq(laborRates.id, charged));
    const [still] = await db
      .select()
      .from(bidLineItems)
      .where(eq(bidLineItems.id, a.id));
    expect(Number(still.snapshotChargeRate)).toBe(125);

    const b = await frozen(uncharged, "Methods: no charge");
    expect(b.snapshotChargeRate).toBeNull();
  });
});
