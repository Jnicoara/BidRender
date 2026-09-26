/**
 * A labor rate is SHARED. Editing it moves every assembly that references it,
 * and there is no per-assembly override anywhere in the system.
 *
 * The subtle failure this suite exists for: editing a shipped starter role
 * FORKS it into a new row with a new id. Assemblies keep pointing at the old
 * id, and the merged library view hides the superseded starter — so a naive
 * lookup finds nothing and the assembly silently prices its labor at ZERO.
 * That is precisely what happens when someone adjusts a rate from the Assembly
 * Builder, which makes it the worst possible moment for it.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import { assemblies, bids, laborRates, users } from "../drizzle/schema";
import { hourlyCostFor, resolveLaborRate } from "../shared/laborRateLookup";
import type { TrpcContext } from "./_core/context";

const USER = 9191;
const OTHER_USER = 9192;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-rate-share-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** An assembly with fixed hours pointing at a named role. */
async function assemblyUsing(roleName: string, hours = 2) {
  const rates = await caller().laborRates.list();
  const role = rates.find(r => r.name === roleName)!;
  const created = await caller().assemblies.create({
    name: `Uses ${roleName} ${Date.now()}${Math.random()}`,
    category: "Devices",
    trade: "electrical",
    projectType: null,
    baseLaborHours: hours,
    laborRateId: role.id,
    materials: [],
    modifierIds: [],
  });
  return { assembly: created!, roleId: role.id };
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
        openId: `test-rate-share-${id}`,
        name: `Rate sharing test user ${id}`,
      });
    }
  }

  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

/**
 * Give the STARTER roles a real rate, on the shipped rows themselves.
 *
 * This suite is specifically about an assembly that points at an unforked
 * starter, and what happens when that starter is edited. Starter roles now ship
 * at $0, so without this every "before" figure is zero and the test can no
 * longer tell the regression it is named for — an assembly pricing at 0 because
 * the lookup failed — from an assembly pricing at 0 because the rate is 0.
 *
 * Written straight to the baseline rows rather than through the router, because
 * going through the router would FORK them and destroy the very setup under
 * test. Safe to leave behind: every suite that seeds labor rates re-stamps them
 * back to $0, so this cannot leak a rate into another file's expectations.
 */
async function rateTheStarters() {
  const db = await getDb();
  if (!db) return;
  for (const [name, hourlyCost] of [
    ["Journeyman", "38.0000"],
    ["Apprentice", "22.0000"],
  ]) {
    await db
      .update(laborRates)
      .set({ hourlyCost })
      .where(and(isNull(laborRates.userId), eq(laborRates.name, name)));
  }
}

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  await db
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER_USER]));
  await db
    .delete(laborRates)
    .where(inArray(laborRates.userId, [USER, OTHER_USER]));
  await rateTheStarters();
});

describe("resolveLaborRate", () => {
  const hourly = (
    over: Partial<Parameters<typeof hourlyCostFor>[0][number]> & { id: number }
  ) => ({
    baselineId: null,
    rateType: "hourly" as const,
    hourlyCost: "38",
    annualSalary: null,
    annualHours: null,
    ...over,
  });

  it("finds a rate by its own id", () => {
    const rates = [hourly({ id: 1 })];
    expect(resolveLaborRate(rates, 1)?.id).toBe(1);
  });

  it("follows a fork when the id points at a starter that was edited", () => {
    // The assembly still references 1; the user's fork of 1 is what they mean.
    const rates = [hourly({ id: 42, baselineId: 1, hourlyCost: "50" })];
    expect(resolveLaborRate(rates, 1)?.id).toBe(42);
    expect(hourlyCostFor(rates, 1)).toBeCloseTo(50, 4);
  });

  it("prefers the direct id over a fork of something else", () => {
    const rates = [
      hourly({ id: 1, hourlyCost: "38" }),
      hourly({ id: 42, baselineId: 1, hourlyCost: "50" }),
    ];
    expect(resolveLaborRate(rates, 1)?.id).toBe(1);
  });

  it("returns nothing for a null or unknown role", () => {
    expect(resolveLaborRate([hourly({ id: 1 })], null)).toBeUndefined();
    expect(resolveLaborRate([hourly({ id: 1 })], 999)).toBeUndefined();
    expect(hourlyCostFor([], 5)).toBe(0);
  });

  it("derives a salaried role's hourly cost", () => {
    const rates = [
      {
        id: 7,
        baselineId: null,
        rateType: "salary" as const,
        hourlyCost: "0",
        annualSalary: "60000",
        annualHours: "2080",
      },
    ];
    expect(hourlyCostFor(rates, 7)).toBeCloseTo(28.85, 2);
  });

  it("prices a salary with unusable hours at zero rather than throwing", () => {
    const rates = [
      {
        id: 7,
        baselineId: null,
        rateType: "salary" as const,
        hourlyCost: "0",
        annualSalary: "60000",
        annualHours: "0",
      },
    ];
    expect(hourlyCostFor(rates, 7)).toBe(0);
  });
});

describe.skipIf(!hasDb)("editing a rate moves every assembly using it", () => {
  it("reprices an assembly that references a STARTER role after the edit forks it", async () => {
    // The regression this suite is named for: before the fix, this priced at 0.
    const { assembly } = await assemblyUsing("Journeyman", 2);
    const before = await caller().assemblies.price({ id: assembly.id });
    expect(before.line.laborCost).toBeCloseTo(76, 2); // 2 h x $38

    const edited = await caller().laborRates.update({
      id: before.line
        ? (await caller().laborRates.list()).find(r => r.name === "Journeyman")!
            .id
        : 0,
      hourlyCost: 50,
    });
    expect(edited.forked).toBe(true); // a starter edit always forks

    const after = await caller().assemblies.price({ id: assembly.id });
    expect(after.line.laborCost).toBeCloseTo(100, 2); // 2 h x $50
    expect(after.laborRateMissing).toBe(false);
  });

  it("moves EVERY assembly on that role, not just the one being looked at", async () => {
    const a = await assemblyUsing("Journeyman", 1);
    const b = await assemblyUsing("Journeyman", 3);

    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 40,
    });

    const pricedA = await caller().assemblies.price({ id: a.assembly.id });
    const pricedB = await caller().assemblies.price({ id: b.assembly.id });
    expect(pricedA.line.laborCost).toBeCloseTo(40, 2);
    expect(pricedB.line.laborCost).toBeCloseTo(120, 2);
  });

  it("leaves assemblies on OTHER roles alone", async () => {
    const journeyman = await assemblyUsing("Journeyman", 1);
    const apprentice = await assemblyUsing("Apprentice", 1);

    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 99,
    });

    expect(
      (await caller().assemblies.price({ id: apprentice.assembly.id })).line
        .laborCost
    ).toBeCloseTo(22, 2);
    expect(
      (await caller().assemblies.price({ id: journeyman.assembly.id })).line
        .laborCost
    ).toBeCloseTo(99, 2);
  });

  it("carries through a kit's cost too", async () => {
    const { assembly } = await assemblyUsing("Journeyman", 2);
    const kit = await caller().kits.create({
      name: `Rate kit ${Date.now()}${Math.random()}`,
      items: [{ assemblyId: assembly.id, qty: 3 }],
    });
    const before = await caller().kits.price({ id: kit!.id });

    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 76,
    });

    const after = await caller().kits.price({ id: kit!.id });
    expect(after.totals.laborCost).toBeCloseTo(before.totals.laborCost * 2, 2);
  });

  it("does not leak one user's rate change into another user's assemblies", async () => {
    const { assembly } = await assemblyUsing("Journeyman", 1);
    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 90,
    });

    const theirRates = await callerFor(OTHER_USER).laborRates.list();
    expect(
      theirRates.find(r => r.name === "Journeyman")?.effectiveHourlyRate
    ).toBeCloseTo(38, 2);
    expect(
      (await caller().assemblies.price({ id: assembly.id })).line.laborCost
    ).toBeCloseTo(90, 2);
  });
});

describe.skipIf(!hasDb)("there is no per-assembly rate override", () => {
  it("an assembly stores a role REFERENCE, never a dollar amount", async () => {
    const { assembly, roleId } = await assemblyUsing("Journeyman", 1);
    const detail = await caller().assemblies.get({ id: assembly.id });

    expect(detail.laborRateId).toBe(roleId);
    // If a rate ever gets copied onto the assembly, this catches it.
    const keys = Object.keys(detail);
    expect(keys.filter(k => /rate|hourly|wage/i.test(k))).toEqual([
      "laborRateId",
    ]);
  });

  it("the update endpoint offers no way to set a rate on the assembly", async () => {
    const { assembly } = await assemblyUsing("Journeyman", 1);
    // Zod strips unknown keys, so this is accepted but must change nothing.
    //
    // Held in a variable rather than cast: TypeScript rejects extra keys only
    // on a FRESH literal, so a named object carries them to the endpoint while
    // `id` is still type-checked. It replaced `...({ … } as never)`, which
    // told the compiler to trust it and was itself an error (spreading never).
    const withRateKeys = {
      id: assembly.id,
      hourlyCost: 999,
      laborRate: 999,
      rateOverride: 999,
    };
    await caller().assemblies.update(withRateKeys);
    const priced = await caller().assemblies.price({ id: assembly.id });
    expect(priced.line.laborCost).toBeCloseTo(38, 2);
  });

  it("two assemblies on the same role always agree on the rate", async () => {
    const a = await assemblyUsing("Journeyman", 1);
    const b = await assemblyUsing("Journeyman", 1);
    const pricedA = await caller().assemblies.price({ id: a.assembly.id });
    const pricedB = await caller().assemblies.price({ id: b.assembly.id });
    expect(pricedA.laborRate).toBeCloseTo(pricedB.laborRate, 6);
  });
});

describe.skipIf(!hasDb)("already-snapshotted bids are untouched", () => {
  it("a bid line keeps the rate it was priced at when the role changes", async () => {
    const { assembly } = await assemblyUsing("Journeyman", 2);
    const bid = (await caller().bids.create({
      name: `Frozen ${Date.now()}${Math.random()}`,
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });
    const before = await caller().bids.get({ id: bid.id });

    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 500,
    });

    const after = await caller().bids.get({ id: bid.id });
    expect(after.totals.directCost).toBeCloseTo(before.totals.directCost, 6);
    expect(Number(after.lines[0].snapshotLaborRate)).toBeCloseTo(38, 2);
  });

  it("but a line added AFTER the edit snapshots the new rate", async () => {
    const { assembly } = await assemblyUsing("Journeyman", 2);
    const bid = (await caller().bids.create({
      name: `Mixed ${Date.now()}${Math.random()}`,
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    const rates = await caller().laborRates.list();
    await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 60,
    });
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 1,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const snapshots = detail.lines
      .map(l => Number(l.snapshotLaborRate))
      .sort((x, y) => x - y);
    expect(snapshots[0]).toBeCloseTo(38, 2);
    expect(snapshots[1]).toBeCloseTo(60, 2);
  });
});
