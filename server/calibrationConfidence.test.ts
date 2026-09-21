/**
 * Reading a scale in plain words, and catching a plausible wrong one.
 *
 * ── The job these come from ──────────────────────────────────────────────────
 * Bid 23, the Decant Facility, 2026-09-21.
 *
 * **Sheet 11** is drawn at 1" = 10', ratio 120. Its graphic scale bar reads
 * 10-5-0-10-20 — THIRTY feet end to end, because the bar starts to the left of
 * its zero. Clicking the two ends and typing 20 gave 120 x 20/30 = **80**, so a
 * 100 ft building measured 67 ft.
 *
 * **Sheet 13** was right all along: 1:64, which is 3/16" = 1'-0".
 *
 * ── What each guard would have done, stated honestly ─────────────────────────
 * 1:80 is NOT a standard scale — it sits 17% below 1/8" = 1'-0" — so the
 * off-standard warning WOULD have caught sheet 11 the moment it was set. That
 * warning was real and was only shown for the few seconds before Apply; making
 * it stay on the toolbar is what fixes this particular job.
 *
 * ── And why the second measurement still matters ─────────────────────────────
 * Because the same misread does NOT always land somewhere suspicious. Read a
 * 1/8" = 1'-0" sheet the same way and you get 96 x 20/30 = exactly 64, which is
 * 3/16" = 1'-0", a textbook scale that no amount of looking at the ratio can
 * question. That case is hypothetical here rather than what happened on bid 23
 * — it is the reason the check exists, and the tests below keep the two apart.
 *
 * ── Corrected 2026-09-21 ─────────────────────────────────────────────────────
 * The first version of this file said sheet 11 was 1/8" and had produced 64,
 * conflating it with sheet 13's correct 1:64. That told the wrong story about a
 * real job AND overstated the case for the check by claiming the warning could
 * not have caught it. The general point survives; the worked example was wrong.
 * The v6.8 commit message still carries the old version and cannot be edited.
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
  it("WOULD have caught sheet 11 of bid 23", () => {
    // 1" = 10' misread off the scale bar gives 1:80, which is 17% below the
    // nearest rung. This is the guard that was already right and was simply
    // not shown for long enough — it now lives on the toolbar.
    const wrong = 120 * (20 / 30);
    expect(wrong).toBe(80);
    const check = compareToStandardScales(wrong, COMMON_SCALES);
    expect(check?.worthMentioning).toBe(true);
    expect(check?.nearestText).toBe('1/8" = 1\'-0"');
    expect(check?.percentOff).toBeCloseTo(-16.7, 1);
  });

  it("cannot see the same misread on a 1/8 inch sheet, which is why the check exists", () => {
    /*
      A LIMITATION asserted on purpose, so nobody reads the warning as
      protection it does not give.

      This is not what happened on bid 23 — sheet 11 was 1" = 10' and WAS
      flagged, above. It is what happens on the next sheet along: read a 1/8"
      sheet from the ends of its bar and the answer is exactly 3/16", a real
      scale sitting exactly on a rung, so every check based on "does this look
      like a scale" is satisfied. Only a second measurement catches that one.
    */
    const wrong = 96 * (20 / 30);
    expect(wrong).toBe(64);
    const check = compareToStandardScales(wrong, COMMON_SCALES);
    expect(check?.worthMentioning).toBe(false);
    expect(check?.nearestText).toBe('3/16" = 1\'-0"');
  });

  it("leaves sheet 13 alone, because it was right", () => {
    const check = compareToStandardScales(64, COMMON_SCALES);
    expect(check?.worthMentioning).toBe(false);
    expect(describeScale(64)).toBe('3/16" = 1\'-0"');
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

  it("catches sheet 11 of bid 23 and names the factor", () => {
    /*
      The whole job, end to end, with the real numbers: 1" = 10' misread as
      20 ft across a 30 ft bar. A 100 ft building then measures 66.67 ft —
      exactly what was reported.
    */
    const trueRatio = 120;
    const wrongRatio = trueRatio * (20 / 30);
    expect(wrongRatio).toBe(80);

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
