/**
 * The dashboard card says what it leaves out — "$378 + 3 lines not priced" —
 * and says the SAME thing the bid it opens says.
 *
 * ── The fault this pins ──────────────────────────────────────────────────────
 * "Find a bid" read "$378 + 3 lines not priced" directly above the dashboard
 * card for the same bid reading a bare "$378" (todo.md). The card is summed in
 * SQL (`getDashboardBids`), so the not-priced rule has a second copy there, and
 * two copies of a rule drift.
 *
 * ── How the two copies are kept together ─────────────────────────────────────
 * By proof, the way `server/analytics.test.ts` keeps the cost arithmetic
 * honest: every bid below is counted both ways — the SQL, and `rollUpBid` over
 * `getRollupLines`, which is what the bid screen runs — and the two must agree.
 * Each bid is one kind of line from `shared/lineNotPriced.ts`, so a branch the
 * SQL gets wrong names itself. The expected tallies are written out as well,
 * so both copies being wrong the same way cannot pass either.
 *
 * Lines are written straight into the table: several of these (a broken line,
 * a NULL parts count from before 0087) cannot be made through a router.
 *
 * Fixture ids 9861/9862 are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDashboardBids, getDb, getRollupLines } from "./db";
import { companyDefaultsFor, rollUpBid } from "./bidPricing";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bids,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { NotPricedTally } from "../shared/lineNotPriced";
import type { TrpcContext } from "./_core/context";

const USER = 9861;
const OTHER = 9862;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-dashboard-not-priced-${id}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
  await db.delete(assemblies).where(inArray(assemblies.userId, [USER, OTHER]));
  await db
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER, OTHER]));
  await db.delete(materials).where(inArray(materials.userId, [USER, OTHER]));
}

async function material(userId: number, name: string, cost: string) {
  const db = await getDb();
  const [row] = await db!.insert(materials).values({
    userId,
    name: `${name} ${Date.now()}${Math.random()}`,
    unitOfSale: "each",
    costPerUnit: cost,
  });
  return row.insertId;
}

async function assemblyOf(userId: number, name: string, parts: number[]) {
  const db = await getDb();
  const [row] = await db!.insert(assemblies).values({
    userId,
    name: `${name} ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: "0.5000",
  });
  for (const materialId of parts) {
    await db!
      .insert(assemblyMaterials)
      .values({ assemblyId: row.insertId, materialId, qty: "1.0000" });
  }
  return row.insertId;
}

async function runType(userId: number, label: string) {
  const db = await getDb();
  const [row] = await db!.insert(takeoffRunTypes).values({
    userId,
    label: `${label} ${Date.now()}${Math.random()}`,
  } as typeof takeoffRunTypes.$inferInsert);
  return row.insertId;
}

async function aBid(userId: number, name: string) {
  const bid = (await caller(userId).bids.create({ name }))!;
  return bid.id;
}

/** A sound, fully priced line; each case overrides what makes it its kind. */
async function line(
  bidId: number,
  fields: Partial<typeof bidLineItems.$inferInsert> = {}
) {
  const db = await getDb();
  await db!.insert(bidLineItems).values({
    bidId,
    name: "dashboard not-priced line",
    qty: "2",
    snapshotMaterialCost: "10.0000",
    snapshotLaborHours: "0.5000",
    snapshotLaborRate: "50.0000",
    snapshotModifierPct: "0.0000",
    snapshotUnpricedParts: 0,
    ...fields,
  });
}

/** What the bid screen says: rollUpBid over the lines it loads. */
async function screenTally(bidId: number): Promise<NotPricedTally> {
  const db = await getDb();
  const [bid] = await db!.select().from(bids).where(eq(bids.id, bidId));
  const company = await companyDefaultsFor(USER);
  // No charges: these bids have none, and charges never change the tally.
  return rollUpBid(bid, await getRollupLines(bidId, USER), company, [])
    .notPriced;
}

async function cardTally(bidId: number): Promise<NotPricedTally> {
  const row = (await getDashboardBids(USER, 0)).find(b => b.id === bidId);
  if (!row) throw new Error(`bid ${bidId} is not on the dashboard`);
  return row.notPriced;
}

const cases: Record<string, { bidId: number; expected: NotPricedTally }> = {};
let lugId = 0;

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  for (const id of [USER, OTHER]) {
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id,
        openId: `test-dashboard-not-priced-${id}`,
        name: `Dashboard not-priced fixture ${id}`,
      });
    }
  }
  await clean();

  lugId = await material(USER, "Dashboard probe lug", "0.0000");
  const strap = await material(USER, "Dashboard probe strap", "3.0000");
  const recipe = await assemblyOf(USER, "Dashboard probe recipe", [
    lugId,
    strap,
  ]);
  const pipe = await runType(USER, "Dashboard probe EMT");
  const pipe2 = await runType(USER, "Dashboard probe EMT 2");

  /*
    Every fixture bid is LOCKED, and since 2026-09-27 that is what keeps this
    suite testing the SQL at all. The dashboard now prices an UNLOCKED bid
    with plan lines through the bid screen's rollup instead of the SQL
    (server/dashboardFollowsDrawing.test.ts), so an unlocked run-type bid here
    would compare the rollup with itself and prove nothing about
    `lineNotPricedSql`. Locked, the stored qty is the number, the SQL path
    prices it, and both sides read the same quantity.

    (The reason given here before was the drift itself — the SQL reading a
    stale stored qty on an unlocked bid. That is fixed by the rollup path;
    the lock stays for the reason above.)
  */
  const add = async (
    name: string,
    expected: NotPricedTally,
    build: (bidId: number) => Promise<void>
  ) => {
    const bidId = await aBid(USER, `Dashboard not-priced: ${name}`);
    await db!
      .update(bids)
      .set({ quantitiesLockedAt: new Date() })
      .where(eq(bids.id, bidId));
    await build(bidId);
    cases[name] = { bidId, expected };
  };

  await add("no lines", { lines: 0, parts: 0 }, async () => {});

  await add("priced by hand", { lines: 1, parts: 0 }, async bidId => {
    // Blank is not priced; a TYPED 0 is an answer.
    await line(bidId, { snapshotMaterialCost: null });
    await line(bidId, { snapshotMaterialCost: "0.0000" });
    await line(bidId);
  });

  await add("from a run type", { lines: 2, parts: 0 }, async bidId => {
    // Off a $0 catalog row — unpriced even with labor on it.
    await line(bidId, {
      takeoffRunTypeId: pipe,
      runMaterialRole: "raceway",
      snapshotMaterialCost: "0.0000",
    });
    await line(bidId, { takeoffRunTypeId: pipe, runMaterialRole: "conductor" });
    // A field bend is decided by its HOURS: NULL is not priced, a set 0 is.
    await line(bidId, {
      takeoffRunTypeId: pipe,
      runMaterialRole: "fieldBend",
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: null,
    });
    await line(bidId, {
      takeoffRunTypeId: pipe2,
      runMaterialRole: "fieldBend",
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
    });
  });

  await add("from an assembly", { lines: 1, parts: 2 }, async bidId => {
    // Whole cost $0 — one line, and its parts are in that already.
    await line(bidId, {
      assemblyId: recipe,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
      snapshotUnpricedParts: 3,
    });
    // Labor-only: priced, nothing missing.
    await line(bidId, { assemblyId: recipe, snapshotMaterialCost: "0.0000" });
    // Priced, with two frozen $0 parts: "+ 2 parts".
    await line(bidId, { assemblyId: recipe, snapshotUnpricedParts: 2 });
  });

  await add("from before 0087", { lines: 0, parts: 2 }, async bidId => {
    // NULL reads the recipe NOW: the lug is $0, the strap is not — one part
    // per line, the same way the bid screen reads it.
    await line(bidId, { assemblyId: recipe, snapshotUnpricedParts: null });
    await line(bidId, { assemblyId: recipe, snapshotUnpricedParts: null });
  });

  await add("no quantity", { lines: 0, parts: 0 }, async bidId => {
    await line(bidId, { qty: "0", snapshotMaterialCost: null });
    await line(bidId, {
      qty: "0",
      takeoffRunTypeId: pipe,
      runMaterialRole: "raceway",
      snapshotMaterialCost: "0.0000",
    });
    await line(bidId, {
      qty: "0",
      assemblyId: recipe,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
    });
    await line(bidId, {
      qty: "0",
      assemblyId: recipe,
      snapshotUnpricedParts: null,
    });
  });

  await add("broken lines", { lines: 1, parts: 0 }, async bidId => {
    // The engine cannot price these at all. An assembly line it cannot price
    // is "can't price", not "not priced"; a blank hand price is still blank.
    await line(bidId, {
      assemblyId: recipe,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
      snapshotLaborRate: "-1.0000",
    });
    await line(bidId, {
      snapshotMaterialCost: null,
      snapshotLaborRate: "-1.0000",
    });
  });

  await add("archived lines", { lines: 0, parts: 0 }, async bidId => {
    await line(bidId, { snapshotMaterialCost: null, archivedAt: new Date() });
    await line(bidId, {
      assemblyId: recipe,
      snapshotUnpricedParts: 4,
      archivedAt: new Date(),
    });
  });

  await add("everything at once", { lines: 3, parts: 3 }, async bidId => {
    await line(bidId, { snapshotMaterialCost: null });
    await line(bidId, {
      takeoffRunTypeId: pipe,
      runMaterialRole: "raceway",
      snapshotMaterialCost: "0.0000",
    });
    await line(bidId, {
      assemblyId: recipe,
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
    });
    await line(bidId, { assemblyId: recipe, snapshotUnpricedParts: 2 });
    await line(bidId, { assemblyId: recipe, snapshotUnpricedParts: null });
  });
});

afterAll(async () => {
  if (hasDb) await clean();
});

withDb("the dashboard card's not-priced count", () => {
  it.each([
    "no lines",
    "priced by hand",
    "from a run type",
    "from an assembly",
    "from before 0087",
    "no quantity",
    "broken lines",
    "archived lines",
    "everything at once",
  ])("%s: the card says what the bid screen says", async name => {
    const { bidId, expected } = cases[name];
    const screen = await screenTally(bidId);
    expect(screen).toEqual(expected);
    expect(await cardTally(bidId)).toEqual(screen);
  });

  it("follows the library for a line from before 0087, as the bid does", async () => {
    // Pricing the lug in the library moves a NULL line's live read on both
    // surfaces together. A frozen line would not move on either.
    const db = await getDb();
    const { bidId } = cases["from before 0087"];
    await db!
      .update(materials)
      .set({ costPerUnit: "12.5000" })
      .where(eq(materials.id, lugId));
    try {
      expect(await screenTally(bidId)).toEqual({ lines: 0, parts: 0 });
      expect(await cardTally(bidId)).toEqual({ lines: 0, parts: 0 });
    } finally {
      await db!
        .update(materials)
        .set({ costPerUnit: "0.0000" })
        .where(eq(materials.id, lugId));
    }
  });

  it("reaches the card through bids.dashboard", async () => {
    const { bidId, expected } = cases["everything at once"];
    const card = (await caller(USER).bids.dashboard()).find(
      b => b.id === bidId
    )!;
    expect(card.notPriced).toEqual(expected);
  });

  it("counts only this company's bids", async () => {
    // Another company's bid on the same shape shows nothing of USER's.
    const other = await aBid(OTHER, "Dashboard not-priced: other company");
    await line(other, { snapshotMaterialCost: null });
    const theirs = await getDashboardBids(OTHER, 0);
    expect(theirs.map(b => b.id)).toEqual([other]);
    expect(theirs[0].notPriced).toEqual({ lines: 1, parts: 0 });
    expect((await getDashboardBids(USER, 0)).some(b => b.id === other)).toBe(
      false
    );
  });
});
