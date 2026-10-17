import { describe, expect, it } from "vitest";
import {
  STARTER_BRACKET_ROWS,
  bandsFromRows,
  rowsFromBands,
} from "./bracketDraft";
import { checkBrackets } from "@shared/markupBrackets";

describe("bracket draft", () => {
  it("reads what a person types: $, commas, a trailing %, blank 'To' = and over", () => {
    expect(
      bandsFromRows([
        { from: "$1", to: "1,000", pct: "40%" },
        { from: "1000", to: "", pct: "12" },
      ])
    ).toEqual({
      ok: true,
      bands: [
        { minPrice: 1, maxPrice: 1000, pct: 0.4 },
        { minPrice: 1000, maxPrice: null, pct: 0.12 },
      ],
    });
  });

  it("never guesses: a box that does not read names its row", () => {
    expect(bandsFromRows([{ from: "0", to: "1,5", pct: "40" }])).toEqual({
      ok: false,
      message: 'Row 1: "To" must be a price, or blank for "and over".',
    });
    expect(bandsFromRows([{ from: "", to: "1", pct: "40" }]).ok).toBe(false);
    expect(bandsFromRows([{ from: "0", to: "1", pct: "" }]).ok).toBe(false);
  });

  it("the starter set is the D2 table, with no gap and no overlap", () => {
    const r = bandsFromRows(STARTER_BRACKET_ROWS);
    if (!r.ok) throw new Error(r.message);
    expect(r.bands.map(b => b.pct)).toEqual([0.75, 0.4, 0.3, 0.2, 0.12]);
    expect(checkBrackets(r.bands)).toEqual({ problems: [], gaps: [] });
  });

  it("saved brackets come back as the rows that made them", () => {
    const r = bandsFromRows(STARTER_BRACKET_ROWS);
    if (!r.ok) throw new Error(r.message);
    expect(rowsFromBands(r.bands)).toEqual(STARTER_BRACKET_ROWS);
  });
});
