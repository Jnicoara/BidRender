import { describe, expect, it } from "vitest";
import { packPriceShown, priceWrite, roundUp4 } from "../shared/packPricing";

describe("priceWrite (pricing-safety-plan § 2.2)", () => {
  it("divides a pack price and rounds the unit price UP at the 4th decimal", () => {
    // $99.99 / 250 = 0.39996 — stored as 0.4000, never 0.3999 (Q3).
    expect(priceWrite({ typed: "pack", amount: 99.99, packQty: 250 })).toEqual({
      costPerUnit: "0.4000",
      packPrice: "99.9900",
    });
    // 100 / 300 = 0.33333…: nearest would store 0.3333 (low). Up is 0.3334.
    // This is the case that tells "up" from "nearest"; the one above does not.
    expect(
      priceWrite({ typed: "pack", amount: 100, packQty: 300 }).costPerUnit
    ).toBe("0.3334");
    // An exact division is left exact (no spurious extra 0.0001).
    expect(priceWrite({ typed: "pack", amount: 120, packQty: 250 })).toEqual({
      costPerUnit: "0.4800",
      packPrice: "120.0000",
    });
  });

  it("a per-unit write clears the pack price — no stale pack beside a new unit price", () => {
    expect(priceWrite({ typed: "unit", amount: 0.44 })).toEqual({
      costPerUnit: "0.4400",
      packPrice: null,
    });
  });

  it("rounds a long per-unit price up the same way", () => {
    expect(priceWrite({ typed: "unit", amount: 0.12341 }).costPerUnit).toBe(
      "0.1235"
    );
    expect(roundUp4(1.1)).toBe(1.1); // float noise does not add a cent
  });

  it("refuses a pack of nothing and a negative price", () => {
    expect(() =>
      priceWrite({ typed: "pack", amount: 10, packQty: 0 })
    ).toThrow();
    expect(() => priceWrite({ typed: "unit", amount: -1 })).toThrow();
  });
});

describe("packPriceShown", () => {
  it("shows the typed pack price when there is one", () => {
    expect(
      packPriceShown({
        costPerUnit: "0.4000",
        packPrice: "99.99",
        packQty: 250,
      })
    ).toEqual({ amount: 99.99, typed: true });
  });
  it("works one out from the unit price otherwise, and says so", () => {
    expect(
      packPriceShown({ costPerUnit: "0.48", packPrice: null, packQty: "250" })
    ).toEqual({ amount: 120, typed: false });
  });
  it("is nothing for a row with no pack size", () => {
    expect(
      packPriceShown({ costPerUnit: "0.48", packPrice: null, packQty: null })
    ).toBeNull();
  });
});
