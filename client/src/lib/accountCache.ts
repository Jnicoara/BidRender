/**
 * When the signed-in person changes, nothing read for the last one may stay
 * on screen (break-it, 2026-10-15 night).
 *
 * Sign-out cleared only "who is signed in" and left every other cached read
 * in memory. On a shared office computer, company A signed out, company B
 * signed in on the same tab — and B's Bids screen listed A's bids, names and
 * totals, until B's own reads arrived (5 s on a slow connection, measured).
 * Data from one company on another company's screen.
 *
 * AuthGuard asks this on every change of the signed-in person and, when it
 * says so, drops every cached read but the sign-in check itself.
 */

/** Drop the cache when the person changes — from someone, to anyone else. */
export function shouldDropAccountCache(
  previousUserId: number | null,
  nextUserId: number | null
): boolean {
  return previousUserId !== null && previousUserId !== nextUserId;
}

/** The one read that survives: tRPC's key for `auth.me`. */
export function isSignInQuery(queryKey: readonly unknown[]): boolean {
  const path = queryKey[0];
  return Array.isArray(path) && path[0] === "auth" && path[1] === "me";
}
