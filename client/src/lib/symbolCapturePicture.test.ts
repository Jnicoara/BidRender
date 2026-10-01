/**
 * A captured symbol's picture must be at least as sharp as the screen it was
 * boxed on. shared/symbolCapture.ts says why; this is the red to go to.
 *
 * ── The measured case these numbers come from, 2026-09-30 ────────────────────
 * "Junction Box", Weld 1 p1, reader-test account: the box was 0.40 x 0.39 in
 * of paper and the saved picture was 43 x 42 px — the 1.5x backdrop, 108 px
 * per inch. The estimator was looking at it at 179% on a display with a
 * device-pixel ratio of 1.25, which is 1.5 x 1.79 x 1.25 = 3.36 device pixels
 * per point, about 242 px per inch. The old pipeline could not exceed 108 at
 * any zoom, and shrank to 96 px on top.
 */
import { describe, it, expect } from "vitest";
import {
  CAPTURE_MAX_EDGE,
  CAPTURE_MIN_PIXELS_PER_INCH,
  LEGEND_MAX_PIXELS,
  SYMBOL_THUMBNAIL_MAX_CHARS,
  captureRenderScale,
  capturePixelSize,
  legendRenderScale,
  normaliseCaptureBox,
} from "@shared/symbolCapture";
import { sharpRenderScale } from "@/lib/planView";

/** The viewer's backdrop scale (RENDER_SCALE in TakeoffPage). */
const BACKDROP = 1.5;
const inches = (n: number) => n * 72;

/** The measured Junction Box: 0.40 x 0.39 in. */
const junctionBox = {
  x: 1000,
  y: 200,
  width: inches(0.4),
  height: inches(0.39),
};

describe("captureRenderScale", () => {
  it("saves the measured Junction Box sharper than it was on screen", () => {
    const screen = sharpRenderScale(BACKDROP, 1.79, 1.25);
    const scale = captureRenderScale(junctionBox, screen);
    const px = capturePixelSize(junctionBox, scale);

    expect(scale).toBeGreaterThanOrEqual(screen);
    // 43 x 42 is what the old pipeline saved; the floor makes it 160 x 156.
    expect(px.width).toBeGreaterThanOrEqual(160);
    expect(px.height).toBeGreaterThanOrEqual(156);
  });

  it("is never softer than the screen, at any zoom a legend is boxed at", () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (const zoom of [0.19, 0.5, 1, 1.79, 3, 5]) {
        const screen = sharpRenderScale(BACKDROP, zoom, dpr);
        const scale = captureRenderScale(junctionBox, screen);
        expect(scale, `zoom ${zoom} dpr ${dpr}`).toBeGreaterThanOrEqual(screen);
        expect(scale * 72).toBeGreaterThanOrEqual(CAPTURE_MIN_PIXELS_PER_INCH);
      }
    }
  });

  it("caps the long edge for a box far bigger than a symbol", () => {
    // A 6 x 2 in box: 2,400 px wide at the floor, held to the cap instead.
    const big = { x: 0, y: 0, width: inches(6), height: inches(2) };
    const px = capturePixelSize(big, captureRenderScale(big, 3));
    expect(Math.max(px.width, px.height)).toBeLessThanOrEqual(CAPTURE_MAX_EDGE);
  });

  it("treats a box dragged up and to the left the same", () => {
    const flipped = {
      x: junctionBox.x + junctionBox.width,
      y: junctionBox.y + junctionBox.height,
      width: -junctionBox.width,
      height: -junctionBox.height,
    };
    expect(normaliseCaptureBox(flipped)).toEqual(junctionBox);
    expect(captureRenderScale(flipped, 2)).toBe(
      captureRenderScale(junctionBox, 2)
    );
  });

  it("returns 0 for a box with no area, and ignores a nonsense screen scale", () => {
    expect(captureRenderScale({ x: 5, y: 5, width: 0, height: 10 }, 3)).toBe(0);
    expect(captureRenderScale(junctionBox, Number.NaN) * 72).toBeCloseTo(
      CAPTURE_MIN_PIXELS_PER_INCH
    );
  });
});

describe("legendRenderScale", () => {
  it("renders Weld 1's whole legend at the full 400 px per inch", () => {
    const weld = { x: 1215, y: 120, width: 510, height: 975 };
    expect(legendRenderScale(weld) * 72).toBeCloseTo(
      CAPTURE_MIN_PIXELS_PER_INCH
    );
  });

  it("keeps a big box inside the pixel budget instead of failing", () => {
    // UNCC E001's two-column schedule, 1,270 x 1,520 pt.
    const uncc = { x: 130, y: 100, width: 1270, height: 1520 };
    const s = legendRenderScale(uncc);
    expect(1270 * s * 1520 * s).toBeLessThanOrEqual(LEGEND_MAX_PIXELS + 1);
    // Still sharper than the viewer's backdrop (1.5x) by a wide margin.
    expect(s).toBeGreaterThan(2.5);
  });

  it("is 0 for a box with no area", () => {
    expect(legendRenderScale({ x: 0, y: 0, width: 0, height: 50 })).toBe(0);
  });
});

describe("SYMBOL_THUMBNAIL_MAX_CHARS", () => {
  it("fits the MySQL TEXT column the picture is stored in", () => {
    // takeoff_symbol_links.thumbnail is TEXT: 65,535 bytes. A data URL is
    // ASCII, so characters are bytes.
    expect(SYMBOL_THUMBNAIL_MAX_CHARS).toBeLessThan(65_535);
  });
});
