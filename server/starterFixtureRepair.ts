/**
 * The LT1 / LT2 fixture-line repair (owner YES, 2026-10-06).
 *
 * Plan D2 gave the two lighting starters that shipped first their fixture as
 * its own line — "Surface-mount ceiling fixture" in LT1, "Ceiling fan" in LT2.
 * The seed carries it, but the seeder never edits a starter that already
 * exists, so every database seeded before 2026-10-06 still holds the old
 * recipe. This adds the line THERE, narrowly.
 *
 * ── Which rows, exactly ──────────────────────────────────────────────────────
 * Only the SHARED starter row (`userId IS NULL`) of each, and only when:
 *   • no company has forked it (no row has `baselineId` = it) — a fork means a
 *     company copied the recipe and may compare it with the shipped one; and
 *   • its lines are EXACTLY the old shipped recipe — same parts, quantities,
 *     whip flags, no per-line hour overrides. Anything else means somebody
 *     edited it, and it is skipped and logged rather than guessed at.
 * A row already holding the new recipe is left alone and reported as done,
 * which is what makes this safe to run again.
 *
 * Never touches a company's assembly, a fork, a bid line (their prices are
 * frozen snapshots) or a kit. The fixture ships at $0 like every catalog row,
 * so no priced figure moves.
 *
 * ── Not a boot step, on purpose ──────────────────────────────────────────────
 * Run by hand (`scripts/repairStarterFixtureLines.mts`), at the release named
 * in references/migrations-next-batch.md — NOT on staging or live before then.
 * A seeder pass would have run on staging the moment local-dev deployed.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assemblies, assemblyMaterials, materials } from "../drizzle/schema";
import { getDb } from "./db";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { starterPartName } from "./seed/starterParts";

/** The starters this repair is for, by plan row. */
export const FIXTURE_REPAIR_REFS = ["LT1", "LT2"] as const;

export type FixtureRepairOutcome =
  | "added"
  | "would add"
  | "already has it"
  | "skipped: forked"
  | "skipped: edited"
  | "skipped: not found"
  | "skipped: fixture not in catalog";

export type FixtureRepairResult = {
  ref: string;
  name: string;
  assemblyId: number | null;
  outcome: FixtureRepairOutcome;
  /** Why, in a sentence, for the log. */
  detail: string;
};

type LineKey = string;
const key = (materialId: number, qty: string | number, whip: boolean) =>
  `${materialId}|${Number(qty).toFixed(4)}|${whip ? 1 : 0}`;
const sameSet = (a: LineKey[], b: LineKey[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function repairStarterFixtureLines(options: {
  /** False = report what would happen and write nothing. */
  apply: boolean;
}): Promise<FixtureRepairResult[]> {
  const db = await getDb();
  if (!db) throw new Error("No database.");

  const results: FixtureRepairResult[] = [];
  for (const ref of FIXTURE_REPAIR_REFS) {
    const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
    const fixtureLines = spec.materials.filter(l => l.fixture);
    const oldLines = spec.materials.filter(l => !l.fixture);
    const result = (
      outcome: FixtureRepairOutcome,
      detail: string,
      assemblyId: number | null = null
    ) => results.push({ ref, name: spec.name, assemblyId, outcome, detail });

    const names = spec.materials.map(l => starterPartName(l.part));
    const catalog = await db
      .select({ id: materials.id, name: materials.name })
      .from(materials)
      .where(and(isNull(materials.userId), inArray(materials.name, names)));
    const idOf = new Map(catalog.map(m => [m.name, m.id]));
    const resolve = (part: (typeof spec.materials)[number]) =>
      idOf.get(starterPartName(part.part));
    if (spec.materials.some(l => resolve(l) === undefined)) {
      result(
        "skipped: fixture not in catalog",
        `a part of the recipe is not a shipped row here: ${names
          .filter(n => !idOf.has(n))
          .join(", ")}`
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

    const [{ forks }] = await db
      .select({ forks: sql<number>`COUNT(*)` })
      .from(assemblies)
      .where(eq(assemblies.baselineId, row.id));
    if (Number(forks) > 0) {
      result(
        "skipped: forked",
        `${forks} compan${Number(forks) === 1 ? "y has" : "ies have"} a copy of it`,
        row.id
      );
      continue;
    }

    const lines = await db
      .select({
        materialId: assemblyMaterials.materialId,
        qty: assemblyMaterials.qty,
        isBranchWhip: assemblyMaterials.isBranchWhip,
        overrideLaborHours: assemblyMaterials.overrideLaborHours,
        sortOrder: assemblyMaterials.sortOrder,
      })
      .from(assemblyMaterials)
      .where(eq(assemblyMaterials.assemblyId, row.id));
    const have = lines.map(l => key(l.materialId, l.qty, l.isBranchWhip));
    const asKeys = (want: typeof spec.materials) =>
      want.map(l => key(resolve(l)!, l.qty, l.branchWhip ?? false));
    const overridden = lines.some(l => l.overrideLaborHours !== null);

    if (!overridden && sameSet(have, asKeys(spec.materials))) {
      result("already has it", "the recipe is the new one", row.id);
      continue;
    }
    if (overridden || !sameSet(have, asKeys(oldLines))) {
      result(
        "skipped: edited",
        "its lines are not the old shipped recipe, so it was changed by hand — left as it is",
        row.id
      );
      continue;
    }

    if (!options.apply) {
      result("would add", "unforked, old recipe exactly", row.id);
      continue;
    }
    // Appended after the existing lines: the narrowest write, and nothing
    // already there moves.
    const after = Math.max(-1, ...lines.map(l => l.sortOrder ?? 0));
    await db.insert(assemblyMaterials).values(
      fixtureLines.map((l, i) => ({
        assemblyId: row.id,
        materialId: resolve(l)!,
        qty: l.qty.toFixed(4),
        isBranchWhip: false,
        sortOrder: after + 1 + i,
      }))
    );
    result("added", "unforked, old recipe exactly", row.id);
  }
  return results;
}
