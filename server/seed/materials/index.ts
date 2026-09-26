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
import { BOXES } from "./boxes";
import { COVER_PLATES, RECEPTACLES, SWITCHES } from "./devices";
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
  ] as BaselineMaterial[]
).map(dropRestatedWords);
