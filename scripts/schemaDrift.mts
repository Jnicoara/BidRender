/**
 * Is the database this DATABASE_URL points at behind the code?
 *
 *   pnpm tsx scripts/schemaDrift.mts
 *
 * ── Run this in a Manus sandbox before and after `pnpm db:push` ──────────────
 * references/deploying.md § 5 says to compare the migrations in the repo
 * against what the database has actually run, and until now there was no way
 * to do it — `ls drizzle/*.sql | wc -l` counts files, which tells you nothing
 * about the other end. This answers the real question: which columns does the
 * code expect that this database does not have — and, since 2026-09-25, which
 * columns does it disagree with about NULL (see server/schemaCheck.ts for why
 * that was added, and what it still does not compare).
 *
 * Exits 1 on drift so it can gate a deploy step; 0 when they agree.
 *
 * It names the HOST and database it asked, never the URL, so the output can go
 * straight into a transcript — the question is almost always "did 0060 reach
 * PRODUCTION", and an answer that does not say which database it came from is
 * not an answer to it.
 */
import "dotenv/config";
import {
  appliedMigrationCount,
  describeDrift,
  findSchemaDrift,
} from "../server/schemaCheck";

function where(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? "");
    return parsed.hostname + ":" + (parsed.port || "3306") + parsed.pathname;
  } catch {
    return "(DATABASE_URL unset or unparseable)";
  }
}

console.log("database: " + where());

const applied = await appliedMigrationCount();
console.log(
  applied === null
    ? "No __drizzle_migrations table — this database has never been migrated."
    : `Migrations recorded in this database: ${applied}`
);

const drift = await findSchemaDrift();
console.log(describeDrift(drift));
process.exit(drift.length === 0 ? 0 : 1);
