/**
 * A bid total says how many lines it leaves out — owner, 2026-09-26.
 * See notPricedTotal.ts for the decision; these pin its wording.
 */
import { describe, it, expect } from "vitest";
import {
  bidNotPricedCount,
  notPricedSuffix,
  totalWithNotPriced,
} from "./notPricedTotal";
import { money, moneyWhole } from "./money";

describe("a total with unpriced lines says so", () => {
  it("adds the count to the figure", () => {
    expect(totalWithNotPriced(moneyWhole(4210), 4)).toBe(
      "$4,210 + 4 lines not priced"
    );
    expect(totalWithNotPriced(money(4210), 4)).toBe(
      "$4,210.00 + 4 lines not priced"
    );
  });

  it("says line, not lines, for one", () => {
    expect(notPricedSuffix(1)).toBe("+ 1 line not priced");
  });

  it("keeps the $0 when every line is unpriced", () => {
    expect(totalWithNotPriced(moneyWhole(0), 4)).toBe(
      "$0 + 4 lines not priced"
    );
  });

  it("is the bare figure when nothing is unpriced", () => {
    expect(totalWithNotPriced(money(0), 0)).toBe("$0.00");
    expect(notPricedSuffix(0)).toBe("");
    expect(notPricedSuffix(-1)).toBe("");
    expect(notPricedSuffix(Number.NaN)).toBe("");
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
    breakdown: { directCost: 0 },
    ...over,
  });

  it("counts an assembly line whose whole cost is $0, not a priced one", () => {
    expect(
      bidNotPricedCount([
        line({}),
        line({ breakdown: { directCost: 12.5 } }),
        line({ qty: 0 }),
      ])
    ).toBe(1);
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
    ).toBe(1);
  });
});
