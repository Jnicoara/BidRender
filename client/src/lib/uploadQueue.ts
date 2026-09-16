/**
 * The list of uploads on the Takeoff screen, as data rather than as component
 * state.
 *
 * ── Why this is a module and not five setState calls ─────────────────────────
 * Retrying a failed upload is the operation that forced this out of the
 * component. It needs three things the old inline state could not give it: the
 * FILE kept after the failure, a stable identity for the row being retried, and
 * a way to put one row back to waiting without disturbing the others. Doing
 * that with array indexes inside a 2,000-line component is how the bugs below
 * happen, and none of it was testable there — vitest runs this directory, not
 * the page.
 *
 * ── Two bugs this fixes on the way ───────────────────────────────────────────
 * 1. Jobs were patched BY INDEX while the dismiss button removed rows from the
 *    same array. Dismissing a finished row while another was uploading shifted
 *    every index after it, so the in-flight transfer's progress was written
 *    onto whatever row had taken its place. Everything is keyed by `id` now.
 *
 * 2. Picking files REPLACED the whole list. A failed row was therefore wiped
 *    the moment the user chose another file — including the message explaining
 *    why it failed, which is the one thing they needed to read. `appendJobs`
 *    keeps what is already there.
 *
 * ── Retryable is a property of the FAILURE, not of the row ───────────────────
 * A transfer that was blocked, dropped, stalled or cancelled can be sent again
 * and might well work. A file that is 600MB, or is not a PDF inside, will fail
 * identically forever — the bytes are the problem, and offering "Retry" there
 * invites someone to press a button that cannot ever succeed. Those rows are
 * marked `retryable: false` and offer only dismissal, which is the real way
 * forward: pick a different file.
 */

export type UploadJobState =
  | "waiting"
  | "uploading"
  | "finishing"
  | "done"
  | "failed";

export type UploadJob = {
  /** Stable for the life of the row, across retries. Never an array index. */
  id: string;
  filename: string;
  byteSize: number;
  /** Bytes confirmed sent. Reset to 0 when a retry starts. */
  sent: number;
  state: UploadJobState;
  error?: string;
  /** The technical line behind `error`, when there is one. */
  errorDetail?: string | null;
  /**
   * The file itself, held so a retry does not make the user find it again.
   *
   * This is the whole reason a failure used to mean re-picking the file or
   * reloading the page: the browser hands over a File, the old code used it
   * once and dropped it. Keeping it costs nothing — a File is a handle to
   * bytes on disk, not the bytes.
   */
  file: File;
  /** False when re-sending identical bytes cannot possibly work. */
  retryable: boolean;

  /**
   * ── Only set while a large set is going up in pieces ───────────────────────
   * A percentage that crawls for twenty minutes is much easier to trust when
   * there is discrete progress behind it, so a big upload also reports which
   * piece it is on. Absent for an ordinary single-request upload, where there
   * is nothing to count.
   */
  partsDone?: number;
  partCount?: number;
  /**
   * Waiting for the network to come back.
   *
   * Distinct from a failure on purpose: nothing is wrong, nothing has been
   * lost, and there is nothing for the user to do but reconnect. Shown as
   * "Paused" rather than counted toward the stall watchdog.
   */
  paused?: boolean;
  /**
   * Nothing has moved for a while, though the browser still claims a network.
   *
   * Separate from `paused` because Windows can take most of a minute to admit
   * a Wi-Fi connection has gone. In that gap the browser insists it is online
   * while every byte goes nowhere, and a live-looking bar that has stopped
   * moving is indistinguishable from the app having hung.
   */
  stalled?: boolean;
  /** Which attempt a piece is on, while it is being retried. */
  retrying?: number | null;
};

let sequence = 0;

/** Ids are per-session and only ever compared to each other. */
function nextId(): string {
  sequence += 1;
  return `upload-${sequence}`;
}

/** Reset between tests so ids are predictable. Not used by the app. */
export function __resetJobIds() {
  sequence = 0;
}

export function makeJob(file: File): UploadJob {
  return {
    id: nextId(),
    filename: file.name,
    byteSize: file.size,
    sent: 0,
    state: "waiting",
    file,
    retryable: true,
  };
}

/**
 * Add newly made jobs to the list, keeping what is already on it.
 *
 * Finished rows are dropped as they are added — their sheet is the
 * confirmation and a list of past successes is clutter — but FAILED rows
 * survive, because their message is the only record of what went wrong.
 *
 * Takes jobs rather than files so the caller keeps a reference to exactly the
 * rows it just enqueued, and can run them without hunting for them by index or
 * re-deriving them inside a state updater.
 */
export function appendJobs(
  existing: UploadJob[],
  incoming: UploadJob[]
): UploadJob[] {
  return [...existing.filter(job => job.state !== "done"), ...incoming];
}

/** Patch one job by id. Unknown ids are a no-op rather than an error. */
export function patchJob(
  jobs: UploadJob[],
  id: string,
  patch: Partial<Omit<UploadJob, "id" | "file">>
): UploadJob[] {
  return jobs.map(job => (job.id === id ? { ...job, ...patch } : job));
}

/**
 * Mark a job failed.
 *
 * `retryable` defaults to true: most failures are worth another go, and the
 * cases that are not are the narrow, knowable ones the caller names.
 */
export function failJob(
  jobs: UploadJob[],
  id: string,
  {
    error,
    detail = null,
    retryable = true,
  }: { error: string; detail?: string | null; retryable?: boolean }
): UploadJob[] {
  return patchJob(jobs, id, {
    state: "failed",
    error,
    errorDetail: detail,
    retryable,
  });
}

/** Remove a row the user has read and does not want to keep. */
export function dismissJob(jobs: UploadJob[], id: string): UploadJob[] {
  return jobs.filter(job => job.id !== id);
}

/**
 * Put a failed job back to waiting so it can be sent again.
 *
 * Keeps the id and the file, clears the progress and the error. Keeping the id
 * matters: the row stays where it is on screen instead of vanishing and
 * reappearing at the bottom, which reads as a different upload.
 *
 * Anything not failed is left alone — retrying an in-flight upload would
 * otherwise reset a transfer that is doing fine.
 */
export function resetForRetry(jobs: UploadJob[], id: string): UploadJob[] {
  return jobs.map(job =>
    job.id === id && job.state === "failed"
      ? {
          ...job,
          state: "waiting" as const,
          sent: 0,
          error: undefined,
          errorDetail: null,
        }
      : job
  );
}

/** Drop the finished rows, keep everything still working or failed. */
export function clearFinished(jobs: UploadJob[]): UploadJob[] {
  return jobs.filter(job => job.state !== "done");
}

/** Failed rows that could actually succeed if sent again. */
export function retryableJobs(jobs: UploadJob[]): UploadJob[] {
  return jobs.filter(job => job.state === "failed" && job.retryable);
}

/** Is anything still in flight? Used to keep two uploads from overlapping. */
export function isBusy(jobs: UploadJob[]): boolean {
  return jobs.some(
    job =>
      job.state === "waiting" ||
      job.state === "uploading" ||
      job.state === "finishing"
  );
}
