/**
 * The pieces of a password reset that are not the database or the router:
 * the token, its hash, the link and the words of the email.
 *
 * Owner's conditions (references/stage-4-safety-plan.md, 2026-09-29): a link
 * works ONCE, and using it ends every old session. Both are enforced in
 * `db.completePasswordReset`, not here.
 */
import { createHash, randomBytes } from "node:crypto";

/** How long a reset link works. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** 32 random bytes, url-safe. 256 bits: not guessable, not worth rate-limiting guesses at. */
export function newResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored and compared by hash; the plaintext exists only in the email. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

/**
 * The link in the email. The token rides in the HASH part of the address, so
 * the browser never sends it to any server — it is not in an access log, a
 * proxy log or a Referer header — and the reset page removes it from the
 * address bar as soon as it has read it (`@/lib/resetLink`).
 *
 * `baseUrl` is `APP_BASE_URL`, never the request's Host header — see
 * server/email/config.ts for why.
 */
export function resetLink(baseUrl: string, token: string): string {
  return `${baseUrl}/#/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetEmail(link: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Reset your BidRidge password";
  const text = [
    "Someone asked to reset the password for this BidRidge account.",
    "",
    "Choose a new password here:",
    link,
    "",
    "This link works once, for one hour. Setting a new password signs this account out everywhere else.",
    "",
    "If you did not ask for this, ignore this email — your password has not changed.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;max-width:520px">
<p>Someone asked to reset the password for this BidRidge account.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#F5C518;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Choose a new password</a></p>
<p style="font-size:13px;color:#444">This link works once, for one hour. Setting a new password signs this account out everywhere else.</p>
<p style="font-size:13px;color:#444">If you did not ask for this, ignore this email — your password has not changed.</p>
<p style="font-size:12px;color:#777">If the button does not work, paste this into your browser:<br>${escapeHtml(link)}</p>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
