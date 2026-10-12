/**
 * What a mark's STATUS lets it do — the two rules every reader goes through.
 *
 * A mark carries `takeoff_stamps.status` (0098, 0103): NULL or `new`,
 * `existing`, `remove`, `relocate`, `unconfirmed`. NULL is every mark placed
 * before the column existed, and it means `new`.
 *
 * ── Rule 1: only a NEW mark is a quantity ──────────────────────────────────
 * An existing device to remain is already on the wall. Priced as new, it is
 * a bid charging for material and labor nobody will buy or do — the failure
 * this app is built against, with nothing on screen to say so. So a mark
 * counts toward a bid line, the materials list, the export and the drops ONLY
 * when it is new. `remove` and `relocate` are not new devices either; what
 * they cost (demo labor, relocation labor) is the owner's open decision
 * (todo.md, the mark-status entry), and until it is made they count toward
 * nothing rather than being priced as new parts — and the count's card SAYS
 * so (`unpricedStatusNote`), so the omission is never silent. An
 * `unconfirmed` mark is nobody's answer yet.
 *
 * ── Rule 2: a run never snaps to an UNCONFIRMED mark ───────────────────────
 * A snap COPIES the mark's position into the run's points, so a misplaced AI
 * mark becomes a wrong length the moment someone traces to it (measured on
 * staging's E-100: up to about 2.4 in of paper off, about 10 ft at
 * 1/4" = 1'-0" — todo.md, WRONG-NUMBER RISK). Every confirmed status is a real
 * device at a real spot, so only `unconfirmed` is excluded.
 *
 * Both rules live HERE, tested, and the server's SQL filter (`markIsQuantity`
 * in server/db.ts) and the snap read them — so the list of what counts cannot
 * be written twice and drift. Written by Track A and Track B the same day,
 * 2026-10-05, and merged into this one file; `isPricedMark` is the B name for
 * rule 1 and is rule 1, not a copy of it.
 */
import { MARK_STATUSES } from "../drizzle/schema";

export { MARK_STATUSES };
export type MarkStatus = (typeof MARK_STATUSES)[number];

/** The statuses whose marks are quantities. NULL counts too: it means new. */
export const QUANTITY_MARK_STATUSES = [
  "new",
] as const satisfies readonly MarkStatus[];

/** Rule 1: does this mark count toward a bid line, the list, the drops? */
export function markCountsAsQuantity(status: MarkStatus | null): boolean {
  return (
    status === null ||
    (QUANTITY_MARK_STATUSES as readonly string[]).includes(status)
  );
}

/** Rule 2: may a run snap to (and take its point from) this mark? */
export function markIsSnapTarget(status: MarkStatus | null): boolean {
  return status !== "unconfirmed";
}

export function isMarkStatus(value: unknown): value is MarkStatus {
  return (
    typeof value === "string" &&
    (MARK_STATUSES as readonly string[]).includes(value)
  );
}

/** What a stored value means. NULL, or anything unknown, is `new`. */
export function markStatusOf(value: string | null | undefined): MarkStatus {
  return isMarkStatus(value) ? value : "new";
}

/** Rule 1 for a row: `markCountsAsQuantity` on whatever status it carries. */
export function isPricedMark(mark: { status?: string | null }): boolean {
  return markCountsAsQuantity(
    mark.status == null ? null : markStatusOf(mark.status)
  );
}

/**
 * The statuses a PERSON sets from "Mark as…". `unconfirmed` is not one: it
 * is what the reader and Find all matching put on a mark nobody has checked,
 * and the way out of it is confirming the mark, not choosing it.
 */
export const USER_MARK_STATUSES = [
  "new",
  "existing",
  "remove",
  "relocate",
] as const satisfies readonly MarkStatus[];
export type UserMarkStatus = (typeof USER_MARK_STATUSES)[number];

export function isUserMarkStatus(value: unknown): value is UserMarkStatus {
  return (
    typeof value === "string" &&
    (USER_MARK_STATUSES as readonly string[]).includes(value)
  );
}

/** The estimator's words, for menus and tooltips. */
export const MARK_STATUS_LABEL: Record<MarkStatus, string> = {
  new: "New",
  existing: "Existing to remain",
  remove: "Remove",
  relocate: "Relocate",
  unconfirmed: "Unconfirmed",
};

export type StatusSplit = Record<MarkStatus, number>;

export function emptySplit(): StatusSplit {
  return { new: 0, existing: 0, remove: 0, relocate: 0, unconfirmed: 0 };
}

/** How many marks of each status. */
export function statusSplit(
  marks: readonly { status?: string | null }[]
): StatusSplit {
  const split = emptySplit();
  for (const m of marks) split[markStatusOf(m.status)] += 1;
  return split;
}

/**
 * The split in words — "12 new · 4 existing · 1 remove" — or null when every
 * mark is new, which is the ordinary case and needs no sentence. In words
 * because a pin's fill is invisible on a printout and to some eyes (pin plan
 * § 7).
 */
export function statusSplitText(split: StatusSplit): string | null {
  if (MARK_STATUSES.every(s => s === "new" || split[s] === 0)) return null;
  return MARK_STATUSES.filter(s => split[s] > 0)
    .map(s => `${split[s]} ${s}`)
    .join(" · ");
}

/**
 * What the card says about the marks that are NOT on the bid, or null. The
 * omission is stated, never silent: an existing device is correctly free, but
 * a removal or relocation has labor nobody has priced yet.
 */
export function unpricedStatusNote(
  split: StatusSplit,
  /**
   * Which kinds already have their remove / relocate LABOR line on the bid
   * (shared/roleLines.ts, built 2026-10-10). Those are no longer "not on the
   * bid", so they drop out of the sentence. Absent = neither, which is what
   * this said before the lines existed.
   */
  laborOnBid: { remove: boolean; relocate: boolean } = {
    remove: false,
    relocate: false,
  }
): string | null {
  // Short: it sits under a count's name in a narrow panel (three lines long
  // on the first screen check, 2026-10-05).
  const parts: string[] = [];
  if (split.existing > 0) parts.push(`${split.existing} existing — not priced`);
  const remove = laborOnBid.remove ? 0 : split.remove;
  const relocate = laborOnBid.relocate ? 0 : split.relocate;
  const labor = remove + relocate;
  if (labor > 0)
    parts.push(
      `${labor} ${remove > 0 && relocate > 0 ? "remove/relocate" : remove > 0 ? "remove" : "relocate"} — labor not on the bid`
    );
  if (split.unconfirmed > 0)
    parts.push(`${split.unconfirmed} unconfirmed — not counted until checked`);
  return parts.length > 0 ? parts.join(". ") : null;
}

// ─── The bid's status view (status-and-scope-plan § 1a / 1b) ─────────────────

/**
 * The words the status bar uses (owner, 2026-10-10, plan § 8 Q2): "staying"
 * for `existing`, short on a chip; "existing to remain" stays in the tooltip
 * (`MARK_STATUS_LABEL`). Past tense for the two that are work to do.
 */
export const STATUS_VIEW_WORD: Record<MarkStatus, string> = {
  new: "new",
  existing: "staying",
  remove: "removed",
  relocate: "relocated",
  unconfirmed: "unconfirmed",
};

/** One grouped row of marks: how many of one status, on one sheet, in one count. */
export type StatusSplitRow = {
  groupId: number | null;
  sheetId: number;
  status: string | null;
  total: number;
};

/**
 * Per count — what the count card says. A mark with no count is left out,
 * as it always was, so the cards and the bid's bar read the same rows and
 * cannot disagree.
 */
export function splitsByGroup(
  rows: readonly StatusSplitRow[]
): Map<number, StatusSplit> {
  const out = new Map<number, StatusSplit>();
  for (const row of rows) {
    if (row.groupId === null) continue;
    const split = out.get(row.groupId) ?? emptySplit();
    split[markStatusOf(row.status)] += Number(row.total);
    out.set(row.groupId, split);
  }
  return out;
}

/** Per sheet, from the SAME rows — so "12 removed" can be found sheet by sheet. */
export function splitsBySheet(
  rows: readonly StatusSplitRow[]
): Map<number, StatusSplit> {
  const out = new Map<number, StatusSplit>();
  for (const row of rows) {
    if (row.groupId === null) continue;
    const split = out.get(row.sheetId) ?? emptySplit();
    split[markStatusOf(row.status)] += Number(row.total);
    out.set(row.sheetId, split);
  }
  return out;
}

/** The whole bid: the count cards' splits added up. */
export function sumSplits(splits: Iterable<StatusSplit>): StatusSplit {
  const total = emptySplit();
  for (const split of Array.from(splits))
    for (const s of MARK_STATUSES) total[s] += split[s];
  return total;
}

/**
 * Whether the bar is shown at all. Only when some mark is NOT new: a bid
 * that never set a status is the basic path, and "30 new" alone says nothing
 * the count cards do not.
 */
export function statusViewWanted(total: StatusSplit): boolean {
  return MARK_STATUSES.some(s => s !== "new" && total[s] > 0);
}

/**
 * The bar's parts, in order: "30 new · 8 staying · 12 removed · 4
 * relocated", always those four once the bar shows (a 0 is an answer), and
 * "unconfirmed" only when there are any (plan § 1b).
 */
export function statusViewParts(
  total: StatusSplit
): { status: MarkStatus; count: number; word: string }[] {
  return MARK_STATUSES.filter(s => s !== "unconfirmed" || total[s] > 0).map(
    s => ({ status: s, count: total[s], word: STATUS_VIEW_WORD[s] })
  );
}

/**
 * How visible a mark is while the bar has one status picked. VIEW ONLY:
 * nothing is filtered out of a count or off the bid, the others are only
 * dimmed — still there, still clickable, still counted.
 */
export const STATUS_FOCUS_DIM_OPACITY = 0.18;
export function markFocusOpacity(
  status: string | null | undefined,
  focus: MarkStatus | null
): number {
  if (focus === null) return 1;
  return markStatusOf(status) === focus ? 1 : STATUS_FOCUS_DIM_OPACITY;
}

// ─── "Check them": stepping through the unconfirmed marks (plan § 1c) ────────

/** An unconfirmed mark, as the walk-through needs it. */
export type MarkToCheck = { id: number; sheetId: number };

/**
 * The next unconfirmed mark to look at, after `afterId`, in the list's order
 * (the server sorts it by sheet, then down and across the drawing), wrapping
 * to the start. Skipped marks are passed over; answered ones are gone from
 * the list by the time it is asked again, and `answered` hides them before
 * the refetch lands, so the walk never shows a mark twice. Null = nothing
 * left that was not skipped.
 */
export function nextMarkToCheck(
  list: readonly MarkToCheck[],
  skipped: ReadonlySet<number>,
  answered: ReadonlySet<number>,
  afterId: number | null
): MarkToCheck | null {
  const open = list.filter(m => !answered.has(m.id));
  if (open.length === 0) return null;
  const from = afterId === null ? -1 : list.findIndex(m => m.id === afterId);
  const ordered =
    from < 0
      ? open
      : [
          ...list.slice(from + 1).filter(m => !answered.has(m.id)),
          ...list.slice(0, from + 1).filter(m => !answered.has(m.id)),
        ];
  return ordered.find(m => !skipped.has(m.id)) ?? null;
}
