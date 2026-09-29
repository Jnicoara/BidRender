/**
 * `scripts/schemaDrift.mts` must never call an UNREACHABLE database "never
 * migrated".
 *
 * It did (todo.md, measured 2026-09-27 against production from off its
 * trusted list): the migration count sat in a bare `catch`, so a timed-out
 * connection printed "No __drizzle_migrations table — this database has never
 * been migrated." and the script went on to report drift from a database it
 * never reached. That sentence is an invitation to re-run every migration
 * against live data.
 *
 * The script is RUN here, as a person runs it, rather than its parts called:
 * the fault was in what it printed, and only the whole run shows that.
 *
 * Red before the fix: the refused-connection case printed "never been
 * migrated" and exited 1, not 2.
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";
import { scratchSchemaFor } from "./testSuiteLock";

const repo = path.resolve(import.meta.dirname, "..");
const tsx = path.join(repo, "node_modules", "tsx", "dist", "cli.mjs");
const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = Boolean(databaseUrl);

function runDrift(url: string) {
  return spawnSync(
    process.execPath,
    [tsx, path.join(repo, "scripts", "schemaDrift.mts")],
    {
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      cwd: repo,
      timeout: 60_000,
    }
  );
}

describe("schemaDrift on a database it cannot reach", () => {
  it('says it could not read it, never "never migrated", and exits 2', () => {
    // Port 1 on this machine: nothing listens, so the connection is refused
    // at once — the same path as the production timeout, without the wait.
    const run = runDrift("mysql://nobody:x@127.0.0.1:1/bidrender_test_refused");
    expect(run.stdout).not.toMatch(/never been migrated/);
    expect(run.stdout).toMatch(/Could not read this database \(ECONNREFUSED\)/);
    expect(run.status).toBe(2);
  }, 70_000);
});

describe.skipIf(!hasDb)(
  "schemaDrift on a database with no migrations table",
  () => {
    const empty = hasDb ? scratchSchemaFor(databaseUrl, "never_migrated") : "";

    afterAll(async () => {
      if (!hasDb) return;
      const admin = await mysql.createConnection({ uri: databaseUrl });
      await admin.query(`DROP DATABASE IF EXISTS \`${empty}\``);
      await admin.end();
    });

    it('still says "never been migrated" — that answer is right there', async () => {
      const admin = await mysql.createConnection({ uri: databaseUrl });
      await admin.query(`DROP DATABASE IF EXISTS \`${empty}\``);
      await admin.query(`CREATE DATABASE \`${empty}\``);
      await admin.end();

      const url = new URL(databaseUrl);
      url.pathname = `/${empty}`;
      const run = runDrift(url.toString());
      expect(run.stdout).toMatch(
        /No __drizzle_migrations table — this database has never been migrated\./
      );
      expect(run.stdout).not.toMatch(/Could not read/);
    }, 70_000);
  }
);
