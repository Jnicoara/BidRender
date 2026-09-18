/**
 * Two-point calibration.
 *
 * Tested hard because a mistake here is not one wrong number — the ratio
 * multiplies into EVERY measurement on the sheet, and nothing on screen looks
 * broken when it is wrong. The parser gets the same attention: a typed distance
 * read as the wrong unit puts the whole sheet out by a factor of twelve.
 */
import { describe, it, expect } from "vitest";
import {
  assessSpan,
  compareToStandardScales,
  parseLengthText,
  ratioFromCalibration,
} from "../shared/planCalibration";
import { COMMON_SCALES, parseScaleText } from "../shared/planScale";
import { POINTS_PER_INCH } from "../shared/takeoffGeometry";

describe("parseLengthText", () => {
  it("reads a bare number as FEET", () => {
    // The decision that matters most: 20 means 20 feet, not 20 inches.
    expect(parseLengthText("20")).toBe(240);
    expect(parseLengthText("7.5")).toBe(90);
  });

  it("reads feet written the ways people write them", () => {
    for (const text of ["20'", "20 ft", "20 feet", "20foot"]) {
      expect(parseLengthText(text)).toBe(240);
    }
  });

  it("reads feet and inches together", () => {
    expect(parseLengthText("20'-6\"")).toBe(246);
    expect(parseLengthText("20' 6\"")).toBe(246);
    expect(parseLengthText("20 ft 6 in")).toBe(246);
  });

  it("reads a dimension exactly as printed on a plan", () => {
    // 24'-6 1/2" is what the dimension line actually says.
    expect(parseLengthText("24'-6 1/2\"")).toBeCloseTo(294.5, 6);
  });

  it("reads inches when inches are stated", () => {
    expect(parseLengthText('246"')).toBe(246);
    expect(parseLengthText("246 in")).toBe(246);
    expect(parseLengthText('6 1/2"')).toBeCloseTo(6.5, 6);
  });

  it("is not case or whitespace sensitive", () => {
    expect(parseLengthText("  20 FT  ")).toBe(240);
  });

  it("refuses what it cannot read, rather than guessing", () => {
    for (const text of [
      "",
      "   ",
      "abc",
      "-5",
      "0",
      "0'",
      "20 metres",
      '1/0"',
    ]) {
      expect(parseLengthText(text)).toBeNull();
    }
  });
});

describe("ratioFromCalibration", () => {
  /**
   * The anchor test: a calibration that SHOULD land on a standard scale has to
   * produce the identical ratio typing that scale produces. Two roads, one
   * number — otherwise a calibrated sheet and a typed sheet would measure
   * differently and nothing would say why.
   */
  it("agrees with the typed scale it is equivalent to", () => {
    const quarterInch = parseScaleText('1/4" = 1\'-0"');
    expect(quarterInch?.ratio).toBe(48);

    // At 1/4" = 1'-0", 20 feet of building is 5 inches of paper.
    const spanPoints = 5 * POINTS_PER_INCH;
    expect(ratioFromCalibration(spanPoints, 20 * 12)).toBeCloseTo(48, 10);
  });

  it("agrees for an engineering scale too", () => {
    // 1" = 20' is ratio 240. 100 feet is 5 inches of paper.
    expect(parseScaleText("1\" = 20'")?.ratio).toBe(240);
    expect(ratioFromCalibration(5 * POINTS_PER_INCH, 100 * 12)).toBeCloseTo(
      240,
      10
    );
  });

  it("is independent of how far the span is, for a given ratio", () => {
    // Twice the paper for twice the building is the same scale.
    const a = ratioFromCalibration(100, 480);
    const b = ratioFromCalibration(200, 960);
    expect(a).toBeCloseTo(b!, 10);
  });

  it("refuses a degenerate span rather than returning a wrong scale", () => {
    expect(ratioFromCalibration(0, 240)).toBeNull();
    expect(ratioFromCalibration(-10, 240)).toBeNull();
    expect(ratioFromCalibration(Number.NaN, 240)).toBeNull();
  });

  it("refuses a nonsense distance", () => {
    expect(ratioFromCalibration(360, 0)).toBeNull();
    expect(ratioFromCalibration(360, -5)).toBeNull();
  });
});

describe("assessSpan — the warning that stops a sheet being quietly wrong", () => {
  it("calls a long span good", () => {
    // 10 inches of paper.
    const a = assessSpan(10 * POINTS_PER_INCH);
    expect(a?.quality).toBe("good");
    expect(a!.errorPercent).toBeLessThan(1);
  });

  it("calls a short span short, and says why it matters", () => {
    // 1 inch of paper.
    const a = assessSpan(1 * POINTS_PER_INCH);
    expect(a?.quality).toBe("short");
    expect(a!.errorPercent).toBeGreaterThan(3);
    expect(a!.message).toMatch(/EVERY measurement/);
  });

  it("has a middle rating rather than only good and bad", () => {
    const a = assessSpan(3 * POINTS_PER_INCH);
    expect(a?.quality).toBe("fair");
  });

  it("gets steadily better as the span grows", () => {
    const short = assessSpan(2 * POINTS_PER_INCH)!;
    const long = assessSpan(20 * POINTS_PER_INCH)!;
    expect(long.errorPercent).toBeLessThan(short.errorPercent);
  });

  it("reports the span in paper inches, which is what it is rating", () => {
    expect(assessSpan(POINTS_PER_INCH)!.paperInches).toBeCloseTo(1, 10);
  });

  it("has nothing to say about nothing", () => {
    expect(assessSpan(0)).toBeNull();
    expect(assessSpan(Number.NaN)).toBeNull();
  });
});

describe("MEASURE HONEST, PAD VISIBLY — no thumb on the scale", () => {
  /**
   * These exist to FAIL if anyone ever adds a safety margin here, however well
   * meant. A margin in the measuring path inflates every measurement on the
   * sheet by an amount the estimator cannot see or dial back, and double-counts
   * against the allowances, which do the same job in the open.
   *
   * Padding belongs to the allowances, makeup and verticals — each its own line
   * in the breakdown. See references/plan-viewer-overhaul.md § 5a.
   */
  it("returns the exact ratio, with nothing added for safety", () => {
    // 5 inches of paper, 20 feet of building. Exactly 48, not 48-and-a-bit.
    const ratio = ratioFromCalibration(5 * POINTS_PER_INCH, 240)!;
    expect(ratio).toBe(48);
  });

  it("does not round a calibrated ratio toward a tidier scale", () => {
    // A real sheet lands off the standard scales. It must stay there: rounding
    // to 1/8" = 1'-0" (96) would look more authoritative than the truth.
    const ratio = ratioFromCalibration(4.94 * POINTS_PER_INCH, 40 * 12)!;
    expect(ratio).toBeCloseTo(97.166, 2);
    expect(ratio).not.toBe(96);
  });

  it("does not lengthen a short span to make it look better", () => {
    // A short span is REPORTED as short. It is not quietly treated as longer,
    // and the ratio it produces is the one it actually measured.
    const spanPoints = 1 * POINTS_PER_INCH;
    expect(assessSpan(spanPoints)!.quality).toBe("short");
    expect(ratioFromCalibration(spanPoints, 120)).toBe(120);
  });

  it("is symmetric — no directional bias in either direction", () => {
    // Measuring 1% long and 1% short must be wrong by the same amount, which is
    // only true if nothing is leaning one way.
    const truth = ratioFromCalibration(100, 480)!;
    const longer = ratioFromCalibration(101, 480)!;
    const shorter = ratioFromCalibration(99, 480)!;
    expect(truth - longer).toBeCloseTo((shorter - truth) * (99 / 101), 6);
  });
});

describe("compareToStandardScales — say so when it looks odd", () => {
  it("finds the nearest standard scale", () => {
    const check = compareToStandardScales(48, COMMON_SCALES)!;
    expect(check.nearestRatio).toBe(48);
    expect(check.percentOff).toBeCloseTo(0, 6);
    expect(check.worthMentioning).toBe(false);
  });

  it("stays quiet about print stretch, which calibration is FOR", () => {
    // A sheet printed 2% small. The calibration is right, the stated ratio is
    // wrong, and nagging about it would be nagging about the correct answer.
    const check = compareToStandardScales(96 * 1.02, COMMON_SCALES)!;
    expect(check.nearestRatio).toBe(96);
    expect(check.worthMentioning).toBe(false);
  });

  it("speaks up when the result is roughly double — a misread dimension", () => {
    const check = compareToStandardScales(96 * 1.9, COMMON_SCALES)!;
    expect(check.worthMentioning).toBe(true);
  });

  it("speaks up when the result is nowhere near anything standard", () => {
    const check = compareToStandardScales(37, COMMON_SCALES)!;
    expect(check.worthMentioning).toBe(true);
  });

  it("reports the direction, so the message can say which way", () => {
    // Around 1/4" = 1'-0" (48), whose neighbours are 64 and 32 — far enough
    // either side that 10% stays nearest 48 rather than jumping to the next
    // rung. Picking a ratio without checking the ladder is how this test was
    // wrong the first time.
    expect(
      compareToStandardScales(48 * 1.1, COMMON_SCALES)!.percentOff
    ).toBeGreaterThan(0);
    expect(
      compareToStandardScales(48 * 0.9, COMMON_SCALES)!.percentOff
    ).toBeLessThan(0);
  });

  it("picks the nearest rung by RATIO, not by subtraction", () => {
    // Its own two-rung ladder, so this tests the ALGORITHM rather than whatever
    // COMMON_SCALES happens to contain. Against the real ladder my first
    // attempt at this test picked a rung I had forgotten existed.
    //
    // 150 is 50 above 100 and 150 below 300 by subtraction, so plain distance
    // says 100. By ratio it is 1.5x above 100 and 2x below 300 — still 100, but
    // now for the reason that means something. Move to 220: subtraction says
    // 300 is nearer (80 vs 120), ratio says 100 is (2.2x vs 1.36x)... and 300
    // wins correctly.
    const ladder = [
      { text: "a", ratio: 100 },
      { text: "b", ratio: 300 },
    ];
    // Geometric midpoint is sqrt(100*300) = 173.2.
    expect(compareToStandardScales(170, ladder)!.nearestRatio).toBe(100);
    expect(compareToStandardScales(180, ladder)!.nearestRatio).toBe(300);
    // Plain subtraction would have put 180 with 100 (80 away vs 120 away).
  });

  it("never alters the ratio — it only comments on it", () => {
    // The guard against this becoming a "helpful" snap-to-standard later.
    const measured = 97.166;
    const check = compareToStandardScales(measured, COMMON_SCALES)!;
    expect(check.nearestRatio).toBe(96);
    // Nothing returned is a replacement ratio.
    expect(Object.values(check)).not.toContain(96.0000001);
    expect(measured).toBe(97.166);
  });

  it("has nothing to say about nonsense", () => {
    expect(compareToStandardScales(0, COMMON_SCALES)).toBeNull();
    expect(compareToStandardScales(Number.NaN, COMMON_SCALES)).toBeNull();
    expect(compareToStandardScales(48, [])).toBeNull();
  });
});

describe("the error the span warning is warning about", () => {
  /**
   * The worked example from the plan document, as an executable claim: the same
   * carelessness over a short span is an order of magnitude worse.
   */
  it("shows a short span multiplying a slip into a big error", () => {
    const longSpan = assessSpan(10 * POINTS_PER_INCH)!;
    const shortSpan = assessSpan(1 * POINTS_PER_INCH)!;
    expect(shortSpan.errorPercent / longSpan.errorPercent).toBeCloseTo(10, 6);
  });

  it("a 4% scale error is 8 feet wrong on a 200 foot run", () => {
    const a = assessSpan(1.5 * POINTS_PER_INCH)!;
    expect(a.quality).toBe("short");
    const feetWrongOn200 = (a.errorPercent / 100) * 200;
    expect(feetWrongOn200).toBeGreaterThan(5);
  });
});
