/**
 * Assemblies: recipe cost, and fork/revert of a parent WITH children.
 *
 * The risky parts, and why:
 *   • Cost has to move when materials, hours, the role, or modifiers move —
 *     and modifiers must ADD. A recipe that quietly compounds over-bids a job.
 *   • Forking has to deep-copy. A fork that copies the header but not the
 *     material lines is an empty recipe that prices at labor only.
 *   • Reverting has to restore the lines too, or the user is left with their
 *     own recipe priced against starter hours.
 *
 * Driven through the router, since those guarantees are the router's contract.
 * Fixture ids are distinct from every other suite (4242/9999, 4243/9998,
 * 5151/5152, 5253/5254) — vitest runs files in parallel.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
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
  laborRates,
  materials,
  modifiers,
  users,
} from "../drizzle/schema";
import { DEFAULT_ASSEMBLY_ROLE } from "./seed/baselineAssemblies";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 6161;
const OTHER_USER = 6162;
dropFixtureUsersAfterAll([USER, OTHER_USER]);

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-assemblies-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** Look up a seeded baseline row id by name. */
async function baselineId(
  table: "materials" | "modifiers" | "labor_rates",
  name: string
) {
  const db = await getDb();
  const target =
    table === "materials"
      ? materials
      : table === "modifiers"
        ? modifiers
        : laborRates;
  const [row] = await db!
    .select()
    .from(target)
    .where(eq(target.name, name))
    .limit(1);
  return row.id as number;
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;

  for (const id of [USER, OTHER_USER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        id,
        openId: `test-assemblies-${id}`,
        name: `Assembly test user ${id}`,
      });
    }
  }

  // Assemblies resolve their recipes by name, so their dependencies come first.
  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("starter assemblies", () => {
  /**
   * Every shipped assembly has a role, so its hours are capable of costing
   * something.
   *
   * They shipped with `laborRateId` null, which froze `snapshotLaborRate` at 0
   * onto every bid line made from one: the line put its hours in the total and
   * nothing in the price, and a bid could read "9.7 hours, $0.00" while looking
   * completely finished. That is not this app's deliberate $0 — an unpriced
   * material is flagged on the Materials screen and an unpriced rate on Labor
   * Rates, and an unlinked assembly was flagged nowhere at all.
   */
  it("gives every starter assembly a role to be costed against", async () => {
    const list = await caller().assemblies.list();
    const starters = list.filter(a => a.userId === null);
    expect(starters.length).toBeGreaterThan(0);

    const unlinked = starters.filter(a => a.laborRateId === null);
    expect({
      unlinked: unlinked.map(a => a.name),
      hint: "A starter assembly with no role prices its labor at $0 on every bid built from it.",
    }).toEqual({ unlinked: [], hint: expect.anything() });
  });

  it("points them at the starter role", async () => {
    // The zero does not disappear — it MOVES, to the one place the app already
    // knows how to explain it: this role needing a number, which Labor Rates
    // flags, the checklist counts, and first-run asks for. That the role itself
    // ships unpriced is asserted in laborRates.test.ts, against the seed rather
    // than against a shared database other suites have been editing.
    const rates = await caller().laborRates.list();
    const role = rates.find(r => r.name === DEFAULT_ASSEMBLY_ROLE)!;
    expect(role).toBeDefined();

    /**
     * Compared against the BASELINE id, not whatever `list` handed back.
     *
     * Once this user has edited the rate, `list` returns their fork — a new row
     * with a new id — while the shipped assembly still stores the starter's.
     * That is the supersede chain working, not a broken link, and asserting on
     * `role.id` would fail the moment anybody prices a rate. See
     * shared/laborRateLookup.ts.
     */
    const shippedRoleId = role.baselineId ?? role.id;
    const list = await caller().assemblies.list();
    const starter = list.find(a => a.userId === null)!;
    expect(starter.laborRateId).toBe(shippedRoleId);
  });

  it("costs a starter assembly at the rate once the contractor sets one", async () => {
    /**
     * The whole point, end to end. Editing a shipped role FORKS it, so the
     * assembly's stored id now names a row the merged library hides — and the
     * cost has to follow that supersede chain rather than reading 0. This is
     * exactly what `resolveLaborRate` exists for, asserted from the assembly's
     * side, which is where the silent $0 was actually landing.
     */
    const rates = await caller().laborRates.list();
    const role = rates.find(r => r.name === DEFAULT_ASSEMBLY_ROLE)!;
    await caller().laborRates.update({ id: role.id, hourlyCost: 68 });

    const list = await caller().assemblies.list();
    const starter = list.find(
      a => a.userId === null && Number(a.baseLaborHours) > 0
    )!;
    const costed = await caller().assemblies.price({
      id: starter.id,
      quantity: 1,
    });

    expect(costed.laborRateMissing).toBe(false);
    expect(costed.laborRate).toBe(68);
    // Hours × $68, not hours × nothing.
    expect(costed.line.laborCost).toBeCloseTo(
      Number(starter.baseLaborHours) * 68,
      2
    );
  });

  it("seeds recipes with their material lines attached", async () => {
    const list = await caller().assemblies.list();
    const duplex = list.find(a => a.name === "Duplex receptacle standard");
    expect(duplex).toBeDefined();

    const detail = await caller().assemblies.get({ id: duplex!.id });
    expect(detail.materials.length).toBe(5);
    expect(detail.materials.map(m => m.name)).toContain("15A duplex receptacle");
    expect(detail.materials.find(m => m.name === "12/2 NM-B Copper")?.qty).toBe(
      "25.0000"
    );
  });

  it("only seeds assemblies whose materials all exist", async () => {
    // STARTER_LIBRARY marks 36 materials as missing; anything needing one is
    // skipped rather than shipped half-built and under-priced.
    const db = await getDb();
    const baselines = await db!
      .select()
      .from(assemblies)
      .where(isNull(assemblies.userId));
    expect(baselines.length).toBeGreaterThan(0);
    for (const assembly of baselines) {
      const detail = await caller().assemblies.get({ id: assembly.id });
      expect(
        detail.materials.length,
        `${assembly.name} has no materials`
      ).toBeGreaterThan(0);
    }
  });

  it("carries a project type and a category", async () => {
    const list = await caller().assemblies.list();
    const fan = list.find(a => a.name === "Ceiling fan standard")!;
    expect(fan.category).toBe("Lighting");
    expect(fan.projectType).toBe("residential");
  });

  it("attaches the modifiers a starter opts into", async () => {
    const list = await caller().assemblies.list();
    const fan = list.find(a => a.name === "Ceiling fan standard")!;
    const detail = await caller().assemblies.get({ id: fan.id });
    expect(detail.modifierIds.length).toBe(1);
  });
});

describe.skipIf(!hasDb)("recipe cost", () => {
  /**
   * Materials this suite owns and prices itself.
   *
   * These used to be baseline rows borrowed for their shipped prices, which
   * quietly made every arithmetic assertion below a test of the catalog's
   * price list as much as of the pricing math. The shipped catalog now ships
   * unpriced on purpose, so the fixture states its own numbers — which is what
   * it wanted all along: "1.50 × 2 + 1.25 × 2 = 5.50" should fail when the
   * multiplication breaks, not when someone re-prices a receptacle.
   */
  let pricedDeviceId: number;
  let pricedBoxId: number;

  /**
   * The starter roles now ship at $0 too, for the same reason the materials do
   * — so the labor half of these sums has to be set by the test as well. The
   * Journeyman fork below is what "$38/hr" means in every assertion here.
   */
  const JOURNEYMAN_RATE = 38;

  async function pricedJourneymanId(): Promise<number> {
    const rates = await caller().laborRates.list();
    const journeyman = rates.find(r => r.name === "Journeyman")!;
    const updated = await caller().laborRates.update({
      id: journeyman.id,
      hourlyCost: JOURNEYMAN_RATE,
    });
    return updated.laborRate!.id;
  }

  beforeAll(async () => {
    const device = await caller().materials.create({
      name: `Cost fixture device ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 1.5,
      category: "Receptacles",
    });
    const box = await caller().materials.create({
      name: `Cost fixture box ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 1.25,
      category: "Boxes",
    });
    pricedDeviceId = device!.id;
    pricedBoxId = box!.id;
  });

  /** Build a small assembly with known numbers so the math is checkable by hand. */
  async function buildFixture(
    overrides: Partial<{
      hours: number;
      modifierIds: number[];
      laborRateId: number | null;
    }> = {}
  ) {
    const journeymanId = await pricedJourneymanId();
    const duplexId = pricedDeviceId; // $1.50 each
    const boxId = pricedBoxId; // $1.25 each

    const created = await caller().assemblies.create({
      name: `Cost fixture ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: overrides.hours ?? 1,
      laborRateId:
        overrides.laborRateId !== undefined
          ? overrides.laborRateId
          : journeymanId,
      materials: [
        { materialId: duplexId, qty: 2 },
        { materialId: boxId, qty: 2 },
      ],
      modifierIds: overrides.modifierIds ?? [],
    });
    return created!;
  }

  it("adds up materials times quantity", async () => {
    const assembly = await buildFixture();
    const priced = await caller().assemblies.price({ id: assembly.id });
    // (1.50 × 2) + (1.25 × 2) = 5.50
    expect(priced.line.materialCost).toBeCloseTo(5.5, 10);
  });

  it("prices labor as hours times the role's rate", async () => {
    const assembly = await buildFixture({ hours: 2 });
    const priced = await caller().assemblies.price({ id: assembly.id });
    // Journeyman $38 × 2 h
    expect(priced.line.laborCost).toBeCloseTo(76, 10);
    expect(priced.line.directCost).toBeCloseTo(81.5, 10);
  });

  it("moves when the hours move", async () => {
    const assembly = await buildFixture({ hours: 1 });
    const before = await caller().assemblies.price({ id: assembly.id });
    await caller().assemblies.update({ id: assembly.id, baseLaborHours: 3 });
    const after = await caller().assemblies.price({ id: assembly.id });
    expect(after.line.laborCost).toBeCloseTo(before.line.laborCost * 3, 10);
  });

  it("moves when the labor role changes", async () => {
    const assembly = await buildFixture({ hours: 1 });
    // Priced by this test, like the Journeyman above — starter roles ship at $0.
    const rates = await caller().laborRates.list();
    const apprentice = await caller().laborRates.update({
      id: rates.find(r => r.name === "Apprentice")!.id,
      hourlyCost: 22,
    });
    await caller().assemblies.update({
      id: assembly.id,
      laborRateId: apprentice.laborRate!.id,
    });
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.laborCost).toBeCloseTo(22, 10);
  });

  it("prices a salaried role off its derived hourly rate", async () => {
    const rates = await caller().laborRates.list();
    const pm = await caller().laborRates.update({
      id: rates.find(r => r.name === "Project Manager")!.id,
      annualSalary: 60000,
      annualHours: 2080,
    });
    const assembly = await buildFixture({
      hours: 1,
      laborRateId: pm.laborRate!.id,
    });
    const priced = await caller().assemblies.price({ id: assembly.id });
    // $60,000 ÷ 2,080 ≈ $28.85
    expect(priced.line.laborCost).toBeCloseTo(28.85, 1);
  });

  it("prices labor at zero and flags it when no role is picked", async () => {
    const assembly = await buildFixture({ hours: 5, laborRateId: null });
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.laborCost).toBe(0);
    expect(priced.laborRateMissing).toBe(true);
  });

  it("moves when materials are added or removed", async () => {
    const assembly = await buildFixture();
    const cheap = await caller().materials.create({
      name: `Cost fixture consumable ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 0.08,
      category: "Connectors & Terminations",
    });
    await caller().assemblies.update({
      id: assembly.id,
      materials: [{ materialId: cheap!.id, qty: 10 }],
    });
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.materialCost).toBeCloseTo(0.8, 10);
  });

  it("ADDS modifiers rather than compounding them", async () => {
    const heightId = await baselineId("modifiers", "Working at height"); // +12%
    const overtimeId = await baselineId("modifiers", "Scheduled overtime"); // +20%
    const assembly = await buildFixture({
      hours: 10,
      modifierIds: [heightId, overtimeId],
    });

    const priced = await caller().assemblies.price({ id: assembly.id });
    // 10 h × (1 + 0.32) = 13.2 h. Compounding would give 1.12 × 1.20 = 13.44 h.
    expect(priced.line.modifierPct).toBeCloseTo(0.32, 10);
    expect(priced.line.adjustedLaborHours).toBeCloseTo(13.2, 10);
    expect(priced.line.adjustedLaborHours).not.toBeCloseTo(13.44, 3);
  });

  it("changes cost when a modifier is toggled off", async () => {
    const heightId = await baselineId("modifiers", "Working at height");
    const assembly = await buildFixture({ hours: 10, modifierIds: [heightId] });
    const withModifier = await caller().assemblies.price({ id: assembly.id });

    await caller().assemblies.update({ id: assembly.id, modifierIds: [] });
    const without = await caller().assemblies.price({ id: assembly.id });

    expect(withModifier.line.laborCost).toBeGreaterThan(without.line.laborCost);
    expect(without.line.modifierPct).toBe(0);
  });

  it("scales the whole line by quantity", async () => {
    const assembly = await buildFixture({ hours: 1 });
    const one = await caller().assemblies.price({
      id: assembly.id,
      quantity: 1,
    });
    const ten = await caller().assemblies.price({
      id: assembly.id,
      quantity: 10,
    });
    expect(ten.line.directCost).toBeCloseTo(one.line.directCost * 10, 8);
  });

  it("returns direct cost only when no profit method is given", async () => {
    const assembly = await buildFixture();
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.bid).toBeNull();
  });

  it("applies overhead before profit", async () => {
    const assembly = await buildFixture({ hours: 1 });
    const priced = await caller().assemblies.price({
      id: assembly.id,
      overhead: { enabled: true, mode: "percentage", value: 0.1 },
      profit: { method: "markup", value: 0.2 },
    });
    // materials 5.50 + labor (1 h × $38) = 43.50 direct
    //   → +10% overhead = 47.85 → +20% markup = 57.42
    expect(priced.bid?.directCost).toBeCloseTo(43.5, 2);
    expect(priced.bid?.overheadAmount).toBeCloseTo(4.35, 2);
    expect(priced.bid?.costWithOverhead).toBeCloseTo(47.85, 2);
    expect(priced.bid?.finalPrice).toBeCloseTo(57.42, 2);
  });

  it("gives a higher price for target margin than markup at the same rate", async () => {
    const assembly = await buildFixture({ hours: 1 });
    const markup = await caller().assemblies.price({
      id: assembly.id,
      profit: { method: "markup", value: 0.2 },
    });
    const margin = await caller().assemblies.price({
      id: assembly.id,
      profit: { method: "margin", value: 0.2 },
    });
    expect(margin.bid!.finalPrice).toBeGreaterThan(markup.bid!.finalPrice);
  });
});

describe.skipIf(!hasDb)("fork and revert", () => {
  async function starter() {
    const list = await caller().assemblies.list();
    return list.find(
      a => a.name === "Single-pole switch" && a.userId === null
    )!;
  }

  it("editing a starter forks it and leaves the shipped row alone", async () => {
    const original = await starter();
    const result = await caller().assemblies.update({
      id: original.id,
      baseLaborHours: 2.5,
    });

    expect(result.forked).toBe(true);
    expect(result.assembly?.userId).toBe(USER);
    expect(result.assembly?.id).not.toBe(original.id);

    const db = await getDb();
    const [shared] = await db!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, original.id));
    expect(Number(shared.baseLaborHours)).toBeCloseTo(0.6, 4);
  });

  it("the fork carries the whole recipe, not just the header", async () => {
    const original = await starter();
    const before = await caller().assemblies.get({ id: original.id });

    const result = await caller().assemblies.update({
      id: original.id,
      baseLaborHours: 2.5,
    });
    const forked = await caller().assemblies.get({ id: result.assembly!.id });

    expect(forked.materials.length).toBe(before.materials.length);
    expect(forked.materials.map(m => m.name).sort()).toEqual(
      before.materials.map(m => m.name).sort()
    );
  });

  it("the fork replaces its starter in the list", async () => {
    const original = await starter();
    await caller().assemblies.update({ id: original.id, baseLaborHours: 2.5 });

    const after = await caller().assemblies.list();
    expect(after.filter(a => a.name === "Single-pole switch")).toHaveLength(1);
    expect(after.find(a => a.name === "Single-pole switch")?.userId).toBe(USER);
  });

  it("a second edit does not fork again", async () => {
    const original = await starter();
    const first = await caller().assemblies.update({
      id: original.id,
      baseLaborHours: 2.5,
    });
    const second = await caller().assemblies.update({
      id: first.assembly!.id,
      baseLaborHours: 3,
    });
    expect(second.forked).toBe(false);
  });

  it("reverting restores the starter hours AND the starter recipe", async () => {
    const original = await starter();
    const before = await caller().assemblies.get({ id: original.id });

    const forked = await caller().assemblies.update({
      id: original.id,
      baseLaborHours: 9,
      materials: [{ materialId: before.materials[0].materialId, qty: 99 }],
    });
    const edited = await caller().assemblies.get({ id: forked.assembly!.id });
    expect(edited.materials).toHaveLength(1);

    const reverted = await caller().assemblies.revert({
      id: forked.assembly!.id,
    });
    expect(Number(reverted!.baseLaborHours)).toBeCloseTo(0.6, 4);
    expect(reverted!.materials.length).toBe(before.materials.length);
    expect(reverted!.id).toBe(forked.assembly!.id);
  });

  it("reverting restores the modifier set too", async () => {
    const list = await caller().assemblies.list();
    const fan = list.find(a => a.name === "Ceiling fan standard")!;
    const forked = await caller().assemblies.update({
      id: fan.id,
      modifierIds: [],
    });
    expect(forked.assembly?.modifierIds).toHaveLength(0);

    const reverted = await caller().assemblies.revert({
      id: forked.assembly!.id,
    });
    expect(reverted!.modifierIds).toHaveLength(1);
  });

  it("a reverted assembly prices exactly like the starter again", async () => {
    const original = await starter();
    const starterPrice = await caller().assemblies.price({ id: original.id });

    const forked = await caller().assemblies.update({
      id: original.id,
      baseLaborHours: 9,
    });
    await caller().assemblies.revert({ id: forked.assembly!.id });
    const revertedPrice = await caller().assemblies.price({
      id: forked.assembly!.id,
    });

    expect(revertedPrice.line.directCost).toBeCloseTo(
      starterPrice.line.directCost,
      6
    );
  });

  it("refuses to revert an assembly built from scratch", async () => {
    const created = await caller().assemblies.create({
      name: `Scratch ${Date.now()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: null,
      materials: [],
      modifierIds: [],
    });
    await expect(
      caller().assemblies.revert({ id: created!.id })
    ).rejects.toThrow(/no original/i);
  });

  it("one user's fork does not change another user's list", async () => {
    const original = await starter();
    await caller().assemblies.update({ id: original.id, baseLaborHours: 9 });

    const other = await callerFor(OTHER_USER).assemblies.list();
    const theirs = other.find(a => a.name === "Single-pole switch")!;
    expect(theirs.userId).toBeNull();
    expect(Number(theirs.baseLaborHours)).toBeCloseTo(0.6, 4);
  });

  it("removes a starter by forking it, and a custom one in place", async () => {
    const original = await starter();
    const { id: archivedId } = await caller().assemblies.archive({
      id: original.id,
    });
    // Starters archive through a fork — the shared row is never touched.
    expect(archivedId).not.toBe(original.id);
    expect(
      (await caller().assemblies.list()).some(a => a.name === original.name)
    ).toBe(false);

    const created = await caller().assemblies.create({
      name: `Disposable ${Date.now()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: null,
      materials: [],
      modifierIds: [],
    });
    await caller().assemblies.archive({ id: created!.id });
    expect(
      (await caller().assemblies.list()).some(a => a.id === created!.id)
    ).toBe(false);
  });

  it("refuses a duplicate name", async () => {
    await expect(
      caller().assemblies.create({
        name: "Single-pole switch",
        category: "Devices",
        trade: "electrical",
        projectType: null,
        baseLaborHours: 1,
        laborRateId: null,
        materials: [],
        modifierIds: [],
      })
    ).rejects.toThrow(/already exists/i);
  });
});
