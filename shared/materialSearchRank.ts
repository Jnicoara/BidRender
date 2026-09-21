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
 * ── HOW the row answers the word outranks role, in five tiers ────────────────
 * See queryTier for the full reasoning; the short version is that "is the word
 * this row's head noun" and "does the shelf it sits on agree" together separate
 * three searches that no simpler rule gets right at once — "fixture", "wire"
 * and "ground". The tiers are EXACT, IS_A, VARIETY, MODIFIER, ASSOCIATED.
 *
 * Role only orders rows that answered the same way. That floor is what stops a
 * demoted accessory being passed by a row that never held the word at all.
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

import { materialTypeName } from "./materialSizeOrder";

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

/** A row, as much of it as ranking needs to see. */
export type RankableRow = {
  name: string;
  category?: string | null;
  /** The material's OWN searchAliases, not the global synonym table. */
  aliases?: string | null;
};

export const TIER = {
  /** The name's head noun IS the word, with nothing qualifying it. */
  EXACT: 0,
  /**
   * This row IS one of these — either its head noun says so ("LED strip
   * FIXTURE") or its shelf and its own aliases do ("#12 THHN", Wire & Cable).
   *
   * ── These were two tiers for an hour, and splitting them was wrong ─────────
   * Ranking the shelf-and-alias claim ABOVE the head noun put "50A spa
   * disconnect" above every main panel for "panel", and "Dimmer" above
   * "Single-pole switch". Ranking it BELOW buried building wire under fixture
   * wire again. Neither order is right because neither claim is weaker: a spa
   * panel really is a panel and so is a main panel. What actually separates
   * them is not HOW the row claims the word but HOW MANY of it the catalog
   * stocks — see the family tiebreak in compareByRole.
   */
  IS_A: 1,
  /** The word is in the name, modifying something else. */
  MODIFIER: 2,
  /** The row's own aliases carry the word; its shelf does not agree. */
  OWN_ALIAS: 3,
  /** Reached some other way — the global synonym table, usually. */
  ASSOCIATED: 4,
} as const;
export type MatchTier = (typeof TIER)[keyof typeof TIER];

/**
 * How a row answers a single typed word.
 *
 * ── Why the head noun is asked twice, of the name and of the category ────────
 * Two searches forced this, and they pull in opposite directions:
 *
 *   "fixture" must give LIGHT FIXTURES, not "#16 fixture wire". The wire's head
 *   noun is "wire"; "fixture" only tells you which kind. So a head match beats
 *   a modifier match — the plain rule, and it needs nothing but the name.
 *
 *   "wire" must give BUILDING WIRE — THHN, Romex — and those names contain no
 *   "wire" at all. They are reachable only through their own aliases ("building
 *   wire", "pipe wire"), scoring 10 against fixture wire's 200, so they sat at
 *   #22 and #41 of 51. Here the alias match has to BEAT the name match.
 *
 * A name-beats-alias rule gets the first right and the second wrong; the
 * reverse gets the second right and puts a GFCI receptacle — aliased "ground
 * fault" — above every ground rod in the catalog. There is no ordering of those
 * two tiers alone that satisfies both.
 *
 * What separates them is the CATEGORY. "#12 THHN" sits in Wire & Cable and
 * claims "wire"; the shelf it lives on is named after the thing asked for, so
 * the claim is an identity rather than an association. "GFCI receptacle" sits
 * in Receptacles and claims "ground" — the shelf says it is something else, so
 * the claim stays an association. That is IS_A, and it is the whole trick.
 *
 * It is a rule about structure, not a list of words: nothing here knows what
 * wire or a fixture is, only where the word sits in a name and whether the
 * shelf agrees.
 */
export function queryTier(row: RankableRow, word: string): MatchTier {
  const term = norm(word);
  if (!term) return TIER.ASSOCIATED;

  const name = norm(head(row.name));
  /*
    The type is the name with its leading size taken off, so "#16 fixture wire"
    is judged as "fixture wire" and not as a row beginning with a gauge. Shared
    with the sort (materialSizeOrder) on purpose — a row cannot be one type when
    it is listed and another when it is searched.
  */
  const type = norm(materialTypeName(head(row.name)) ?? head(row.name));

  /*
    The head noun is matched by PREFIX, not only whole.

    People search by typing the start of a word and stopping. "recep" is the
    documented example — CLAUDE.md records it ranking "Wall plate" first once
    already — and a whole-word test sends it to TIER.MODIFIER, where "Duplex
    receptacle" lost to a combo device that claimed the word through its shelf.
    A term that starts the head noun IS the head noun.
  */
  const headWord = type.split(" ").pop() ?? "";
  if (headWord.startsWith(term)) {
    return type === headWord ? TIER.EXACT : TIER.IS_A;
  }
  if (endsWithWord(type, term)) return TIER.IS_A;

  if (hasWordPrefix(norm(row.name), term)) return TIER.MODIFIER;

  /*
    The word is nowhere in the name. The row may still BE one — but only if its
    own aliases claim the word AND the shelf it sits on is named after it.

    Both halves are required, and dropping either breaks a real search. Without
    the shelf, "GFCI receptacle" (aliased "ground fault", shelved under
    Receptacles) outranks every ground rod in the catalog. Without the alias,
    nothing connects "#12 THHN" to the word "wire" at all.

    A claim the shelf does not back is still worth something — it is how
    "marrette" reaches Wire nuts — so it lands on OWN_ALIAS rather than being
    thrown in with the global synonym table.
  */
  const claims = aliasTerms(row.aliases).includes(term);
  if (!claims) return TIER.ASSOCIATED;
  return hasWordPrefix(norm(row.category ?? ""), term)
    ? TIER.IS_A
    : TIER.OWN_ALIAS;
}

/**
 * Does some word in `text` START with `term`?
 *
 * Prefix, never a bare substring, and the difference is a real result: with
 * `includes`, searching "ground" matched "UNDERground splice kit" and ranked it
 * above the grounding bushing, because the kit reads as a product and the
 * bushing as a fitting. A stem the user typed should reach what grew out of it
 * — "ground" to "grounding" — and stop there. smartSearch draws the same line
 * in matchTier, for the same reason.
 */
const escapeRe = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

function hasWordPrefix(text: string, term: string): boolean {
  if (!term) return false;
  return new RegExp("(^| )" + escapeRe(term)).test(text);
}

/** The row's own alias words, as whole terms. */
function aliasTerms(aliases: string | null | undefined): string[] {
  return norm(aliases ?? "")
    .split(" ")
    .filter(Boolean);
}

/**
 * The worst tier across every word typed.
 *
 * Worst, not best: a row has to answer the whole query. Taking the best would
 * let one strong word carry a row that ignores the rest of what was typed.
 */
export function matchTier(row: RankableRow, query: string): MatchTier {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0) return TIER.ASSOCIATED;
  let worst: MatchTier = TIER.EXACT;
  for (const word of words) {
    const tier = queryTier(row, word);
    if (tier > worst) worst = tier;
  }
  return worst;
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
 * Does family size get to decide between these two, or does relevance?
 *
 * Only one question needs it: a row whose NAME says it is one of these, against
 * a row whose SHELF says so. "#16 fixture wire" against "#12 THHN" for "wire";
 * "100A main panel" against "50A spa disconnect" for "panel". Both are honestly
 * the thing asked for, relevance cannot separate them — the name always wins on
 * score, 200 to 10 — and the catalog's own stock levels can.
 *
 * ── It was applied to EVERY comparison for one run, and that was a disaster ──
 * Above the relevance score, family size stops being a tiebreak and becomes the
 * ranking. Measured on the standard sweep: "plug" returned 2-Pole BREAKERS
 * ahead of every receptacle, "gfi" returned 2-Pole GFCI breakers ahead of the
 * GFCI receptacle, "box" led with cast boxes and "cover" with mud rings. Twenty
 * of fifty-eight queries moved, most of them wrongly.
 *
 * The lesson is the shape of the fix rather than the number: a signal that is
 * right for one question is not a better sort key, and the narrower guard is
 * what makes it safe. So it fires only between the two claim kinds, only inside
 * TIER.IS_A, and only for a single typed word.
 */
function familyDecides(
  a: RankableMatch,
  b: RankableMatch,
  query: string
): boolean {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length !== 1) return false;
  const word = words[0];
  if (queryTier(a, word) !== TIER.IS_A) return false;
  if (queryTier(b, word) !== TIER.IS_A) return false;
  // Exactly one of them names the word outright; the other is claiming it
  // through its shelf. Same kind on both sides means relevance can do the job.
  return (
    hasWordPrefix(norm(a.name), word) !== hasWordPrefix(norm(b.name), word)
  );
}

/**
 * Compare two already-matched results for one query.
 *
 * Match tier, then role, then family size, then the relevance score
 * smartSearch produced, then the caller's own tiebreak — which for a material list is size order, so 1/2,
 * 3/4, 1 runs in trade order inside each group rather than by score accident.
 */
export type RankableMatch = RankableRow & {
  score: number;
  /**
   * How many rows share this one's type across the whole catalog.
   *
   * The catalog stocks eighteen sizes of THHN and two fixture wires, five main
   * panels and two spa panels — so when two rows answer the typed word equally
   * well, the bigger family is the one the word usually means. It is a fact
   * about the catalog rather than about the language, which is what makes it a
   * rule instead of a list.
   *
   * Optional: a caller that does not supply it simply does not get the
   * tiebreak, and ranking falls through to relevance as before.
   */
  family?: number;
};

export function compareByRole(
  a: RankableMatch,
  b: RankableMatch,
  query: string,
  tiebreak: (x: string, y: string) => number = () => 0
): number {
  const la = matchTier(a, query);
  const lb = matchTier(b, query);
  if (la !== lb) return la - lb;

  const ra = roleRankFor(a.name, query);
  const rb = roleRankFor(b.name, query);
  if (ra !== rb) return ra - rb;

  if (familyDecides(a, b, query)) {
    const fa = a.family ?? 0;
    const fb = b.family ?? 0;
    if (fa !== fb) return fb - fa;
  }

  if (a.score !== b.score) return b.score - a.score;
  return tiebreak(a.name, b.name);
}

/**
 * How many catalog rows share each type, keyed by the type.
 *
 * Built once from the whole catalog and handed to `compareByRole` as
 * `family`. It uses the SAME type derivation as the sort, so a family here is
 * the same run of rows the Materials screen groups under one heading — there is
 * no second opinion about what counts as one product.
 */
export function familySizes(
  rows: ReadonlyArray<{ name: string }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = familyKey(row.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The type a name belongs to, as `familySizes` keys it. */
export function familyKey(name: string): string {
  const bare = head(name);
  return norm(materialTypeName(bare) ?? bare);
}
