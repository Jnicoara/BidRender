/**
 * The LT1/LT2 fixture-line repair (server/starterFixtureRepair.ts), run on the
 * test database — never staging or live.
 *
 * The shared LT1 and LT2 rows are put into each state by hand first, because
 * what they hold depends on when this database was seeded (a fresh one has the
 * new recipe already). Their lines are restored afterwards.
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
import { starterPartName } from "./seed/starterParts";
import { repairStarterFixtureLines } from "./starterFixtureRepair";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 6216;
dropFixtureUsersAfterAll([COMPANY]);
const hasDb = Boolean(process.env.DATABASE_URL);

type Line = typeof assemblyMaterials.$inferSelect;
const saved = new Map<number, Line[]>();
const ids: Record<"LT1" | "LT2", number> = { LT1: 0, LT2: 0 };

async function linesOf(assemblyId: number) {
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(assemblyMaterials)
    .where(eq(assemblyMaterials.assemblyId, assemblyId));
  return rows.sort((a, b) => a.id - b.id);
}

/** The recipe as `{ name, qty, whip }`, order-free, for comparing. */
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

function specRecipe(ref: "LT1" | "LT2", withFixture: boolean) {
  const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
  return spec.materials
    .filter(l => withFixture || !l.fixture)
    .map(
      l =>
        `${starterPartName(l.part)}|${l.qty.toFixed(4)}|${l.branchWhip ?? false}`
    )
    .sort();
}

/** Put a shared starter back on the OLD shipped recipe (no fixture line). */
async function setOldRecipe(
  ref: "LT1" | "LT2",
  tweak?: (qty: number) => number
) {
  const db = (await getDb())!;
  const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
  const lines = [];
  for (const l of spec.materials.filter(l => !l.fixture)) {
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
    lines.push({
      materialId: m.id,
      qty: (tweak ? tweak(l.qty) : l.qty).toFixed(4),
      isBranchWhip: l.branchWhip ?? false,
    });
  }
  await setAssemblyMaterials(ids[ref], lines);
}

describe.skipIf(!hasDb)("the LT1/LT2 fixture-line repair", () => {
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
        openId: `test-fixture-repair-${COMPANY}`,
        name: "Fixture repair company",
      });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
    await seedBaselineModifiers();
    await seedBaselineAssemblies();

    for (const ref of ["LT1", "LT2"] as const) {
      const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
      const [row] = await db
        .select({ id: assemblies.id })
        .from(assemblies)
        .where(and(isNull(assemblies.userId), eq(assemblies.name, spec.name)))
        .limit(1);
      ids[ref] = row.id;
      saved.set(row.id, await linesOf(row.id));
      // Precondition: only THIS suite's fork exists, or the cases below are
      // about somebody else's data.
      const others = await db
        .select({ id: assemblies.id })
        .from(assemblies)
        .where(eq(assemblies.baselineId, row.id));
      expect(others, `${ref} already has forks in this database`).toEqual([]);
      await setOldRecipe(ref);
    }

    // A company's fork of LT2, on the old recipe like a real one would be.
    const [fork] = await db.insert(assemblies).values({
      userId: COMPANY,
      baselineId: ids.LT2,
      baselineVersion: 1,
      name: "Ceiling fan standard",
      category: "Lighting",
      projectType: "residential",
      baseLaborHours: "2.0000",
    });
    forkId = fork.insertId;
    const shared = await linesOf(ids.LT2);
    await setAssemblyMaterials(
      forkId,
      shared.map(l => ({
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
    const before = await linesOf(ids.LT1);
    const results = await repairStarterFixtureLines({ apply: false });
    expect(results.map(r => [r.ref, r.outcome])).toEqual([
      ["LT1", "would add"],
      ["LT2", "skipped: forked"],
    ]);
    expect(await linesOf(ids.LT1)).toEqual(before);
  });

  it("adds the fixture to the unforked row only; the forked row and the fork stay byte-identical", async () => {
    const sharedLT2 = await linesOf(ids.LT2);
    const forkLines = await linesOf(forkId);
    const db = (await getDb())!;
    const [forkHead] = await db
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, forkId));

    const results = await repairStarterFixtureLines({ apply: true });
    expect(results.map(r => [r.ref, r.outcome])).toEqual([
      ["LT1", "added"],
      ["LT2", "skipped: forked"],
    ]);
    expect(await recipeOf(ids.LT1)).toEqual(specRecipe("LT1", true));
    expect(await recipeOf(ids.LT1)).toContain(
      "Surface-mount ceiling fixture|1.0000|false"
    );
    expect(await linesOf(ids.LT2)).toEqual(sharedLT2);
    expect(await linesOf(forkId)).toEqual(forkLines);
    const [forkAfter] = await db
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, forkId));
    expect(forkAfter).toEqual(forkHead);
  });

  it("is repeatable: a second run changes nothing", async () => {
    const before = await linesOf(ids.LT1);
    const results = await repairStarterFixtureLines({ apply: true });
    expect(results.map(r => [r.ref, r.outcome])).toEqual([
      ["LT1", "already has it"],
      ["LT2", "skipped: forked"],
    ]);
    expect(await linesOf(ids.LT1)).toEqual(before);
  });

  it("skips and logs a shared row somebody edited", async () => {
    // Old recipe with one quantity changed — not the shipped recipe.
    await setOldRecipe("LT1", qty => (qty === 3 ? 5 : qty));
    const before = await linesOf(ids.LT1);
    const results = await repairStarterFixtureLines({ apply: true });
    const lt1 = results.find(r => r.ref === "LT1")!;
    expect(lt1.outcome).toBe("skipped: edited");
    expect(lt1.detail).toMatch(/changed by hand/);
    expect(await linesOf(ids.LT1)).toEqual(before);
  });

  it("repairs LT2 once nobody has forked it", async () => {
    const db = (await getDb())!;
    await db.delete(assemblies).where(eq(assemblies.id, forkId));
    const results = await repairStarterFixtureLines({ apply: true });
    expect(results.find(r => r.ref === "LT2")!.outcome).toBe("added");
    expect(await recipeOf(ids.LT2)).toEqual(specRecipe("LT2", true));
  });
});
