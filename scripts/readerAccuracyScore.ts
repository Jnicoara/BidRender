/**
 * Scoring one reading against a hand count, for scripts/readerAccuracy.mts.
 *
 * Pure: no database, no model, no files. It lives apart from the script so the
 * suite can reach it — the numbers in the accuracy table come out of here, and
 * a scorer nobody tested is one more thing that can quietly be wrong.
 *
 * The rules are in references/reader-accuracy-test-plan.md § 2, "The numbers
 * to record". In short, each of your marks ends up as exactly ONE of found,
 * wrong symbol or missed, so those three always add up to your count; and
 * every AI suggestion that is not matched to a mark is an extra.
 */
import { symbolLookupKey } from "../shared/takeoffCounts";

/** One symbol you marked by hand. Position in PDF page points. */
export type HandMark = { label: string; x: number; y: number };

/** One AI suggestion. Position in PDF page points, null when it gave none. */
export type Suggestion = {
  label: string | null;
  x: number | null;
  y: number | null;
  /** The AI said it could not make this one out. */
  unreadable: boolean;
};

export type TypeTally = {
  byHand: number;
  found: number;
  wrong: number;
  missed: number;
  /** Suggestions of this type that matched nothing. */
  extra: number;
};

export type Score = {
  byHand: number;
  /** Right place, right symbol. */
  found: number;
  /** Right place, wrong symbol. */
  wrong: number;
  /** Your mark, no suggestion near it. Includes `flagged`. */
  missed: number;
  /** A suggestion near none of your marks, or with no position at all. */
  extra: number;
  /** Of the missed: how many the AI at least flagged as unreadable. */
  flagged: number;
  /** Unreadable flags near none of your marks. Not counted as extra. */
  flagsOnNothing: number;
  /** Of the extras: how many came with no position. */
  unplaced: number;
  /** By symbol type, keyed on the normalised label. */
  byType: Map<string, TypeTally>;
};

/** The label two names are compared on. The same key the legend uses. */
export function labelKey(label: string | null | undefined): string {
  return label ? symbolLookupKey(label) : "";
}

type Pair = { mark: number; guess: number; distance: number };

/**
 * Pair marks with suggestions, nearest first, each used at most once.
 * `usedMarks` and `usedGuesses` are updated in place.
 */
function pairUp(
  marks: HandMark[],
  guesses: Suggestion[],
  radius: number,
  usedMarks: Set<number>,
  usedGuesses: Set<number>,
  accept: (mark: HandMark, guess: Suggestion) => boolean
): Pair[] {
  const candidates: Pair[] = [];
  marks.forEach((mark, m) => {
    if (usedMarks.has(m)) return;
    guesses.forEach((guess, g) => {
      if (usedGuesses.has(g) || guess.x === null || guess.y === null) return;
      if (!accept(mark, guess)) return;
      const distance = Math.hypot(mark.x - guess.x, mark.y - guess.y);
      if (distance <= radius) candidates.push({ mark: m, guess: g, distance });
    });
  });
  // Nearest first; ties broken by index so the result never depends on sort
  // stability.
  candidates.sort(
    (a, b) => a.distance - b.distance || a.mark - b.mark || a.guess - b.guess
  );
  const pairs: Pair[] = [];
  for (const c of candidates) {
    if (usedMarks.has(c.mark) || usedGuesses.has(c.guess)) continue;
    usedMarks.add(c.mark);
    usedGuesses.add(c.guess);
    pairs.push(c);
  }
  return pairs;
}

/**
 * Score one reading.
 *
 * Order matters and is the whole design: a right-symbol suggestion claims its
 * mark before a wrong-symbol one can, even if the wrong one sits closer; then
 * wrong-symbol suggestions; then unreadable flags, which never count as found.
 */
export function scoreReading(
  marks: HandMark[],
  suggestions: Suggestion[],
  radius: number
): Score {
  const usedMarks = new Set<number>();
  const usedGuesses = new Set<number>();
  const readable = (g: Suggestion) => !g.unreadable;

  const found = pairUp(
    marks,
    suggestions,
    radius,
    usedMarks,
    usedGuesses,
    (m, g) =>
      readable(g) &&
      labelKey(g.label) !== "" &&
      labelKey(g.label) === labelKey(m.label)
  );
  const wrong = pairUp(
    marks,
    suggestions,
    radius,
    usedMarks,
    usedGuesses,
    (_m, g) => readable(g)
  );
  // Flags are paired against marks nothing else claimed. They do not take the
  // mark off the missed list; they only say the AI pointed at it.
  const flagMarks = new Set(usedMarks);
  const flagged = pairUp(
    marks,
    suggestions,
    radius,
    flagMarks,
    usedGuesses,
    (_m, g) => g.unreadable
  );

  const byType = new Map<string, TypeTally>();
  const tally = (key: string) => {
    let t = byType.get(key);
    if (!t) {
      t = { byHand: 0, found: 0, wrong: 0, missed: 0, extra: 0 };
      byType.set(key, t);
    }
    return t;
  };

  marks.forEach(m => (tally(labelKey(m.label)).byHand += 1));
  found.forEach(p => (tally(labelKey(marks[p.mark].label)).found += 1));
  wrong.forEach(p => (tally(labelKey(marks[p.mark].label)).wrong += 1));
  marks.forEach((m, i) => {
    if (!usedMarks.has(i)) tally(labelKey(m.label)).missed += 1;
  });

  let extra = 0;
  let unplaced = 0;
  let flagsOnNothing = 0;
  suggestions.forEach((g, i) => {
    if (usedGuesses.has(i)) return;
    if (g.unreadable) {
      flagsOnNothing += 1;
      return;
    }
    extra += 1;
    if (g.x === null || g.y === null) unplaced += 1;
    tally(labelKey(g.label) || "(no label)").extra += 1;
  });

  return {
    byHand: marks.length,
    found: found.length,
    wrong: wrong.length,
    missed: marks.length - usedMarks.size,
    extra,
    flagged: flagged.length,
    flagsOnNothing,
    unplaced,
    byType,
  };
}

/** Hand-count labels that match no legend label: almost always a typo. */
export function unmatchedLabels(
  marks: HandMark[],
  legendLabels: string[]
): string[] {
  const legend = new Set(legendLabels.map(labelKey));
  const missing = new Set<string>();
  for (const m of marks) {
    if (!legend.has(labelKey(m.label))) missing.add(m.label);
  }
  return Array.from(missing).sort();
}
