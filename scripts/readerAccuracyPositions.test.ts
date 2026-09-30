import { describe, expect, it } from "vitest";
import {
  describePlacement,
  fitAxis,
  pairForPosition,
  positionStats,
} from "./readerAccuracyPositions";
import type { HandMark, Suggestion } from "./readerAccuracyScore";

const IN = 72;
const WIDE = 3 * IN;

const mark = (label: string, x: number, y: number): HandMark => ({
  label,
  x,
  y,
});
const guess = (
  label: string | null,
  x: number | null,
  y: number | null,
  unreadable = false
): Suggestion => ({ label, x, y, unreadable });

// A 36x24 sheet. Deliberately NOT one mark per corner in a square: the marks
// spread further down than across, so a fit that mixed the axes up would show.
const PAGE_H = 24 * IN;
const marks = [
  mark("Duplex", 2 * IN, 1 * IN),
  mark("Duplex", 30 * IN, 3 * IN),
  mark("Duplex", 10 * IN, 12 * IN),
  mark("Duplex", 20 * IN, 20 * IN),
  mark("Duplex", 6 * IN, 23 * IN),
];

describe("pairForPosition", () => {
  it("measures a mark 2 inches off, which the counting radius calls missed", () => {
    const pairs = pairForPosition(
      [mark("Duplex", 100, 100)],
      [guess("duplex", 100, 100 + 2 * IN)],
      WIDE
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].distance).toBeCloseTo(2 * IN);
    expect(pairs[0].dy).toBeCloseTo(2 * IN);
  });

  it("pairs only the same symbol, and leaves flags and unplaced ones out", () => {
    const pairs = pairForPosition(
      [mark("Duplex", 100, 100)],
      [
        guess("GFCI", 101, 100),
        guess("Duplex", 102, 100, true),
        guess("Duplex", null, null),
        guess("Duplex", 130, 100),
      ],
      WIDE
    );
    expect(pairs.map(p => p.ai.x)).toEqual([130]);
  });

  it("uses each suggestion once, nearest first", () => {
    const pairs = pairForPosition(
      [mark("Duplex", 0, 0), mark("Duplex", 50, 0)],
      [guess("Duplex", 45, 0)],
      WIDE
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].mark.x).toBe(50);
  });

  it("does not pair past the radius", () => {
    expect(
      pairForPosition(
        [mark("Duplex", 0, 0)],
        [guess("Duplex", 4 * IN, 0)],
        WIDE
      )
    ).toEqual([]);
  });
});

describe("fitAxis — stretch or shift", () => {
  it("reads a pure shift as scale 1 and an offset", () => {
    const yours = [72, 500, 1000, 1600];
    const fit = fitAxis(
      yours,
      yours.map(v => v + 36)
    );
    expect(fit!.scale).toBeCloseTo(1, 6);
    expect(fit!.offsetInches).toBeCloseTo(0.5, 6);
  });

  it("reads a stretch as a scale away from 1 and no offset", () => {
    const yours = [72, 500, 1000, 1600];
    const fit = fitAxis(
      yours,
      yours.map(v => v * 1.1)
    );
    expect(fit!.scale).toBeCloseTo(1.1, 6);
    expect(fit!.offsetInches).toBeCloseTo(0, 6);
  });

  it("refuses a fit when the marks do not spread on that axis", () => {
    expect(fitAxis([100, 101, 102], [100, 101, 102])).toBeNull();
    expect(fitAxis([100], [100])).toBeNull();
  });
});

describe("positionStats", () => {
  it("shows Track A's shape: a vertical stretch, worse toward the bottom", () => {
    // 10% taller than the drawing, measured from the top edge: the bottom
    // mark at 23 in lands 2.3 in low, the top one 0.1 in low.
    const ai = marks.map(m => guess(m.label, m.x, m.y * 1.1));
    const s = positionStats(
      pairForPosition(marks, ai, WIDE),
      marks.length,
      PAGE_H
    )!;
    expect(s.pairs).toBe(5);
    expect(s.unpaired).toBe(0);
    expect(s.maxInches).toBeCloseTo(2.3, 6);
    expect(s.fitY!.scale).toBeCloseTo(1.1, 6);
    expect(s.fitY!.offsetInches).toBeCloseTo(0, 6);
    expect(s.fitX!.scale).toBeCloseTo(1, 6);
    const [top, , bottom] = s.byBand;
    expect(bottom.medianInches).toBeGreaterThan(top.medianInches);
    expect(s.meanDxInches).toBeCloseTo(0, 6);
  });

  it("counts a mark with no suggestion near it as unpaired, not as zero error", () => {
    const s = positionStats(
      pairForPosition(marks, [guess("Duplex", 2 * IN, 1 * IN)], WIDE),
      marks.length,
      PAGE_H
    )!;
    expect(s.pairs).toBe(1);
    expect(s.unpaired).toBe(4);
    expect(s.medianInches).toBe(0);
  });

  it("is null when nothing paired, so a table shows a gap rather than 0 in", () => {
    expect(positionStats([], 5, PAGE_H)).toBeNull();
    expect(describePlacement(null)).toBe("placement: nothing paired");
  });

  it("files a mark on the very bottom edge in the bottom third", () => {
    const s = positionStats(
      pairForPosition(
        [mark("Duplex", 0, PAGE_H)],
        [guess("Duplex", 0, PAGE_H)],
        WIDE
      ),
      1,
      PAGE_H
    )!;
    expect(s.byBand.map(b => b.pairs)).toEqual([0, 0, 1]);
  });
});
