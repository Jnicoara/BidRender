/**
 * The starter repair for the catalog reality check (owner, 2026-10-09;
 * references/catalog-reality-check-build.md § "Existing databases"): moves the
 * shared starters of a database seeded BEFORE the check off the rows the
 * check retired, onto the rows that took their job — and puts the two labels
 * the owner added onto CW3 and CW11.
 *
 * The seed recipes say all this already, but the seeder never edits a starter
 * that exists, so without this pass it reaches new databases only. A retired
 * row still resolves and still prices, so nothing is BROKEN on an old
 * database — the starter simply differs from a fresh one, and its retired
 * part is hidden from every picker.
 *
 * Same shape as `repairStarterCovers` (server/starterCoverRepair.ts), on
 * purpose:
 *   - only the SHARED starter row (`userId IS NULL`) — never a company's own
 *     assembly, a fork, a kit or a bid line;
 *   - only when its lines are EXACTLY the recipe as shipped before the check
 *     (same parts, quantities, whip flags, no per-line hour overrides);
 *     anything else is "skipped: edited" and left alone;
 *   - a row already on the new recipe is "already has it", so a second run
 *     is harmless;
 *   - report first, write only with `apply`.
 *
 * No bid total moves: a bid line's price is a frozen snapshot. What follows
 * the shared recipe is an OPEN bid's supplier materials list, which reads the
 * recipe live and will name the kept row (same price: every row ships $0
 * until priced).
 *
 * Run by hand at a release (`scripts/repairStarterRetired.mts`), AFTER the
 * new code's first start — the kept rows and the two labels exist only once
 * that start has seeded them.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assemblies, assemblyMaterials, materials } from "../drizzle/schema";
import { getDb } from "./db";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { starterPartName } from "./seed/starterParts";
import type { BaselineAssemblyMaterial } from "./seed/assemblyRecipe";
import { RENAMED_BASELINE_MATERIALS } from "../shared/renamedMaterials";

/**
 * Starter part key -> what the line was before the check: the part's name
 * then (the key's value at `aaed2a8`) and, where the recipe changed it, the
 * quantity. The key's CURRENT part and quantity come from the seed recipe.
 */
export const RETIRED_PART_REPOINTS: Readonly<
  Record<string, { wasName: string; wasQty?: number }>
> = {
  "60a-main-panel-8-space": { wasName: "60A main panel, 8-space" },
  "320a-meter-base": { wasName: "320A meter base" },
  "50a-rv-receptacle": { wasName: "50A RV receptacle" },
  "floor-box-cover": { wasName: "Floor box cover" },
  "1-gang-blank-plate": { wasName: "1-gang blank plate" },
  "raceway-entrance-end-fitting": { wasName: "Raceway entrance end fitting" },
  "200a-main-panel": { wasName: "200A main panel" },
  "125a-main-lug-sub-panel-24-space": {
    wasName: "125A main-lug sub-panel, 24-space",
  },
  "ground-lug-compression": { wasName: "Ground lug, compression" },
  // One kit was one trapeze; the strut is sold by the 10 ft stick.
  "trapeze-hanger-kit": { wasName: "Trapeze hanger kit", wasQty: 1 },
  // Not retired — renamed in place to "4/0 AWG crimp lug" — but PG15 moved
  // OFF it, onto the new #3 lug that matches its feeder (owner call 3).
  "2-0-4-0-awg-crimp-lug": { wasName: "2/0-4/0 AWG crimp lug" },
};

/** Lines the check ADDED to a starter (owner: the two labels). */
export const ADDED_STARTER_PARTS: readonly string[] = [
  "emergency-disconnect-label",
  "ev-ready-label",
];

/** The name a pre-check row carries on a database that has had the check. */
const nameNow = (name: string) => RENAMED_BASELINE_MATERIALS[name] ?? name;

/** The starter's recipe as shipped before the check, or null if untouched. */
export function recipeBeforeCheck(
  lines: readonly BaselineAssemblyMaterial[]
): { recipe: { name: string; qty: number; whip: boolean }[] } | null {
  const touched = lines.some(
    l => l.part in RETIRED_PART_REPOINTS || ADDED_STARTER_PARTS.includes(l.part)
  );
  if (!touched) return null;
  return {
    recipe: lines
      .filter(l => !ADDED_STARTER_PARTS.includes(l.part))
      .map(l => {
        const was = RETIRED_PART_REPOINTS[l.part];
        return {
          name: was ? nameNow(was.wasName) : starterPartName(l.part),
          qty: was?.wasQty ?? l.qty,
          whip: l.branchWhip ?? false,
        };
      }),
  };
}

export type RetiredRepairOutcome =
  | "repointed"
  | "would repoint"
  | "already has it"
  | "skipped: edited"
  | "skipped: not found"
  | "skipped: part not in catalog";

export type RetiredRepairResult = {
  ref: string;
  name: string;
  assemblyId: number | null;
  outcome: RetiredRepairOutcome;
  detail: string;
};

const key = (materialId: number, qty: string | number, whip: boolean) =>
  `${materialId}|${Number(qty).toFixed(4)}|${whip ? 1 : 0}`;
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function repairStarterRetired(options: {
  /** False = report what would happen and write nothing. */
  apply: boolean;
}): Promise<RetiredRepairResult[]> {
  const db = await getDb();
  if (!db) throw new Error("No database.");

  const results: RetiredRepairResult[] = [];
  for (const spec of BASELINE_ASSEMBLIES) {
    const before = recipeBeforeCheck(spec.materials);
    if (!before) continue;
    const result = (
      outcome: RetiredRepairOutcome,
      detail: string,
      assemblyId: number | null = null
    ) =>
      results.push({
        ref: spec.ref,
        name: spec.name,
        assemblyId,
        outcome,
        detail,
      });

    const now = spec.materials.map(l => ({
      name: starterPartName(l.part),
      qty: l.qty,
      whip: l.branchWhip ?? false,
    }));
    // Shared rows only, active or retired: a retired row is what the old
    // recipe points at.
    const names = Array.from(
      new Set([...before.recipe, ...now].map(l => l.name))
    );
    const catalog = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(and(isNull(materials.userId), inArray(materials.name, names)));
    const idOf = new Map(catalog.map(m => [m.name, m.id]));
    const missing = names.filter(n => !idOf.has(n));
    if (missing.length > 0) {
      result(
        "skipped: part not in catalog",
        `not a shared row here: ${missing.join(", ")}`
      );
      continue;
    }
    const asKeys = (lines: { name: string; qty: number; whip: boolean }[]) =>
      lines.map(l => key(idOf.get(l.name)!, l.qty, l.whip));

    const [row] = await db
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(and(isNull(assemblies.userId), eq(assemblies.name, spec.name)))
      .limit(1);
    if (!row) {
      result("skipped: not found", "no shared starter by this name");
      continue;
    }

    const lines = await db
      .select({
        id: assemblyMaterials.id,
        materialId: assemblyMaterials.materialId,
        qty: assemblyMaterials.qty,
        isBranchWhip: assemblyMaterials.isBranchWhip,
        overrideLaborHours: assemblyMaterials.overrideLaborHours,
        sortOrder: assemblyMaterials.sortOrder,
      })
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, row.id));
    const have = lines.map(l => key(l.materialId, l.qty, l.isBranchWhip));
    const overridden = lines.some(l => l.overrideLaborHours !== null);

    if (!overridden && sameSet(have, asKeys(now))) {
      result("already has it", "the recipe is the new one", row.id);
      continue;
    }
    if (overridden || !sameSet(have, asKeys(before.recipe))) {
      result(
        "skipped: edited",
        "its lines are not the recipe as shipped before the check, so it was changed by hand — left as it is",
        row.id
      );
      continue;
    }

    const [{ forks }] = await db
      .select({ forks: sql<number>`COUNT(*)` })
      .from(assemblies)
      .where(eq(assemblies.baselineId, row.id));
    const changes = spec.materials
      .filter(l => l.part in RETIRED_PART_REPOINTS)
      .map(
        l =>
          `${nameNow(RETIRED_PART_REPOINTS[l.part].wasName)} -> ${starterPartName(l.part)} x${l.qty}`
      )
      .concat(
        spec.materials
          .filter(l => ADDED_STARTER_PARTS.includes(l.part))
          .map(l => `+ ${starterPartName(l.part)} x${l.qty}`)
      );
    const detail =
      changes.join("; ") +
      (Number(forks) === 0
        ? ""
        : ` (${forks} compan${Number(forks) === 1 ? "y's copy is" : "ies' copies are"} left as they are)`);

    if (!options.apply) {
      result("would repoint", detail, row.id);
      continue;
    }

    await db.transaction(async tx => {
      // Each changed line keeps its place in the recipe; an added one is
      // appended.
      for (const l of spec.materials) {
        const was = RETIRED_PART_REPOINTS[l.part];
        if (!was) continue;
        const wasId = idOf.get(nameNow(was.wasName))!;
        const wasQty = (was.wasQty ?? l.qty).toFixed(4);
        const target = lines.find(
          x => x.materialId === wasId && Number(x.qty).toFixed(4) === wasQty
        )!;
        await tx
          .update(assemblyMaterials)
          .set({
            materialId: idOf.get(starterPartName(l.part))!,
            qty: l.qty.toFixed(4),
          })
          .where(eq(assemblyMaterials.id, target.id));
      }
      const added = spec.materials.filter(l =>
        ADDED_STARTER_PARTS.includes(l.part)
      );
      const after = Math.max(-1, ...lines.map(l => l.sortOrder ?? 0));
      if (added.length > 0)
        await tx.insert(assemblyMaterials).values(
          added.map((l, i) => ({
            assemblyId: row.id,
            materialId: idOf.get(starterPartName(l.part))!,
            qty: l.qty.toFixed(4),
            isBranchWhip: l.branchWhip ?? false,
            sortOrder: after + 1 + i,
          }))
        );
    });
    result("repointed", detail, row.id);
  }
  return results;
}
