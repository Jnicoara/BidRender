/**
 * THE HOTSPOT IS THE CENTRE OF THE CROSSHAIR. Measured, not assumed.
 *
 * A cursor hotspot off by a pixel or two puts every point on a sheet in the
 * wrong place — every trace vertex, every mark, and both ends of a calibration,
 * which then multiplies the error into every other measurement on the sheet.
 * It is also completely invisible: the cursor looks right, the click looks
 * right, and the numbers are wrong by a constant nobody can see.
 *
 * So these assert the geometry rather than trusting the arithmetic in the
 * module. `crosshairInk` walks the same arm definition the SVG is built from
 * and reports which pixels are painted; the centroid and the bounding box of
 * that ink both have to land on the declared hotspot.
 */
import { describe, it, expect } from "vitest";
import {
  CROSSHAIR_CENTRE,
  CROSSHAIR_SIZE,
  crosshairArms,
  crosshairCursorValue,
  crosshairInk,
  crosshairSvg,
} from "./crosshairCursor";

/** Every painted pixel, as coordinates. */
function inkPixels(): Array<{ x: number; y: number }> {
  const grid = crosshairInk();
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]) out.push({ x, y });
    }
  }
  return out;
}

describe("the crosshair is centred on its hotspot", () => {
  it("paints something at all", () => {
    // A measurement of nothing centres perfectly on everything.
    expect(inkPixels().length).toBeGreaterThan(20);
  });

  it("has a bounding box symmetric about the hotspot", () => {
    const pixels = inkPixels();
    const xs = pixels.map(p => p.x);
    const ys = pixels.map(p => p.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    expect(CROSSHAIR_CENTRE - left).toBe(right - CROSSHAIR_CENTRE);
    expect(CROSSHAIR_CENTRE - top).toBe(bottom - CROSSHAIR_CENTRE);
  });

  it("has its centroid exactly on the hotspot", () => {
    const pixels = inkPixels();
    const meanX = pixels.reduce((s, p) => s + p.x, 0) / pixels.length;
    const meanY = pixels.reduce((s, p) => s + p.y, 0) / pixels.length;
    expect(meanX).toBeCloseTo(CROSSHAIR_CENTRE, 10);
    expect(meanY).toBeCloseTo(CROSSHAIR_CENTRE, 10);
  });

  it("leaves the aimed-at pixel uncovered", () => {
    // The four arms converge on a hole. Painting the centre would hide the one
    // pixel the whole cursor exists to identify.
    expect(crosshairInk()[CROSSHAIR_CENTRE][CROSSHAIR_CENTRE]).toBe(false);
  });

  it("keeps every arm inside the image", () => {
    // An arm running past the edge is silently clipped, and clipping one side
    // and not the other is exactly how a centred cursor stops being centred.
    for (const [x1, y1, x2, y2] of crosshairArms()) {
      for (const v of [x1, y1, x2, y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(CROSSHAIR_SIZE);
      }
    }
  });

  it("uses an odd size, so a single centre pixel exists", () => {
    // With an even size the centre falls on a seam and the hotspot has to be
    // half a pixel out one way or the other.
    expect(CROSSHAIR_SIZE % 2).toBe(1);
    expect(CROSSHAIR_CENTRE).toBe((CROSSHAIR_SIZE - 1) / 2);
  });
});

describe("the cursor value a browser is given", () => {
  it("declares the hotspot and keeps a fallback", () => {
    const value = crosshairCursorValue();
    expect(value).toContain(`) ${CROSSHAIR_CENTRE} ${CROSSHAIR_CENTRE},`);
    // Losing the image must not leave an arrow pointing at a drawing.
    expect(value.trimEnd().endsWith("crosshair")).toBe(true);
  });

  it("is a url() with an inline SVG, needing no network", () => {
    const value = crosshairCursorValue();
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
    /*
      A cursor that has to be FETCHED can be late, which is the fault this
      replaces. So: no external reference.

      Checked by stripping the SVG namespace first. The naive version of this
      test — "does not contain http" — failed on `xmlns="http://www.w3.org/
      2000/svg"`, which is an identifier and is never fetched. The test was
      wrong, not the cursor.
    */
    const withoutNamespace = decodeURIComponent(value).replace(
      /xmlns="[^"]*"/g,
      ""
    );
    expect(withoutNamespace).not.toContain("http");
  });

  it("escapes the SVG so the url cannot be broken by its own markup", () => {
    const value = crosshairCursorValue();
    expect(value).not.toContain("<");
    expect(value).not.toContain(">");
    expect(value).not.toContain("#");
  });

  it("stays small enough to be accepted", () => {
    // Browsers cap cursor images; well under any limit, and worth knowing if
    // the artwork ever grows.
    expect(crosshairCursorValue().length).toBeLessThan(4000);
  });
});

describe("the crosshair reads on white paper and on black linework", () => {
  it("draws a light halo under a dark core, from one geometry", () => {
    const svg = crosshairSvg();
    expect(svg).toContain('stroke="#FFFFFF" stroke-width="3"');
    expect(svg).toContain('stroke="#111827" stroke-width="1"');
    // The halo has to come first, or it paints over the core.
    expect(svg.indexOf("#FFFFFF")).toBeLessThan(svg.indexOf("#111827"));
  });

  it("is not the colour of a mark", () => {
    // Yellow is what a stamp looks like. A cursor that looks like a mark is a
    // cursor you lose among them.
    expect(crosshairSvg()).not.toContain("F5C518");
  });
});
