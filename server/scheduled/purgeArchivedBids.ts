/**
 * The sweep that makes the 30-day archive real.
 *
 * ── Why this file exists at all ──────────────────────────────────────────────
 * The app already had a Trash screen that counted down to a permanent deletion
 * which never happened — nothing was scheduled, so the number on screen was
 * decoration. An expiry a user can read but the system does not enforce is
 * worse than no expiry: it teaches people that archived work disappears, and
 * then keeps it forever. This handler is the enforcement.
 *
 * ── Why a platform cron rather than a timer ──────────────────────────────────
 * `setInterval` / `node-cron` are forbidden here (references/periodic-updates.md):
 * the app runs on Cloud Run, which terminates idle instances, so an in-process
 * timer dies with the instance and takes the guarantee with it. The platform
 * POSTs to `/api/scheduled/*` instead, which works whether or not anyone has
 * the app open.
 *
 * ── Registering it (a deploy-time step, not a code step) ─────────────────────
 * The handler below is only half the job. The other half is the Cloudflare
 * Worker in workers/cron/, deployed once with `wrangler deploy`, which holds
 * the same CRON_SECRET and POSTs here at PURGE_CRON.
 *
 * 03:30 UTC daily. Hourly would be needless load for a 30-day window; daily
 * means a bid is destroyed within a day of its deadline, which is the
 * resolution the countdown promises anyway. It runs AFTER the 02:00 backup, on
 * purpose — see backupToR2.ts.
 *
 * UNTIL THAT WORKER IS DEPLOYED, NOTHING IS EVER PURGED. The app stays correct
 * in the meantime — `daysRemaining` still counts down and the archive still
 * lists everything — it simply keeps expired bids instead of destroying them,
 * and one sweep clears the backlog whenever the cron is finally registered.
 * That is the safe direction for the failure to point, and it is why this job
 * needs no alerting of its own while the backup does.
 *
 * ── Idempotence ──────────────────────────────────────────────────────────────
 * The Worker may retry. A second run finds no expired rows, deletes nothing and
 * returns 200, because the query is driven by stored state rather than by
 * anything in the request body.
 */
import type { Request, Response } from "express";
import {
  CRON_REFUSAL_BODY,
  CRON_SECRET_HEADER,
  checkCronSecret,
} from "../cronAuth";
import { RETENTION_DAYS, systemClock } from "../../shared/retention";
import * as db from "../db";

/**
 * When the purge runs. Five fields, UTC — standard cron, no seconds.
 *
 * Deliberately after the 02:00 backup: this job permanently destroys bids, and
 * running it second means the night's export still contains what it is about to
 * remove. Reverse the order and the backup would faithfully record the deletion.
 */
export const PURGE_CRON = "30 3 * * *";

/** The path the Worker POSTs to. Mounted in server/_core/index.ts. */
export const PURGE_PATH = "/api/scheduled/purgeArchivedBids";

export type PurgeResult = {
  /** How many bids were destroyed. */
  purged: number;
  /** Their ids, for the log — the rows are gone by the time this is read. */
  ids: number[];
};

/**
 * Delete every bid whose retention window has closed.
 *
 * Exported separately from the HTTP handler so tests can drive it with a clock
 * they control. There is no other way to test a 30-day rule.
 *
 * Line items and PDF rows go with the bid via `onDelete: "cascade"`.
 *
 * ── What is NOT cleaned up, and why ──────────────────────────────────────────
 * The S3 objects behind those PDF rows are orphaned rather than deleted: the
 * Forge storage API this app uses exposes presigned PUT and GET only, with no
 * delete. Losing the row loses the key, so the file becomes unreachable through
 * the app — which is what the user is promised — but the bytes still sit in the
 * bucket. Worth fixing if a delete endpoint appears; not worth blocking the
 * feature on, and not something to paper over by pretending it happened.
 */
export async function purgeExpiredBids(
  now: Date = systemClock(),
  retentionDays: number = RETENTION_DAYS
): Promise<PurgeResult> {
  const expired = await db.getExpiredArchivedBids(now, retentionDays);
  const ids: number[] = [];

  for (const bid of expired) {
    // One at a time, by (id, userId), so a single bad row cannot take the whole
    // sweep down with it and leave the rest to pile up until someone notices.
    try {
      await db.deleteBidForever(bid.id, bid.userId);
      ids.push(bid.id);
    } catch (err) {
      console.error(`[PurgeArchivedBids] bid ${bid.id} failed to delete:`, err);
    }
  }

  return { purged: ids.length, ids };
}

/**
 * `POST /api/scheduled/purgeArchivedBids` — mounted in server/_core/index.ts.
 *
 * Cron-only, proved by the shared secret in the `x-cron-secret` header — see
 * server/cronAuth.ts. A logged-in user hitting this URL is refused too, because
 * "delete everyone else's expired bids" is not a user-facing operation.
 *
 * Takes no clock: express reserves the third argument for `next`, and the seam
 * worth testing is `purgeExpiredBids` above, which the tests drive directly.
 */
export async function purgeArchivedBidsHandler(req: Request, res: Response) {
  try {
    const allowed = checkCronSecret(req.headers[CRON_SECRET_HEADER]);
    if (!allowed.ok) {
      // The reason stays here, where the person who can fix it will look.
      console.warn(`[PurgeArchivedBids] refused a trigger: ${allowed.reason}`);
      return res.status(403).json(CRON_REFUSAL_BODY);
    }

    const result = await purgeExpiredBids(systemClock());
    if (result.purged > 0) {
      console.log(
        `[PurgeArchivedBids] deleted ${result.purged}: ${result.ids.join(", ")}`
      );
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    // JSON-encoded so the platform's Investigate flow surfaces it verbatim
    // rather than showing an opaque 500.
    console.error("[PurgeArchivedBids] failed:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
