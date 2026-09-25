/**
 * Which sheet thumbnail to draw next: the ones on screen first.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Thumbnails used to be drawn in page order, 1, 2, 3 … while the grid was
 * open. One takes about 0.6s (measured on a 500-sheet set, 2026-09-25), so
 * scrolling the grid to sheet 400 meant roughly four minutes of waiting for
 * the 399 above it — pictures being drawn for sheets nobody was looking at,
 * while the ones in front of them stayed grey.
 *
 * Now each surface that shows thumbnails reports the pages it has on screen,
 * and the next render is always the most wanted page not yet drawn: what is
 * visible, then a few either side so a small scroll lands on finished
 * pictures. A page that scrolls away drops out of the wants and is never
 * drawn for nothing.
 *
 * ── What does NOT change ─────────────────────────────────────────────────────
 * Still one at a time, and still only while something is showing thumbnails
 * (references/plan-viewer-overhaul.md § 4a): the worker is one queue, and a
 * background pass would sit in front of the sharp patch for the sheet being
 * read. No range reported means no wants, which means no renders.
 */

/** A run of page numbers on screen, both ends included. */
export type VisibleRange = { first: number; last: number };

/** How many sheets past each edge of the visible run to draw ahead. */
export const THUMBNAIL_LOOKAHEAD = 6;

/**
 * Every page worth a thumbnail right now, most wanted first.
 *
 * Ranges are in priority order and null ones are skipped. Within a range: the
 * visible pages in order, then the neighbours, nearest first, BELOW before
 * ABOVE at each distance because people mostly scroll down.
 */
export function thumbnailWants(
  ranges: readonly (VisibleRange | null)[],
  pageCount: number,
  lookahead: number = THUMBNAIL_LOOKAHEAD
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (page: number) => {
    if (page < 1 || page > pageCount || seen.has(page)) return;
    seen.add(page);
    out.push(page);
  };

  for (const range of ranges) {
    if (!range) continue;
    const first = Math.max(1, Math.min(range.first, range.last));
    const last = Math.min(pageCount, Math.max(range.first, range.last));
    if (first > last) continue;
    for (let page = first; page <= last; page++) add(page);
    for (let step = 1; step <= lookahead; step++) {
      add(last + step);
      add(first - step);
    }
  }
  return out;
}

/** The first wanted page that has not been drawn, or null when none is left. */
export function nextThumbnail(
  wants: readonly number[],
  done: ReadonlySet<number>
): number | null {
  for (const page of wants) if (!done.has(page)) return page;
  return null;
}
