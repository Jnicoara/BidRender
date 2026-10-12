/**
 * THE PINNING PREMISE, MEASURED (references/baseline-screen-plan.md § 2,
 * "To prove, not assume").
 *
 * The plan's whole mechanism rests on one claim: giving a company its own
 * copy of a starter row AS IT STANDS (a fork, with the existing
 * `forkMaterial` / `forkAssembly` / `forkLaborRate` / `forkModifier`) moves
 * nothing that company sees, because every stored id already resolves to the
 * company's fork (`resolveForkedRow`). If that were false, pinning — the step
 * that protects companies from a starter change — would itself move their
 * numbers.
 *
 * So: a company with a bid on a starter assembly reads its bid, its recipes,
 * its library and its run types; then EVERY active starter material, labor
 * rate, modifier and assembly is forked for it; then it reads them all again.
 * Everything must be identical — same totals, same recipe lines and prices,
 * one row per item in each list (a fork replaces its starter, it is never
 * listed beside it).
 *
 * `isPinnedCopy` (BS-M5) is not applied yet, so these forks look like the
 * company's own copies. That changes which badge a screen shows, never a
 * number, and the numbers are what this measures.
 *
 * Fixture user 9814 is this file's own.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  forkAssembly,
  forkLaborRate,
  forkMaterial,
  forkModifier,
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
  materials,
  modifiers,
  pricingDefaults,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9814;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-starter-pinning-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-starter-pinning-${USER}`,
      name: "Starter pinning fixture",
    });
  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(eq(bids.userId, USER));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
  await database.delete(modifiers).where(eq(modifiers.userId, USER));
  await database
    .delete(pricingDefaults)
    .where(eq(pricingDefaults.userId, USER));
});

/** Everything this company can see that a pin could move, by name. */
async function snapshot(bidId: number) {
  const bid = await caller().bids.get({ id: bidId });
  const library = await caller().assemblies.list();
  const prices: Record<string, number> = {};
  const recipes: Record<string, string[]> = {};
  for (const a of library) {
    prices[a.name] = (
      await caller().assemblies.price({ id: a.id, quantity: 1 })
    ).line.costWithMarkup;
    const detail = await caller().assemblies.get({ id: a.id });
    // Name, quantity AND the part's price: a part resolving to the wrong row
    // shows as money here, not only as a name.
    recipes[a.name] = detail.materials
      .map(m => `${m.name} x ${Number(m.qty)} @ ${Number(m.costPerUnit)}`)
      .sort();
  }
  const rates = (await caller().laborRates.list())
    .map(r => `${r.name} ${Number(r.hourlyCost)}`)
    .sort();
  const runTypes = (await caller().takeoffRunTypes.list())
    .map(t => t.label)
    .sort();
  return {
    totals: bid.totals,
    lines: bid.lines.map(l => ({
      name: l.name,
      qty: Number(l.qty),
      cost: l.breakdown?.costWithMarkup ?? null,
    })),
    libraryNames: library.map(a => a.name).sort(),
    prices,
    recipes,
    rates,
    runTypes,
  };
}

describe.skipIf(!hasDb)(
  "pinning a company to the starter moves nothing (§ 2)",
  () => {
    it("forks every starter row; bids, recipes, prices and lists read the same", async () => {
      // A bid on a starter assembly, with a priced part so a wrong resolution
      // would show as money, not just as a name.
      const list = await caller().assemblies.list();
      const starter = list.find(a => a.name === "Duplex receptacle standard")!;
      const bid = (await caller().bids.create({
        name: `Pinning ${Date.now()}`,
        trades: ["electrical"],
      }))!;
      await caller().bids.addAssembly({
        bidId: bid.id,
        assemblyId: starter.id,
        qty: 3,
      });

      const before = await snapshot(bid.id);

      const database = (await getDb())!;
      const shared = <T extends { id: number }>(rows: T[]) =>
        rows.map(r => r.id);
      const [mats, rates, mods, asms] = await Promise.all([
        database
          .select({ id: materials.id })
          .from(materials)
          .where(and(isNull(materials.userId), eq(materials.isActive, true))),
        database
          .select({ id: laborRates.id })
          .from(laborRates)
          .where(and(isNull(laborRates.userId), eq(laborRates.isActive, true))),
        database
          .select({ id: modifiers.id })
          .from(modifiers)
          .where(and(isNull(modifiers.userId), eq(modifiers.isActive, true))),
        database
          .select({ id: assemblies.id })
          .from(assemblies)
          .where(and(isNull(assemblies.userId), eq(assemblies.isActive, true))),
      ]);
      // Measured, not assumed: there is something to pin.
      expect(mats.length).toBeGreaterThan(100);
      expect(asms.length).toBeGreaterThan(0);
      for (const id of shared(mats)) await forkMaterial(id, USER);
      for (const id of shared(rates)) await forkLaborRate(id, USER);
      for (const id of shared(mods)) await forkModifier(id, USER);
      for (const id of shared(asms)) await forkAssembly(id, USER);

      expect(await snapshot(bid.id)).toEqual(before);

      /*
        The point of pinning: AFTER it, the starter changes and this company
        sees nothing move. A fork is a copy of the same values, so the check
        above alone would pass with fork resolution broken; this one cannot.
        The starter assembly's parts get a new price, its hours change, and
        every starter labor rate changes — then all of it is put back, because
        these are shared rows the rest of the suite reads.
      */
      const detail = await caller().assemblies.get({ id: starter.id });
      const partNames = new Set(detail.materials.map(m => m.name));
      const [starterRow] = await database
        .select()
        .from(assemblies)
        .where(
          and(
            isNull(assemblies.userId),
            eq(assemblies.name, "Duplex receptacle standard")
          )
        );
      const partRows = (
        await database
          .select({
            id: materials.id,
            name: materials.name,
            cost: materials.costPerUnit,
          })
          .from(materials)
          .where(isNull(materials.userId))
      ).filter(r => partNames.has(r.name));
      const rateRows = await database
        .select({ id: laborRates.id, cost: laborRates.hourlyCost })
        .from(laborRates)
        .where(isNull(laborRates.userId));
      expect(partRows.length).toBeGreaterThan(0);
      try {
        for (const r of partRows)
          await database
            .update(materials)
            .set({ costPerUnit: (Number(r.cost) + 7).toFixed(4) })
            .where(eq(materials.id, r.id));
        for (const r of rateRows)
          await database
            .update(laborRates)
            .set({ hourlyCost: (Number(r.cost) + 11).toFixed(4) })
            .where(eq(laborRates.id, r.id));
        await database
          .update(assemblies)
          .set({
            baseLaborHours: (
              Number(starterRow.baseLaborHours ?? 0) + 1
            ).toFixed(4),
          })
          .where(eq(assemblies.id, starterRow.id));

        expect(await snapshot(bid.id)).toEqual(before);
      } finally {
        for (const r of partRows)
          await database
            .update(materials)
            .set({ costPerUnit: r.cost })
            .where(eq(materials.id, r.id));
        for (const r of rateRows)
          await database
            .update(laborRates)
            .set({ hourlyCost: r.cost })
            .where(eq(laborRates.id, r.id));
        await database
          .update(assemblies)
          .set({ baseLaborHours: starterRow.baseLaborHours })
          .where(eq(assemblies.id, starterRow.id));
      }
    }, 300_000);
  }
);
