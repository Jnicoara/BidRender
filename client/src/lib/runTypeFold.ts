/**
 * Which run types the picker shows at once, and which sit behind its ONE
 * "Underground (N)" fold (references/per-foot-items-plan.md § 3b; CLAUDE.md
 * § Customization: the common few visible, ours behind one control, theirs
 * never hidden).
 *
 * Here rather than in RunTypePicker so the suite can reach it — a rule about
 * what is hidden is exactly the kind that goes wrong quietly.
 */
import {
  UNDERGROUND_SCHEDULES,
  isShippedUndergroundType,
  undergroundSchedule,
} from "@shared/undergroundRunTypes";
import { compareBySize } from "@shared/materialSizeOrder";

/** A schedule's place in the fold; a label naming neither goes last. */
function scheduleRank(label: string): number {
  const schedule = undergroundSchedule(label);
  return schedule === null
    ? UNDERGROUND_SCHEDULES.length
    : UNDERGROUND_SCHEDULES.indexOf(schedule);
}

export type FoldableRunType = { id: number; isShipped: boolean; label: string };

export type RunTypeFold<T> = {
  /** Shown without opening anything. */
  shown: T[];
  /** Behind the fold. Empty while searching: a match is never hidden. */
  folded: T[];
  /** Whether the fold starts OPEN — the armed type is in it. */
  openAtStart: boolean;
};

/**
 * @param types  every type of this path type, in palette order
 * @param query  the search box; non-empty means the caller is showing search
 *               results, and nothing is folded
 * @param max    how many unfolded rows the palette shows
 * @param armedId the type armed now, if any
 */
export function foldRunTypes<T extends FoldableRunType>(
  types: readonly T[],
  query: string,
  max: number,
  armedId: number | null
): RunTypeFold<T> {
  if (query.trim()) return { shown: [], folded: [], openAtStart: false };
  // SCHEDULE first — Sch 40, then Sch 80 — then by SIZE (sch80-and-500 plan
  // § 1c): sorting by size alone left the two schedules' ties in palette
  // order, interleaved. Never by the alphabet, which files 1-1/2" before
  // 1-1/4" (seen on screen 2026-10-08; CLAUDE.md § sort order). The labels
  // lead with the trade size, which is what compareBySize reads.
  const folded = types
    .filter(isShippedUndergroundType)
    .sort(
      (a, b) =>
        scheduleRank(a.label) - scheduleRank(b.label) ||
        compareBySize(a.label, b.label)
    );
  const shown = types.filter(t => !isShippedUndergroundType(t)).slice(0, max);
  return {
    shown,
    folded,
    // Opening on a closed fold that hides the armed type would show no tick
    // anywhere, which reads as "nothing is armed".
    openAtStart: armedId !== null && folded.some(t => t.id === armedId),
  };
}
