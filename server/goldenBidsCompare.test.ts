/**
 * The golden-bids comparison itself (server/goldenBids.ts). No database: the
 * rules that decide whether a moved number fails the Gate are tested here, so
 * the harness cannot quietly stop failing.
 */
import { describe, expect, it } from "vitest";
import {
  NOT_CHECKED,
  compareGoldenBids,
  describeGoldenDiffs,
  flattenGolden,
  goldenFileProblem,
  updatedGoldenFile,
  type GoldenBid,
} from "./goldenBids";

const bid = (over: Partial<GoldenBid> = {}): GoldenBid => ({
  key: "counts",
  title: "Counts",
  covers: ["counts"],
  checked: NOT_CHECKED,
  lines: [
    {
      key: "Duplex [install]",
      fields: { qty: 7, "breakdown.directCost": 86.1 },
    },
  ],
  totals: { "totals.totalDue": 86.1 },
  ...over,
});

describe("compareGoldenBids", () => {
  it("finds nothing when every number matches", () => {
    expect(compareGoldenBids([bid()], [bid()])).toEqual([]);
  });

  it("names the bid, the line, the field and both values when a number moves", () => {
    const now = bid({
      lines: [
        {
          key: "Duplex [install]",
          fields: { qty: 7, "breakdown.directCost": 86.11 },
        },
      ],
    });
    const diffs = compareGoldenBids([bid()], [now]);
    expect(describeGoldenDiffs(diffs)).toBe(
      'counts · line "Duplex [install]" · breakdown.directCost: 86.1 → 86.11'
    );
  });

  it("fails on a total that moves by one cent", () => {
    const diffs = compareGoldenBids(
      [bid()],
      [bid({ totals: { "totals.totalDue": 86.11 } })]
    );
    expect(diffs).toHaveLength(1);
  });

  it("fails when a field the golden file holds disappears", () => {
    const diffs = compareGoldenBids([bid()], [bid({ totals: {} })]);
    expect(diffs[0]).toMatchObject({
      field: "totals.totalDue",
      now: "(missing)",
    });
  });

  it("does NOT fail on a field the code added since — that is not a changed number", () => {
    const now = bid({
      totals: { "totals.totalDue": 86.1, "totals.newThing": 3 },
    });
    expect(compareGoldenBids([bid()], [now])).toEqual([]);
  });

  it("fails when a line appears or vanishes", () => {
    const extra = bid({
      lines: [
        ...bid().lines,
        { key: "Remove duplex [remove]", fields: { qty: 2 } },
      ],
    });
    expect(compareGoldenBids([bid()], [extra])[0]).toMatchObject({
      now: "on the bid",
    });
    expect(compareGoldenBids([extra], [bid()])[0]).toMatchObject({
      now: "(missing)",
    });
  });

  it("fails when a whole bid is missing", () => {
    expect(compareGoldenBids([bid()], [])[0]).toMatchObject({
      field: "(whole bid)",
    });
  });
});

describe("flattenGolden", () => {
  it("reads decimal columns as numbers, so 1.5000 and 1.5 are one value", () => {
    expect(flattenGolden({ a: "1.5000", b: 1.5, c: { d: null } })).toEqual({
      a: 1.5,
      b: 1.5,
      "c.d": null,
    });
  });

  it("rounds away float noise below a millionth and never stores -0", () => {
    expect(flattenGolden({ a: 0.1 + 0.2, b: -0.0000001 })).toEqual({
      a: 0.3,
      b: 0,
    });
  });
});

describe("updating on purpose", () => {
  it("refuses an update with no reason", () => {
    expect(() => updatedGoldenFile(null, [bid()], "  ", "2026-10-15")).toThrow(
      /reason/
    );
  });

  it("records the reason and which bids moved, and resets only their hand check", () => {
    const first = updatedGoldenFile(
      null,
      [bid(), bid({ key: "drops" })],
      "first",
      "2026-10-15"
    );
    first.bids.forEach(b => (b.checked = "hand-checked 2026-10-20"));
    first.history[0].hash = updatedGoldenFile(
      null,
      first.bids,
      "x",
      "d"
    ).history[0].hash;
    const moved = bid({ key: "drops", totals: { "totals.totalDue": 99 } });
    const next = updatedGoldenFile(
      first,
      [bid(), moved],
      "drop height fixed",
      "2026-10-21"
    );
    expect(next.history.at(-1)).toMatchObject({
      reason: "drop height fixed",
      changed: ["drops"],
    });
    expect(next.bids.find(b => b.key === "counts")!.checked).toBe(
      "hand-checked 2026-10-20"
    );
    expect(next.bids.find(b => b.key === "drops")!.checked).toBe(NOT_CHECKED);
    expect(goldenFileProblem(next)).toBeNull();
  });

  it("catches a number edited by hand in the file, without an update run", () => {
    const file = updatedGoldenFile(null, [bid()], "first", "2026-10-15");
    expect(goldenFileProblem(file)).toBeNull();
    file.bids[0].totals["totals.totalDue"] = 90;
    expect(goldenFileProblem(file)).toMatch(/edited without an update run/);
  });

  it("lets the hand-check note change without an update run", () => {
    const file = updatedGoldenFile(null, [bid()], "first", "2026-10-15");
    file.bids[0].checked = "hand-checked 2026-10-20";
    expect(goldenFileProblem(file)).toBeNull();
  });
});
