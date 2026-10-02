import { describe, expect, it } from "vitest";
import type { SheetCheckResult, Spot } from "./sheetCheck";
import {
  TIE_BREAK_BATCH,
  countNameFromLegend,
  loadSessionLegend,
  markReport,
  saveSessionLegend,
  tieBreakBatch,
  unmarkedSpots,
  type SessionLegend,
} from "./sheetCheckSession";

const spot = (
  id: number,
  markId: number | null,
  decision: Spot["decision"]
): Spot => ({ id, x: id * 10, y: 0, fits: [], decision, markId });

const result = (over: Partial<SheetCheckResult>): SheetCheckResult => ({
  looks: [],
  skipped: [],
  marks: [],
  spots: [],
  checks: [],
  notes: [],
  variants: [],
  ...over,
});

describe("the marks report", () => {
  const r = result({
    marks: [
      { id: 1, x: 0, y: 0, count: "DATA", item: "DATA" },
      { id: 2, x: 0, y: 9, count: "DATA", item: "DATA" },
      { id: 3, x: 0, y: 5, count: "DATA", item: "DATA" },
      { id: 4, x: 0, y: 5, count: "PLUG", item: null },
    ],
    spots: [
      spot(1, 1, {
        kind: "tie",
        items: ["DATA", "TV DATA"],
        sameOnLegend: true,
      }),
      spot(2, 2, { kind: "tie", items: ["DATA", "SWITCH"] }),
    ],
    checks: [
      { markId: 1, kind: "unsure", items: ["DATA", "TV DATA"], reasons: [] },
      { markId: 2, kind: "unsure", items: ["DATA", "SWITCH"], reasons: [] },
      { markId: 3, kind: "nothing" },
      { markId: 4, kind: "noLook" },
    ],
  });
  const { issues, counts } = markReport(r);

  it("does not list a mark whose look is drawn the same as another item's", () => {
    // UNCC E111: three telecom items, one triangle. Listing them would bury
    // the real issues under 66 rows nobody can act on.
    expect(issues.map(i => i.markId)).toEqual([2, 3]);
    expect(counts.find(c => c.count === "DATA")).toMatchObject({
      marks: 3,
      matches: 1,
      issues: 2,
    });
  });

  it("puts a count with no look in the summary, never in the issues", () => {
    expect(counts.find(c => c.count === "PLUG")).toMatchObject({
      item: null,
      issues: 0,
    });
  });
});

describe("what is sent to the AI tie-break", () => {
  const rows = [
    { name: "A", symbol: { x: 0, y: 0, width: 1, height: 1 }, picture: "p:A" },
    { name: "B", symbol: { x: 0, y: 0, width: 1, height: 1 }, picture: "p:B" },
    { name: "C", symbol: { x: 0, y: 0, width: 1, height: 1 }, picture: null },
  ];

  it("is ties only, never 'drawn the same', never an item with no picture", () => {
    const spots = unmarkedSpots([
      spot(1, null, { kind: "tie", items: ["A", "B"] }),
      spot(2, null, { kind: "tie", items: ["A", "B"], sameOnLegend: true }),
      spot(3, null, { kind: "tie", items: ["A", "C"] }),
      spot(4, null, { kind: "clear", item: "A" }),
      spot(5, 7, { kind: "tie", items: ["A", "B"] }),
    ]);
    const batch = tieBreakBatch(spots, rows);
    expect(batch.crops.map(c => c.spotId)).toEqual([1]);
    expect(batch.items.map(i => i.name)).toEqual(["A", "B"]);
    expect(batch.crops[0].itemIds).toEqual([1, 2]);
  });

  it("is one batch at most", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      spot(i + 1, null, { kind: "tie", items: ["A", "B"] })
    );
    expect(tieBreakBatch(unmarkedSpots(many), rows).crops).toHaveLength(
      TIE_BREAK_BATCH
    );
  });
});

describe("the legend kept in the tab", () => {
  const legend: SessionLegend = {
    bidId: 1,
    docId: 2,
    page: 1,
    sheetName: "E001",
    rows: [
      {
        name: "A",
        symbol: { x: 1, y: 2, width: 3, height: 4 },
        picture: "big",
      },
    ],
    picks: {},
  };

  it("is kept without its pictures when the store is too full for them", () => {
    const saved = new Map<string, string>();
    const store = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.includes("big")) throw new Error("QuotaExceededError");
        saved.set(k, v);
      },
      removeItem: (k: string) => void saved.delete(k),
    };
    expect(saveSessionLegend(store, legend)).toBe("noPictures");
    expect(loadSessionLegend(store, 1, 2)?.rows[0]).toMatchObject({
      name: "A",
      picture: null,
    });
  });

  it("reads as no legend from a store that throws, or another plan set's", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadSessionLegend(throwing, 1, 2)).toBeNull();
    const saved = new Map<string, string>();
    const store = {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => void saved.set(k, v),
      removeItem: () => {},
    };
    saveSessionLegend(store, legend);
    expect(loadSessionLegend(store, 1, 3)).toBeNull();
  });
});

describe("a count named from a legend row", () => {
  it("is the row's first sentence, never its instructions", () => {
    expect(
      countNameFromLegend(
        'CONVENIENCE RECEPTACLE, 120V, NEMA 5-20R DUPLEX. MOUNT 18" AFF TO CENTER.'
      )
    ).toBe("CONVENIENCE RECEPTACLE, 120V, NEMA 5-20R DUPLEX");
    // A decimal point is not the end of a sentence.
    expect(countNameFromLegend("2.5 IN FLOOR BOX")).toBe("2.5 IN FLOOR BOX");
    expect(countNameFromLegend("x".repeat(80))).toHaveLength(60);
  });
});
