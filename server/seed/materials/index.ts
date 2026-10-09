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
import { dropRestatedWords, type BaselineMaterial } from "./types";

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
];

/**
 * The catalog, with each row's aliases stripped of anything its own name
 * already says. See dropRestatedWords for why that is a pass rather than a
 * rule each module is trusted to follow.
 */
export const BASELINE_MATERIALS: BaselineMaterial[] = (
  [
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
  ] as BaselineMaterial[]
)
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
