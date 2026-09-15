/**
 * Read a backup back out and prove it restores.
 *
 * ── Why this is not optional ────────────────────────────────────────────────
 * A backup that has been written but never read back is a hypothesis. This
 * project already has the scar: the first version of the dump produced a file
 * of exactly the right shape, the right size, with every table in it, that no
 * MySQL server would load — because mysql2 parses JSON columns into JavaScript
 * arrays and the driver's escaper expands an array into a comma-separated value
 * list. Every unit test passed. Only restoring it caught the problem.
 *
 * So this downloads what is actually in the bucket — not what we think we
 * uploaded — restores it into a scratch schema, and compares the result against
 * the manifest that run wrote about itself.
 *
 * ── It never touches the database it is verifying ───────────────────────────
 * The scratch server is passed separately and explicitly. Restoring a
 * production backup over production is a way to turn a backup tool into an
 * outage, so the scratch URL is required rather than defaulted, and the scratch
 * schema is created fresh and dropped afterwards.
 */
import { gunzipSync } from "node:zlib";
import mysql from "mysql2/promise";
import type { BackupTarget } from "./target";

export type VerifyResult = {
  ok: boolean;
  runId: string;
  /** What the manifest claimed. */
  claimed: { tables: number; rows: number } | null;
  /** What actually came back after restoring. */
  restored: { tables: number; rows: number } | null;
  /** The backup's own record of whether it succeeded. */
  manifestOk: boolean | null;
  /**
   * The run's own verdict: clean | partial | failed. Null for a manifest
   * written before the three-state change, which carried only `ok`.
   */
  manifestStatus: string | null;
  /** Per-table disagreements between manifest and restore. */
  mismatches: string[];
  errors: string[];
};

/** The newest run id in the bucket, or null if there are none. */
export function newestRunId(keys: string[]): string | null {
  const runs = new Set<string>();
  for (const key of keys) {
    const match = /^([^/]+)\/manifest\.json$/.exec(key);
    if (match) runs.add(match[1]);
  }
  // Run ids are ISO-ish and zero-padded, so lexical order is chronological.
  return Array.from(runs).sort().pop() ?? null;
}

export async function verifyBackup(options: {
  target: BackupTarget;
  /** A MySQL server to restore INTO. Must not be the one being backed up. */
  scratchDatabaseUrl: string;
  /** Which run to check. Defaults to the newest in the bucket. */
  runId?: string;
  scratchSchema?: string;
  onProgress?: (message: string) => void;
}): Promise<VerifyResult> {
  const say = options.onProgress ?? (() => {});
  const schema = options.scratchSchema ?? "bidrender_backup_verify";

  const result: VerifyResult = {
    ok: false,
    runId: options.runId ?? "",
    claimed: null,
    restored: null,
    manifestOk: null,
    manifestStatus: null,
    mismatches: [],
    errors: [],
  };

  try {
    let runId = options.runId;
    if (!runId) {
      say("Listing backups…");
      const found = newestRunId(await options.target.list(""));
      if (!found) {
        result.errors.push("No backups found in the bucket.");
        return result;
      }
      runId = found;
    }
    result.runId = runId;
    say(`Verifying ${runId}…`);

    const manifest = JSON.parse(
      (await options.target.get(`${runId}/manifest.json`)).toString("utf8")
    );
    result.manifestOk = Boolean(manifest.ok);
    result.manifestStatus =
      typeof manifest.status === "string" ? manifest.status : null;
    result.claimed = {
      tables: manifest.database?.tableCount ?? 0,
      rows: manifest.database?.rowCount ?? 0,
    };

    say("Downloading the dump…");
    const dumpGz = await options.target.get(`${runId}/database.sql.gz`);
    const sql = gunzipSync(dumpGz).toString("utf8");
    say(`  ${dumpGz.byteLength} bytes compressed, ${sql.length} uncompressed.`);

    const restored = await restoreInto(
      sql,
      options.scratchDatabaseUrl,
      schema,
      say
    );
    result.restored = { tables: restored.size, rows: sumOf(restored) };

    // Compare against what the backup said about itself, table by table.
    const claimedPerTable = new Map<string, number>(
      (manifest.database?.tables ?? []).map(
        (t: { table: string; rows: number }) => [t.table, t.rows]
      )
    );
    for (const [table, claimed] of Array.from(claimedPerTable.entries())) {
      const actual = restored.get(table);
      if (actual === undefined) {
        result.mismatches.push(`${table}: in manifest, missing after restore`);
      } else if (actual !== claimed) {
        result.mismatches.push(
          `${table}: manifest ${claimed}, restored ${actual}`
        );
      }
    }
    for (const table of Array.from(restored.keys())) {
      if (!claimedPerTable.has(table)) {
        result.mismatches.push(`${table}: restored but not in manifest`);
      }
    }

    result.ok = result.mismatches.length === 0 && result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

/** Load the dump into a fresh schema and count what landed. Drops it after. */
async function restoreInto(
  sql: string,
  scratchDatabaseUrl: string,
  schema: string,
  say: (message: string) => void
): Promise<Map<string, number>> {
  const connection = await mysql.createConnection({
    uri: scratchDatabaseUrl,
    multipleStatements: true,
  });

  try {
    say(`Restoring into \`${schema}\`…`);
    await connection.query(`DROP DATABASE IF EXISTS \`${schema}\``);
    await connection.query(`CREATE DATABASE \`${schema}\``);
    await connection.query(`USE \`${schema}\``);

    // If this throws, the backup is not restorable — the whole point.
    await connection.query(sql);

    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [schema]
    );

    const counts = new Map<string, number>();
    for (const row of tables) {
      const name = row.TABLE_NAME as string;
      const [countRows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM \`${schema}\`.\`${name}\``
      );
      counts.set(name, Number(countRows[0].n));
    }

    await connection.query(`DROP DATABASE \`${schema}\``);
    return counts;
  } finally {
    await connection.end();
  }
}

function sumOf(counts: Map<string, number>): number {
  let total = 0;
  counts.forEach(n => {
    total += n;
  });
  return total;
}

export function summariseVerify(result: VerifyResult): string {
  const lines = [
    result.ok
      ? `Backup VERIFIED — ${result.runId} restores cleanly`
      : `Backup NOT VERIFIED — ${result.runId}`,
  ];
  if (result.claimed && result.restored) {
    lines.push(
      `  manifest says: ${result.claimed.tables} tables, ${result.claimed.rows} rows`
    );
    lines.push(
      `  restored:      ${result.restored.tables} tables, ${result.restored.rows} rows`
    );
  }
  // A partial run is a different animal from a failed one, and this is the
  // tool someone reaches for to find out whether a bad-looking run is usable.
  if (result.manifestStatus === "partial") {
    lines.push(
      `  NOTE: this run was PARTIAL — the database dump is complete; some stored files could not be read. See the manifest for which.`
    );
  } else if (result.manifestOk === false) {
    lines.push(
      `  NOTE: this run reported failures when it was taken — the dump may be fine but files were missed.`
    );
  }
  for (const mismatch of result.mismatches)
    lines.push(`  MISMATCH: ${mismatch}`);
  for (const error of result.errors) lines.push(`  ERROR:    ${error}`);
  return lines.join("\n");
}
