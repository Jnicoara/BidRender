/**
 * An ink map — which small cells of a page region hold dark drawing — turned
 * into the `InkBounds` the legend reader asks for.
 *
 * Shared by the app and the tests on purpose: the app builds a map from the
 * pixels of the box it just rendered, the tests load one written by
 * scripts/legendFixture.mts from a real plan, and both answer through this one
 * function. So the test exercises the same "is there drawing here, ignoring
 * the text" rule the screen does, not a stand-in.
 */
import type { InkBounds, Rect } from "./legendRead";

export type InkMap = {
  /** Top-left of the mapped region, page points. */
  x: number;
  y: number;
  /** Cell size in page points. */
  cell: number;
  cols: number;
  rows: number;
  /** One bit per cell, row-major, least significant bit first. */
  bits: Uint8Array;
};

/**
 * ── Lines that run straight through are not a symbol ─────────────────────────
 * A legend's frame and a schedule's table rules cross every row's strip from
 * edge to edge. Counted as ink, they made every abbreviation row ("CTR
 * COUNTER") look like it had a symbol. So a column of cells dark for at least
 * THROUGH of the strip's height, or a row dark for THROUGH of its width, is
 * dropped before the bounds are taken. A symbol does not span its whole strip:
 * the strip reaches halfway to the next entry.
 */
const THROUGH = 0.9;

export function inkBoundsFrom(map: InkMap): InkBounds {
  return (rect: Rect, exclude: Rect[]) => {
    const c0 = Math.max(0, Math.floor((rect.x - map.x) / map.cell));
    const c1 = Math.min(
      map.cols - 1,
      Math.floor((rect.x + rect.width - map.x) / map.cell)
    );
    const r0 = Math.max(0, Math.floor((rect.y - map.y) / map.cell));
    const r1 = Math.min(
      map.rows - 1,
      Math.floor((rect.y + rect.height - map.y) / map.cell)
    );
    if (c1 < c0 || r1 < r0) return null;
    const nCols = c1 - c0 + 1;
    const nRows = r1 - r0 + 1;
    const dark = new Uint8Array(nCols * nRows);
    const colCount = new Uint16Array(nCols);
    const rowCount = new Uint16Array(nRows);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const n = r * map.cols + c;
        if (!(map.bits[n >> 3] & (1 << (n & 7)))) continue;
        // The cell's centre, in page points: text under it does not count.
        const px = map.x + (c + 0.5) * map.cell;
        const py = map.y + (r + 0.5) * map.cell;
        if (
          exclude.some(
            t =>
              px >= t.x - 1 &&
              px <= t.x + t.width + 1 &&
              py >= t.y - 1 &&
              py <= t.y + t.height + 1
          )
        ) {
          continue;
        }
        dark[(r - r0) * nCols + (c - c0)] = 1;
        colCount[c - c0]++;
        rowCount[r - r0]++;
      }
    }
    let minC = Infinity;
    let maxC = -Infinity;
    let minR = Infinity;
    let maxR = -Infinity;
    for (let r = r0; r <= r1; r++) {
      if (nCols >= 4 && rowCount[r - r0] >= nCols * THROUGH) continue;
      for (let c = c0; c <= c1; c++) {
        if (!dark[(r - r0) * nCols + (c - c0)]) continue;
        if (nRows >= 4 && colCount[c - c0] >= nRows * THROUGH) continue;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
    if (minC === Infinity) return null;
    return {
      x: map.x + minC * map.cell,
      y: map.y + minR * map.cell,
      width: (maxC - minC + 1) * map.cell,
      height: (maxR - minR + 1) * map.cell,
    };
  };
}

/**
 * Is there a ruled line — a row of cells dark across at least THROUGH of the
 * rect's width — anywhere inside it? A schedule's table puts one between
 * every two entries, and that is what tells two close rows apart from two
 * lines of one entry's description.
 */
export function ruleFrom(map: InkMap): (rect: Rect) => boolean {
  return (rect: Rect) => {
    const c0 = Math.max(0, Math.floor((rect.x - map.x) / map.cell));
    const c1 = Math.min(
      map.cols - 1,
      Math.floor((rect.x + rect.width - map.x) / map.cell)
    );
    // Only cell rows lying WHOLLY inside the rect. A row of capital letters
    // is nearly solid at this cell size, so a rect that so much as grazes a
    // line of text would find a "rule" in it — which split every two-line
    // name on Weld 1 the first time this ran.
    const r0 = Math.max(0, Math.ceil((rect.y - map.y) / map.cell));
    const r1 = Math.min(
      map.rows - 1,
      Math.floor((rect.y + rect.height - map.y) / map.cell) - 1
    );
    const width = c1 - c0 + 1;
    if (width < 4 || r1 < r0) return false;
    for (let r = r0; r <= r1; r++) {
      let dark = 0;
      for (let c = c0; c <= c1; c++) {
        const n = r * map.cols + c;
        if (map.bits[n >> 3] & (1 << (n & 7))) dark++;
      }
      if (dark >= width * THROUGH) return true;
    }
    return false;
  };
}

/**
 * Build a map from RGBA pixels of a rendered region. `scale` is pixels per
 * page point; a cell is dark when any pixel in it is at or below `dark`.
 */
export function inkMapFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: { x: number; y: number },
  scale: number,
  cell = 2,
  dark = 160
): InkMap {
  const per = Math.max(1, Math.round(cell * scale));
  const cols = Math.ceil(width / per);
  const rows = Math.ceil(height / per);
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let py = 0; py < height; py++) {
    const r = Math.floor(py / per);
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const lum =
        0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      if (lum > dark) continue;
      const n = r * cols + Math.floor(px / per);
      bits[n >> 3] |= 1 << (n & 7);
    }
  }
  return { x: region.x, y: region.y, cell: per / scale, cols, rows, bits };
}
