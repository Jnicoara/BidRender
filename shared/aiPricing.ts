/**
 * What an AI call cost, near enough to act on.
 *
 * ── This is for REPORTING, never for billing ─────────────────────────────────
 * The rates below are copied from Anthropic's published prices. They are a
 * local copy, so they go stale the moment those prices change, and nothing
 * here will notice. The authoritative number is always the Anthropic console.
 *
 * That is worth stating plainly because a figure in the app's own admin screen
 * looks authoritative in a way a figure in a log file does not. Its job is to
 * answer "is this costing pennies or hundreds?" and to make a runaway obvious
 * the same day rather than at the end of the month. It is not a bill.
 *
 * ── Why micro-dollars ────────────────────────────────────────────────────────
 * One AI call costs a fraction of a cent, and a month of them is a few dollars.
 * Stored as a float those numbers accumulate rounding error; stored as cents
 * every individual call rounds to zero. Millionths of a dollar keep a single
 * call as a whole number — a $0.0331 reading is 33,100 — so a month's total is
 * an exact sum of integers.
 */

/** Dollars per million tokens, as published. */
export type ModelRate = { inputPerMTok: number; outputPerMTok: number };

/**
 * Rates by model id.
 *
 * Keyed by the exact id the app sends, including any pinned date suffix, so
 * that a model swap cannot silently keep costing the old model's rate — an
 * unknown id reports zero and says so, which is visible, rather than quietly
 * reporting a plausible wrong number.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
};

/** A dollar, in the units everything here counts in. */
export const MICROS_PER_DOLLAR = 1_000_000;

export type TokenUsage = { inputTokens: number; outputTokens: number };

/**
 * What those tokens cost, in millionths of a dollar.
 *
 * Returns 0 for a model with no rate on file. Deliberately not a guess: a
 * made-up rate would make the admin screen confidently wrong, where a zero
 * next to a call count that is plainly not zero is a visible prompt to add the
 * rate. `unknownModel` below is what turns that into a sentence.
 */
export function costMicros(model: string, usage: TokenUsage): number {
  const rate = MODEL_RATES[model];
  if (!rate) return 0;
  const dollars =
    (usage.inputTokens / 1_000_000) * rate.inputPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputPerMTok;
  return Math.round(dollars * MICROS_PER_DOLLAR);
}

/** True when this model's spend is not being counted. */
export function unknownModel(model: string): boolean {
  return !MODEL_RATES[model];
}

/**
 * "$0.0331" — four decimals, because a single call is worth less than a cent
 * and rounding it to two would print every call as $0.00.
 */
export function formatMicros(micros: number): string {
  const dollars = micros / MICROS_PER_DOLLAR;
  if (dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}
