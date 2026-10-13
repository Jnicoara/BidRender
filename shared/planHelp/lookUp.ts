/**
 * "Look up a word or symbol" — the search behind the Legend tab's box and the
 * line under Copy text (references/plan-reading-help-plan.md § 1, § 2).
 *
 * Pure, so the rules have a red to go to (`server/planHelpLookUp.test.ts`).
 * Nothing here calls a model or the server: it works with AI switched off.
 */
import { ABBREVIATIONS, type Abbreviation } from "./abbreviations";
import { DEFAULT_TRADE, type TradeId } from "../trades";

/**
 * One spelling, however it was typed or printed: `W.P.`, `w/p` and `WP` are
 * the same key, and so are `(E)` and `e`, `J-BOX` and `jbox`.
 */
export function planWordKey(text: string): string {
  return text.toLowerCase().replace(/[\s./()\-]+/g, "");
}

/** How a hit was found — the order the answers are listed in. */
export type LookUpHow = "spelling" | "starts" | "words";

export type LookUpHit = { entry: Abbreviation; how: LookUpHow };

const RANK: Record<LookUpHow, number> = { spelling: 0, starts: 1, words: 2 };

/** The shortest key a "starts with" or "in the words" match is tried at. */
const STARTS_MIN = 2;
const WORDS_MIN = 3;

/**
 * The guide's answers for what was typed. An abbreviation spelled exactly
 * comes first, then abbreviations it is the start of, then entries whose
 * meaning or plain words contain it ("homerun" finds HR, "weatherproof"
 * finds WP) — so an abbreviation always ranks above a word that merely
 * mentions it.
 */
export function lookUpAbbreviations(
  query: string,
  {
    trade = DEFAULT_TRADE,
    entries = ABBREVIATIONS,
  }: { trade?: TradeId; entries?: readonly Abbreviation[] } = {}
): LookUpHit[] {
  const q = planWordKey(query);
  if (!q) return [];
  const hits: LookUpHit[] = [];
  for (const entry of entries) {
    if (entry.trade !== trade) continue;
    const keys = entry.spellings.map(planWordKey);
    let how: LookUpHow | null = null;
    if (keys.includes(q)) how = "spelling";
    else if (q.length >= STARTS_MIN && keys.some(k => k.startsWith(q)))
      how = "starts";
    else if (q.length >= WORDS_MIN && entryWordsKey(entry).includes(q))
      how = "words";
    if (how) hits.push({ entry, how });
  }
  return hits.sort(
    (a, b) =>
      RANK[a.how] - RANK[b.how] ||
      a.entry.abbr.length - b.entry.abbr.length ||
      a.entry.abbr.localeCompare(b.entry.abbr)
  );
}

/** The words of an entry, as one key: "Home run" → "homerun". */
function entryWordsKey(entry: Abbreviation): string {
  return planWordKey(
    [...entry.means.map(m => m.meaning), entry.plain].join(" ")
  );
}

/**
 * This set's own legend items that answer the query — shown FIRST, above the
 * guide, because the drawing in front of the person is the one that is right
 * for this job (§ 2). A label answers when one of its words IS the query, or
 * (from three letters) when the label contains it.
 */
export function legendMatches<T extends { label: string }>(
  query: string,
  items: readonly T[]
): T[] {
  const q = planWordKey(query);
  if (!q) return [];
  return items.filter(item => {
    const words = item.label.split(/\s+/).map(planWordKey);
    if (words.includes(q)) return true;
    return q.length >= WORDS_MIN && planWordKey(item.label).includes(q);
  });
}

/** A hit found in a run of printed text, as it was printed. */
export type TextAbbreviation = { printed: string; entry: Abbreviation };

/**
 * The abbreviations in a run of text read off a sheet — the line under Copy
 * text's result. Stricter than the search box, because nobody typed this:
 *
 * - **Printed in capitals only.** Drawing text is upper case; a lower-case
 *   word is ordinary English ("ex", "hp" in a sentence) and is left alone.
 * - **A one-letter spelling only in brackets.** `(E)` is "existing"; a bare
 *   `C` or `F` in a box of text is far more often a grid line, a panel name
 *   or a fixture type than "conduit" or "floor".
 *
 * Each entry once, in the order first printed.
 */
export function abbreviationsInText(
  text: string,
  {
    trade = DEFAULT_TRADE,
    entries = ABBREVIATIONS,
  }: { trade?: TradeId; entries?: readonly Abbreviation[] } = {}
): TextAbbreviation[] {
  const byKey = new Map<string, Abbreviation>();
  for (const entry of entries) {
    if (entry.trade !== trade) continue;
    for (const s of entry.spellings) byKey.set(planWordKey(s), entry);
  }
  const found: TextAbbreviation[] = [];
  const seen = new Set<Abbreviation>();
  for (const raw of text.split(/[\s,;:]+/)) {
    // Trailing full stops and stray punctuation go; brackets stay, because
    // they are what makes "(E)" mean something.
    const token = raw.replace(/^[^A-Za-z0-9(Ø]+|[^A-Za-z0-9)Ø]+$/g, "");
    if (!token || token !== token.toUpperCase()) continue;
    if (!/[A-ZØ]/.test(token)) continue;
    const key = planWordKey(token);
    const entry = byKey.get(key);
    if (!entry || seen.has(entry)) continue;
    if (key.length === 1 && !(token.startsWith("(") && token.endsWith(")")))
      continue;
    seen.add(entry);
    found.push({ printed: token, entry });
  }
  return found;
}

/** "Home run or Hour" — every meaning, short, for a one-line answer. */
export function meaningsInOneLine(entry: Abbreviation): string {
  return entry.means.map(m => m.meaning).join(" or ");
}
