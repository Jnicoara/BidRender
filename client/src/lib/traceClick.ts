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

/**
 * THE SECOND PRESS OF A DOUBLE-CLICK, by time as well as distance.
 *
 * Added 2026-09-29 (owner: "stop new short stubs at any zoom"). The 4 px rule
 * above assumed the hand drifts less than 4 px between the two presses. At
 * 19% zoom one screen pixel is about 5 page points, so a double-click that
 * drifted 6 px left a 30-point stub — past the 3-point backstop, read as a
 * corner, bought as an elbow. Distance alone cannot tell that drift from a
 * short segment clicked on purpose; TIME can. A deliberate point is a
 * separate click, well over half a second after the last; the two presses of
 * a double-click are inside the operating system's double-click window.
 *
 * So a press within DOUBLE_PRESS_MS of the previous press AND within
 * DOUBLE_PRESS_PX of the last point adds nothing, at any zoom. The window is
 * Windows' default double-click time; the distance is three times the drift
 * the 4 px rule allowed.
 */
export const DOUBLE_PRESS_MS = 500;
export const DOUBLE_PRESS_PX = 12;

type Point = { x: number; y: number };

/**
 * `pagePerScreenPx` converts: how many page points one screen pixel covers at
 * the current zoom. Pass it measured, never assumed — see TraceLayer.
 *
 * `msSincePreviousPress` is the time since the previous press on the trace,
 * whether or not that one added a point. Omitted, there was none.
 */
export function addsTracePoint(
  points: readonly Point[],
  next: Point,
  pagePerScreenPx: number,
  msSincePreviousPress: number = Number.POSITIVE_INFINITY
): boolean {
  const last = points[points.length - 1];
  if (!last) return true;
  const d = Math.hypot(next.x - last.x, next.y - last.y);
  if (d < REPEAT_CLICK_PX * pagePerScreenPx) return false;
  if (
    msSincePreviousPress < DOUBLE_PRESS_MS &&
    d < DOUBLE_PRESS_PX * pagePerScreenPx
  )
    return false;
  return true;
}
