/**
 * ONE TEST RUN PER DATABASE AT A TIME — held for the whole run, or refused.
 *
 * ── What this fixes (todo.md, "Flaky tests — fix in a batch before beta") ────
 * `fileParallelism: false` in vitest.config.ts stops a run's own files racing
 * each other. It says nothing about a SECOND run, and there usually is one:
 * each track works in its own worktree against the same local MySQL, and the
 * docs told every one of them to test against `bidrender_test_clean`. Two
 * suites on one database delete each other's fixtures mid-test.
 *
 * Reproduced 2026-09-29 by starting `seedReactivatesRetired.test.ts` twice,
 * two seconds apart, against one database: 5 of 6 cases failed, one of them
 * with exactly the error logged on 2026-09-28 — `Cannot read properties of
 * undefined (reading 'userId')` at line ~264, the company row deleted by the
 * OTHER run's `beforeEach`. Alone it passes every time. `backup.test.ts`
 * coming up 11 `assemblies` short is the same shape: another run seeding
 * between the dump and the count.
 *
 * ── Why a lock and not "be careful" ──────────────────────────────────────────
 * Nothing about the failure points here: it arrives as a wrong row in some
 * test that did nothing wrong, and "run it again" makes it pass. A MySQL named
 * lock is held by a connection, so it cannot be left stuck — a crashed run
 * closes its connection and the lock goes with it.
 *
 * It REFUSES rather than waits. A waiting run looks hung for the length of
 * someone else's suite; a refusal says which database is busy and what to do.
 *
 * Named per DATABASE, not per server, because two runs on two databases do not
 * share fixtures — `bidrender_test_b` and `bidrender_test_c` may run together.
 * (What they DO share is anything named server-wide; see the backup test's
 * scratch schemas.)
 */
import mysql from "mysql2/promise";

/** MySQL caps a lock name at 64 characters; a database name is at most 64. */
export function testSuiteLockName(database: string): string {
  return `bidrender:tests:${database}`.slice(0, 64);
}

function databaseOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Take the lock for `url`'s database and keep the connection that holds it
 * open. Resolves to the release function; rejects, naming the database, if
 * another run holds it.
 */
export async function holdTestSuiteLock(
  url: string
): Promise<() => Promise<void>> {
  const database = databaseOf(url);
  const name = testSuiteLockName(database);
  const connection = await mysql.createConnection({ uri: url });
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [name]
    );
    if (rows[0]?.acquired !== 1) {
      throw new Error(
        `Refusing to run tests: another test run is using "${database}" right ` +
          `now, and two runs on one database delete each other's fixtures. ` +
          `Wait for it to finish, or point this run at a test database of its ` +
          `own (each worktree has one — bidrender_test_b, bidrender_test_c).`
      );
    }
  } catch (err) {
    await connection.end();
    throw err;
  }
  return async () => {
    try {
      await connection.query("SELECT RELEASE_LOCK(?)", [name]);
    } finally {
      await connection.end();
    }
  };
}
