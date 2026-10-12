/**
 * THE NOTE FINDER — plain-text "who does this" phrases on the drawings
 * (references/scope-tags-plan.md step 7). No AI: it reads the page text the
 * sheet reader stored at upload (`bid_pdf_sheet_text`) and stores nothing.
 *
 * What it finds is a SUGGESTION. Nothing here sets a tag: the finder lists
 * the sentence, a person ticks the lines it is about, and the tag goes on
 * through `bids.setLineScope` with Undo — the same call as the line menu.
 *
 * ── Not "EXISTING TO REMAIN" ─────────────────────────────────────────────────
 * E.T.R. is a MARK status (the status view owns it), not a who-does-it
 * answer; tagging a line By others from it would be wrong (plan § 0, Q9).
 *
 * ── NIC is a whole word ──────────────────────────────────────────────────────
 * "nic" sits inside MECHANICAL, CLINIC, TECHNICAL. Every phrase here is
 * matched between non-letters, so only a standalone NIC / N.I.C. counts.
 *
 * ── Text arrives in pieces ───────────────────────────────────────────────────
 * The stored text is pdf.js items joined by single spaces, so a sentence a
 * drawing prints on two lines arrives as one run with a space in it. Phrases
 * match across any run of spaces, and the sentence is cut from the joined
 * text, never from one piece.
 */
import type { LineScope } from "./lineScope";

export type ScopePhrase = {
  /** How the finder names it on screen. */
  label: string;
  /** The tag the chooser starts on — the person can pick another. */
  suggests: LineScope;
  /** Words in order, matched case-blind between non-letters, any spacing. */
  pattern: RegExp;
};

/** Words separated by any spacing; dots in an abbreviation optional-spaced. */
const W = String.raw`\s+`;
const edge = (body: string) =>
  new RegExp(String.raw`(?<![A-Za-z])` + body + String.raw`(?![A-Za-z])`, "gi");

/**
 * Longest first: where two overlap ("FURNISHED BY OWNER" holds "BY OWNER"),
 * the longer one wins and the shorter is not reported a second time.
 */
export const SCOPE_PHRASES: readonly ScopePhrase[] = [
  {
    label: "Furnished by others",
    suggests: "by_others",
    pattern: edge(`furnished${W}by${W}others`),
  },
  {
    label: "Furnished by owner",
    suggests: "ofci",
    pattern: edge(`furnished${W}by${W}(?:the${W})?owner`),
  },
  {
    label: "Owner furnished",
    suggests: "ofci",
    pattern: edge(`owner[\\s-]*furnished`),
  },
  {
    label: "Not in contract",
    suggests: "excluded",
    pattern: edge(`not${W}in${W}(?:this${W})?contract`),
  },
  {
    label: "By Division 23 / 27 / 28",
    suggests: "by_others",
    pattern: edge(`by${W}div(?:ision|\\.)?\\s*(?:23|27|28)(?![0-9])`),
  },
  {
    label: "By G.C.",
    suggests: "by_others",
    pattern: edge(`by${W}(?:the${W})?(?:g\\.?\\s*c\\.?|general${W}contractor)`),
  },
  { label: "By others", suggests: "by_others", pattern: edge(`by${W}others`) },
  {
    label: "By owner",
    suggests: "by_others",
    pattern: edge(`by${W}(?:the${W})?owner`),
  },
  { label: "OFCI", suggests: "ofci", pattern: edge(`o\\.?f\\.?c\\.?i\\.?`) },
  {
    label: "OFOI",
    suggests: "by_others",
    pattern: edge(`o\\.?f\\.?o\\.?i\\.?`),
  },
  { label: "CFCI", suggests: "install", pattern: edge(`c\\.?f\\.?c\\.?i\\.?`) },
  {
    label: "N.I.C.",
    suggests: "excluded",
    pattern: edge(`n\\.?\\s?i\\.?\\s?c\\.?`),
  },
];

export type PhraseHit = {
  phrase: ScopePhrase;
  /** Offsets into the space-collapsed text. */
  start: number;
  end: number;
};

/** Runs of whitespace collapsed to one space, trimmed — what offsets index. */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every phrase in `text` (already space-collapsed), in reading order, with a
 * shorter phrase inside a longer one's span dropped.
 */
export function findScopePhrases(text: string): PhraseHit[] {
  const hits: PhraseHit[] = [];
  for (const phrase of SCOPE_PHRASES) {
    phrase.pattern.lastIndex = 0;
    for (const m of Array.from(text.matchAll(phrase.pattern))) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (hits.some(h => start < h.end && end > h.start)) continue;
      hits.push({ phrase, start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** How far either side of the hit a sentence may run before it is cut. */
const SENTENCE_SIDE = 160;

/**
 * Whether the "." at `at` ends a sentence: it is followed by a space (or the
 * end), and the word before it is not a one-letter abbreviation piece — the
 * last dot of "N.I.C." or "G.C." is inside the note, not the end of it.
 */
function endsSentence(text: string, at: number): boolean {
  const mark = text[at];
  if (mark !== "." && mark !== ";") return false;
  if (at + 1 < text.length && text[at + 1] !== " ") return false;
  if (mark === ";") return true;
  // "C." after a space, a dot or the start is one letter of an abbreviation —
  // unless the next note's number follows ("N.I.C. 5. PATCHING …"), or
  // nothing does: then that dot is also the full stop.
  const tail = text.slice(Math.max(0, at - 2), at + 1);
  if (!/(?:^|[\s.])[A-Za-z]\.$/.test(tail)) return true;
  return (
    at + 1 >= text.length || /^ \d{1,2}[.)] /.test(text.slice(at + 1, at + 6))
  );
}

/**
 * The sentence around a hit in space-collapsed text: back to the last
 * sentence end (a note number like "3." is one), forward through the next,
 * cut at SENTENCE_SIDE with "…" so one runaway note cannot fill the panel.
 */
export function sentenceAround(
  text: string,
  hit: { start: number; end: number }
): string {
  const floor = Math.max(0, hit.start - SENTENCE_SIDE);
  let from = hit.start;
  while (from > floor && !endsSentence(text, from - 1)) from--;
  const cutBefore = from === floor && floor > 0;

  const ceiling = Math.min(text.length, hit.end + SENTENCE_SIDE);
  let to = hit.end;
  // The hit's own last dot may be the full stop ("… SITE LIGHTING N.I.C.").
  const endsOnHit = hit.end > hit.start && endsSentence(text, hit.end - 1);
  if (!endsOnHit) while (to < ceiling && !endsSentence(text, to)) to++;
  const cutAfter = !endsOnHit && to === ceiling && ceiling < text.length;
  if (!endsOnHit && !cutAfter && to < text.length) to++; // keep the full stop

  return (
    (cutBefore ? "…" : "") + text.slice(from, to).trim() + (cutAfter ? "…" : "")
  );
}

/** Words that say nothing about WHICH line a note is about. */
const NOT_A_SUBJECT = new Set(
  (
    "the and for all are any per with shall will see note notes not this that " +
    "from into each other others owner owners furnished furnish installed " +
    "install installation provided provide provides contractor contractors " +
    "electrical electric division general work under contract by gc nic ofci " +
    "ofoi cfci new existing where only also as be to of in on at or an a is"
  ).split(" ")
);

/** Lower-case words of three letters or more, a trailing plural "s" dropped. */
function subjectWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const out = new Set<string>();
  for (const word of words) {
    if (NOT_A_SUBJECT.has(word)) continue;
    out.add(
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word
    );
  }
  return out;
}

/**
 * The bid lines that share a subject word with the sentence — "LIGHT
 * FIXTURES FURNISHED BY OWNER" suggests "Light fixture, 2x4 LED". A
 * suggestion only: the finder shows them unticked.
 */
export function linesSharingAWord<L extends { name: string }>(
  sentence: string,
  lines: readonly L[]
): L[] {
  const subject = subjectWords(sentence);
  if (subject.size === 0) return [];
  return lines.filter(line => {
    for (const word of Array.from(subjectWords(line.name)))
      if (subject.has(word)) return true;
    return false;
  });
}

/**
 * LIKE patterns (the column's collation ignores case) that keep every page
 * that COULD hold a phrase above, so MySQL drops the rest before any text
 * leaves the database. Each phrase has a word here that it cannot be written
 * without; `findScopePhrases` then does the exact test. `server/
 * scopePhrases.test.ts` checks every phrase's examples pass one of these.
 */
export const SCOPE_PHRASE_LIKES: readonly string[] = [
  "%others%",
  "%owner%",
  "%contract%",
  "%div%2%",
  "%g.c%",
  "%g. c%",
  "% gc%",
  "%n.i.c%",
  "%n. i. c%",
  "%nic%",
  "%ofci%",
  "%o.f.c.i%",
  "%ofoi%",
  "%o.f.o.i%",
  "%cfci%",
  "%c.f.c.i%",
];
