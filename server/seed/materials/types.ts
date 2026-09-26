/**
 * The shape of one shipped catalog row, plus the helpers the category modules
 * are built from.
 *
 * ── Why the catalog is generated rather than typed out ───────────────────────
 * Most of this catalog is combinatorial: five conduit types times nine trade
 * sizes times five fittings is 225 rows that differ only in two words. Typed
 * out by hand those 225 rows would carry 225 chances to alias a 1-1/4" coupling
 * as "1 1/4" but forget "1.25", and the twenty-third one would be wrong in a
 * way nobody notices until an estimator cannot find it. Generated, the slang
 * rule is written once and every size gets it.
 *
 * Hand-written entries are still the norm for anything genuinely one-off — a
 * ground rod is not a member of a family — and the generators are deliberately
 * dumb: they build names and aliases, and take everything else as an argument.
 */
import type {
  MATERIAL_UNITS_OF_SALE,
  MaterialCategory,
} from "../../../drizzle/schema";
import type { StickJoint } from "../../../shared/runFittings";
import { wordsInName } from "../../../shared/aliasSuggestions";

type UnitOfSale = (typeof MATERIAL_UNITS_OF_SALE)[number];

export type BaselineMaterial = {
  name: string;
  unitOfSale: UnitOfSale;
  /** Decimal column — kept as a string so no float rounding happens on the way in. */
  costPerUnit: string;
  category: MaterialCategory;
  /**
   * Space-separated trade slang for what an electrician actually types.
   *
   * Rules of thumb used throughout:
   *  - Only terms NOT already in the name. "Dimmer" needs no "dimmer" alias.
   *  - Include the spellings people type: "12/2" as well as "12-2", "gfi" as
   *    well as "gfci", "grey" as well as "gray".
   *  - Include what the thing is called on site, not just in the catalog:
   *    a 4" square box is a "1900 box", a single-gang box is a "gem box".
   *  - Do NOT alias one material to a different material. "Wall plate" is not
   *    an alias for a receptacle; that is what caused the "recep" mis-ranking.
   */
  searchAliases: string;
  /**
   * Which trade's list this belongs to. Omitted = "electrical".
   *
   * Only the low-voltage section sets it today. See `materials.trade`.
   */
  trade?: string;
  /**
   * A short clarifier, and ONLY where two rows could genuinely be confused.
   * Left off anything self-explanatory — see `materials.description`.
   */
  description?: string;
  /**
   * Suggested quantity when this material is added to an assembly. Omitted = 1.
   *
   * Only for consumables nobody fits one of — you do not put a single wire nut
   * on a device. The builder treats every one as an editable suggestion.
   */
  defaultQty?: number;
  /**
   * RACEWAY ONLY: what the fitting count reads (`shared/runFittings.ts`) —
   * stick length and joint, strap spacing and distance from a box. Editable
   * defaults, never code advice; a company changes them by forking the row.
   * Omitted on everything that is not a raceway.
   */
  raceway?: RacewayFacts;
};

export type RacewayFacts = {
  stickLengthFeet: number | null;
  stickJoint: StickJoint;
  strapSpacingFeet: number;
  strapFromBoxFeet: number;
};

/**
 * Every shipped row starts at zero.
 *
 * The catalog used to carry plausible-looking estimates, which was the worse
 * mistake it looks like the opposite of: a price that is merely *stale* is
 * indistinguishable on screen from a price the user checked, so a bid could be
 * built, sent and won on numbers nobody ever verified. Zero cannot be mistaken
 * for a quote. The Materials screen flags every zero as needing a real price
 * and can filter down to exactly those, which turns "your catalog is unpriced"
 * into a finite, visible worklist instead of a silent wrong answer.
 */
export const UNPRICED = "0.0000";

// ─── Trade sizes ──────────────────────────────────────────────────────────────

/**
 * The nine trade sizes every raceway family ships at, in ascending order.
 *
 * "Trade size" is a name, not a measurement — 1/2" EMT is neither 1/2" inside
 * nor out — so these strings are the identifiers, never numbers to compute on.
 */
export const TRADE_SIZES = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
] as const;

export type TradeSize = (typeof TRADE_SIZES)[number];

/** Flex tops out at 1-1/4" in this catalog — bigger flex is a special order. */
export const FLEX_SIZES = ['1/2"', '3/4"', '1"', '1-1/4"'] as const;

/** Weatherheads start at 1": nobody runs a 1/2" service mast. */
export const MAST_SIZES = [
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
] as const;

/**
 * How each trade size gets typed into a search box, MINUS what the name says.
 *
 * An estimator types "1 1/4" with a space, "1.25" as a decimal, or "one and a
 * quarter" in words, depending on habit and keyboard — a catalog that only
 * matches the spelling in its own name looks empty most of the time.
 *
 * What is deliberately NOT here is the hyphenated form itself. The name already
 * reads `1-1/4" EMT`, and the search index tokenises that to `1-1/4`, so an
 * alias repeating it is dead weight scored below the name it duplicates. Note
 * that the spaced form survives as two useful tokens — `1` and `1/4` — neither
 * of which the hyphenated name contains.
 */
const SIZE_ALIASES: Record<string, string> = {
  '1/2"': "half 0.5 .5",
  '3/4"': "three quarter 0.75 .75",
  '1"': "one inch",
  '1-1/4"': "1 1/4 1.25 one and a quarter",
  '1-1/2"': "1 1/2 1.5 one and a half",
  '2"': "two inch",
  '2-1/2"': "2 1/2 2.5 two and a half",
  '3"': "three inch",
  '4"': "four inch",
};

/** The spellings of a trade size that its own name does not already contain. */
export function sizeAliases(size: string): string {
  return SIZE_ALIASES[size] ?? "";
}

/**
 * Join alias fragments into the single space-separated string the column holds.
 *
 * Deduplicates by word while preserving order, so a generator can hand in the
 * size spellings and the family's slang without checking whether both mention
 * "inch". Phrases are kept whole — see mergeAliases in shared/aliasSuggestions
 * for why phrase-level dedupe matters — this one only drops exact repeats.
 */
export function aliases(...parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const word of part.trim().split(/\s+/)) {
      if (!word || seen.has(word)) continue;
      seen.add(word);
      out.push(word);
    }
  }
  return out.join(" ");
}

/**
 * Drop alias words the material's own name already contains.
 *
 * ── Why this is a pass over the finished catalog, not a rule to remember ─────
 * The alias rule says never restate the name, and every generator here obeys it
 * for the words it knows about. What no generator can see is the collision it
 * causes by combining: `1/2" rigid conduit` gets the family's slang and the
 * shared "conduit raceway" suffix, and only the concatenation reveals that
 * "conduit" is now in both. There were three such collisions across 600 rows
 * and they were invisible in every individual definition.
 *
 * A restated word is not harmful the way a cross-alias is — it is dead weight,
 * scored below the name it duplicates — but dead weight in the search index is
 * how alias lists rot into noise, and the rule is worth keeping absolutely
 * rather than approximately. So it is enforced here, once, and the catalog test
 * asserts the result. Authors write the slang that makes sense for their family
 * and this removes whatever the name already said.
 */
export function dropRestatedWords(
  material: BaselineMaterial
): BaselineMaterial {
  // Two tokenisations, union of both. `wordsInName` keeps hyphens joined so
  // that "1-1/4" stays one token — right for sizes, wrong for words, because it
  // leaves "Single-gang box" looking as though it does not contain "gang". A
  // word only escapes if neither reading finds it in the name.
  const inName = new Set<string>(
    Array.from(wordsInName(material.name)).concat(
      material.name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    )
  );
  /*
    A spoken mixed number — "1 1/2" — is ONE size, and is judged as one.

    Found 2026-09-25, while making "inch" searchable. Read as two words, the
    "1" of "1 1/2" was in the name of `1-1/2" EMT` (the punctuation-stripped
    reading of the name has a bare "1") and was dropped, and the "1/2" was not
    — so the row was left with the alias "1/2" and answered a search for a
    HALF-inch part. Every mixed trade size did the same: 1-1/4" rows offered
    "1/4", 2-1/2" rows "1/2". Joined first, "1-1/2" is recognised as the name's
    own size and goes as a whole.
  */
  const words = material.searchAliases
    .replace(/(^|\s)(\d+) (\d+\/\d+)(?=\s|$)/g, "$1$2-$3")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter(word => !inName.has(word));
  if (kept.join(" ") === material.searchAliases.trim()) {
    return material;
  }
  return { ...material, searchAliases: kept.join(" ") };
}
