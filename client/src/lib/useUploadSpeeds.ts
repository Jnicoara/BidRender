/**
 * Turning a stream of "bytes sent so far" into a speed and a time left.
 *
 * ── Why a hook and not a calculation in the component ────────────────────────
 * Speed needs HISTORY, and a component re-render only has the present. Each job
 * needs a few seconds of past readings kept somewhere that survives renders
 * without causing them — which is a ref, and a ref is the one thing a pure
 * function cannot hold.
 *
 * Everything that can be decided from numbers alone lives in
 * `@shared/uploadSpeed` and is tested there. What is left here is bookkeeping:
 * record a reading, forget jobs that have gone, hand back the figures.
 *
 * ── Readings come from progress events, not a timer ──────────────────────────
 * Which means the clock only advances when something actually happened. A dead
 * connection stops producing readings, the window empties, and the speed falls
 * to nothing on its own — no separate watchdog needed to notice.
 */
import { useRef } from "react";
import {
  bytesPerSecond,
  secondsRemaining,
  trimSamples,
  type ProgressSample,
} from "@shared/uploadSpeed";

export type SpeedReading = {
  speed: number | null;
  secondsLeft: number | null;
};

export function useUploadSpeeds() {
  const history = useRef(new Map<string, ProgressSample[]>());

  /**
   * Record where a job is now and say how fast it is going.
   *
   * Called during render for each job on screen. That is safe because it only
   * touches a ref, and it is what keeps the figures in step with the bar rather
   * than a frame behind it.
   */
  return function readingFor(
    id: string,
    bytesSent: number,
    byteSize: number,
    now: number = Date.now()
  ): SpeedReading {
    const previous = history.current.get(id) ?? [];
    const last = previous[previous.length - 1];

    // Only record real movement. Re-renders that change nothing else would
    // otherwise fill the window with identical readings and drag the measured
    // speed toward zero while the upload is perfectly healthy.
    const samples =
      last && last.bytes === bytesSent
        ? previous
        : [...previous, { at: now, bytes: bytesSent }];

    const trimmed = trimSamples(samples, now);
    history.current.set(id, trimmed);

    const speed = bytesPerSecond(trimmed);
    return { speed, secondsLeft: secondsRemaining(speed, bytesSent, byteSize) };
  };
}

/** Drop the history of jobs that are no longer on screen. */
export function forgetSpeeds(
  history: Map<string, ProgressSample[]>,
  liveIds: readonly string[]
): void {
  const live = new Set(liveIds);
  for (const id of Array.from(history.keys())) {
    if (!live.has(id)) history.delete(id);
  }
}
