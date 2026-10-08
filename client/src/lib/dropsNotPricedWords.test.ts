import { describe, expect, it } from "vitest";
import {
  anyNotPriced,
  bidNotPricedCount,
  laborShare,
  materialsShare,
  notPricedHeadline,
  notPricedSuffix,
} from "./notPricedTotal";

/*
  Drops with no material are in the same tally as lines and parts (owner,
  2026-10-07), so every total, the print's block and its headline say them.
  Red before: the suffix read only lines and parts, so a bid whose only gap
  was 205 drops printed a bare figure.
*/
describe("drops not priced, in the bid's words", () => {
  it("the total's suffix says them", () => {
    expect(notPricedSuffix({ lines: 0, parts: 0, hours: 0, drops: 205 })).toBe(
      "+ 205 drops not priced"
    );
    expect(notPricedSuffix({ lines: 2, parts: 1, hours: 0, drops: 1 })).toBe(
      "+ 2 lines, 1 part, 1 drop not priced"
    );
  });

  it("the print's block fires on drops alone, and its headline names them", () => {
    expect(anyNotPriced({ lines: 0, parts: 0, hours: 0, drops: 3 })).toBe(true);
    expect(
      notPricedHeadline({ lines: 0, parts: 0, hours: 0, drops: 1 })
    ).toEqual({
      text: "1 drop is not priced",
      one: true,
    });
  });

  it("the bid screen's tally takes them (a required argument)", () => {
    expect(bidNotPricedCount([], 7)).toEqual({
      lines: 0,
      parts: 0,
      hours: 0,
      drops: 7,
    });
    expect(bidNotPricedCount([], 0)).toEqual({ lines: 0, parts: 0, hours: 0 });
  });

  it("the Materials row keeps the drops (B's totals split, merged 2026-10-07)", () => {
    // materialsShare built its tally field by field and left drops behind.
    expect(
      notPricedSuffix(
        materialsShare({ lines: 0, parts: 0, hours: 2, drops: 5 })
      )
    ).toBe("+ 5 drops not priced");
    expect(
      notPricedSuffix(laborShare({ lines: 0, parts: 0, hours: 2, drops: 5 }))
    ).toBe("+ 2 lines hours not set");
  });
});
