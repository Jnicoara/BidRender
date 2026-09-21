/**
 * Reading the drawing scale off a plan sheet, and writing one down by hand.
 *
 * ── What a scale IS here ─────────────────────────────────────────────────────
 * One number: `ratio`, the real-world distance covered by one unit of paper.
 * `1/4" = 1'-0"` means a quarter inch of paper is twelve inches of building, so
 * ratio = 48. `1" = 20'` is 240. `1:100` is 100. Everything reduces to that, so
 * the measuring phases have exactly one number to multiply by and never have to
 * re-interpret an architect's notation.
 *
 * ── Why detection is separate from application ───────────────────────────────
 * Auto-detecting scale from a sheet is genuinely unreliable. Sheets carry scale
 * notes for details that are not the sheet's own scale ("SCALE: 3/4" = 1'-0""
 * under one blow-up on an otherwise 1/8" plan), title blocks say "AS NOTED",
 * and OCR-free text extraction returns whatever order the PDF stored glyphs in.
 *
 * A wrong scale silently applied is the worst outcome available: every length
 * measured afterwards is wrong by a constant factor, and nothing on screen
 * looks broken. So detection returns a CONFIDENCE, and only `high` is ever
 * applied without asking. Anything less is offered as a suggestion the user
 * accepts in one click — which is still faster than typing it, but cannot be
 * mistaken for something the app knew.
 *
 * ── The manual path is never a fallback ──────────────────────────────────────
 * `parseScaleText` is what the manual override uses, and it is the same parser
 * detection uses. A user typing `1/4" = 1'-0"` and a sheet stating it produce
 * an identical stored ratio; only `source` differs.
 */

/** How sure detection is. Only `high` may be applied without asking. */
export type ScaleConfidence = "high" | "medium" | "low";

/** Where a sheet's stored scale came from. */
export type ScaleSource = "detected" | "manual" | "none";

export type ParsedScale = {
  /** Real-world distance per one unit of paper. `1/4" = 1'-0"` → 48. */
  ratio: number;
  /** Tidied version of what was read, for display: `1/4" = 1'-0"`. */
  text: string;
};

export type ScaleCandidate = ParsedScale & {
  /** The raw substring this came from, so the UI can show what it saw. */
  raw: string;
  /** True when the match sat next to the word "scale". */
  labelled: boolean;
};

export type ScaleDetection = {
  best: ScaleCandidate | null;
  confidence: ScaleConfidence;
  /** Every distinct scale found, best first. Shown when they disagree. */
  candidates: ScaleCandidate[];
  /** The sheet says it is explicitly not to scale. */
  notToScale: boolean;
};

const INCHES_PER_FOOT = 12;

/** Scales an estimator actually meets, for the manual picker. */
export const COMMON_SCALES: { text: string; ratio: number }[] = [
  { text: '1/16" = 1\'-0"', ratio: 192 },
  { text: '3/32" = 1\'-0"', ratio: 128 },
  { text: '1/8" = 1\'-0"', ratio: 96 },
  { text: '3/16" = 1\'-0"', ratio: 64 },
  { text: '1/4" = 1\'-0"', ratio: 48 },
  { text: '3/8" = 1\'-0"', ratio: 32 },
  { text: '1/2" = 1\'-0"', ratio: 24 },
  { text: '3/4" = 1\'-0"', ratio: 16 },
  { text: '1" = 1\'-0"', ratio: 12 },
  { text: '1-1/2" = 1\'-0"', ratio: 8 },
  { text: '3" = 1\'-0"', ratio: 4 },
  { text: "1\" = 10'", ratio: 120 },
  { text: "1\" = 20'", ratio: 240 },
  { text: "1\" = 30'", ratio: 360 },
  { text: "1\" = 40'", ratio: 480 },
  { text: "1\" = 50'", ratio: 600 },
  { text: "1\" = 100'", ratio: 1200 },
];

/** Normalise the quote characters a PDF or a keyboard might produce. */
function normalizeQuotes(input: string): string {
  return input
    .replace(/[′‘’ʹ´`]/g, "'")
    .replace(/[″“”ʺ]/g, '"')
    .replace(/–|—/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1-1/2" → 1.5, "3/4" → 0.75, "2" → 2. Returns null on anything else. */
function parseMixedNumber(
  whole: string | undefined,
  num: string | undefined,
  den: string | undefined
): number | null {
  const w = whole ? Number(whole) : 0;
  if (!Number.isFinite(w)) return null;
  if (num === undefined || den === undefined)
    return w === 0 && !whole ? null : w;
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return w + n / d;
}

/** Render a paper-inch measurement the way a drawing states it. */
function formatInches(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 1e-9) return `${whole}"`;
  // Snap to the sixteenths architects actually use rather than printing 0.1875.
  const sixteenths = Math.round(frac * 16);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(sixteenths, 16);
  const fracText = `${sixteenths / g}/${16 / g}`;
  return whole === 0 ? `${fracText}"` : `${whole}-${fracText}"`;
}

/**
 * Parse a written scale into a ratio.
 *
 * Accepts the three notations that appear on real drawings:
 *   • architectural — `1/4" = 1'-0"`, `3/4"=1'`, `1-1/2" = 1'-0"`
 *   • engineering   — `1" = 20'`, `1"=100'`
 *   • plain ratio   — `1:100`, `1 : 50`
 *
 * Returns null for anything it cannot read, INCLUDING "AS NOTED" and "NTS" —
 * those are meaningful to a human but are not a number, and pretending
 * otherwise would put a fabricated ratio behind every later measurement.
 */
export function parseScaleText(input: string): ParsedScale | null {
  if (!input) return null;
  const text = normalizeQuotes(input);

  // Architectural: <paper inches> " = <feet> ' [- <inches> "]
  const arch = text.match(
    /(?:(\d+)\s*[-\s]\s*)?(?:(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?))\s*"?\s*=\s*(\d+(?:\.\d+)?)\s*'(?:\s*-?\s*(\d+(?:\.\d+)?)\s*"?)?/
  );
  if (arch) {
    const [, mixedWhole, num, den, plain, feet, inches] = arch;
    const paper =
      num !== undefined
        ? parseMixedNumber(mixedWhole, num, den)
        : Number(plain);
    const real = Number(feet) * INCHES_PER_FOOT + (inches ? Number(inches) : 0);
    if (paper && paper > 0 && real > 0) {
      return {
        ratio: real / paper,
        text: `${formatInches(paper)} = ${formatFeetInches(real)}`,
      };
    }
  }

  // Plain ratio: 1:100
  const plainRatio = text.match(/\b1\s*:\s*(\d+(?:\.\d+)?)\b/);
  if (plainRatio) {
    const ratio = Number(plainRatio[1]);
    if (ratio > 0) return { ratio, text: `1:${plainRatio[1]}` };
  }

  return null;
}

/** Render a real-world inch count as feet and inches: 240 → `20'`. */
function formatFeetInches(totalInches: number): string {
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = totalInches - feet * INCHES_PER_FOOT;
  if (inches < 1e-9) return feet === 1 ? `1'-0"` : `${feet}'`;
  return `${feet}'-${formatInches(inches)}`;
}

/** How a stored ratio reads when there is no original text to show. */
export function formatRatio(ratio: number): string {
  const known = COMMON_SCALES.find(s => Math.abs(s.ratio - ratio) < 1e-6);
  if (known) return known.text;
  return `1:${Number(ratio.toFixed(4))}`;
}

/**
 * How close a calibrated ratio has to be before it is CALLED a standard scale.
 *
 * Tight on purpose. A calibrated sheet lands a hair off a round number through
 * click precision alone — 64.015002 is 0.02% from 3/16" and is plainly that
 * scale. A sheet genuinely stretched in printing sits 1–3% off, and naming THAT
 * as the nominal scale would hide the very thing calibration exists to find.
 *
 * So: snap only where the gap is smaller than any real cause, and otherwise say
 * what the paper actually measures.
 */
const STANDARD_SNAP_PERCENT = 0.5;

/**
 * The scale in the words an estimator uses, from the ratio alone.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Calibration stores its result as `1:64.015002`, because the ratio is what is
 * true and rounding it would throw away the accuracy just bought. That number
 * is correct and unreadable. It was in the toolbar of a real job on
 * 2026-09-21, where nobody could tell at a glance that the sheet was at 3/16",
 * and a wrong scale therefore looked exactly like a right one.
 *
 * This changes the LABEL and never the ratio. Two forms, both plain:
 *
 *   within 0.5% of a standard   `3/16" = 1'-0"` — the name people say
 *   anything else               `1" = 6'-8"`    — what one inch of paper is
 *
 * The second form is deliberately engineering notation whatever the scale,
 * because it is the one reading that is always true and always says something:
 * an architectural sheet 9% off standard has no architect's name, and inventing
 * the nearest one would be the lie this function exists to remove.
 */
export function describeScale(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";

  let nearest = COMMON_SCALES[0];
  let bestGap = Infinity;
  for (const scale of COMMON_SCALES) {
    const gap = Math.abs((ratio - scale.ratio) / scale.ratio) * 100;
    if (gap < bestGap) {
      bestGap = gap;
      nearest = scale;
    }
  }
  if (bestGap <= STANDARD_SNAP_PERCENT) return nearest.text;

  return `1" = ${formatFeetInches(ratio)}`;
}

/** Explicitly-not-to-scale markings. Recognised so they can be reported. */
const NTS = /\b(N\.?\s?T\.?\s?S\.?|NOT\s+TO\s+SCALE)\b/i;

/**
 * Find the scale stated on a sheet, with a confidence.
 *
 * Confidence is the whole point of this function:
 *   • high   — exactly one scale found, sitting next to the word "scale".
 *   • medium — a scale found, but unlabelled, or labelled and alone in a sheet
 *              that also mentions other scales in passing.
 *   • low    — several DIFFERENT scales found, or the sheet says "as noted".
 *              A detail blow-up's scale next to a plan's scale is the common
 *              case, and there is no reliable way to tell which is the sheet's.
 *
 * Only `high` should be applied without asking. See the module header.
 */
export function detectScaleFromText(sheetText: string): ScaleDetection {
  const empty: ScaleDetection = {
    best: null,
    confidence: "low",
    candidates: [],
    notToScale: false,
  };
  if (!sheetText) return empty;

  const text = normalizeQuotes(sheetText);
  const notToScale = NTS.test(text);
  const asNoted = /\bAS\s+NOTED\b/i.test(text);

  // Walk every plausible fragment rather than one global match, so a sheet
  // carrying two scales is SEEN to carry two rather than silently taking the
  // first — that ambiguity is exactly what must lower confidence.
  const fragmentRe =
    /(?:(?:\d+\s*[-\s]\s*)?(?:\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*"?\s*=\s*\d+(?:\.\d+)?\s*'(?:\s*-?\s*\d+(?:\.\d+)?\s*"?)?)|(?:\b1\s*:\s*\d+(?:\.\d+)?\b)/g;

  const seen = new Map<number, ScaleCandidate>();
  // Array.from rather than for..of over the iterator: this file is shared with
  // the server build, whose tsconfig target does not allow iterating one.
  for (const match of Array.from(text.matchAll(fragmentRe))) {
    const raw = match[0];
    const parsed = parseScaleText(raw);
    if (!parsed) continue;
    // "Labelled" = the word scale appears just before it. 24 characters is
    // enough for "SCALE: " and a little punctuation, and short enough that an
    // unrelated earlier mention does not count.
    const before = text.slice(
      Math.max(0, (match.index ?? 0) - 24),
      match.index ?? 0
    );
    const labelled = /scale\s*[:\-]?\s*$/i.test(before);
    const existing = seen.get(parsed.ratio);
    if (existing) {
      // Keep the labelled sighting if any sighting was labelled.
      if (labelled && !existing.labelled)
        seen.set(parsed.ratio, { ...existing, labelled: true, raw });
      continue;
    }
    seen.set(parsed.ratio, { ...parsed, raw, labelled });
  }

  const candidates = Array.from(seen.values()).sort(
    (a, b) => Number(b.labelled) - Number(a.labelled)
  );
  if (candidates.length === 0) {
    return { best: null, confidence: "low", candidates: [], notToScale };
  }

  const best = candidates[0];
  let confidence: ScaleConfidence;
  if (candidates.length > 1 || asNoted) {
    // Two different scales on one sheet, or a title block deferring to the
    // drawings. Either way the app does not know which one governs.
    confidence = "low";
  } else if (best.labelled) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  return { best, confidence, candidates, notToScale };
}

/** Whether a detection may be stored without the user confirming it. */
export function isAutoApplicable(detection: ScaleDetection): boolean {
  return detection.confidence === "high" && detection.best !== null;
}
