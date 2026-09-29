/**
 * What the email door is allowed to do on THIS server, decided once from its
 * settings. Pure — `env` is a parameter — so every branch is tested without a
 * provider.
 *
 * ── Settings ─────────────────────────────────────────────────────────────────
 *   RESEND_API_KEY           the provider key. Unset: nothing is sent.
 *   EMAIL_FROM               "BidRidge <no-reply@bidridge.com>" (owner, 2026-09-29).
 *   APP_BASE_URL             where a link in an email points. The PRIMARY
 *                            domain — never a redirecting one, same rule as the
 *                            cron Worker's (workers/cron/wrangler.toml).
 *   STAGING_EMAIL_ALLOWLIST  comma-separated addresses; only these receive mail.
 *   EMAIL_DAILY_CAP          sends per server per UTC day (default 100).
 *
 * ── Why the link is not built from the request ───────────────────────────────
 * The request's Host header is whatever the sender typed. A reset link built
 * from it lets anybody ask for a reset on someone else's address and have the
 * victim's own inbox receive a link to the ATTACKER's site, token included.
 * So links come from `APP_BASE_URL` and nothing else, and a server without it
 * sends no link at all.
 *
 * ── Staging fails closed ────────────────────────────────────────────────────
 * A server with `STAGING_PASSWORD` set is staging (server/stagingGate.ts). On
 * staging, a missing allow-list means deliver to NOBODY — a test reset reaching
 * a real person is the failure this exists to prevent, and forgetting a setting
 * must not be how it happens.
 */
export type EmailConfig =
  | { kind: "off"; why: string }
  | {
      kind: "resend";
      apiKey: string;
      from: string;
      baseUrl: string;
      /** null: deliver to anyone. An array: only these (lower-cased). */
      allowlist: string[] | null;
      dailyCap: number;
    };

export const DEFAULT_EMAIL_DAILY_CAP = 100;

export function emailConfig(
  env: Record<string, string | undefined>
): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { kind: "off", why: "RESEND_API_KEY is not set" };
  const from = env.EMAIL_FROM?.trim();
  if (!from) return { kind: "off", why: "EMAIL_FROM is not set" };
  const baseUrl = appBaseUrl(env.APP_BASE_URL);
  if (!baseUrl)
    return {
      kind: "off",
      why: "APP_BASE_URL is not set to an https:// address",
    };

  const listed = env.STAGING_EMAIL_ALLOWLIST?.split(",")
    .map(a => a.trim().toLowerCase())
    .filter(a => a.length > 0);
  const isStaging = Boolean(env.STAGING_PASSWORD?.trim());
  const allowlist =
    listed && listed.length > 0 ? listed : isStaging ? [] : null;

  const cap = Number(env.EMAIL_DAILY_CAP);
  const dailyCap =
    Number.isInteger(cap) && cap > 0 ? cap : DEFAULT_EMAIL_DAILY_CAP;

  return { kind: "resend", apiKey, from, baseUrl, allowlist, dailyCap };
}

/**
 * The base url with no trailing slash, or null when it is not one a link may
 * point at: https only, except plain http on this machine for `pnpm dev`.
 */
export function appBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    return null;
  return url.origin;
}

/** Whether an address may receive mail under `allowlist`. */
export function mayDeliverTo(to: string, allowlist: string[] | null): boolean {
  if (allowlist === null) return true;
  return allowlist.includes(to.trim().toLowerCase());
}
