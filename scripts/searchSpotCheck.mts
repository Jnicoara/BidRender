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
 *   pnpm tsx scripts/searchSpotCheck.mts             # the standard sweep
 *   pnpm tsx scripts/searchSpotCheck.mts --diff      # raw vs role-ranked
 *   pnpm tsx scripts/searchSpotCheck.mts romex 1900  # ad-hoc queries
 */
import { BASELINE_MATERIALS } from "../server/seed/baselineMaterials";
import { smartSearch } from "../client/src/lib/smartSearch";
import {
  compareByRole,
  familyKey,
  familySizes,
} from "../shared/materialSearchRank";
import { compareBySize } from "../shared/materialSizeOrder";

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
 * What the picker actually shows: a deep page, grouped by role, then cut.
 *
 * The oversample is not a detail — grouping AFTER the cut would be cosmetic,
 * because a product that fell outside the first few on score could never be
 * brought back. smartSearch does not expose its score, so position stands in
 * for it, which is all the role comparison needs to break a tie.
 */
function ranked(query: string, limit = SHOW): string[] {
  const hits = smartSearch(index, query, DEPTH);
  return hits
    .map((hit, index) => ({
      name: nameOf(hit.id),
      score: -index,
      aliases: rowOf(hit.id).searchAliases,
      category: rowOf(hit.id).category,
      family: FAMILIES.get(familyKey(nameOf(hit.id))),
    }))
    .sort((a, b) => compareByRole(a, b, query, compareBySize))
    .slice(0, limit)
    .map(row => row.name);
}

const args = process.argv.slice(2);
const diff = args.includes("--diff");
const given = args.filter(a => a !== "--diff");
const queries = given.length ? given : SWEEP;

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
