/**
 * The shape of a shipped starter assembly, and the rule for when one may seed.
 *
 * Its own module so `baselineAssemblies.ts` (the 8 that shipped first) and
 * `starterAssemblies.ts` (the rest of the planned 168) can share it without
 * importing each other.
 */
import {
  ASSEMBLY_CATEGORIES,
  assemblies,
  type ProjectType,
} from "../../drizzle/schema";
import { type StarterPart } from "./starterParts";

/**
 * The categories a starter may ask for: today's enum plus the two the owner
 * decided on 2026-09-29 (starter assemblies plan D3) that the database does
 * not hold yet — Track A's migration 0122. Once 0122 lands in
 * `ASSEMBLY_CATEGORIES`, this union collapses to it and nothing here changes.
 */
export type StarterCategory =
  | (typeof ASSEMBLY_CATEGORIES)[number]
  | "Demo & Retrofit"
  | "General";

/**
 * ── Which line is the BRANCH WHIP (D18) ──────────────────────────────────────
 * Devices carry the wiring between each other and a traced run is the homerun
 * back to the panel, so the cable in a device recipe IS the whip — a
 * receptacle's 25 ft of 12-2 NM-B is what reaches the next receptacle.
 *
 * Declared per LINE rather than assumed, because "the wire line is the whip"
 * is false for every recipe that carries its own home run (a dedicated
 * circuit, an appliance, gear). Those lines are deliberately not whips.
 */
export type BaselineAssemblyMaterial = {
  /**
   * A key of STARTER_PARTS — never a catalog name. The name lives in that one
   * table, so a catalog rename edits one line there (or nothing, if it went
   * through RENAMED_BASELINE_MATERIALS) and no recipe.
   */
  part: StarterPart;
  qty: number;
  /** This line is the branch wire to the next device. Omitted means no. */
  branchWhip?: boolean;
  /**
   * The fixture or appliance itself (plan D2). Its own line in every recipe,
   * so an owner-furnished job deletes one line rather than rebuilding the
   * recipe. Informational: the seeder treats it like any other line.
   */
  fixture?: boolean;
};

export type BaselineAssembly = {
  /** The row number in references/starter-assemblies-plan.md (DV1, LT19…). */
  ref: string;
  /**
   * Matched by name on every start, so NEVER rename a shipped one: a rename
   * seeds a second copy beside the first on every existing database.
   */
  name: string;
  category: StarterCategory;
  projectType: ProjectType;
  /**
   * NULL = HOURS NOT SET (plan D1) — never 0. Every starter added after the
   * first 8 ships null for the owner to set. The first 8 still carry their
   * old placeholder hours; clearing them is Track A's step-3 file after 0123
   * and its code are live (track-a-handoff-starter-assemblies.md H2).
   */
  baseLaborHours: number | null;
  materials: BaselineAssemblyMaterial[];
  /**
   * Parts the recipe needs that the catalog does not carry, by the name the
   * plan gives them. A starter with any is never seeded — a recipe missing
   * lines prices the job too low, which is worse than it being absent — and
   * the parts are never added here; adding a catalog row is its own change.
   */
  missingParts?: string[];
  /** Starter modifier names switched on by default. Matched by name. */
  modifiers?: string[];
};

/** One recipe line. */
export function p(
  part: StarterPart,
  qty: number,
  flags: { branchWhip?: true; fixture?: true } = {}
): BaselineAssemblyMaterial {
  return { part, qty, ...flags };
}

/** A starter added from the plan: hours not set, by decision D1. */
export function starter(
  ref: string,
  name: string,
  category: StarterCategory,
  projectType: ProjectType,
  materials: BaselineAssemblyMaterial[],
  extra: { missingParts?: string[]; modifiers?: string[] } = {}
): BaselineAssembly {
  return {
    ref,
    name,
    category,
    projectType,
    baseLaborHours: null,
    materials,
    ...extra,
  };
}

/**
 * What the database can hold today. Read from the schema module, so it moves
 * when Track A's migrations land in `drizzle/schema.ts` and needs no edit
 * here.
 */
export type StarterSchema = {
  categories: readonly string[];
  /** `assemblies.baseLaborHours` accepts NULL (Track A's 0123). */
  hoursCanBeUnset: boolean;
};

export function liveStarterSchema(): StarterSchema {
  return {
    categories: ASSEMBLY_CATEGORIES,
    hoursCanBeUnset: !assemblies.baseLaborHours.notNull,
  };
}

export type StarterHold = "missing-parts" | "category" | "hours-not-set";

/**
 * Why a starter cannot seed on this schema yet — empty when it can.
 *
 * ── "hours-not-set" holds; it NEVER falls back to 0 ──────────────────────────
 * Until 0123, `baseLaborHours` is NOT NULL DEFAULT 0, so the only way to seed
 * a starter whose hours nobody has set would be to write 0 — the silent zero
 * plan D1 rules out. Held instead, and the hold lifts by itself when the
 * schema says NULL is allowed.
 *
 * The schema saying so is the trigger, and that edit must ship with H2's
 * step-2 code (every reader of `baseLaborHours` reads NULL as "not set"),
 * because the moment it lands these starters seed with NULL hours.
 * `server/starterAssembliesSeed.test.ts` has the check that goes live then.
 */
export function starterHolds(
  spec: BaselineAssembly,
  schema: StarterSchema
): StarterHold[] {
  const holds: StarterHold[] = [];
  if ((spec.missingParts ?? []).length > 0) holds.push("missing-parts");
  if (!schema.categories.includes(spec.category)) holds.push("category");
  if (spec.baseLaborHours === null && !schema.hoursCanBeUnset)
    holds.push("hours-not-set");
  return holds;
}

/**
 * The category as the database column's type. Throws if the schema does not
 * hold it, which `starterHolds` has already ruled out for anything seeded.
 */
export function schemaCategory(
  spec: BaselineAssembly
): (typeof ASSEMBLY_CATEGORIES)[number] {
  const category = ASSEMBLY_CATEGORIES.find(c => c === spec.category);
  if (!category) {
    throw new Error(
      `"${spec.name}" asks for category "${spec.category}", which assemblies.category does not hold yet`
    );
  }
  return category;
}

/** One sentence per hold, for the seed log and the labor sheet. */
export const STARTER_HOLD_REASON: Record<StarterHold, string> = {
  "missing-parts": "a part is not in the catalog",
  category: "its category waits on Track A's 0122",
  "hours-not-set":
    "hours not set needs Track A's 0123 (the column cannot hold NULL yet)",
};
