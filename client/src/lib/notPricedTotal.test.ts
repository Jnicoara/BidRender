/**
 * A bid total says how many lines it leaves out — owner, 2026-09-26 — and,
 * since 0087, how many PARTS inside otherwise priced lines.
 * See notPricedTotal.ts for the decision; these pin its wording.
 */
import { describe, it, expect } from "vitest";
import {
  anyNotPriced,
  bidNotPricedCount,
  laborShare,
  materialsShare,
  materialMissingLines,
  notPricedHeadline,
  notPricedSuffix,
  partsNotPricedWords,
  totalWithNotPriced,
} from "./notPricedTotal";
import { notPricedLines } from "@shared/lineNotPriced";
import { money, moneyWhole } from "./money";

const lines = (n: number) => ({ lines: n, parts: 0, hours: 0 });

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
    expect(notPricedSuffix({ lines: 0, parts: 1, hours: 0 })).toBe(
      "+ 1 part not priced"
    );
    expect(notPricedSuffix({ lines: 0, parts: 3, hours: 0 })).toBe(
      "+ 3 parts not priced"
    );
  });

  it("names lines and parts apart, never as one sum", () => {
    expect(
      totalWithNotPriced(money(378), { lines: 2, parts: 3, hours: 0 })
    ).toBe("$378.00 + 2 lines, 3 parts not priced");
    expect(anyNotPriced({ lines: 0, parts: 1, hours: 0 })).toBe(true);
  });

  it("gives the line cell its words", () => {
    expect(partsNotPricedWords(1)).toBe("1 part not priced");
    expect(partsNotPricedWords(2)).toBe("2 parts not priced");
    expect(partsNotPricedWords(0)).toBe("");
  });

  it("makes a headline that agrees in number", () => {
    expect(notPricedHeadline({ lines: 1, parts: 0, hours: 0 })).toEqual({
      text: "1 line is not priced",
      one: true,
    });
    expect(notPricedHeadline({ lines: 0, parts: 3, hours: 0 })).toEqual({
      text: "3 parts are not priced",
      one: false,
    });
    expect(notPricedHeadline({ lines: 2, parts: 1, hours: 0 }).text).toBe(
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
    snapshotLaborOnly: null,
    unpricedParts: 0,
    breakdown: { directCost: 0 },
    ...over,
  });

  it("counts an assembly line whose whole cost is $0 as a LINE, and labor-only as missing material", () => {
    expect(
      bidNotPricedCount(
        [
          line({}),
          // $12.50 of labor and material "0": until 2026-10-05 this was "a
          // priced one" and added nothing. Owner: labor with $0 material is
          // never fully priced — its material counts once.
          line({ breakdown: { directCost: 12.5 } }),
          line({ qty: 0 }),
        ],
        0
      )
    ).toEqual({ lines: 1, parts: 1, hours: 0 });
  });

  it("counts a run-type line off an unpriced catalog row", () => {
    expect(
      bidNotPricedCount(
        [
          line({
            assemblyId: null,
            takeoffRunTypeId: 3,
            runMaterialRole: "raceway",
            snapshotMaterialCost: "0",
            breakdown: { directCost: 4 },
          }),
        ],
        0
      )
    ).toEqual({ lines: 1, parts: 0, hours: 0 });
  });

  it("counts the parts of a priced assembly line, and not of a $0 one", () => {
    expect(
      bidNotPricedCount(
        [
          line({ unpricedParts: 2, breakdown: { directCost: 25 } }),
          line({ unpricedParts: 2 }),
        ],
        0
      )
    ).toEqual({ lines: 1, parts: 2, hours: 0 });
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
    snapshotLaborOnly: null,
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
    expect(bidNotPricedCount(lines, 0)).toEqual({
      lines: 0,
      parts: 3,
      hours: 0,
    });
  });
});

describe("lines whose assembly hours were not set (D1)", () => {
  /*
    Found on staging 2026-10-07: a bid with one such line (its parts all
    priced) said "1 part is not priced … price the part on the Materials
    screen". Since 2026-10-07 (owner) the tally keeps HOURS as their own
    count, never inside parts, and every total says them apart:
    "+ 1 part not priced, 1 line hours not set".
  */
  const line = (over: Record<string, unknown>) => ({
    qty: 1,
    assemblyId: 9,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: "10",
    snapshotLaborHours: null,
    snapshotLaborOnly: null,
    unpricedParts: 0,
    breakdown: { directCost: 10 },
    ...over,
  });
  it("counts them apart from parts, so the parts advice is not given for them", () => {
    const lines = [
      line({}), // hours not set, parts priced
      line({ unpricedParts: 1 }), // hours not set AND a $0 part
      line({ snapshotLaborHours: "1", breakdown: { directCost: 90 } }), // fine
      // Nothing priced at all: a whole line, not counted here.
      line({ snapshotMaterialCost: "0", breakdown: { directCost: 0 } }),
    ];
    const tally = bidNotPricedCount(lines, 0);
    // ONE real part, TWO lines with hours not set — never 3 "parts".
    expect(tally).toEqual({ lines: 1, parts: 1, hours: 2 });
    expect(tally.parts - materialMissingLines(lines)).toBe(1);
  });

  it("says hours apart from parts in every total, never lumped", () => {
    expect(notPricedSuffix({ lines: 0, parts: 1, hours: 1 })).toBe(
      "+ 1 part not priced, 1 line hours not set"
    );
    expect(notPricedSuffix({ lines: 2, parts: 0, hours: 3 })).toBe(
      "+ 2 lines not priced, 3 lines hours not set"
    );
    expect(notPricedSuffix({ lines: 0, parts: 0, hours: 1 })).toBe(
      "+ 1 line hours not set"
    );
    expect(notPricedHeadline({ lines: 0, parts: 1, hours: 1 })).toEqual({
      text: "1 part is not priced and 1 line has hours not set",
      one: false,
    });
    expect(notPricedHeadline({ lines: 0, parts: 0, hours: 1 })).toEqual({
      text: "1 line has hours not set",
      one: true,
    });
    expect(anyNotPriced({ lines: 0, parts: 0, hours: 1 })).toBe(true);
  });

  it("names a line whose only gap is its hours in the print's list", () => {
    const named = notPricedLines([
      { line: { ...line({}), name: "Duplex" }, directCost: 10 },
    ]);
    expect(named).toEqual([
      { name: "Duplex", wholeLine: false, parts: 0, hoursNotSet: true },
    ]);
  });
});

describe("which row of the totals each gap belongs on", () => {
  // Found on staging 2026-10-07: "Materials $10.00 + 1 part not priced,
  // 1 line hours not set" - hours are labor, and said so on Materials.
  const tally = { lines: 1, parts: 2, hours: 3 };
  it("Materials says lines and parts, never hours", () => {
    expect(notPricedSuffix(materialsShare(tally))).toBe(
      "+ 1 line, 2 parts not priced"
    );
  });
  it("Labor says the hours, and only the hours", () => {
    expect(notPricedSuffix(laborShare(tally))).toBe("+ 3 lines hours not set");
    expect(notPricedSuffix(laborShare({ lines: 4, parts: 1, hours: 0 }))).toBe(
      ""
    );
  });
  it("the two shares together are the whole tally - nothing dropped", () => {
    const m = materialsShare(tally);
    const l = laborShare(tally);
    expect({
      lines: m.lines + l.lines,
      parts: m.parts + l.parts,
      hours: m.hours + l.hours,
    }).toEqual(tally);
  });
});
