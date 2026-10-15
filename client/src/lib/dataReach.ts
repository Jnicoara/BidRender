/**
 * "Can BidRidge reach its data right now?" — one answer for the whole app.
 *
 * Drilled 2026-10-15 (references/stress-results.md): with the database down
 * and the app already open, a screen opened next did not say it could not
 * load. It stated something FALSE — "No assemblies yet", "No clients yet",
 * an empty catalog, "Quick bid · 0 lines", a bid that "may have been
 * archived or deleted" — or went blank. Each screen can be taught to say
 * so, and the worst ones are; this is the net under all of them, including
 * screens not written yet: while reads fail for want of the data, a bar
 * says that what is on screen may be incomplete.
 *
 * The decision is here, not in the bar, so the suite can reach it.
 */
import { TRPCClientError } from "@trpc/client";

/**
 * Did this read fail because the data could not be reached — rather than
 * because of what was asked? The server answers SERVICE_UNAVAILABLE when it
 * cannot reach its database (server/_core/context.ts); a request that never
 * got an answer at all (server restarting, signal gone) reaches tRPC as an
 * error with no `data`. A NOT_FOUND, a FORBIDDEN or a bad input is an answer,
 * and must not raise the bar.
 */
export function isReachFailure(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;
  const data = error.data as { code?: unknown } | null | undefined;
  if (data && typeof data === "object")
    return data.code === "SERVICE_UNAVAILABLE";
  // No server answer at all. tRPC wraps the fetch's TypeError as the cause.
  return (
    error.cause instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      error.message
    )
  );
}

let unreachable = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === unreachable) return;
  unreachable = next;
  listeners.forEach(l => l());
}

/** A read failed — raise the bar if it was for want of the data. */
export function noteReadFailure(error: unknown): void {
  if (isReachFailure(error)) set(true);
}

/**
 * A read got no answer at all by its deadline (@/lib/queryDeadline). To the
 * person that is the same as out of reach — and it is the case nothing else
 * reports, because a stalled read never FAILS until every retry has run.
 */
export function noteNoAnswer(): void {
  set(true);
}

/** A read succeeded — the data is reachable again. */
export function noteReadSuccess(): void {
  set(false);
}

export function dataIsUnreachable(): boolean {
  return unreachable;
}

export function subscribeDataReach(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
