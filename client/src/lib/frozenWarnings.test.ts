import { describe, expect, it } from "vitest";
import { frozenWarningsNote } from "./frozenWarnings";
import type { WarningCounts } from "@shared/lockedWarnings";

const none: WarningCounts = {
  dropsNotPriced: 0,
  waitingToSend: 0,
  countedWithNoPrice: 0,
  doubleCounted: [],
  runsWithNoWire: 0,
  runsNotOnBid: { notSent: 0, noType: 0 },
};
const AT = "2026-10-12T20:00:00.000Z";

describe("the 'as at the lock' note (F13)", () => {
  it("says when the counts were frozen, when one is showing", () => {
    expect(frozenWarningsNote(AT, { ...none, dropsNotPriced: 2 })).toBe(
      "These warnings are as counted when this bid was locked, Oct 12. Unlock it to count them again."
    );
    expect(
      frozenWarningsNote(AT, {
        ...none,
        runsNotOnBid: { notSent: 0, noType: 1 },
      })
    ).not.toBeNull();
  });

  it("says nothing on a bid showing live counts, or with no warning showing", () => {
    expect(frozenWarningsNote(null, { ...none, dropsNotPriced: 2 })).toBeNull();
    expect(frozenWarningsNote(AT, none)).toBeNull();
  });
});
