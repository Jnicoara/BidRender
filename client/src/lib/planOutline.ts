/**
 * Does opening this plan need its bookmark outline read?
 *
 * The outline only NAMES sheet rows that do not exist yet (`ensureSheets`,
 * server/routers/bidPdfsRouter.ts: a page that already has a row is skipped,
 * and its name is never touched). So once every page has a row — from the
 * first open of a set onwards — reading it is pure cost.
 *
 * And the cost is large on a big set. Resolving each bookmark to its page
 * makes pdf.js fetch that page's object, so on the 500-sheet test set the read
 * walked the WHOLE 270 MB file in 1 MB ranges for ~30 s after sheet 1 drew,
 * through the same worker every sheet render waits on (measured 2026-10-15,
 * Track B stress pass; references/stress-results-b.md round 3). That undid
 * the range loading of plan-viewer-overhaul § 17.3 on every open.
 *
 * `sheetPages` null = the rows are not known yet: read it, as before — a
 * wasted read is slower, a skipped one would name new sheets "Sheet N".
 */
export function outlineNeeded(
  pageCount: number,
  sheetPages: readonly number[] | null
): boolean {
  if (sheetPages === null) return true;
  const have = new Set(sheetPages);
  for (let page = 1; page <= pageCount; page++)
    if (!have.has(page)) return true;
  return false;
}
