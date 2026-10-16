/**
 * What the job actually took, against what the bid said it would.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The productivity factor (CLAUDE.md § Company defaults) is the one number in
 * this app that says "our crews against book hours", and until now the only way
 * to set it was a guess or a licensed reference table. Close-out is where real
 * field data gets in: a contractor records the hours a finished job took, and
 * the difference between that and the estimate is evidence about their own
 * crews on their own work.
 *
 * ── Optional, always ────────────────────────────────────────────────────────
 * Nothing in the app requires a close-out. A bid without one prices, proposes,
 * exports and archives exactly as it did before this existed — the feature adds
 * a record beside the bid and changes nothing about it. That is a design
 * constraint rather than a nicety: a contractor who never closes a job out must
 * not find the app degraded, or they will not adopt the part that matters.
 *
 * ── The estimate is frozen at close-out ─────────────────────────────────────
 * Comparison figures are snapshotted the moment the job is closed out, the same
 * rule every other layer of this app follows. Re-deriving the estimate later
 * would mean editing an assembly silently rewrites history — and the history is
 * the whole asset here. A closed-out job is a measurement, and a measurement
 * that changes when you adjust the instrument is not one.
 *
 * ── Suggestions are evidence, never an action ───────────────────────────────
 * If an assembly consistently runs over, this produces a SUGGESTION. It never
 * writes to the library. That follows the pattern the alias suggestions and the
 * plan co-pilot already use, and the reason is the same: the app is inferring
 * from a handful of jobs, and the estimator knows things the data does not —
 * that three of those jobs were the same difficult building, that the apprentice
 * was new, that the fourth was a favour done at a run. Auto-applying would move
 * every future bid in the company on a pattern nobody agreed to.
 */

/** How the actual hours were recorded. */
export const CLOSEOUT_MODES = ["total", "byAssembly"] as const;
export type CloseoutMode = (typeof CLOSEOUT_MODES)[number];

/** Where a suggestion has got to. */
export const SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

// ─── Variance ─────────────────────────────────────────────────────────────────

export type Variance = {
  estimatedHours: number;
  actualHours: number;
  /** Positive means it took LONGER than estimated. */
  deltaHours: number;
  /**
   * Delta as a fraction of the estimate — 0.15 is 15% over.
   *
   * Null when the estimate was zero. There is no percentage over nothing, and
   * returning Infinity or 0 would both be read as a real figure by anything
   * that averages these later.
   */
  deltaPct: number | null;
  /** Which way it went, for wording and colour. */
  direction: "over" | "under" | "onTarget";
};

/**
 * Anything inside this fraction of the estimate reads as "on target".
 *
 * Estimating hours to better than five percent is not a thing anyone does, so
 * calling a 2% overrun "over" would flag noise as signal on nearly every job
 * and teach people to ignore the indicator.
 */
export const ON_TARGET_BAND = 0.05;

export function compareHours(
  estimatedHours: number,
  actualHours: number
): Variance {
  const estimated = Number.isFinite(estimatedHours) ? estimatedHours : 0;
  const actual = Number.isFinite(actualHours) ? actualHours : 0;
  const delta = round2(actual - estimated);
  const pct = estimated > 0 ? (actual - estimated) / estimated : null;

  let direction: Variance["direction"] = "onTarget";
  if (pct === null) {
    // No estimate to compare against: any real hours are over, zero is neither.
    direction = actual > 0 ? "over" : "onTarget";
  } else if (Math.abs(pct) > ON_TARGET_BAND) {
    direction = pct > 0 ? "over" : "under";
  }

  return {
    estimatedHours: round2(estimated),
    actualHours: round2(actual),
    deltaHours: delta,
    deltaPct: pct === null ? null : round4(pct),
    direction,
  };
}

/**
 * The productivity factor that would have made this estimate right.
 *
 * The same number the pricing engine multiplies by:
 * `hours × (1 + summed modifiers) × (1 + productivity)`. A job that took 15%
 * longer than book implies +0.15. Offered as a reading, never applied — moving
 * the company factor re-prices every bid still inheriting it, which is exactly
 * the kind of change CLAUDE.md insists a person makes deliberately.
 *
 * Null when there is no estimate to divide by.
 */
export function impliedProductivity(
  estimatedHours: number,
  actualHours: number
): number | null {
  if (!(estimatedHours > 0)) return null;
  return round4(actualHours / estimatedHours - 1);
}

// ─── Rolling a close-out up ───────────────────────────────────────────────────

/** One assembly's line on a close-out. */
export type CloseoutLineInput = {
  assemblyId: number | null;
  assemblyName: string;
  /** Hours the bid estimated for this line, at close-out time, at quantity. */
  estimatedHours: number;
  /** Hours it actually took. */
  actualHours: number;
};

/**
 * The hours a close-out actually represents.
 *
 * In `byAssembly` mode the per-line entries ARE the answer and the total is
 * their sum — there is deliberately no separately typed total that could
 * disagree with its own parts. In `total` mode the single figure is the answer
 * and lines are absent. Making the mode explicit is what stops "which of these
 * two numbers is real" from becoming a question.
 */
export function closeoutActualHours(
  mode: CloseoutMode,
  totalActualHours: number | null,
  lines: readonly CloseoutLineInput[]
): number {
  if (mode === "byAssembly") {
    return round2(
      lines.reduce((sum, line) => sum + (line.actualHours || 0), 0)
    );
  }
  return round2(totalActualHours ?? 0);
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

/**
 * How many closed-out jobs an assembly needs before a pattern is a pattern.
 *
 * Three, and it is a floor rather than a target. One job over is a job; two is
 * a coincidence a contractor can name the cause of. The cost of setting this
 * too low is a suggestion the estimator knows is wrong, which trains them to
 * dismiss the next one without reading it — and a suggestion nobody reads is
 * worse than none.
 */
export const MIN_SAMPLES_FOR_SUGGESTION = 3;

/**
 * How far off the estimate has to be before adjusting is worth proposing.
 *
 * Ten percent. Below that the change is inside the noise of how anyone
 * estimates, and re-basing an assembly on it churns the library for nothing.
 */
export const SUGGESTION_THRESHOLD = 0.1;

/**
 * How much of the evidence has to point the same way.
 *
 * Two thirds. An assembly that ran 40% over on two jobs and 40% under on two
 * others has no trend — it has variance, and the honest answer is that the
 * assembly is used for jobs that differ, not that its base hours are wrong.
 * Averaging alone would report the mean of that as a confident zero, or worse,
 * as a small trend.
 */
export const SUGGESTION_CONSISTENCY = 2 / 3;

/** One closed-out observation of an assembly. */
export type AssemblySample = {
  estimatedHours: number;
  actualHours: number;
};

export type HourSuggestion = {
  /** What the library says now. */
  currentHours: number;
  /** What the evidence suggests, per one of the assembly. */
  suggestedHours: number;
  /** How many closed-out jobs it is based on. */
  sampleSize: number;
  /** Mean ratio of actual to estimated — 1.2 means 20% over. */
  ratio: number;
  /** What fraction of samples pointed the same way as the suggestion. */
  consistency: number;
  direction: "over" | "under";
};

/**
 * Should this assembly's base hours be adjusted, on the evidence so far?
 *
 * Returns null far more often than not, and that is correct behaviour rather
 * than a weak implementation. Every gate below exists to keep the suggestion
 * rare enough to be worth reading:
 *
 *   • fewer than MIN_SAMPLES_FOR_SUGGESTION jobs      → not yet
 *   • a sample with no estimate to compare against    → skipped, not counted
 *   • within SUGGESTION_THRESHOLD of the estimate     → nothing worth changing
 *   • less than SUGGESTION_CONSISTENCY agreement      → variance, not a trend
 *
 * The suggested figure is the CURRENT library hours scaled by the observed
 * ratio, not the mean of the actuals. Those differ whenever the library has
 * been edited since the jobs were closed out, and scaling is the one that still
 * means something: it says "whatever you have it at, it runs 20% long".
 */
export function suggestHours(
  currentHours: number,
  samples: readonly AssemblySample[]
): HourSuggestion | null {
  // An actual of 0 is not a sample. Until 2026-10-15 the close-out form
  // recorded every line LEFT BLANK as 0 hours, so those zeros are in saved
  // data — and three of them suggested setting the assembly to 0 h, which
  // "apply" would have written. Real work estimated above 0 that took no
  // time at all is not something to learn from.
  const usable = samples.filter(
    s =>
      Number.isFinite(s.estimatedHours) &&
      s.estimatedHours > 0 &&
      Number.isFinite(s.actualHours) &&
      s.actualHours > 0
  );
  if (usable.length < MIN_SAMPLES_FOR_SUGGESTION) return null;
  if (!(currentHours > 0)) return null;

  const ratios = usable.map(s => s.actualHours / s.estimatedHours);
  const ratio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

  if (Math.abs(ratio - 1) < SUGGESTION_THRESHOLD) return null;

  const direction: "over" | "under" = ratio > 1 ? "over" : "under";
  const agreeing = ratios.filter(r =>
    direction === "over" ? r > 1 : r < 1
  ).length;
  const consistency = agreeing / ratios.length;
  if (consistency < SUGGESTION_CONSISTENCY) return null;

  const suggested = round2(currentHours * ratio);
  // A suggestion that rounds to the number already in the library is not a
  // suggestion. Happens on small hour counts where 10% is less than a rounding
  // step.
  if (suggested === round2(currentHours)) return null;

  return {
    currentHours: round2(currentHours),
    suggestedHours: suggested,
    sampleSize: usable.length,
    ratio: round4(ratio),
    consistency: round4(consistency),
    direction,
  };
}

/** A sentence a person can act on, for the suggestion card. */
export function describeSuggestion(
  assemblyName: string,
  suggestion: HourSuggestion
): string {
  const pct = Math.round(Math.abs(suggestion.ratio - 1) * 100);
  return (
    `${assemblyName} has run ${pct}% ${suggestion.direction} its estimate across ` +
    `${suggestion.sampleSize} closed-out job${suggestion.sampleSize === 1 ? "" : "s"}. ` +
    `Base hours ${suggestion.currentHours} → ${suggestion.suggestedHours}?`
  );
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}
