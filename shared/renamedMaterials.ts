/**
 * Renamed shipped materials, old name -> new name — shared so the search
 * ranking (shared/materialSearchRank.ts) and the supplier price import can
 * read the same map the seeder applies.
 *
 * Moved here from server/seed/materials/index.ts on 2026-09-26, which still
 * re-exports it, so every existing importer is unchanged. It has to be ONE
 * map: a second copy for the ranking would drift from the one the seeder
 * applies, and an old spelling would then land on a row that no longer
 * carries it.
 */
import { TRADE_SIZES } from "./tradeSizes";
import { emtStyledFittingName } from "./runFittingMaterials";
import { FROZEN_RENAMES_2026_10_07 } from "./frozenMaterialNames";

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
 *
 * This is the HISTORY as each rename was written. What the seeder applies is
 * RENAMED_BASELINE_MATERIALS below, which points each of these at today's
 * name.
 */
const RENAMED_BEFORE_2026_10_07: Record<string, string> = {
  '1/2" PVC': '1/2" PVC Sch 40',
  // Straight to the set-screw name (2026-09-26, below), not via the
  // intermediate `1/2" EMT connector`, so no database depends on the pass
  // walking a chain in order — the same choice the SER entries make.
  'EMT connector 1/2"': '1/2" EMT set-screw connector',
  'EMT connector 3/4"': '3/4" EMT set-screw connector',
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
  /*
    EMT couplings and connectors state their style (owner, 2026-09-26): the
    plain rows ARE the set-screw ones — it is what "EMT coupling" means at the
    counter — and compression and raintight arrive beside them as new rows.
    Renamed in place so every assembly and stamp keeps its id. Every word of
    the old name is still in the new one, so searching the old name finds the
    row without an alias (and `materialsCatalog.test.ts` refuses aliases that
    restate the name).
  */
  ...Object.fromEntries(
    TRADE_SIZES.flatMap(size =>
      (["coupling", "connector"] as const).map(kind => [
        `${size} EMT ${kind}`,
        emtStyledFittingName(size, "set-screw", kind),
      ])
    )
  ),
  // Single-size lugs name their size as such (owner, 2026-09-26), matching
  // "500 kcmil crimp lug, single size" — which took the qualifier because the
  // plain 500 name is retired. Never deployed under the old name, but local
  // and test databases hold the row, and a rename here keeps its id there.
  "400 kcmil crimp lug": "400 kcmil crimp lug, single size",
  // Weatherproof boxes sized by hub (plan § 9b, owner 2026-09-29). The
  // unsized rows become the 1/2" ones — what most were bought as — and the
  // 3/4" rows are new. Same ids, so assemblies and bids keep resolving.
  "Weatherproof box, single-gang": '1/2" weatherproof box, single-gang',
  "Weatherproof box, double-gang": '1/2" weatherproof box, double-gang',
  "Weatherproof box, triple-gang": '1/2" weatherproof box, triple-gang',
  "Weatherproof round box": '1/2" weatherproof round box',
  "Weatherproof box, single-gang, PVC":
    '1/2" weatherproof box, single-gang, PVC',
};

const FROZEN_FINAL: Record<string, string> = Object.fromEntries(
  FROZEN_RENAMES_2026_10_07.map(r => [r.current, r.final])
);

/**
 * Baseline rows to rename in place, old name -> new name: every rename above,
 * plus the names frozen from the owner's review sheet on 2026-10-07
 * (shared/frozenMaterialNames.ts) — with every older spelling pointed
 * STRAIGHT at its final name.
 *
 * ── Why repointed, not chained ───────────────────────────────────────────────
 * The seed pass applies each entry once and in no particular order, and the
 * search ranking (`renamedTo`) and the supplier price import follow ONE hop.
 * "20A breaker" -> "20A Single-Pole breaker" -> "20A 1-Pole breaker" as a
 * chain would leave a database that missed both releases on the middle name
 * after one pass, and a supplier sheet saying "20A breaker" unmatched. So the
 * history above keeps what each old name WAS renamed to, and this map sends
 * it to what it is NOW (audit 2026-10-07, references/materials-review-sheet-
 * plan.md item 6). renamedMaterials.test.ts fails on any value that is
 * itself a key.
 */
export const RENAMED_BASELINE_MATERIALS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(RENAMED_BEFORE_2026_10_07).map(([from, to]) => [
      from,
      FROZEN_FINAL[to] ?? to,
    ])
  ),
  ...FROZEN_FINAL,
};

/** An old spelling, normalised the way search ranking compares names. */
const formerKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

let formerNames: Map<string, string> | null = null;

/**
 * The current name a typed query used to be, or null.
 *
 * Compared loosely — case, quote marks and punctuation ignored — because
 * that is how a person types an old name back ("30a breaker", '1/2 pvc'),
 * and it is the same normalisation phraseTier applies to the current name.
 */
export function renamedTo(query: string): string | null {
  if (!formerNames) {
    formerNames = new Map(
      Object.entries(RENAMED_BASELINE_MATERIALS).map(([from, to]) => [
        formerKey(from),
        to,
      ])
    );
  }
  return formerNames.get(formerKey(query)) ?? null;
}
