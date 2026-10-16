/**
 * client/src/lib/planOutline.ts — the outline is read only while a page still
 * needs a sheet row. Reading it on every open walked a 500-sheet set's whole
 * file (references/stress-results-b.md round 3).
 */
import { describe, expect, it } from "vitest";
import { outlineNeeded } from "./planOutline";

describe("reading a plan's bookmark outline", () => {
  it("is skipped once every page has a sheet row", () => {
    const all = Array.from({ length: 500 }, (_, i) => i + 1);
    expect(outlineNeeded(500, all)).toBe(false);
  });

  it("is read while any page lacks a row — first open, or pages added", () => {
    expect(outlineNeeded(5, [])).toBe(true);
    expect(outlineNeeded(5, [1, 2, 3, 4])).toBe(true);
    expect(outlineNeeded(5, [1, 2, 4, 5])).toBe(true);
  });

  it("is read when the rows are not known yet (the safe side)", () => {
    expect(outlineNeeded(5, null)).toBe(true);
  });
});
