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
 * nothing rather than being priced as new parts. An `unconfirmed` mark is
 * nobody's answer yet.
 *
 * ── Rule 2: a run never snaps to an UNCONFIRMED mark ───────────────────────
 * A snap COPIES the mark's position into the run's points, so a misplaced AI
 * mark becomes a wrong length the moment someone traces to it (measured on
 * staging's E-100: up to about 2.4 in of paper off, about 10 ft at
 * 1/4" = 1'-0" — todo.md, WRONG-NUMBER RISK). Every confirmed status is a real
 * device at a real spot, so only `unconfirmed` is excluded.
 *
 * Both rules live HERE, tested, and the server's SQL filter and the snap read
 * them — so the list of what counts cannot be written twice and drift.
 */
import type { MARK_STATUSES } from "../drizzle/schema";

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
