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
export function unpricedStatusNote(split: StatusSplit): string | null {
  // Short: it sits under a count's name in a narrow panel (three lines long
  // on the first screen check, 2026-10-05).
  const parts: string[] = [];
  if (split.existing > 0) parts.push(`${split.existing} existing — not priced`);
  const labor = split.remove + split.relocate;
  if (labor > 0)
    parts.push(
      `${labor} ${split.remove > 0 && split.relocate > 0 ? "remove/relocate" : split.remove > 0 ? "remove" : "relocate"} — labor not on the bid`
    );
  if (split.unconfirmed > 0)
    parts.push(`${split.unconfirmed} unconfirmed — not counted until checked`);
  return parts.length > 0 ? parts.join(". ") : null;
}
