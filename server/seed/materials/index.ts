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
 * So a rename is not a text edit — it is an entry in RENAMED below, which is
 * applied to the table before matching. That preserves the row's id, which
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

/**
 * Baseline rows to rename in place, old name -> new name.
 *
 * Every entry here is a row the shipped catalog already had under a name that
 * no longer fits the family it turned out to belong to. `1/2" PVC` was fine
 * when it was the only PVC in the catalog and ambiguous the moment Schedule 80
 * arrived; the two EMT connectors were named backwards relative to the 224
 * fittings that now surround them.
 *
 * Entries are safe to keep forever — renaming a row that has already been
 * renamed is a no-op, because nothing matches the old name any more. Do not
 * delete one to tidy up: a database that has not booted since before the rename
 * still needs it.
 */
export const RENAMED_BASELINE_MATERIALS: Record<string, string> = {
  '1/2" PVC': '1/2" PVC Sch 40',
  'EMT connector 1/2"': '1/2" EMT connector',
  'EMT connector 3/4"': '3/4" EMT connector',
  // Written 5"/6" so the leading measurement is a real 5 inches. "5/6" reads
  // as the fraction five-sixths to anything parsing sizes, which sorted the
  // wafer below the 4" one.
  '5/6" wafer LED downlight': '5"/6" wafer LED downlight',
  // "light" -> "light bar", now that tape light shares the heading and the two
  // are bought completely differently — per fixture against per foot.
  '18" under-cabinet light': '18" under-cabinet light bar',
  '24" under-cabinet light': '24" under-cabinet light bar',
  '36" under-cabinet light': '36" under-cabinet light bar',
  // "20/2" is how the trade SAYS it; "20A 2-Pole" is how every supply house
  // WRITES it, and a catalog is a written thing. The spoken form survives as a
  // search alias, so anyone typing "20/2" still lands on the same row — which
  // is the point of renaming in place rather than adding a second one.
  "20/2 breaker": "20A 2-Pole breaker",
  "30/2 breaker": "30A 2-Pole breaker",
  "40/2 breaker": "40A 2-Pole breaker",
  "50/2 breaker": "50A 2-Pole breaker",
  "60/2 breaker": "60A 2-Pole breaker",
  "70/2 breaker": "70A 2-Pole breaker",
  "100/2 breaker": "100A 2-Pole breaker",
  // Single-pole now states its pole count as well, so every breaker row reads
  // the same way (2026-09-24, see power.ts). "Single-Pole", not "1-Pole": it is
  // what is said and written for a one-pole breaker.
  "15A breaker": "15A Single-Pole breaker",
  "20A breaker": "20A Single-Pole breaker",
  "30A breaker": "30A Single-Pole breaker",
  "15A AFCI breaker": "15A Single-Pole AFCI breaker",
  "20A AFCI breaker": "20A Single-Pole AFCI breaker",
  "15A GFCI breaker": "15A Single-Pole GFCI breaker",
  "20A GFCI breaker": "20A Single-Pole GFCI breaker",
  "15A AFCI/GFCI combo breaker": "15A Single-Pole AFCI/GFCI combo breaker",
  "20A AFCI/GFCI combo breaker": "20A Single-Pole AFCI/GFCI combo breaker",
  // Disconnects state their enclosure (2026-09-25, power.ts). The shipped
  // eight already called themselves "nema 3r outdoor" in their aliases, so
  // they are the 3R rows; the NEMA 1 ones are new.
  ...Object.fromEntries(
    ["30", "60", "100", "200"].flatMap(amps => [
      [`${amps}A fused disconnect`, `${amps}A fused disconnect, NEMA 3R`],
      [
        `${amps}A non-fused disconnect`,
        `${amps}A non-fused disconnect, NEMA 3R`,
      ],
    ])
  ),
  // GFCI is the spec that makes it a spa disconnect.
  "50A spa disconnect": "50A GFCI spa disconnect",
  "60A spa disconnect": "60A GFCI spa disconnect",
  // Metal written AL / CU, the supply-house short form (owner, 2026-09-25;
  // wireAndCable.ts header). The full words stay as search aliases.
  ...Object.fromEntries(
    [
      ...["#8", "#6", "#4", "#2", "#1", "#1/0", "#2/0", "#3/0", "#4/0"].map(
        g => `${g} XHHW`
      ),
      ...["250", "300", "350", "400", "500"].map(k => `${k} kcmil XHHW`),
      ...[
        "4-4-4-6",
        "2-2-2-4",
        "4/0-4/0-2/0",
        "4/0-4/0-4/0-2/0",
        "250-250-250",
      ].map(s => `${s} SER`),
      "4-4-6 SEU",
      "2-2-4 SEU",
      "#4/0 USE-2",
      "1/0 URD triplex",
    ].map(stem => [`${stem} aluminum`, `${stem} AL`])
  ),
  ...Object.fromEntries([
    ...["#14", "#12", "#10", "#8"].map(g => [
      `${g} bare copper, solid`,
      `${g} bare CU, solid`,
    ]),
    ...["#10", "#8", "#6", "#4", "#2", "#1/0", "#2/0"].map(g => [
      `${g} bare copper, stranded`,
      `${g} bare CU, stranded`,
    ]),
  ]),
  /*
    SER shorthand written out as the full conductor set (owner, 2026-09-25;
    the sets and their sources are in wireAndCable.ts). BOTH older spellings
    point straight at the final name — the pre-AL/CU one a database that
    missed the previous release still holds, and the AL/CU one that release
    wrote — so no database depends on the rename pass walking a chain in
    order. The shorthand survives as an alias on each row.
  */
  ...Object.fromEntries(
    (
      [
        ["8-3", "8-8-8-8", "copper", "CU"],
        ["6-3", "6-6-6-6", "copper", "CU"],
        ["4-3", "4-4-4-6", "copper", "CU"],
        ["2-3", "2-2-2-4", "copper", "CU"],
        ["1-3", "1-1-1-3", "copper", "CU"],
        ["1/0-3", "1/0-1/0-1/0-2", "aluminum", "AL"],
        ["2/0-3", "2/0-2/0-2/0-1", "aluminum", "AL"],
        ["3/0-3", "3/0-3/0-3/0-1/0", "aluminum", "AL"],
      ] as const
    ).flatMap(([short, full, word, abbr]) => [
      [`${short} SER ${word}`, `${full} SER ${abbr}`],
      [`${short} SER ${abbr}`, `${full} SER ${abbr}`],
    ])
  ),
};

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
