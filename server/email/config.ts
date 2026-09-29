/**
 * What the email door is allowed to do on THIS server, decided once from its
 * settings. Pure — `env` is a parameter — so every branch is tested without a
 * provider.
 *
 * ── Three modes ──────────────────────────────────────────────────────────────
 *   stub     any run that is not NODE_ENV=production: `pnpm dev`, vitest, a
 *            script. Sends are LOGGED and never reach Resend, even if a key is
 *            sitting in a local file (owner, 2026-09-29).
 *   off      production with no RESEND_API_KEY. Nothing is sent, and the
 *            screens say so in plain words rather than failing.
 *   resend   production with the key: real sends.
 *
 * ── Settings ─────────────────────────────────────────────────────────────────
 *   RESEND_API_KEY           the provider key — a Run Time, encrypted secret
 *                            in DigitalOcean. Never in a file in this repo,
 *                            never logged.
 *   STAGING_EMAIL_ALLOWLIST  comma-separated addresses; on staging, only these
 *                            receive mail.
 *   EMAIL_FROM               optional; default `DEFAULT_EMAIL_FROM`.
 *   APP_BASE_URL             optional; default the primary domain for this
 *                            server (`defaultBaseUrl`).
 *   EMAIL_DAILY_CAP          optional; sends per instance per UTC day (100).
 *   EMAIL_MONTHLY_CAP        optional; sends per instance per UTC month (3000).
 *
 * ── The sending domain is mail.bidridge.com ─────────────────────────────────
 * Verified in Resend (us-east-1) on 2026-09-29, which overrides the plan to
 * verify the root domain (references/stage-4-safety-plan.md). The From address
 * is built in rather than a setting, so the live app needs exactly one new
 * setting — the key — and cannot be given a From that Resend would refuse.
 *
 * ── The defaults are Resend's free tier, and the tier is the real limit ──────
 * Owner, 2026-09-29: 100 a day, 3,000 a month, 10 requests a second, and
 * pay-as-you-go is OFF — so a send past the limit FAILS rather than bills.
 * The caps here are counted per server instance and start again when one is
 * replaced (every deploy), so they are an early stop, not the guarantee: the
 * provider refusing is. `./index.ts` treats that refusal as a pause for
 * everybody until the quota resets. The rate limits on the reset form keep
 * sends far below 10 a second; nothing here spaces them further.
 *
 * ── Why the link is not built from the request ───────────────────────────────
 * The request's Host header is whatever the sender typed. A reset link built
 * from it lets anybody ask for a reset on someone else's address and have the
 * victim's own inbox receive a link to the ATTACKER's site, token included.
 * So links come from `APP_BASE_URL`, or a fixed default per server, and never
 * from the request.
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
      kind: "resend" | "stub";
      /** Empty in stub mode: nothing there may reach the provider. */
      apiKey: string;
      from: string;
      baseUrl: string;
      /** null: deliver to anyone. An array: only these (lower-cased). */
      allowlist: string[] | null;
      dailyCap: number;
      monthlyCap: number;
    };

export const DEFAULT_EMAIL_FROM = "BidRidge <no-reply@mail.bidridge.com>";
export const DEFAULT_EMAIL_DAILY_CAP = 100;
export const DEFAULT_EMAIL_MONTHLY_CAP = 3000;

export function emailConfig(
  env: Record<string, string | undefined>
): EmailConfig {
  const isStaging = Boolean(env.STAGING_PASSWORD?.trim());
  const production = env.NODE_ENV === "production";
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  if (production && !apiKey)
    return { kind: "off", why: "RESEND_API_KEY is not set" };

  const baseUrl = env.APP_BASE_URL?.trim()
    ? appBaseUrl(env.APP_BASE_URL)
    : defaultBaseUrl({ production, isStaging, port: env.PORT });
  if (!baseUrl)
    return {
      kind: "off",
      why: "APP_BASE_URL is not an https:// address",
    };

  const listed = env.STAGING_EMAIL_ALLOWLIST?.split(",")
    .map(a => a.trim().toLowerCase())
    .filter(a => a.length > 0);
  const allowlist =
    listed && listed.length > 0 ? listed : isStaging ? [] : null;

  return {
    kind: production ? "resend" : "stub",
    apiKey: production ? apiKey : "",
    from: env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM,
    baseUrl,
    allowlist,
    dailyCap: positiveInt(env.EMAIL_DAILY_CAP, DEFAULT_EMAIL_DAILY_CAP),
    monthlyCap: positiveInt(env.EMAIL_MONTHLY_CAP, DEFAULT_EMAIL_MONTHLY_CAP),
  };
}

/**
 * Where links point when `APP_BASE_URL` is not set: the PRIMARY domain of
 * each server — never a redirecting one, the same rule as the cron Worker's
 * (workers/cron/wrangler.toml).
 */
export function defaultBaseUrl(server: {
  production: boolean;
  isStaging: boolean;
  port?: string;
}): string {
  if (server.isStaging) return "https://staging.bidridge.com";
  if (server.production) return "https://bidridge.com";
  return `http://localhost:${server.port || "3000"}`;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Exactly one plain address, or null. A send goes to ONE person (owner,
 * 2026-09-29): a comma, a semicolon, a space or a display name in the `to`
 * field is refused rather than handed to a provider that would happily read
 * it as a list.
 */
export function singleAddress(to: string): string | null {
  const address = to.trim();
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(address)
    ? address
    : null;
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
