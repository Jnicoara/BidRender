/**
 * SEVERAL LOOKS FOR ONE LEGEND ITEM — the rules both ends read.
 * references/multiple-looks-plan.md; the table is `symbol_looks` (0102).
 *
 * A LOOK is one picture of how an item is drawn on some plan set, with the
 * box it was captured with. An item keeps ONE name, ONE count, ONE price,
 * however many looks it has.
 *
 * ── A look is per plan set (owner, 2026-10-05) ──────────────────────────────
 * The same-looking symbol can mean different things on different plan sets:
 * on Old Blueridge a half-filled duplex is a duplex above the backsplash
 * (its NOTE 7), not the GFCI it is on other sets. So a look saved from
 * ANOTHER set may SUGGEST a match, but never labels one on this set until
 * this set's own legend confirms the item. Here, "confirmed on this set"
 * means a look of the item captured on this plan set, or the symbol boxed on
 * this sheet for the search. `lookConfirmsSet` is that test, and
 * @/lib/lookMatching flags every find that only another set's look made.
 */

/** Looks searched at once, this set's first (plan § 9 Q4, decided). */
export const MAX_LOOKS_PER_SEARCH = 5;
/** Two boxes on one sheet this close (points, every edge) are one look. */
export const SAME_LOOK_POINTS = 3;

export type LookBox = { x: number; y: number; width: number; height: number };

export type LookRow = {
  id: number;
  bidPdfId: number | null;
  sheetId: number | null;
  box: LookBox | null;
  createdAt: Date | string;
};

/** The same picture captured twice: one sheet, boxes within a few points. */
export function isSameLook(
  a: { sheetId: number | null; box: LookBox | null },
  b: { sheetId: number | null; box: LookBox | null }
): boolean {
  if (a.sheetId === null || a.sheetId !== b.sheetId || !a.box || !b.box)
    return false;
  const close = (p: number, q: number) => Math.abs(p - q) <= SAME_LOOK_POINTS;
  return (
    close(a.box.x, b.box.x) &&
    close(a.box.y, b.box.y) &&
    close(a.box.x + a.box.width, b.box.x + b.box.width) &&
    close(a.box.y + a.box.height, b.box.y + b.box.height)
  );
}

/** A look captured on the open plan set: that set's legend confirms it. */
export function lookConfirmsSet(
  look: { bidPdfId: number | null },
  openBidPdfId: number
): boolean {
  return look.bidPdfId !== null && look.bidPdfId === openBidPdfId;
}

/**
 * The looks a search uses: only those with a box (a box-less look has
 * nothing to rebuild a symbol from), this set's first, then newest first,
 * at most MAX_LOOKS_PER_SEARCH.
 */
export function looksForSearch<T extends LookRow>(
  looks: readonly T[],
  openBidPdfId: number
): T[] {
  const time = (l: T) => new Date(l.createdAt).getTime();
  return looks
    .filter(l => l.box !== null)
    .sort(
      (p, q) =>
        Number(lookConfirmsSet(q, openBidPdfId)) -
          Number(lookConfirmsSet(p, openBidPdfId)) ||
        time(q) - time(p) ||
        q.id - p.id
    )
    .slice(0, MAX_LOOKS_PER_SEARCH);
}

/**
 * How many looks an item shows: its look rows, or — with none — one for an
 * old captured picture (plan § 2: read, never backfilled), or none.
 */
export function lookCount(rows: number, legacyThumbnail: boolean): number {
  return rows > 0 ? rows : legacyThumbnail ? 1 : 0;
}

/**
 * The picture the item shows after one of its looks is removed (plan § 5).
 *
 * `symbol_links.thumbnail` is what the legend row and the Reader show. When
 * the removed look IS that picture, the item takes its first remaining look
 * (the oldest), or none when no look is left — "Removing the LAST look
 * leaves the item with no picture". Otherwise the shown picture stays.
 * `remaining` is in any order; only createdAt and id decide which is first.
 */
export function thumbnailAfterRemoval(
  shown: string | null,
  removed: { thumbnail: string | null },
  remaining: readonly {
    id: number;
    thumbnail: string | null;
    createdAt: Date | string;
  }[]
): string | null {
  if (shown === null || shown !== removed.thumbnail) return shown;
  const time = (l: { createdAt: Date | string }) =>
    new Date(l.createdAt).getTime();
  const first = [...remaining]
    .filter(l => l.thumbnail !== null)
    .sort((p, q) => time(p) - time(q) || p.id - q.id)[0];
  return first?.thumbnail ?? null;
}
