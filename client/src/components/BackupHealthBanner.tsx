/**
 * Says something when the backups have gone quiet.
 *
 * ── Why this is on the Dashboard and not buried in Settings ──────────────────
 * The failure it reports is one nobody goes looking for. A backup that stopped
 * running does not break anything today, or tomorrow, or for months — it breaks
 * the day somebody needs it, and by then the window to notice has closed. A
 * warning on a screen you have to remember to visit is a warning for a problem
 * you already knew you had.
 *
 * So it sits on the screen the owner lands on, and only when there is something
 * to say. A healthy system renders nothing at all.
 *
 * ── Admin only ───────────────────────────────────────────────────────────────
 * Not protection — `backup.health` is an `adminProcedure` and the server is
 * what enforces that. It is relevance: an estimator cannot fix a backup, and a
 * warning aimed at someone who cannot act on it is noise that teaches everyone
 * to ignore the banner when it finally matters.
 *
 * ── It never blocks the page ─────────────────────────────────────────────────
 * Silent while loading, silent on error, silent when healthy. A screen that
 * fails to load because it could not check on the backups would be a worse
 * problem than the one being checked for.
 */
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function BackupHealthBanner({ isAdmin }: { isAdmin: boolean }) {
  const health = trpc.backup.health.useQuery(undefined, {
    enabled: isAdmin,
    // Once an hour is plenty for a thing measured in days, and it keeps the
    // Dashboard from listing the backup bucket on every visit.
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!isAdmin) return null;
  if (!health.data?.stale || !health.data.message) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-amber-200">
          Backups have stopped
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {health.data.message}{" "}
          {health.data.configured
            ? "Check that the scheduled job is still running."
            : null}
        </p>
      </div>
    </div>
  );
}
