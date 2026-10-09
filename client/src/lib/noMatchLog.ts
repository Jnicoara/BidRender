/**
 * When a picker's search counts as a miss worth recording — the decision
 * behind `useNoMatchLog`, kept here so the suite can reach it
 * (CLAUDE.md: a rule with no red to go to is an instruction).
 *
 * See shared/searchMiss.ts for what the log is and is not.
 */
import { normalizeMissWords } from "@shared/searchMiss";

export interface MissCandidate {
  /** What is in the box right now, as typed. */
  query: string;
  /** How many results the picker is showing for it. */
  resultCount: number;
  /**
   * The list the picker searches has arrived. Until then every search finds
   * nothing, and recording that would fill the log with the catalog's own
   * loading time.
   */
  ready: boolean;
  /** Words this picker has already recorded while it has been open. */
  alreadySent: ReadonlySet<string>;
}

/** The words to record, or NULL when this is not a miss to record. */
export function missToRecord(candidate: MissCandidate): string | null {
  if (!candidate.ready) return null;
  if (candidate.resultCount > 0) return null;
  const words = normalizeMissWords(candidate.query);
  if (words === null) return null;
  // Once per picker opening: retyping the same words, or the box sitting on
  // them while something unrelated re-renders, is still one search.
  if (candidate.alreadySent.has(words)) return null;
  return words;
}
