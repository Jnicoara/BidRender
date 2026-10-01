/**
 * WHERE the AI's marks land, for scripts/readerAccuracy.mts.
 *
 * readerAccuracyScore.ts answers "did it find the symbol": a suggestion counts
 * only within a third of an inch of your mark. That radius is right for
 * counting and useless for measuring placement, because a mark that landed
 * 2 inches away is simply "missed" there and its 2 inches are never seen.
 * Track A measured AI marks up to ~2.4 in of paper off, worse toward the
 * bottom of the sheet (2026-09-29) — a stretch, not a shift — so this file
 * measures the distance itself.
 *
 * Pure: no database, no model, no files, so the suite can reach it.
 *
 * ── How a mark is paired ─────────────────────────────────────────────────────
 * Each hand mark is paired with a suggestion of the SAME symbol, nearest first,
 * each used once, within `maxRadiusPoints` (the script uses 3 in, above the
 * 2.4 in seen). Unreadable flags and suggestions with no position are left
 * out. The limit to know about: on a sheet where the same symbol repeats more
 * closely than the error, a mark can pair with its neighbour's suggestion, and
 * the error reads SMALLER than it is. The fit below is the better witness for
 * a stretch, because a neighbour mix-up does not bend a straight line.
 *
 * ── Stretch or shift ─────────────────────────────────────────────────────────
 * Per axis, a straight line through the pairs: ai = scale x yours + offset.
 * A pure shift is scale 1.00 with an offset; a stretch is a scale away from
 * 1.00, and its error grows with distance from the top-left, which is exactly
 * "worse toward the bottom". Offsets are reported in inches.
 */
import {
  labelKey,
  type HandMark,
  type Suggestion,
} from "./readerAccuracyScore";

export const POINTS_PER_INCH = 72;

export type PositionPair = {
  mark: HandMark;
  ai: { x: number; y: number };
  /** AI minus yours, in points. Positive dy means the AI marked it LOWER. */
  dx: number;
  dy: number;
  distance: number;
};

/** One-to-one, same symbol, nearest first. */
export function pairForPosition(
  marks: HandMark[],
  suggestions: Suggestion[],
  maxRadiusPoints: number
): PositionPair[] {
  type Candidate = { m: number; g: number; distance: number };
  const candidates: Candidate[] = [];
  marks.forEach((mark, m) => {
    const key = labelKey(mark.label);
    if (key === "") return;
    suggestions.forEach((s, g) => {
      if (s.unreadable || s.x === null || s.y === null) return;
      if (labelKey(s.label) !== key) return;
      const distance = Math.hypot(s.x - mark.x, s.y - mark.y);
      if (distance <= maxRadiusPoints) candidates.push({ m, g, distance });
    });
  });
  candidates.sort((a, b) => a.distance - b.distance || a.m - b.m || a.g - b.g);
  const usedM = new Set<number>();
  const usedG = new Set<number>();
  const pairs: PositionPair[] = [];
  for (const c of candidates) {
    if (usedM.has(c.m) || usedG.has(c.g)) continue;
    usedM.add(c.m);
    usedG.add(c.g);
    const mark = marks[c.m];
    const s = suggestions[c.g];
    pairs.push({
      mark,
      ai: { x: s.x!, y: s.y! },
      dx: s.x! - mark.x,
      dy: s.y! - mark.y,
      distance: c.distance,
    });
  }
  return pairs;
}

/** ai = scale x yours + offset. Null when the marks do not spread on this axis. */
export type AxisFit = { scale: number; offsetInches: number } | null;

export function fitAxis(yours: number[], ai: number[]): AxisFit {
  const n = yours.length;
  if (n < 2) return null;
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / n;
  const my = mean(yours);
  const ma = mean(ai);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (yours[i] - my) ** 2;
    sxy += (yours[i] - my) * (ai[i] - ma);
  }
  // Less than an inch of spread says nothing about scale.
  if (sxx / n < POINTS_PER_INCH ** 2 / 4) return null;
  const scale = sxy / sxx;
  return { scale, offsetInches: (ma - scale * my) / POINTS_PER_INCH };
}

/** The value `q` of the way up a sorted list (0.5 = median), nearest rank. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export type BandStats = { band: string; pairs: number; medianInches: number };

export type PositionStats = {
  /** Hand marks paired with a same-symbol suggestion. */
  pairs: number;
  /** Hand marks with no same-symbol suggestion within the radius. */
  unpaired: number;
  medianInches: number;
  p90Inches: number;
  maxInches: number;
  /** Average of AI minus yours: a SHIFT shows here. */
  meanDxInches: number;
  meanDyInches: number;
  fitX: AxisFit;
  fitY: AxisFit;
  /** By where your mark sits on the sheet: top, middle, bottom third. */
  byBand: BandStats[];
};

const BANDS = ["top third", "middle third", "bottom third"];

/** Null when nothing paired, so a table shows a gap rather than a zero. */
export function positionStats(
  pairs: PositionPair[],
  markCount: number,
  pageHeightPoints: number
): PositionStats | null {
  if (pairs.length === 0) return null;
  const inches = (p: number) => p / POINTS_PER_INCH;
  const sorted = pairs.map(p => p.distance).sort((a, b) => a - b);
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

  const byBand = BANDS.map((band, i) => {
    const mine = pairs
      .filter(p => {
        const at = Math.min(2, Math.floor((p.mark.y / pageHeightPoints) * 3));
        return Math.max(0, at) === i;
      })
      .map(p => p.distance)
      .sort((a, b) => a - b);
    return {
      band,
      pairs: mine.length,
      medianInches: inches(quantile(mine, 0.5)),
    };
  });

  return {
    pairs: pairs.length,
    unpaired: markCount - pairs.length,
    medianInches: inches(quantile(sorted, 0.5)),
    p90Inches: inches(quantile(sorted, 0.9)),
    maxInches: inches(sorted[sorted.length - 1]),
    meanDxInches: inches(mean(pairs.map(p => p.dx))),
    meanDyInches: inches(mean(pairs.map(p => p.dy))),
    fitX: fitAxis(
      pairs.map(p => p.mark.x),
      pairs.map(p => p.ai.x)
    ),
    fitY: fitAxis(
      pairs.map(p => p.mark.y),
      pairs.map(p => p.ai.y)
    ),
    byBand,
  };
}

/** One line for the console: "median 0.42 in, 90% 1.1 in, worst 2.4 in". */
export function describePlacement(s: PositionStats | null): string {
  if (!s) return "placement: nothing paired";
  const f = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "–");
  const fit = (name: string, a: AxisFit) =>
    a
      ? `${name} x${a.scale.toFixed(3)} ${a.offsetInches >= 0 ? "+" : ""}${f(a.offsetInches)} in`
      : `${name} –`;
  const bands = s.byBand
    .map(b => `${b.band.split(" ")[0]} ${b.pairs ? f(b.medianInches) : "–"}`)
    .join(", ");
  return (
    `placement (${s.pairs} paired, ${s.unpaired} not): median ${f(s.medianInches)} in, ` +
    `90% ${f(s.p90Inches)} in, worst ${f(s.maxInches)} in · ` +
    `fit ${fit("across", s.fitX)}, ${fit("down", s.fitY)} · by third: ${bands}`
  );
}
