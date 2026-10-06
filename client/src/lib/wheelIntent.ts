/**
 * DOES THIS WHEEL EVENT MEAN "ZOOM" OR "PAN"?
 *
 * Owner, 2026-09-29: the MOUSE WHEEL stays zoom, like Bluebeam; a two-finger
 * TRACKPAD scroll pans, if that can be done safely. A wheel event does not say
 * which device sent it, so this reads what it can:
 *
 *  - `ctrlKey` — a trackpad PINCH arrives as a wheel event with ctrlKey set,
 *    and so does Ctrl+wheel on a mouse. Both zoom. Always, even mid-gesture.
 *  - Sideways movement (`deltaX` not 0) — a trackpad. A mouse wheel has none.
 *    (Shift+wheel on a mouse becomes sideways too, and panning sideways is
 *    what somebody holding Shift over a drawing wants anyway.)
 *  - A small step in pixel mode — a trackpad. A Windows mouse notch arrives
 *    as ~100 px (or 120, or a multiple), or in lines (`deltaMode` 1); a
 *    trackpad sends a stream of small ones.
 *
 * ── Decided once per GESTURE ────────────────────────────────────────────────
 * A trackpad scroll is dozens of events, and a later one can look like a mouse
 * notch (a fast flick) or an early one like nothing at all. So the first event
 * decides and the answer holds until the wheel has been quiet for
 * GESTURE_GAP_MS — a scroll never flips to zooming halfway through.
 *
 * ── Why a wrong guess is safe ───────────────────────────────────────────────
 * A pan is a CSS transform: it cannot move a mark, change a length or change
 * a scale. Reading a trackpad as a mouse zooms — today's behaviour. Reading a
 * mouse as a trackpad pans — a nuisance that moves nothing. KNOWN weak spot,
 * unmeasured: a mouse with smooth or free-spinning scrolling, and macOS mice,
 * can send small steps and would pan. Measure on real hardware before relying
 * on it (references/track-b-panning-plan.md § 6).
 */

export type WheelSample = {
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages — as on a WheelEvent. */
  deltaMode: number;
  ctrlKey: boolean;
  /** Milliseconds, as `event.timeStamp`. */
  timeStamp: number;
};

export type WheelIntent = "zoom" | "pan";

/** What the current gesture was decided as, and when it last moved. */
export type WheelGesture = { intent: WheelIntent; lastAt: number } | null;

/** Quiet this long and the next event starts a new gesture. */
export const GESTURE_GAP_MS = 150;

/** A pixel-mode step smaller than this is a trackpad's, not a mouse notch. */
export const TRACKPAD_STEP_PX = 50;

export function wheelIntent(
  e: WheelSample,
  gesture: WheelGesture
): { intent: WheelIntent; gesture: WheelGesture } {
  if (e.ctrlKey) return { intent: "zoom", gesture: null };
  if (gesture && e.timeStamp - gesture.lastAt < GESTURE_GAP_MS)
    return {
      intent: gesture.intent,
      gesture: { intent: gesture.intent, lastAt: e.timeStamp },
    };
  const trackpad =
    e.deltaMode === 0 &&
    (e.deltaX !== 0 || Math.abs(e.deltaY) < TRACKPAD_STEP_PX);
  const intent: WheelIntent = trackpad ? "pan" : "zoom";
  return { intent, gesture: { intent, lastAt: e.timeStamp } };
}
