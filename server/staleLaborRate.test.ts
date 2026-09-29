/**
 * A bid line frozen at a labor rate its role no longer has.
 *
 * The freeze is by design (R4): a line keeps the rate it was added at, so last
 * week's bid does not re-price itself. What was missing is saying so. The
 * owner's own bid carried seven lines at $68/hr against a Journeyman rate of
 * $43/hr, and the bid only ever flagged a $0 rate
 * (references/takeoff-spec.md § 16). These tests pin the flag, and pin that it
 * changes nothing.
 *
 * Fixture ids are distinct from every other suite — vitest shares one database.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  bids,
  laborRates,
  pricingDefaults,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  groupStaleRates,
  staleRateLines,
  type RatedLineLike,
} from "../shared/laborRatePricing";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 6391;

const ctxFor = (id: number): TrpcContext =>
  ({
    user: { id, openId: `test-stale-labor-rate-${id}`, role: "user" },
  }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

const line = (over: Partial<RatedLineLike> = {}): RatedLineLike => ({
  id: 1,
  name: "Duplex receptacle",
  assemblyId: 10,
  snapshotLaborHours: "0.5000",
  snapshotLaborRate: "68.0000",
  ...over,
});

describe("staleRateLines — which lines to flag", () => {
  const now43 = () => 43;

  it("flags an assembly line whose role costs something else now", () => {
    expect(staleRateLines([line()], now43)).toEqual([
      { lineId: 1, name: "Duplex receptacle", frozenRate: 68, currentRate: 43 },
    ]);
  });

  it("leaves a line alone when the rate has not changed", () => {
    expect(
      staleRateLines([line({ snapshotLaborRate: "43.0000" })], now43)
    ).toEqual([]);
    // Rounding in the fourth place is not a changed rate.
    expect(
      staleRateLines([line({ snapshotLaborRate: "43.0010" })], now43)
    ).toEqual([]);
  });

  it("leaves out a line with no hours — its rate multiplies nothing", () => {
    expect(staleRateLines([line({ snapshotLaborHours: "0" })], now43)).toEqual(
      []
    );
  });

  it("leaves a $0 line to the louder warning that already covers it", () => {
    expect(staleRateLines([line({ snapshotLaborRate: "0" })], now43)).toEqual(
      []
    );
  });

  it("does not flag a role that went to $0 — that is the unrated-role warning", () => {
    expect(staleRateLines([line()], () => 0)).toEqual([]);
  });

  it("skips a hand-priced line and an assembly it cannot find", () => {
    expect(staleRateLines([line({ assemblyId: null })], now43)).toEqual([]);
    expect(staleRateLines([line()], () => null)).toEqual([]);
  });
});

describe("groupStaleRates — one sentence per pair of rates", () => {
  it("groups by the pair, counts lines, and names each once", () => {
    const groups = groupStaleRates([
      { lineId: 1, name: "Duplex", frozenRate: 68, currentRate: 43 },
      { lineId: 2, name: "Duplex", frozenRate: 68, currentRate: 43 },
      { lineId: 3, name: "Switch", frozenRate: 68, currentRate: 43 },
      { lineId: 4, name: "Panel", frozenRate: 90, currentRate: 43 },
    ]);
    expect(groups).toEqual([
      {
        frozenRate: 68,
        currentRate: 43,
        lineCount: 3,
        names: ["Duplex", "Switch"],
      },
      { frozenRate: 90, currentRate: 43, lineCount: 1, names: ["Panel"] },
    ]);
  });
});

describe.skipIf(!hasDb)("the bid says so, and changes nothing", () => {
  let journeymanId: number;
  let assemblyId: number;

  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id: USER,
        openId: `test-stale-labor-rate-${USER}`,
        name: "Stale labor rate test user",
      });
    }
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(laborRates).where(eq(laborRates.userId, USER));
    await db!.delete(pricingDefaults).where(eq(pricingDefaults.userId, USER));

    // Fixture rates, never shipped ones.
    const rates = await caller().laborRates.list();
    const updated = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 68,
    });
    journeymanId = updated.laborRate!.id;

    const created = await caller().assemblies.create({
      name: `Stale rate fixture ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: journeymanId,
      materials: [],
      modifierIds: [],
    });
    assemblyId = created!.id;
  });

  async function bidWithLine() {
    const bid = await caller().bids.create({
      name: `Stale rate ${Date.now()}`,
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 4 });
    return bid!.id;
  }

  it("says nothing while the role still costs what the line froze", async () => {
    const bidId = await bidWithLine();
    const got = await caller().bids.get({ id: bidId });
    expect(got.staleRates).toEqual([]);
  });

  it("flags the line once the role's rate has changed — and leaves its rate alone", async () => {
    const bidId = await bidWithLine();
    await caller().laborRates.update({ id: journeymanId, hourlyCost: 43 });

    const got = await caller().bids.get({ id: bidId });
    expect(got.staleRates).toHaveLength(1);
    expect(got.staleRates[0]).toMatchObject({
      frozenRate: 68,
      currentRate: 43,
    });
    // Flag only: the snapshot is exactly what it was.
    expect(Number(got.lines[0].snapshotLaborRate)).toBe(68);
  });

  it("says nothing on a Won bid, where an older rate is history", async () => {
    const bidId = await bidWithLine();
    await caller().laborRates.update({ id: journeymanId, hourlyCost: 43 });
    await caller().bids.update({ id: bidId, status: "Won" });

    const got = await caller().bids.get({ id: bidId });
    expect(got.staleRates).toEqual([]);
  });
});
