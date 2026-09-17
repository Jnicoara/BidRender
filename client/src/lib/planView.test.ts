/**
 * The zoom and pan arithmetic.
 *
 * Worth testing on its own because both failures are the kind you cannot see
 * by looking: zoom that drifts a few pixels off the cursor feels "slippery"
 * without anyone being able to say why, and a clamp that is subtly wrong only
 * shows up after a particular sequence of drags.
 */
import { describe, it, expect } from "vitest";
import {
  BUTTON_ZOOM_STEP,
  MAX_ZOOM,
  MIN_ZOOM,
  clampView,
  clampZoom,
  fitView,
  formatZoom,
  wheelZoomFactor,
  zoomAbout,
  type ViewBounds,
} from "./planView";

/** A 2000×1500 drawing inside an 800×600 viewport. */
const bounds: ViewBounds = {
  viewportWidth: 800,
  viewportHeight: 600,
  contentWidth: 2000,
  contentHeight: 1500,
};

describe("clampZoom", () => {
  it("holds the limits", () => {
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it("survives nonsense rather than propagating NaN into a transform", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MAX_ZOOM);
  });
});

describe("fitView", () => {
  it("fits the whole sheet and centres it", () => {
    const view = fitView(bounds);
    expect(view.zoom * bounds.contentWidth).toBeLessThanOrEqual(800);
    expect(view.zoom * bounds.contentHeight).toBeLessThanOrEqual(600);
    // Centred on both axes.
    const scaledWidth = view.zoom * bounds.contentWidth;
    expect(view.x).toBeCloseTo((800 - scaledWidth) / 2, 5);
  });

  it("fits to the tighter axis, not the looser one", () => {
    // A tall sheet in a wide viewport must be limited by height.
    const tall: ViewBounds = { ...bounds, contentWidth: 100 };
    const view = fitView(tall);
    expect(view.zoom * tall.contentHeight).toBeLessThanOrEqual(600);
  });

  it("does not divide by zero before the first page has drawn", () => {
    const empty: ViewBounds = { ...bounds, contentWidth: 0, contentHeight: 0 };
    expect(fitView(empty)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe("clampView — the drawing cannot be dragged off screen", () => {
  it("refuses to open a gutter on the left or top", () => {
    const view = clampView({ zoom: 1, x: 500, y: 500 }, bounds);
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
  });

  it("refuses to open a gutter on the right or bottom", () => {
    const view = clampView({ zoom: 1, x: -5000, y: -5000 }, bounds);
    // 2000 wide in an 800 viewport: the furthest left is -1200.
    expect(view.x).toBe(800 - 2000);
    expect(view.y).toBe(600 - 1500);
  });

  it("centres a drawing smaller than the viewport and ignores the pan", () => {
    const small: ViewBounds = {
      ...bounds,
      contentWidth: 400,
      contentHeight: 300,
    };
    const shoved = clampView({ zoom: 1, x: 9999, y: -9999 }, small);
    expect(shoved.x).toBe((800 - 400) / 2);
    expect(shoved.y).toBe((600 - 300) / 2);
  });

  it("treats zoomed-out-below-viewport as small, not as pannable", () => {
    // 2000 × 0.2 = 400, narrower than the viewport, so it centres.
    const view = clampView({ zoom: 0.2, x: -300, y: 0 }, bounds);
    expect(view.x).toBe((800 - 400) / 2);
  });
});

describe("zoomAbout — the point under the cursor must not move", () => {
  /** Where a drawing point currently lands on screen. */
  const project = (
    view: { zoom: number; x: number; y: number },
    point: { x: number; y: number }
  ) => ({ x: view.x + point.x * view.zoom, y: view.y + point.y * view.zoom });

  it("holds the anchor still when zooming in", () => {
    const start = clampView({ zoom: 1, x: -100, y: -80 }, bounds);
    const anchor = { x: 300, y: 250 };
    // The drawing point currently under the anchor.
    const point = {
      x: (anchor.x - start.x) / start.zoom,
      y: (anchor.y - start.y) / start.zoom,
    };

    const zoomed = zoomAbout(start, bounds, 2, anchor);
    const after = project(zoomed, point);

    expect(after.x).toBeCloseTo(anchor.x, 5);
    expect(after.y).toBeCloseTo(anchor.y, 5);
  });

  it("holds the anchor still when zooming out, while still clamped", () => {
    const start = clampView({ zoom: 4, x: -2000, y: -1500 }, bounds);
    const anchor = { x: 640, y: 120 };
    const point = {
      x: (anchor.x - start.x) / start.zoom,
      y: (anchor.y - start.y) / start.zoom,
    };

    const zoomed = zoomAbout(start, bounds, 0.5, anchor);
    // Only meaningful where the clamp did not have to intervene.
    if (zoomed.x < 0 && zoomed.x > 800 - bounds.contentWidth * zoomed.zoom) {
      expect(project(zoomed, point).x).toBeCloseTo(anchor.x, 5);
    }
    expect(zoomed.zoom).toBeCloseTo(2, 5);
  });

  it("does not drift the offset at a zoom stop", () => {
    const atMax = clampView({ zoom: MAX_ZOOM, x: -100, y: -100 }, bounds);
    const again = zoomAbout(atMax, bounds, 2, { x: 400, y: 300 });
    expect(again.zoom).toBe(MAX_ZOOM);
    expect(again.x).toBe(atMax.x);
    expect(again.y).toBe(atMax.y);
  });

  it("never lets a zoom leave the drawing off screen", () => {
    let view = fitView(bounds);
    for (let i = 0; i < 20; i++) {
      view = zoomAbout(view, bounds, BUTTON_ZOOM_STEP, { x: 0, y: 0 });
    }
    const scaledWidth = bounds.contentWidth * view.zoom;
    expect(view.x).toBeLessThanOrEqual(0);
    expect(view.x).toBeGreaterThanOrEqual(800 - scaledWidth);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on a negative delta and out on a positive one", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });

  it("is symmetric, so a notch back undoes a notch forward", () => {
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1, 10);
  });

  it("caps a trackpad's momentum so one flick cannot cross the range", () => {
    // A huge delta must not produce a wilder factor than a merely large one.
    expect(wheelZoomFactor(100000)).toBe(wheelZoomFactor(200));
  });

  it("returns a no-op factor for nonsense", () => {
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });
});

describe("formatZoom", () => {
  it("reads as a percentage", () => {
    expect(formatZoom(1)).toBe("100%");
    expect(formatZoom(0.255)).toBe("26%");
    expect(formatZoom(4)).toBe("400%");
  });
});
