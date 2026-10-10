/**
 * The shipped material catalog, assembled from the per-category modules.
 *
 * ── Names are the match key, which makes renaming dangerous ──────────────────
 * `seedBaselineMaterials` matches existing rows to this list BY NAME. That is
 * what makes the seed re-runnable, and it is also the trap: change a name here
 * and the seeder sees a material it has never met, inserts a second row, and
 * leaves the original behind as an orphan the backfill then skips. The user
 * gets two of everything and no explanation.
 *
 * So a rename is not a text edit — it is an entry in RENAMED_BASELINE_MATERIALS
 * (shared/renamedMaterials.ts, re-exported below), which is applied to the
 * table before matching. That preserves the row's id, which
 * matters more than the name does: assemblies, kits, project items and takeoff
 * stamps all point at material ids, and re-creating a row would silently detach
 * every one of them.
 */
import { CONDUIT } from "./conduit";
import { BOX_COVER_FAMILY, BOXES } from "./boxes";
import {
  COVER_PLATE_FAMILY,
  COVER_PLATES,
  RECEPTACLES,
  SWITCHES,
} from "./devices";
import { CONNECTORS, CONSUMABLES } from "./connectors";
import { DISTRIBUTION, PANELS_AND_BREAKERS } from "./power";
import { LIGHTING } from "./lighting";
import { LOW_VOLTAGE } from "./lowVoltage";
import {
  EQUIPMENT,
  FASTENERS,
  GROUNDING,
  LIFE_SAFETY,
} from "./safetyAndSupport";
import { STRUT } from "./strut";
import { STARTER_PRICES } from "./starterPrices";
import { STARTER_LABOR_UNITS } from "./starterLaborUnits";
import { SPECIALTY_MATERIALS } from "./specialty";
import { CATALOG_REVIEW_RETIRED } from "../../../shared/catalogReview20261008";
import {
  SERVICE_ENTRANCE,
  SURFACE_RACEWAY,
  UNDERGROUND,
} from "./raceUndergroundService";
import { WIRE_AND_CABLE } from "./wireAndCable";
import { REALITY_CHECK_ADDS } from "./realityCheck";
import {
  REALITY_ALIAS_EDITS,
  REALITY_ALIAS_RULES,
  REALITY_RENAMES,
  REALITY_RETIRED,
  REALITY_RETIRED_INTO,
} from "../../../shared/catalogRealityCheck20261009";
import { aliases, dropRestatedWords, type BaselineMaterial } from "./types";

export type { BaselineMaterial } from "./types";

// The rename map lives in shared/ so search ranking and the supplier price
// import read the same one the seeder applies. Re-exported so every importer
// of this module is unchanged.
export { RENAMED_BASELINE_MATERIALS } from "../../../shared/renamedMaterials";

/**
 * Baseline rows the catalog no longer ships.
 *
 * ── Retired, not deleted ─────────────────────────────────────────────────────
 * A shipped row cannot simply vanish from this file: assemblies, kits, project
 * items and takeoff stamps point at material ids, and a bid priced last month
 * has to keep resolving the parts it was priced from. So retiring sets
 * `isActive = false` — the row stops appearing in every list, including the
 * archive, but keeps its id and everything referencing it keeps working. A user
 * who had forked one keeps their own copy; that is theirs, not the catalog's.
 *
 * Use this only when a row is genuinely gone. When it has merely been renamed,
 * use RENAMED_BASELINE_MATERIALS instead — that preserves the row AND keeps it
 * in the catalog, which is almost always what a "removal" actually is.
 */
export const RETIRED_BASELINE_MATERIALS: string[] = [
  // Duplicated 5"/6", which already covers the 6" trim opening. Two rows for
  // one part is a choice between a thing and itself.
  '6" wafer LED downlight',
  // Lugs are sold by conductor RANGE, not per gauge — replaced by the five
  // range-named rows in connectors.ts. The per-gauge names invented parts
  // nobody can order.
  // REVERSED 2026-10-09 by the catalog reality check (owner-approved): a
  // compression lug is ONE conductor size, so each range row became its
  // largest size in place and the rest are new single-size rows ("#6 AWG
  // crimp lug"). These retired per-gauge rows stay retired — the new rows
  // carry the "AWG" names (shared/catalogRealityCheck20261009.ts).
  "#6 crimp lug",
  "#4 crimp lug",
  "#2 crimp lug",
  "#1/0 crimp lug",
  "#2/0 crimp lug",
  "#4/0 crimp lug",
  "250 kcmil crimp lug",
  "350 kcmil crimp lug",
  "500 kcmil crimp lug",
  // An unsized placeholder, replaced by the four sized 480V-208Y/120V
  // transformers in power.ts (2026-09-25). Nothing in the code named it.
  "Dry-type transformer",
  // The four-wire 4/0 SER a second time, in shorthand: "-3" is three
  // insulated conductors plus a ground (3/0-3 is 3/0-3/0-3/0-1/0), so this
  // was 4/0-4/0-4/0-2/0. Retired rather than renamed because that row
  // already exists; "4/0-3" is an alias on it (2026-09-25, wireAndCable.ts).
  "4/0-3 SER aluminum",
  // 700 is one-piece raceway (owner, 2026-10-08; per-foot-items-plan.md
  // § 3c): its base row became "Surface raceway, 700 series" and the cover
  // describes a part nobody buys on its own. Retired, not deleted, so
  // anything already pointing at it still resolves. Staging-only row.
  "Surface raceway cover, 700 series",
  // 500 the same way (owner, 2026-10-09; sch80-and-500-plan.md § 2a): its
  // base row became "Surface raceway, 500 series". Staging-only row.
  "Surface raceway cover, 500 series",
  // The owner's catalog review, 2026-10-08: #14/#12/#10 bare copper, the
  // generic EMT strap and three other generics, all 3-1/2" and all IMC,
  // six unused generic connectors and the unsized grounding bushing — 138
  // rows, listed with the reason for each group in
  // shared/catalogReview20261008.ts.
  ...CATALOG_REVIEW_RETIRED,
  // The catalog reality check, 2026-10-09 (Track C's research, owner-
  // approved): each retired row's job goes to the kept row named beside it
  // in shared/catalogRealityCheck20261009.ts, which takes its old name as
  // search words.
  ...Object.keys(REALITY_RETIRED_INTO),
  ...REALITY_RETIRED,
];

/**
 * The catalog reality check, applied to the module rows BY NAME
 * (shared/catalogRealityCheck20261009.ts): retired rows leave the seed, a
 * renamed row ships under its new name with its old name as search words,
 * a kept row takes the names of the rows retired into it, and the search
 * word edits land last. One map drives both this and the in-place rename
 * pass, so the seed and the database cannot disagree on a name.
 *
 * Runs BEFORE `dropRestatedWords`, which then strips every old-name word the
 * new name still says.
 */
/** One inch trade size, written whole: `1/2"`, `1-1/4"`, `6"`. */
const TRADE_SIZE_WORD = /^(\d+-)?\d+(\/\d+)?"$/;

export function applyRealityCheck(
  rows: readonly BaselineMaterial[]
): BaselineMaterial[] {
  const gone = new Set([
    ...Object.keys(REALITY_RETIRED_INTO),
    ...REALITY_RETIRED,
  ]);
  const retiredInto = new Map<string, string[]>();
  for (const [retired, kept] of Object.entries(REALITY_RETIRED_INTO))
    retiredInto.set(kept, [...(retiredInto.get(kept) ?? []), retired]);

  return rows
    .filter(m => !gone.has(m.name))
    .map(m => {
      const renamed = REALITY_RENAMES[m.name];
      const name = renamed ?? m.name;
      const formerNames = [
        ...(renamed ? [m.name] : []),
        ...(retiredInto.get(name) ?? []),
      ];
      // A former name joins as WORDS: its commas and brackets would make
      // tokens ("clip,", "(0.40\"-0.70\"") that no search ever types.
      // And never a SIZE the row is not: '1/2" weatherproof box,
      // triple-gang' is now a 3/4" box, and '5"' on the 6" wafer would let a
      // search for 5" find a 6" part. An inch size joins only if the new
      // name has it too.
      const newWords = new Set(name.toLowerCase().split(/[\s,()]+/));
      const formerWords = formerNames
        .join(" ")
        .toLowerCase()
        .replace(/[,()]/g, " ")
        .split(/\s+/)
        .filter(w => !TRADE_SIZE_WORD.test(w) || newWords.has(w))
        .join(" ");
      let words = [m.searchAliases.toLowerCase(), formerWords].join(" ");
      const edits = [
        ...REALITY_ALIAS_RULES.filter(r => r.applies(name)).map(r => r.edit),
        ...(REALITY_ALIAS_EDITS[name] ? [REALITY_ALIAS_EDITS[name]] : []),
      ];
      for (const edit of edits) {
        const drop = new Set((edit.drop ?? "").split(/\s+/).filter(Boolean));
        words = [
          ...words.split(/\s+/).filter(w => w && !drop.has(w)),
          ...(edit.add ?? "").split(/\s+/),
        ].join(" ");
      }
      return {
        ...m,
        name,
        searchAliases: aliases(words),
      };
    });
}

/**
 * The catalog, with each row's aliases stripped of anything its own name
 * already says. See dropRestatedWords for why that is a pass rather than a
 * rule each module is trusted to follow.
 */
export const BASELINE_MATERIALS: BaselineMaterial[] = applyRealityCheck([
  ...WIRE_AND_CABLE,
  ...CONDUIT,
  ...STRUT,
  ...BOXES,
  ...RECEPTACLES,
  ...SWITCHES,
  ...COVER_PLATES,
  // The full cover family, owner 2026-10-08 (adds only). The box covers
  // sit here, after the receptacles, not with BOXES — see boxes.ts.
  ...COVER_PLATE_FAMILY,
  ...BOX_COVER_FAMILY,
  ...PANELS_AND_BREAKERS,
  ...LIGHTING,
  ...GROUNDING,
  ...LIFE_SAFETY,
  ...LOW_VOLTAGE,
  ...CONNECTORS,
  ...FASTENERS,
  ...EQUIPMENT,
  ...DISTRIBUTION,
  ...CONSUMABLES,
  // Since 2026-10-07; their categories need migration 0117 (see module).
  ...SURFACE_RACEWAY,
  ...UNDERGROUND,
  ...SERVICE_ENTRANCE,
  ...REALITY_CHECK_ADDS,
] as BaselineMaterial[])
  .map(dropRestatedWords)
  .map(m => withStarterValues(m))
  .map(m => withSpecialty(m));

/**
 * The owner's Specialty tag (0140), applied by NAME from specialty.ts — the
 * modules say what a row IS; the list says which rows sort lower.
 */
export function withSpecialty(
  m: BaselineMaterial,
  specialty: readonly string[] = SPECIALTY_MATERIALS
): BaselineMaterial {
  return specialty.includes(m.name) ? { ...m, isSpecialty: true } : m;
}

/**
 * The starter sheets' numbers, applied by NAME on top of the modules: the
 * modules say what a row IS, the generated files say what it costs and how
 * long it takes. Both files are written only by pricing/loadStarterSheets.mts.
 */
export function withStarterValues(
  m: BaselineMaterial,
  // Parameters so server/starterValues.test.ts can prove the tagging while
  // the generated maps are still empty.
  prices: Readonly<Record<string, string>> = STARTER_PRICES,
  laborUnits: typeof STARTER_LABOR_UNITS = STARTER_LABOR_UNITS
): BaselineMaterial {
  const price = prices[m.name];
  const labor = laborUnits[m.name];
  const hasHours =
    labor?.laborHours !== undefined || labor?.fieldBendLaborHours !== undefined;
  return {
    ...m,
    // A sheet number always arrives WITH its tag — the owner's rule: never a
    // shipped number that does not say it is an example.
    ...(price !== undefined
      ? { costPerUnit: price, isExamplePrice: true as const }
      : {}),
    ...(labor?.laborHours !== undefined
      ? { laborHours: labor.laborHours }
      : {}),
    ...(labor?.fieldBendLaborHours !== undefined
      ? { fieldBendLaborHours: labor.fieldBendLaborHours }
      : {}),
    ...(hasHours ? { isExampleLaborHours: true as const } : {}),
  };
}
