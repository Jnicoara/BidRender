/**
 * How much AI one person may use in a day, and what they are told at the end.
 *
 * ── Why a limit exists at all ────────────────────────────────────────────────
 * Every AI call spends real money, and the two ways that becomes a problem are
 * not the same. A heavy user costs more than expected, which is a pricing
 * question. A LOOP — a retry that retries, a component that re-reads on every
 * render — costs a thousand calls in a minute, at night, and nobody finds out
 * until the invoice. The limit is aimed at the second one. It is a circuit
 * breaker, not a fair-use policy.
 *
 * ── So it is set generously, on purpose ──────────────────────────────────────
 * A limit tight enough to shape behaviour gets in the way of real work, and a
 * limit people work around is worse than none — they stop trusting the tool.
 * Each number below clears the heaviest genuine day anyone could construct,
 * and still stops a runaway within about a minute.
 *
 * ── Two buckets, because the costs differ by a factor of forty ───────────────
 * Reading a sheet sends a 3MB drawing to the heavier model. Answering "where do
 * I edit labor rates?" sends a sentence to the fast one. One shared allowance
 * would have to be set for the expensive case and would then be absurdly tight
 * for the cheap one, or set for the cheap case and useless for the expensive.
 */

/** The groups a daily allowance applies to. */
export type AiFeatureGroup = "plan-reader" | "assistant";

/** Which group each individual call belongs to. */
export type AiFeature =
  | "plan-read"
  | "plan-ask"
  | "navigation"
  | "material-aliases";

export const FEATURE_GROUP: Record<AiFeature, AiFeatureGroup> = {
  "plan-read": "plan-reader",
  "plan-ask": "plan-reader",
  navigation: "assistant",
  "material-aliases": "assistant",
};

/**
 * Calls per person per day, by group.
 *
 * plan-reader — 150. A 60-sheet set read end to end is 60 calls; two large sets
 * in one day is 120; add follow-up questions and re-reads after corrections and
 * the heaviest real day lands just under this. Worst case is about $14 of spend
 * for one person, and a loop hits it in roughly a minute.
 *
 * assistant — 500. These cost about a fortieth of a sheet reading, so this is
 * purely a runaway stop rather than a budget: nobody asks the helper five
 * hundred questions in a day, and a component looping on it will.
 */
export const DAILY_LIMITS: Record<AiFeatureGroup, number> = {
  "plan-reader": 150,
  assistant: 500,
};

/**
 * The allowance is per PERSON, not per company.
 *
 * `ctx.user.id`, not `ctx.scope.dataUserId`. The difference matters when a
 * company has several estimators: pooling their allowance would mean one
 * person's runaway browser tab stops everyone else working, which is the wrong
 * failure for a circuit breaker to cause. Per-person also means the cap scales
 * with the number of people actually doing the work, which is the same
 * direction the real cost scales in.
 *
 * The trade is that a company of five has five allowances, so the worst case
 * multiplies by headcount. That is acceptable for a breaker whose job is
 * stopping a loop in minutes; a per-company budget is a different feature and
 * would want a different shape.
 */

/**
 * Which day a moment belongs to, in UTC.
 *
 * UTC rather than the user's timezone, and that is a real trade: for a
 * contractor in the Pacific the allowance resets at 4 or 5pm, in the middle of
 * an afternoon. The alternative is worse — a per-user timezone means the reset
 * moves twice a year, a user who travels gets two allowances or none, and the
 * stored counter's meaning depends on a setting that can change after the fact.
 * A fixed boundary that is occasionally inconvenient beats a moving one that is
 * occasionally wrong.
 */
export function usageDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type LimitCheck =
  | { allowed: true; remaining: number }
  | { allowed: false; message: string };

/**
 * May this person make one more call of this kind today?
 *
 * ── The message is the whole point of the `false` branch ─────────────────────
 * Someone who hits a limit has done nothing wrong, and the app has to say so.
 * It names the number, says when it comes back, and — the part that matters
 * most — says what still works. A limit that reads as "the app is broken" costs
 * more in support and trust than the calls it saved.
 */
export function checkDailyLimit(
  feature: AiFeature,
  callsSoFar: number,
  limits: Record<AiFeatureGroup, number> = DAILY_LIMITS
): LimitCheck {
  const group = FEATURE_GROUP[feature];
  const limit = limits[group];

  if (callsSoFar < limit) {
    return { allowed: true, remaining: limit - callsSoFar };
  }

  return {
    allowed: false,
    message:
      group === "plan-reader"
        ? `You have used today's plan-reading allowance (${limit} sheets). It resets at midnight UTC. Everything else works as normal — you can still count and stamp by hand.`
        : `You have used today's allowance for the help assistant (${limit} questions). It resets at midnight UTC. Nothing else is affected.`,
  };
}
