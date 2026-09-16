/**
 * Who is allowed to trigger a scheduled job.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * Both scheduled endpoints used to call `sdk.authenticateRequest` and check
 * `user.isCron`, a flag only the Manus platform ever sets. Off Manus that check
 * refuses everything — including the real trigger. It fails in the safe
 * direction, which is why nothing broke, but the jobs would simply never run.
 *
 * So the authority moves to a shared secret: one long random value the app and
 * whatever calls it both hold, sent in a header.
 *
 * ── Why the comparison is not `===` ──────────────────────────────────────────
 * A string comparison stops at the first character that differs, so it returns
 * faster for a wrong guess that shares a prefix. Over enough attempts that
 * timing difference is enough to recover the secret one character at a time.
 * It is a real attack, not a theoretical one, and it is cheap to close.
 *
 * Both sides are hashed to a fixed 32 bytes first and those are compared in
 * constant time. Hashing is not for secrecy here — it is what makes the two
 * sides the same length, so a wrong-LENGTH header is rejected by the same
 * constant-time path instead of by an early return that reveals the length.
 *
 * ── No secret set means refuse ───────────────────────────────────────────────
 * The tempting shortcut is to skip the check when nothing is configured, so
 * that a fresh environment "just works". That would leave a database-deleting
 * endpoint open to the internet on any server where the variable was missed,
 * which is the exact shape of a great many real breaches. An unconfigured
 * server refuses every trigger and says so in its own logs.
 */
import { createHash, timingSafeEqual } from "node:crypto";

/** The header a caller puts the secret in. */
export const CRON_SECRET_HEADER = "x-cron-secret";

/** The setting that holds it. Server-side only — never a `VITE_` name. */
export const CRON_SECRET_VAR = "CRON_SECRET";

/**
 * Shortest secret worth accepting.
 *
 * Not a password policy — this value is machine-to-machine and should be 32+
 * random characters. It exists to catch the case where someone sets
 * CRON_SECRET to something like "changeme" and believes the endpoint is now
 * protected. A short secret is closer to no secret than to a real one, and it
 * is better to refuse and say so than to appear configured.
 */
export const MIN_CRON_SECRET_LENGTH = 16;

export type CronAuthResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * For this server's own log. Never sent to the caller — see below.
       */
      reason:
        | "not-configured"
        | "secret-too-short"
        | "missing-header"
        | "wrong-secret";
    };

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * May this request run a scheduled job?
 *
 * Takes the header value and the environment rather than a request object, so
 * every case below is a plain function call in a test rather than a fake HTTP
 * request — and so the two endpoints cannot drift apart in how they check.
 */
export function checkCronSecret(
  provided: string | string[] | undefined,
  env: NodeJS.ProcessEnv = process.env
): CronAuthResult {
  const expected = env[CRON_SECRET_VAR]?.trim();

  if (!expected) return { ok: false, reason: "not-configured" };
  if (expected.length < MIN_CRON_SECRET_LENGTH) {
    return { ok: false, reason: "secret-too-short" };
  }

  // A repeated header arrives as an array. Refused rather than picking one:
  // a caller sending two different values is not a caller to be helpful to.
  if (typeof provided !== "string" || provided.length === 0) {
    return { ok: false, reason: "missing-header" };
  }

  return timingSafeEqual(digest(provided), digest(expected))
    ? { ok: true }
    : { ok: false, reason: "wrong-secret" };
}

/**
 * What the caller is told: one sentence, the same for every failure.
 *
 * A missing header, a wrong secret and an unconfigured server are all "no".
 * Telling them apart would let someone probing learn whether the endpoint is
 * protected at all, and learn it without ever guessing correctly. The reason
 * goes in this server's log, where the person who can act on it will look.
 */
export const CRON_REFUSAL_BODY = { error: "not authorised" } as const;
