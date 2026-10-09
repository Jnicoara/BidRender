/**
 * Re-read a query AFTER a write, even when a read of it is already in
 * flight — which a plain `invalidate` does NOT do for a query with no data
 * yet.
 *
 * React Query's `invalidate` refetches with `cancelRefetch`, but its fetch
 * only cancels a running fetch when the query ALREADY HAS DATA. A brand-new
 * query (no data) hands back the fetch in flight instead, so the invalidate
 * is folded into a read that started BEFORE the write, and that read's
 * answer is stored as current. Nothing is retried, and nothing says so.
 *
 * Found 2026-10-09, smoke test 2 (local-dev Gate 37883298465, re-run 2) and
 * reproduced on staging 2 of 12: a first upload's sheet list read went out
 * 8 ms before `ensureSheets` inserted the rows, `ensureSheets` answered while
 * it was still in flight, its `onSuccess` invalidated — and no second read
 * was ever sent. The list sat on "Sheets appear here once the document
 * opens" for good. The 2026-10-08 fix (refresh by the id SENT) was right and
 * not enough: it invalidated the right key, into this hole.
 *
 * Cancelling first puts the query back to idle (and its pre-fetch state), so
 * the invalidate that follows starts a fresh read that the write cannot have
 * been missed by.
 */
export async function refetchPastInFlight(query: {
  cancel: () => Promise<unknown>;
  invalidate: () => Promise<unknown>;
}): Promise<void> {
  await query.cancel();
  await query.invalidate();
}
