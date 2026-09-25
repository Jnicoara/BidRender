/**
 * The title-block reader, against REAL title blocks: text items captured from
 * public electrical bid sets (__fixtures__/titleBlocks.json, 2026-09-25, the
 * bottom-right corner and right-hand strip of each page only).
 *
 * The fixtures deliberately differ in shape — a box in the corner, a rotated
 * strip on a /Rotate 270 sheet, a number drawn in three pieces, a sheet whose
 * only candidate is a room number, and a foreign format with nothing to find —
 * because a reader tested on one layout is tested on half its rules.
 */
import { describe, expect, it } from "vitest";
import {
  looksLikeDrawingTitle,
  readTitleBlockPage,
  readTitleBlockTitles,
  type TitleBlockItem,
} from "@shared/sheetTitleBlock";
import fixtures from "./__fixtures__/titleBlocks.json";

type Fixture = {
  set: string;
  page: number;
  width: number;
  height: number;
  items: TitleBlockItem[];
};
const all = fixtures as Fixture[];
const page = (set: string, n: number) => {
  const f = all.find(x => x.set === set && x.page === n);
  if (!f) throw new Error(`no fixture ${set} p${n}`);
  return readTitleBlockPage(f);
};

describe("sheet numbers off real title blocks", () => {
  it("reads a /Rotate 270 sheet (Weld County, E-100)", () => {
    expect(page("weld1", 4).number).toBe("E-100");
  });

  it("reads a box title block (UNC Charlotte, E111)", () => {
    expect(page("uncc", 5).number).toBe("E111");
  });

  it("joins a number drawn as three items (Longview, AD-101)", () => {
    expect(page("longview", 20).number).toBe("AD-101");
  });

  it("stores NOTHING rather than a doubtful guess (Delaware)", () => {
    // The real number, A101D-E, is not number-shaped; the only candidate is a
    // room number, E100, which the prototype picked at low confidence. A blank
    // costs a keystroke; a plausible wrong number costs noticing it.
    expect(page("delaware", 7).number).toBeNull();
  });

  it("finds nothing on a format it does not know (NSW, ISO 19650)", () => {
    expect(page("dundas", 3).number).toBeNull();
  });
});

describe("titles off real title blocks", () => {
  it("reads the rotated title in a right-hand strip, across a set", () => {
    const pages = [1, 2, 3, 4, 5].map(n => page("weld1", n));
    const titles = readTitleBlockTitles(pages);
    expect(pages.map(p => p.number)).toEqual([
      "E-001",
      "E-002",
      "E-003",
      "E-100",
      "E-200",
    ]);
    expect(titles[3]).toBe("LIGHTING PLAN");
    expect(titles[4]).toBe("POWER PLAN");
  });

  it("gives NO title rather than the last line of a longer one (Colusa)", () => {
    // E1.1A's title is three lines, "LIGHTING PLAN & / LUMINAIRE SCHEDULE /
    // (ALTERNATE)", and the top two sit above the search window. Returning
    // "(ALTERNATE)" would be a wrong title; blank is the safe miss.
    const pages = [2, 3, 4].map(n => page("colusa", n));
    expect(pages.map(p => p.number)).toEqual(["E1.1", "E1.1A", "E2.1"]);
    const titles = readTitleBlockTitles(pages);
    expect(titles[1]).toBeNull();
    // …while a whole title on the next sheet still reads.
    expect(titles[2]).toBe("POWER PLAN");
  });

  /**
   * The "names a kind of drawing" test, with the strings it was written from.
   * Its cost, measured against the sets with page labels: 3 real titles of
   * 71 turned blank on Longview ("PERMEABLE PAVER PATTERN", "KEYNOTE PHOTOS"
   * twice); none turned wrong. Blank is the direction it is allowed to fail.
   */
  it("drops OCR'd cell labels and keeps titles that name a drawing", () => {
    for (const noise of ["DRAWNBY", "DRAWINBY", "DRAWIN SET BID SET", "BIDSET"])
      expect(looksLikeDrawingTitle(noise)).toBe(false);
    for (const title of [
      "LIGHTING PLAN",
      "EXISTING POWER RISER DIAGRAM",
      "SYMBOL LEGEND",
      "CODE ANALYSIS",
      "COVER SHEET",
      "ELECTRICAL SPECIFICATIONS",
      "GENERAL NOTES, FIXTURE SCHEDULE, & SHEET INDEX",
    ])
      expect(looksLikeDrawingTitle(title)).toBe(true);
  });

  it("never offers a title for a page with no confident number", () => {
    expect(readTitleBlockTitles([page("dundas", 3)])).toEqual([null]);
  });
});
