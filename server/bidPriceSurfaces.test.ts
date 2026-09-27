/**
 * One bid, one TOTAL DUE — on the bid screen, the dashboard card, "Find a
 * bid" and the archive.
 *
 * ── Two faults, one day apart ────────────────────────────────────────────────
 * 2026-09-26: "Markup check" read $452.57 on the bid screen and its card and
 * $302.57 in "Find a bid" and the archive — the lists priced the bid without
 * its marked-up charge.
 *
 * 2026-09-27: with that fixed, every list agreed on `finalPrice` — and
 * `finalPrice` is neither number the bid screen names. The bid screen says
 * "Bid price" for the WORK alone (`workPrice`) and "Total due" for everything
 * the customer owes (`totalDue`: the work, every charge, and sales tax). The
 * lists showed the work plus MARKED-UP charges only, which matches "Total due"
 * on a bid with no plain charge and no tax, and nothing on any other. The
 * owner's decision: the lists say "Total due", and show it.
 *
 * So each bid here is counted on every surface against the bid screen's
 * `totals.totalDue`, including bids with a plain charge, a taxable charge and
 * a taxed site — the cases where the old number and the right one part.
 *
 * Fixture ids 9871 are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bids, taxJurisdictions, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9871;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-bid-price-surfaces-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(eq(bids.userId, USER));
  await db.delete(taxJurisdictions).where(eq(taxJurisdictions.userId, USER));
}

/** A priced hand line: 2 × $50 material at 25% markup, 1 h × $80 labor. */
async function pricedLine(bidId: number) {
  const db = await getDb();
  await db!.insert(bidLineItems).values({
    bidId,
    name: "price surfaces line",
    qty: "2",
    snapshotMaterialCost: "50.0000",
    snapshotLaborHours: "0.5000",
    snapshotLaborRate: "80.0000",
    snapshotModifierPct: "0.0000",
    snapshotMarkupPct: "0.2500",
    snapshotUnpricedParts: 0,
  });
}

type Charge = {
  name: string;
  amount: number;
  markedUp?: boolean;
  taxable?: boolean;
};
type Shape = { charges: Charge[]; taxed: boolean };

const PERMIT: Charge = { name: "Permit", amount: 150, markedUp: true };
const DUMP: Charge = { name: "Dump fee", amount: 40 };

const SHAPES: Record<string, Shape> = {
  "no charges": { charges: [], taxed: false },
  "a marked-up charge": { charges: [PERMIT], taxed: false },
  "a plain charge": { charges: [DUMP], taxed: false },
  "both kinds": {
    charges: [PERMIT, { name: "Inspection", amount: 75, markedUp: true }, DUMP],
    taxed: false,
  },
  "taxed, no charges": { charges: [], taxed: true },
  "taxed, every kind of charge": {
    charges: [
      PERMIT,
      DUMP,
      { name: "Lift rental", amount: 60, taxable: true },
      { name: "Engineering", amount: 90, taxable: true, markedUp: true },
    ],
    taxed: true,
  },
};

const ids: Record<string, number> = {};

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
      openId: `test-bid-price-surfaces-${USER}`,
      name: "Bid price surfaces fixture",
    });
  }
  await clean();

  // Tax on, materials and labor taxable, 10% in Illinois. A bid is taxed
  // only when its site address resolves to the jurisdiction.
  await caller().salesTax.setRules({
    enabled: true,
    taxMaterials: true,
    taxLabor: true,
    applyTo: "price",
  });
  await caller().salesTax.create({
    name: "Price surfaces ten",
    state: "IL",
    components: [{ label: "State", ratePct: 10 }],
  });

  for (const [shape, { charges, taxed }] of Object.entries(SHAPES)) {
    const bid = (await caller().bids.create({
      name: `Price surfaces: ${shape}`,
    }))!;
    await pricedLine(bid.id);
    for (const charge of charges) {
      await caller().bidExtras.expenses.addToBid({ bidId: bid.id, ...charge });
    }
    if (taxed) {
      await caller().bids.update({
        id: bid.id,
        siteAddress: "Springfield, IL",
      });
    }
    ids[shape] = bid.id;
  }
});

afterAll(async () => {
  if (hasDb) await clean();
});

/** The bid screen's totals. The numbers everything else must match. */
async function bidScreen(bidId: number) {
  const full = await caller().bids.get({ id: bidId });
  return { ...full.totals, tax: full.salesTax.amount };
}

async function searchRow(bidId: number, archive: "live" | "archived") {
  const page = await caller().bids.search({ text: "Price surfaces", archive });
  const row = page.items.find(b => b.id === bidId);
  if (!row) throw new Error(`bid ${bidId} not in "Find a bid" (${archive})`);
  return row;
}

withDb("a bid's total due is the same number everywhere it is shown", () => {
  it.each(Object.keys(SHAPES))("%s", async shape => {
    const bidId = ids[shape];
    const { totalDue } = await bidScreen(bidId);

    const card = (await caller().bids.dashboard()).find(b => b.id === bidId)!;
    expect(card.totalDue).toBeCloseTo(totalDue, 2);
    expect((await searchRow(bidId, "live")).totalDue).toBeCloseTo(totalDue, 2);

    // And once archived: the archive list, and "Find a bid" over archived bids.
    await caller().bids.archive({ id: bidId });
    try {
      const archived = (await caller().bids.archived()).find(
        b => b.id === bidId
      )!;
      expect(archived.totalDue).toBeCloseTo(totalDue, 2);
      expect((await searchRow(bidId, "archived")).totalDue).toBeCloseTo(
        totalDue,
        2
      );
    } finally {
      await caller().bids.restore({ id: bidId });
    }
  });

  it("is a number the old one was not, wherever a plain charge or tax is on the bid", async () => {
    // Guards the comparison above from passing on fixtures where total due
    // and the old `finalPrice` happen to coincide.
    const plain = await bidScreen(ids["a plain charge"]);
    expect(plain.totalDue).toBeCloseTo(plain.finalPrice + 40, 2);

    const taxed = await bidScreen(ids["taxed, no charges"]);
    expect(taxed.tax).toBeGreaterThan(0);
    expect(taxed.totalDue).toBeCloseTo(taxed.finalPrice + taxed.tax, 2);

    // A marked-up charge is inside the price and billed on its own line;
    // with nothing else on the bid, total due is that price exactly.
    const marked = await bidScreen(ids["a marked-up charge"]);
    const none = await bidScreen(ids["no charges"]);
    expect(marked.totalDue).toBeGreaterThan(none.totalDue + 150 - 0.01);
    expect(marked.totalDue).toBeCloseTo(marked.finalPrice, 2);
  });
});
