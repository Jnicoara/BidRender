/**
 * Reading what is already in the bucket.
 *
 * Exists for one reason: the platform retries a failed `/api/scheduled/*` call
 * up to three times, and a full backup is expensive. Without a way to ask "did
 * today already work?", a single timeout turns into three complete backups of
 * the same data. With it, a retry after a successful run costs one LIST and
 * one GET.
 *
 * The pure part is separated from the network part so the interesting logic —
 * which run ids belong to which day — is testable without a bucket.
 */
import type { BackupTarget } from "./target";

/** `2026-08-14` from a Date, in UTC, matching the run id's date half. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Run ids from a listing that fall on one UTC day.
 *
 * Run ids are `2026-08-14T02-00-05Z`, so the day is a literal prefix — no date
 * parsing, and nothing to get wrong across timezones.
 */
export function runIdsForDay(keys: string[], day: string): string[] {
  const runs = new Set<string>();
  for (const key of keys) {
    const match = /^([^/]+)\/manifest\.json$/.exec(key);
    if (match && match[1].startsWith(day)) runs.add(match[1]);
  }
  return Array.from(runs).sort();
}

/**
 * The id of a run on `day` that got the database safely into the bucket, or
 * null.
 *
 * ── Why `partial` counts and `failed` does not ───────────────────────────────
 * A run that failed halfway leaves a manifest recording the failure, and
 * treating that as "today is done" would turn one bad night into a permanently
 * missing backup — the retry exists precisely to recover from it.
 *
 * A PARTIAL run is the opposite case. Its database dump is already uploaded and
 * whole; what it could not do is read some stored files, and those reads fail
 * deterministically (a 403 does not become a 200 ninety seconds later). Making
 * the retry re-run would dump the entire database three times a night to
 * re-collect the same refusals. So partial satisfies the guard.
 *
 * That is a decision about RETRIES, not a claim the backup is complete: the
 * manifest still records the status and every unreadable key, and nothing else
 * in the system reads this function as a health check.
 *
 * Older manifests predate `status` and carry only `ok`; those are read as clean
 * when true, so a bucket written by the previous version still answers this
 * correctly rather than re-running every night.
 */
export async function findSuccessfulRunForDay(
  target: BackupTarget,
  day: string
): Promise<string | null> {
  const candidates = runIdsForDay(await target.list(""), day);

  for (const runId of candidates) {
    try {
      const manifest = JSON.parse(
        (await target.get(`${runId}/manifest.json`)).toString("utf8")
      );
      const status =
        manifest?.status ?? (manifest?.ok === true ? "clean" : null);
      if (status === "clean" || status === "partial") return runId;
    } catch {
      // An unreadable manifest is not proof of anything; keep looking.
    }
  }
  return null;
}

/**
 * How long without a successful backup before the app says something.
 *
 * ── Why this is measured, and not reported ───────────────────────────────────
 * The obvious design is for the thing that runs the backup to shout when it
 * fails. That catches the failures it knows about and misses the one that
 * matters most: a cron that was never registered, or that silently stopped.
 * Nothing fails, so nothing is reported, and the backups quietly end. Every
 * story about a missing backup is that story.
 *
 * Asking "when did a backup last actually succeed?" catches both. A failed run,
 * a Worker that never fired, a deleted schedule and an unreachable bucket all
 * look the same from here, which is correct — they have the same consequence.
 *
 * Two days rather than one: the job runs nightly, so a single missed night is
 * one retry away and warning on it would produce an alert people learn to
 * ignore. Two consecutive misses is a pattern.
 */
export const BACKUP_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export type BackupHealth = {
  /** The newest run id that got the database safely into the bucket. */
  lastGoodRunId: string | null;
  /** When that run started, from its own id. Null when there is none. */
  lastGoodAt: Date | null;
  /** True when the app should be saying something about it. */
  stale: boolean;
  /** One plain sentence, or null when everything is fine. */
  message: string | null;
};

/**
 * The time inside a run id, or null if it is not one.
 *
 * Run ids are `2026-08-14T02-00-05Z` — an ISO timestamp with the colons
 * swapped for dashes, because a colon is awkward in an object key. Put them
 * back rather than parsing by hand.
 */
export function runIdTime(runId: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(runId);
  if (!match) return null;
  const at = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Decide whether backups have gone quiet, from a listing and a clock.
 *
 * Pure, and takes both — so "no backup for three days" is a test case rather
 * than something you wait three days to see.
 */
export function assessBackupHealth(
  goodRunIds: readonly string[],
  now: Date,
  staleAfterMs: number = BACKUP_STALE_AFTER_MS
): BackupHealth {
  const dated = goodRunIds
    .map(id => ({ id, at: runIdTime(id) }))
    .filter((r): r is { id: string; at: Date } => r.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const newest = dated[0];

  if (!newest) {
    return {
      lastGoodRunId: null,
      lastGoodAt: null,
      stale: true,
      message:
        "No backup has ever finished successfully. Nothing is being saved — check that the scheduled job is set up.",
    };
  }

  const age = now.getTime() - newest.at.getTime();
  if (age < staleAfterMs) {
    return {
      lastGoodRunId: newest.id,
      lastGoodAt: newest.at,
      stale: false,
      message: null,
    };
  }

  const days = Math.floor(age / (24 * 60 * 60 * 1000));
  return {
    lastGoodRunId: newest.id,
    lastGoodAt: newest.at,
    stale: true,
    message:
      days >= 1
        ? `The last successful backup was ${days} day${days === 1 ? "" : "s"} ago. Nothing has been saved since.`
        : "The last successful backup was more than two days ago. Nothing has been saved since.",
  };
}

/**
 * How many recent runs the health check will open before giving up.
 *
 * The bucket accumulates a manifest a night forever, and reading all of them to
 * answer one question would make the check slower every day it runs. Newest
 * first, stop at the first good one: a healthy bucket costs exactly one GET,
 * and a bucket where the last ten nights all failed has an answer worth giving
 * without reading a year of history to refine it.
 */
const HEALTH_MANIFESTS_TO_READ = 10;

/** Every run id in a listing, newest first. */
export function allRunIds(keys: readonly string[]): string[] {
  const runs = new Set<string>();
  for (const key of keys) {
    const match = /^([^/]+)\/manifest\.json$/.exec(key);
    if (match) runs.add(match[1]);
  }
  return Array.from(runs).sort().reverse();
}

/**
 * The most recent run ids whose database dump made it into the bucket.
 *
 * Returns at most one — the newest good run is all `assessBackupHealth` needs —
 * but returns an array so the caller does not have to special-case "none".
 */
export async function goodRunIds(
  target: BackupTarget,
  keys: readonly string[]
): Promise<string[]> {
  const recent = allRunIds(keys).slice(0, HEALTH_MANIFESTS_TO_READ);

  for (const runId of recent) {
    try {
      const manifest = JSON.parse(
        (await target.get(`${runId}/manifest.json`)).toString("utf8")
      );
      const status =
        manifest?.status ?? (manifest?.ok === true ? "clean" : null);
      // `partial` counts: its database dump is whole, and the database is the
      // half that cannot be rebuilt from anywhere else.
      if (status === "clean" || status === "partial") return [runId];
    } catch {
      // An unreadable manifest is not proof of anything; keep looking.
    }
  }
  return [];
}
