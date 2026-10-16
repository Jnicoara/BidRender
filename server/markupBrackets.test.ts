/**
 * The bracket editor's check (references/bid-methods-plan.md § 3, owner Q9):
 * overlaps refused, gaps allowed and said. Pure.
 */
import { describe, expect, it } from "vitest";
import { checkBrackets } from "../shared/markupBrackets";

describe("price brackets", () => {
  it("brackets that meet at a boundary are neither a gap nor an overlap", () => {
    expect(
      checkBrackets([
        { minPrice: 1, maxPrice: 10, pct: 0.4 },
        { minPrice: 0, maxPrice: 1, pct: 0.75 },
        { minPrice: 10, maxPrice: null, pct: 0.2 },
      ])
    ).toEqual({ problems: [], gaps: [] });
  });

  it("refuses an overlap, naming both brackets", () => {
    expect(
      checkBrackets([
        { minPrice: 0, maxPrice: 10, pct: 0.4 },
        { minPrice: 5, maxPrice: 25, pct: 0.3 },
      ]).problems
    ).toEqual([
      "Brackets overlap: $0.00–$10.00 and $5.00–$25.00 both cover $5.00.",
    ]);
  });

  it("allows a gap and says where those items go", () => {
    expect(
      checkBrackets([
        { minPrice: 0, maxPrice: 10, pct: 0.4 },
        { minPrice: 25, maxPrice: 1000, pct: 0.15 },
      ])
    ).toEqual({
      problems: [],
      gaps: [
        "Items between $10.00 and $25.00 fall to the company %.",
        "Items $1,000.00 and over fall to the company %.",
      ],
    });
    expect(
      checkBrackets([{ minPrice: 5, maxPrice: null, pct: 0.1 }]).gaps
    ).toEqual(["Items under $5.00 fall to the company %."]);
  });

  it("refuses a bracket that ends where it starts, and a negative markup", () => {
    const { problems } = checkBrackets([
      { minPrice: 10, maxPrice: 10, pct: 0.1 },
      { minPrice: 20, maxPrice: null, pct: -0.1 },
    ]);
    expect(problems).toHaveLength(2);
  });
});
