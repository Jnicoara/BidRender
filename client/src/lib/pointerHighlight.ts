/**
 * May the pointer move a keyboard list's highlight? Only when the pointer
 * itself MOVED.
 *
 * ── The fault, 2026-10-09 ────────────────────────────────────────────────
 * Every search list here keeps a highlight that Enter takes, and let the
 * mouse move it with `onMouseEnter`. But mouseenter also fires when the LIST
 * moves under a pointer that is standing still — and on a tablet the pointer
 * stands wherever the last tap landed. Tap something below the box, type
 * "4 square box", and the results grow under that spot: the row that slid
 * under it took the highlight, and Enter put a 4" LED disc light on the bid.
 * Every time, at 820x1180; never at laptop size, where the mouse had moved.
 *
 * So the rows listen to mousemove, and only a move with real distance
 * counts — a browser's synthetic move after layout carries none.
 */
export function pointerMovedHighlight(event: {
  movementX: number;
  movementY: number;
}): boolean {
  return event.movementX !== 0 || event.movementY !== 0;
}
