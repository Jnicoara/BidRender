/**
 * How fast an upload is going, and how long is left.
 *
 * ── Why not just divide ──────────────────────────────────────────────────────
 * Bytes-so-far over seconds-so-far gives a number that is technically true and
 * useless. It averages in the slow start, it barely moves after a few minutes,
 * and on a connection that drops to nothing it keeps reporting the speed of
 * five minutes ago — so the one moment the estimator most needs to know
 * something is wrong is the moment the figure lies to them.
 *
 * So speed is measured over a SHORT RECENT WINDOW. The figure then reflects
 * what the connection is doing now, goes to zero when the connection does, and
 * recovers as soon as it does.
 *
 * ── And why it is smoothed anyway ────────────────────────────────────────────
 * A raw recent-window figure jitters hard, because progress arrives in lumps —
 * pieces finish together, the browser batches events. A number flickering
 * between 2 and 40 MB/s reads as broken even when the upload is healthy. So the
 * window is a few seconds wide rather than one sample, which is enough to
 * settle without going stale.
 *
 * Everything here is arithmetic over samples handed in: no clock is read, so
 * the awkward cases — a stall, a resume, a connection that halves — can be
 * written down as a list of numbers in a test rather than produced for real.
 */

/**
 * How much recent history the speed is measured over.
 *
 * Five seconds is long enough to absorb the lumpiness of four pieces finishing
 * at once, and short enough that pulling the network out shows up as a falling
 * number within a couple of seconds rather than a minute later.
 */
export const SPEED_WINDOW_MS = 5000;

/** A reading of how much had been sent at a moment in time. */
export type ProgressSample = {
  /** Milliseconds, from any clock, as long as it is always the same one. */
  at: number;
  /** Total bytes confirmed sent at that moment. */
  bytes: number;
};

/**
 * Keep only the samples worth keeping.
 *
 * One sample older than the window is deliberately RETAINED — it is the far end
 * of the measurement. Dropping every sample outside the window would leave
 * nothing to measure against right after a quiet spell, and the speed would
 * read as unknown at exactly the moment it should read as slow.
 */
export function trimSamples(
  samples: readonly ProgressSample[],
  now: number,
  windowMs: number = SPEED_WINDOW_MS
): ProgressSample[] {
  const cutoff = now - windowMs;
  const firstInside = samples.findIndex(s => s.at >= cutoff);
  if (firstInside <= 0) return [...samples];
  // Keep the one immediately before the window, hence -1.
  return samples.slice(firstInside - 1);
}

/**
 * Bytes per second over the samples given, or null when it cannot be said.
 *
 * Returns null rather than 0 for "not enough information yet". They mean
 * different things to a reader — 0 B/s is a stopped upload, and showing that
 * during the first half-second of a healthy one is a small lie that makes
 * people cancel.
 */
export function bytesPerSecond(
  samples: readonly ProgressSample[]
): number | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.at - first.at) / 1000;
  if (seconds <= 0) return null;
  const moved = last.bytes - first.bytes;
  // Never negative: a resumed upload can restate a lower total for a moment.
  return moved > 0 ? moved / seconds : 0;
}

/**
 * Seconds until done, or null when there is no honest estimate.
 *
 * Null when the speed is unknown, and null when it is zero — an upload moving
 * at nothing has no finish time, and "infinity" or a wildly large number on
 * screen is worse than saying nothing while the display shows it is paused.
 */
export function secondsRemaining(
  speedBytesPerSecond: number | null,
  bytesSent: number,
  byteSize: number
): number | null {
  if (speedBytesPerSecond === null || speedBytesPerSecond <= 0) return null;
  const left = byteSize - bytesSent;
  if (left <= 0) return 0;
  return left / speedBytesPerSecond;
}

/** "8.4 MB/s". Null speed prints nothing rather than a zero. */
export function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return "";
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${Math.round(bytesPerSec / 1024)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

/**
 * "about 3 minutes" — deliberately vague, and rounded generously.
 *
 * A countdown to the second invites people to watch it, and it is always wrong
 * because the connection changes. Rounded language sets the expectation that
 * this is a guide. Rounding UP past a boundary is on purpose too: finishing
 * sooner than promised is a pleasant surprise, the other way round is the
 * progress bar that sits at "1 second remaining" for a minute.
 */
export function formatTimeRemaining(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 10) return "almost done";
  if (seconds < 60) return `about ${Math.ceil(seconds / 10) * 10} seconds`;
  if (seconds < 90) return "about a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `about ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `about ${hours}h ${rest}m`;
}

/**
 * How long nothing may move before the upload row says so.
 *
 * ── Why this exists at all, given the browser reports being offline ──────────
 * Because it reports it far too late. Windows can take the better part of a
 * minute to decide that a Wi-Fi connection is gone, and `navigator.onLine`
 * only changes when the operating system does. Until then the browser
 * cheerfully insists it is online while every byte goes nowhere.
 *
 * What the estimator sees in that gap is a live-looking yellow bar that has
 * stopped moving, which is indistinguishable from the app having hung. Ten
 * seconds of complete silence is not proof the connection is gone, but it is
 * enough to stop claiming everything is fine.
 *
 * ── Ten seconds, and not less ────────────────────────────────────────────────
 * A piece is 16MB. On a slow connection a single piece legitimately takes
 * longer than that to produce its first progress event, and pieces finish in
 * bursts. Shorter than ten seconds and the row would cry wolf during a healthy
 * upload on exactly the connections this feature is meant to help.
 */
export const STALL_HINT_MS = 10_000;

/**
 * Has nothing moved for long enough to say so?
 *
 * Note what this does NOT do: it does not cancel, retry or fail anything. The
 * upload carries on exactly as it would have, its pieces still retrying on
 * their own schedule. This only changes what the row says, because the wrong
 * thing to do about a possible blip is to give up on it.
 */
export function looksStalled(
  lastMovementAt: number,
  now: number,
  thresholdMs: number = STALL_HINT_MS
): boolean {
  return now - lastMovementAt >= thresholdMs;
}
