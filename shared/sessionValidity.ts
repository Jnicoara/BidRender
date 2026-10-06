/**
 * WHETHER A SESSION TOKEN IS STILL GOOD, given when it was issued and the
 * user's `sessionsValidAfter` (0097).
 *
 * A session is a signed token that lasts a year and carries nothing the server
 * can revoke. A password reset or change sets `sessionsValidAfter`, and from
 * then on a token issued before that moment is refused — which is what
 * "every old session ends" means.
 *
 * ── Two cases that are easy to get backwards ─────────────────────────────────
 * - `validAfter` NULL: nothing has ever been reset. Every token is judged as it
 *   was before this existed, INCLUDING tokens with no issue time, because every
 *   session signed before 2026-09-29 has none and signing them all out for
 *   nothing would be the wrong kind of safe.
 * - `validAfter` set and the token has NO issue time: refused. That token was
 *   signed before this change, so before any reset, so it is old by definition.
 *
 * ── Whole seconds ────────────────────────────────────────────────────────────
 * A JWT's `iat` is in whole seconds and the column is a MySQL `timestamp`, also
 * whole seconds. `sessionCutoff` floors the moment it is given, so the fresh
 * session issued right after a password change — in the same second — passes.
 * The cost is that a token issued earlier in that same second passes too; a
 * one-second window is accepted, and it is the only one.
 */
export function sessionStillValid(
  issuedAtSeconds: number | null,
  validAfter: Date | null
): boolean {
  if (validAfter === null) return true;
  if (issuedAtSeconds === null) return false;
  return issuedAtSeconds * 1000 >= validAfter.getTime();
}

/** The value to store in `sessionsValidAfter` for a change made at `now`. */
export function sessionCutoff(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}
