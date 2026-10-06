import { describe, expect, it } from "vitest";
import {
  BID_QUANTITY_QUERIES,
  QUERIES_MOVED_BY,
  type TakeoffChange,
  sheetsToRefresh,
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

describe("undo and clearing a sheet (Track B, 2026-09-29)", () => {
  it("move every bid figure, the marks and the runs", () => {
    for (const change of ["undo", "sheetCleared"] as const) {
      const set = moves(change);
      for (const q of [
        ...BID_QUANTITY_QUERIES,
        "takeoffStamps.listForSheet",
        "takeoffRuns.listForSheet",
        "takeoffRuns.typeColors",
      ] as const)
        expect(set.has(q), `${change} → ${q}`).toBe(true);
    }
  });

  it("refresh the STEP's sheet as well as the open one", () => {
    // Undo pressed on sheet 4 for a step taken on sheet 2.
    expect(sheetsToRefresh(4, 2)).toEqual([4, 2]);
    expect(sheetsToRefresh(4, 4)).toEqual([4]);
    expect(sheetsToRefresh(null, 2)).toEqual([2]);
    expect(sheetsToRefresh(4, undefined)).toEqual([4]);
  });
});

describe("a change to a run's ends (the drop)", () => {
  it("moves the bid's lines, the materials list and the Send preview", () => {
    // The gap found 2026-09-29: the ends editor refreshed takeoffRuns only.
    const set = moves("runEnds");
    for (const q of [
      "bids.get",
      "materialsList.get",
      "takeoffRunTypes.bridgeForBid",
      "takeoffRuns.totals",
      "takeoffRuns.drops",
      "takeoffRuns.listForSheet",
    ] as const)
      expect(set.has(q), q).toBe(true);
  });
});

describe("the whole-set summary and sending to the bid (2026-09-29)", () => {
  it("every change kind moves the summary, since it states every quantity", () => {
    for (const change of Object.keys(QUERIES_MOVED_BY) as TakeoffChange[])
      expect(moves(change).has("takeoffSummary.forBid"), change).toBe(true);
  });

  it("a send moves the bid's lines, the materials list, the counts and the summary", () => {
    // The gap found 2026-09-29: a single count send refetched the count list
    // only, so the bid and the materials list kept their old answer.
    const set = moves("sentToBid");
    for (const q of [
      "bids.get",
      "materialsList.get",
      "takeoffGroups.list",
      "takeoffRunTypes.bridgeForBid",
      "takeoffSummary.forBid",
    ] as const)
      expect(set.has(q), q).toBe(true);
  });
});

describe("renaming a legend symbol (2026-10-01)", () => {
  it("moves everything that shows the count's name", () => {
    // The count's name is read live by the card, the bid line, the
    // materials list and the summary. A rename that refreshed only the
    // legend would leave every one of them showing the old name.
    const set = moves("countRenamed");
    for (const q of [
      "takeoffStamps.listForSheet",
      "takeoffGroups.list",
      "materialsList.get",
      "takeoffSummary.forBid",
      "bids.get",
    ] as const)
      expect(set.has(q), q).toBe(true);
  });
});

describe("linking an assembly to a count (legend plan § 8a, 2026-09-30)", () => {
  it("moves the marks, the count list, the materials list and the summary", () => {
    // A linked count's marks change colour, and the materials list moves it
    // out of "Supplier to price" into itemised parts — both have to show it.
    const set = moves("countSource");
    for (const q of [
      "takeoffStamps.listForSheet",
      "takeoffGroups.list",
      "materialsList.get",
      "takeoffSummary.forBid",
      "bids.get",
    ] as const)
      expect(set.has(q), q).toBe(true);
  });
});
