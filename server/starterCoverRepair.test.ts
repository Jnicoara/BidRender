/**
 * The cover-swap repair (server/starterCoverRepair.ts), run on the test
 * database — never staging or live.
 *
 * Every swapped starter's shared row is put on its OLD recipe by hand first,
 * because what it holds depends on when this database was seeded (a fresh one
 * has the new covers already). Their lines are restored afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
  setAssemblyMaterials,
} from "./db";
import {
  assemblies,
  assemblyMaterials,
  materials,
  users,
} from "../drizzle/schema";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { STARTER_COVER_SWAPS, wasRecipe } from "./seed/starterCoverSwaps";
import { starterPartName } from "./seed/starterParts";
import type { BaselineAssemblyMaterial } from "./seed/assemblyRecipe";
import { repairStarterCovers } from "./starterCoverRepair";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 6231;
dropFixtureUsersAfterAll([COMPANY]);
const hasDb = Boolean(process.env.DATABASE_URL);

type Line = typeof assemblyMaterials.$inferSelect;
const saved = new Map<number, Line[]>();
const ids = new Map<string, number>();
const REFS = STARTER_COVER_SWAPS.map(s => s.ref);
const spec = (ref: string) => BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;

async function linesOf(assemblyId: number) {
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(assemblyMaterials)
    .where(eq(assemblyMaterials.assemblyId, assemblyId));
  return rows.sort((a, b) => a.id - b.id);
}

/** The recipe as `name|qty|whip`, order-free, for comparing. */
async function recipeOf(assemblyId: number) {
  const db = (await getDb())!;
  const rows = await db
    .select({
      name: materials.name,
      qty: assemblyMaterials.qty,
      whip: assemblyMaterials.isBranchWhip,
    })
    .from(assemblyMaterials)
    .innerJoin(materials, eq(materials.id, assemblyMaterials.materialId))
    .where(eq(assemblyMaterials.assemblyId, assemblyId));
  return rows.map(r => `${r.name}|${r.qty}|${r.whip}`).sort();
}

const asRecipe = (lines: readonly BaselineAssemblyMaterial[]) =>
  lines
    .map(
      l =>
        `${starterPartName(l.part)}|${l.qty.toFixed(4)}|${l.branchWhip ?? false}`
    )
    .sort();

async function setRecipe(ref: string, lines: BaselineAssemblyMaterial[]) {
  const db = (await getDb())!;
  const out = [];
  for (const l of lines) {
    const [m] = await db
      .select({ id: materials.id })
      .from(materials)
      .where(
        and(
          isNull(materials.userId),
          eq(materials.name, starterPartName(l.part))
        )
      )
      .limit(1);
    out.push({
      materialId: m.id,
      qty: l.qty.toFixed(4),
      isBranchWhip: l.branchWhip ?? false,
    });
  }
  await setAssemblyMaterials(ids.get(ref)!, out);
}

const outcomes = (results: { ref: string; outcome: string }[]) =>
  new Set(results.map(r => r.outcome));

describe.skipIf(!hasDb)("the starter cover repair", () => {
  let forkId = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-cover-repair-${COMPANY}`,
        name: "Cover repair company",
      });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();

    for (const ref of REFS) {
      const [row] = await db
        .select({ id: assemblies.id })
        .from(assemblies)
        .where(
          and(isNull(assemblies.userId), eq(assemblies.name, spec(ref).name))
        )
        .limit(1);
      expect(row, `${ref} is seeded`).toBeDefined();
      ids.set(ref, row.id);
      saved.set(row.id, await linesOf(row.id));
      await setRecipe(ref, wasRecipe(ref, spec(ref).materials));
    }

    // A company's fork of DV1, on the old recipe like a real one would be.
    const [fork] = await db.insert(assemblies).values({
      userId: COMPANY,
      baselineId: ids.get("DV1")!,
      baselineVersion: 1,
      name: spec("DV1").name,
      category: "Devices",
      projectType: "both",
      baseLaborHours: "0.7500",
    });
    forkId = fork.insertId;
    await setAssemblyMaterials(
      forkId,
      (await linesOf(ids.get("DV1")!)).map(l => ({
        materialId: l.materialId,
        qty: l.qty,
        isBranchWhip: l.isBranchWhip,
      }))
    );
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));
    for (const [assemblyId, lines] of Array.from(saved.entries())) {
      await setAssemblyMaterials(
        assemblyId,
        lines.map(l => ({
          materialId: l.materialId,
          qty: l.qty,
          overrideLaborHours: l.overrideLaborHours,
          isBranchWhip: l.isBranchWhip,
        }))
      );
    }
  });

  it("reports and writes NOTHING without --apply", async () => {
    const before = await recipeOf(ids.get("RS5")!);
    const results = await repairStarterCovers({ apply: false });
    expect(results.map(r => r.ref)).toEqual(REFS);
    expect(outcomes(results)).toEqual(new Set(["would swap"]));
    expect(await recipeOf(ids.get("RS5")!)).toEqual(before);
  });

  it("swaps every old recipe to the new covers, and leaves a company's fork alone", async () => {
    const forkLines = await linesOf(forkId);
    const results = await repairStarterCovers({ apply: true });
    expect(outcomes(results)).toEqual(new Set(["swapped"]));
    // Forked (this suite's fork, plus any other on this database) and
    // swapped anyway — see "A forked starter IS swapped".
    expect(results.find(r => r.ref === "DV1")!.detail).toMatch(
      /\d+ compan(y's copy is left as it is|ies' copies are left as they are)/
    );
    for (const ref of REFS)
      expect(await recipeOf(ids.get(ref)!), ref).toEqual(
        asRecipe(spec(ref).materials)
      );
    // Spot checks in the catalog's own words.
    expect(await recipeOf(ids.get("CS6")!)).toContain(
      '4" square raised cover, single receptacle|1.0000|false'
    );
    expect(await recipeOf(ids.get("RS5")!)).toEqual(
      expect.arrayContaining([
        "1-gang wall plate, duplex, nylon|1.0000|false",
        "1-gang wall plate, toggle, nylon|1.0000|false",
      ])
    );
    expect(await linesOf(forkId)).toEqual(forkLines);
  });

  it("keeps the cover on the line it replaced", async () => {
    const lines = await linesOf(ids.get("DV4")!);
    const order = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
    const names = spec("DV4").materials.map(l => starterPartName(l.part));
    const db = (await getDb())!;
    const byId = new Map(
      (
        await db
          .select({ id: materials.id, name: materials.name })
          .from(materials)
      ).map(m => [m.id, m.name])
    );
    expect(order.map(l => byId.get(l.materialId))).toEqual(names);
  });

  it("is repeatable: a second run changes nothing", async () => {
    const before = await linesOf(ids.get("RS1")!);
    const results = await repairStarterCovers({ apply: true });
    expect(outcomes(results)).toEqual(new Set(["already has it"]));
    expect(await linesOf(ids.get("RS1")!)).toEqual(before);
  });

  it("skips a shared row somebody edited", async () => {
    const old = wasRecipe("DV2", spec("DV2").materials).map(l =>
      l.part === "wire-nuts" ? { ...l, qty: 5 } : l
    );
    await setRecipe("DV2", old);
    const before = await linesOf(ids.get("DV2")!);
    const results = await repairStarterCovers({ apply: true });
    const dv2 = results.find(r => r.ref === "DV2")!;
    expect(dv2.outcome).toBe("skipped: edited");
    expect(await linesOf(ids.get("DV2")!)).toEqual(before);
  });
});
