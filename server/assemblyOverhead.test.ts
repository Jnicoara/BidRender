/**
 * Assembly overhead hours — the flat, per-assembly time that no material line
 * accounts for: laying the job out, ringing it out, cleaning up, the trip.
 *
 * ── What is actually at risk here ────────────────────────────────────────────
 * Three separate things adjust labor in this app, and two of them are
 * percentages, so the failure mode is not "the feature does not work" — it is
 * "the feature works, in the wrong layer, and every number still looks
 * plausible". Specifically:
 *
 *   • Folded into the modifier sum, a fixed 20-minute trip charge would start
 *     scaling with job conditions, and a bid at height would silently carry
 *     more trip time than the same work on the ground.
 *   • Applied after the productivity factor, it would stop being adjusted by how
 *     the crew actually performs, so a shop that beats book hours would keep
 *     billing full setup time forever.
 *   • Counted once in the snapshot AND again at price time, every bid would come
 *     out a few percent high with nothing on screen to explain it.
 *
 * None of those show up as an error. They show up as a number, and the estimator
 * has no way to know it is wrong. So the order of operations is asserted
 * arithmetically here rather than described in a comment somewhere.
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
  addAssemblyOverheadHours,
  applyProductivityToHours,
  calculateLineItem,
} from "../shared/pricing";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 6363;
dropFixtureUsersAfterAll([USER]);

const ctxFor = (id: number): TrpcContext =>
  ({
    user: { id, openId: `test-assembly-overhead-${id}`, role: "user" },
  }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

// ─── The arithmetic, in isolation ─────────────────────────────────────────────

describe("adding overhead hours", () => {
  it("adds nothing when unset, which is what every assembly ships with", () => {
    expect(addAssemblyOverheadHours(2)).toBe(2);
    expect(addAssemblyOverheadHours(2, 0)).toBe(2);
  });

  it("adds flat hours, not a percentage of anything", () => {
    // The distinction the whole feature turns on: 0.25 h is 0.25 h whether the
    // assembly is half an hour of work or eight hours of it.
    expect(addAssemblyOverheadHours(0.5, 0.25)).toBeCloseTo(0.75, 10);
    expect(addAssemblyOverheadHours(8, 0.25)).toBeCloseTo(8.25, 10);
  });

  it("refuses negative overhead rather than discounting the work", () => {
    // Not "a fast assembly" — a typo. Letting it through would quietly take
    // time off a recipe somebody else wrote.
    expect(() => addAssemblyOverheadHours(1, -0.5)).toThrow(
      /cannot be negative/
    );
  });

  it("refuses a non-finite value instead of pricing NaN hours", () => {
    expect(() => addAssemblyOverheadHours(1, Number.NaN)).toThrow(/finite/);
  });
});

// ─── Order of operations ──────────────────────────────────────────────────────

describe("where overhead lands in the pipeline", () => {
  /**
   * The reference case, worked by hand:
   *
   *   material hours          1.00
   *   + assembly overhead     0.50   →  1.50
   *   × (1 + modifiers 0.20)         →  1.80
   *   × (1 + productivity 0.10)      →  1.98
   */
  const line = () =>
    calculateLineItem({
      materials: [],
      baseLaborHours: 1,
      overheadLaborHours: 0.5,
      modifiers: [{ laborAdjustmentPct: 0.2 }],
      laborRate: 100,
      productivityPct: 0.1,
    });

  it("is added BEFORE modifiers, so job conditions scale it too", () => {
    // If it were added after, hours would be 1 × 1.2 × 1.1 + 0.5 = 1.82.
    // Setup and testing take longer on a hard job as well, so it is inside.
    expect(line().adjustedLaborHours).toBeCloseTo(1.98, 10);
    expect(line().adjustedLaborHours).not.toBeCloseTo(1.82, 10);
  });

  it("is added BEFORE the productivity factor, so a fast crew beats it too", () => {
    expect(line().hoursAfterModifiers).toBeCloseTo(1.8, 10);
    expect(line().baseHoursWithOverhead).toBeCloseTo(1.5, 10);
  });

  it("is never folded into the modifier percentage", () => {
    // The breakdown has to keep the layers apart, or nobody can tell what came
    // from the job's conditions and what is fixed setup time.
    const l = line();
    expect(l.modifierPct).toBeCloseTo(0.2, 10);
    expect(l.overheadLaborHours).toBeCloseTo(0.5, 10);
    expect(l.productivityPct).toBeCloseTo(0.1, 10);
  });

  it("reports the split so a breakdown can show its work", () => {
    const l = line();
    expect(l.baseHoursWithOverhead).toBeCloseTo(1.5, 10);
    expect(l.baseHoursWithOverhead - l.overheadLaborHours).toBeCloseTo(1, 10);
  });

  it("prices the extra hours at the same rate as the rest", () => {
    // 1.98 h × $100. Overhead hours are labor, not a surcharge.
    expect(line().laborCost).toBeCloseTo(198, 2);
  });
});

// ─── Kept apart from the productivity factor ──────────────────────────────────

describe("overhead hours versus the productivity factor", () => {
  const base = {
    materials: [],
    baseLaborHours: 2,
    modifiers: [],
    laborRate: 50,
  };

  it("are different units doing different jobs", () => {
    // 1 h of overhead on a 2 h assembly is +1 h, flat.
    const withOverhead = calculateLineItem({ ...base, overheadLaborHours: 1 });
    // A +50% productivity factor on the same assembly is +1 h too — but only
    // because it happens to be a 2 h assembly. Double the work and they part.
    const withProductivity = calculateLineItem({
      ...base,
      productivityPct: 0.5,
    });
    expect(withOverhead.adjustedLaborHours).toBeCloseTo(3, 10);
    expect(withProductivity.adjustedLaborHours).toBeCloseTo(3, 10);

    const biggerOverhead = calculateLineItem({
      ...base,
      baseLaborHours: 8,
      overheadLaborHours: 1,
    });
    const biggerProductivity = calculateLineItem({
      ...base,
      baseLaborHours: 8,
      productivityPct: 0.5,
    });
    expect(biggerOverhead.adjustedLaborHours).toBeCloseTo(9, 10); // still +1 h
    expect(biggerProductivity.adjustedLaborHours).toBeCloseTo(12, 10); // +50%
  });

  it("do not cancel, absorb or otherwise interact", () => {
    // Each is visible in the result independently: turn one off and the other
    // is exactly where it was.
    const neither = calculateLineItem({ ...base });
    const overheadOnly = calculateLineItem({ ...base, overheadLaborHours: 1 });
    const productivityOnly = calculateLineItem({
      ...base,
      productivityPct: 0.5,
    });
    const both = calculateLineItem({
      ...base,
      overheadLaborHours: 1,
      productivityPct: 0.5,
    });

    expect(neither.adjustedLaborHours).toBeCloseTo(2, 10);
    expect(overheadOnly.adjustedLaborHours).toBeCloseTo(3, 10);
    expect(productivityOnly.adjustedLaborHours).toBeCloseTo(3, 10);
    // (2 + 1) × 1.5 — the overhead is inside what productivity multiplies.
    expect(both.adjustedLaborHours).toBeCloseTo(4.5, 10);
    // And NOT 2 × 1.5 + 1 = 4, which is what applying it afterwards would give.
    expect(both.adjustedLaborHours).not.toBeCloseTo(4, 10);
  });

  it("leaves the productivity factor's own behaviour untouched", () => {
    // The function that existed before this feature still answers the same way.
    expect(applyProductivityToHours(10, 0.1).hours).toBeCloseTo(11, 10);
    expect(applyProductivityToHours(10, 0).hours).toBe(10);
  });

  it("survives the productivity factor being zero, and vice versa", () => {
    const overheadNoProductivity = calculateLineItem({
      ...base,
      overheadLaborHours: 0.75,
      productivityPct: 0,
    });
    expect(overheadNoProductivity.adjustedLaborHours).toBeCloseTo(2.75, 10);

    const productivityNoOverhead = calculateLineItem({
      ...base,
      overheadLaborHours: 0,
      productivityPct: 0.25,
    });
    expect(productivityNoOverhead.adjustedLaborHours).toBeCloseTo(2.5, 10);
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("assembly overhead end to end", () => {
  const RATE = 40;
  let materialId: number;
  let journeymanId: number;

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
        openId: `test-assembly-overhead-${USER}`,
        name: "Assembly overhead test user",
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

    // Fixture numbers, never shipped ones — a test that borrows a seeded price
    // is really asserting the seed data has not changed.
    const material = await caller().materials.create({
      name: `Overhead probe ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 10,
      category: "Receptacles",
    });
    materialId = material!.id;

    const rates = await caller().laborRates.list();
    const updated = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: RATE,
    });
    journeymanId = updated.laborRate!.id;
  });

  async function makeAssembly(
    overrides: Partial<{
      hours: number;
      overhead: number;
    }> = {}
  ) {
    const created = await caller().assemblies.create({
      name: `Overhead fixture ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: overrides.hours ?? 1,
      ...(overrides.overhead === undefined
        ? {}
        : { overheadLaborHours: overrides.overhead }),
      laborRateId: journeymanId,
      materials: [{ materialId, qty: 1 }],
      modifierIds: [],
    });
    return created!;
  }

  // ── The default ────────────────────────────────────────────────────────────

  it("defaults to 0 when an assembly is created without it", async () => {
    const assembly = await makeAssembly();
    expect(Number(assembly.overheadLaborHours)).toBe(0);
  });

  it("prices an assembly with no overhead exactly as it did before", async () => {
    // The guarantee that lets this ship without touching anybody's numbers.
    const assembly = await makeAssembly({ hours: 2 });
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.overheadLaborHours).toBe(0);
    expect(priced.line.adjustedLaborHours).toBeCloseTo(2, 6);
    expect(priced.line.laborCost).toBeCloseTo(80, 2); // 2 h × $40
  });

  it("ships every starter assembly at 0", async () => {
    // Starter content must not carry hours nobody chose — the same rule that
    // ships every shipped material and labor rate unpriced.
    const list = await caller().assemblies.list();
    const starters = list.filter(a => a.userId === null);
    expect(starters.length).toBeGreaterThan(0);
    for (const starter of starters) {
      expect(Number(starter.overheadLaborHours)).toBe(0);
    }
  });

  // ── Saving and pricing ─────────────────────────────────────────────────────

  it("saves the hours and prices them into the total", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    expect(Number(assembly.overheadLaborHours)).toBeCloseTo(0.5, 4);

    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.adjustedLaborHours).toBeCloseTo(1.5, 6);
    expect(priced.line.laborCost).toBeCloseTo(60, 2); // 1.5 h × $40
  });

  it("can be set on an assembly that already existed without one", async () => {
    const assembly = await makeAssembly({ hours: 1 });
    const before = await caller().assemblies.price({ id: assembly.id });

    const result = await caller().assemblies.update({
      id: assembly.id,
      overheadLaborHours: 0.25,
    });

    expect(Number(result.assembly!.overheadLaborHours)).toBeCloseTo(0.25, 4);
    const after = await caller().assemblies.price({ id: assembly.id });
    expect(after.line.laborCost).toBeCloseTo(before.line.laborCost + 10, 2);
  });

  it("is left alone by an update that does not mention it", async () => {
    // The partial-update trap this router documents: an absent key must mean
    // "leave it", never "reset it to the default".
    const assembly = await makeAssembly({ hours: 1, overhead: 0.4 });
    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 3 });

    const detail = await caller().assemblies.get({ id: assembly.id });
    expect(Number(detail.overheadLaborHours)).toBeCloseTo(0.4, 4);
    expect(Number(detail.baseLaborHours)).toBeCloseTo(3, 4);
  });

  it("can be cleared back to zero", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.4 });
    await caller().assemblies.update({
      id: assembly.id,
      overheadLaborHours: 0,
    });
    const detail = await caller().assemblies.get({ id: assembly.id });
    expect(Number(detail.overheadLaborHours)).toBe(0);
  });

  // ── Fork on edit ───────────────────────────────────────────────────────────

  it("forks a starter rather than changing it for everyone", async () => {
    const list = await caller().assemblies.list();
    const starter = list.find(a => a.userId === null)!;

    const result = await caller().assemblies.update({
      id: starter.id,
      overheadLaborHours: 0.75,
    });

    expect(result.forked).toBe(true);
    expect(result.assembly!.id).not.toBe(starter.id);
    expect(result.assembly!.userId).toBe(USER);
    expect(result.assembly!.baselineId).toBe(starter.id);
    expect(Number(result.assembly!.overheadLaborHours)).toBeCloseTo(0.75, 4);
  });

  it("leaves the shared starter untouched for other accounts", async () => {
    const list = await caller().assemblies.list();
    const starter = list.find(a => a.userId === null)!;
    await caller().assemblies.update({
      id: starter.id,
      overheadLaborHours: 0.75,
    });

    const db = await getDb();
    const [shared] = await db!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, starter.id))
      .limit(1);
    expect(Number(shared.overheadLaborHours)).toBe(0);
  });

  it("carries the hours onto a fork, and reverting puts them back to the starter's", async () => {
    const list = await caller().assemblies.list();
    const starter = list.find(a => a.userId === null)!;
    const forked = await caller().assemblies.update({
      id: starter.id,
      overheadLaborHours: 0.75,
    });
    const forkId = forked.assembly!.id;

    const reverted = await caller().assemblies.revert({ id: forkId });
    expect(Number(reverted!.overheadLaborHours)).toBe(0);
  });

  it("copies the hours onto a duplicate", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.6 });
    const copy = await caller().assemblies.duplicate({
      id: assembly.id,
      name: `Overhead copy ${Date.now()}${Math.random()}`,
    });
    expect(Number(copy!.overheadLaborHours)).toBeCloseTo(0.6, 4);
  });

  // ── Onto a bid ─────────────────────────────────────────────────────────────

  async function bidWith(assemblyId: number, qty = 1) {
    const bid = await caller().bids.create({
      name: `Overhead bid ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty });
    return bid!;
  }

  it("is inside the hours frozen onto a bid line", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    const bid = await bidWith(assembly.id);
    const detail = await caller().bids.get({ id: bid.id });

    expect(Number(detail.lines[0].snapshotLaborHours)).toBeCloseTo(1.5, 4);
    expect(detail.totals.totalLaborHours).toBeCloseTo(1.5, 4);
  });

  it("counts the overhead exactly once — never twice", async () => {
    // The failure this exists to catch: the snapshot already contains the
    // overhead hours, so re-adding them at price time would inflate every bid
    // by a plausible-looking few percent with nothing on screen to explain it.
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    const priced = await caller().assemblies.price({ id: assembly.id });
    const bid = await bidWith(assembly.id);
    const detail = await caller().bids.get({ id: bid.id });

    expect(detail.totals.totalLaborHours).toBeCloseTo(
      priced.line.adjustedLaborHours,
      4
    );
    expect(detail.totals.laborCost).toBeCloseTo(priced.line.laborCost, 2);
    // 1.5 h, not 2.0 h.
    expect(detail.totals.totalLaborHours).toBeCloseTo(1.5, 4);
  });

  it("scales with quantity like any other hours", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    const bid = await bidWith(assembly.id, 4);
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.totals.totalLaborHours).toBeCloseTo(6, 4); // 1.5 × 4
  });

  it("is multiplied by the productivity factor on a bid, not added after it", async () => {
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    const bid = await bidWith(assembly.id);
    await caller().bids.setPricingDefaults({ productivityPct: 0.2 });

    const detail = await caller().bids.get({ id: bid.id });
    // (1 + 0.5) × 1.2 = 1.8 — the setup time is inside what productivity scales.
    expect(detail.totals.totalLaborHours).toBeCloseTo(1.8, 4);
    // Not 1 × 1.2 + 0.5 = 1.7, which is overhead applied after the factor.
    expect(detail.totals.totalLaborHours).not.toBeCloseTo(1.7, 4);
    expect(detail.totals.laborHoursBeforeProductivity).toBeCloseTo(1.5, 4);
  });

  it("stays frozen on the bid when the assembly's overhead changes later", async () => {
    // Same snapshot guarantee as every other input to a line.
    const assembly = await makeAssembly({ hours: 1, overhead: 0.5 });
    const bid = await bidWith(assembly.id);
    const before = await caller().bids.get({ id: bid.id });

    await caller().assemblies.update({
      id: assembly.id,
      overheadLaborHours: 5,
    });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.totalLaborHours).toBeCloseTo(
      before.totals.totalLaborHours,
      4
    );
  });
});
