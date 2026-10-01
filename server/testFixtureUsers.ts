/**
 * A TEST FILE DELETES ITS OWN FIXTURE USERS WHEN IT ENDS — PASS OR FAIL.
 *
 * ── Why this and not a delete per table ──────────────────────────────────────
 * Every table with a `userId` column references `users` with ON DELETE
 * CASCADE — measured 2026-09-29 on `bidrender_test_c`: 52 foreign keys, all
 * CASCADE, and no `userId` table without one. So deleting the fixture users
 * removes everything the file wrote under them — materials, assemblies, run
 * types, bids and what hangs off a bid, the company and its members — in one
 * statement, with no list of tables to keep up to date. A per-table delete is
 * a list, and a list is what missed the 195 rows below.
 *
 * ── What happened (plan T3) ──────────────────────────────────────────────────
 * 20 files cleaned in `beforeEach` — at the START of their next run — and
 * never at the end, and most cleaned only some tables. Measured with
 * `TEST_LEAK_REPORT`, they left 195 user-owned rows per full run, growing
 * every run. None crossed files, but every one was somebody else's clutter.
 *
 * ── Why afterAll ─────────────────────────────────────────────────────────────
 * `afterAll` runs whether the file's tests passed or failed, so a failing
 * test cannot strand its rows. The file's `beforeAll` recreates the users on
 * the next run (each creates them when missing), so nothing is lost.
 *
 * Only the ids passed in are touched. They must be ids THIS file creates —
 * never a real account and never another file's fixture it merely reads.
 */
import { afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

export function dropFixtureUsersAfterAll(ids: readonly number[]): void {
  afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(users).where(inArray(users.id, [...ids]));
  });
}
