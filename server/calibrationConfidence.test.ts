/**
 * Reading a scale in plain words, and catching a plausible wrong one.
 *
 * ── The job these come from ──────────────────────────────────────────────────
 * Bid 23, the Decant Facility, 2026-09-21. Sheet 11 carried a graphic scale bar
 * reading 10-5-0-10-20. End to end that is THIRTY feet, because the bar starts
 * to the left of its zero. Clicking the two ends and typing 20 set the scale to
 * two thirds of the truth, and a 100 ft building measured 67 ft.
 *
 * The arithmetic is the reason this file exists. The sheet was 1/8" = 1'-0", so
 * the mistake produced 96 x 20/30 = exactly 64 — which is 3/16" = 1'-0", a
 * textbook scale. Every check the app had said yes: the span was long, the
 * ratio was standard, the arithmetic was right. A second known dimension is the
 * only thing that can tell a right scale from a plausible wrong one.
 */
import { describe, it, expect } from "vitest";
import { describeScale, COMMON_SCALES, formatRatio } from "../shared/planScale";
import {
  checkCalibration,
  compareToStandardScales,
} from "../shared/planCalibration";

describe("a scale reads in plain words", () => {
  it("names a standard scale exactly on the number", () => {
    expect(describeScale(64)).toBe('3/16" = 1\'-0"');
    expect(describeScale(96)).toBe('1/8" = 1\'-0"');
    expect(describeScale(48)).toBe('1/4" = 1\'-0"');
    expect(describeScale(240)).toBe("1\" = 20'");
  });

  it("still names it when calibration lands a hair off", () => {
    // The number that was in the toolbar of the real job, unreadable as
    // "1:64.015002" and plainly 3/16" to anybody who can see it said so.
    expect(describeScale(64.015002)).toBe('3/16" = 1\'-0"');
    expect(describeScale(95.8)).toBe('1/8" = 1\'-0"');
  });

  it("refuses to name one when the sheet is genuinely off standard", () => {
    /*
      1:80 sits 17% from 1/8" and 25% from 3/16". Calling it either would hide
      the one fact worth knowing about the sheet. 80 real inches to 1 paper
      inch is 6'-8".
    */
    expect(describeScale(80)).toBe('1" = 6\'-8"');
    // A print-stretched sheet: 3% off is a real cause, not click precision.
    expect(describeScale(64 * 1.03)).not.toContain("3/16");
  });

  it("never prints a bare ratio, whatever it is handed", () => {
    for (const ratio of [7, 63.2, 80, 101.7, 333.33, 1201]) {
      expect(describeScale(ratio)).not.toMatch(/^1:/);
    }
  });

  it("agrees with formatRatio wherever formatRatio had an answer", () => {
    // formatRatio is the older, exact-match version and is still used where a
    // stored text exists. Where both speak, they must not disagree.
    for (const scale of COMMON_SCALES) {
      expect(describeScale(scale.ratio)).toBe(formatRatio(scale.ratio));
    }
  });

  it("says something for a nonsense ratio rather than throwing", () => {
    expect(describeScale(0)).toBe("—");
    expect(describeScale(Number.NaN)).toBe("—");
    expect(describeScale(-5)).toBe("—");
  });
});

describe("the standard-scale warning, and what it cannot see", () => {
  it("flags a ratio that is nowhere near a standard scale", () => {
    const check = compareToStandardScales(80, COMMON_SCALES);
    expect(check?.worthMentioning).toBe(true);
  });

  it("CANNOT flag the Decant Facility error, and that is the point", () => {
    /*
      This test asserts a LIMITATION on purpose, so nobody reads the warning as
      the protection it is not.

      1/8" misread off a scale bar gives exactly 3/16". The result is a real
      scale, sitting exactly on a rung of the ladder, so every check based on
      "does this look like a scale" is satisfied. Only a second measurement
      catches it — see checkCalibration below.
    */
    const wrong = 96 * (20 / 30);
    expect(wrong).toBe(64);
    const check = compareToStandardScales(wrong, COMMON_SCALES);
    expect(check?.worthMentioning).toBe(false);
    expect(check?.nearestText).toBe('3/16" = 1\'-0"');
  });
});

describe("checking a scale against a second known dimension", () => {
  it("confirms when the two agree", () => {
    const check = checkCalibration(1200, 1200);
    expect(check?.agrees).toBe(true);
    expect(check?.message).toContain("Checks out");
  });

  it("tolerates the slop of two clicks and a rounded dimension", () => {
    expect(checkCalibration(1200 * 1.015, 1200)?.agrees).toBe(true);
    expect(checkCalibration(1200 * 0.985, 1200)?.agrees).toBe(true);
  });

  it("catches the Decant Facility error and names the factor", () => {
    /*
      The whole job, end to end. The scale is wrong by 20/30, so a 100 ft
      building measures 66.67 ft — exactly what was reported.
    */
    const trueRatio = 96;
    const wrongRatio = trueRatio * (20 / 30);
    const realInches = 100 * 12;
    const measuredInches = realInches * (wrongRatio / trueRatio);

    expect(measuredInches / 12).toBeCloseTo(66.67, 1);

    const check = checkCalibration(measuredInches, realInches);
    expect(check?.agrees).toBe(false);
    expect(check?.suspectFactor).toBe(1.5);
    expect(check?.message).toContain("1.5x");
    expect(check?.message).toContain("scale bar");
    expect(check?.message).toContain("33% too short");
  });

  it("names a 12x mix-up as feet and inches rather than a scale bar", () => {
    const check = checkCalibration(1200, 100);
    expect(check?.suspectFactor).toBe(12);
    expect(check?.message).toContain("feet and inches");
    expect(check?.message).not.toContain("scale bar");
  });

  it("reports a disagreement with no clean factor without inventing one", () => {
    const check = checkCalibration(1200, 1000);
    expect(check?.agrees).toBe(false);
    expect(check?.suspectFactor).toBeNull();
    expect(check?.message).toContain("Re-measure");
  });

  it("works in both directions", () => {
    const tooLong = checkCalibration(300, 200);
    expect(tooLong?.percentOff).toBeCloseTo(50, 5);
    expect(tooLong?.message).toContain("too long");

    const tooShort = checkCalibration(200, 300);
    expect(tooShort?.percentOff).toBeCloseTo(-33.33, 1);
    expect(tooShort?.message).toContain("too short");
  });

  it("returns null rather than a verdict on nothing", () => {
    expect(checkCalibration(0, 100)).toBeNull();
    expect(checkCalibration(100, 0)).toBeNull();
    expect(checkCalibration(Number.NaN, 100)).toBeNull();
  });
});
