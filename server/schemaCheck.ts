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
 * ── Read-only. Presence, nullability, and the full column TYPE ───────────────
 * It checks that every declared column EXISTS, that it agrees with the schema
 * about whether it may be NULL, and that its type is the declared one —
 * including the width, the decimal precision and scale, and an enum's value
 * list. Both of the last two were added on 2026-09-25.
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
 * Nullability is drizzle's `column.notNull` against
 * `information_schema.COLUMNS.IS_NULLABLE`, a boolean on each side.
 *
 * ── Types: compared WHOLE, through one small table of MySQL's own aliases ───
 * The type is drizzle's `column.getSQLType()` — the DDL drizzle would write —
 * against `COLUMN_TYPE`, the DDL MySQL reports back. Not `DATA_TYPE`, which
 * drops the width: `varchar(255)` against `varchar(64)` reads as `varchar`
 * both times, and a width that shrank is how a long value starts failing.
 *
 * This was expected to be the noisy part, and measured on 2026-09-25 it is not:
 * across all 623 declared columns on MySQL 8.0 (local, test) and 8.4
 * (production), the two strings were identical except for ONE spelling —
 * `boolean`, which MySQL has no type for and stores as `tinyint(1)`. So the
 * equivalence handling is a short explicit list (`normalizeColumnType`), not a
 * type-mapping layer. Anything not on the list is compared literally, so an
 * unrecognised spelling reports drift rather than hiding it.
 *
 * What the list covers, and why each entry is an alias rather than a change:
 *   • `boolean` / `bool`  -> `tinyint`  — MySQL stores both as tinyint(1).
 *   • `integer`           -> `int`      — the same type, two names.
 *   • integer DISPLAY widths are dropped (`int(11)` -> `int`). They are a
 *     formatting hint, not storage; MySQL 8.0.19+ no longer prints them but
 *     5.7 and MariaDB do, so the same column would otherwise read as drift on
 *     one server and not another.
 *   • keyword case and spacing — never an enum's VALUES, whose case is data:
 *     `'Won'` and `'won'` are different values and must read as drift.
 *
 * Nothing here is Postgres-shaped: this app runs MySQL only, so Postgres
 * aliases (`int4`, `character varying`) cannot appear and are not listed.
 *
 * Still not compared: defaults, character set and collation, and auto-
 * increment. Round-tripping real values covers what the type cannot say, and
 * that belongs in the feature's own test (see server/bidArchive.test.ts).
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

/**
 * A column that exists on both sides with a different type.
 *
 * The strings are shown as each side spells them, not normalised, so the
 * message reads as the DDL somebody would go and look for.
 */
export type TypeDrift = {
  column: string;
  /** drizzle's DDL for it, e.g. `varchar(255)`. */
  schemaType: string;
  /** information_schema's COLUMN_TYPE, e.g. `text`. */
  databaseType: string;
};

export type TableDrift = {
  table: string;
  /** True when the table itself is absent, not merely some of its columns. */
  missingTable: boolean;
  missingColumns: string[];
  /** Columns present on both sides that disagree about NULL. */
  nullability: NullabilityDrift[];
  /** Columns present on both sides with a different type (width included). */
  types: TypeDrift[];
};

/** A declared table: its name, and each column's nullability and type. */
export type DeclaredTable = {
  name: string;
  columns: Array<{ name: string; nullable: boolean; type: string }>;
};

/** One row of information_schema.COLUMNS — as much of it as this reads. */
export type LiveColumn = {
  COLUMN_NAME: string;
  IS_NULLABLE: string;
  COLUMN_TYPE: string;
};

/**
 * One spelling for two names of the same MySQL type. See the header for the
 * measurement behind this list and why it is this short.
 *
 * The keyword is lower-cased and the rest left alone: inside `enum(...)` and
 * `set(...)` the quoted values are data, and their case is part of it.
 */
export function normalizeColumnType(type: string): string {
  let text = String(type).trim().replace(/\s+/g, " ");
  const open = text.indexOf("(");
  const keyword = (open === -1 ? text : text.slice(0, open)).toLowerCase();
  const rest = open === -1 ? "" : text.slice(open);
  text = keyword.trim() + rest;

  if (keyword === "boolean" || keyword === "bool") return "tinyint";
  if (keyword === "integer") text = "int" + rest;

  // Integer display widths are formatting, not storage. `unsigned` and
  // `zerofill` after the width ARE storage, so they are kept.
  const integer = /^(tinyint|smallint|mediumint|int|bigint)\(\d+\)(.*)$/i.exec(
    text
  );
  if (integer) text = integer[1].toLowerCase() + integer[2].toLowerCase();
  return text;
}

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
      types: [],
    };
  }

  const liveByName = new Map(live.map(row => [row.COLUMN_NAME, row]));
  const missingColumns: string[] = [];
  const nullability: NullabilityDrift[] = [];
  const types: TypeDrift[] = [];
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
    if (
      normalizeColumnType(column.type) !== normalizeColumnType(row.COLUMN_TYPE)
    ) {
      types.push({
        column: column.name,
        schemaType: column.type,
        databaseType: String(row.COLUMN_TYPE),
      });
    }
  }

  if (
    missingColumns.length === 0 &&
    nullability.length === 0 &&
    types.length === 0
  )
    return null;
  return {
    table: declared.name,
    missingTable: false,
    missingColumns,
    nullability,
    types,
  };
}

/** Every table drizzle declares, with each column's name, nullability, type. */
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
        // The DDL drizzle would write for it, e.g. `decimal(12,4)`.
        type: column.getSQLType(),
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
      sql`SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS
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
    for (const column of entry.types) {
      lines.push(
        `  ${entry.table}.${column.column} — schema ${column.schemaType}, ` +
          `database ${column.databaseType}`
      );
    }
  }
  return [
    `This database disagrees with the code in ${drift.length} table(s):`,
    ...lines,
    "",
    "Run `pnpm db:push` against it. Until then, any screen whose query",
    "touches a missing column fails outright, a column the database holds",
    "NOT NULL refuses a NULL the code writes, and a narrower type truncates",
    "or refuses what the code sends — see server/schemaCheck.ts.",
  ].join("\n");
}
