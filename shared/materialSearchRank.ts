/**
 * Ranking search results by ROLE: the product first, then what attaches to it.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * Typing "panel" returned "Panel filler plate" above every panel in the
 * catalog, because every row containing the word matched about as well and the
 * tie fell through to score accident. An estimator typing the name of a product
 * wants the product.
 *
 * ── Why this is a LEXICON OF ROLES and not a list of products ────────────────
 * The obvious fix is a table saying "for pvc, show conduit first" — and it is
 * unmaintainable by construction: there are over a thousand catalog items, so a
 * rule per product word is a rule per product. It also fails the day somebody
 * adds a product nobody wrote a rule for, which is exactly when a catalog is at
 * its least browsable.
 *
 * So the role is decided by what the item IS, not by what was typed. A name
 * whose HEAD NOUN is a fitting is a fitting, whatever product it belongs to —
 * connector, coupling, elbow, bushing. A support noun means support — strap,
 * hanger, clamp, staple. One lexicon of about sixty nouns covers every product
 * in the catalog and every product added after it.
 *
 * ── THE HEAD NOUN, not the presence of the word ──────────────────────────────
 * This is the whole rule, and the first two versions of it got this wrong.
 *
 * An English product name runs modifiers then head noun, so what a row IS is
 * the phrase its name ENDS with. "Panel filler plate" ends in a filler plate
 * and is a part of a panel; "Wall plate" ends in a plate and is the product
 * itself. Merely CONTAINING a role noun cannot tell those apart.
 *
 * Nor can "contains a role noun after the word you typed", which was version
 * two. "rod" was a support noun and it stands after "ground", so "Ground rod,
 * 8 ft" was demoted and searching "ground" returned a GFCI receptacle above
 * every ground rod in the catalog. That cost "rod" its place in the lexicon —
 * a ground rod and a threaded rod are products people search FOR — and it is
 * why the remaining words that are somebody's product (nut, washer, anchor,
 * clamp) are only safe now that the test has to land on the HEAD noun.
 *
 * ── One word groups; two words do not ────────────────────────────────────────
 * Role grouping answers "I typed a product, show me the product". The moment a
 * second word is typed the person has already narrowed it, and smartSearch is
 * scoring against something specific — so grouping stands down rather than
 * overriding it. Measured: "2 inch imc" put 1" and 3" IMC above the 2" IMC
 * connector, because a pipe outranks a fitting and the role rule could not see
 * that the size had been asked for.
 *
 * ── HOW the row matched outranks role, in three tiers ────────────────────────
 * Demotion has to have a floor. When "Ground rod clamp" is pushed down for
 * being an accessory, the row that rises must not be one that never contained
 * the typed word at all — that is how a GFCI receptacle reached second place
 * for "ground". So role only orders rows that matched the same WAY:
 *
 *   0. the NAME holds every word typed        "Grounding bushing" for "ground"
 *   1. the row's OWN aliases hold them        "Wire nuts" for "marrette"
 *   2. only the global synonym table did      "GFCI receptacle" for "ground"
 *
 * Two tiers were not enough in either direction, and each collapse was found by
 * running the sweep. Folding 1 into 2 made every wire-nut row an alias match no
 * better than a lever connector reached through ALIAS_MAP, so the slang for a
 * wire nut stopped returning wire nuts. Folding 1 into 0 let "ground fault",
 * a perfectly good alias on a GFCI receptacle, outrank grounding material.
 *
 * Per-material vocabulary is a fact about THAT material (CLAUDE.md § Materials);
 * the global table is a fact about the language, shared by everything it
 * touches. Three tiers is what it takes to keep those apart.
 *
 * Substring, not whole word, so "ground" still claims "Grounding bushing".
 *
 * ── And the query is classified with the SAME lexicon, to STAND DOWN ─────────
 * The grouping is for a bare product word. Once the query itself names a role
 * noun — "pvc connector" — smartSearch already has the better signal, because
 * two literal words match a connector where only one matches a coupling. So a
 * query naming a role switches this off rather than reordering against it.
 * See roleRankFor for what happened when it did the reordering instead.
 *
 * ── What this does NOT do ────────────────────────────────────────────────────
 * It does not decide relevance — `smartSearch` still does, and its score is the
 * tiebreak inside a tier. This only groups, and it never filters: somebody
 * typing "pvc" who is shown only conduit cannot see that the catalog also has a
 * PVC coupling, and a search that hides things is how a person concludes the
 * catalog is missing a part it has.
 *
 * Tested in server/materialSearchRank.test.ts, against the real catalog as well
 * as fixtures — the false positives above were all found by running the whole
 * sweep and reading it, never by reasoning about the rule.
 */

/** Words meaning "this joins, terminates or closes a product". */
const FITTING_NOUNS = [
  "connector",
  "coupling",
  "adapter",
  "elbow",
  "bushing",
  "nipple",
  "conduit body",
  "condulet",
  "locknut",
  "reducer",
  "reducing washer",
  "expansion fitting",
  "service entrance cap",
  "weatherhead",
  "end cap",
  "cap",
  "plug",
  "bell end",
  "union",
  "sweep",
  "offset",
  "cord grip",
  "sealing fitting",
  "entrance fitting",
  "mud ring",
  "plaster ring",
  "extension ring",
  "cover",
  "gasket",
  "knockout",
  "hub",
  // Safe to list because the HEAD NOUN decides: "Wall plate" ends in a plate
  // and keeps its own name, while "Panel filler plate" ends in a filler plate.
  "filler plate",
  "blank plate",
  "trim ring",
  "trim",
  "blank",
  "filler",
];

/** Words meaning "this holds a product up or fixes it down". */
const SUPPORT_NOUNS = [
  "strap",
  "hanger",
  "clamp",
  "staple",
  "standoff",
  "clip",
  "bracket",
  "support",
  // "rod" is NOT here, and the reason is the one that broke version two: a
  // ground rod and a threaded rod are both products somebody searches FOR. The
  // same caution applies to the fasteners below, which survive only because a
  // head noun test rarely lands on them by accident.
  "anchor",
  "screw",
  "bolt",
  "nut",
  "washer",
  "spacer",
  "hook",
  "beam clamp",
  "trapeze",
  "minerallac",
  "mounting bracket",
  "brace",
  "stiffener",
];

/** Words meaning "consumed while installing it". */
const CONSUMABLE_NOUNS = [
  "cement",
  "glue",
  "lubricant",
  "lube",
  "soap",
  "tape",
  "sealant",
  "caulk",
  "compound",
  "putty",
  "marker",
  "label",
  "tie",
  "seal",
];

export const ROLE = {
  /** The product the word names. */
  BASE: 0,
  /** Something that joins, terminates or closes it. */
  FITTING: 1,
  /** Something that holds it up. */
  SUPPORT: 2,
  /** Something used up installing it. */
  CONSUMABLE: 3,
} as const;
export type MaterialRole = (typeof ROLE)[keyof typeof ROLE];

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ROLE_GROUPS: Array<{ role: MaterialRole; nouns: string[] }> = [
  { role: ROLE.FITTING, nouns: FITTING_NOUNS },
  { role: ROLE.SUPPORT, nouns: SUPPORT_NOUNS },
  { role: ROLE.CONSUMABLE, nouns: CONSUMABLE_NOUNS },
];

/**
 * The part of a name that says what it IS, with any trailing qualifier cut.
 *
 * "Lever wire connector, 2-port" is a connector; so is "Push-in wire
 * connector". Read to the very end, the first ends in "port" and the second in
 * "connector", and two rows on the same shelf get opposite roles for no reason
 * a user could see. What follows a comma narrows a product, it does not change
 * what the product is.
 */
const head = (text: string): string => text.split(",")[0];

/**
 * Does `text` end with `phrase`, on a word boundary, singular or plural?
 *
 * The catalog names some things in the plural — "Wire nuts" — and the lexicon
 * is written in the singular, so without this a shelf's plural entries quietly
 * escape their own role. One trailing "s" is all that is needed; anything
 * cleverer would be a stemmer, and a stemmer would start folding "bushing" into
 * "bush".
 */
const endsWithWord = (text: string, phrase: string): boolean => {
  const singular = /[^s]s$/.test(text) ? text.slice(0, -1) : text;
  for (const candidate of [text, singular]) {
    if (candidate === phrase || candidate.endsWith(" " + phrase)) return true;
  }
  return false;
};

/**
 * What role this material plays, from the phrase its name ends with.
 *
 * The LONGEST trailing match wins, so "1-gang blank plate" is read as a blank
 * plate rather than as a blank. A tie goes to the earliest group, which puts a
 * fitting ahead of a support.
 */
export function materialRole(name: string): MaterialRole {
  const text = norm(head(name));
  let best: { role: MaterialRole; length: number } | null = null;
  for (const group of ROLE_GROUPS) {
    for (const noun of group.nouns) {
      if (!endsWithWord(text, noun)) continue;
      if (best === null || noun.length > best.length) {
        best = { role: group.role, length: noun.length };
      }
    }
  }
  return best === null ? ROLE.BASE : best.role;
}

/**
 * The role the QUERY asks for, or null when it names none.
 *
 * Anywhere in the query, not only at the end: somebody types "connector pvc"
 * as readily as "pvc connector", and either way they have named the part.
 */
export function queryRole(query: string): MaterialRole | null {
  const text = norm(query);
  if (!text) return null;
  for (const group of ROLE_GROUPS) {
    for (const noun of group.nouns) {
      if (text === noun || new RegExp("(^| )" + noun + "( |$)").test(text)) {
        return group.role;
      }
    }
  }
  return null;
}

/** How directly this row matched: 0 by name, 1 by its own aliases, 2 neither. */
export function matchTier(
  name: string,
  query: string,
  aliases?: string | null
): 0 | 1 | 2 {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0) return 2;
  const inName = norm(name);
  if (words.every(word => inName.includes(word))) return 0;
  const withAliases = inName + " " + norm(aliases ?? "");
  return words.every(word => withAliases.includes(word)) ? 1 : 2;
}

/**
 * Rank a material for one query: lower sorts first.
 *
 * With no role named in the query, the natural order applies — product, then
 * fittings, then supports, then consumables.
 */
export function roleRankFor(name: string, query: string): number {
  /*
    A QUERY THAT NAMES A ROLE TURNS THIS OFF ENTIRELY, and that is the opposite
    of the first design.

    The first version promoted "anything of the asked-for role", which read well
    and was wrong the moment it ran: "pvc connector" put COUPLINGS first,
    because a coupling is a fitting and so is a connector, and promoting the
    class says nothing about which member of it was named. "emt coupling"
    returned connectors for the mirror reason.

    Once the user has typed the noun themselves, smartSearch already has the
    better signal — two literal words match a connector and only one matches a
    coupling — and role grouping can only blur it. So the grouping exists for
    the case it was built for, a bare product word, and steps out of the way
    when the search is already specific.
  */
  if (queryRole(query) !== null) return 0;
  if (norm(query).split(" ").filter(Boolean).length > 1) return 0;
  return materialRole(name);
}

/**
 * Compare two already-matched results for one query.
 *
 * Match tier, then role, then the relevance score smartSearch produced,
 * then the caller's own tiebreak — which for a material list is size order, so 1/2,
 * 3/4, 1 runs in trade order inside each group rather than by score accident.
 */
export type RankableMatch = {
  name: string;
  score: number;
  /** The material's OWN searchAliases, not the global synonym table. */
  aliases?: string | null;
};

export function compareByRole(
  a: RankableMatch,
  b: RankableMatch,
  query: string,
  tiebreak: (x: string, y: string) => number = () => 0
): number {
  const la = matchTier(a.name, query, a.aliases);
  const lb = matchTier(b.name, query, b.aliases);
  if (la !== lb) return la - lb;

  const ra = roleRankFor(a.name, query);
  const rb = roleRankFor(b.name, query);
  if (ra !== rb) return ra - rb;

  if (a.score !== b.score) return b.score - a.score;
  return tiebreak(a.name, b.name);
}
