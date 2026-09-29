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

  it("placing marks leaves the runs alone", () => {
    // Marks are placed a click at a time; refetching every run figure on
    // each batch would cost for nothing, since placing never moves an end.
    expect(moves("marksPlaced").has("takeoffRuns.totals")).toBe(false);
    expect(moves("marksPlaced").has("takeoffGroups.list")).toBe(true);
  });
});
