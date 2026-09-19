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
  REGION_MARGIN,
  SHARP_SCALE_TOLERANCE,
  snapToDevicePixel,
  MIN_VISIBLE_FRACTION,
  clampView,
  clampZoom,
  fitView,
  formatZoom,
  regionStillGood,
  sharpRenderScale,
  visibleRegion,
  wantedRegion,
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

/** How much of the viewport still has drawing on it, on one axis. */
function overlap(offset: number, scaled: number, viewport: number): number {
  return Math.min(viewport, offset + scaled) - Math.max(0, offset);
}

describe("clampView — the drawing can be pushed aside but never away", () => {
  it("lets the drawing be pushed past the left and top edges", () => {
    // The old rule pinned both of these to 0, which is what made the corner of
    // a zoomed sheet unreachable anywhere but jammed against the bezel.
    // x: 500 is now simply allowed — it is inside the stop at 800 - 200.
    // y: 500 lands ON the stop, because a 600-tall viewport keeps 150.
    const view = clampView({ zoom: 1, x: 500, y: 500 }, bounds);
    expect(view.x).toBe(500);
    expect(view.y).toBe(450);
  });

  it("stops once only a quarter of the viewport still has drawing on it", () => {
    const shoved = clampView({ zoom: 1, x: 9999, y: 9999 }, bounds);
    expect(shoved.x).toBe(800 - 800 * MIN_VISIBLE_FRACTION);
    expect(shoved.y).toBe(600 - 600 * MIN_VISIBLE_FRACTION);
    expect(overlap(shoved.x, 2000, 800)).toBeCloseTo(200, 6);
    expect(overlap(shoved.y, 1500, 600)).toBeCloseTo(150, 6);
  });

  it("stops at the same fraction going the other way", () => {
    const view = clampView({ zoom: 1, x: -5000, y: -5000 }, bounds);
    expect(view.x).toBe(800 * MIN_VISIBLE_FRACTION - 2000);
    expect(view.y).toBe(600 * MIN_VISIBLE_FRACTION - 1500);
    expect(overlap(view.x, 2000, 800)).toBeCloseTo(200, 6);
  });

  it("keeps that guarantee at every zoom, however hard it is shoved", () => {
    // The safety net itself, rather than the arithmetic that implements it:
    // there is ALWAYS a large piece of drawing on screen to drag back.
    for (const zoom of [0.6, 1, 2.5, 4, 8]) {
      for (const push of [-99999, -4000, -1, 1, 4000, 99999]) {
        const view = clampView({ zoom, x: push, y: push }, bounds);
        const scaledWidth = bounds.contentWidth * zoom;
        const scaledHeight = bounds.contentHeight * zoom;
        if (scaledWidth > bounds.viewportWidth) {
          expect(overlap(view.x, scaledWidth, 800)).toBeGreaterThanOrEqual(
            800 * MIN_VISIBLE_FRACTION - 1e-6
          );
        }
        if (scaledHeight > bounds.viewportHeight) {
          expect(overlap(view.y, scaledHeight, 600)).toBeGreaterThanOrEqual(
            600 * MIN_VISIBLE_FRACTION - 1e-6
          );
        }
      }
    }
  });

  it("leaves Fit as the way home — a fitted view is never moved by clamping", () => {
    const fitted = fitView(bounds);
    expect(clampView(fitted, bounds)).toEqual(fitted);
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
    // 2000 × 0.2 = 400 wide and 300 tall: the WHOLE sheet fits, so it centres.
    const view = clampView({ zoom: 0.2, x: -300, y: 0 }, bounds);
    expect(view.x).toBe((800 - 400) / 2);
    expect(view.y).toBe((600 - 300) / 2);
  });

  /*
    The in-between state: wider than the pane, shorter than it.

    This is the shape the per-axis rule got wrong, and nothing above could see
    it — the 2000×1500 fixture has the SAME aspect ratio as the 800×600
    viewport, so on it the two axes overflow together at every zoom and the
    in-between state does not exist. It takes a sheet shaped differently from
    the pane, which is every real landscape drawing.

    A 2000×600 sheet at 0.5 is 1000×300: 200px wider than the 800 viewport,
    300px shorter than the 600 one. Before the fix, y was forced to 150 here
    whatever the user did, so one drag gesture had two behaviours.
  */
  describe("wider than the pane but shorter than it", () => {
    const wide: ViewBounds = {
      ...bounds,
      contentWidth: 2000,
      contentHeight: 600,
    };
    const zoom = 0.5;
    const scaledWidth = 1000; // overflows the 800 viewport
    const scaledHeight = 300; // fits inside the 600 one
    /** Where the old per-axis rule pinned y, regardless of the pan. */
    const wasPinnedTo = (600 - scaledHeight) / 2;

    it("pans vertically, instead of snapping back to centre", () => {
      const view = clampView({ zoom, x: -100, y: -80 }, wide);
      expect(view.x).toBe(-100);
      expect(view.y).toBe(-80);
      expect(view.y).not.toBe(wasPinnedTo);
    });

    it("keeps the quarter-of-the-viewport guarantee on the short axis too", () => {
      const up = clampView({ zoom, x: 0, y: -99999 }, wide);
      const down = clampView({ zoom, x: 0, y: 99999 }, wide);
      expect(overlap(up.y, scaledHeight, 600)).toBeCloseTo(150, 6);
      expect(overlap(down.y, scaledHeight, 600)).toBeCloseTo(150, 6);
      // Stopped, not free: the short axis has stops like any other.
      expect(up.y).toBe(600 * MIN_VISIBLE_FRACTION - scaledHeight);
      expect(down.y).toBe(600 - 600 * MIN_VISIBLE_FRACTION);
    });

    it("leaves the long axis exactly as it was", () => {
      const shoved = clampView({ zoom, x: 99999, y: 0 }, wide);
      expect(overlap(shoved.x, scaledWidth, 800)).toBeCloseTo(200, 6);
      expect(shoved.x).toBe(800 - 800 * MIN_VISIBLE_FRACTION);
    });

    it("still opens centred — nothing moves until the user drags", () => {
      const fresh = clampView(
        { zoom, x: (800 - scaledWidth) / 2, y: wasPinnedTo },
        wide
      );
      expect(fresh.y).toBe(wasPinnedTo);
    });

    it("centres both axes again the moment the whole sheet fits", () => {
      // Zooming back out past the fit point restores the old behaviour exactly.
      // This is the half of the rule that is deliberately unchanged.
      const out = clampView({ zoom: 0.3, x: -400, y: -400 }, wide);
      expect(out.x).toBe((800 - 600) / 2);
      expect(out.y).toBe((600 - 180) / 2);
    });
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
    // Zooming hard into the top-left corner is the case that used to push the
    // offset furthest. The drawing may now sit past the edge; what it may not
    // do is leave.
    let view = fitView(bounds);
    for (let i = 0; i < 20; i++) {
      view = zoomAbout(view, bounds, BUTTON_ZOOM_STEP, { x: 0, y: 0 });
    }
    const scaledWidth = bounds.contentWidth * view.zoom;
    const onScreen = Math.min(800, view.x + scaledWidth) - Math.max(0, view.x);
    expect(onScreen).toBeGreaterThanOrEqual(800 * MIN_VISIBLE_FRACTION - 1e-6);
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

// ── Sharp re-render ──────────────────────────────────────────────────────────
//
// The failures here are all silent ones. A rect computed with the zoom applied
// once instead of twice still looks plausible and draws the wrong part of the
// sheet; a scale that forgets devicePixelRatio is exactly half what is needed,
// which is the original complaint reproduced rather than fixed.

/**
 * A 36x24in sheet — 2592x1728 points — drawn at 1.5x, so 3888x2592 canvas
 * pixels, inside an 800x600 viewport. The same sheet the render timings in
 * references/plan-viewer-overhaul.md § 4b were measured against.
 */
const SHEET_BASE_SCALE = 1.5;
const sheet: ViewBounds = {
  viewportWidth: 800,
  viewportHeight: 600,
  contentWidth: 3888,
  contentHeight: 2592,
};

describe("visibleRegion", () => {
  it("is the viewport in page points, plus the margin", () => {
    // Zoom 1: one canvas pixel per screen pixel, so 800x600 canvas pixels are
    // visible — 533x400 points at 1.5x.
    const rect = visibleRegion(
      { zoom: 1, x: 0, y: 0 },
      sheet,
      SHEET_BASE_SCALE,
      0
    )!;
    expect(rect.x).toBeCloseTo(0, 6);
    expect(rect.y).toBeCloseTo(0, 6);
    expect(rect.width).toBeCloseTo(800 / 1.5, 6);
    expect(rect.height).toBeCloseTo(600 / 1.5, 6);
  });

  it("shrinks as the zoom goes up — which is the whole point", () => {
    const at1 = visibleRegion({ zoom: 1, x: 0, y: 0 }, sheet, 1.5, 0)!;
    const at4 = visibleRegion({ zoom: 4, x: 0, y: 0 }, sheet, 1.5, 0)!;
    expect(at4.width).toBeCloseTo(at1.width / 4, 6);
    // So the bitmap is bounded by the screen rather than by the magnification:
    // four times the resolution over a quarter of the page is the same pixels.
    expect(at4.width * 4).toBeCloseTo(at1.width, 6);
  });

  it("follows a pan, in the opposite direction to the offset", () => {
    // The transform is translate(x) scale(zoom), so a NEGATIVE x has moved the
    // drawing left, which means looking further RIGHT along the sheet.
    const rect = visibleRegion(
      { zoom: 2, x: -1200, y: -600 },
      sheet,
      SHEET_BASE_SCALE,
      0
    )!;
    expect(rect.x).toBeCloseTo(1200 / (2 * 1.5), 6);
    expect(rect.y).toBeCloseTo(600 / (2 * 1.5), 6);
  });

  it("grows by the margin on every side, not just two", () => {
    const bare = visibleRegion({ zoom: 2, x: -1200, y: -600 }, sheet, 1.5, 0)!;
    const grown = visibleRegion(
      { zoom: 2, x: -1200, y: -600 },
      sheet,
      1.5,
      REGION_MARGIN
    )!;
    expect(grown.x).toBeCloseTo(bare.x - bare.width * REGION_MARGIN, 6);
    expect(grown.y).toBeCloseTo(bare.y - bare.height * REGION_MARGIN, 6);
    expect(grown.width).toBeCloseTo(bare.width * (1 + REGION_MARGIN * 2), 6);
    expect(grown.height).toBeCloseTo(bare.height * (1 + REGION_MARGIN * 2), 6);
  });

  it("may run past the page, and leaves the trimming to the worker", () => {
    // Only the worker knows the page's real size. A rect trimmed twice against
    // two different ideas of the page is how a patch ends up a line off at an
    // edge.
    const rect = visibleRegion({ zoom: 0.2, x: 0, y: 0 }, sheet, 1.5)!;
    expect(rect.x).toBeLessThan(0);
    expect(rect.width).toBeGreaterThan(2592);
  });

  it("refuses nonsense instead of producing a rect nobody can draw", () => {
    expect(visibleRegion({ zoom: 0, x: 0, y: 0 }, sheet, 1.5)).toBeNull();
    expect(
      visibleRegion({ zoom: Number.NaN, x: 0, y: 0 }, sheet, 1.5)
    ).toBeNull();
    expect(
      visibleRegion({ zoom: 1, x: Number.NaN, y: 0 }, sheet, 1.5)
    ).toBeNull();
    expect(visibleRegion({ zoom: 1, x: 0, y: 0 }, sheet, 0)).toBeNull();
    expect(
      visibleRegion(
        { zoom: 1, x: 0, y: 0 },
        { ...sheet, viewportWidth: 0 },
        1.5
      )
    ).toBeNull();
  });
});

describe("sharpRenderScale", () => {
  it("reproduces the measured numbers from the real sheet", () => {
    // 100% zoom on a DPR-2 screen needs 3x; 260% needs 7.8x, which is where
    // whole-page rendering stops being possible at all.
    expect(sharpRenderScale(1.5, 1, 2)).toBeCloseTo(3, 6);
    expect(sharpRenderScale(1.5, 2.6, 2)).toBeCloseTo(7.8, 6);
  });

  it("doubles with devicePixelRatio — the half that is easy to forget", () => {
    expect(sharpRenderScale(1.5, 2, 2)).toBeCloseTo(
      sharpRenderScale(1.5, 2, 1) * 2,
      6
    );
  });

  it("is EXACT — asking for surplus resolution is not free insurance", () => {
    /*
      This used to round up to a 0.25 step, and the step was the bug. A bitmap
      denser than the screen displays it gets resampled DOWN, which turns a
      hairline grey exactly as being too coarse does. Measured live at 97% on
      a DPR-2 screen: wanted 2.91, the step gave 3.0, and the sharp patch was
      shown at 1.0335 bitmap pixels per device pixel.
    */
    expect(sharpRenderScale(1.5, 0.97, 2)).toBeCloseTo(2.91, 6);
    expect(sharpRenderScale(1.5, 1.01, 2)).toBeCloseTo(3.03, 6);
  });

  it("gives a different scale for every zoom, because every zoom needs one", () => {
    expect(sharpRenderScale(1.5, 1.02, 2)).not.toBe(
      sharpRenderScale(1.5, 1.08, 2)
    );
  });

  it("returns 0 for nonsense rather than asking for an impossible render", () => {
    expect(sharpRenderScale(1.5, Number.NaN, 2)).toBe(0);
    expect(sharpRenderScale(1.5, 1, 0)).toBe(0);
  });
});

describe("snapToDevicePixel", () => {
  it("puts an offset on a whole device pixel", () => {
    // 2 device pixels per drawing pixel: 10.3 lands on 20.6 device px, and
    // the nearest whole one is 21 — which is 10.5 back in drawing pixels.
    expect(snapToDevicePixel(10.3, 2)).toBeCloseTo(10.5, 6);
    expect(snapToDevicePixel(10.3, 2) * 2).toBe(21);
  });

  it("never moves anything by as much as one screen pixel", () => {
    for (const perPixel of [1, 2, 2.91, 7.8]) {
      for (const value of [0, 3.14159, -122.7, 1000.001]) {
        const moved = Math.abs(snapToDevicePixel(value, perPixel) - value);
        expect(moved * perPixel).toBeLessThanOrEqual(0.5 + 1e-9);
      }
    }
  });

  it("leaves a value alone rather than zeroing it on a nonsense ratio", () => {
    expect(snapToDevicePixel(12.5, 0)).toBe(12.5);
    expect(snapToDevicePixel(12.5, Number.NaN)).toBe(12.5);
    expect(snapToDevicePixel(Number.NaN, 2)).toBe(0);
  });
});

describe("wantedRegion", () => {
  it("wants nothing while the backdrop is already sharper than the screen", () => {
    // A sheet fitted to the pane: massively zoomed out, so a region render
    // would cost seconds to change nothing.
    expect(wantedRegion({ zoom: 0.2, x: 0, y: 0 }, sheet, 1.5, 1)).toBeNull();
    // And at 100% on an ordinary screen the 1.5x backdrop is still ahead.
    expect(wantedRegion({ zoom: 1, x: 0, y: 0 }, sheet, 1.5, 1)).toBeNull();
  });

  it("wants a region as soon as the screen can show more than was drawn", () => {
    // The same 100% zoom on a Retina screen: 3x is needed, 1.5x is half of it.
    const want = wantedRegion({ zoom: 1, x: 0, y: 0 }, sheet, 1.5, 2)!;
    expect(want.scale).toBeCloseTo(3, 6);
    expect(want.rect.width).toBeGreaterThan(0);
  });
});

describe("regionStillGood", () => {
  const have = { rect: { x: 100, y: 100, width: 400, height: 300 }, scale: 3 };

  it("is not good when there is nothing drawn yet", () => {
    expect(regionStillGood(null, have)).toBe(false);
  });

  it("covers a nudge that stays inside the margin", () => {
    expect(
      regionStillGood(have, {
        rect: { x: 120, y: 110, width: 300, height: 200 },
        scale: 3,
      })
    ).toBe(true);
  });

  it("does not cover a pan that leaves the rectangle", () => {
    expect(
      regionStillGood(have, {
        rect: { x: 450, y: 110, width: 300, height: 200 },
        scale: 3,
      })
    ).toBe(false);
  });

  it("refuses a bitmap drawn for half this zoom, however well it is placed", () => {
    // The trap: it covers the view perfectly and is still soft.
    expect(
      regionStillGood(have, {
        rect: { x: 120, y: 110, width: 300, height: 200 },
        scale: 6,
      })
    ).toBe(false);
  });

  it("REFUSES one drawn sharper than it needs to be, which is also soft", () => {
    /*
      The half that was missing. An over-dense bitmap is not a free bonus: the
      browser squeezes it down to fit the box, and a resampled hairline is grey
      whichever direction it was resampled in.
    */
    expect(
      regionStillGood(
        { rect: have.rect, scale: 8 },
        { rect: have.rect, scale: 3 }
      )
    ).toBe(false);
  });

  it("keeps a bitmap whose scale is off by less than the tolerance", () => {
    const want = { rect: have.rect, scale: 3 };
    const withinTolerance = 3 * (1 + SHARP_SCALE_TOLERANCE / 2);
    expect(
      regionStillGood({ rect: have.rect, scale: withinTolerance }, want)
    ).toBe(true);
    const outsideTolerance = 3 * (1 + SHARP_SCALE_TOLERANCE * 2);
    expect(
      regionStillGood({ rect: have.rect, scale: outsideTolerance }, want)
    ).toBe(false);
  });

  it("says a region covers itself, floating-point noise and all", () => {
    const want = visibleRegion({ zoom: 2.3, x: -713, y: -219 }, sheet, 1.5)!;
    expect(
      regionStillGood({ rect: want, scale: 7 }, { rect: want, scale: 7 })
    ).toBe(true);
  });
});
