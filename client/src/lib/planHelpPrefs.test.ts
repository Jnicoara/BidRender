import { describe, expect, it } from "vitest";
import { sheetKindLineOn } from "./planHelpPrefs";

/*
  The sheet-kind line is ON unless somebody turned it off (plan-reading-help
  § 1: it is part of the basic path). Nothing stored, a value from a later
  build, a hand-edited store — all leave it on; only "off" hides it.
*/
describe("sheetKindLineOn", () => {
  it("is on by default", () => {
    expect(sheetKindLineOn(null)).toBe(true);
    expect(sheetKindLineOn(undefined)).toBe(true);
    expect(sheetKindLineOn("")).toBe(true);
    expect(sheetKindLineOn("something-else")).toBe(true);
    expect(sheetKindLineOn("on")).toBe(true);
  });

  it("is off only when turned off", () => {
    expect(sheetKindLineOn("off")).toBe(false);
  });
});
