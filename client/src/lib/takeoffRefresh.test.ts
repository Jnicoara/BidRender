import { describe, expect, it } from "vitest";
import {
  BID_QUANTITY_QUERIES,
  QUERIES_MOVED_BY,
  type TakeoffChange,
} from "./takeoffRefresh";

const moves = (change: TakeoffChange) => new Set(QUERIES_MOVED_BY[change]);

describe("what each change on the Plans screen must refresh", () => {
  it("removing a mark moves the runs that ended on it", () => {
    // The gap found 2026-09-27: removal refreshed the marks only.
    const removed = moves("markRemoved");
    for (const q of [
      "takeoffRuns.listForSheet",
      "takeoffRuns.totals",
      "takeoffRuns.drops",
      "takeoffRunTypes.bridgeForBid",
    ] as const) {
      expect(removed.has(q), q).toBe(true);
    }
  });

  it("removing a plan set moves every bid-wide figure", () => {
    // The gap found 2026-09-27: removal refreshed only the list of plans.
    const removed = moves("planRemoved");
    for (const q of BID_QUANTITY_QUERIES) expect(removed.has(q), q).toBe(true);
    expect(removed.has("takeoffRuns.typeColors")).toBe(true);
    expect(removed.has("bidPdfs.list")).toBe(true);
  });

  it("a job height moves what Send would put on the bid", () => {
    // The gap found 2026-09-27: heights refreshed the runs, not the bridge.
    expect(moves("heights").has("takeoffRunTypes.bridgeForBid")).toBe(true);
  });

  it("a run change refreshes the count list the quantity lock is read from", () => {
    // TakeoffPage reads `quantitiesLockedAt` off takeoffGroups.list on the
    // understanding that run changes refresh it. This makes that true.
    expect(moves("run").has("takeoffGroups.list")).toBe(true);
  });

  it("every change that can move a run moves every bid quantity", () => {
    const runMovers: TakeoffChange[] = [
      "run",
      "markRemoved",
      "sheet",
      "planRemoved",
      "heights",
    ];
    for (const change of runMovers) {
      const set = moves(change);
      for (const q of BID_QUANTITY_QUERIES) {
        expect(set.has(q), `${change} → ${q}`).toBe(true);
      }
    }
  });

  /*
    CHANGED 2026-09-29 (held-migrations plan § 3). This asserted that placing
    marks did NOT refresh the totals, on the reasoning that placing never
    moves a run's end. That reasoning still holds for the per-sheet run list,
    which is still left alone — but a mark in a count with a DROP adds pipe
    and wire to the bid, so every bid quantity now has to move with it.
  */
  it("placing marks moves the bid's quantities, not the sheet's run list", () => {
    for (const q of BID_QUANTITY_QUERIES) {
      expect(moves("marksPlaced").has(q), q).toBe(true);
    }
    expect(moves("marksPlaced").has("takeoffRuns.listForSheet")).toBe(false);
  });

  /*
    ADDED 2026-09-29 (owner): after deleting marks or undoing drops, the bid
    lines and the materials list must update right away. Both were missing
    from every list here, so each kept its cached answer.
  */
  it("deleting marks or undoing drops refreshes the bid's lines and the materials list", () => {
    for (const change of ["markRemoved", "groupDrop"] as const) {
      const set = moves(change);
      for (const q of ["bids.get", "materialsList.get"] as const) {
        expect(set.has(q), `${change} → ${q}`).toBe(true);
      }
    }
  });

  it("changing a count's drop moves every bid quantity and the count row", () => {
    for (const q of BID_QUANTITY_QUERIES) {
      expect(moves("groupDrop").has(q), q).toBe(true);
    }
    expect(moves("groupDrop").has("takeoffGroups.list")).toBe(true);
  });
});
