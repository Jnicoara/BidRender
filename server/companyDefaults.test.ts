/**
 * Company defaults, and the line between what they reach and what they cannot.
 *
 * ── The distinction these tests exist to pin ─────────────────────────────────
 * A bid line is a SNAPSHOT of the work: the material cost, labor hours, labor
 * rate and summed modifier percentage captured when the line was added. Nothing
 * at company level may ever move those. Re-pricing a material or editing an
 * assembly after the fact must leave a finished bid exactly where it was.
 *
 * Company pricing SETTINGS — overhead, profit, productivity — are a different
 * thing. They are not facts about the work, they are the terms the work is
 * priced under, and a bid inherits them rather than copying them. So changing
 * one DOES move an inheriting bid's price, on purpose, and a bid that should
 * stop following gets its own override.
 *
 * Both halves are asserted below, because "a company default change doesn't
 * retroactively alter already-snapshotted bids" is true of the snapshot and
 * false of the inherited total, and only stating both makes the boundary clear.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
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
  applyProductivityToHours,
  calculateLineItem,
  resolveBidPricingSettings,
  type CompanyPricingDefaults,
} from "../shared/pricing";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const hasDb = !!process.env.DATABASE_URL;
const USER = 9696;
dropFixtureUsersAfterAll([USER]);

const ctxFor = (id: number): TrpcContext =>
  ({ user: { id, role: "user" } }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

const COMPANY: CompanyPricingDefaults = {
  overheadEnabled: false,
  overheadMode: "percentage",
  overheadValue: 0,
  profitMethod: "markup",
  profitValue: 0,
  productivityPct: 0,
};

// ─── The productivity factor as arithmetic ────────────────────────────────────

describe("productivity factor", () => {
  it("does nothing at 0, which is what it ships at", () => {
    expect(applyProductivityToHours(10, 0).hours).toBe(10);
    expect(applyProductivityToHours(10).hours).toBe(10);
  });

  it("adjusts hours up and down", () => {
    expect(applyProductivityToHours(10, 0.1).hours).toBeCloseTo(11, 10);
    expect(applyProductivityToHours(10, -0.2).hours).toBeCloseTo(8, 10);
  });

  it("is applied AFTER modifiers, as a separate step", () => {
    // 10 h, +25% of job conditions, then +10% company productivity.
    // Separate steps:  10 × 1.25 × 1.10 = 13.75
    // If it were summed into the modifiers: 10 × 1.35 = 13.5
    // The two differ, which is exactly why the distinction has to be kept.
    const line = calculateLineItem({
      materials: [],
      baseLaborHours: 10,
      modifiers: [{ laborAdjustmentPct: 0.25 }],
      laborRate: 100,
      productivityPct: 0.1,
    });

    expect(line.adjustedLaborHours).toBeCloseTo(13.75, 10);
    expect(line.adjustedLaborHours).not.toBeCloseTo(13.5, 10);
  });

  it("never folds itself into the modifier total", () => {
    // The breakdown has to keep them apart, or an estimator cannot tell what
    // the job's conditions cost from what the company's calibration cost.
    const line = calculateLineItem({
      materials: [],
      baseLaborHours: 10,
      modifiers: [{ laborAdjustmentPct: 0.25 }],
      laborRate: 100,
      productivityPct: 0.1,
    });

    expect(line.modifierPct).toBeCloseTo(0.25, 10);
    expect(line.productivityPct).toBeCloseTo(0.1, 10);
    expect(line.hoursAfterModifiers).toBeCloseTo(12.5, 10);
  });

  it("leaves the stored base hours alone", () => {
    // Non-destructive: it multiplies at calculation time and writes nothing.
    // Turning it off has to return the number to exactly where it was.
    const input = {
      materials: [],
      baseLaborHours: 10,
      modifiers: [{ laborAdjustmentPct: 0.25 }],
      laborRate: 100,
    };
    const adjusted = calculateLineItem({ ...input, productivityPct: 0.4 });
    const off = calculateLineItem({ ...input, productivityPct: 0 });

    expect(input.baseLaborHours).toBe(10);
    expect(off.adjustedLaborHours).toBeCloseTo(12.5, 10);
    expect(adjusted.adjustedLaborHours).toBeCloseTo(17.5, 10);
  });

  it("clamps at zero rather than pricing negative hours", () => {
    const line = applyProductivityToHours(10, -1.5);
    expect(line.hours).toBe(0);
    expect(line.clamped).toBe(true);
  });
});

// ─── Inheritance ──────────────────────────────────────────────────────────────

describe("resolving productivity between company and bid", () => {
  it("inherits the company factor when the bid says nothing", () => {
    const settings = resolveBidPricingSettings(
      { ...COMPANY, productivityPct: 0.15 },
      {}
    );
    expect(settings.productivityPct).toBeCloseTo(0.15, 10);
    expect(settings.productivitySource).toBe("company");
  });

  it("takes the bid's own factor when it has one", () => {
    const settings = resolveBidPricingSettings(
      { ...COMPANY, productivityPct: 0.15 },
      { productivityPct: -0.05 }
    );
    expect(settings.productivityPct).toBeCloseTo(-0.05, 10);
    expect(settings.productivitySource).toBe("bid");
  });

  it("treats an explicit zero on the bid as an override, not as absence", () => {
    // The distinction a nullable column exists for: "no adjustment on this
    // bid" has to survive the company default moving, and 0 is a real answer.
    const settings = resolveBidPricingSettings(
      { ...COMPANY, productivityPct: 0.15 },
      { productivityPct: 0 }
    );
    expect(settings.productivityPct).toBe(0);
    expect(settings.productivitySource).toBe("bid");
  });

  it("resolves on its own, without disturbing overhead or profit", () => {
    const settings = resolveBidPricingSettings(
      {
        ...COMPANY,
        overheadEnabled: true,
        overheadValue: 0.1,
        profitValue: 0.2,
        productivityPct: 0.15,
      },
      { productivityPct: 0.5 }
    );
    expect(settings.productivitySource).toBe("bid");
    expect(settings.overheadSource).toBe("company");
    expect(settings.profitSource).toBe("company");
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

describe.skipIf(!hasDb)("changing a company default", () => {
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
        openId: `test-company-defaults-${USER}`,
        name: "Company defaults test user",
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

    // A priced material and a real rate, so the numbers below are not all zero.
    const material = await caller().materials.create({
      name: `Company defaults probe ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    const created = await caller().assemblies.create({
      name: `Company defaults assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 2,
      laborRateId: journeyman.laborRate!.id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    assemblyId = created!.id;
  });

  async function bidWithOneLine() {
    const bid = await caller().bids.create({
      name: `Company defaults bid ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 1 });
    return bid!;
  }

  it("never rewrites the snapshot on an existing line", async () => {
    // The guarantee the whole snapshot design exists for. Whatever happens to
    // company settings, the frozen record of the WORK is untouched.
    const bid = await bidWithOneLine();
    const before = await caller().bids.get({ id: bid.id });
    const line = before.lines[0];

    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.25,
      profitMethod: "margin",
      profitValue: 0.3,
      productivityPct: 0.5,
    });

    const after = await caller().bids.get({ id: bid.id });
    const sameLine = after.lines[0];

    expect(sameLine.snapshotMaterialCost).toBe(line.snapshotMaterialCost);
    expect(sameLine.snapshotLaborHours).toBe(line.snapshotLaborHours);
    expect(sameLine.snapshotLaborRate).toBe(line.snapshotLaborRate);
    expect(sameLine.snapshotModifierPct).toBe(line.snapshotModifierPct);
    expect(sameLine.snapshotAt).toEqual(line.snapshotAt);
  });

  it("does move the price of a bid still set to inherit", async () => {
    // The other half, and the one people do not expect: settings are inherited,
    // not copied. Asserted so nobody later "fixes" it into a copy and silently
    // freezes every bid at the settings it was created under.
    const bid = await bidWithOneLine();
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.setPricingDefaults({ productivityPct: 0.5 });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.settings.productivitySource).toBe("company");
    expect(after.totals.totalLaborHours).toBeCloseTo(
      before.totals.totalLaborHours * 1.5,
      4
    );
    expect(after.totals.directCost).toBeGreaterThan(before.totals.directCost);
  });

  it("leaves a bid with its own override completely alone", async () => {
    const bid = await bidWithOneLine();
    await caller().bids.update({ id: bid.id, productivityPct: 0 });
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.setPricingDefaults({ productivityPct: 0.5 });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.settings.productivitySource).toBe("bid");
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 4);
  });

  it("ships at no adjustment for an account that has set nothing", async () => {
    const bid = await bidWithOneLine();
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.productivityPct).toBe(0);
    // 2 h at qty 1, no modifiers, no productivity.
    expect(detail.totals.totalLaborHours).toBeCloseTo(2, 4);
  });

  it("reports the hours before and after the factor, so a breakdown can show both", async () => {
    // The breakdown shows "18.55 h after modifiers, +10% productivity" rather
    // than a total that silently disagrees with the hours on the assemblies.
    // That needs both figures on the same footing — at quantity — or the two
    // numbers on screen are not comparable.
    const bid = await bidWithOneLine();
    await caller().bids.setPricingDefaults({ productivityPct: 0.25 });

    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.totals.laborHoursBeforeProductivity).toBeCloseTo(2, 4);
    expect(detail.totals.totalLaborHours).toBeCloseTo(2.5, 4);
    expect(detail.totals.totalLaborHours).toBeCloseTo(
      detail.totals.laborHoursBeforeProductivity * 1.25,
      4
    );
  });

  it("reports identical before/after hours when the factor is off", async () => {
    // So the UI can hide the extra row on the common case by comparing the
    // factor to zero, and the two numbers never disagree when it does.
    const bid = await bidWithOneLine();
    const detail = await caller().bids.get({ id: bid.id });
    expect(detail.settings.productivityPct).toBe(0);
    expect(detail.totals.laborHoursBeforeProductivity).toBeCloseTo(
      detail.totals.totalLaborHours,
      6
    );
  });

  it("scales the before-productivity hours by quantity, like the total does", async () => {
    // hoursAfterModifiers is per-unit on the engine's breakdown; the total has
    // to multiply it out or the comparison is wrong by the line quantity.
    const bid = await caller().bids.create({
      name: `Qty bid ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({ bidId: bid!.id, assemblyId, qty: 3 });
    await caller().bids.setPricingDefaults({ productivityPct: 0.5 });

    const detail = await caller().bids.get({ id: bid!.id });
    expect(detail.totals.laborHoursBeforeProductivity).toBeCloseTo(6, 4); // 2 h × 3
    expect(detail.totals.totalLaborHours).toBeCloseTo(9, 4); // × 1.5
  });

  it("keeps overhead and profit changes off the snapshot too", async () => {
    const bid = await bidWithOneLine();
    const before = await caller().bids.get({ id: bid.id });

    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
    });

    const after = await caller().bids.get({ id: bid.id });
    // Direct cost is the sum of the snapshots, so it must not move at all —
    // overhead applies on top of it, not inside it.
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 4);
    expect(after.totals.costWithOverhead).toBeGreaterThan(
      before.totals.costWithOverhead
    );
  });
});
