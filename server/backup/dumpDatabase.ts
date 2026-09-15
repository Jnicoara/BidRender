/**
 * A full, restorable SQL dump of every table in the database.
 *
 * ── The tables come from the DATABASE, not from drizzle/schema.ts ───────────
 * This is the single most important decision in the file. Enumerating from the
 * TypeScript schema would back up exactly the tables somebody remembered to
 * declare — and would silently miss `__drizzle_migrations`, anything created by
 * a hand-written migration, and anything added by a future feature whose schema
 * import got forgotten. `information_schema` knows what is actually there, so
 * the dump is complete by construction rather than by diligence.
 *
 * server/backup.test.ts asserts the dumped table list equals the live table
 * list, so a skipped table fails a test rather than being discovered during a
 * restore.
 *
 * ── Portable, not clever ────────────────────────────────────────────────────
 * Plain `DROP TABLE` + `CREATE TABLE` + `INSERT`, the format `mysql <` eats
 * without argument. No mysqldump binary is required — it is not present on
 * Cloud Run and would not be on whatever machine is running this in a hurry.
 *
 * ── Assumption worth knowing ────────────────────────────────────────────────
 * Each table is read whole, into memory. For this app — one contractor, a few
 * hundred materials, a few thousand rows at the outside — that is fine and much
 * simpler than paging. If a table ever reaches millions of rows this needs
 * revisiting; `LARGE_TABLE_WARNING` below makes that visible in the report
 * rather than letting it become an out-of-memory crash nobody predicted.
 */
import mysql from "mysql2/promise";
import { mysqlConnection } from "../databaseConnection";

/** Rows per INSERT statement. Large enough to be fast, small enough to read. */
const ROWS_PER_INSERT = 200;

/** A table above this size is reported, because the whole-table read is an assumption. */
export const LARGE_TABLE_WARNING = 250_000;

export type TableDump = {
  table: string;
  rows: number;
};

export type DumpResult = {
  /** The finished dump, ready to write. */
  sql: string;
  /** Every table found, with its row count. */
  tables: TableDump[];
  /** Non-fatal things worth saying out loud in the report. */
  warnings: string[];
};

/**
 * Turn one column value into a SQL literal.
 *
 * ── The JSON trap ───────────────────────────────────────────────────────────
 * The driver's `escape()` is the right tool for strings, numbers, NULL and
 * Buffers — but mysql2 parses JSON columns into real JavaScript values before
 * we ever see them, and `escape()` treats an array as a LIST of values and an
 * object as a SET clause. So `takeoff_runs.points`, a JSON array of vertices,
 * came out as `(1, 2), (3, 4)` spliced into the middle of the row instead of
 * one quoted string, and the dump would not parse.
 *
 * That produced a file of exactly the right shape that no server would load —
 * the worst possible failure for a backup, because it looks like success until
 * the day it is needed. It was invisible to every unit test here and was caught
 * only by restoring the dump into a scratch database, which is why that check
 * is part of verifying this tool rather than an optional extra.
 *
 * Order matters below: Buffer and Date are objects too, and both have escapes
 * of their own that must win before the JSON branch.
 */
function encodeValue(connection: mysql.Connection, value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return connection.escape(value);
  if (value instanceof Date) return connection.escape(value);
  if (typeof value === "object") {
    // A JSON column. Serialise it back to the text MySQL will re-parse on the
    // way in, then escape that as an ordinary string.
    return connection.escape(JSON.stringify(value));
  }
  return connection.escape(value);
}

/**
 * Dump every base table in the connected database.
 *
 * Views are excluded (TABLE_TYPE filter) because a view has no rows of its own
 * and its definition is recreated by whatever migration made it — dumping one
 * as a table would produce a restore that fails.
 */
export async function dumpDatabase(databaseUrl: string): Promise<DumpResult> {
  const connection = await mysql.createConnection({
    ...mysqlConnection(databaseUrl),
    // Dates as the strings MySQL stores, not JS Date objects. A Date would be
    // re-serialised through the connection's timezone on the way out, which
    // silently shifts every timestamp in the backup by the offset between the
    // machine that dumped it and the machine that restores it.
    dateStrings: true,
    // Big integers as strings, so a bigint id does not lose its last digits to
    // JavaScript's 53-bit float.
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    const [dbRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT DATABASE() AS db"
    );
    const databaseName = dbRows[0]?.db as string;

    const [tableRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`
    );
    const tableNames = tableRows.map(r => r.TABLE_NAME as string);

    const warnings: string[] = [];
    const parts: string[] = [];
    const tables: TableDump[] = [];

    parts.push(
      [
        `-- BidRender database backup`,
        `-- database: ${databaseName}`,
        `-- taken:    ${new Date().toISOString()}`,
        `-- tables:   ${tableNames.length}`,
        `--`,
        `-- Restore with:  mysql -u USER -p DBNAME < database.sql`,
        ``,
        `SET NAMES utf8mb4;`,
        `SET FOREIGN_KEY_CHECKS = 0;`,
        // Without this a restore is bounded by the server's default packet
        // size, and a wide row in a batched INSERT trips it.
        `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';`,
        ``,
      ].join("\n")
    );

    for (const table of tableNames) {
      const quoted = `\`${table.replace(/`/g, "``")}\``;

      const [createRows] = await connection.query<mysql.RowDataPacket[]>(
        `SHOW CREATE TABLE ${quoted}`
      );
      const ddl = createRows[0]?.["Create Table"] as string;

      parts.push(`\n--\n-- Table: ${table}\n--\n`);
      parts.push(`DROP TABLE IF EXISTS ${quoted};\n`);
      parts.push(`${ddl};\n`);

      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT * FROM ${quoted}`
      );

      tables.push({ table, rows: rows.length });

      if (rows.length > LARGE_TABLE_WARNING) {
        warnings.push(
          `${table} has ${rows.length} rows; the dump reads whole tables into memory and should be moved to paged reads.`
        );
      }

      // An empty table is normal, not an error: it still gets its CREATE TABLE
      // above, so a restore reproduces the schema exactly. Emitting a bare
      // `INSERT INTO x VALUES;` here would produce a dump that fails to load.
      if (rows.length === 0) {
        parts.push(`-- (no rows)\n`);
        continue;
      }

      const columns = Object.keys(rows[0])
        .map(c => `\`${c.replace(/`/g, "``")}\``)
        .join(", ");

      for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
        const batch = rows.slice(i, i + ROWS_PER_INSERT);
        const values = batch
          .map(
            row =>
              `(${Object.values(row)
                .map(value => encodeValue(connection, value))
                .join(", ")})`
          )
          .join(",\n  ");
        parts.push(`INSERT INTO ${quoted} (${columns}) VALUES\n  ${values};\n`);
      }
    }

    parts.push(`\nSET FOREIGN_KEY_CHECKS = 1;\n`);

    return { sql: parts.join(""), tables, warnings };
  } finally {
    await connection.end();
  }
}

/**
 * Every base table the database currently has.
 *
 * Exported so the test can compare the dump against the live list without
 * re-implementing the query — if this is wrong, both are wrong together and the
 * test would pass while backing up nothing, so the test asks the dump for its
 * table list and asks MySQL separately.
 */
export async function listTables(databaseUrl: string): Promise<string[]> {
  const connection = await mysql.createConnection(mysqlConnection(databaseUrl));
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`
    );
    return rows.map(r => r.TABLE_NAME as string);
  } finally {
    await connection.end();
  }
}
