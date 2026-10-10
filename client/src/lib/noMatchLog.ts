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

/** The clock the recorder waits on, passed in so a test need not wait. */
export interface MissTimers {
  set: (fire: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

/**
 * One picker opening's worth of no-match recording.
 *
 * `observe` is called whenever the box or its results change. A miss is held
 * for `settleMs` and dropped if the box changes first, so a word typed slowly
 * is not recorded once per prefix.
 *
 * `now` is for the moment the person ACTS on a search that found nothing —
 * Enter, "Count it anyway", "Build it from parts here". Until 2026-10-09 the
 * only path was the timer, so a fast type-and-Enter inside the settle time
 * never logged at all, and those are the most decided searches there are
 * (todo.md § "When the picker finds nothing"). Acting is the settle: the
 * words are final, so they are recorded at once and the timer is dropped.
 *
 * `dispose` drops a pending miss WITHOUT recording it. Closing a picker on
 * half-typed words is not a search anybody finished.
 */
export function createMissRecorder(
  send: (words: string) => void,
  timers: MissTimers,
  settleMs: number
) {
  const sent = new Set<string>();
  let pending: { words: string; handle: unknown } | null = null;

  const cancel = () => {
    if (pending) timers.clear(pending.handle);
    pending = null;
  };
  const fire = (words: string) => {
    pending = null;
    sent.add(words);
    send(words);
  };

  return {
    observe(candidate: Omit<MissCandidate, "alreadySent">) {
      cancel();
      const words = missToRecord({ ...candidate, alreadySent: sent });
      if (words === null) return;
      const handle = timers.set(() => fire(words), settleMs);
      pending = { words, handle };
    },
    now() {
      if (!pending) return;
      const { words } = pending;
      cancel();
      fire(words);
    },
    dispose: cancel,
  };
}
