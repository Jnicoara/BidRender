/**
 * The image-sizing arithmetic, against Anthropic's own published examples.
 *
 * Every fixture in the first block is a number lifted from the vision
 * documentation rather than one produced by this implementation, which is the
 * only thing that makes this test worth having: the whole purpose of the module
 * is to predict what a server we cannot see is going to do to our image, so a
 * test that only agrees with itself would pass forever while the prediction
 * quietly drifted.
 */
import { describe, expect, it } from "vitest";
import {
  HIGH_RESOLUTION_TIER,
  STANDARD_TIER,
  countImageTokens,
  fitToModel,
  largestSquareTile,
  unknownVisionModel,
  visionLimitsFor,
} from "../shared/visionImageLimits";

describe("published examples", () => {
  it("counts tokens as one per 28x28 patch", () => {
    // From the documentation's own size/token table.
    expect(countImageTokens(200, 200)).toBe(64);
    expect(countImageTokens(1000, 1000)).toBe(1296);
    expect(countImageTokens(1092, 1092)).toBe(1521);
  });

  it("resizes the worked A4 example exactly", () => {
    // The documentation's headline example, and the one that catches a naive
    // implementation: both sides are already under the 1568px edge limit, so
    // only the TOKEN limit forces the resize.
    expect(fitToModel(1075, 1520, STANDARD_TIER)).toEqual({
      width: 924,
      height: 1307,
    });
  });

  it("resizes 1080p to the documented size, not to the edge limit", () => {
    // 1456x819, not 1568x882. Scaling to the edge length by hand is the
    // documented wrong answer and it is wrong by enough to move every
    // coordinate the model reports.
    expect(fitToModel(1920, 1080, STANDARD_TIER)).toEqual({
      width: 1456,
      height: 819,
    });
    // The same image is left alone by a high-resolution-tier model.
    expect(fitToModel(1920, 1080, HIGH_RESOLUTION_TIER)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("resizes 4K to each tier's documented size", () => {
    expect(fitToModel(3840, 2160, STANDARD_TIER)).toEqual({
      width: 1456,
      height: 819,
    });
    expect(fitToModel(3840, 2160, HIGH_RESOLUTION_TIER)).toEqual({
      width: 2576,
      height: 1449,
    });
  });
});

describe("the E-sheet case this was written for", () => {
  // A 36x24 inch sheet drawn at the viewer's 1.5x render scale.
  const CANVAS = { width: 3888, height: 2592 };

  it("caps a whole 36x24 sheet at 2352x1568 on the reader's model", () => {
    const limits = visionLimitsFor("claude-sonnet-5");
    const fitted = fitToModel(CANVAS.width, CANVAS.height, limits);
    expect(fitted).toEqual({ width: 2352, height: 1568 });
    expect(countImageTokens(fitted.width, fitted.height)).toBeLessThanOrEqual(
      limits.maxTokens
    );
  });

  it("beats the old flat 1600px cap by about half again as much detail", () => {
    const fitted = fitToModel(
      CANVAS.width,
      CANVAS.height,
      visionLimitsFor("claude-sonnet-5")
    );
    // Pixels per paper inch across a 36in sheet: 44 before, 65 after.
    expect(Math.round(1600 / 36)).toBe(44);
    expect(Math.round(fitted.width / 36)).toBe(65);
  });

  it("gives the cheap model a third of the area, not half", () => {
    // Why swapping to a cheaper model is not automatically a cheaper reading:
    // it has to cover the same drawing in far more tiles.
    const sonnet = largestSquareTile(visionLimitsFor("claude-sonnet-5"));
    const haiku = largestSquareTile(visionLimitsFor("claude-haiku-4-5"));
    expect(sonnet).toBe(1932);
    expect(haiku).toBe(1092);
    expect(countImageTokens(sonnet, sonnet)).toBeLessThanOrEqual(
      HIGH_RESOLUTION_TIER.maxTokens
    );
    expect(countImageTokens(haiku, haiku)).toBeLessThanOrEqual(
      STANDARD_TIER.maxTokens
    );
    // One tile the size of 3.1 of the other's.
    expect(sonnet ** 2 / haiku ** 2).toBeGreaterThan(3);
  });

  it("adding one pixel past the ceiling gets shrunk straight back", () => {
    const tile = largestSquareTile(HIGH_RESOLUTION_TIER);
    expect(fitToModel(tile, tile, HIGH_RESOLUTION_TIER)).toEqual({
      width: tile,
      height: tile,
    });
    const over = fitToModel(tile + 28, tile + 28, HIGH_RESOLUTION_TIER);
    expect(over.width).toBeLessThanOrEqual(tile);
  });
});

describe("safety properties", () => {
  it("never upscales", () => {
    // Sending more pixels than the drawing has invents detail; this module
    // answers "how much of what I have is worth sending", nothing more.
    for (const [w, h] of [
      [100, 100],
      [640, 480],
      [1500, 1000],
    ]) {
      const out = fitToModel(w, h, HIGH_RESOLUTION_TIER);
      expect(out.width).toBeLessThanOrEqual(w);
      expect(out.height).toBeLessThanOrEqual(h);
    }
  });

  it("leaves an image that already fits completely untouched", () => {
    expect(fitToModel(800, 600, STANDARD_TIER)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("holds the aspect ratio to within a pixel", () => {
    for (const [w, h] of [
      [3888, 2592],
      [10800, 7200],
      [2000, 1500],
      [1075, 1520],
    ]) {
      for (const limits of [STANDARD_TIER, HIGH_RESOLUTION_TIER]) {
        const out = fitToModel(w, h, limits);
        expect(Math.abs(out.width / out.height - w / h)).toBeLessThan(0.01);
      }
    }
  });

  it("always returns something the model will accept whole", () => {
    for (const [w, h] of [
      [3888, 2592],
      [10800, 7200],
      [400, 9000],
      [9000, 400],
      [1933, 1933],
    ]) {
      for (const limits of [STANDARD_TIER, HIGH_RESOLUTION_TIER]) {
        const out = fitToModel(w, h, limits);
        expect(countImageTokens(out.width, out.height)).toBeLessThanOrEqual(
          limits.maxTokens
        );
        expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(
          limits.maxEdge
        );
      }
    }
  });

  it("treats an unrecognised model as the SMALLER tier", () => {
    // Guessing high would send bytes the server throws away and report
    // nothing; guessing low loses some detail and still works. Only one of
    // those failures is recoverable by the person looking at the screen.
    expect(unknownVisionModel("claude-something-new")).toBe(true);
    expect(visionLimitsFor("claude-something-new")).toEqual(STANDARD_TIER);
    expect(unknownVisionModel("claude-sonnet-5")).toBe(false);
  });
});
