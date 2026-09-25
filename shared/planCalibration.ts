/**
 * Setting a sheet's scale by measuring something you already know.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Most real drawing sets do not state a scale ratio anywhere the app can read,
 * and a set that does may have been scaled on its way to you, which makes the
 * stated ratio a lie told confidently. Typing `1/4" = 1'-0"` is useless on both.
 *
 * So: click two points whose real distance you know — a dimension line, a
 * column grid, a known wall — type the distance, and the ratio falls out.
 *
 * ── It produces the SAME number as typing a ratio ─────────────────────────────
 * `ratio` is the real-world distance covered by one unit of paper, exactly as
 * `shared/planScale.ts` defines it. Calibration is a different way of arriving
 * at that one number, not a second kind of scale, so everything downstream —
 * every measurement, every stored run — is unchanged and unaware.
 *
 * The old PlanPanel stored pixels-per-foot instead, which was tied to the
 * resolution the page happened to be rendered at. Do not go back to that.
 *
 * ── The span is what governs accuracy, not the zoom ──────────────────────────
 * This is the part worth understanding, because it is counter-intuitive and it
 * decides whether a sheet's numbers are trustworthy.
 *
 * A calibration error does not affect one measurement. It multiplies into EVERY
 * measurement on the sheet. And the error is set by the SPAN you calibrate
 * over, not by how carefully you clicked:
 *
 *   a 100 ft dimension at 1/8" scale spans ~1,350 px — 3 px of slop is 0.4%
 *   a 10 ft dimension at the same scale spans ~135 px — the SAME slop is 4.4%
 *
 * So the mitigation is a long span. `assessSpan` exists to push toward one, and
 * to say plainly when a short one will not be trustworthy — rather than
 * accepting it silently and letting the sheet be quietly 4% wrong.
 *
 * ── MEASURE HONEST, PAD VISIBLY ──────────────────────────────────────────────
 * **Nothing in this file may bias the scale in the estimator's favour.** Not a
 * span nudged long "to be safe", not a ratio rounded up, not a margin of any
 * kind. This function returns what was measured.
 *
 * The tempting version — a small safety margin, here, where the numbers are —
 * feels prudent and is corrosive. It would inflate EVERY measurement on the
 * sheet by an amount the estimator cannot see, cannot inspect and cannot dial
 * back, and it would double-count against the allowances, which exist for
 * exactly that and do it in the open where they can be argued with.
 *
 * Padding belongs to the conduit and wire allowances, makeup, and the verticals
 * — each its own line in the run breakdown, each adjustable. See
 * references/plan-viewer-overhaul.md § 5a, and the same rule already stated in
 * `toBillableFeet`: _"inventing them inside a measuring function"_ is the
 * mistake.
 *
 * Pushing toward a LONGER SPAN is not a violation of this — that is better
 * input, with no bias in it, which is the whole distinction.
 */
import { POINTS_PER_INCH } from "./takeoffGeometry";

const INCHES_PER_FOOT = 12;

/**
 * How far a click is assumed to land from where it was aimed, in inches OF
 * PAPER, for one click.
 *
 * A stand-in for human precision rather than a measurement of it. Deliberately
 * pessimistic: the rating it drives should read as cautious, because the cost
 * of being wrong here is every number on the sheet. Zooming in before clicking
 * beats this assumption comfortably, which is why the UI says so.
 */
const ASSUMED_SLIP_INCHES = 1 / 32;

/** Two clicks, so two chances to slip. */
const TOTAL_SLIP_INCHES = ASSUMED_SLIP_INCHES * 2;

/**
 * Read a distance a person typed.
 *
 * Accepts what an estimator would actually write, including how a dimension
 * reads on the drawing itself:
 *
 *   20            20 feet — a BARE NUMBER IS FEET, see below
 *   20'           20 feet
 *   20 ft         20 feet
 *   20.5'         20 feet 6 inches
 *   20'-6"        20 feet 6 inches
 *   20' 6"        the same, written the other common way
 *   24'-6 1/2"    as printed on a dimension line
 *   246"          246 inches
 *   246 in        246 inches
 *
 * **A bare number means FEET.** Calibration distances are building dimensions,
 * and nobody calibrates against something 20 inches long. Guessing inches would
 * be wrong twelve times out of twelve and would produce a scale wrong by a
 * factor of 12 — which is large enough to notice, but the UI states the unit
 * anyway rather than relying on the error being obvious.
 *
 * Returns inches, or null for anything it cannot read. Never guesses.
 */
export function parseLengthText(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // Feet and inches together: 20'-6", 20' 6", 24'-6 1/2", 20 ft 6 in
  const combined =
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*[-\s]?\s*(\d+(?:\.\d+)?)?(?:\s+(\d+)\/(\d+))?\s*(?:"|in|inch|inches)?$/.exec(
      text
    );
  if (combined) {
    const feet = Number(combined[1]);
    const inches = combined[2] ? Number(combined[2]) : 0;
    const fraction =
      combined[3] && combined[4]
        ? Number(combined[3]) / Number(combined[4])
        : 0;
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    if (combined[4] && Number(combined[4]) === 0) return null;
    const total = feet * INCHES_PER_FOOT + inches + fraction;
    return total > 0 ? total : null;
  }

  // Inches only: 246", 246 in
  const inchesOnly =
    /^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*(?:"|in|inch|inches)$/.exec(text);
  if (inchesOnly) {
    const whole = Number(inchesOnly[1]);
    const fraction =
      inchesOnly[2] && inchesOnly[3]
        ? Number(inchesOnly[2]) / Number(inchesOnly[3])
        : 0;
    if (!Number.isFinite(whole)) return null;
    if (inchesOnly[3] && Number(inchesOnly[3]) === 0) return null;
    const total = whole + fraction;
    return total > 0 ? total : null;
  }

  // A bare number. Feet, per the note above.
  const bare = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (bare) {
    const feet = Number(bare[1]);
    return Number.isFinite(feet) && feet > 0 ? feet * INCHES_PER_FOOT : null;
  }

  return null;
}

/**
 * The sheet's scale ratio, from a measured span and the distance it represents.
 *
 * `ratio` = real inches per paper inch, matching `shared/planScale.ts`. The
 * span arrives in PDF page points, which are 1/72 inch of paper and are
 * independent of how the page was rendered — so a calibration done zoomed in
 * and one done zoomed out give the same answer.
 *
 * Returns null rather than a wrong number for a degenerate input: a zero-length
 * span is a double-click, not a measurement.
 */
export function ratioFromCalibration(
  spanPagePoints: number,
  realInches: number
): number | null {
  if (!Number.isFinite(spanPagePoints) || spanPagePoints <= 0) return null;
  if (!Number.isFinite(realInches) || realInches <= 0) return null;
  const paperInches = spanPagePoints / POINTS_PER_INCH;
  const ratio = realInches / paperInches;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

/**
 * What an error percentage means on a run you would actually price.
 *
 * "±4.6%" is a number an estimator has to do arithmetic on before it means
 * anything. "A 1,000 ft run could be off by about 46 ft" is the same fact,
 * already in the units of the decision.
 *
 * A round 1,000 ft is used on purpose rather than the job's real footage: it is
 * a yardstick, and a yardstick that changes size is no use for comparing two
 * sheets against each other.
 */
export const IMPACT_REFERENCE_FEET = 1000;

export function describeErrorImpact(errorPercent: number): string {
  if (!Number.isFinite(errorPercent) || errorPercent <= 0) return "";
  const feet = (errorPercent / 100) * IMPACT_REFERENCE_FEET;
  const rounded = feet >= 10 ? Math.round(feet) : Math.round(feet * 10) / 10;
  return `A ${IMPACT_REFERENCE_FEET.toLocaleString("en-US")} ft run could be off by about ${rounded} ft.`;
}

export type SpanQuality = "good" | "fair" | "short";

export type SpanAssessment = {
  quality: SpanQuality;
  /** The span in inches of paper — what the rating is actually about. */
  paperInches: number;
  /** Roughly how wrong the scale could be, as a percentage. */
  errorPercent: number;
  /** One sentence, ready to show. */
  message: string;
};

/**
 * How trustworthy a calibration over this span will be.
 *
 * The thresholds are the error the assumed slip produces, not arbitrary
 * lengths: 1% and 3%. On a 36-inch sheet that works out at roughly a sixth of
 * the sheet for "good", which matches the instinct to calibrate against the
 * longest dimension printed rather than the nearest one.
 *
 * Returns null when there is nothing to assess yet.
 */
export function assessSpan(spanPagePoints: number): SpanAssessment | null {
  if (!Number.isFinite(spanPagePoints) || spanPagePoints <= 0) return null;

  const paperInches = spanPagePoints / POINTS_PER_INCH;
  const errorPercent = (TOTAL_SLIP_INCHES / paperInches) * 100;

  if (errorPercent <= 1) {
    return {
      quality: "good",
      paperInches,
      errorPercent,
      message: "Good span — a small slip here barely moves the scale.",
    };
  }

  if (errorPercent <= 3) {
    return {
      quality: "fair",
      paperInches,
      errorPercent,
      message:
        "Usable, but a longer dimension would be steadier. Zoom in before clicking each end.",
    };
  }

  return {
    quality: "short",
    paperInches,
    errorPercent,
    message:
      "Short span — a small slip here moves EVERY measurement on this sheet. Use the longest dimension you can find if there is one.",
  };
}

/**
 * ── A short span is a WARNING, never a block ─────────────────────────────────
 *
 * There is no `canApply` here, and there must never be one. Sometimes a graphic
 * scale bar is the only known distance printed on a sheet — plans arrive with
 * hardly any information on them, and a bar two inches long is then the best
 * measurement available, not a mistake to be prevented.
 *
 * Refusing it would leave the estimator with no scale at all, which is strictly
 * worse than a scale they have been told is soft. The app's job is to make the
 * softness visible and durable (see `scaleSpanPaperInches` on the sheet), not
 * to decide on their behalf.
 */

export type StandardScaleCheck = {
  /** The closest architect's or engineer's scale, as text. */
  nearestText: string;
  nearestRatio: number;
  /** How far the measured ratio sits from it, as a percentage. */
  percentOff: number;
  /**
   * Far enough off that it is worth saying out loud.
   *
   * NOT an error, and never a reason to change the number — see § MEASURE
   * HONEST. A drawing genuinely can be off-scale, and a calibrated ratio is the
   * truth about the paper in front of you.
   */
  worthMentioning: boolean;
};

/**
 * How the calibrated ratio compares with the scales drawings are usually drawn
 * at — so the app can say when something looks odd, and let the user decide.
 *
 * Uncertainty shown beats uncertainty hidden. Three things this catches, all of
 * which look identical on screen otherwise:
 *
 *   A few percent off   The sheet was probably scaled in printing or scanning.
 *                       The calibration is RIGHT and the stated ratio is wrong,
 *                       which is exactly why calibration exists.
 *   Roughly double or   A dimension was misread, or feet were typed where the
 *   half               drawing meant something else. Worth a hard look.
 *   Nowhere near        A detail blow-up, a not-to-scale sheet, or two points
 *                       clicked on the wrong things.
 *
 * **This never changes the ratio.** It only gives the estimator something to
 * check against, which is the honest half of the bargain: measure what is
 * there, and be loud when it looks surprising.
 *
 * ── Two things about the comparison itself ───────────────────────────────────
 * Nearness is measured on a LOG scale, because scales are a geometric ladder:
 * 115 is nearer 128 than 96 in the sense that matters, even though plain
 * subtraction says otherwise.
 *
 * And the ladder is denser than it looks, because it mixes architect's and
 * engineer's scales — 96, 120, 128 sit within a whisker of each other. Measured
 * against the real list, the worst any ratio can be from its nearest rung is
 * 41%, and almost everything is far closer. So **"off standard" is a weaker
 * signal than it sounds**: the threshold is set to catch a misread dimension,
 * not to audit the drawing. A prompt to look, never a verdict.
 */
export function compareToStandardScales(
  ratio: number,
  scales: readonly { text: string; ratio: number }[]
): StandardScaleCheck | null {
  if (!Number.isFinite(ratio) || ratio <= 0 || scales.length === 0) return null;

  let nearest = scales[0];
  let bestGap = Infinity;
  for (const scale of scales) {
    const gap = Math.abs(Math.log(ratio / scale.ratio));
    if (gap < bestGap) {
      bestGap = gap;
      nearest = scale;
    }
  }

  const percentOff = ((ratio - nearest.ratio) / nearest.ratio) * 100;

  return {
    nearestText: nearest.text,
    nearestRatio: nearest.ratio,
    percentOff,
    // 5% is comfortably wider than print stretch and comfortably narrower than
    // a misread dimension, which is the gap worth flagging.
    worthMentioning: Math.abs(percentOff) > 5,
  };
}

export type CalibrationCheck = {
  /** What the sheet's scale says this second span measures, in inches. */
  measuredInches: number;
  /** What the estimator says it really is, in inches. */
  expectedInches: number;
  /** Signed, as a percentage of the expected value. */
  percentOff: number;
  /** Close enough that the scale is confirmed. */
  agrees: boolean;
  /**
   * The two are related by a simple factor — 1.5, 2, 3 — which is the
   * fingerprint of a misread dimension rather than a sloppy click. Null when
   * nothing clean fits.
   */
  suspectFactor: number | null;
  /** One sentence, ready to show. */
  message: string;
};

/**
 * Within this, the second measurement CONFIRMS the scale.
 *
 * Two clicks of slip on each of two spans, plus the estimator rounding a
 * dimension, lands inside 2% comfortably. Wider than that and there is
 * something to look at rather than something to shrug at.
 */
const CHECK_TOLERANCE_PERCENT = 2;

/** Factors a misread produces. Reading one end of a scale bar gives 1.5. */
const SUSPECT_FACTORS = [1.5, 2, 3, 4, 12];
const FACTOR_TOLERANCE_PERCENT = 3;

/**
 * Check a scale by measuring a SECOND thing whose length is known.
 *
 * ── Why a second measurement is the only thing that catches this ─────────────
 * Added 2026-09-21, from a real job. Sheet 11 of the Decant Facility is drawn
 * at 1" = 10' and carries a graphic scale bar reading 10-5-0-10-20 — thirty
 * feet end to end, because the bar starts to the LEFT of its zero. Clicking the
 * two ends and typing 20 gave 120 x 20/30 = 1:80, and a 100 ft building then
 * measured 67 ft.
 *
 * **On that sheet the off-standard warning would have been enough**, and saying
 * otherwise would overstate this function: 1:80 is 17% below 1/8" = 1'-0", so
 * `compareToStandardScales` flags it. What failed was WHERE the warning lived —
 * inside the calibrate panel, for the few seconds before Apply.
 *
 * The argument for a second measurement is the sheet where that guard has
 * nothing to say. Read a 1/8" = 1'-0" sheet from the ends of the same bar and
 * the answer is 96 x 20/30 = **exactly 64**, which is 3/16" = 1'-0": a textbook
 * scale, on a rung of the ladder, with a long span and exact arithmetic. Every
 * check based on the ratio alone is satisfied.
 *
 * The only thing that distinguishes a right scale from a plausible wrong one is
 * a SECOND known distance. That is what this is.
 *
 * (Corrected 2026-09-21: the first version of this note said sheet 11 was the
 * 1/8" case, conflating it with sheet 13's correct 1:64.)
 *
 * ── Naming the factor, not just the gap ──────────────────────────────────────
 * "33% out" is a number to interpret. "The two disagree by exactly 1.5x, which
 * is what reading a scale bar from the wrong end does" is a diagnosis, and it
 * points straight at the cause. The factors listed are the ones misreads
 * actually produce — 1.5 from a scale bar's left-of-zero lead-in, 2 and 3 from
 * taking the wrong interval, 12 from feet typed where inches were meant.
 *
 * Returns null when there is nothing to compare yet.
 */
export function checkCalibration(
  measuredInches: number,
  expectedInches: number
): CalibrationCheck | null {
  if (!Number.isFinite(measuredInches) || measuredInches <= 0) return null;
  if (!Number.isFinite(expectedInches) || expectedInches <= 0) return null;

  const percentOff = ((measuredInches - expectedInches) / expectedInches) * 100;
  const agrees = Math.abs(percentOff) <= CHECK_TOLERANCE_PERCENT;

  // Looked for in both directions: the scale can be too large or too small.
  const bigger = Math.max(measuredInches, expectedInches);
  const smaller = Math.min(measuredInches, expectedInches);
  const observed = bigger / smaller;
  let suspectFactor: number | null = null;
  for (const factor of SUSPECT_FACTORS) {
    const gap = Math.abs((observed - factor) / factor) * 100;
    if (gap <= FACTOR_TOLERANCE_PERCENT) {
      suspectFactor = factor;
      break;
    }
  }

  if (agrees) {
    return {
      measuredInches,
      expectedInches,
      percentOff,
      agrees: true,
      suspectFactor: null,
      message: "Checks out — the two measurements agree.",
    };
  }

  const direction = percentOff > 0 ? "long" : "short";
  const size = Math.abs(percentOff).toFixed(0);
  const factorNote =
    suspectFactor === null
      ? " Re-measure, or set the scale again from a different dimension."
      : suspectFactor === 12
        ? " That is exactly 12x — feet and inches have been mixed up somewhere."
        : ` That is almost exactly ${suspectFactor}x. A scale bar read from its end rather than its numbers does this, because the bar usually starts left of zero.`;

  return {
    measuredInches,
    expectedInches,
    percentOff,
    agrees: false,
    suspectFactor,
    message: `This sheet's scale makes that ${size}% too ${direction}.${factorNote}`,
  };
}

/**
 * The check's verdict in a few words, for the small card beside the measured
 * line. `checkCalibration`'s message is the full explanation; this is the
 * headline an estimator reads in the second after clicking — "agrees", or how
 * it is off, naming the likely cause when the ratio says what it is.
 *
 * Reads the SAME `CalibrationCheck`, so the two can never disagree about
 * whether the scale agrees or which factor was suspected.
 */
export function checkHeadline(check: CalibrationCheck): string {
  if (check.agrees) return "Agrees — the scale checks out.";
  const short = check.measuredInches < check.expectedInches;
  const factor = check.suspectFactor;
  if (factor === 12) return "Off by 12x — feet and inches mixed up?";
  if (factor !== null) {
    const fraction: Record<number, string> = {
      1.5: "two-thirds",
      2: "half",
      3: "a third",
      4: "a quarter",
    };
    const multiple: Record<number, string> = {
      1.5: "1.5x",
      2: "double",
      3: "triple",
      4: "4x",
    };
    // Half size is the common reduced print (22x34 sets printed on 11x17),
    // so it gets named. 1.5x is the signature of a scale bar read from its
    // end — the bid 23 case — and says so instead.
    if (factor === 2 && short) return "Reads half — printed at half size?";
    if (factor === 1.5)
      return `Reads ${short ? "two-thirds" : "1.5x"} — scale bar read from its end?`;
    return short
      ? `Reads ${fraction[factor]} — printed at reduced size?`
      : `Reads ${multiple[factor]} — the scale may be set wrong.`;
  }
  const size = Math.abs(check.percentOff).toFixed(0);
  return `Off — reads ${size}% ${short ? "short" : "long"}.`;
}

/**
 * The scale as text, for storing beside the ratio.
 *
 * Deliberately NOT forced into an architect's notation. A calibrated sheet
 * rarely lands exactly on `1/4" = 1'-0"`, and rounding it to the nearest
 * familiar-looking scale would throw away the accuracy just bought — while
 * looking more authoritative than the honest number. `planScale.formatRatio`
 * already falls back to `1:nnn` for exactly this case.
 */
export function describeCalibration(
  realInches: number,
  spanPagePoints: number
): string {
  const feet = realInches / INCHES_PER_FOOT;
  const paperInches = spanPagePoints / POINTS_PER_INCH;
  return `${round(feet, 2)} ft measured over ${round(paperInches, 2)} in of paper`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
