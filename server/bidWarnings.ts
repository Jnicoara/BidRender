/**
 * F13 — THE SERVER-SIDE WARNING COUNTS A BID SHOWS, frozen on a locked bid
 * (shared/lockedWarnings.ts has the rule and why).
 *
 * One place computes the live counts, and every surface reads through it:
 *   - the lock freezes them (`lockBid`, the Lock button AND `leaveDraft`);
 *   - `bids.get` and the quote panel show them (`warningCountsForBid`);
 *   - the bid lists read the frozen drops in `db.dropsNotPricedForBids`.
 * So the number frozen at the lock and the number shown before it are the
 * same computation, not two that could drift.
 */
import * as db from "./db";
import { planAttentionFor } from "./planAttention";
import {
  frozenWarningsShown,
  type WarningCounts,
} from "../shared/lockedWarnings";

type WarningLine = Parameters<typeof planAttentionFor>[2][number];

/** The counts as the library and the drawing say them NOW. */
export async function liveWarningCounts(
  bidId: number,
  userId: number,
  lines?: readonly WarningLine[]
): Promise<WarningCounts> {
  const [fromPlans, dropsNotPriced] = await Promise.all([
    planAttentionFor(bidId, userId, lines ?? (await db.getBidLineItems(bidId))),
    db.bidDropsNotPriced(bidId, userId),
  ]);
  return { ...fromPlans, dropsNotPriced };
}

/**
 * The counts this bid SHOWS: frozen on a locked bid that has them, live
 * otherwise. `frozenAt` is the lock's instant when they are frozen, so the
 * strip can say "as at the lock". The live counts are not computed when they
 * would not be shown.
 */
export async function warningCountsForBid(
  bid: {
    id: number;
    quantitiesLockedAt: Date | null;
    lockedWarnings: unknown;
  },
  userId: number,
  lines?: readonly WarningLine[]
): Promise<{ counts: WarningCounts; frozenAt: string | null }> {
  const frozen = frozenWarningsShown(bid);
  if (frozen) return { counts: frozen.counts, frozenAt: frozen.at };
  return {
    counts: await liveWarningCounts(bid.id, userId, lines),
    frozenAt: null,
  };
}

/**
 * Just the drops count, for a caller that needs no other warning (the
 * proposal): frozen on a locked bid, as the bid page shows it, so the
 * document and the page it was printed from cannot disagree.
 */
export async function dropsNotPricedShown(
  bid: {
    id: number;
    quantitiesLockedAt: Date | null;
    lockedWarnings: unknown;
  },
  userId: number
): Promise<number> {
  const frozen = frozenWarningsShown(bid);
  return frozen
    ? frozen.counts.dropsNotPriced
    : db.bidDropsNotPriced(bid.id, userId);
}

/** Lock a bid's quantities and freeze its warning counts with them. */
export function lockBid(bidId: number, userId: number, at: Date) {
  return db.lockBidQuantities(bidId, at, () =>
    liveWarningCounts(bidId, userId)
  );
}
