/**
 * The nightly backup to Cloudflare R2.
 *
 * ── Why an outside caller rather than a timer ────────────────────────────────
 * `setInterval` / `node-cron` are forbidden here (CLAUDE.md § Scheduled work,
 * references/periodic-updates.md): a hosted app's instances are stopped and
 * replaced, so an in-process timer dies with the instance and takes the
 * guarantee with it. A backup that silently stopped running months ago is the
 * exact failure this whole tool exists to prevent, so it cannot be scheduled by
 * anything that lives inside a process.
 *
 * ── Registering it (a deploy-time step, not a code step) ─────────────────────
 * The handler below is only half the job. The other half is the Cloudflare
 * Worker in workers/cron/, deployed once with `wrangler deploy`, which holds
 * the same CRON_SECRET and POSTs here on a schedule.
 *
 * UNTIL THAT WORKER IS DEPLOYED, NOTHING IS BACKED UP AUTOMATICALLY. The manual
 * trigger keeps working throughout (scripts/backup.mts), which is the safe
 * direction for the failure to point: a missing cron means backups must be
 * taken by hand, not that they silently appear to be happening. And the app
 * says so on its own — see `backup.health`, which goes by how long it has been
 * since a backup actually succeeded rather than by whether anything reported a
 * failure. A cron that was never registered reports nothing at all.
 *
 * ── Why 02:00 UTC ───────────────────────────────────────────────────────────
 * Daily, because the data is one contractor's working day and an hourly export
 * of the same few thousand rows is cost without benefit.
 *
 * 02:00 specifically, because purgeArchivedBids runs at 03:30 and permanently
 * destroys bids whose 30-day archive has closed. Backing up first means the
 * night's export still contains what the purge is about to remove — so a purge
 * that fires on the wrong row is recoverable for at least a day. Reverse the
 * order and the backup would faithfully record the deletion.
 *
 * ── Idempotence ──────────────────────────────────────────────────────────────
 * The Worker retries a 5xx. A full backup is not cheap, so retrying blindly
 * would mean several complete exports after one timeout. Instead the run checks
 * the bucket first: if a SUCCESSFUL backup already exists for today it returns
 * 200 having done nothing. A failed or half-finished run leaves no successful
 * manifest, so the retry does the work — which is what a retry is for.
 */
import type { Request, Response } from "express";
import {
  CRON_REFUSAL_BODY,
  CRON_SECRET_HEADER,
  checkCronSecret,
} from "../cronAuth";
import { readR2Config } from "../backup/config";
import { createR2Target, type BackupTarget } from "../backup/target";
import { dayKey, findSuccessfulRunForDay } from "../backup/history";
import {
  runBackup,
  summarise,
  type BackupReport,
  type FileStreamSource,
} from "../backup/runBackup";

/**
 * When the backup runs. FIVE fields, UTC — standard cron, no seconds.
 *
 * It was six fields with a leading seconds field while Manus scheduled it.
 * Cloudflare Workers takes five, and a six-field expression there is not an
 * error that gets reported — `wrangler` rejects it at deploy time, but an
 * expression that happens to parse as five fields would simply run at the
 * wrong time, quietly, forever. Hence the field-count assertion in
 * server/scheduledBackup.test.ts.
 *
 * Exported so the test can check the cadence. workers/cron/wrangler.toml has to
 * restate it — TOML cannot import from TypeScript — so the test asserts the two
 * agree rather than trusting them to.
 */
export const BACKUP_CRON = "0 9 * * *";

/** The path the platform POSTs to. Mounted in server/_core/index.ts. */
export const BACKUP_PATH = "/api/scheduled/backupToR2";

export type ScheduledBackupOutcome =
  | { status: "completed"; report: BackupReport }
  /** Database safe, some stored files unreadable. Not retried — see below. */
  | { status: "partial"; reason: string; report: BackupReport }
  | { status: "skipped"; runId: string; reason: string }
  | { status: "failed"; reason: string; report: BackupReport | null };

/**
 * Take the nightly backup, unless today already has a good one.
 *
 * Exported separately from the HTTP handler, with the clock and the destination
 * injectable, because the behaviour worth testing — does a failed run report
 * failure, does a retry skip — cannot be driven through Express.
 */
export async function runScheduledBackup(options: {
  now: Date;
  databaseUrl?: string;
  /** Injected by tests; production builds one from the environment. */
  target?: BackupTarget;
  fileSource?: FileStreamSource;
}): Promise<ScheduledBackupOutcome> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return {
      status: "failed",
      reason: "DATABASE_URL is not set on this server.",
      report: null,
    };
  }

  let target = options.target;
  if (!target) {
    const configResult = readR2Config();
    if (!configResult.ok) {
      // Loud rather than quiet. A deployment missing its credentials has no
      // backups at all, and that must not look like a night with nothing to do.
      return {
        status: "failed",
        reason: `Cloudflare R2 is not configured. Missing: ${configResult.missing.join(", ")}`,
        report: null,
      };
    }
    target = createR2Target(configResult.config);
  }

  const day = dayKey(options.now);

  // The retry guard. Only a successful manifest counts as "already done".
  try {
    const existing = await findSuccessfulRunForDay(target, day);
    if (existing) {
      return {
        status: "skipped",
        runId: existing,
        reason: `A successful backup for ${day} already exists.`,
      };
    }
  } catch (error) {
    // Cannot read the bucket — do not skip on the strength of a failed check.
    // Falling through means at worst a duplicate backup, which is harmless;
    // skipping here would mean no backup at all, which is not.
    console.warn(
      `[BackupToR2] could not check for an existing backup: ${message(error)}`
    );
  }

  const report = await runBackup({
    databaseUrl,
    target,
    fileSource: options.fileSource,
    now: options.now,
  });

  if (report.status === "failed") {
    return {
      status: "failed",
      reason:
        report.errors[0] ??
        `${report.files.failed.length} file(s) could not be copied.`,
      report,
    };
  }

  if (report.status === "partial") {
    return {
      status: "partial",
      reason: `${report.files.failed.length} of ${report.files.found} stored file(s) could not be read: ${report.files.failed
        .slice(0, 3)
        .map(f => f.key)
        .join(", ")}${report.files.failed.length > 3 ? ", …" : ""}`,
      report,
    };
  }

  return { status: "completed", report };
}

/**
 * `POST /api/scheduled/backupToR2` — mounted in server/_core/index.ts.
 *
 * Cron-only, proved by the shared secret in the `x-cron-secret` header — see
 * server/cronAuth.ts. A logged-in user hitting this URL is refused too, because
 * a backup reads every row belonging to every user; being signed in is not the
 * same as being the scheduler.
 *
 * ── Failure is a 500; partial is a 200 ──────────────────────────────────────
 * A 500 makes the caller retry and is worth surfacing, and that is right when
 * retrying could help: a timeout, an unreachable bucket, a dump that did not
 * finish. The Cloudflare Worker that calls this retries a 5xx (workers/cron).
 *
 * It is wrong for a partial run. Those stored-file reads fail deterministically
 * — a storage 403 is still a 403 ninety seconds later — so a 500 buys three
 * full database dumps a night and the same refusals each time, plus a nightly
 * alert for a condition nobody can act on from here. An alert that fires every
 * night is one nobody reads, which is how the real failure gets missed.
 *
 * So partial returns 200 and is loud in the places that keep a record: a
 * console.warn naming the unreadable keys, and the manifest beside the data in
 * the bucket carrying `status: "partial"` and every failed key. It is never
 * reported as OK — the stored files are the half of this that cannot be
 * rebuilt from anywhere else, so "the database is safe" is the most this may
 * ever claim.
 */
export async function backupToR2Handler(req: Request, res: Response) {
  try {
    const allowed = checkCronSecret(req.headers[CRON_SECRET_HEADER]);
    if (!allowed.ok) {
      // The reason stays here, where the person who can fix it will look.
      console.warn(`[BackupToR2] refused a trigger: ${allowed.reason}`);
      return res.status(403).json(CRON_REFUSAL_BODY);
    }

    const outcome = await runScheduledBackup({ now: new Date() });

    if (outcome.status === "skipped") {
      console.log(`[BackupToR2] skipped — ${outcome.reason}`);
      return res.json({ ok: true, ...outcome });
    }

    // 200, so the platform does not retry a deterministic refusal three times —
    // but warn-level and naming the keys, so it still lands in the log.
    if (outcome.status === "partial") {
      console.warn(
        `[BackupToR2] PARTIAL — ${outcome.reason}\n${summarise(outcome.report)}`
      );
      return res.json({ ok: false, ...outcome });
    }

    if (outcome.status === "failed") {
      console.error(
        `[BackupToR2] FAILED — ${outcome.reason}` +
          (outcome.report ? `\n${summarise(outcome.report)}` : "")
      );
      return res.status(500).json({
        ok: false,
        error: outcome.reason,
        report: outcome.report,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[BackupToR2]\n${summarise(outcome.report)}`);
    return res.json({ ok: true, ...outcome });
  } catch (err) {
    // JSON-encoded so the platform's Investigate flow surfaces it verbatim
    // rather than showing an opaque 500.
    console.error("[BackupToR2] failed:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
