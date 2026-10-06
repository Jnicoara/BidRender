/**
 * A bid total says how many lines it leaves out — owner, 2026-09-26 — and,
 * since 0087, how many PARTS inside otherwise priced lines.
 * See notPricedTotal.ts for the decision; these pin its wording.
 */
import { describe, it, expect } from "vitest";
import {
  anyNotPriced,
  bidNotPricedCount,
  materialMissingLines,
  notPricedHeadline,
  notPricedSuffix,
  partsNotPricedWords,
  totalWithNotPriced,
} from "./notPricedTotal";
import { money, moneyWhole } from "./money";

const lines = (n: number) => ({ lines: n, parts: 0 });

describe("a total with unpriced lines says so", () => {
  it("adds the count to the figure", () => {
    expect(totalWithNotPriced(moneyWhole(4210), lines(4))).toBe(
      "$4,210 + 4 lines not priced"
    );
    expect(totalWithNotPriced(money(4210), lines(4))).toBe(
      "$4,210.00 + 4 lines not priced"
    );
  });

  it("says line, not lines, for one", () => {
    expect(notPricedSuffix(lines(1))).toBe("+ 1 line not priced");
  });

  it("keeps the $0 when every line is unpriced", () => {
    expect(totalWithNotPriced(moneyWhole(0), lines(4))).toBe(
      "$0 + 4 lines not priced"
    );
  });

  it("is the bare figure when nothing is unpriced", () => {
    expect(totalWithNotPriced(money(0), lines(0))).toBe("$0.00");
    expect(notPricedSuffix(lines(0))).toBe("");
    expect(notPricedSuffix(lines(-1))).toBe("");
    expect(notPricedSuffix(lines(Number.NaN))).toBe("");
    expect(anyNotPriced(lines(0))).toBe(false);
  });
});

describe("parts not priced inside priced lines (0087)", () => {
  it("names parts on their own", () => {
    expect(notPricedSuffix({ lines: 0, parts: 1 })).toBe("+ 1 part not priced");
    expect(notPricedSuffix({ lines: 0, parts: 3 })).toBe(
      "+ 3 parts not priced"
    );
  });

  it("names lines and parts apart, never as one sum", () => {
    expect(totalWithNotPriced(money(378), { lines: 2, parts: 3 })).toBe(
      "$378.00 + 2 lines, 3 parts not priced"
    );
    expect(anyNotPriced({ lines: 0, parts: 1 })).toBe(true);
  });

  it("gives the line cell its words", () => {
    expect(partsNotPricedWords(1)).toBe("1 part not priced");
    expect(partsNotPricedWords(2)).toBe("2 parts not priced");
    expect(partsNotPricedWords(0)).toBe("");
  });

  it("makes a headline that agrees in number", () => {
    expect(notPricedHeadline({ lines: 1, parts: 0 })).toEqual({
      text: "1 line is not priced",
      one: true,
    });
    expect(notPricedHeadline({ lines: 0, parts: 3 })).toEqual({
      text: "3 parts are not priced",
      one: false,
    });
    expect(notPricedHeadline({ lines: 2, parts: 1 }).text).toBe(
      "2 lines and 1 part are not priced"
    );
  });
});

describe("bidNotPricedCount reads the same rule as the line cell", () => {
  const line = (over: Partial<Parameters<typeof bidNotPricedCount>[0][0]>) => ({
    qty: 1,
    assemblyId: 1,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: "0",
    snapshotLaborHours: "1",
    unpricedParts: 0,
    breakdown: { directCost: 0 },
    ...over,
  });

  it("counts an assembly line whose whole cost is $0 as a LINE, and labor-only as missing material", () => {
    expect(
      bidNotPricedCount([
        line({}),
        // $12.50 of labor and material "0": until 2026-10-05 this was "a
        // priced one" and added nothing. Owner: labor with $0 material is
        // never fully priced — its material counts once.
        line({ breakdown: { directCost: 12.5 } }),
        line({ qty: 0 }),
      ])
    ).toEqual({ lines: 1, parts: 1 });
  });

  it("counts a run-type line off an unpriced catalog row", () => {
    expect(
      bidNotPricedCount([
        line({
          assemblyId: null,
          takeoffRunTypeId: 3,
          runMaterialRole: "raceway",
          snapshotMaterialCost: "0",
          breakdown: { directCost: 4 },
        }),
      ])
    ).toEqual({ lines: 1, parts: 0 });
  });

  it("counts the parts of a priced assembly line, and not of a $0 one", () => {
    expect(
      bidNotPricedCount([
        line({ unpricedParts: 2, breakdown: { directCost: 25 } }),
        line({ unpricedParts: 2 }),
      ])
    ).toEqual({ lines: 1, parts: 2 });
  });
});

describe("lines with labor and no material (owner, 2026-10-05)", () => {
  const line = (over: Record<string, unknown>) => ({
    qty: 4,
    assemblyId: 9,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: "0",
    snapshotLaborHours: "6",
    unpricedParts: 0,
    breakdown: { directCost: 1440 },
    ...over,
  });
  it("counts them apart from $0 parts, so the advice can differ", () => {
    const lines = [
      line({}), // labor only: material missing entirely
      line({ unpricedParts: 2 }), // $0 parts: the parts advice
      line({ snapshotMaterialCost: "42" }), // fully priced
      line({ breakdown: null }), // cannot be priced at all: neither
    ];
    expect(materialMissingLines(lines)).toBe(1);
    // The tally holds both kinds: 1 (missing) + 2 (parts).
    expect(bidNotPricedCount(lines)).toEqual({ lines: 0, parts: 3 });
  });
});
