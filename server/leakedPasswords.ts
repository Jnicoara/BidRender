/**
 * IS THIS PASSWORD ON A BREACH LIST? (todo.md, "Before beta: sign-in
 * protection", owner 2026-10-06.)
 *
 * Asked at sign-up, password change and reset. A password that has leaked
 * is the first one an attacker tries against every account, so it is
 * refused, with the reason said plainly — never a silent rejection.
 *
 * ── What leaves the server ───────────────────────────────────────────────────
 * Five hexadecimal characters: the first five of the password's SHA-1
 * (Have I Been Pwned's "range" API, k-anonymity). Never the password, never
 * the whole hash. The reply is every leaked hash suffix under that prefix,
 * padded with fakes (`Add-Padding`) so its size says nothing either; the
 * match happens here.
 *
 * ── Fails OPEN, on purpose ───────────────────────────────────────────────────
 * The service is someone else's. If it is slow, down or unreachable, the
 * answer is `null` — "could not tell" — and the password is allowed: a
 * sign-up form that breaks whenever a third party does would lock out the
 * very people this protects. Bounded at 2.5 s. Logged, without the password.
 *
 * Switched off with LEAKED_PASSWORD_CHECK=off (vitest.setup.ts does, so no
 * test ever reaches the network; `leakedPasswords.test.ts` passes its own
 * fetch).
 */
import { createHash } from "node:crypto";

export const LEAKED_PASSWORD_MESSAGE =
  "That password has shown up in a data breach, so it's one of the first ones attackers try. Choose a different one.";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";

type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * True: on a breach list. False: not. Null: could not tell (switched off,
 * slow, down) — the caller allows the password.
 */
export async function isLeakedPassword(
  password: string,
  options: {
    fetchImpl?: Fetch;
    timeoutMs?: number;
    env?: Record<string, string | undefined>;
  } = {}
): Promise<boolean | null> {
  const env = options.env ?? process.env;
  if ((env.LEAKED_PASSWORD_CHECK ?? "").toLowerCase() === "off") return null;
  const hash = createHash("sha1").update(password, "utf8").digest("hex");
  const prefix = hash.slice(0, 5).toUpperCase();
  const suffix = hash.slice(5).toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  try {
    const fetchImpl = options.fetchImpl ?? (fetch as unknown as Fetch);
    const response = await fetchImpl(RANGE_URL + prefix, {
      headers: { "Add-Padding": "true", "User-Agent": "BidRidge" },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[auth] leaked-password check unavailable (HTTP ${response.status}); allowed`
      );
      return null;
    }
    const body = await response.text();
    for (const line of body.split("\n")) {
      const [candidate, count] = line.trim().split(":");
      // Padding rows carry a count of 0: not a real leak.
      if (candidate?.toUpperCase() === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (error) {
    console.warn(
      `[auth] leaked-password check unavailable (${
        error instanceof Error ? error.name : "error"
      }); allowed`
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
