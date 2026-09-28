import { describe, expect, it } from "vitest";
import {
  NAMED_SHEET_SIZES,
  POINTS_PER_INCH,
  sheetSize,
  sheetSizeWarns,
} from "@shared/sheetSize";

/** A page of this many inches, in PDF points. */
const pts = (inches: number) => inches * POINTS_PER_INCH;

describe("sheetSize — naming the paper", () => {
  it("names a 24×36 sheet either way round", () => {
    expect(sheetSize(pts(36), pts(24))).toMatchObject({
      label: "24×36",
      kind: "full",
    });
    expect(sheetSize(pts(24), pts(36))).toMatchObject({
      label: "24×36",
      kind: "full",
    });
  });

  it("names 11×17 as a reduced size, landscape and portrait", () => {
    expect(sheetSize(pts(17), pts(11))?.kind).toBe("reduced");
    expect(sheetSize(pts(11), pts(17))?.label).toBe("11×17");
  });

  it("allows a PDF export's small trim", () => {
    // 1224 × 792 is 17 × 11 exactly; exports often land a few points off.
    expect(sheetSize(1218, 789)?.label).toBe("11×17");
    expect(sheetSize(pts(35.7), pts(23.8))?.label).toBe("24×36");
  });

  it("never reads a named size as its neighbour", () => {
    // Every pair of named sizes is at least one tolerance apart, so each
    // exact size names itself and nothing else.
    for (const size of NAMED_SHEET_SIZES) {
      expect(sheetSize(pts(size.long), pts(size.short))?.label).toBe(
        size.label
      );
    }
    expect(sheetSize(pts(18), pts(12))?.label).toBe("12×18");
    expect(sheetSize(pts(34), pts(22))?.label).toBe("22×34");
  });

  it("says the measured inches for a size it cannot name, and never warns on it", () => {
    // Proportions unlike any named sheet: a long strip of a detail.
    const odd = sheetSize(pts(40), pts(10.25));
    expect(odd).toMatchObject({ label: "10.3×40", kind: null });
    expect(sheetSizeWarns(odd, { isSet: true, checked: false })).toBe(false);
  });

  it("is null before the page has been drawn", () => {
    expect(sheetSize(0, 0)).toBeNull();
    expect(sheetSize(Number.NaN, 792)).toBeNull();
    expect(sheetSize(-1, 792)).toBeNull();
  });
});

describe("sheetSizeWarns — the half-size set", () => {
  const half = sheetSize(pts(17), pts(11));
  const full = sheetSize(pts(36), pts(24));

  it("warns on a reduced page with an unchecked scale", () => {
    expect(sheetSizeWarns(half, { isSet: true, checked: false })).toBe(true);
  });

  it("does not warn on a full-size sheet", () => {
    expect(sheetSizeWarns(full, { isSet: true, checked: false })).toBe(false);
  });

  it("does not warn with no scale set — nothing is being measured", () => {
    expect(sheetSizeWarns(half, { isSet: false, checked: false })).toBe(false);
  });

  it("clears once the scale has been checked against a known dimension", () => {
    expect(sheetSizeWarns(half, { isSet: true, checked: true })).toBe(false);
  });

  it("does not warn before the page size is known", () => {
    expect(sheetSizeWarns(null, { isSet: true, checked: false })).toBe(false);
  });
});
