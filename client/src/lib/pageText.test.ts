import { describe, expect, it } from "vitest";
import { pageTextFor, rememberPageText } from "./pageText";

const ELECTRICAL_P1 = `E-101 POWER PLAN  SCALE: 1/4" = 1'-0"`;
const LIGHTING_P1 = `L-101 LIGHTING PLAN  SCALE: 1/8" = 1'-0"`;

describe("page text kept for the plan reader", () => {
  it("never hands one plan set's page 1 to another set's page 1", () => {
    // The fault: keyed by page number alone, the lighting set's page 1 was
    // sent the electrical set's words — and its printed scale.
    const store = new Map<string, string>();
    rememberPageText(store, 9, 1, ELECTRICAL_P1);
    expect(pageTextFor(store, 9, 1)).toBe(ELECTRICAL_P1);
    expect(pageTextFor(store, 10, 1)).toBe("");
  });

  it("keeps each set's own page once both have been read", () => {
    const store = new Map<string, string>();
    rememberPageText(store, 9, 1, ELECTRICAL_P1);
    rememberPageText(store, 10, 1, LIGHTING_P1);
    expect(pageTextFor(store, 9, 1)).toBe(ELECTRICAL_P1);
    expect(pageTextFor(store, 10, 1)).toBe(LIGHTING_P1);
  });

  it("gives nothing when no plan set is open", () => {
    const store = new Map<string, string>();
    rememberPageText(store, 9, 1, ELECTRICAL_P1);
    expect(pageTextFor(store, null, 1)).toBe("");
    expect(pageTextFor(store, undefined, 1)).toBe("");
  });

  it("a later read of the same page replaces the earlier one", () => {
    const store = new Map<string, string>();
    rememberPageText(store, 9, 2, "first read");
    rememberPageText(store, 9, 2, "second read");
    expect(pageTextFor(store, 9, 2)).toBe("second read");
  });
});
