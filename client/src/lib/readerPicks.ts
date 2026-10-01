/**
 * Which plan-reader suggestions start TICKED, and what ticking one does.
 *
 * ── None start ticked (owner's report, 2026-09-29) ──────────────────────────
 * Until then every "high" suggestion arrived ticked, so "Place N marks" put N
 * marks down at spots nobody had looked at. Measured on staging's E-100 the
 * same day, the reader's positions are off by up to about 2.4 inches of paper
 * (roughly 10 ft at 1/4" = 1'-0"), mostly downward and more so toward the
 * bottom of the sheet — not a fixed offset, so nothing can subtract it. A
 * placed mark then sat beside keynote tag 7 by a door instead of on the A1
 * fixture it named. The app placed it exactly where the reader said, to four
 * decimals; the reader was wrong about where.
 *
 * So a suggestion is placed only after somebody ticked it, and ticking it
 * shows where it is (`spotToShow`). "High" still means the reader is sure
 * WHAT it is. It says nothing about WHERE.
 *
 * Here rather than in the component because vitest reaches client/src/lib
 * and cannot reach a component (CLAUDE.md § "A rule with no red to go to").
 */

export type PickableFinding = {
  id: number;
  acceptable: boolean;
  confidence: string;
  status: string;
  x: number | null;
  y: number | null;
};

/** The suggestions ticked when a reading arrives: none. */
export function initialPicks(
  _findings: readonly PickableFinding[]
): Set<number> {
  return new Set();
}

/**
 * Where to take the drawing when a row is ticked or its Link/Fix is pressed:
 * the spot the reader gave, so the person deciding sees what they decide
 * about. Null when the suggestion has no position, and when a tick is being
 * REMOVED, since there is nothing to check then.
 *
 * **Until 2026-09-30 this comment was the only place that was true.** The
 * spot went to `onJumpTo`, which only drew a ring and never moved the view —
 * at fit a speck, zoomed in often off screen — so Link and ticking looked
 * like they did nothing. The view now moves: TakeoffPage's `jumpTo` hands
 * PlanPane a `focusRequest`, which centres the spot via `centreOn`
 * (client/src/lib/planView.ts, tested there).
 */
export function spotToShow(
  finding: PickableFinding,
  nowTicked: boolean
): { x: number; y: number } | null {
  if (!nowTicked) return null;
  if (finding.x === null || finding.y === null) return null;
  return { x: finding.x, y: finding.y };
}
