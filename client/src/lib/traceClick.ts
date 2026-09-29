/**
 * Whether a click while tracing adds a point.
 *
 * Finishing a trace with a double-click fires TWO presses, and each one used to
 * append a point. When the mouse drifted a pixel between them the run ended in
 * a stub pointing any direction at all, and the bend counter read the turn
 * onto it as a corner — an elbow on the bid nobody drew
 * (server/runBends.test.ts, "a near-duplicate end point"). So a press that
 * lands within REPEAT_CLICK_PX of the previous point, on SCREEN, adds nothing.
 *
 * On screen rather than on paper because the drift is a hand's, not the
 * drawing's: 4 px is 21 page points at 19% zoom and under one at 600%.
 * `shared/runBends.ts` STUB_POINTS is the backstop for runs saved before this.
 */
export const REPEAT_CLICK_PX = 4;

type Point = { x: number; y: number };

/**
 * `pagePerScreenPx` converts: how many page points one screen pixel covers at
 * the current zoom. Pass it measured, never assumed — see TraceLayer.
 */
export function addsTracePoint(
  points: readonly Point[],
  next: Point,
  pagePerScreenPx: number
): boolean {
  const last = points[points.length - 1];
  if (!last) return true;
  return (
    Math.hypot(next.x - last.x, next.y - last.y) >=
    REPEAT_CLICK_PX * pagePerScreenPx
  );
}
