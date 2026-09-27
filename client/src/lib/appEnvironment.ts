/**
 * Is this the staging site?
 *
 * ── Read from a cookie the gate sets, not from a build setting ──────────────
 * The staging password gate (server/stagingGate.ts) sets a readable
 * `bidridge_env=staging` cookie when the password is accepted. Nobody reaches
 * a screen on staging without passing the gate, so the cookie is always there;
 * the live site has no gate and never sets it.
 *
 * The alternative was a build-time `VITE_APP_ENV`, which is a SECOND setting
 * saying the same thing as STAGING_PASSWORD — and the day someone forgets it,
 * staging looks exactly like the live site. One setting cannot disagree with
 * itself.
 *
 * The cookie opens nothing: the gate checks its own HttpOnly cookie, and a
 * forged `bidridge_env` at most draws a yellow band on someone's own screen.
 */
export const ENV_COOKIE = "bidridge_env";

export function isStagingFromCookies(cookieString: string): boolean {
  return cookieString
    .split(";")
    .some(part => part.trim() === `${ENV_COOKIE}=staging`);
}

/** Marks <html> so the stylesheet can make room for the band. */
export function markStagingEnvironment(doc: Document): boolean {
  const staging = isStagingFromCookies(doc.cookie);
  if (staging) doc.documentElement.dataset.env = "staging";
  return staging;
}
