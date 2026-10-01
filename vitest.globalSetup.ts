/**
 * Runs ONCE, before any test file loads, and aborts the whole run if the
 * suite is pointed at a database that is not a scratch one on this machine.
 *
 * `.env` names `bidrender_local`, the real-data copy, because that is what the
 * dev server wants — so a bare `pnpm test` used to write fixture rows into real
 * data, and did, on 2026-09-14. The rule is `checkTestDatabase` in
 * `scripts/databaseGuard.ts`, where it is tested; this file only applies it.
 *
 * It then takes the database for the whole run, and refuses if another run
 * already has it — two suites on one database delete each other's fixtures.
 * See `scripts/testSuiteLock.ts`; `server/testSuiteLock.test.ts` checks, from
 * inside the run, that the lock is really held.
 *
 * `dotenv/config` is loaded here as well as in `setupFiles`, because global
 * setup runs in the main process and would otherwise judge an empty url while
 * the workers connect to the one from `.env`. vitest.setup.ts checks again in
 * the worker, which is the process that actually opens the connection.
 */
import "dotenv/config";
import { checkTestDatabase } from "./scripts/databaseGuard";
import { holdTestSuiteLock } from "./scripts/testSuiteLock";

export default async function assertScratchDatabase(): Promise<
  (() => Promise<void>) | undefined
> {
  const url = process.env.DATABASE_URL;
  const result = checkTestDatabase(url);
  if (!result.ok) throw new Error(result.message);
  // No database, no DB-backed suites, nothing to share.
  if (!url || !result.database) return undefined;
  // Returned, so vitest calls it as the run's teardown.
  return holdTestSuiteLock(url);
}
