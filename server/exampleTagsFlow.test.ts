/**
 * "Example price" / "Example hours" / "Example rate" against a real database
 * (0132–0134, owner 2026-10-07).
 *
 * The rule has four halves, and each one is a place it can quietly break:
 *   1. the seed SETS the flag on what it ships (labor rates today; prices and
 *      hours as soon as the sheets land);
 *   2. the shop's edit of THAT number CLEARS it — and an untouched save does
 *      not, or opening an example and pressing Save would launder it;
 *   3. a bid line FREEZES what it was priced with, so a later edit of the
 *      library cannot make an old line lie in either direction;
 *   4. the proposal document COUNTS those lines, for the warning before
 *      printing.
 *
 * Fixture id 8834 is this suite's alone (vitest runs files in parallel).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  bids,
  laborRates,
  materials,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const hasDb = !!process.env.DATABASE_URL;
const USER = 8834;
dropFixtureUsersAfterAll([USER]);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, role: "user" },
  } as unknown as TrpcContext);

const unique = (s: string) => `${s} ${Date.now()}${Math.random()}`;

const rateStepDone = (state: { steps: { id: string; done: boolean }[] }) =>
  state.steps.find(s => s.id === "labor-rates")!.done;

async function journeyman() {
  const rows = await caller().laborRates.list();
  return rows.find(r => r.name === "Journeyman")!;
}

describe.skipIf(!hasDb)("example tags, end to end", () => {
  beforeAll(async () => {
    const db = await getDb();
    await db!
      .insert(users)
      .values({
        id: USER,
        openId: `test-example-tags-${USER}`,
        name: "Example tags fixture",
        email: `example-tags-${USER}@example.test`,
        loginMethod: "password",
      })
      .onDuplicateKeyUpdate({ set: { name: "Example tags fixture" } });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(assemblies).where(eq(assemblies.userId, USER));
    await db!.delete(laborRates).where(eq(laborRates.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));
  });

  // ─── 1. The seed sets it ────────────────────────────────────────────────

  it("seeds the field roles at the example loaded rate, tagged, with their parts", async () => {
    const db = await getDb();
    const shipped = await db!
      .select()
      .from(laborRates)
      .where(isNull(laborRates.userId));
    const byName = new Map(shipped.map(r => [r.name, r]));
    for (const [name, wage, loaded] of [
      ["Foreman/Master Electrician", 50, 70.5],
      ["Journeyman", 42, 59.22],
      ["Apprentice", 26, 36.66],
      ["Helper", 24, 33.84],
    ] as const) {
      const r = byName.get(name);
      expect(r, `${name} not seeded`).toBeDefined();
      expect(r!.isExampleRate, name).toBe(true);
      expect(Number(r!.hourlyCost), name).toBeCloseTo(loaded, 4);
      expect(Number(r!.baseWage), name).toBeCloseTo(wage, 4);
      expect(Number(r!.payrollTaxPct)).toBeCloseTo(0.1, 4);
      expect(Number(r!.workersCompPct)).toBeCloseTo(0.07, 4);
      expect(Number(r!.insurancePct)).toBeCloseTo(0.04, 4);
      expect(Number(r!.benefitsPct)).toBeCloseTo(0.2, 4);
    }
    // Unrated roles are not examples: $0 and no flag (NULL, never false).
    const pm = byName.get("Project Manager")!;
    expect(pm.isExampleRate).toBeNull();
    expect(pm.baseWage).toBeNull();
  });

  it("a restart puts the tag back on a shipped row that lost it", async () => {
    // The seed re-stamps shipped rows (never a company's); this is how the
    // flag reaches every existing database with no migration backfill.
    const db = await getDb();
    const [row] = await db!
      .select()
      .from(laborRates)
      .where(and(isNull(laborRates.userId), eq(laborRates.name, "Apprentice")));
    await db!
      .update(laborRates)
      .set({ isExampleRate: null, baseWage: null })
      .where(eq(laborRates.id, row.id));
    await seedBaselineLaborRates();
    const [after] = await db!
      .select()
      .from(laborRates)
      .where(eq(laborRates.id, row.id));
    expect(after.isExampleRate).toBe(true);
    expect(Number(after.baseWage)).toBeCloseTo(26, 4);
  });

  // ─── 2. The shop's edit clears it ───────────────────────────────────────

  it("typing a new rate clears the tag and the parts on the shop's copy", async () => {
    const shipped = await journeyman();
    const result = await caller().laborRates.update({
      id: shipped.id,
      hourlyCost: 65,
    });
    expect(result.forked).toBe(true);
    const own = await journeyman();
    expect(own.userId).toBe(USER);
    expect(own.isExampleRate).toBe(false);
    expect(own.baseWage).toBeNull();
    expect(Number(own.hourlyCost)).toBeCloseTo(65, 4);
  });

  it("saving the example untouched leaves it an example", async () => {
    const shipped = await journeyman();
    await caller().laborRates.update({
      id: shipped.id,
      name: "Journeyman",
      hourlyCost: Number(shipped.hourlyCost),
    });
    const own = await journeyman();
    expect(own.isExampleRate).toBe(true);
    expect(Number(own.baseWage)).toBeCloseTo(42, 4);
  });

  it("a wage-and-burden edit writes the loaded rate and clears the tag", async () => {
    const shipped = await journeyman();
    await caller().laborRates.update({
      id: shipped.id,
      breakdown: {
        baseWage: 45,
        payrollTaxPct: 0.1,
        workersCompPct: 0.05,
        insurancePct: 0.04,
        benefitsPct: 0.15,
      },
    });
    const own = await journeyman();
    expect(own.isExampleRate).toBe(false);
    // 45 x 1.34 = 60.30
    expect(Number(own.hourlyCost)).toBeCloseTo(60.3, 4);
    expect(Number(own.baseWage)).toBeCloseTo(45, 4);
    expect(Number(own.workersCompPct)).toBeCloseTo(0.05, 4);
  });

  it("the first-run screen's rate clears the tag too", async () => {
    const shipped = await journeyman();
    await caller().onboarding.setStarterRate({
      id: shipped.id,
      hourlyCost: 61,
    });
    const own = await journeyman();
    expect(own.isExampleRate).toBe(false);
    expect(own.baseWage).toBeNull();
    const state = await caller().onboarding.state();
    expect(rateStepDone(state)).toBe(true);
  });

  it("an example rate alone does not count as the shop having set one", async () => {
    const state = await caller().onboarding.state();
    expect(rateStepDone(state)).toBe(false);
  });

  it("editing a material's price clears its tag; leaving it does not", async () => {
    const created = await caller().materials.create({
      name: unique("Tagged price probe"),
      unitOfSale: "each",
      costPerUnit: 4,
      category: "Receptacles",
    });
    const db = await getDb();
    // What the seed writes on a sheet-priced row (the sheets are empty today).
    await db!
      .update(materials)
      .set({ isExamplePrice: true, isExampleLaborHours: true })
      .where(eq(materials.id, created!.id));

    await caller().materials.update({ id: created!.id, costPerUnit: 4 });
    let [row] = await db!
      .select()
      .from(materials)
      .where(eq(materials.id, created!.id));
    expect(row.isExamplePrice).toBe(true);

    await caller().materials.update({ id: created!.id, costPerUnit: 5 });
    [row] = await db!
      .select()
      .from(materials)
      .where(eq(materials.id, created!.id));
    expect(row.isExamplePrice).toBe(false);
    // A price edit is not an hours edit.
    expect(row.isExampleLaborHours).toBe(true);
  });

  // ─── 3. A line freezes what it was priced with ──────────────────────────

  async function exampleAssembly() {
    const material = await caller().materials.create({
      name: unique("Tagged line part"),
      unitOfSale: "each",
      costPerUnit: 10,
      category: "Receptacles",
    });
    const created = await caller().assemblies.create({
      name: unique("Tagged line assembly"),
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 1,
      laborRateId: (await journeyman()).id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    const db = await getDb();
    await db!
      .update(materials)
      .set({ isExamplePrice: true })
      .where(eq(materials.id, material!.id));
    await db!
      .update(assemblies)
      .set({ isExampleHours: true })
      .where(eq(assemblies.id, created!.id));
    return { assemblyId: created!.id, materialId: material!.id };
  }

  it("a line freezes all three flags, and a later library edit leaves it alone", async () => {
    const { assemblyId, materialId } = await exampleAssembly();
    const bid = await caller().bids.create({
      name: unique("Tagged tags bid"),
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 2 });

    let detail = await caller().bids.get({ id: bid!.id });
    expect(detail.lines).toHaveLength(1);
    const line = detail.lines[0];
    expect(line.snapshotPriceWasExample).toBe(true);
    expect(line.snapshotHoursWereExample).toBe(true);
    expect(line.snapshotLaborRateWasExample).toBe(true);

    // The shop now sets its own numbers in the library...
    await caller().materials.update({ id: materialId, costPerUnit: 12 });
    await caller().assemblies.update({ id: assemblyId, baseLaborHours: 1.5 });
    await caller().laborRates.update({
      id: (await journeyman()).id,
      hourlyCost: 66,
    });

    // ...and the old line still says what it was priced with.
    detail = await caller().bids.get({ id: bid!.id });
    expect(detail.lines[0].snapshotPriceWasExample).toBe(true);
    expect(detail.lines[0].snapshotHoursWereExample).toBe(true);
    expect(detail.lines[0].snapshotLaborRateWasExample).toBe(true);

    // A line added NOW is priced from the shop's numbers: no tags.
    const [assembly] = await (await getDb())!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, assemblyId));
    expect(assembly.isExampleHours).toBe(false);
    await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    detail = await caller().bids.get({ id: bid!.id });
    const fresh = detail.lines.find(l => l.id !== line.id)!;
    expect(fresh.snapshotPriceWasExample).toBe(false);
    expect(fresh.snapshotHoursWereExample).toBe(false);
    expect(fresh.snapshotLaborRateWasExample).toBe(false);
  });

  // ─── 4. The proposal counts them, for the print warning ─────────────────

  it("the proposal document counts example-priced lines, and only those", async () => {
    const { assemblyId } = await exampleAssembly();
    const bid = await caller().bids.create({
      name: unique("Tagged tags proposal"),
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 1 });

    const doc = await caller().proposals.document({ bidId: bid!.id });
    expect(doc.examples).toEqual({ lines: 1, price: 1, hours: 1, rate: 1 });
    // Nothing in the customer's document carries a flag or a tag's words.
    // (Fixture names avoid the word, so this can only find a tag.)
    expect(JSON.stringify(doc.document)).not.toMatch(
      /WasExample|isExample|Example (price|hours|rate)/
    );
  });
});
