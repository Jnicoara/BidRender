/**
 * Switches for the parts of "Check sheet" that need a column Track A has not
 * added yet (requests in todo.md, unnumbered — A numbers migrations). Each is
 * OFF, and while it is off the screen says what it would do rather than
 * pretending to do it. 2026-10-01.
 */

/**
 * `takeoff_stamps.mountHeightInches` + `mountHeightSource` (0098). ON since
 * 2026-10-05: a height read beside a mark is offered ("Use 54"") and saved
 * as `read` only when a person chooses it — never by being read
 * (references/vertical-drops-plan.md § 2). While it was off, a read height
 * was shown and never saved.
 */
export const MARK_HEIGHT_COLUMN = true;

/**
 * `takeoff_stamps.checkAcceptedAt`. Until then "Keep" on a mark the check
 * questioned lasts for this check only; the next check asks again.
 */
export const MARK_CHECK_ACCEPTED_COLUMN = false;
