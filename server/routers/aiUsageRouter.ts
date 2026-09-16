/**
 * What the AI features are costing.
 *
 * ── Admin only ───────────────────────────────────────────────────────────────
 * `adminProcedure`, the same gate the backup sits behind. This aggregates every
 * user's activity, so seeing it is seeing across accounts.
 *
 * ── It reports sizes, never contents ─────────────────────────────────────────
 * Call counts, token counts and money. No prompts, no questions, no drawing
 * text, no replies — `ai_usage_daily` does not store any of that, so a spend
 * report cannot become an accidental archive of what contractors asked about
 * their jobs. See the table's own comment in drizzle/schema.ts.
 *
 * ── The figures are indicative ───────────────────────────────────────────────
 * Cost is computed from a local copy of Anthropic's published rates
 * (shared/aiPricing.ts), which goes stale the moment those change. The number
 * is here to answer "pennies or hundreds?" and to make a runaway obvious the
 * same day. The bill is whatever the Anthropic console says.
 */
import { adminProcedure, router } from "../_core/trpc";
import { usageDay } from "../../shared/aiLimits";
import { formatMicros } from "../../shared/aiPricing";
import * as db from "../db";

/** The first day of the UTC month `now` falls in. */
function monthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

type Breakdown = {
  feature: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

function total(rows: Breakdown[]) {
  return rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      costMicros: acc.costMicros + r.costMicros,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 }
  );
}

export const aiUsageRouter = router({
  /**
   * Today and this month, with a per-feature breakdown.
   *
   * Both in one call: the question is never "what did today cost" on its own —
   * it is "is today unusual", and that needs the month beside it.
   */
  spend: adminProcedure.query(async () => {
    const now = new Date();
    const today = usageDay(now);

    const [todayRows, monthRows] = await Promise.all([
      db.getAiSpend(today, today),
      db.getAiSpend(monthStart(now), today),
    ]);

    const todayTotal = total(todayRows);
    const monthTotal = total(monthRows);

    return {
      today,
      monthFrom: monthStart(now),
      todayTotal,
      monthTotal,
      todayFormatted: formatMicros(todayTotal.costMicros),
      monthFormatted: formatMicros(monthTotal.costMicros),
      /** Newest-first by spend, so the expensive feature is at the top. */
      monthByFeature: monthRows.sort((a, b) => b.costMicros - a.costMicros),
    };
  }),
});
