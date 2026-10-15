/**
 * SIGNED OUT IN THE MIDDLE OF WORK — say so, and come back to the same place.
 *
 * Break-it drill, 2026-10-15: with the session gone (expired, or ended on
 * another device by a password change), the next save answered "Please
 * login" and the app jumped to "/" — the public landing page — with no word
 * about why, the change silently dropped, and the bid it was on forgotten
 * (the jump threw the address away).
 *
 * Now the jump keeps the address and leaves this note, which the sign-in
 * form reads ONCE: it opens straight away (not the marketing page) saying
 * what happened, and signing in lands back on the same screen
 * (`landingAfterSignIn` already returns to a deep link). Per tab
 * (sessionStorage) and read defensively, like every other browser store.
 */
export const SESSION_EXPIRED_KEY = "bidridge:session-expired";

export type ExpiryNote = { lostChange: boolean };

/** What to remember as the app leaves for the sign-in form. */
export function expiryNote(fromMutation: boolean): string {
  return JSON.stringify({ lostChange: fromMutation } satisfies ExpiryNote);
}

/** The sentence the sign-in form shows, or null when there is no note. */
export function expiryNotice(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let lostChange = false;
  try {
    lostChange = (JSON.parse(raw) as Partial<ExpiryNote>).lostChange === true;
  } catch {
    // An unreadable note is still a sign-out; say the plain half.
  }
  return lostChange
    ? "You were signed out, so your last change wasn't saved. Sign in to carry on where you were."
    : "You were signed out. Sign in to carry on where you were.";
}

/** Where to send the browser: the same address, only signed out. */
export function addressAfterExpiry(
  loginUrl: string,
  location: { pathname: string; hash: string }
): string {
  // Only the app's own email sign-in can keep the address; an outside login
  // page (the retired OAuth portal) gets its own URL untouched.
  return loginUrl === "/" ? `${location.pathname}${location.hash}` : loginUrl;
}
