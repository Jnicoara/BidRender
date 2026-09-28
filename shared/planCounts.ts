/**
 * How many plans a bid has, and how to say it in a few words.
 *
 * One function for every place that says it — the Dashboard card's chip, the
 * "Recent plans" row and the bid page's Plans button — so they cannot say the
 * same bid's plans two different ways (CLAUDE.md § "Copying a layout does not
 * copy the behaviour with it").
 *
 * ── Sheets when we know them, sets when we do not ────────────────────────────
 * A plan set's page count is written when the viewer first opens it, so a set
 * uploaded and never opened has none. Adding up the pages we know and calling
 * that the bid's sheets would be a number that is short and looks complete —
 * so if ANY set is uncounted, the label counts sets instead.
 */

export type PlanCounts = {
  /** Plan sets (PDF files) on the bid. */
  sets: number;
  /** Pages across the sets whose page count is known. */
  pages: number;
  /** Sets whose page count nobody has read yet. */
  setsUncounted: number;
  /** When the newest set was attached; null with no plans. */
  lastUploadedAt: Date | null;
};

/** "5 sheets", "2 plan sets", or null when there are no plans. */
export function planCountLabel(counts: PlanCounts): string | null {
  if (counts.sets <= 0) return null;
  if (counts.setsUncounted === 0 && counts.pages > 0)
    return `${counts.pages} sheet${counts.pages === 1 ? "" : "s"}`;
  return `${counts.sets} plan set${counts.sets === 1 ? "" : "s"}`;
}

/**
 * The bids to show under "Recent plans": those with plans, newest upload
 * first, at most `limit`. A bid is listed once however many sets it holds.
 */
export function recentPlanBids<T extends { plans: PlanCounts }>(
  bids: readonly T[],
  limit = 4
): T[] {
  return bids
    .filter(b => b.plans.sets > 0 && b.plans.lastUploadedAt !== null)
    .sort(
      (a, b) =>
        new Date(b.plans.lastUploadedAt!).getTime() -
        new Date(a.plans.lastUploadedAt!).getTime()
    )
    .slice(0, limit);
}
