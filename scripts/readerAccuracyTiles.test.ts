import { describe, expect, it } from "vitest";
import { ownedBy, tileGrid } from "./readerAccuracyTiles";

/** Sonnet 5's largest square (1932 px) at 150 px per inch, in points. */
const TILE = (1932 / 150) * 72;
const OVERLAP = 36; // half an inch

// Shapes chosen to differ from each other and from the square tile on
// purpose (CLAUDE.md, "A test fixture shaped like its container"): a 36x24
// sheet, a 42x30 sheet, and a strip shorter than one tile in one direction
// only, which is the case where rows and columns must be decided separately.
const SHEETS = {
  "36x24": { w: 36 * 72, h: 24 * 72, cols: 3, rows: 2 },
  "42x30": { w: 42 * 72, h: 30 * 72, cols: 4, rows: 3 },
  "36x8 strip": { w: 36 * 72, h: 8 * 72, cols: 3, rows: 1 },
};

describe("tileGrid", () => {
  for (const [name, s] of Object.entries(SHEETS)) {
    it(`${name}: ${s.cols}x${s.rows} pieces, each within the page`, () => {
      const tiles = tileGrid(s.w, s.h, TILE, OVERLAP);
      expect(tiles).toHaveLength(s.cols * s.rows);
      expect(new Set(tiles.map(t => t.col)).size).toBe(s.cols);
      expect(new Set(tiles.map(t => t.row)).size).toBe(s.rows);
      for (const t of tiles) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.width).toBeLessThanOrEqual(s.w + 1e-6);
        expect(t.y + t.height).toBeLessThanOrEqual(s.h + 1e-6);
        // The core lies inside what is rendered, so a kept finding was seen.
        expect(t.core.x0).toBeGreaterThanOrEqual(t.x - 1e-6);
        expect(t.core.x1).toBeLessThanOrEqual(t.x + t.width + 1e-6);
        expect(t.core.y0).toBeGreaterThanOrEqual(t.y - 1e-6);
        expect(t.core.y1).toBeLessThanOrEqual(t.y + t.height + 1e-6);
      }
    });

    it(`${name}: neighbours overlap by at least the minimum`, () => {
      const tiles = tileGrid(s.w, s.h, TILE, OVERLAP);
      const row0 = tiles.filter(t => t.row === 0);
      for (let i = 1; i < row0.length; i++) {
        const overlap = row0[i - 1].x + row0[i - 1].width - row0[i].x;
        expect(overlap).toBeGreaterThanOrEqual(OVERLAP - 1e-6);
      }
    });

    it(`${name}: every point is owned by exactly one piece`, () => {
      const tiles = tileGrid(s.w, s.h, TILE, OVERLAP);
      // A lattice that lands on core boundaries and on the page's far edges.
      const xs = [
        0,
        s.w,
        ...tiles.map(t => t.core.x0),
        ...tiles.map(t => t.core.x1),
      ];
      const ys = [
        0,
        s.h,
        ...tiles.map(t => t.core.y0),
        ...tiles.map(t => t.core.y1),
      ];
      for (let i = 0; i <= 40; i++) xs.push((s.w * i) / 40);
      for (let i = 0; i <= 40; i++) ys.push((s.h * i) / 40);
      for (const x of xs)
        for (const y of ys) {
          const owners = tiles.filter(t => ownedBy(t, x, y, s.w, s.h));
          expect(owners.length, `(${x}, ${y})`).toBe(1);
        }
    });
  }

  it("a page smaller than one piece is one piece", () => {
    const tiles = tileGrid(11 * 72, 8.5 * 72, TILE, OVERLAP);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].width).toBe(11 * 72);
    expect(tiles[0].height).toBe(8.5 * 72);
  });

  it("refuses an overlap as large as the piece", () => {
    expect(() => tileGrid(1000, 1000, 100, 100)).toThrow();
  });
});
