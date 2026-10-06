/**
 * WHICH PLAN A VECTOR FIND IS ON — by the plan's printed title, as scans
 * already do (@/lib/scanMatching `planTitles` / `planRegions`). Built
 * 2026-10-06 (track-c) because CAD layers alone cannot be trusted with
 * demolition: on Weld 1 E-200 the demolition plan draws its devices on the
 * EXISTING layer and its 4 panelboards on the NEW one, so 4 of its 21 finds
 * came back clear — countable by "Confirm all" as new work.
 *
 * The same title reading as scans, with one difference that matters on a
 * vector sheet: a region is grown LEFT to the white gap before it, as well
 * as trimmed right at the gap after it. Scans place a plan from its title's
 * left edge (minus 4 title heights); on E-200 that started the demolition
 * plan at x 1,643 while its drawing starts near 1,350, and 4 of its finds
 * sat in no plan. The scan path is NOT changed — its measured results
 * (85/85, demolition 8/8 and 37/37) depend on it as it is.
 *
 * The ink map comes from the line work itself, as the scan path makes one
 * from pixels. Pure, so the rules are tested here.
 */
import {
  PLAN_GAP_POINTS,
  planRegions,
  planTitles,
  regionAt,
  type InkMap,
  type PlanRegion,
} from "./scanMatching";
import type { WordBox } from "./textSelection";

/** Ink map cell, in points: fine enough for a 72 pt gap, coarse enough to be cheap. */
const INK_CELL = 8;

/** Which cells of the page hold line work (any segment's midpoint). */
export function inkFromSegments(
  segs: Float32Array,
  pageWidth: number,
  pageHeight: number
): InkMap {
  const cols = Math.max(1, Math.ceil(pageWidth / INK_CELL));
  const rows = Math.max(1, Math.ceil(pageHeight / INK_CELL));
  const data = new Uint8Array(cols * rows);
  for (let i = 0; i < segs.length / 4; i++) {
    const c = Math.floor((segs[i * 4] + segs[i * 4 + 2]) / 2 / INK_CELL);
    const r = Math.floor((segs[i * 4 + 1] + segs[i * 4 + 3]) / 2 / INK_CELL);
    if (c >= 0 && c < cols && r >= 0 && r < rows) data[r * cols + c] = 1;
  }
  return { cell: INK_CELL, cols, rows, data };
}

/**
 * Move a region's left edge out to the first white strip at least
 * PLAN_GAP_POINTS wide to its left — the gap between this plan and the one
 * beside it — or to the page edge. Never past another region's right edge.
 */
export function growLeftToInk(
  region: PlanRegion,
  ink: InkMap,
  limit: number
): PlanRegion {
  const r0 = Math.max(0, Math.floor(region.y0 / ink.cell));
  const r1 = Math.min(ink.rows, Math.ceil(region.y1 / ink.cell));
  const rows = Math.max(1, r1 - r0);
  const gapCells = Math.ceil(PLAN_GAP_POINTS / ink.cell);
  const stop = Math.max(0, Math.floor(limit / ink.cell));
  let run = 0;
  for (let c = Math.floor(region.x0 / ink.cell) - 1; c >= stop; c--) {
    let count = 0;
    for (let row = r0; row < r1; row++) count += ink.data[row * ink.cols + c];
    run = count <= 0.01 * rows ? run + 1 : 0;
    if (run >= gapCells)
      return { ...region, x0: Math.min(region.x0, (c + run - 1) * ink.cell) };
  }
  return { ...region, x0: Math.min(region.x0, limit) };
}

/**
 * The plans on a vector sheet, by their titles: trimmed right and grown left
 * to the white gaps in the line work. Empty when the sheet's text names no
 * plan — then nothing is called demolition by title.
 */
export function vectorPlanRegions(
  words: readonly WordBox[],
  segs: Float32Array,
  pageWidth: number,
  pageHeight: number
): PlanRegion[] {
  const titles = planTitles(words);
  if (!titles.length) return [];
  const ink = inkFromSegments(segs, pageWidth, pageHeight);
  const trimmed = planRegions(titles, pageWidth, pageHeight, ink);
  return trimmed.map(r => {
    // Grow left, but never into a region beside it in the same band.
    const limit = Math.max(
      0,
      ...trimmed
        .filter(o => o !== r && o.x1 <= r.x0 && o.y0 < r.y1 && o.y1 > r.y0)
        .map(o => o.x1)
    );
    return growLeftToInk(r, ink, limit);
  });
}

/** The demolition plan a point is on, by title, or null. */
export function demolitionPlanAt(
  regions: readonly PlanRegion[],
  x: number,
  y: number
): string | null {
  const r = regionAt(regions, x, y);
  return r?.demolition ? r.title : null;
}
