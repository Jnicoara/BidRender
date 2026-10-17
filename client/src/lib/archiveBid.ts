/**
 * The guard in front of removing a bid, and what it says.
 *
 * ── Why this is a module and not just a dialog ───────────────────────────────
 * Removing a bid is offered from two places — the Dashboard board and the Bids
 * list — and an audit found them disagreeing: the Dashboard asked first, the
 * Bids list archived on a single click of a trash can. One of them had been
 * built before the archive existed and never revisited.
 *
 * Two copies of a safety prompt is how that happens. The wording and the
 * request→confirm step both live here so a third caller cannot invent a
 * quieter version of either.
 *
 * ── Archive, never delete ────────────────────────────────────────────────────
 * There is deliberately no hard-delete path for a bid anywhere in the app. This
 * asks to ARCHIVE, `bids.archive` is what it calls, and the copy says so —
 * a dialog that threatens deletion for something recoverable teaches people to
 * fear a safe action, which is its own kind of wrong.
 *
 * Permanent deletion exists only in the Archive screen, only for something
 * already archived, and the server refuses it otherwise.
 */
import { RETENTION_DAYS } from "@shared/retention";

/** The bid a confirmation is pending for. */
export type PendingArchive = { id: number; name: string };

/**
 * What the dialog says.
 *
 * States the destination, the window, and that nothing is lost meanwhile —
 * in that order, because the first question is "where does it go" and the
 * second is "can I get it back".
 */
export function archiveConfirmCopy(bidName: string): {
  title: string;
  body: string;
} {
  return {
    title: `Archive “${bidName}”?`,
    body:
      `This bid moves to Recently deleted and is deleted for good in ${RETENTION_DAYS} days ` +
      `unless you restore it. Nothing about it changes in the meantime — its line items, ` +
      `pricing, plans and status all stay exactly as they are, and you can put it back at ` +
      `any point in that window.`,
  };
}

/** What the caller should do next, once the user has answered. */
export type ArchiveDecision =
  /** Nothing happens. The bid is untouched. */
  | { action: "none" }
  /** Run the archive mutation for this bid. */
  | { action: "archive"; id: number };

/**
 * Turn an answer into an instruction.
 *
 * The whole point is the `cancel` and `dismiss` branches: neither can produce
 * an `archive`, whatever was pending. That is the guarantee an accidental click
 * relies on, and it is why this is a function that can be tested rather than a
 * condition buried in a click handler.
 */
export function resolveArchiveAnswer(
  pending: PendingArchive | null,
  answer: "confirm" | "cancel" | "dismiss"
): ArchiveDecision {
  if (answer !== "confirm") return { action: "none" };
  // Confirming with nothing pending cannot archive anything — a stray Enter on
  // a closing dialog must not act on whatever was last selected.
  if (!pending) return { action: "none" };
  return { action: "archive", id: pending.id };
}
