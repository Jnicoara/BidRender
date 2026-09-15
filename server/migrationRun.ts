/**
 * Applying drizzle/ to a database, and saying exactly where it stopped when it
 * cannot.
 *
 * ── Why `pnpm db:push` no longer ends in `drizzle-kit migrate` ───────────────
 * drizzle-kit receives MySQL's error and never prints it: on failure its
 * progress view redraws the "applying migrations..." spinner one last time and
 * the process exits 1. A brand-new database stopped at 4 of 44 that way with
 * nothing on screen. scripts/migrate.mts runs drizzle's own migrator — the same
 * code drizzle-kit calls — and reports a failure itself, using these helpers.
 *
 * ── What "pending" means, and why fixing an old migration is safe ────────────
 * drizzle does not compare file contents with what a database ran. It reads the
 * date of the newest migration the database has recorded and runs every journal
 * entry dated after it (drizzle-orm's mysql-core dialect, `migrate`). So
 * correcting a migration an existing database already has cannot make it run
 * there again — and a new entry dated before the newest existing one is skipped
 * on every existing database without a word, which is why the test checks the
 * journal's dates.
 *
 * ── A migration has to build a fresh MySQL 8 database, not only update ours ──
 * The live database was built one migration at a time on TiDB, which accepts
 * things MySQL 8 refuses. `migrationProblems` catches the two that stopped a new
 * database: an over-long name (0004) and `ADD COLUMN IF NOT EXISTS` (0032).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

/** The longest table, column, index or constraint name MySQL accepts. */
export const MYSQL_IDENTIFIER_LIMIT = 64;

export type Migration = {
  /** File name without `.sql`, as the journal lists it. */
  tag: string;
  /** Journal date in ms — decides whether a database still needs it. */
  when: number;
  /** Exactly the statements drizzle executes, in order. */
  statements: string[];
};

/** The journal's migrations, split into statements the way drizzle splits them. */
export function readMigrations(folder: string): Migration[] {
  const journal = JSON.parse(
    readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")
  ) as { entries: Array<{ tag: string; when: number }> };
  const files = readMigrationFiles({ migrationsFolder: folder });
  return journal.entries.map((entry, i) => ({
    tag: entry.tag,
    when: entry.when,
    statements: files[i].sql,
  }));
}

/**
 * The migrations a database still needs, given the date of the newest one it
 * has recorded (null when it has never been migrated). Same rule as drizzle's
 * migrator, so this is what a run will attempt.
 */
export function pendingMigrations(
  migrations: readonly Migration[],
  lastAppliedAt: number | null
): Migration[] {
  return migrations.filter(
    m => lastAppliedAt === null || lastAppliedAt < m.when
  );
}

export type MigrationFailure = {
  tag: string;
  /** 1-based, counted the way the file's statement-breakpoints split it. */
  statement: number;
  statementCount: number;
  sql: string;
};

/**
 * Which statement a failed run stopped on.
 *
 * `failedQuery` is the text drizzle says it was running, matched exactly. The
 * search starts at the first migration the database still lacks AFTER the
 * failure — whatever is recorded by then really did run — so a statement that
 * repeats one from an earlier, applied migration is not blamed on that file.
 * Null when nothing matches: the failure was not in a migration statement (a
 * lost connection, or the ledger table itself).
 */
export function locateFailure(
  migrations: readonly Migration[],
  lastAppliedAtAfterFailure: number | null,
  failedQuery: string | undefined
): MigrationFailure | null {
  if (failedQuery === undefined) return null;
  for (const m of pendingMigrations(migrations, lastAppliedAtAfterFailure)) {
    const index = m.statements.indexOf(failedQuery);
    if (index >= 0) {
      return {
        tag: m.tag,
        statement: index + 1,
        statementCount: m.statements.length,
        sql: failedQuery.trim(),
      };
    }
  }
  return null;
}

function oneLine(sql: string, max = 300): string {
  const flat = sql.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** What a person reads when a run stops. */
export function describeMigrationFailure(input: {
  failure: MigrationFailure | null;
  reason: { code?: string; message: string };
  stillNeeded: number;
  total: number;
}): string {
  const { failure, reason, stillNeeded, total } = input;
  const said = `  MySQL said:  ${reason.code ? `[${reason.code}] ` : ""}${reason.message}`;
  const needed = `Migrations this database still needs: ${stillNeeded} of ${total}.`;

  if (failure === null) {
    return [
      "Migration failed, and not inside a migration statement.",
      "",
      said,
      "",
      needed,
    ].join("\n");
  }

  const before =
    failure.statement === 1
      ? "It stopped on the first statement of that file, so nothing in that file ran."
      : `MySQL cannot undo a table change, so ${
          failure.statement === 2
            ? "statement 1 of that file has"
            : `statements 1–${failure.statement - 1} of that file have`
        } already taken effect, and running again will repeat ${
          failure.statement === 2 ? "it" : "them"
        }.`;

  return [
    "Migration failed. This database is now only partly updated.",
    "",
    `  Stopped in:  ${failure.tag}.sql, statement ${failure.statement} of ${failure.statementCount}`,
    said,
    `  Statement:   ${oneLine(failure.sql)}`,
    "",
    needed,
    before,
    "On a new, empty database: fix the file, drop the database and build it again.",
    "On a database holding real data: stop and look before running anything else.",
  ].join("\n");
}

/** What a person reads when a run finishes. */
export function describeMigrationSuccess(
  applied: readonly Migration[],
  total: number
): string {
  if (applied.length === 0) {
    return `Nothing to apply. This database already has all ${total} migrations.`;
  }
  const which =
    applied.length === 1
      ? `1 migration: ${applied[0].tag}`
      : `${applied.length} migrations: ${applied[0].tag} to ${applied[applied.length - 1].tag}`;
  return `Applied ${which}. This database now has all ${total}.`;
}

/**
 * Wording MySQL 8 refuses. Each has either already stopped a fresh database or
 * is the same mistake in a different place — MariaDB and TiDB accept all of
 * these, which is how they get written and pass on the database they were
 * tested against.
 */
const MYSQL_8_REFUSES: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\b(ADD|DROP|MODIFY|CHANGE)\s+(COLUMN\s+)?IF\s+(NOT\s+)?EXISTS\b/i,
    why: "MySQL 8 has no IF [NOT] EXISTS for a column; check information_schema and PREPARE the change, as 0032 does",
  },
  {
    pattern:
      /\b(ADD|DROP)\s+(INDEX|KEY|CONSTRAINT|FOREIGN\s+KEY)\s+IF\s+(NOT\s+)?EXISTS\b/i,
    why: "MySQL 8 has no IF [NOT] EXISTS for an index or constraint",
  },
  {
    pattern: /\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/i,
    why: "MySQL 8 has no CREATE INDEX IF NOT EXISTS",
  },
  {
    pattern: /\/\*T!|\bAUTO_RANDOM\b/i,
    why: "TiDB-only syntax",
  },
];

/** The SQL MySQL is actually sent: breakpoint markers and `-- ` comments removed. */
function sentToMysql(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .replace(/--> statement-breakpoint/g, "")
    .replace(/(^|[ \t])--([ \t].*)?$/gm, "$1");
}

/**
 * Everything in one migration file that would stop a fresh MySQL 8 database.
 * Empty when there is nothing. Comments are ignored.
 */
export function migrationProblems(sql: string): string[] {
  const sent = sentToMysql(sql);
  const problems: string[] = [];
  const names = new Set(Array.from(sent.matchAll(/`([^`]+)`/g), m => m[1]));
  for (const name of Array.from(names)) {
    if (name.length > MYSQL_IDENTIFIER_LIMIT) {
      problems.push(
        `name is ${name.length} characters, over MySQL's ${MYSQL_IDENTIFIER_LIMIT}: ${name}`
      );
    }
  }
  for (const rule of MYSQL_8_REFUSES) {
    const match = rule.pattern.exec(sent);
    if (match) problems.push(`"${match[0]}": ${rule.why}`);
  }
  return problems;
}
