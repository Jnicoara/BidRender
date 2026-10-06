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
/**
 * Other items' looks searched with a new one for the look-alike check (plan
 * § 4). Each is a full search of the sheet, so the cap is about time.
 */
export const MAX_LOOK_ALIKE_LOOKS = 12;
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

// ── Look-alikes (plan § 4) ───────────────────────────────────────────────────

/** Where a new look found a copy on its own sheet: page points, and how far it reaches. */
export type LookSpot = { x: number; y: number; reach: number };

/** A mark already on that sheet, with the count it belongs to. */
export type SheetMark = {
  x: number;
  y: number;
  /** The count's name (`stampName`). */
  name: string;
  assemblyId: number | null;
};

export type LookAlike = {
  name: string;
  /** Its marks on this sheet the new look lands on. */
  marks: number;
  /** Places on this sheet one of ITS saved looks also finds (plan § 4). */
  spots: number;
};

/**
 * Marks counted as a DIFFERENT item that a new look also lands on — the
 * "GFCI look that is really drawn like a duplex" case, which would turn every
 * duplex into a GFCI. Grouped by count name, most marks first; each mark
 * counted once however many spots reach it.
 *
 * A mark is the item's OWN when its count carries one of the item's names
 * (`isOwn`) or counts the item's assembly — the same item a click on the
 * row would count. Everything else is another item, and is warned about.
 */
export function lookAlikes(
  spots: readonly LookSpot[],
  marks: readonly SheetMark[],
  isOwn: (mark: SheetMark) => boolean
): LookAlike[] {
  const tally = new Map<string, number>();
  for (const mark of marks) {
    if (isOwn(mark)) continue;
    const hit = spots.some(
      s => Math.hypot(s.x - mark.x, s.y - mark.y) <= s.reach
    );
    if (hit) tally.set(mark.name, (tally.get(mark.name) ?? 0) + 1);
  }
  return sortAlikes(
    Array.from(tally, ([name, n]) => ({ name, marks: n, spots: 0 }))
  );
}

/**
 * Add the items whose own saved LOOKS find the same spots as the new look
 * (plan § 4: "or another item's look on this set finds the same spots").
 * Merged by name, so one item is one line however it was found.
 */
export function withLookFinds(
  alikes: readonly LookAlike[],
  found: readonly { name: string; spots: number }[]
): LookAlike[] {
  const byName = new Map(alikes.map(a => [a.name, { ...a }]));
  for (const f of found) {
    if (f.spots <= 0) continue;
    const a = byName.get(f.name) ?? { name: f.name, marks: 0, spots: 0 };
    a.spots += f.spots;
    byName.set(f.name, a);
  }
  return sortAlikes(Array.from(byName.values()));
}

const sortAlikes = (alikes: LookAlike[]) =>
  alikes.sort(
    (p, q) =>
      q.marks + q.spots - (p.marks + p.spots) || p.name.localeCompare(q.name)
  );

/** The warning's words: "8 marks counted as DUPLEX RECEPTACLE", and so on. */
export function lookAlikeWarning(alikes: readonly LookAlike[]): string {
  const parts = alikes.flatMap(a => [
    ...(a.marks > 0
      ? [`${a.marks} mark${a.marks === 1 ? "" : "s"} counted as ${a.name}`]
      : []),
    ...(a.spots > 0
      ? [
          `${a.spots} place${a.spots === 1 ? "" : "s"} a look of ${a.name} also finds`,
        ]
      : []),
  ]);
  const list =
    parts.length <= 1
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `This look also matches ${list} on this sheet. Add it anyway?`;
}

/**
 * The item's FIRST look: the oldest, the picture it was captured with (or
 * its old picture, written as a row when a second was added). Its finds are
 * trusted like the box drawn now; a look ADDED later is not, until someone
 * confirms one of its finds by hand (plan § 4, "from a new look").
 */
export function firstLookId(
  looks: readonly { id: number; createdAt: Date | string }[]
): number | null {
  const time = (l: { createdAt: Date | string }) =>
    new Date(l.createdAt).getTime();
  const [first] = [...looks].sort((p, q) => time(p) - time(q) || p.id - q.id);
  return first?.id ?? null;
}
