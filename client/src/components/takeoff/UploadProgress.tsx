/**
 * UploadProgress — what a large plan set is doing while it uploads.
 *
 * ── Why a bar and not a spinner ──────────────────────────────────────────────
 * A 150MB set takes minutes on a site connection, and a spinner says only "not
 * finished". It cannot distinguish moving slowly from stalled, so the honest
 * reading of a spinner after two minutes is "this has hung", and people cancel
 * work that was about to succeed. The standing rule is that genuinely slow work
 * gets an honest indicator, ideally with progress rather than an indeterminate
 * spinner — this is the case that rule was written for.
 *
 * So every job shows a filled bar, a percentage, and how many megabytes of how
 * many have actually left the browser. Those numbers come from the transfer
 * itself (XHR upload progress), not from a timer pretending to be one.
 *
 * ── After the bytes ──────────────────────────────────────────────────────────
 * Reaching 100% is not the end: the sheet still has to be recorded. That step
 * is fast but not instant, and a bar sitting full with nothing happening reads
 * as frozen, so it gets its own "Finishing…" state.
 *
 * ── Failures stay ────────────────────────────────────────────────────────────
 * A finished upload disappears — the sheet it produced is the confirmation. A
 * failed one stays with its reason, because a toast is gone in seconds and the
 * user needs to know WHICH file of five did not make it and why.
 */
import { cn } from "@/lib/utils";
import { AlertCircle, Loader2, PauseCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@shared/uploadLimits";
import { formatSpeed, formatTimeRemaining } from "@shared/uploadSpeed";

export type UploadJobView = {
  id: string;
  filename: string;
  byteSize: number;
  sent: number;
  state: "waiting" | "uploading" | "finishing" | "done" | "failed";
  error?: string;
  /** The technical line behind `error`. Shown small, under it. */
  errorDetail?: string | null;
  /**
   * Whether sending the same bytes again could work.
   *
   * False for a file that is too large or is not a PDF — those fail
   * identically forever, so a Retry button there is one that cannot succeed.
   * Those rows offer only Dismiss, because the way forward is a different file.
   */
  retryable?: boolean;

  /** Pieces, for a large set going up in parts. Absent for an ordinary upload. */
  partsDone?: number;
  partCount?: number;
  /** Waiting for the network. Not a failure, and nothing has been lost. */
  paused?: boolean;
  /** Nothing has moved for a while, though the browser still claims a network. */
  stalled?: boolean;
  /** Which attempt a piece is on, while it is being re-sent. */
  retrying?: number | null;
  /** Bytes per second over the last few seconds, or null if not yet known. */
  speed?: number | null;
  /** Seconds left at that speed, or null when there is no honest estimate. */
  secondsLeft?: number | null;
};

export function UploadProgress({
  jobs,
  onCancel,
  onDismiss,
  onRetry,
}: {
  jobs: UploadJobView[];
  /** Abort the transfer in flight. */
  onCancel: () => void;
  /** Clear a failed row the user has read. */
  onDismiss: (id: string) => void;
  /** Send a failed upload again, reusing the file already chosen. */
  onRetry: (id: string) => void;
}) {
  if (jobs.length === 0) return null;

  return (
    <div className="border-b border-border bg-card px-4 py-2.5 space-y-2 shrink-0">
      {jobs.map(job => {
        const failed = job.state === "failed";
        // Default true: most failures are transfer failures and are worth
        // another go. Only the ones the file itself causes opt out.
        const canRetry = failed && job.retryable !== false;
        // Guard the divide: a zero-byte file is refused before it gets here,
        // but a NaN width would break the bar rather than show an empty one.
        const pct =
          job.byteSize > 0
            ? Math.min(100, Math.round((job.sent / job.byteSize) * 100))
            : 0;

        return (
          // Keyed by id, not by name or position: two files can share a name,
          // and a row's position shifts when an earlier one is dismissed.
          <div key={job.id}>
            <div className="flex items-center gap-2">
              {failed ? (
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
              ) : job.paused || job.stalled ? (
                // Still, not spinning. A spinner while nothing is moving says
                // work is happening, and none is.
                <PauseCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-[#F5C518]" />
              )}

              <span
                className="text-xs truncate flex-1 min-w-0"
                title={job.filename}
              >
                {job.filename}
              </span>

              {failed ? (
                <>
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 shrink-0 text-[0.7rem] gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => onRetry(job.id)}
                      aria-label={`Retry ${job.filename}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => onDismiss(job.id)}
                    aria-label={`Dismiss ${job.filename}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-[0.7rem] font-mono tabular-nums text-muted-foreground shrink-0">
                    {job.state === "finishing"
                      ? "Finishing…"
                      : job.state === "waiting"
                        ? "Queued"
                        : job.paused
                          ? // The states where the numbers would mislead: a
                            // speed and a time left are both meaningless while
                            // nothing is moving, so neither is shown.
                            `Paused — no connection · ${pct}%`
                          : job.stalled
                            ? // The browser still claims a network, but nothing
                              // has moved for a while. "Waiting" rather than
                              // "lost" in the verb, because the upload has not
                              // given up and neither should the reader.
                              `Connection lost — waiting… · ${pct}%`
                            : `${pct}% · ${formatBytes(job.sent)} of ${formatBytes(job.byteSize)}`}
                  </span>
                  {job.state === "uploading" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 shrink-0 text-[0.7rem] text-muted-foreground hover:text-destructive"
                      onClick={onCancel}
                    >
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>

            {failed ? (
              <div className="mt-0.5 ml-5.5 pl-0.5">
                <p className="text-[0.7rem] text-destructive">{job.error}</p>
                {/* The engineer's line. Kept out of the sentence above so the
                    user-facing message stays one readable thing, and kept ON
                    SCREEN rather than only in a toast, because this is what
                    someone pastes into a bug report an hour later. */}
                {job.errorDetail ? (
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">
                    {job.errorDetail}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                className="h-1 mt-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={job.state === "finishing" ? 100 : pct}
                aria-label={`Uploading ${job.filename}`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-200",
                    // Greyed while paused: a bar in the live colour that is not
                    // advancing is the thing that reads as frozen.
                    job.paused || job.stalled
                      ? "bg-muted-foreground/50"
                      : "bg-[#F5C518]",
                    // The record-the-sheet step has no measurable progress, so
                    // the full bar pulses rather than sitting inert.
                    job.state === "finishing" && "animate-pulse"
                  )}
                  style={{ width: `${job.state === "finishing" ? 100 : pct}%` }}
                />
              </div>
            )}

            {/*
              The slow line: how fast, how long, and which piece.

              Only while genuinely transferring. On a paused or finishing row
              these numbers are stale by definition, and a stale speed is worse
              than none — it is the figure someone reads to decide whether to
              give up, so it has to describe now.
            */}
            {!failed &&
            job.state === "uploading" &&
            !job.paused &&
            !job.stalled ? (
              <p className="mt-1 text-[0.65rem] font-mono tabular-nums text-muted-foreground">
                {[
                  formatSpeed(job.speed ?? null),
                  formatTimeRemaining(job.secondsLeft ?? null),
                  // Pieces only when there are pieces — an ordinary upload is
                  // one request and "piece 1 of 1" is noise.
                  job.partCount && job.partCount > 1
                    ? `piece ${Math.min((job.partsDone ?? 0) + 1, job.partCount)} of ${job.partCount}`
                    : "",
                  job.retrying ? `retrying (attempt ${job.retrying})` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}

            {/* Announced for anyone who cannot see the bar. Percentage only, so
                it is not read out on every progress event. */}
            <span className="sr-only" role="status" aria-live="polite">
              {job.state === "failed"
                ? `${job.filename} failed: ${job.error}`
                : job.state === "done"
                  ? `${job.filename} uploaded`
                  : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
