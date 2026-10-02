/**
 * Switches for the parts of "Check sheet" that need a column Track A has not
 * added yet (requests in todo.md, unnumbered — A numbers migrations). Each is
 * OFF, and while it is off the screen says what it would do rather than
 * pretending to do it. 2026-10-01.
 */

/**
 * `takeoff_stamps.mountHeightInches` + `mountHeightSource`. Until then a
 * height read beside a mark is SHOWN, never saved onto the mark.
 */
export const MARK_HEIGHT_COLUMN = false;

/**
 * `takeoff_stamps.checkAcceptedAt`. Until then "Keep" on a mark the check
 * questioned lasts for this check only; the next check asks again.
 */
export const MARK_CHECK_ACCEPTED_COLUMN = false;
