/**
 * Run a backup: dump the database, copy every stored file, write a manifest.
 *
 * ── It reports; it does not throw ───────────────────────────────────────────
 * Every path returns a BackupReport carrying a `status`. A backup tool that
 * throws on the third of two hundred PDFs has thrown away the other 197 and
 * told you only about the one — and one that swallows the failure is worse
 * still, because it prints "done" over a backup with a hole in it. So a file
 * that cannot be fetched is recorded as a failure, the rest continue, and the
 * run ends `partial` rather than `clean`. The manifest that lands in R2 carries
 * the same failures, so the record of what went wrong sits next to the data
 * itself rather than in a terminal someone has closed.
 *
 * The one exception is the destination being unreachable, which is checked
 * first and stops everything: there is no point reading a database for an hour
 * to write it nowhere.
 *
 * ── Layout in the bucket ────────────────────────────────────────────────────
 *   <prefix>/<timestamp>/manifest.json
 *   <prefix>/<timestamp>/database.sql.gz
 *   <prefix>/<timestamp>/files/<original storage key>
 *
 * Timestamped rather than overwritten, so a backup taken after something has
 * already gone wrong cannot destroy the good one before it.
 */
import { gzipSync } from "node:zlib";
import { APP_VERSION } from "../../shared/version";
import { collectFiles, FILE_SOURCES } from "./collectFiles";
import { dumpDatabase, type TableDump } from "./dumpDatabase";
import type { BackupTarget } from "./target";
import { defaultFileSource, type FileStreamSource } from "./planFileSource";

export type FileFailure = { key: string; reason: string };

/**
 * How a run ended. Three states, because two could not tell the difference
 * between "the database is safe and some files were unreadable" and "there is
 * no backup".
 *
 * ── Why "partial" is not just a nicer word for failed ────────────────────────
 * The two differ in the only way that matters operationally: whether trying
 * again helps. A destination timeout or a half-written dump is worth retrying.
 * A storage read that comes back 403 is deterministic — it will be 403 on the
 * second and third attempt too, and the platform retries a failing scheduled
 * call three times, so reporting a permanent condition as "failed" buys three
 * full database dumps a night and no better outcome.
 *
 * The cost of getting this wrong in the other direction is worse, which is why
 * partial is NOT success: the stored files are the half of this that cannot be
 * rebuilt from anywhere else (see references/backups.md § 1). So partial keeps
 * every failed key in the manifest, prints them, and never reports as clean.
 * `ok` stays true only for a completely clean run, and every existing caller
 * that reads it keeps its old strictness.
 */
export type BackupStatus = "clean" | "partial" | "failed";

export type BackupReport = {
  /** True only for a completely clean run. Unchanged meaning; see status. */
  ok: boolean;
  /** clean | partial | failed — see BackupStatus. */
  status: BackupStatus;
  /** Folder this run wrote to, under the target's prefix. */
  runId: string;
  target: string;
  startedAt: string;
  finishedAt: string;
  appVersion: string;
  database: {
    tables: TableDump[];
    tableCount: number;
    rowCount: number;
    /** Size of the compressed dump actually uploaded. */
    dumpBytes: number;
  } | null;
  files: {
    found: number;
    copied: number;
    bytes: number;
    failed: FileFailure[];
  };
  /** Non-fatal notes — skipped columns, oversized tables. */
  warnings: string[];
  /** What stopped it, when something did. */
  errors: string[];
};

/**
 * How the bytes of a stored file are read.
 *
 * A parameter rather than an import, so the tests can run the whole pipeline
 * without a network or a credential — see server/backup/planFileSource.ts for
 * the R2 and Manus implementations.
 *
 * It yields a STREAM rather than a Buffer, and that is the point: the previous
 * shape pulled each file fully into memory before uploading it, which was fine
 * at 20MB a plan and untenable once the limit became 2GB. A nightly job that
 * allocates 2GB on a small instance is a nightly job that gets killed, and a
 * backup that gets killed is no backup.
 */
export type { FileStreamSource };

/** `2026-08-13T22-41-07Z` — sorts chronologically, legal in an object key. */
export function runIdFor(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-");
}

export async function runBackup(options: {
  databaseUrl: string;
  target: BackupTarget;
  fileSource?: FileStreamSource;
  /** Injected so the run id is testable; defaults to now. */
  now?: Date;
  /** Called after each step, for the CLI's progress output. */
  onProgress?: (message: string) => void;
}): Promise<BackupReport> {
  const now = options.now ?? new Date();
  const fileSource = options.fileSource ?? defaultFileSource();
  const say = options.onProgress ?? (() => {});
  const runId = runIdFor(now);
  const startedAt = now.toISOString();

  const report: BackupReport = {
    ok: false,
    status: "failed",
    runId,
    target: options.target.name,
    startedAt,
    finishedAt: startedAt,
    appVersion: APP_VERSION,
    database: null,
    files: { found: 0, copied: 0, bytes: 0, failed: [] },
    warnings: [],
    errors: [],
  };

  const finish = (): BackupReport => {
    report.finishedAt = new Date().toISOString();
    // An error is anything that stopped a whole stage — the destination, the
    // dump, the file listing, the manifest. Those mean "no usable backup".
    // A failed FILE is narrower: the database is already uploaded by then, so
    // the run has produced something worth keeping.
    if (report.errors.length > 0 || !report.database) {
      report.status = "failed";
    } else if (report.files.failed.length > 0) {
      report.status = "partial";
    } else {
      report.status = "clean";
    }
    report.ok = report.status === "clean";
    return report;
  };

  // 1. Prove we can write before spending anything reading.
  try {
    say(`Checking ${options.target.name}…`);
    await options.target.check();
  } catch (error) {
    report.errors.push(
      `Backup destination unreachable: ${message(error)}. Nothing was read.`
    );
    return finish();
  }

  // 2. The database.
  try {
    say("Dumping database…");
    const dump = await dumpDatabase(options.databaseUrl);
    report.warnings.push(...dump.warnings);

    const compressed = gzipSync(Buffer.from(dump.sql, "utf8"));
    await options.target.put(
      `${runId}/database.sql.gz`,
      compressed,
      "application/gzip"
    );

    report.database = {
      tables: dump.tables,
      tableCount: dump.tables.length,
      rowCount: dump.tables.reduce((sum, t) => sum + t.rows, 0),
      dumpBytes: compressed.byteLength,
    };
    say(
      `Database: ${dump.tables.length} tables, ${report.database.rowCount} rows, ${compressed.byteLength} bytes compressed.`
    );
  } catch (error) {
    // Fatal: a backup without the database is not a backup. Say so and stop,
    // rather than continuing to copy files and reporting a cheerful total.
    report.errors.push(`Database dump failed: ${message(error)}`);
    await writeManifest(options.target, runId, report).catch(() => {});
    return finish();
  }

  // 3. The files. One failure here does not stop the rest.
  try {
    const { files, warnings } = await collectFiles(options.databaseUrl);
    report.warnings.push(...warnings);
    report.files.found = files.length;
    say(`Copying ${files.length} stored files…`);

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      try {
        // Streamed straight through: opened at the source, handed to the
        // destination's multipart uploader, never assembled in memory here.
        const { body, contentLength } = await fileSource.open(file.key);
        await options.target.putStream(
          `${runId}/files/${file.key}`,
          body,
          "application/octet-stream",
          contentLength
        );
        report.files.copied += 1;
        // From the source's own Content-Length. Counting the bytes as they
        // passed would mean holding or tapping the stream, and the figure is
        // for a report rather than for verification — the verifier reads the
        // objects back (scripts/verifyBackup.mts).
        report.files.bytes += contentLength ?? 0;
      } catch (error) {
        report.files.failed.push({ key: file.key, reason: message(error) });
      }
      if ((index + 1) % 25 === 0) say(`  …${index + 1}/${files.length}`);
    }
    say(`Files: ${report.files.copied}/${files.length} copied.`);
  } catch (error) {
    report.errors.push(`File collection failed: ${message(error)}`);
  }

  // 4. The manifest, last, so it describes what actually happened.
  const finished = finish();
  try {
    await writeManifest(options.target, runId, finished);
  } catch (error) {
    // Failed outright, whatever else went right: a run nothing can find or
    // verify is not a backup, and the retry should get a real attempt.
    finished.errors.push(`Manifest upload failed: ${message(error)}`);
    finished.status = "failed";
    finished.ok = false;
  }

  return finished;
}

async function writeManifest(
  target: BackupTarget,
  runId: string,
  report: BackupReport
): Promise<void> {
  const manifest = {
    ...report,
    fileSources: FILE_SOURCES,
  };
  await target.put(
    `${runId}/manifest.json`,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json"
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One-screen summary for a terminal or a toast. */
export function summarise(report: BackupReport): string {
  const headline: Record<BackupStatus, string> = {
    clean: `Backup OK — ${report.runId}`,
    // Names the shortfall in the first line. "PARTIAL" on its own would be read
    // as a synonym for OK by anyone skimming a log at 2am.
    partial: `Backup PARTIAL — ${report.runId} — database safe, ${report.files.failed.length} file(s) unreadable`,
    failed: `Backup FAILED — ${report.runId}`,
  };
  // Derived rather than indexed blindly: a manifest written before `status`
  // existed carries only `ok`, and this function is the one someone points at a
  // run to find out what happened. An unknown status must not produce a blank
  // first line on the tool you reach for when something has gone wrong.
  const status: BackupStatus =
    report.status === "clean" ||
    report.status === "partial" ||
    report.status === "failed"
      ? report.status
      : report.ok
        ? "clean"
        : "failed";
  const lines = [headline[status], `  destination: ${report.target}`];
  if (report.database) {
    lines.push(
      `  database:    ${report.database.tableCount} tables, ${report.database.rowCount} rows, ${kb(report.database.dumpBytes)} gzipped`
    );
  } else {
    lines.push(`  database:    NOT BACKED UP`);
  }
  lines.push(
    `  files:       ${report.files.copied}/${report.files.found} copied, ${kb(report.files.bytes)}`
  );
  for (const warning of report.warnings)
    lines.push(`  warning:     ${warning}`);
  for (const failure of report.files.failed) {
    lines.push(`  FAILED FILE: ${failure.key} — ${failure.reason}`);
  }
  for (const error of report.errors) lines.push(`  ERROR:       ${error}`);
  return lines.join("\n");
}

function kb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
