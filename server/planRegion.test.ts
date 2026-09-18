/**
 * Tests for `shared/planRegion`.
 *
 * Lives in `server/` rather than beside the module because `shared/**` is not
 * in the vitest include list (see vitest.config.ts) — a test written next to
 * the source there simply never runs, which is worse than having none.
 */
import { describe, it, expect } from "vitest";
import {
  clampRegion,
  containsRegion,
  fitScaleToBudget,
  regionPixelSize,
  wholePage,
  MAX_REGION_PIXELS,
  type PageRect,
} from "@shared/planRegion";

/** A 36x24 inch E-sheet in points, the size everything here was measured on. */
const SHEET_W = 36 * 72;
const SHEET_H = 24 * 72;

/**
 * The part of a sheet that fills a screen, in page points.
 *
 * A viewport of `cssW x cssH` at `dpr` is `cssW*dpr x cssH*dpr` device pixels,
 * and at `scale` device pixels per point that is that many points across. The
 * sharper the render, the less of the drawing fits on the glass — which is why
 * a region render does not grow with the zoom.
 */
function viewportRegion(
  cssW: number,
  cssH: number,
  dpr: number,
  scale: number
): PageRect {
  return {
    x: 0,
    y: 0,
    width: (cssW * dpr) / scale,
    height: (cssH * dpr) / scale,
  };
}

describe("wholePage", () => {
  it("covers the page exactly", () => {
    expect(wholePage(SHEET_W, SHEET_H)).toEqual({
      x: 0,
      y: 0,
      width: SHEET_W,
      height: SHEET_H,
    });
  });
});

describe("clampRegion", () => {
  it("leaves a rect that is already inside the page alone", () => {
    const rect: PageRect = { x: 100, y: 200, width: 400, height: 300 };
    expect(clampRegion(rect, SHEET_W, SHEET_H)).toEqual(rect);
  });

  it("trims a rect that runs off the right and bottom edges", () => {
    const rect: PageRect = {
      x: SHEET_W - 100,
      y: SHEET_H - 50,
      width: 500,
      height: 500,
    };
    expect(clampRegion(rect, SHEET_W, SHEET_H)).toEqual({
      x: SHEET_W - 100,
      y: SHEET_H - 50,
      width: 100,
      height: 50,
    });
  });

  it("trims a rect that starts above and left of the page", () => {
    const rect: PageRect = { x: -200, y: -100, width: 500, height: 400 };
    expect(clampRegion(rect, SHEET_W, SHEET_H)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 300,
    });
  });

  it("clamps a rect bigger than the page down to the page", () => {
    const rect: PageRect = { x: -50, y: -50, width: 9999, height: 9999 };
    expect(clampRegion(rect, SHEET_W, SHEET_H)).toEqual(
      wholePage(SHEET_W, SHEET_H)
    );
  });

  it("returns null when the rect is entirely off the page", () => {
    // Panned past the right edge: not an error worth throwing over, but
    // certainly not something to spend a render on.
    expect(
      clampRegion(
        { x: SHEET_W + 10, y: 0, width: 100, height: 100 },
        SHEET_W,
        SHEET_H
      )
    ).toBeNull();
    expect(
      clampRegion({ x: 0, y: -500, width: 100, height: 100 }, SHEET_W, SHEET_H)
    ).toBeNull();
  });

  it("returns null for a rect with no area", () => {
    expect(
      clampRegion({ x: 10, y: 10, width: 0, height: 100 }, SHEET_W, SHEET_H)
    ).toBeNull();
    expect(
      clampRegion({ x: 10, y: 10, width: 100, height: -5 }, SHEET_W, SHEET_H)
    ).toBeNull();
  });

  it("returns null rather than propagating a bad number", () => {
    // NaN through a render request produces a canvas of size NaN, which fails
    // somewhere far away from the cause.
    expect(
      clampRegion({ x: NaN, y: 0, width: 100, height: 100 }, SHEET_W, SHEET_H)
    ).toBeNull();
    expect(
      clampRegion(
        { x: 0, y: 0, width: Infinity, height: 100 },
        SHEET_W,
        SHEET_H
      )
    ).toBeNull();
    expect(
      clampRegion({ x: 0, y: 0, width: 100, height: 100 }, 0, SHEET_H)
    ).toBeNull();
  });
});

describe("regionPixelSize", () => {
  it("multiplies points by the scale", () => {
    expect(regionPixelSize(wholePage(SHEET_W, SHEET_H), 1.5)).toEqual({
      width: 3888,
      height: 2592,
    });
  });

  it("matches the sizes measured on a real sheet", () => {
    // From the 2026-09-17 measurement recorded in
    // references/plan-viewer-overhaul.md § 4b — the row that fails to allocate
    // and the last one that does not.
    expect(regionPixelSize(wholePage(SHEET_W, SHEET_H), 6)).toEqual({
      width: 15552,
      height: 10368,
    });
    expect(regionPixelSize(wholePage(SHEET_W, SHEET_H), 8)).toEqual({
      width: 20736,
      height: 13824,
    });
  });

  it("rounds up, and never returns a zero-sized canvas", () => {
    // A sliver of a page still has to be at least one pixel: OffscreenCanvas
    // rejects a zero dimension outright.
    const sliver: PageRect = { x: 0, y: 0, width: 0.2, height: 0.2 };
    expect(regionPixelSize(sliver, 1)).toEqual({ width: 1, height: 1 });
    expect(regionPixelSize({ x: 0, y: 0, width: 10.1, height: 1 }, 1)).toEqual({
      width: 11,
      height: 1,
    });
  });
});

describe("fitScaleToBudget", () => {
  it("gives back the scale asked for when it fits", () => {
    const page = wholePage(SHEET_W, SHEET_H);
    // 3x on this sheet is 40.3 Mpx, well inside the budget.
    expect(fitScaleToBudget(page, 3)).toBe(3);
  });

  it("is a ceiling, never a target — a small region is not scaled UP", () => {
    // The mistake this guards against is "fit to budget" being read as "use
    // the budget", which would turn a thumbnail request into a 96 Mpx render.
    const small: PageRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(fitScaleToBudget(small, 2)).toBe(2);
  });

  it("cuts the scale down when the whole page would be too big", () => {
    const page = wholePage(SHEET_W, SHEET_H);
    const fitted = fitScaleToBudget(page, 8);
    expect(fitted).toBeLessThan(8);
    const size = regionPixelSize(page, fitted);
    expect(size.width * size.height).toBeLessThanOrEqual(
      MAX_REGION_PIXELS * 1.001
    );
  });

  it("lets a viewport-sized region stay sharp at a zoom the whole page cannot reach", () => {
    // This is the entire argument for the region contract, as an assertion.
    // 7.8x is what a 260% zoom needs on a devicePixelRatio-2 screen — the zoom
    // that was reported as too soft. The whole page cannot be drawn at it.
    const page = wholePage(SHEET_W, SHEET_H);
    expect(fitScaleToBudget(page, 7.8)).toBeLessThan(7.8);

    // The region on screen can, because the sharper the render the LESS of the
    // sheet fits on the glass. A 1600x1000 CSS viewport at devicePixelRatio 2
    // is 3200x2000 device pixels; at 7.8x that is 410x256 points of drawing.
    const onScreen = viewportRegion(1600, 1000, 2, 7.8);
    expect(fitScaleToBudget(onScreen, 7.8)).toBe(7.8);
  });

  it("keeps the bitmap the size of the SCREEN, whatever the zoom", () => {
    // The property the whole design rests on: zooming in shrinks the region in
    // points by exactly as much as it raises the scale, so the bitmap never
    // grows. If this ever stops being true, sharp zoom is back to eating
    // memory by the square of the magnification.
    const DPR = 2;
    const screen = { css: 1600 * 1000, device: 1600 * 1000 * DPR * DPR };

    for (const scale of [1.5, 3, 6, 7.8, 12, 20]) {
      const region = viewportRegion(1600, 1000, DPR, scale);
      const size = regionPixelSize(region, scale);
      expect(size.width * size.height).toBeCloseTo(screen.device, -3);
      // ...and therefore always inside the budget, with room to spare.
      expect(fitScaleToBudget(region, scale)).toBe(scale);
    }
  });

  it("refuses a nonsense scale instead of returning one", () => {
    const page = wholePage(SHEET_W, SHEET_H);
    expect(fitScaleToBudget(page, 0)).toBe(0);
    expect(fitScaleToBudget(page, -2)).toBe(0);
    expect(fitScaleToBudget(page, NaN)).toBe(0);
    expect(fitScaleToBudget({ x: 0, y: 0, width: 0, height: 0 }, 2)).toBe(0);
  });

  it("honours a budget passed in, so a caller can be stricter", () => {
    const page = wholePage(SHEET_W, SHEET_H);
    const fitted = fitScaleToBudget(page, 4, 10_000_000);
    const size = regionPixelSize(page, fitted);
    expect(size.width * size.height).toBeLessThanOrEqual(10_000_000 * 1.001);
    expect(fitted).toBeLessThan(4);
  });
});

describe("containsRegion", () => {
  const outer: PageRect = { x: 100, y: 200, width: 400, height: 300 };

  it("covers a rect wholly inside it", () => {
    expect(
      containsRegion(outer, { x: 150, y: 250, width: 100, height: 100 })
    ).toBe(true);
  });

  it("covers itself — which is the case that runs on every mouse move", () => {
    expect(containsRegion(outer, outer)).toBe(true);
  });

  it("covers a rect flush against each edge in turn", () => {
    expect(
      containsRegion(outer, { x: 100, y: 200, width: 400, height: 300 })
    ).toBe(true);
    expect(
      containsRegion(outer, { x: 400, y: 400, width: 100, height: 100 })
    ).toBe(true);
  });

  it("does not cover one that escapes past any single edge", () => {
    // Each of the four on its own, because a sign error shows on one side only
    // and the other three keep answering correctly.
    expect(
      containsRegion(outer, { x: 99, y: 250, width: 10, height: 10 })
    ).toBe(false);
    expect(
      containsRegion(outer, { x: 150, y: 199, width: 10, height: 10 })
    ).toBe(false);
    expect(
      containsRegion(outer, { x: 495, y: 250, width: 10, height: 10 })
    ).toBe(false);
    expect(
      containsRegion(outer, { x: 150, y: 495, width: 10, height: 10 })
    ).toBe(false);
  });

  it("tolerates a rect that has been through a divide and a multiply", () => {
    // What the viewer actually compares: a rect reconstructed from screen
    // coordinates against the one the worker sent back. Without the tolerance
    // this answers false and every settled view re-renders forever.
    const roundTripped: PageRect = {
      x: (outer.x * 1.5 * 2.3) / (1.5 * 2.3),
      y: (outer.y * 1.5 * 2.3) / (1.5 * 2.3),
      width: (outer.width * 1.5 * 2.3) / (1.5 * 2.3),
      height: (outer.height * 1.5 * 2.3) / (1.5 * 2.3),
    };
    expect(containsRegion(outer, roundTripped)).toBe(true);
  });

  it("does not let the tolerance hide a real miss", () => {
    // A point is a 72nd of an inch; the tolerance is a fifth of that. Nothing
    // on a drawing is thin enough for this to be a judgement call.
    expect(
      containsRegion(outer, { x: 150, y: 250, width: 400, height: 10 })
    ).toBe(false);
  });
});
