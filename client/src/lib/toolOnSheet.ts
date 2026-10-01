/**
 * A tool belongs to the sheet it was picked up on.
 *
 * ── The fault, 2026-10-01 ────────────────────────────────────────────────
 * Pick a count up, switch to the legend sheet to look something up, click to
 * move the view — and a mark landed on the legend. The count tool stayed in
 * hand across every way of changing sheet (the chip, its arrows and keys, the
 * plan list, a jump from a list, Back/Forward), and so did a trace in
 * progress, whose points from one sheet were then autosaved under the NEXT
 * sheet's id. Both are wrong quantities on the bid with nothing on screen to
 * say so.
 *
 * ── Why a key on the tool rather than a reset in each handler ────────────
 * There are seven places that change the sheet today and nothing stops an
 * eighth. Resetting in each of them is a list somebody has to remember. So a
 * held tool carries the sheet it was picked up on, and the page reads it
 * through `heldOnSheet`: on any other sheet it reads as put down, in the same
 * render the sheet changed, before any effect has run. An effect still clears
 * the stored value — otherwise going BACK to the first sheet would pick the
 * tool up again by itself — but the effect is tidying, not the guard.
 */

/** Which sheet is on screen: the plan set and the page within it. */
export type SheetKey = string;

export function sheetKeyOf(planId: number | null, page: number): SheetKey {
  return `${planId ?? "none"}:${page}`;
}

/** The tool as held, if it was picked up on this sheet; otherwise nothing. */
export function heldOnSheet<T extends { sheetKey: SheetKey }>(
  held: T | null,
  here: SheetKey
): T | null {
  return held !== null && held.sheetKey === here ? held : null;
}

/** True when a tool is stored as held but belongs to another sheet. */
export function heldElsewhere(
  held: { sheetKey: SheetKey } | null,
  here: SheetKey
): boolean {
  return held !== null && held.sheetKey !== here;
}

/** What a click on the drawing becomes while the count tool may be held. */
export function markForClick<G extends { sheetKey: SheetKey }>(
  held: G | null,
  here: SheetKey,
  sheetId: number | null,
  at: { x: number; y: number }
): { group: G; sheetId: number; x: number; y: number } | null {
  const group = heldOnSheet(held, here);
  if (group === null || sheetId === null) return null;
  return { group, sheetId, x: at.x, y: at.y };
}
