/**
 * A READ that does not answer is given up on, so it can be asked again.
 *
 * ── The fault this exists for (staging smoke, 2026-10-06) ───────────────────
 * Smoke flow 9 reloaded the Plans screen and it stayed BLANK for 60 s: the
 * title with no bid name, an empty pane (run 37512445462 attempt 1, on the
 * `24105ad` release candidate). The screen opens with ONE batched request of
 * sixteen reads — `bids.get` and `bidPdfs.list` ride with `materials.list`,
 * `takeoffSummary.forBid` and the rest (measured locally, 2026-10-06) — and
 * nothing bounded it. A response that never came meant a screen that never
 * drew, with no message and no retry: React Query retries a request that
 * FAILS, and a request that hangs never fails. A person who reloads into that
 * believes their plans are gone.
 *
 * Why it hung is not known: staging's database had 0 slow queries in 20 days
 * and a longest row-lock wait of 40 ms (measured 2026-10-06), so the stall
 * was between the browser and the app. This makes the screen survive it
 * whatever it was — forced in the smoke test by holding that batch.
 *
 * ── Reads only, and only until the answer STARTS ────────────────────────────
 * - Only GET. Every query is a GET and every mutation a POST (tRPC). A read
 *   asked twice costs nothing; a write given up on may still have happened
 *   on the server, and sending it again could place a mark twice. Every AI
 *   call is a mutation, so no paid read is ever cut off by this.
 * - The clock stops when the response's headers arrive. A large answer on a
 *   slow connection is still arriving, not stalled, and is never cut.
 */

/** Long enough for any read this app makes; short enough to beat a person giving up. */
export const QUERY_DEADLINE_MS = 20_000;

/** The reason a read was given up on, so a log line says which kind of failure it was. */
export const QUERY_DEADLINE_MESSAGE = `No answer from the server within ${QUERY_DEADLINE_MS / 1000} s; asking again.`;

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request)
    return input.method.toUpperCase();
  return "GET";
}

/** `fetch`, with a deadline on reads that have not started answering. */
export function withQueryDeadline(
  fetchImpl: typeof fetch,
  ms: number = QUERY_DEADLINE_MS
): typeof fetch {
  return (input, init) => {
    if (methodOf(input, init) !== "GET") return fetchImpl(input, init);

    const controller = new AbortController();
    const outer = init?.signal;
    // A cancel from the caller (React Query unmounting) still cancels.
    const forward = () => controller.abort(outer?.reason);
    if (outer?.aborted) forward();
    else outer?.addEventListener("abort", forward, { once: true });

    const timer = setTimeout(
      () => controller.abort(new Error(QUERY_DEADLINE_MESSAGE)),
      ms
    );
    return fetchImpl(input, { ...init, signal: controller.signal }).finally(
      () => clearTimeout(timer)
    );
  };
}
