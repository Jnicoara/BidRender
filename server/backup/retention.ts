/**
 * How long a backup is kept — and therefore how long a deleted contractor's
 * drawings can outlive the deletion.
 *
 * ── The promise this keeps ───────────────────────────────────────────────────
 * Decided by the owner 2026-09-27: deleted drawings are removed from BidRidge
 * at once, and from the backups within 30 days. Until then nothing deleted a
 * backup, so every drawing a contractor ever deleted was still in every copy
 * taken while it existed, forever. Retention is a promise to customers, which
 * is why the number lives here by name rather than in a default somewhere.
 *
 * ── The two protections, both against losing the last good copy ─────────────
 * - The newest KEEP_NEWEST_GOOD good runs are kept whatever their age, so a
 *   month of failed nights can never prune the last backup that worked.
 * - The caller prunes only after a night that itself succeeded
 *   (`runScheduledBackup`), so a broken job cannot eat its own history.
 *
 * The clock is a parameter, like `purgeExpiredBids(now)`: a 30-day rule is
 * tested by handing it a date, not by waiting.
 */
import { allRunIds, runIdTime } from "./history";
import type { BackupTarget } from "./target";

export const BACKUP_KEEP_DAYS = 30;
export const KEEP_NEWEST_GOOD = 7;

export type RunInfo = { runId: string; good: boolean };

/**
 * Which runs to delete. Pure.
 *
 * A run is deleted when it is older than `keepDays` AND is not one of the
 * newest `keepNewestGood` good runs. A failed run past the window goes too — it
 * holds nothing worth restoring, and it may still hold drawings.
 */
export function runsToPrune(input: {
  runs: readonly RunInfo[];
  now: Date;
  keepDays?: number;
  keepNewestGood?: number;
}): string[] {
  const keepDays = input.keepDays ?? BACKUP_KEEP_DAYS;
  const keepNewestGood = input.keepNewestGood ?? KEEP_NEWEST_GOOD;
  const cutoff = input.now.getTime() - keepDays * 24 * 60 * 60 * 1000;

  const dated = input.runs
    .map(run => ({ ...run, at: runIdTime(run.runId) }))
    // A folder whose name is not a run id is not ours to judge. Left alone.
    .filter((r): r is RunInfo & { at: Date } => r.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const protectedIds = new Set(
    dated
      .filter(r => r.good)
      .slice(0, keepNewestGood)
      .map(r => r.runId)
  );

  return dated
    .filter(r => r.at.getTime() < cutoff && !protectedIds.has(r.runId))
    .map(r => r.runId);
}

/** Every run folder in a listing, with or without a manifest, newest first. */
export function runFolders(keys: readonly string[]): string[] {
  const folders = new Set<string>(allRunIds(keys));
  for (const key of keys) {
    const first = key.split("/")[0];
    // A run that died before writing its manifest still left files behind.
    if (first && runIdTime(first)) folders.add(first);
  }
  return Array.from(folders).sort().reverse();
}

export type PruneResult = { pruned: string[]; objectsDeleted: number };

/**
 * Read the bucket, decide, delete. Throws on a bucket error: the caller logs
 * it and reports it beside a backup that otherwise succeeded.
 */
export async function pruneOldBackups(
  target: BackupTarget,
  now: Date
): Promise<PruneResult> {
  const keys = await target.list("");
  const runs: RunInfo[] = [];
  for (const runId of runFolders(keys)) {
    runs.push({ runId, good: await isGoodRun(target, keys, runId) });
  }

  const prune = runsToPrune({ runs, now });
  let objectsDeleted = 0;
  for (const runId of prune) {
    const inRun = keys.filter(k => k.startsWith(`${runId}/`));
    await target.deleteMany(inRun);
    objectsDeleted += inRun.length;
  }
  return { pruned: prune, objectsDeleted };
}

/** The same rule `goodRunIds` uses: the database dump made it in. */
async function isGoodRun(
  target: BackupTarget,
  keys: readonly string[],
  runId: string
): Promise<boolean> {
  if (!keys.includes(`${runId}/manifest.json`)) return false;
  try {
    const manifest = JSON.parse(
      (await target.get(`${runId}/manifest.json`)).toString("utf8")
    );
    const status = manifest?.status ?? (manifest?.ok === true ? "clean" : null);
    return status === "clean" || status === "partial";
  } catch {
    return false;
  }
}
