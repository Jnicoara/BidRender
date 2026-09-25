/**
 * Markup vs margin — the conversion behind every "20% markup = 16.7% margin"
 * line on screen.
 *
 * Part 4 of the bid-structure design: contractors mix these up constantly and
 * it silently underprices every bid. Markup is added to COST; margin is a share
 * of the PRICE. At the same number, margin always prices higher.
 */
import { describe, expect, it } from "vitest";
import {
  calculateBidPrice,
  marginToMarkup,
  markupToMargin,
} from "../shared/pricing";

describe("markup to margin", () => {
  it("gives the design doc's worked example: 20% markup is 16.7% margin", () => {
    // $100 cost + 20% = $120. Profit $20 is 16.67% of $120.
    expect(markupToMargin(0.2)).toBeCloseTo(0.166667, 6);
  });

  it.each([
    [0, 0],
    [0.25, 0.2],
    [0.5, 1 / 3],
    [1, 0.5],
  ])("%s markup is %s margin", (markup, margin) => {
    expect(markupToMargin(markup)).toBeCloseTo(margin, 10);
  });

  it("refuses a markup of -100% or less, which has no margin", () => {
    expect(() => markupToMargin(-1)).toThrow();
  });
});

describe("margin to markup", () => {
  it("gives the design doc's worked example: a 20% margin needs 25% markup", () => {
    // To keep 20% of the price on $100 cost you charge $125: 25% on cost.
    expect(marginToMarkup(0.2)).toBeCloseTo(0.25, 10);
  });

  it.each([
    [0, 0],
    [0.1, 1 / 9],
    [0.5, 1],
  ])("%s margin is %s markup", (margin, markup) => {
    expect(marginToMarkup(margin)).toBeCloseTo(markup, 10);
  });

  it("refuses a margin of 100% or more, which has no finite price", () => {
    expect(() => marginToMarkup(1)).toThrow();
  });
});

describe("the two are each other's inverse", () => {
  it.each([0.05, 0.12, 0.2, 0.35, 0.75, 1.5])("round-trips %s", pct => {
    expect(marginToMarkup(markupToMargin(pct))).toBeCloseTo(pct, 12);
    if (pct < 1) {
      expect(markupToMargin(marginToMarkup(pct))).toBeCloseTo(pct, 12);
    }
  });
});

describe("and they agree with the engine that prices bids", () => {
  it("a 20% margin prices where a 25% markup does, not where 20% markup does", () => {
    const margin = calculateBidPrice({
      directCost: 100,
      profit: { method: "margin", value: 0.2 },
    });
    const sameMarkup = calculateBidPrice({
      directCost: 100,
      profit: { method: "markup", value: marginToMarkup(0.2) },
    });
    const naive = calculateBidPrice({
      directCost: 100,
      profit: { method: "markup", value: 0.2 },
    });
    expect(margin.finalPrice).toBe(125);
    expect(sameMarkup.finalPrice).toBe(125);
    // The mistake Part 4 warns about, priced: $5 short on every $100.
    expect(naive.finalPrice).toBe(120);
  });
});
