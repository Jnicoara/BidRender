/**
 * Does the database this process is talking to actually have the columns the
 * code expects?
 *
 * ── The failure this exists to catch ─────────────────────────────────────────
 * Almost every read in this app is a bare `db.select().from(table)`, which
 * drizzle expands to EVERY column declared in drizzle/schema.ts. So a database
 * that is one migration behind does not lose one field — the whole statement
 * fails with `Unknown column`, and the screen behind it dies.
 *
 * That is exactly what happened to the bid archive: `getArchivedBids` names
 * `isSample` (migration 0043) and the four tax columns (0036) whether or not
 * any bid uses them, so on an environment that had not run those, opening the
 * archive threw. Nothing was wrong with the query.
 *
 * ── Why this is a separate check and not a guard on each query ───────────────
 * The tempting fix is to make the failing query defensive — select fewer
 * columns, or catch and degrade. Both are worse: they turn a loud, accurate
 * error into a screen that quietly shows incomplete data, which is precisely
 * the failure mode CLAUDE.md's deploy section warns about ("it starts, serves
 * pages and shows wrong data, which is the expensive way to find out"). The
 * error is correct. What was missing was a way to ask the question directly.
 *
 * ── Read-only. Presence AND nullability; still nothing about types ───────────
 * It checks that every declared column EXISTS, and — since 2026-09-25 — that
 * it agrees with the schema about whether it may be NULL.
 *
 * Nullability was added because presence alone passed a real gap. Before
 * migrations 0074/0075 ran, production reported "Database matches the schema."
 * while `bid_line_items.snapshotMaterialCost` and `snapshotLaborHours` were
 * still NOT NULL — and the code about to ship inserts NULL into both the
 * moment a free count is sent to a bid. The one check whose job was "is this
 * database ready for this code" said yes, to a deploy that would have failed
 * on the first send. A migration that only MODIFYs a column is invisible to a
 * presence check before AND after, so presence alone proves nothing there.
 *
 * Nullability is cheap to compare exactly: drizzle's `column.notNull` against
 * `information_schema.COLUMNS.IS_NULLABLE`, a boolean on each side with no
 * type mapping in between. Width and type are still NOT compared — that means
 * translating drizzle's types into MySQL's spelling of them, a much bigger job
 * with a much worse false-positive rate. Round-tripping real values covers
 * those, and that belongs in the feature's own test (see
 * server/bidArchive.test.ts).
 */
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";
import { getDb } from "./db";

/**
 * A column that exists on both sides and disagrees about NULL.
 *
 * Both directions are drift, and they fail differently:
 *   • schema allows NULL, database NOT NULL — the code may write NULL and the
 *     database refuses it, so an insert fails. The 0074/0075 case.
 *   • schema NOT NULL, database allows NULL — the database can hand back a NULL
 *     the code's types say cannot exist, which surfaces as a wrong number
 *     (`Number(null)` is 0) rather than as an error.
 */
export type NullabilityDrift = {
  column: string;
  /** What drizzle/schema.ts declares. */
  schemaNullable: boolean;
  /** What information_schema says this database has. */
  databaseNullable: boolean;
};

export type TableDrift = {
  table: string;
  /** True when the table itself is absent, not merely some of its columns. */
  missingTable: boolean;
  missingColumns: string[];
  /** Columns present on both sides that disagree about NULL. */
  nullability: NullabilityDrift[];
};

/** A declared table: its name, and each column with whether it may be NULL. */
export type DeclaredTable = {
  name: string;
  columns: Array<{ name: string; nullable: boolean }>;
};

/** One row of information_schema.COLUMNS — as much of it as this reads. */
export type LiveColumn = { COLUMN_NAME: string; IS_NULLABLE: string };

/**
 * Compare one declared table with what the database has.
 *
 * Pure, so the suite can reach it without a database in the broken state it
 * describes. Null when they agree. A missing column is reported as missing and
 * NOT also as a nullability disagreement — there is nothing there to disagree.
 */
export function compareTable(
  declared: DeclaredTable,
  live: readonly LiveColumn[]
): TableDrift | null {
  if (live.length === 0) {
    return {
      table: declared.name,
      missingTable: true,
      missingColumns: declared.columns.map(column => column.name),
      nullability: [],
    };
  }

  const liveByName = new Map(live.map(row => [row.COLUMN_NAME, row]));
  const missingColumns: string[] = [];
  const nullability: NullabilityDrift[] = [];
  for (const column of declared.columns) {
    const row = liveByName.get(column.name);
    if (!row) {
      missingColumns.push(column.name);
      continue;
    }
    // information_schema spells it "YES" / "NO". Anything else reads as NO,
    // the direction that reports drift rather than hiding it.
    const databaseNullable = String(row.IS_NULLABLE).toUpperCase() === "YES";
    if (databaseNullable !== column.nullable) {
      nullability.push({
        column: column.name,
        schemaNullable: column.nullable,
        databaseNullable,
      });
    }
  }

  if (missingColumns.length === 0 && nullability.length === 0) return null;
  return {
    table: declared.name,
    missingTable: false,
    missingColumns,
    nullability,
  };
}

/** Every table drizzle declares, with each column's name and nullability. */
export function declaredTables(): DeclaredTable[] {
  const tables: DeclaredTable[] = [];
  for (const value of Object.values(schema)) {
    if (typeof value !== "object" || value === null) continue;
    let config;
    try {
      config = getTableConfig(value as never);
    } catch {
      // Not a table — the module also exports enums, types and constants.
      continue;
    }
    tables.push({
      name: config.name,
      columns: config.columns.map(column => ({
        name: column.name,
        // drizzle marks a primary key notNull too, which matches MySQL.
        nullable: !column.notNull,
      })),
    });
  }
  return tables;
}

/**
 * What the code expects and the database does not have.
 *
 * Returns an empty array when they agree. One query per table against
 * `information_schema`, which is cheap and read-only — this is a diagnostic,
 * not something on a request path.
 */
export async function findSchemaDrift(): Promise<TableDrift[]> {
  const db = await getDb();
  if (!db) throw new Error("No database connection — is DATABASE_URL set?");

  const drift: TableDrift[] = [];
  for (const table of declaredTables()) {
    const [rows] = (await db.execute(
      sql`SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table.name}`
    )) as unknown as [LiveColumn[]];

    const entry = compareTable(table, rows);
    if (entry) drift.push(entry);
  }
  return drift;
}

/** How many migrations this database believes it has run. */
export async function appliedMigrationCount(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM __drizzle_migrations`
    )) as unknown as [Array<{ n: number | string }>];
    return Number(rows[0]?.n ?? 0);
  } catch {
    // The table is absent on a database that has never been migrated at all,
    // which is a legitimate answer rather than an error.
    return null;
  }
}

/** The drift as something a person reads and can act on. */
export function describeDrift(drift: readonly TableDrift[]): string {
  if (drift.length === 0) return "Database matches the schema.";
  const lines: string[] = [];
  for (const entry of drift) {
    if (entry.missingTable) {
      lines.push(`  ${entry.table} — table missing entirely`);
      continue;
    }
    if (entry.missingColumns.length > 0) {
      lines.push(
        `  ${entry.table} — missing ${entry.missingColumns.join(", ")}`
      );
    }
    for (const column of entry.nullability) {
      const said = (nullable: boolean) =>
        nullable ? "allows NULL" : "NOT NULL";
      lines.push(
        `  ${entry.table}.${column.column} — schema ${said(column.schemaNullable)}, ` +
          `database ${said(column.databaseNullable)}`
      );
    }
  }
  return [
    `This database disagrees with the code in ${drift.length} table(s):`,
    ...lines,
    "",
    "Run `pnpm db:push` against it. Until then, any screen whose query",
    "touches a missing column fails outright, and a column the database holds",
    "NOT NULL refuses a NULL the code writes — see server/schemaCheck.ts.",
  ].join("\n");
}
