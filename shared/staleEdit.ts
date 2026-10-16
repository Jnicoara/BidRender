/**
 * "Someone saved this after you opened it" — the guard for an editor that
 * saves its WHOLE form (2026-10-15 night, break-it).
 *
 * The assembly editor sends every field on Save. With two people in one
 * company (or one person in two tabs) on the same assembly, the second Save
 * silently put back everything the first had changed: seen on screen, a
 * quantity changed to 4 by one person went back to 1 when another renamed
 * the assembly, and the second person was told "Assembly saved."
 *
 * So the editor sends the `updatedAt` it opened with, and the server refuses
 * when the row has been saved since — in words, changing nothing. The
 * column is a MySQL TIMESTAMP, which keeps whole seconds, so the comparison
 * is in whole seconds too: two saves inside the same second slip through,
 * which is the cost of using the column every row already has rather than a
 * migration.
 */
export const STALE_EDIT_MESSAGE =
  "Someone saved this after you opened it. Close it and open it again to see their change, then make yours.";

/** Whole seconds, the precision the column keeps. */
const seconds = (at: Date | string | number) =>
  Math.floor(new Date(at).getTime() / 1000);

/**
 * True when the stored row was saved after the editor opened it. An editor
 * that sends nothing (an older client, a script) is never refused — the
 * guard is something a caller opts into, so nothing that worked stops.
 */
export function savedSinceOpened(
  storedUpdatedAt: Date | string | number,
  openedWith: Date | string | number | null | undefined
): boolean {
  if (openedWith === null || openedWith === undefined) return false;
  return seconds(storedUpdatedAt) !== seconds(openedWith);
}
