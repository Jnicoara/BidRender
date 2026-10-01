/**
 * Cutting a sheet into overlapping pieces, for methods (c) and (d) of
 * scripts/readerAccuracy.mts.
 *
 * A STAND-IN for Phase 10's tiling, not a design for it
 * (references/plan-viewer-overhaul.md § 10-11 decides that). It answers "does
 * reading zoomed in help, and by how much", nothing more.
 *
 * Two rules, both there so the test measures the READER rather than this file:
 *
 * - **Pieces overlap**, so a symbol sitting on a seam is whole in at least one
 *   of them. Without overlap, a symbol cut in half would be a miss that only
 *   the cutting caused.
 * - **Each point of the sheet is OWNED by exactly one piece** (its "core"), and
 *   a piece's findings are kept only inside its core. Without that, a symbol in
 *   an overlap would be reported twice and scored as an extra that only the
 *   cutting caused.
 */

/** One piece, in PDF page points. */
export type Tile = {
  row: number;
  col: number;
  /** The area rendered and sent. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The area whose findings this piece keeps. Cores tile the page exactly. */
  core: { x0: number; y0: number; x1: number; y1: number };
};

/** Starts of `count` equal spans of `span` spread across `total`. */
function starts(total: number, span: number, count: number): number[] {
  if (count <= 1) return [0];
  const step = (total - span) / (count - 1);
  return Array.from({ length: count }, (_, i) => i * step);
}

/** How many spans of `span`, overlapping by at least `overlap`, cover `total`. */
function countFor(total: number, span: number, overlap: number): number {
  if (span >= total) return 1;
  return Math.ceil((total - overlap) / (span - overlap));
}

/**
 * The grid for one page.
 *
 * `tilePoints` is the side of one square piece in page points — the model's
 * largest square image divided by the render scale. On Sonnet 5 at 150 px per
 * inch that is 1932 px / 150 * 72 = 927 pt, 12.9 inches of paper.
 */
export function tileGrid(
  pageWidth: number,
  pageHeight: number,
  tilePoints: number,
  minOverlapPoints: number
): Tile[] {
  if (!(tilePoints > minOverlapPoints) || minOverlapPoints < 0) {
    throw new Error("A tile must be larger than its overlap.");
  }
  const width = Math.min(tilePoints, pageWidth);
  const height = Math.min(tilePoints, pageHeight);
  const cols = countFor(pageWidth, width, minOverlapPoints);
  const rows = countFor(pageHeight, height, minOverlapPoints);
  const xs = starts(pageWidth, width, cols);
  const ys = starts(pageHeight, height, rows);

  // A core boundary sits in the middle of each overlap, so neighbouring cores
  // meet exactly and every point belongs to one piece.
  const bounds = (s: number[], span: number, total: number) =>
    s.map((start, i) => ({
      from: i === 0 ? 0 : (s[i - 1] + span + start) / 2,
      to: i === s.length - 1 ? total : (start + span + s[i + 1]) / 2,
    }));
  const colBounds = bounds(xs, width, pageWidth);
  const rowBounds = bounds(ys, height, pageHeight);

  const tiles: Tile[] = [];
  ys.forEach((y, row) =>
    xs.forEach((x, col) =>
      tiles.push({
        row,
        col,
        x,
        y,
        width,
        height,
        core: {
          x0: colBounds[col].from,
          y0: rowBounds[row].from,
          x1: colBounds[col].to,
          y1: rowBounds[row].to,
        },
      })
    )
  );
  return tiles;
}

/**
 * Whether a finding at page point (x, y) belongs to this piece. The low edge
 * is inclusive and the high edge exclusive, except at the page's own far edge,
 * so a point on a boundary is owned once and never twice or not at all.
 */
export function ownedBy(
  tile: Tile,
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number
): boolean {
  const { x0, y0, x1, y1 } = tile.core;
  const inX = x >= x0 && (x < x1 || (x1 >= pageWidth && x <= x1));
  const inY = y >= y0 && (y < y1 || (y1 >= pageHeight && y <= y1));
  return inX && inY;
}
