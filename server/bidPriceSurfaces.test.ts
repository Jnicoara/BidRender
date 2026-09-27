/**
 * One bid, one price — on the bid screen, the dashboard card, "Find a bid"
 * and the archive.
 *
 * ── The fault this pins ──────────────────────────────────────────────────────
 * "Markup check" read $452.57 on the bid screen and its dashboard card and
 * $302.57 in "Find a bid" and the archive (found 2026-09-26, todo.md). The
 * bid carries a MARKED-UP charge — a permit that runs through overhead and
 * profit with the work (server/bidPricing.ts, rollUpBid) — and the two list
 * endpoints priced the bid without its charges, because `rollUpBid` took them
 * as an optional argument and leaving it out compiled. Their comment said
 * they priced "through the same rollup the dashboard uses, so ... cannot show
 * different money".
 *
 * Material markup was never the gap: it is frozen on each line and every
 * surface already priced it the same. It is in the fixture anyway, so a bid
 * "marked up" either way is covered, and so is a plain charge, which is
 * billed on its own line and must stay OUT of the price on every surface.
 *
 * Fixture ids 9871 are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bids, users } from "../drizzle/schema";
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
  if (db) await db.delete(bids).where(eq(bids.userId, USER));
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

type Charge = { name: string; amount: number; markedUp?: boolean };

const SHAPES: Record<string, Charge[]> = {
  "no charges": [],
  "a marked-up charge": [{ name: "Permit", amount: 150, markedUp: true }],
  "a plain charge": [{ name: "Dump fee", amount: 40 }],
  "both kinds": [
    { name: "Permit", amount: 150, markedUp: true },
    { name: "Inspection", amount: 75, markedUp: true },
    { name: "Dump fee", amount: 40 },
  ],
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
  for (const [shape, charges] of Object.entries(SHAPES)) {
    const bid = (await caller().bids.create({
      name: `Price surfaces: ${shape}`,
    }))!;
    await pricedLine(bid.id);
    for (const charge of charges) {
      await caller().bidExtras.expenses.addToBid({ bidId: bid.id, ...charge });
    }
    ids[shape] = bid.id;
  }
});

afterAll(async () => {
  if (hasDb) await clean();
});

/** What the bid screen shows as the price. The number the others must match. */
async function bidScreen(bidId: number) {
  return (await caller().bids.get({ id: bidId })).totals.finalPrice;
}

async function searchRow(bidId: number, archive: "live" | "archived") {
  const page = await caller().bids.search({ text: "Price surfaces", archive });
  const row = page.items.find(b => b.id === bidId);
  if (!row) throw new Error(`bid ${bidId} not in "Find a bid" (${archive})`);
  return row.finalPrice;
}

withDb("a bid's price is the same number everywhere it is shown", () => {
  it.each(Object.keys(SHAPES))("%s", async shape => {
    const bidId = ids[shape];
    const price = await bidScreen(bidId);

    const card = (await caller().bids.dashboard()).find(b => b.id === bidId)!;
    expect(card.finalPrice).toBeCloseTo(price, 2);
    expect(await searchRow(bidId, "live")).toBeCloseTo(price, 2);

    // And once archived: the archive list, and "Find a bid" over archived bids.
    await caller().bids.archive({ id: bidId });
    try {
      const archived = (await caller().bids.archived()).find(
        b => b.id === bidId
      )!;
      expect(archived.finalPrice).toBeCloseTo(price, 2);
      expect(await searchRow(bidId, "archived")).toBeCloseTo(price, 2);
    } finally {
      await caller().bids.restore({ id: bidId });
    }
  });

  it("puts a marked-up charge inside the price and a plain one outside it", async () => {
    // Guards the comparison above from passing because every surface is wrong
    // the same way: the charge has to move the bid screen's own number.
    const none = await bidScreen(ids["no charges"]);
    expect(await bidScreen(ids["a marked-up charge"])).toBeGreaterThan(
      none + 150 - 0.01
    );
    expect(await bidScreen(ids["a plain charge"])).toBeCloseTo(none, 2);
  });
});
