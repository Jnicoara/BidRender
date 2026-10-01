/**
 * A COUNT in a search — the "2" of "2 gang box", the "3" of "3 hole".
 *
 * ONE rule, read by both halves of material search: the matcher
 * (client/src/lib/smartSearch.ts) and the ranker (shared/materialSearchRank.ts).
 * They each read the count their own way until 2026-09-29, both as "any word
 * that starts with the digit", which is how a count matched SIZES: "2 gang
 * box" put `1/2" weatherproof box, single-gang` above Double-gang box, "3 hole"
 * led with 3/4" straps, "2 pole" with a 20 ft light pole. Fixing the matcher
 * alone left the ranker lifting `1/2"` rows over "Single-gang box" for
 * "1 gang box" — two readings of one query disagree, and the wrong one wins.
 * The count sweep in scripts/searchSpotCheck.mts is the before and after.
 */

/** Words that make the number before them a COUNT — "2 gang", "3 way". */
export const COUNT_NOUN = /^(?:gang|pole|way|hole|head|light|space|circuit)s?$/;

const HAS_DIGIT = /\d/;

/**
 * How a count is spelled out in names and aliases: "Double-gang box",
 * "Single-Pole breaker", "one-hole strap". Not "twin" or "dual": a twin
 * breaker is two breakers in one space, not a 2-pole, and "dual" names
 * functions ("dual-function"), not counts.
 */
const SPELLED_COUNTS: Record<string, readonly string[]> = {
  "1": ["one", "single"],
  "2": ["two", "double"],
  "3": ["three", "triple"],
  "4": ["four", "quad"],
  "5": ["five"],
  "6": ["six"],
};

/** A word without the punctuation a name puts after it ("30-space,"). */
function bare(word: string): string {
  return word.replace(/[,.;:]+$/, "");
}

/**
 * The noun a query word is a count OF, or null when it is not a count: "2"
 * followed by "gang" is a count of gangs; "2" followed by "emt" is a size.
 */
export function countNounAfter(
  word: string,
  next: string | undefined
): string | null {
  return HAS_DIGIT.test(word) && COUNT_NOUN.test(next ?? "") ? next! : null;
}

/**
 * Is this word the COUNT `n` of `noun` — as typed in "2 gang box"?
 *
 * Yes for the number or its spelling JOINED to the noun ("2-gang",
 * "double-gang", "30-space,", "Single-Pole", "3-hole") and the trade
 * shorthand that is the number and the start of the noun ("2g", "2p").
 * Standing ALONE ("2", "two") only when the next word is the noun: a bare
 * "2" or "two" elsewhere is a size's slang ('2" … two inch') or a different
 * count, and took "2 hole" to 2" straps.
 * Never the count of ANOTHER noun ("3-gang" does not answer "3 hole"), and
 * never a SIZE: "2" is not in `20A`, `200A`, `2"`, `2-1/2"` or `1/2"`.
 */
export function wordIsCount(
  word: string,
  n: string,
  noun: string,
  nextWord = ""
): boolean {
  const w = bare(word);
  const singular = noun.replace(/s$/, "");
  const isNoun = (rest: string) =>
    rest !== "" && /^[a-z]+$/.test(rest) && singular.startsWith(rest);
  const spellings = [n, ...(SPELLED_COUNTS[n] ?? [])];
  for (const s of spellings) {
    if (w === s) return isNoun(bare(nextWord).replace(/s$/, ""));
    if (!w.startsWith(s)) continue;
    const rest = w.slice(s.length).replace(/^-/, "").replace(/s$/, "");
    if (isNoun(rest)) return true;
  }
  return false;
}

/** Does this run of words hold the count `n` of `noun`? See wordIsCount. */
export function wordsHoldCount(
  words: readonly string[],
  n: string,
  noun: string
): boolean {
  return words.some((w, i) => wordIsCount(w, n, noun, words[i + 1]));
}

/** The same, for a phrase (lower-case, single-spaced). */
export function phraseHoldsCount(
  phrase: string,
  n: string,
  noun: string
): boolean {
  return wordsHoldCount(phrase.split(" "), n, noun);
}
