import { describe, expect, it } from "vitest";
import { earlyTextKey, sheetsToCatchUp } from "./scaleCatchUp";

const SCALE_TEXT = `E-101 SCALE: 1/4" = 1'-0"`;

describe("scale detection for a page read before its sheet row existed", () => {
  it("detects the page once its sheet row arrives — the fresh-upload fault", () => {
    // Uploaded: page 1 drawn and read while the sheet list was still empty.
    const early = new Map([[earlyTextKey(9, 1), SCALE_TEXT]]);
    // Then the rows arrive, unscaled.
    const sheets = [
      { id: 101, pageNumber: 1, scaleSource: "none" },
      { id: 102, pageNumber: 2, scaleSource: "none" },
    ];
    expect(sheetsToCatchUp(9, sheets, early, new Set())).toEqual([
      { sheetId: 101, text: SCALE_TEXT },
    ]);
  });

  it("never reads one plan set's page as another's", () => {
    const early = new Map([[earlyTextKey(9, 1), SCALE_TEXT]]);
    const otherSet = [{ id: 201, pageNumber: 1, scaleSource: "none" }];
    expect(sheetsToCatchUp(10, otherSet, early, new Set())).toEqual([]);
  });

  it("leaves a sheet that already has a scale alone, typed or detected", () => {
    const early = new Map([[earlyTextKey(9, 1), SCALE_TEXT]]);
    for (const scaleSource of ["user", "detected"]) {
      expect(
        sheetsToCatchUp(
          9,
          [{ id: 101, pageNumber: 1, scaleSource }],
          early,
          new Set()
        )
      ).toEqual([]);
    }
  });

  it("asks once per sheet, so a refetch cannot send the reading twice", () => {
    const early = new Map([[earlyTextKey(9, 1), SCALE_TEXT]]);
    const sheets = [{ id: 101, pageNumber: 1, scaleSource: "none" }];
    expect(sheetsToCatchUp(9, sheets, early, new Set([101]))).toEqual([]);
  });

  it("has nothing to do for a page that was never read early", () => {
    expect(
      sheetsToCatchUp(
        9,
        [{ id: 101, pageNumber: 1, scaleSource: "none" }],
        new Map(),
        new Set()
      )
    ).toEqual([]);
  });
});
