/**
 * Editing a finished run's points: move one, add one, remove one (T8, D7a).
 *
 * Pure, so the rules can go red in a test; TraceLayer only carries them out.
 *
 * ── The two rules that are not obvious ──────────────────────────────────────
 * - **An end on a branch tee does not move.** The server pins it back to the
 *   tee (`pinTeeEnds` in takeoffRunsRouter), so a handle that moved and then
 *   snapped back would read as a bug. It is refused here, before the drag.
 * - **A run keeps at least two points.** Fewer is not a run, and the server
 *   refuses it too; removing the second-to-last point is refused here so the
 *   screen never sends it.
 */

export type PagePoint = { x: number; y: number };

/** Which ends sit on a branch tee. */
export type PinnedEnds = { start: boolean; end: boolean };

export function isPinned(
  index: number,
  count: number,
  pinned: PinnedEnds
): boolean {
  return (index === 0 && pinned.start) || (index === count - 1 && pinned.end);
}

/** The points with one moved, or null when that point may not move. */
export function movePoint(
  points: readonly PagePoint[],
  index: number,
  to: PagePoint,
  pinned: PinnedEnds
): PagePoint[] | null {
  if (index < 0 || index >= points.length) return null;
  if (isPinned(index, points.length, pinned)) return null;
  return points.map((p, i) => (i === index ? { x: to.x, y: to.y } : p));
}

/** A new point on segment `segment` (between `segment` and `segment + 1`). */
export function insertPoint(
  points: readonly PagePoint[],
  segment: number,
  at: PagePoint
): PagePoint[] | null {
  if (segment < 0 || segment >= points.length - 1) return null;
  return [
    ...points.slice(0, segment + 1),
    { x: at.x, y: at.y },
    ...points.slice(segment + 1),
  ];
}

/** The points without one, or null when that would break the run. */
export function removePoint(
  points: readonly PagePoint[],
  index: number,
  pinned: PinnedEnds
): PagePoint[] | null {
  if (index < 0 || index >= points.length) return null;
  if (points.length <= 2) return null;
  if (isPinned(index, points.length, pinned)) return null;
  return points.filter((_, i) => i !== index);
}

/** Where the "+" handles go: the middle of each segment. */
export function segmentMidpoints(
  points: readonly PagePoint[]
): { segment: number; at: PagePoint }[] {
  const out: { segment: number; at: PagePoint }[] = [];
  for (let i = 0; i < points.length - 1; i++)
    out.push({
      segment: i,
      at: {
        x: (points[i].x + points[i + 1].x) / 2,
        y: (points[i].y + points[i + 1].y) / 2,
      },
    });
  return out;
}

/** Whether two point lists are the same — a drag that went nowhere saves nothing. */
export function samePoints(
  a: readonly PagePoint[],
  b: readonly PagePoint[]
): boolean {
  return (
    a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
  );
}
