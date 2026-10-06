/**
 * Where the browser smoke test is allowed to point. One function, tested,
 * read by e2e/playwright.config.ts before any page opens.
 *
 * ── Why the test can never reach live ───────────────────────────────────────
 * The smoke test creates bids, places marks, locks a bid and archives what it
 * made. On staging and on a laptop that is the point; on bidridge.com it
 * would be writing test rows into contractors' real company data. So the
 * address is checked against an ALLOW list, not a deny list: staging, or this
 * machine. Anything else is refused, and the live domain is refused BY NAME
 * so the message says exactly what went wrong.
 *
 * GitHub also holds no live credential at all (references/build-pipeline-plan.md
 * § 4), so this is the second wall, not the only one.
 */

export const STAGING_ORIGIN = "https://staging.bidridge.com";

/** Live addresses, refused by name. */
export const LIVE_HOSTS = ["bidridge.com", "www.bidridge.com"] as const;

const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"] as const;

export type SmokeTarget =
  | { ok: true; origin: string; kind: "staging" | "local" }
  | { ok: false; message: string };

export function checkSmokeTarget(raw: string | undefined): SmokeTarget {
  if (!raw || !raw.trim()) {
    return {
      ok: false,
      message:
        "SMOKE_BASE_URL is not set. Set it to https://staging.bidridge.com, or a server on this machine (http://127.0.0.1:<port>).",
    };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: `SMOKE_BASE_URL is not a URL: "${raw}".` };
  }
  const host = url.hostname.toLowerCase();
  if ((LIVE_HOSTS as readonly string[]).includes(host)) {
    return {
      ok: false,
      message: `Refusing to run the smoke test against ${host}: that is the LIVE site. It runs on staging (${STAGING_ORIGIN}) or this machine only.`,
    };
  }
  if (url.origin === STAGING_ORIGIN) {
    return { ok: true, origin: STAGING_ORIGIN, kind: "staging" };
  }
  if (
    (LOCAL_HOSTS as readonly string[]).includes(url.hostname) &&
    url.protocol === "http:"
  ) {
    return { ok: true, origin: url.origin, kind: "local" };
  }
  return {
    ok: false,
    message: `Refusing to run the smoke test against ${url.origin}: only ${STAGING_ORIGIN} or http://127.0.0.1:<port> are allowed.`,
  };
}
