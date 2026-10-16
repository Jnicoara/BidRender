/**
 * Which failed reads are worth asking again (break-it, 2026-10-15).
 *
 * React Query retries EVERY failed read three times by default, with growing
 * pauses. For a dropped connection or a server hiccup that is right. For an
 * answer the server has already given — this bid does not exist, it is not
 * yours, that input is wrong — asking again cannot change it, and the screen
 * sat on "Loading bid…" for about 8 seconds before saying "That bid could not
 * be opened" (a bid link from another company, or one deleted for good).
 */
const DEFINITE_ANSWERS = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "BAD_REQUEST",
]);

/** The tRPC error code on a failed read, if it carries one. */
function trpcCode(error: unknown): string | undefined {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === "string" ? data.code : undefined;
}

/** React Query's `retry` option: the default three tries, minus definite answers. */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  const code = trpcCode(error);
  if (code && DEFINITE_ANSWERS.has(code)) return false;
  return failureCount < 3;
}
