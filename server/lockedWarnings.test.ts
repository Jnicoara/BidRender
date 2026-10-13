/**
 * F13: a locked bid's warning counts hold what they said at the lock
 * (shared/lockedWarnings.ts). The rule only — the column it reads
 * (`bids.lockedWarnings`) waits on Track A; see the track-c handoff.
 */
import { describe, expect, it } from "vitest";
import {
  freezeAt,
  shownWarningCounts,
  type WarningCounts,
} from "../shared/lockedWarnings";

const counts = (dropsNotPriced: number): WarningCounts => ({
  dropsNotPriced,
  waitingToSend: 1,
  countedWithNoPrice: 0,
  doubleCounted: [],
  runsWithNoWire: 2,
  runsNotOnBid: { runs: 0 },
});

const LOCKED = new Date("2026-10-12T20:00:00Z");

describe("locked warning counts (F13)", () => {
  it("a locked bid shows the counts frozen at the lock, not the live ones", () => {
    const frozen = freezeAt(counts(3), LOCKED);
    const shown = shownWarningCounts(
      { quantitiesLockedAt: LOCKED, lockedWarnings: frozen },
      // A library edit since: the live count moved to 9.
      counts(9)
    );
    expect(shown.counts.dropsNotPriced).toBe(3);
    expect(shown.frozenAt).toBe(LOCKED.toISOString());
  });

  it("unlocked shows the live count again, even with a stale frozen value stored", () => {
    const shown = shownWarningCounts(
      { quantitiesLockedAt: null, lockedWarnings: freezeAt(counts(3), LOCKED) },
      counts(9)
    );
    expect(shown.counts.dropsNotPriced).toBe(9);
    expect(shown.frozenAt).toBeNull();
  });

  it("a bid locked before freezing existed shows live, and is not frozen by a read", () => {
    const shown = shownWarningCounts(
      { quantitiesLockedAt: LOCKED, lockedWarnings: null },
      counts(9)
    );
    expect(shown).toEqual({ counts: counts(9), frozenAt: null });
  });

  it("the frozen value is a copy: changing the live object later cannot reach it", () => {
    const live = counts(3);
    const frozen = freezeAt(live, LOCKED);
    live.dropsNotPriced = 9;
    (live.doubleCounted as string[]).push("x");
    expect(frozen.counts.dropsNotPriced).toBe(3);
    expect(frozen.counts.doubleCounted).toEqual([]);
  });

  it("ignores a stored value it did not write", () => {
    const shown = shownWarningCounts(
      { quantitiesLockedAt: LOCKED, lockedWarnings: { nonsense: true } },
      counts(9)
    );
    expect(shown.counts.dropsNotPriced).toBe(9);
  });
});
