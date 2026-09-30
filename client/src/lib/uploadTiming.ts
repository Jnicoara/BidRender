/**
 * Phase timings for one plan upload, written to the console as `[upload] …`.
 *
 * Added 2026-09-29 because no phase of an upload was timed except the render
 * itself, and the plan for speeding uploads up ranked its ideas by what the
 * code SUGGESTED (Track B plan, Part 4 § 2). This is how the ranking gets a
 * measurement instead. Console only: nothing is stored or sent.
 *
 * One timeline at a time, started when a file is picked; every later mark is
 * the time since then, so the lines read as a sequence.
 */

let started: number | null = null;
let last: number | null = null;

export function startUploadTiming(label: string, bytes: number): void {
  started = performance.now();
  last = started;
  console.info(
    `[upload] start ${label} (${(bytes / 1_000_000).toFixed(1)} MB)`
  );
}

/** Log a phase that just ended. `bytes` adds a rate for a transfer. */
export function markUpload(phase: string, bytes?: number): void {
  if (started === null || last === null) return;
  const now = performance.now();
  const took = now - last;
  const rate =
    bytes && took > 0
      ? ` · ${(bytes / 1_000_000 / (took / 1000)).toFixed(1)} MB/s`
      : "";
  console.info(
    `[upload] ${phase}: ${Math.round(took)} ms (t+${Math.round(now - started)} ms)${rate}`
  );
  last = now;
}

/** The last mark of a timeline: later marks are ignored until the next start. */
export function endUploadTiming(phase: string): void {
  markUpload(phase);
  started = null;
  last = null;
}
