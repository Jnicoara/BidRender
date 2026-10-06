/**
 * WHEN A PRESS BECOMES A DRAG — one threshold for the pan and for point edits.
 *
 * Until 2026-09-29 both started on the first pixel of movement:
 *
 *  - The PAN moved the sheet on any wobble, and the click that ended it then
 *    landed on whatever was under the pointer. A drag that began on a mark
 *    panned the sheet AND selected the mark, and the next Delete removed a
 *    count nobody picked.
 *  - A press on a run's POINT handle committed a moved point on any jitter,
 *    so a click meant to pick a point changed the run's length by a hair,
 *    with nothing on screen to say so.
 *
 * Both now wait until the pointer has moved DRAG_THRESHOLD_PX on screen. Below
 * it, a press is a click: the pan moves nothing, the handle only picks. The
 * same 4 px as the trace tool's repeat-click rule (@/lib/traceClick), because
 * it is the same question — did the hand mean to move, or did it wobble.
 *
 * On SCREEN, never on paper, because the wobble is the hand's.
 */
export const DRAG_THRESHOLD_PX = 4;

type Screen = { x: number; y: number };

export function pastDragThreshold(start: Screen, now: Screen): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) >= DRAG_THRESHOLD_PX;
}

/**
 * Eat the ONE click that follows a real drag, before anything else sees it.
 *
 * A browser fires `click` after `pointerup` wherever the pointer was let go.
 * After a pan that is whatever mark or run the sheet slid under the pointer,
 * and selecting it would be something nobody asked for. Capture phase on the
 * target (the window, in the app), stopped and prevented. Only the next
 * click, and only within `ms`: a click that comes later is a new click.
 *
 * Returns a cancel, for tests and for anything that wants to call it off.
 */
export function swallowNextClick(
  target: Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
  > = window,
  ms = 400
): () => void {
  const eat = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    // And any other listener on the same target, whatever order it was added.
    e.stopImmediatePropagation();
    done();
  };
  const timer = setTimeout(() => done(), ms);
  // `{ capture: true }`, not the bare `true`: Node's EventTarget does not
  // match a boolean capture flag on removal, so the suite saw a listener that
  // never went away. The object form is the same thing to a browser.
  const capture = { capture: true };
  function done() {
    clearTimeout(timer);
    target.removeEventListener("click", eat, capture);
  }
  target.addEventListener("click", eat, capture);
  return done;
}
