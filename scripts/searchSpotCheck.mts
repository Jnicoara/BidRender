/**
 * Print what the catalog returns for the queries an estimator actually types.
 *
 * ── Why this is a script and not only tests ──────────────────────────────────
 * server/materialsCatalog.test.ts pins the searches that must never regress.
 * This is the other half: a way to LOOK at ranking across a broad sweep of
 * queries after changing catalog content, because most search problems are not
 * "the right row is missing" — they are "the right row is fourth, behind three
 * fittings that share a word with it", which no assertion thought to check.
 *
 * ── It ranks the way the app ranks ───────────────────────────────────
 * MaterialPicker asks smartSearch for a generous page and then groups it by
 * ROLE — the product first, then fittings, supports, consumables. A spot check
 * that skipped that step would print an order no user ever sees, which is
 * worse than not checking: it would look like evidence.
 *
 *   pnpm tsx scripts/searchSpotCheck.mts             # both sweeps below
 *   pnpm tsx scripts/searchSpotCheck.mts --standard  # the standard sweep only
 *   pnpm tsx scripts/searchSpotCheck.mts --counts    # "2 gang box", "3 way" …
 *   pnpm tsx scripts/searchSpotCheck.mts --diff      # raw vs role-ranked
 *   pnpm tsx scripts/searchSpotCheck.mts romex 1900  # ad-hoc queries
 */
import { BASELINE_MATERIALS } from "../server/seed/baselineMaterials";
import {
  smartSearch,
  smartSearchCorrected,
} from "../client/src/lib/smartSearch";
import { familySizes, rankMaterialHits } from "../shared/materialSearchRank";
import { commonnessPoints } from "../shared/materialCommonness";

const index = BASELINE_MATERIALS.map((m, i) => ({
  id: String(i),
  description: m.name,
  unit: m.unitOfSale,
  searchAliases: m.searchAliases,
}));

/**
 * A sweep across every family, weighted toward the queries most likely to go
 * wrong: bare slang, sizes typed three different ways, and words that several
 * families legitimately share.
 */
const SWEEP = [
  // Slang that must beat the formal name
  "romex",
  "1900",
  "gem box",
  "plug",
  "recep",
  "gfi",
  "marrette",
  "spring nut",
  "thinwall",
  "greenfield",
  "sealtite",
  "condulet",
  "bx",
  "mcm",
  "wafer",
  "acorn",
  "wago",
  "tapcon",
  "evse",
  "minerallac",
  "red head",
  "j box",
  // Sizes, typed the ways people type them
  "1/2 emt",
  "3/4 pvc",
  "1-1/4 rigid",
  "1 1/4 rigid",
  "1.25 rigid",
  "2 inch imc",
  "4 pvc 80",
  // Words several families share — the ranking traps
  "connector",
  "coupling",
  "elbow",
  "strap",
  "bushing",
  "box",
  "breaker",
  "panel",
  "switch",
  "cover",
  "ground",
  "transformer",
  "whip",
  "nut",
  // Wire, where solid/stranded/aluminum all collide
  "12-2",
  "12/2",
  "10 thhn",
  "4/0",
  "500",
  "ser",
  // The 2026-10-07 adds (owner asked for these to be re-checked)
  "wire mold",
  "wiremold",
  "4 wafer",
  "6 wafer",
  "2 wafer",
  "canless",
  "gimbal wafer",
  "disc light",
  "3-1/2 emt",
  "3 1/2 pvc",
  "main breaker",
  "200a breaker",
  "warning tape",
  "aluminum feeder",
  "bare copper",
  // Equipment
  "smoke",
  "exit",
  "high bay",
  "ceiling fan",
  "disconnect",
  "meter",
  "spa",
];

/** How many rows to show, and how deep to look before grouping them. */
const SHOW = 5;
/** Deep enough that a row promoted by its tier was in the page to promote. */
const DEPTH = 80;

const rowOf = (id: string) => BASELINE_MATERIALS[Number(id)];
const nameOf = (id: string) => rowOf(id).name;
const FAMILIES = familySizes(BASELINE_MATERIALS);

/** smartSearch alone, in the order it returns. */
function raw(query: string, limit = SHOW): string[] {
  return smartSearch(index, query, limit).map(hit => nameOf(hit.id));
}

/**
 * What every material search box shows: a deep page, ranked, then cut.
 *
 * The oversample is not a detail — ranking AFTER the cut would be cosmetic,
 * because a product that fell outside the first few on score could never be
 * brought back.
 *
 * It calls rankMaterialHits, the function the screens call, with the starter
 * commonness and no usage — a fresh company's view. This header used to say
 * the script "ranks the way the app ranks" while it broke ties by seed order
 * and the screen broke them by name; the two agreed only where nothing tied.
 * Sharing the function is what makes the sentence true.
 */
const NOW = new Date();
function ranked(query: string, limit = SHOW): string[] {
  // Typo-corrected and ranked by the CORRECTED query, as useMaterialSearch
  // does — a misspelling is ordered exactly as its correction would be.
  const { results, correctedQuery, searchedQuery } = smartSearchCorrected(
    index,
    query,
    DEPTH
  );
  const hits = results.map(hit => ({
    row: rowOf(hit.item.id),
    score: hit.score,
  }));
  return rankMaterialHits(hits, searchedQuery, {
    families: FAMILIES,
    commonness: row => commonnessPoints(row.name, undefined, NOW),
  })
    .slice(0, limit)
    .map(row => row.name);
}

/**
 * A number followed by a count word — "2 gang box", "3 way", "2 pole 20".
 *
 * Its own sweep because the standard one had none of these, and on
 * 2026-09-29 a catalog change (the hub-sized weatherproof boxes, 8c5c478)
 * pushed Double-gang box out of the top five for "2 gang box" with the
 * standard sweep unchanged. A count number was matched inside sizes ("2" in
 * `1/2"`). Run with --counts; the standard run includes it too.
 */
const COUNT_SWEEP = [
  ...["1", "2", "3", "4", "5"].flatMap(n => [`${n} gang`, `${n} gang box`]),
  "2 gang plate",
  "3 gang plate",
  "2 gang mud ring",
  ...["1", "2", "3"].flatMap(n => [`${n} pole`, `${n} pole breaker`]),
  "1 pole 20",
  "2 pole 20",
  "2 pole 30",
  "3 pole 60",
  "3 way",
  "3 way switch",
  "4 way",
  "4 way switch",
  ...["1", "2", "3", "5"].flatMap(n => [`${n} hole`, `${n} hole strap`]),
  "3 hole box",
  "2 head",
  "2 light",
  "3 light",
  "20 space",
  "30 space",
  "40 space",
  "42 space",
  "20 space panel",
  "2 circuit",
  "4 circuit",
];

const args = process.argv.slice(2);
const diff = args.includes("--diff");
const counts = args.includes("--counts");
const standard = args.includes("--standard");
const given = args.filter(a => !a.startsWith("--"));
const queries = given.length
  ? given
  : counts
    ? COUNT_SWEEP
    : standard
      ? SWEEP
      : [...SWEEP, ...COUNT_SWEEP];

if (diff) {
  let changed = 0;
  for (const query of queries) {
    const before = raw(query, 3);
    const after = ranked(query, 3);
    const moved = before.join(" | ") !== after.join(" | ");
    if (moved) changed++;
    console.log(`\n"${query}"  ${moved ? "CHANGED" : "same"}`);
    console.log(`   before  ${before.join("  ·  ") || "(nothing)"}`);
    if (moved) console.log(`   after   ${after.join("  ·  ")}`);
  }
  console.log(
    `\n${queries.length} queries, ${changed} reordered by role grouping.`
  );
} else {
  for (const query of queries) {
    const hits = ranked(query);
    console.log(`\n"${query}"`);
    if (hits.length === 0) {
      console.log("   (nothing)");
      continue;
    }
    hits.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
  }
}
