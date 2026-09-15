/**
 * Every uploaded file the database points at — plan PDFs and company logos.
 *
 * ── The database only holds keys; the bytes are elsewhere ───────────────────
 * `bid_pdfs.storageKey` and friends are S3 object keys behind the Manus presign
 * proxy (references/deploying.md § 8). A SQL dump alone therefore backs up a
 * list of filenames whose contents live somewhere this project may lose access
 * to — which is precisely the risk this tool exists for. So the bytes get
 * copied, not referenced.
 *
 * ── Why the source columns are a hand-kept list ─────────────────────────────
 * There is no way to ask MySQL "which columns contain storage keys" — they are
 * ordinary varchars. So they are listed, and server/backup.test.ts scans
 * drizzle/schema.ts for column names that look like storage keys and fails if
 * one is not in this list. A new file-bearing column added next year breaks a
 * test instead of quietly going unbacked, which is the only version of this
 * that stays true.
 */
import mysql from "mysql2/promise";
import { mysqlConnection } from "../databaseConnection";

/** One place a storage key can be found. */
export type FileSource = {
  table: string;
  column: string;
  /** Why it exists, for anyone reading the manifest later. */
  note: string;
};

/**
 * Every column in the schema that holds a storage key.
 *
 * `pdfUrl` and `logoUrl` are deliberately absent: they are display paths
 * (`/manus-storage/<key>`) derived from the key beside them, not separate
 * objects. Backing both up would download every file twice.
 */
export const FILE_SOURCES: FileSource[] = [
  {
    table: "bid_pdfs",
    column: "storageKey",
    note: "Plan PDFs attached to a bid — the takeoff surface.",
  },
  {
    table: "projects",
    column: "pdfKey",
    note: "Legacy single-PDF-per-project, superseded by bid_pdfs but still holding files.",
  },
  {
    table: "company_branding",
    column: "logoKey",
    note: "Company logo used on proposals.",
  },
];

export type StoredFile = {
  key: string;
  table: string;
  column: string;
};

/**
 * Collect every distinct storage key currently referenced.
 *
 * Distinct because the legacy `projects.pdfKey` and a `bid_pdfs.storageKey` can
 * point at the same object after a migration, and downloading it twice wastes
 * the slowest part of the whole backup.
 *
 * A source table that does not exist is skipped with a warning rather than
 * throwing: this must keep working against an older database than the one it
 * was written for, because the day it is needed is not the day to be debugging
 * a missing table.
 */
export async function collectFiles(databaseUrl: string): Promise<{
  files: StoredFile[];
  warnings: string[];
}> {
  const connection = await mysql.createConnection(mysqlConnection(databaseUrl));
  const warnings: string[] = [];
  const seen = new Map<string, StoredFile>();

  try {
    const [existingRows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()`
    );
    const present = new Set(
      existingRows.map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)
    );

    for (const source of FILE_SOURCES) {
      if (!present.has(`${source.table}.${source.column}`)) {
        warnings.push(
          `${source.table}.${source.column} is not in this database — skipped.`
        );
        continue;
      }

      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT DISTINCT \`${source.column}\` AS k FROM \`${source.table}\`
          WHERE \`${source.column}\` IS NOT NULL AND \`${source.column}\` <> ''`
      );

      for (const row of rows) {
        const key = String(row.k).replace(/^\/+/, "");
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.set(key, { key, table: source.table, column: source.column });
      }
    }

    return { files: Array.from(seen.values()), warnings };
  } finally {
    await connection.end();
  }
}
