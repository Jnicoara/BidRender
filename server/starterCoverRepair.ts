/**
 * The cover-swap repair (references/cover-plates-audit.md § 3, owner
 * 2026-10-08): puts the typed covers onto the shared starters of a database
 * seeded BEFORE the swap. The seed recipes carry the new covers already, but
 * the seeder never edits a starter that exists, so without this the swap
 * reaches new databases only. `server/seed/starterCoverSwaps.ts` says which
 * starters and which lines.
 *
 * ── Which rows, exactly ──────────────────────────────────────────────────────
 * Only the SHARED starter row (`userId IS NULL`), and only when its lines are
 * EXACTLY the old shipped recipe — same parts, quantities, whip flags, no
 * per-line hour overrides — or, for RS1 / RS2 / RS13, exactly what the first
 * swap of 2026-10-08 left (`interim` in the swap table). Anything else is skipped and reported, never
 * guessed at. A row already on the new recipe is "already has it", which is
 * what makes a second run harmless.
 *
 * ── A forked starter IS swapped, unlike the LT1/LT2 repair ──────────────────
 * `starterFixtureRepair.ts` skips a shared row any company has forked. This
 * does not, on purpose: a fork is the company's own copy with its own lines,
 * so it never reads the shared row again — the shared row is what every
 * OTHER company sees. Skipping it because one company forked would leave the
 * wrong cover in front of all the rest. The fork itself is never touched, and
 * the report says how many there are.
 *
 * ── What it never changes ────────────────────────────────────────────────────
 * A company's assembly, a fork, a kit, a bid line. A bid line's price is a
 * frozen snapshot, so no bid total moves. What DOES follow the shared recipe
 * is the supplier materials list of an open bid built on one of these
 * starters, which reads the recipe live and will name the typed plate.
 *
 * Every new cover ships at $0 like every catalog row.
 *
 * ── Not a boot step, on purpose ──────────────────────────────────────────────
 * Run by hand (`scripts/repairStarterCovers.mts`) at a release — Track A
 * runs it on staging and live, never B. A seeder pass would have run on
 * staging the moment local-dev deployed.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assemblies, assemblyMaterials, materials } from "../drizzle/schema";
import { getDb } from "./db";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import {
  STARTER_COVER_SWAPS,
  interimRecipe,
  wasRecipe,
} from "./seed/starterCoverSwaps";
import { starterPartName } from "./seed/starterParts";
import type { BaselineAssemblyMaterial } from "./seed/assemblyRecipe";

export type CoverRepairOutcome =
  | "swapped"
  | "would swap"
  | "already has it"
  | "skipped: edited"
  | "skipped: not found"
  | "skipped: part not in catalog";

export type CoverRepairResult = {
  ref: string;
  name: string;
  assemblyId: number | null;
  outcome: CoverRepairOutcome;
  /** Why, in a sentence, for the log. */
  detail: string;
};

const key = (materialId: number, qty: string | number, whip: boolean) =>
  `${materialId}|${Number(qty).toFixed(4)}|${whip ? 1 : 0}`;
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function repairStarterCovers(options: {
  /** False = report what would happen and write nothing. */
  apply: boolean;
}): Promise<CoverRepairResult[]> {
  const db = await getDb();
  if (!db) throw new Error("No database.");

  const results: CoverRepairResult[] = [];
  for (const swap of STARTER_COVER_SWAPS) {
    const spec = BASELINE_ASSEMBLIES.find(a => a.ref === swap.ref)!;
    // What this row may hold now: the recipe as shipped, or — for a starter
    // a later decision changed again — as the first swap left it. Each
    // carries the cover lines it swaps FROM.
    const starts = [
      { from: swap.was, recipe: wasRecipe(spec.ref, spec.materials) },
      ...(swap.interim
        ? [
            {
              from: swap.interim,
              recipe: interimRecipe(spec.ref, spec.materials)!,
            },
          ]
        : []),
    ];
    const result = (
      outcome: CoverRepairOutcome,
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

    const names = Array.from(
      new Set(
        [...spec.materials, ...starts.flatMap(s => s.recipe)].map(l =>
          starterPartName(l.part)
        )
      )
    );
    const catalog = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(and(isNull(materials.userId), inArray(materials.name, names)));
    const idOf = new Map(catalog.map(m => [m.name, m.id]));
    const resolve = (line: BaselineAssemblyMaterial) =>
      idOf.get(starterPartName(line.part));
    const missing = names.filter(n => !idOf.has(n));
    if (missing.length > 0) {
      result(
        "skipped: part not in catalog",
        `not a shipped row here: ${missing.join(", ")}`
      );
      continue;
    }

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
    const asKeys = (want: readonly BaselineAssemblyMaterial[]) =>
      want.map(l => key(resolve(l)!, l.qty, l.branchWhip ?? false));
    const overridden = lines.some(l => l.overrideLaborHours !== null);

    if (!overridden && sameSet(have, asKeys(spec.materials))) {
      result("already has it", "the recipe is the new one", row.id);
      continue;
    }
    const start = overridden
      ? undefined
      : starts.find(s => sameSet(have, asKeys(s.recipe)));
    if (!start) {
      result(
        "skipped: edited",
        "its lines are not a recipe this repair knows, so it was changed by hand — left as it is",
        row.id
      );
      continue;
    }

    const [{ forks }] = await db
      .select({ forks: sql<number>`COUNT(*)` })
      .from(assemblies)
      .where(eq(assemblies.baselineId, row.id));
    const which =
      start.from === swap.was
        ? "old recipe exactly"
        : "first cover swap's recipe exactly";
    const forkNote =
      Number(forks) === 0
        ? which
        : `${which}; ${forks} compan${Number(forks) === 1 ? "y's copy is left as it is" : "ies' copies are left as they are"}`;

    if (!options.apply) {
      result("would swap", forkNote, row.id);
      continue;
    }

    await db.transaction(async tx => {
      // from[i] becomes now[i] ON THE SAME LINE, so the cover keeps its place
      // in the recipe; a `now` line past the end of `from` is appended.
      for (let i = 0; i < start.from.length; i++) {
        const was = start.from[i];
        const target = lines.find(
          l =>
            l.materialId === resolve(was) &&
            Number(l.qty).toFixed(4) === was.qty.toFixed(4)
        )!;
        await tx
          .update(assemblyMaterials)
          .set({
            materialId: resolve(swap.now[i])!,
            qty: swap.now[i].qty.toFixed(4),
          })
          .where(eq(assemblyMaterials.id, target.id));
      }
      const after = Math.max(-1, ...lines.map(l => l.sortOrder ?? 0));
      const added = swap.now.slice(start.from.length);
      if (added.length > 0)
        await tx.insert(assemblyMaterials).values(
          added.map((l, i) => ({
            assemblyId: row.id,
            materialId: resolve(l)!,
            qty: l.qty.toFixed(4),
            isBranchWhip: false,
            sortOrder: after + 1 + i,
          }))
        );
    });
    result("swapped", forkNote, row.id);
  }
  return results;
}
