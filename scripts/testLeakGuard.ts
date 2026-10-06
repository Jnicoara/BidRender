/**
 * A TEST FILE MAY NOT LEAVE SHARED ROWS BEHIND FOR ANOTHER TO TRIP OVER.
 *
 * ── What happened (2026-09-29, plan T1/T2) ───────────────────────────────────
 * `takeoffBridgeFlow.test.ts` inserts a SHARED assembly (userId NULL — every
 * company sees it) and deleted it on the last line of the test. A run failed
 * before that line, the row stayed, and the next run's `assemblies.test.ts`
 * — which runs BEFORE that file — found a shipped assembly with no materials
 * and failed, for a reason nothing in it could explain. The heal by name in
 * that file's `beforeEach` came one file too late.
 *
 * The file is fixed (onTestFinished). This is the net under the next one:
 * vitest.setup.ts records the shared rows before each FILE and fails the file
 * that leaves a new one — named, in that file, at the time it happened, not
 * as a mystery in whichever suite reads the table next.
 *
 * ── What counts ──────────────────────────────────────────────────────────────
 * A shared row that did not exist before the file ran AND whose name is not
 * shipped. Seeders legitimately add shipped rows (a fresh database, or a test
 * that seeds), so a shipped name is never a leak. The six tables are the
 * library ones — where a stray shared row changes what every company is shown.
 *
 * ── User-owned rows are MEASURED, not failed (owner, Q5) ─────────────────────
 * Measured 2026-09-29 after a clean full run: 121 users, 4,242 bids and more
 * left behind — none crossing files today, since fixture ids are distinct.
 * `countRowsByTable` gives a per-file before/after when TEST_LEAK_REPORT names
 * a file to append to; fixing those is its own change.
 */
import mysql from "mysql2/promise";

/** The shared library tables, and the column that names a row in each. */
export const SHARED_TABLES = [
  { table: "materials", label: "name" },
  { table: "assemblies", label: "name" },
  { table: "kits", label: "name" },
  { table: "labor_rates", label: "name" },
  { table: "modifiers", label: "name" },
  { table: "takeoff_run_types", label: "label" },
] as const;

export type SharedTable = (typeof SHARED_TABLES)[number]["table"];
export type SharedRow = { table: SharedTable; id: number; name: string };

/** Every shared (userId NULL) row in the library tables. */
export async function readSharedRows(url: string): Promise<SharedRow[]> {
  const connection = await mysql.createConnection({ uri: url });
  try {
    const rows: SharedRow[] = [];
    for (const { table, label } of SHARED_TABLES) {
      const [found] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT id, \`${label}\` AS name FROM \`${table}\` WHERE userId IS NULL`
      );
      for (const r of found) {
        rows.push({ table, id: Number(r.id), name: String(r.name) });
      }
    }
    return rows;
  } finally {
    await connection.end();
  }
}

/**
 * The shared rows a file left behind: new since `before`, and not shipped.
 * Pure, so the rule is tested without a database.
 */
export function leakedSharedRows(
  before: readonly SharedRow[],
  after: readonly SharedRow[],
  shipped: ReadonlyMap<SharedTable, ReadonlySet<string>>
): SharedRow[] {
  const had = new Set(before.map(r => `${r.table}:${r.id}`));
  return after.filter(
    r => !had.has(`${r.table}:${r.id}`) && !shipped.get(r.table)?.has(r.name)
  );
}

export function describeLeaks(
  file: string,
  rows: readonly SharedRow[]
): string {
  return (
    `${file} left ${rows.length} SHARED row(s) behind (userId NULL — every ` +
    `company sees them, and other suites read them):\n` +
    rows.map(r => `  ${r.table} #${r.id} "${r.name}"`).join("\n") +
    `\nDelete what the file inserts in onTestFinished or afterAll, so a ` +
    `failing test cleans up too. See scripts/testLeakGuard.ts.`
  );
}

/**
 * Row count of every table with a userId column — for the per-file
 * measurement (report mode only; see the header).
 */
export async function countRowsByTable(
  url: string
): Promise<Record<string, number>> {
  const connection = await mysql.createConnection({ uri: url });
  try {
    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'userId'`
    );
    const counts: Record<string, number> = {};
    for (const { t } of tables) {
      const [r] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM \`${t}\``
      );
      counts[String(t)] = Number(r[0].n);
    }
    const [users] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM users"
    );
    counts.users = Number(users[0].n);
    return counts;
  } finally {
    await connection.end();
  }
}

/** after − before, only the tables that changed. */
export function rowCountDelta(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const table of Object.keys(after)) {
    const d = after[table] - (before[table] ?? 0);
    if (d !== 0) delta[table] = d;
  }
  return delta;
}
