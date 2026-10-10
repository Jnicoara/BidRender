/**
 * The starter repair for the catalog reality check
 * (server/starterRetiredRepair.ts), run on the test database — never staging
 * or live.
 *
 * Each touched starter's shared row is put on its PRE-CHECK recipe by hand
 * first, because a fresh test database seeds the new recipe. The retired
 * rows that recipe points at do not exist on a fresh database either, so
 * they are inserted as shared, retired stand-ins when missing — exactly what
 * an old database holds — and removed afterwards, with the lines restored.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
  setAssemblyMaterials,
} from "./db";
import { assemblies, assemblyMaterials, materials } from "../drizzle/schema";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { starterPartName } from "./seed/starterParts";
import { RENAMED_BASELINE_MATERIALS } from "../shared/renamedMaterials";
import {
  RETIRED_PART_REPOINTS,
  recipeBeforeCheck,
  repairStarterRetired,
} from "./starterRetiredRepair";

const hasDb = Boolean(process.env.DATABASE_URL);
const TOUCHED = BASELINE_ASSEMBLIES.filter(
  a => recipeBeforeCheck(a.materials) !== null
);

type Line = typeof assemblyMaterials.$inferSelect;
const saved = new Map<number, Line[]>();
const rowIdOf = new Map<string, number>();
const insertedStandIns: number[] = [];

async function sharedId(name: string): Promise<number> {
  const db = (await getDb())!;
  const [m] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)))
    .limit(1);
  return m.id;
}

/** The starter's lines as `name|qty|whip`, order-free. */
async function recipeOf(assemblyId: number): Promise<string[]> {
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

const newRecipe = (ref: string) =>
  BASELINE_ASSEMBLIES.find(a => a.ref === ref)!
    .materials.map(
      l =>
        `${starterPartName(l.part)}|${l.qty.toFixed(4)}|${l.branchWhip ?? false}`
    )
    .sort();

async function putOnOldRecipe(ref: string) {
  const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
  const before = recipeBeforeCheck(spec.materials)!;
  const lines = [];
  for (const l of before.recipe)
    lines.push({
      materialId: await sharedId(l.name),
      qty: l.qty.toFixed(4),
      isBranchWhip: l.whip,
    });
  await setAssemblyMaterials(rowIdOf.get(ref)!, lines);
}

describe.skipIf(!hasDb)("the catalog reality check's starter repair", () => {
  beforeAll(async () => {
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();
    const db = (await getDb())!;

    // An old database still holds the retired rows: add stand-ins where a
    // fresh one has none, shared and retired, as the seed would leave them.
    for (const { wasName } of Object.values(RETIRED_PART_REPOINTS)) {
      const name = RENAMED_BASELINE_MATERIALS[wasName] ?? wasName;
      const [found] = await db
        .select({ id: materials.id })
        .from(materials)
        .where(and(isNull(materials.userId), eq(materials.name, name)))
        .limit(1);
      if (found) continue;
      const [res] = await db.insert(materials).values({
        userId: null,
        name,
        unitOfSale: "each",
        costPerUnit: "0.0000",
        category: "Consumables",
        searchAliases: "",
        isActive: false,
      });
      insertedStandIns.push(res.insertId);
    }

    const rows = await db
      .select({ id: assemblies.id, name: assemblies.name })
      .from(assemblies)
      .where(
        and(
          isNull(assemblies.userId),
          inArray(
            assemblies.name,
            TOUCHED.map(a => a.name)
          )
        )
      );
    for (const spec of TOUCHED) {
      const row = rows.find(r => r.name === spec.name)!;
      rowIdOf.set(spec.ref, row.id);
      saved.set(
        row.id,
        await db
          .select()
          .from(assemblyMaterials)
          .where(eq(assemblyMaterials.assemblyId, row.id))
      );
      await putOnOldRecipe(spec.ref);
    }
  });

  afterAll(async () => {
    const db = (await getDb())!;
    for (const [assemblyId, lines] of Array.from(saved)) {
      await db
        .delete(assemblyMaterials)
        .where(eq(assemblyMaterials.assemblyId, assemblyId));
      if (lines.length > 0)
        await db
          .insert(assemblyMaterials)
          .values(lines.map(({ id: _id, ...rest }) => rest));
    }
    if (insertedStandIns.length > 0)
      await db.delete(materials).where(inArray(materials.id, insertedStandIns));
  });

  it("covers the 10 retired-row lines, PG15's lug and the two labels: 13 starters", () => {
    expect(TOUCHED.map(a => a.ref).sort()).toEqual(
      [
        "PG1",
        "DV33",
        "DV34",
        "RS13",
        "PG15",
        "PG16",
        "PG20",
        "DR2",
        "MS5",
        "GR3",
        "CW3",
        "CW4",
        "CW11",
      ].sort()
    );
  });

  it("reports first, writes nothing, and names every change", async () => {
    const before = await recipeOf(rowIdOf.get("PG16")!);
    const results = await repairStarterRetired({ apply: false });
    expect(results.filter(r => r.outcome === "would repoint")).toHaveLength(13);
    expect(await recipeOf(rowIdOf.get("PG16")!)).toEqual(before);
    expect(results.find(r => r.ref === "PG16")!.detail).toContain(
      'Trapeze hanger kit -> 1-5/8" x 1-5/8" strut channel, 10 ft x0.4'
    );
  });

  it("puts every starter on its seed recipe, and a second run changes nothing", async () => {
    const results = await repairStarterRetired({ apply: true });
    expect(results.filter(r => r.outcome === "repointed")).toHaveLength(13);
    for (const spec of TOUCHED)
      expect(await recipeOf(rowIdOf.get(spec.ref)!), spec.ref).toEqual(
        newRecipe(spec.ref)
      );
    const again = await repairStarterRetired({ apply: true });
    expect(new Set(again.map(r => r.outcome))).toEqual(
      new Set(["already has it"])
    );
  });

  it("leaves a starter somebody changed by hand exactly as it is", async () => {
    await putOnOldRecipe("GR3");
    const db = (await getDb())!;
    const [line] = await db
      .select()
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, rowIdOf.get("GR3")!))
      .limit(1);
    await db
      .update(assemblyMaterials)
      .set({ qty: "7.0000" })
      .where(eq(assemblyMaterials.id, line.id));
    const edited = await recipeOf(rowIdOf.get("GR3")!);
    const results = await repairStarterRetired({ apply: true });
    expect(results.find(r => r.ref === "GR3")!.outcome).toBe("skipped: edited");
    expect(await recipeOf(rowIdOf.get("GR3")!)).toEqual(edited);
  });
});
