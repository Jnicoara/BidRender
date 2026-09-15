/**
 * Every migration must be able to build a brand-new database, not only update
 * the one it was written against.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * New hosting starts from an empty MySQL 8 database, and applying drizzle/ to
 * one stopped at 4 of 44 without a word: 0004 named a constraint in 65
 * characters (MySQL allows 64), and 0032 used `ADD COLUMN IF NOT EXISTS`, which
 * TiDB — where the live database runs — accepts and MySQL 8 refuses. The live
 * database either ran them or had them marked as run by hand, so nothing on
 * that side ever noticed.
 *
 * These read the files, not a database, so they run everywhere and catch the
 * next one as it is written. They do not replace building a fresh database
 * (references/deploying.md § 5); they pin the two mistakes that already
 * happened, and the journal rule that would hide a third.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeMigrationFailure,
  describeMigrationSuccess,
  locateFailure,
  migrationProblems,
  pendingMigrations,
  readMigrations,
  type Migration,
} from "./migrationRun";

const FOLDER = path.resolve(import.meta.dirname, "..", "drizzle");
const migrations = readMigrations(FOLDER);

describe("the migrations in drizzle/", () => {
  it("are all in the journal, and every journal entry has its file", () => {
    const files = readdirSync(FOLDER)
      .filter(file => file.endsWith(".sql"))
      .map(file => file.slice(0, -".sql".length))
      .sort();
    expect(migrations.map(m => m.tag).sort()).toEqual(files);
  });

  it("are dated in order, so none is skipped on a database that has later ones", () => {
    // drizzle runs only entries dated after the newest one a database has
    // recorded, so an entry dated before its predecessor never runs on any
    // existing database — and nothing says so.
    const outOfOrder = migrations
      .filter((m, i) => i > 0 && m.when <= migrations[i - 1].when)
      .map(m => m.tag);
    expect(outOfOrder).toEqual([]);
  });

  it("use nothing a fresh MySQL 8 database refuses", () => {
    const problems = migrations.flatMap(m =>
      migrationProblems(
        readFileSync(path.join(FOLDER, `${m.tag}.sql`), "utf8")
      ).map(problem => `${m.tag}: ${problem}`)
    );
    expect(problems).toEqual([]);
  });
});

describe("migrationProblems", () => {
  it("catches a name longer than MySQL allows — what stopped 0004", () => {
    const sql =
      "ALTER TABLE `project_assembly_items` ADD CONSTRAINT `project_assembly_items_projectAssemblyId_project_assemblies_id_fk` FOREIGN KEY (`projectAssemblyId`) REFERENCES `project_assemblies`(`id`) ON DELETE cascade ON UPDATE no action;";
    expect(migrationProblems(sql)).toEqual([
      expect.stringContaining("65 characters"),
    ]);
  });

  it("catches IF NOT EXISTS on a column — what stopped 0032", () => {
    const sql =
      "ALTER TABLE `pricing_defaults` ADD COLUMN IF NOT EXISTS `productivityPct` decimal(6,4) DEFAULT '0' NOT NULL;";
    expect(migrationProblems(sql)).toEqual([
      expect.stringContaining("ADD COLUMN IF NOT EXISTS"),
    ]);
  });

  it("catches the same wording on indexes, and TiDB-only syntax", () => {
    expect(
      migrationProblems("CREATE INDEX IF NOT EXISTS `a_idx` ON `a` (`b`);")
    ).toHaveLength(1);
    expect(
      migrationProblems("ALTER TABLE `a` DROP INDEX IF EXISTS `a_idx`;")
    ).toHaveLength(1);
    expect(
      migrationProblems(
        "CREATE TABLE `a` (`id` bigint AUTO_RANDOM, PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */);"
      )
    ).toHaveLength(1);
  });

  it("allows what MySQL 8 does support", () => {
    expect(
      migrationProblems(
        "DROP TABLE IF EXISTS `old`;--> statement-breakpoint\nCREATE TABLE IF NOT EXISTS `new` (`id` int);"
      )
    ).toEqual([]);
  });

  it("ignores comments, which MySQL is never sent", () => {
    expect(
      migrationProblems(
        "-- the old form: ADD COLUMN IF NOT EXISTS `a_name_that_is_far_too_long_to_be_a_mysql_identifier_at_all_really`\r\nSELECT 1;"
      )
    ).toEqual([]);
  });
});

const sample: Migration[] = [
  {
    tag: "0000_first",
    when: 100,
    statements: [
      "CREATE TABLE `a` (`id` int);",
      "\nCREATE TABLE `b` (`id` int);",
    ],
  },
  {
    tag: "0001_second",
    when: 200,
    statements: [
      "ALTER TABLE `a` ADD `x` int;",
      "\nCREATE TABLE `b` (`id` int);",
      "\nALTER TABLE `b` ADD `y` int;",
    ],
  },
];

describe("working out what a run did", () => {
  it("a never-migrated database needs everything; otherwise only what is dated later", () => {
    expect(pendingMigrations(sample, null).map(m => m.tag)).toEqual([
      "0000_first",
      "0001_second",
    ]);
    expect(pendingMigrations(sample, 100).map(m => m.tag)).toEqual([
      "0001_second",
    ]);
    expect(pendingMigrations(sample, 200)).toEqual([]);
  });

  it("names the file and the statement a failure stopped on", () => {
    expect(
      locateFailure(sample, 100, "\nALTER TABLE `b` ADD `y` int;")
    ).toEqual({
      tag: "0001_second",
      statement: 3,
      statementCount: 3,
      sql: "ALTER TABLE `b` ADD `y` int;",
    });
  });

  it("does not blame an applied migration for a statement a later one repeats", () => {
    // Both files create `b`. The database has 0000, so the failure is 0001's.
    const located = locateFailure(
      sample,
      100,
      "\nCREATE TABLE `b` (`id` int);"
    );
    expect(located?.tag).toBe("0001_second");
    expect(located?.statement).toBe(2);
  });

  it("says so when the failure was not a migration statement", () => {
    expect(locateFailure(sample, null, undefined)).toBeNull();
    expect(locateFailure(sample, null, "SELECT 1")).toBeNull();
  });
});

describe("what a run prints", () => {
  const stoppedAt = (statement: number) =>
    describeMigrationFailure({
      failure: {
        tag: "0001_second",
        statement,
        statementCount: 3,
        sql: "\nALTER TABLE `b`\n  ADD `y` int;",
      },
      reason: { code: "ER_NO_SUCH_TABLE", message: "Table 'b' doesn't exist" },
      stillNeeded: 1,
      total: 2,
    });

  it("a failure names the file, the statement, MySQL's reason, and that the database is partly updated", () => {
    const text = stoppedAt(3);
    expect(text).toContain("partly updated");
    expect(text).toContain("0001_second.sql, statement 3 of 3");
    expect(text).toContain("[ER_NO_SUCH_TABLE] Table 'b' doesn't exist");
    expect(text).toContain("ALTER TABLE `b` ADD `y` int;");
    expect(text).toContain("still needs: 1 of 2");
    expect(text).toContain(
      "statements 1–2 of that file have already taken effect"
    );
  });

  it("counts what already ran correctly at the start of a file", () => {
    expect(stoppedAt(1)).toContain("nothing in that file ran");
    expect(stoppedAt(2)).toContain(
      "statement 1 of that file has already taken effect"
    );
  });

  it("a failure outside any statement still gives MySQL's reason", () => {
    const text = describeMigrationFailure({
      failure: null,
      reason: { code: "ECONNREFUSED", message: "connect ECONNREFUSED" },
      stillNeeded: 2,
      total: 2,
    });
    expect(text).toContain("[ECONNREFUSED] connect ECONNREFUSED");
    expect(text).not.toContain("Stopped in");
  });

  it("a finished run says what it applied, or that there was nothing to do", () => {
    expect(describeMigrationSuccess([], 2)).toBe(
      "Nothing to apply. This database already has all 2 migrations."
    );
    expect(describeMigrationSuccess(sample, 2)).toBe(
      "Applied 2 migrations: 0000_first to 0001_second. This database now has all 2."
    );
    expect(describeMigrationSuccess(sample.slice(1), 2)).toBe(
      "Applied 1 migration: 0001_second. This database now has all 2."
    );
  });
});
