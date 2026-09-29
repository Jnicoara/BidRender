/**
 * The two figures shown while a run is being traced.
 *
 * - **Run total**: the clicked points only. It is what will be saved, and it
 *   does not move when the mouse does. It is the one number in the pill.
 * - **Next**: the preview segment ONLY, from the last point to the cursor. It
 *   sits beside the cursor as a small dim label.
 *
 * Until 2026-09-29 the pill's second figure was "to cursor": the whole path
 * PLUS the preview. A stray mouse made a big number appear next to the real
 * one, and it read as the run. The save never included it (the server
 * recomputes length from the stored points), but a screen that shows a wrong
 * run length is still wrong. Keeping `hover` out of `runTotal` is the whole
 * point of this function, and traceReadout.test.ts fails if it leaks back in.
 */
import { pathRealInches, type PagePoint } from "@shared/takeoffGeometry";

export type TraceReadout = {
  /** Real inches along the clicked points. Null without a scale or a segment. */
  runTotal: number | null;
  /** Real inches from the last clicked point to the cursor, or null. */
  next: number | null;
};

export function traceReadout(
  points: readonly PagePoint[],
  hover: PagePoint | null,
  ratio: number | null
): TraceReadout {
  if (ratio === null) return { runTotal: null, next: null };
  const last = points[points.length - 1];
  return {
    runTotal: pathRealInches([...points], ratio),
    next: last && hover ? pathRealInches([last, hover], ratio) : null,
  };
}
