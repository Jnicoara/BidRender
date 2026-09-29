/**
 * Is the database this DATABASE_URL points at behind the code?
 *
 *   pnpm tsx scripts/schemaDrift.mts
 *
 * ── Run this before and after applying migrations ────────────────────────────
 * (This heading said "in a Manus sandbox" until 2026-09-25; that platform is
 * gone. Point DATABASE_URL — or DOTENV_CONFIG_PATH — at the database to ask.)
 *
 * references/deploying.md § 5 says to compare the migrations in the repo
 * against what the database has actually run, and until now there was no way
 * to do it — `ls drizzle/*.sql | wc -l` counts files, which tells you nothing
 * about the other end. This answers the real question: which columns does the
 * code expect that this database does not have — and, since 2026-09-25, which
 * columns does it disagree with about NULL, about TYPE (width included:
 * varchar(255) vs text, int vs bigint, varchar(128) vs varchar(64)), about the
 * DEFAULT (a different value, one gained or lost, a lost ON UPDATE), or about
 * COLLATION (any string column not on utf8mb4_unicode_ci — the project rule,
 * since drizzle cannot declare one). **Auto-increment is the only thing not
 * compared.** See server/schemaCheck.ts for why each was added and the two
 * short, measured lists that stop equivalent spellings from false-alarming
 * (boolean = tinyint(1); 0 = 0.0000; now() = CURRENT_TIMESTAMP).
 *
 * For collation drift the fix is not db:push — a migration does not set a
 * collation — so the report prints the ALTER TABLE … CONVERT statement.
 *
 * Since 2026-09-28 it also compares FOREIGN KEYS — the links that make
 * deleting a bid or a plan set delete what hangs off it — and shouts when a
 * database has none at all, which is what a `CREATE TABLE … LIKE` copy looks
 * like (bidrender_local_b). See "Foreign keys" in server/schemaCheck.ts.
 *
 * Exits 1 on drift so it can gate a deploy step; 0 when they agree.
 *
 * It names the HOST and database it asked, never the URL, so the output can go
 * straight into a transcript — the question is almost always "did 0060 reach
 * PRODUCTION", and an answer that does not say which database it came from is
 * not an answer to it.
 */
import "dotenv/config";
import path from "node:path";
import {
  appliedMigrationCount,
  describeDrift,
  describeForeignKeyDrift,
  findForeignKeyDrift,
  findSchemaDrift,
  hasForeignKeyDrift,
  lastMigrationAt,
  linkOrigins,
} from "../server/schemaCheck";
import { readMigrations } from "../server/migrationRun";

function where(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? "");
    return parsed.hostname + ":" + (parsed.port || "3306") + parsed.pathname;
  } catch {
    return "(DATABASE_URL unset or unparseable)";
  }
}

console.log("database: " + where());

/*
  A database that cannot be READ is not an unmigrated one. This used to print
  "never been migrated" and carry on when the connection timed out — measured
  against production from off its trusted list, 2026-09-27. Now it says what
  actually happened and stops, before any of the drift below is printed from
  a database it never reached. Exit 2, apart from drift's 1.
*/
let applied: number | null;
try {
  applied = await appliedMigrationCount();
} catch (err) {
  const reason =
    (err as { cause?: { code?: string; message?: string } })?.cause?.code ??
    (err as Error)?.message ??
    String(err);
  console.log(
    `Could not read this database (${reason}). This is NOT "never migrated" — ` +
      "nothing was checked. Fix the connection and run this again."
  );
  process.exit(2);
}
console.log(
  applied === null
    ? "No __drizzle_migrations table — this database has never been migrated."
    : `Migrations recorded in this database: ${applied}`
);

const drift = await findSchemaDrift();
console.log(describeDrift(drift));

// The links between tables, which the column check above cannot see: a copy
// made with CREATE TABLE … LIKE has every column right and no links at all.
const links = await findForeignKeyDrift();
// Which migration adds each missing link, and whether it has run here — so a
// link that is merely pending is not reported as needing a hand-written ALTER.
const origins = linkOrigins(
  links.missing,
  readMigrations(path.resolve(import.meta.dirname, "..", "drizzle")),
  await lastMigrationAt()
);
console.log(describeForeignKeyDrift(links, origins));

process.exit(drift.length === 0 && !hasForeignKeyDrift(links) ? 0 : 1);
