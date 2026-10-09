/**
 * "Fix these" — the bid screen's warning strips walking the "Fix this line"
 * panel one flagged line at a time (never-stuck-plan.md, gap 11's last
 * sentence; Track B 2026-10-08).
 *
 * A strip says HOW MANY ("3 lines have hours not set"); only the line says
 * WHICH. Without the walk, fixing three meant scrolling for each amber word.
 * With it, the strip's button opens the first line's panel, and saving (or
 * Skip) opens the next one, in the order the lines sit on the screen.
 *
 * The decisions live here rather than in `BidsPage.tsx` because vitest can
 * reach `client/src/lib` and cannot reach a page (CLAUDE.md § "a rule with no
 * red to go to is an instruction").
 */
import { hasLineFixGap, type LineFixGaps } from "@shared/lineFix";

/**
 * Which strip started the walk. Each one walks only the lines its own count
 * is about, so "Fix these" under "2 lines have hours not set" never opens a
 * line whose only gap is a part price.
 *
 *   notPriced  the "N lines are not priced" strip — its lines that the panel
 *              can fix (a hand-priced line has its own fields instead)
 *   material   "labor but no material price"
 *   parts      "N parts are not priced"
 *   hours      "hours not set"
 *   runHours   "labor not priced" on traced runs
 *   rate       "hours but no labor rate"
 */
export type FixWalkKind =
  | "notPriced"
  | "material"
  | "parts"
  | "hours"
  | "runHours"
  | "rate";

/** One bid line as the walk reads it, in screen order. */
export type FixWalkItem = {
  id: number;
  /** What the panel can fix on it; NO_GAPS on a line it cannot open on. */
  gaps: LineFixGaps;
  /** Its cost cell says "Not priced" (`lineNotPriced`). */
  notPriced: boolean;
};

export type FixWalk = {
  kind: FixWalkKind;
  /** The line ids the walk will visit, fixed when it starts. */
  ids: number[];
  /** Where it is in `ids`. */
  index: number;
};

/** Whether this line belongs to the walk a given strip starts. */
export function walkMatches(kind: FixWalkKind, item: FixWalkItem): boolean {
  if (kind === "notPriced") return item.notPriced && hasLineFixGap(item.gaps);
  return item.gaps[kind];
}

/** How many lines a strip's "Fix these" would visit. 0 hides the button. */
export function walkCount(
  kind: FixWalkKind,
  items: readonly FixWalkItem[]
): number {
  return items.filter(i => walkMatches(kind, i)).length;
}

/** Start a walk on the first matching line, or null when there is none. */
export function startWalk(
  kind: FixWalkKind,
  items: readonly FixWalkItem[]
): FixWalk | null {
  const ids = items.filter(i => walkMatches(kind, i)).map(i => i.id);
  return ids.length > 0 ? { kind, ids, index: 0 } : null;
}

/** The line the walk has open now. */
export function walkLineId(walk: FixWalk): number {
  return walk.ids[walk.index];
}

/**
 * The next line to open, read against the bid AS IT IS NOW, or null when the
 * walk is over.
 *
 * Read fresh because a save can fix lines further down: "Update 2 other lines
 * on this bid?" fixes them in place, and opening one of those next would show
 * a panel with nothing left to do. A line that left the bid is passed over
 * the same way. A line the person SKIPPED is behind the walk and never comes
 * back round — Skip means "not now", and a walk that loops is one nobody can
 * finish.
 */
export function nextInWalk(
  walk: FixWalk,
  items: readonly FixWalkItem[]
): FixWalk | null {
  for (let i = walk.index + 1; i < walk.ids.length; i += 1) {
    const item = items.find(it => it.id === walk.ids[i]);
    if (item && walkMatches(walk.kind, item)) return { ...walk, index: i };
  }
  return null;
}

/** "Line 2 of 5", from the walk's own list, so it never jumps backwards. */
export function walkPosition(walk: FixWalk): string {
  return `Line ${walk.index + 1} of ${walk.ids.length}`;
}
