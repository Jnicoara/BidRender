/**
 * ONE DOOR: no script writes to a database that is not on this machine unless
 * somebody said so out loud.
 *
 * ── The near-miss this exists for, written down because it was luck ─────────
 * On 2026-09-21 a throwaway rehearsal script needed R2 credentials, so it was
 * run with `DOTENV_CONFIG_PATH=.env.production.local`. That file also carries
 * `DATABASE_URL`. The script read it, connected to the PRODUCTION server, and
 * issued `DROP DATABASE IF EXISTS bidrender_rehearsal`.
 *
 * It failed — `bidrender_app` has no privilege to drop databases — and that is
 * the only reason nothing happened. The script was correct about everything
 * except which server it was pointed at, and nothing in its path could tell.
 *
 * A comment saying "be careful with DOTENV_CONFIG_PATH" would not have helped:
 * the script's author knew, and did it anyway, because the variable that caused
 * it belongs to a file being read for something else entirely. So this is a
 * function that can FAIL rather than a rule that can be forgotten — the same
 * reasoning `scripts/loadPlansEnv.mts` already applies to borrowed secrets.
 *
 * ── What counts as local ────────────────────────────────────────────────────
 * The loopback host, nothing else. Not a hostname that resolves to loopback,
 * not a private range, not a tunnel: this has to be decidable from the string
 * without a DNS lookup, because a guard that sometimes takes a network round
 * trip is a guard somebody will skip.
 *
 * ── The override is a VALUE, not a truthy flag ──────────────────────────────
 * `ALLOW_REMOTE_DATABASE=yes`. A bare `=1` is too easy to leave exported in a
 * shell, and a forgotten override is the same hole with extra steps. Applying
 * migrations to production is a real and routine use of it — that is the
 * intended shape, a deliberate word at the moment of doing something to a
 * server that is not yours to experiment on.
 */

/** Hosts that are this machine. Decided from the string, never resolved. */
export const LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"] as const;

/** The env var that says "yes, I mean the remote one", and its only accepted value. */
export const OVERRIDE_VAR = "ALLOW_REMOTE_DATABASE";
export const OVERRIDE_VALUE = "yes";

export type GuardResult =
  | { ok: true; reason: "local"; host: string }
  | { ok: true; reason: "override"; host: string }
  | { ok: false; host: string | null; message: string };

/**
 * May this script write to this database?
 *
 * Pure, so the decision can be tested without a database or a process. The
 * throwing wrapper below is what scripts actually call.
 *
 * An UNPARSEABLE url is refused rather than waved through. "I could not tell
 * where this points" and "this points somewhere safe" are different answers,
 * and only one of them should let a `DROP` proceed.
 */
export function checkWritableDatabase(
  url: string | undefined,
  options: {
    /** What the script is about to do, for the message. "apply migrations". */
    action: string;
    /** Usually `process.env`. Taken as an argument so a test needs no globals. */
    env?: Record<string, string | undefined>;
  }
): GuardResult {
  const env = options.env ?? {};
  const allowed = env[OVERRIDE_VAR]?.trim().toLowerCase() === OVERRIDE_VALUE;

  if (!url || !url.trim()) {
    return {
      ok: false,
      host: null,
      message: `No database URL, so nothing can say where "${options.action}" would land. Refusing.`,
    };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return {
      ok: false,
      host: null,
      message:
        `Could not read a host out of the database URL, so there is no way ` +
        `to tell whether "${options.action}" would hit production. Refusing.`,
    };
  }

  if ((LOCAL_HOSTS as readonly string[]).includes(host)) {
    return { ok: true, reason: "local", host };
  }
  if (allowed) return { ok: true, reason: "override", host };

  return {
    ok: false,
    host,
    message:
      `Refusing to ${options.action}: the database is at ${host}, which is not ` +
      `this machine.\n` +
      `If that is deliberate — applying migrations to production is — say so:\n` +
      `  ${OVERRIDE_VAR}=${OVERRIDE_VALUE} <your command>\n` +
      `A script once reached production because a production env file was ` +
      `loaded for its R2 keys and its DATABASE_URL came along; this is that ` +
      `guard.`,
  };
}

/**
 * The same decision, as something a script can put at the top and forget.
 *
 * Exits rather than throwing, so a refusal reads as a refusal instead of a
 * stack trace somebody scrolls past. Returns the host on success so a script
 * can say where it is about to work.
 */
export function assertWritableDatabase(
  url: string | undefined,
  options: { action: string; env?: Record<string, string | undefined> }
): string {
  const result = checkWritableDatabase(url, {
    ...options,
    env: options.env ?? process.env,
  });
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  if (result.reason === "override") {
    // Say it out loud. An override that works silently is one nobody notices
    // they left set.
    console.log(
      `${OVERRIDE_VAR}=${OVERRIDE_VALUE} — proceeding against ${result.host}.`
    );
  }
  return result.host;
}

/**
 * ── The test suite's door: a SCRATCH database on this machine, or nothing ────
 *
 * The suite writes fixture rows — users, bids, clients, kits — into whatever
 * `DATABASE_URL` names, and `.env` names `bidrender_local`, the restored copy
 * of real data. On 2026-09-14 two full runs did exactly that and left test
 * accounts in it. The fix then was a comment in `.env` and a line in a memory
 * file — a rule somebody has to remember at the one moment they are not
 * thinking about it. This is the version that can fail.
 *
 * Stricter than `checkWritableDatabase` on purpose, and there is no override:
 *
 *   - the host must be this machine, AND
 *   - the database NAME must say it is a test one — `test` as its own
 *     underscore-separated word (`bidrender_test`, `bidrender_test_clean`,
 *     `test_scratch`). A real-data copy never carries the word, and
 *     `bidrender_local` does not.
 *
 * UNSET is allowed. Every DB-backed suite skips itself without a url, so a
 * run with `DATABASE_URL=` can write nowhere; that is the pure-function run,
 * and refusing it would only teach people to point at something to get past
 * the guard.
 */
export const TEST_DATABASE_NAME = /(^|_)test(_|$)/i;

export type TestDatabaseResult =
  | { ok: true; database: string | null }
  | { ok: false; message: string };

export function checkTestDatabase(url: string | undefined): TestDatabaseResult {
  if (!url || !url.trim()) return { ok: true, database: null };

  const howTo =
    `Point the run at a scratch database, e.g.\n` +
    `  DATABASE_URL=mysql://root:<pw>@127.0.0.1:3307/bidrender_test_clean pnpm test\n` +
    `or run with DATABASE_URL= (empty) to skip every database-backed suite.`;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      message: `Refusing to run tests: could not read the database URL, so there is no way to tell what they would write into.\n${howTo}`,
    };
  }
  const host = parsed.hostname;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  if (!(LOCAL_HOSTS as readonly string[]).includes(host)) {
    return {
      ok: false,
      message: `Refusing to run tests: the database is at ${host}, which is not this machine. Tests write fixture rows.\n${howTo}`,
    };
  }
  if (!TEST_DATABASE_NAME.test(database)) {
    return {
      ok: false,
      message:
        `Refusing to run tests against "${database || "(no database named)"}": ` +
        `the name does not say it is a test database, and the suite writes ` +
        `fixture rows into whatever it is given. .env points at the real-data ` +
        `copy on purpose, for the dev server.\n${howTo}`,
    };
  }
  return { ok: true, database };
}
