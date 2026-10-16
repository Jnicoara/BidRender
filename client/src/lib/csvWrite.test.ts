/** shared/csvWrite.ts — quoting, and formula defusing (CSV injection). */
import { describe, expect, it } from "vitest";
import { csvCell, csvRow, defuseFormula } from "@shared/csvWrite";

describe("csvCell", () => {
  it("quotes every field and doubles inner quotes", () => {
    expect(csvCell('1/2" EMT')).toBe('"1/2"" EMT"');
    expect(csvCell('Ground rod, 5/8" x 10 ft')).toBe(
      '"Ground rod, 5/8"" x 10 ft"'
    );
    expect(csvCell(12.5)).toBe('"12.5"');
  });

  it("defuses text a spreadsheet would run as a formula", () => {
    for (const evil of [
      '=HYPERLINK("http://x","click")',
      "+SUM(A1:A9)",
      "-2+3",
      "@SUM(A1)",
      "\t=1+1",
      "\r=1+1",
    ])
      expect(defuseFormula(evil)).toBe(`'${evil}`);
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
  });

  it("leaves real numbers and ordinary names alone", () => {
    for (const fine of [
      "-12.50",
      "+3",
      "-1,250.00",
      "12/2 NM-B Copper",
      "Duplex",
      "",
    ])
      expect(defuseFormula(fine)).toBe(fine);
    // A number passed AS a number is never touched.
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvRow(["=x", -1])).toBe(`"'=x","-1"`);
  });
});
