/**
 * F13 — A LOCKED BID'S WARNING COUNTS ARE FROZEN AT LOCK TIME (owner,
 * 2026-10-12; references/baseline-screen-plan.md § 9 F13).
 *
 * A lock freezes a bid's quantities (`quantitiesLockedAt`), and its marks and
 * runs cannot be edited. But the warnings the server counts on top of them
 * read the LIBRARY live:
 *   - "N drops not priced" (`bidDropsNotPriced`) reads each assembly's mount
 *     type and the company's heights;
 *   - the plan warnings (`planAttentionFor`) read run types and recipes.
 * So a library edit moved a sent bid's warnings, with nothing on the bid
 * having changed. The owner's rule: locked, those counts hold what they said
 * at the lock; unlocked, the live count shows again.
 *
 * ── Which counts ─────────────────────────────────────────────────────────────
 * Exactly the server-side ones below. The bid screen's other strips (not
 * priced, hours missing, example prices, part changed) are read from the bid
 * LINES, whose snapshots are already frozen; they hold still on a locked bid
 * without help. `partChanged` is empty on a locked bid by construction
 * (`bridgeForBid` plans nothing there).
 *
 * ── Where the frozen value lives: WAITS ON TRACK A ───────────────────────────
 * One nullable JSON column, `bids.lockedWarnings` (draft "F13-M1" in
 * references/track-c-handoff.md). Until it exists, nothing calls `freezeAt` or
 * reads a frozen value, and every bid shows live counts, as today. This
 * module is the rule, tested, so the wiring is three call sites once the
 * column lands.
 */

/** The server-side warning counts a bid screen shows. */
export type WarningCounts = {
  dropsNotPriced: number;
  waitingToSend: number;
  countedWithNoPrice: number;
  doubleCounted: string[];
  runsWithNoWire: number;
  /** `runsNotOnBid` as the strip reads it (shared/runsNotOnBid.ts). */
  runsNotOnBid: unknown;
};

/** What `bids.lockedWarnings` holds: the counts, and when they were taken. */
export type FrozenWarnings = { at: string; counts: WarningCounts };

/** The value the lock writes: the counts in effect at that instant. */
export function freezeAt(counts: WarningCounts, at: Date): FrozenWarnings {
  return { at: at.toISOString(), counts: structuredClone(counts) };
}

/**
 * The counts a bid SHOWS.
 *
 *   locked, frozen  → the frozen counts, whatever the live ones say now;
 *   locked, none    → live. A bid locked before the column existed was never
 *                     frozen, and freezing it on a READ would be a write
 *                     because somebody looked. Its first unlock-and-relock
 *                     freezes it;
 *   unlocked        → live, always, even if a stale frozen value is still
 *                     stored. Unlock clears it, but the rule does not rely
 *                     on that.
 */
export function shownWarningCounts(
  bid: { quantitiesLockedAt: Date | string | null; lockedWarnings: unknown },
  live: WarningCounts
): { counts: WarningCounts; frozenAt: string | null } {
  if (bid.quantitiesLockedAt === null) return { counts: live, frozenAt: null };
  const frozen = asFrozen(bid.lockedWarnings);
  return frozen
    ? { counts: frozen.counts, frozenAt: frozen.at }
    : { counts: live, frozenAt: null };
}

/** A stored value read back, or null if it is not one this module wrote. */
function asFrozen(value: unknown): FrozenWarnings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<FrozenWarnings>;
  if (typeof v.at !== "string" || !v.counts || typeof v.counts !== "object")
    return null;
  return v as FrozenWarnings;
}
