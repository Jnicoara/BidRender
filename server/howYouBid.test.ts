/**
 * "HOW DO YOU BID?" — owner Q8, 2026-10-16 (morning-questions-b.md Q8).
 *
 * A company with material markup set that never chose a method keeps
 * TODAY'S math (the old stacked math, `pricingMethod` NULL) on its new bids
 * until it answers the one-time question. Nothing prices lower without
 * being asked: the golden "op-and-tax" bid, built fresh as a NEW bid of such
 * a shop, still says $1,369.54 (on Cost + O&P it would say $1,349.40).
 *
 * Then the per-bid switch: choosing a method on ONE bid changes that bid
 * only — never the company setting and never another bid.
 *
 * Fixture ids 9973–9974 are this file's alone.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { markupRules } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  bidWithSheet,
  countOf,
  duplexAssembly,
  emtType,
  freshUser,
  rate,
  runLaborRate,
  straightRun,
} from "./bidBuilders.testHelper";
import { howYouBidOpen, newBidMethod } from "../shared/bidMethods";

const MARKUP_SHOP = 9973;
const PLAIN_SHOP = 9974;
dropFixtureUsersAfterAll([MARKUP_SHOP, PLAIN_SHOP]);
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

describe("newBidMethod", () => {
  it("keeps the old math for a markup shop that has not answered", () => {
    const open = { method: null, usesMaterialMarkup: true };
    expect(newBidMethod(open)).toBeNull();
    expect(howYouBidOpen(open)).toBe(true);
  });
  it("gives Cost + O&P to a shop with no markup to lose", () => {
    const none = { method: null, usesMaterialMarkup: false };
    expect(newBidMethod(none)).toBe("cost_op");
    expect(howYouBidOpen(none)).toBe(false);
  });
  it("an answer wins either way, and closes the question", () => {
    for (const usesMaterialMarkup of [true, false])
      for (const method of ["cost_op", "markup_rate"] as const) {
        const s = { method, usesMaterialMarkup };
        expect(newBidMethod(s)).toBe(method);
        expect(howYouBidOpen(s)).toBe(false);
      }
  });
});

/** The golden "op-and-tax" bid (goldenBids.test.ts bid 8), as a NEW bid. */
async function goldenOpAndTax(c: ReturnType<typeof as>, user: number) {
  const journeyman = await rate(c, "Q8 journeyman", 71.5);
  await runLaborRate(c, user, journeyman);
  await c.bids.setPricingDefaults({
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: 0.12,
    profitMethod: "markup",
    profitValue: 0.15,
    productivityPct: 0.05,
    materialMarkupPct: 0.1,
  });
  await c.salesTax.setRules({
    enabled: true,
    taxMaterials: true,
    taxLabor: false,
    applyTo: "price",
  });
  const area = await c.salesTax.create({
    name: "Q8 county",
    state: "IL",
    county: "Golden",
    components: [
      { label: "State", ratePct: 6.25 },
      { label: "County", ratePct: 1.75 },
    ],
  });
  const duplex = await duplexAssembly(c, journeyman);
  const type = await emtType(c, "Q8 EMT priced");
  // NOT oldMathBidWithSheet: the bid takes whatever a new bid takes.
  const { bidId, sheetId } = await bidWithSheet(c, user, "Q8 O&P and tax");
  const g = await countOf(c, bidId, sheetId, duplex.id, [{ n: 9, y: 3000 }]);
  await c.takeoffGroups.sendToBid({ id: g });
  const run = await straightRun(c, bidId, sheetId, type.id, "Feeder", 85);
  await c.takeoffRuns.addCircuit({
    runId: run.id,
    name: "P-1",
    conductorCount: 2,
    groundCount: 1,
  });
  await c.takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
  await c.bids.update({ id: bidId, taxJurisdictionId: area!.id });
  await c.bidExtras.expenses.addToBid({
    bidId,
    name: "Permit",
    amount: 185,
    taxable: false,
    markedUp: false,
  });
  await c.bidExtras.expenses.addToBid({
    bidId,
    name: "Lift rental",
    amount: 420,
    taxable: true,
    markedUp: true,
  });
  return bidId;
}

withDb("a markup shop's new bids, before and after it answers", () => {
  const c = as(MARKUP_SHOP);
  let golden = 0;

  beforeAll(async () => {
    await freshUser(MARKUP_SHOP);
    golden = await goldenOpAndTax(c, MARKUP_SHOP);
  }, 120_000);

  it("the question is open, and a new bid stays on today's math at $1,369.54", async () => {
    const state = await c.bids.howYouBid();
    expect(state).toMatchObject({
      method: null,
      usesMaterialMarkup: true,
      newBids: null,
      open: true,
    });
    const bid = await c.bids.get({ id: golden });
    expect(bid.bid.pricingMethod).toBeNull();
    expect(bid.totals.finalPrice).toBeCloseTo(1369.54, 2);
  });

  it("answering closes the question; the next bid takes the answer and the earlier one does not move", async () => {
    await c.bids.setPricingDefaults({ pricingMethod: "cost_op" });
    expect((await c.bids.howYouBid()).open).toBe(false);
    const next = (await c.bids.create({ name: "Q8 after answer" }))!;
    expect(next.pricingMethod).toBe("cost_op");
    const earlier = await c.bids.get({ id: golden });
    expect(earlier.bid.pricingMethod).toBeNull();
    expect(earlier.totals.finalPrice).toBeCloseTo(1369.54, 2);
  });
});

withDb("a shop with no markup", () => {
  const c = as(PLAIN_SHOP);
  beforeAll(async () => {
    await freshUser(PLAIN_SHOP);
  });

  it("is not asked, and its new bids are Cost + O&P", async () => {
    expect((await c.bids.howYouBid()).open).toBe(false);
    const bid = (await c.bids.create({ name: "Q8 plain" }))!;
    expect(bid.pricingMethod).toBe("cost_op");
  });

  it("an unaccepted starter markup band is not markup it would lose; accepted, it is", async () => {
    // Starters price nothing until accepted (CLAUDE.md § Starter content).
    const database = (await getDb())!;
    const [row] = await database.insert(markupRules).values({
      userId: PLAIN_SHOP,
      kind: "band",
      bandMinPrice: "0.00",
      bandMaxPrice: "1.00",
      markupPct: "0.750000",
      isStarter: true,
      starterDate: new Date("2026-09-25"),
    });
    try {
      expect((await c.bids.howYouBid()).usesMaterialMarkup).toBe(false);
      await database
        .update(markupRules)
        .set({ acceptedAt: new Date() })
        .where(eq(markupRules.id, row.insertId));
      expect(await c.bids.howYouBid()).toMatchObject({
        usesMaterialMarkup: true,
        open: true,
      });
    } finally {
      await database
        .delete(markupRules)
        .where(eq(markupRules.id, row.insertId));
    }
  });

  it("a method chosen on ONE bid changes that bid only — never the company or another bid", async () => {
    const a = (await c.bids.create({ name: "Q8 this job" }))!;
    const b = (await c.bids.create({ name: "Q8 other job" }))!;
    await c.bids.setPricingMethod({ id: a.id, method: "markup_rate" });
    expect((await c.bids.get({ id: a.id })).bid.pricingMethod).toBe(
      "markup_rate"
    );
    expect((await c.bids.get({ id: b.id })).bid.pricingMethod).toBe("cost_op");
    const company = await c.bids.howYouBid();
    expect(company.method).toBeNull();
    expect(company.newBids).toBe("cost_op");
    const later = (await c.bids.create({ name: "Q8 later job" }))!;
    expect(later.pricingMethod).toBe("cost_op");
  });
});
