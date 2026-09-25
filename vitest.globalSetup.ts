/**
 * Runs ONCE, before any test file loads, and aborts the whole run if the
 * suite is pointed at a database that is not a scratch one on this machine.
 *
 * `.env` names `bidrender_local`, the real-data copy, because that is what the
 * dev server wants — so a bare `pnpm test` used to write fixture rows into real
 * data, and did, on 2026-09-14. The rule is `checkTestDatabase` in
 * `scripts/databaseGuard.ts`, where it is tested; this file only applies it.
 *
 * `dotenv/config` is loaded here as well as in `setupFiles`, because global
 * setup runs in the main process and would otherwise judge an empty url while
 * the workers connect to the one from `.env`. vitest.setup.ts checks again in
 * the worker, which is the process that actually opens the connection.
 */
import "dotenv/config";
import { checkTestDatabase } from "./scripts/databaseGuard";

export default function assertScratchDatabase(): void {
  const result = checkTestDatabase(process.env.DATABASE_URL);
  if (!result.ok) throw new Error(result.message);
}
