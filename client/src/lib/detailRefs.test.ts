import { describe, expect, it } from "vitest";
import type { NoteWord } from "./keyedNotes";
import {
  findDetailTitle,
  linksOnSheet,
  pageForSheet,
  readDetailRefs,
  sheetKey,
  type SetSheet,
} from "./detailRefs";
import unccFx from "./__fixtures__/uncc-detail-refs.json";
import weld1Fx from "./__fixtures__/weld1-detail-refs.json";
import weld2Fx from "./__fixtures__/weld2-detail-refs.json";

/*
  Real sets, written by scripts/detailRefsFixture.mts (2026-10-14): every
  word on the chosen pages, and every page's sheet number as the app's own
  title-block reader finds it. Nothing here is typed from memory.
*/
type Fixture = {
  sheets: SetSheet[];
  pages: Record<string, NoteWord[]>;
};
const uncc = unccFx as Fixture;
const weld1 = weld1Fx as Fixture;
const weld2 = weld2Fx as Fixture;
const refsOn = (f: Fixture, page: number) =>
  readDetailRefs(f.pages[String(page)]);

describe("the set's sheet numbers, as the app reads them", () => {
  it("UNCC is E001–E004, E111, E121, ED111", () => {
    expect(uncc.sheets.map(s => s.number)).toEqual([
      "E001",
      "E002",
      "E003",
      "E004",
      "E111",
      "E121",
      "ED111",
    ]);
  });
});

describe("links — UNCC E121 (page 6) points at details on E004", () => {
  const links = linksOnSheet(refsOn(uncc, 6), 6, uncc.sheets);

  it("finds 2/E004 and 3/E004 in the notes, both going to page 4", () => {
    expect(links.map(l => [l.ref.label, l.page, l.number])).toEqual([
      ["2", 4, "E004"],
      ["3", 4, "E004"],
    ]);
  });

  it("drops references to sheets that are not in this set (5/A2, S/A2)", () => {
    const refs = refsOn(uncc, 6);
    expect(refs.some(r => r.sheet === "A2")).toBe(true);
    expect(links.some(l => l.ref.sheet === "A2")).toBe(false);
  });

  it("its own title bubble (1/E121) is not a link", () => {
    expect(
      refsOn(uncc, 6).some(r => r.label === "1" && r.sheet === "E121")
    ).toBe(true);
    expect(links.some(l => l.ref.sheet === "E121")).toBe(false);
  });
});

describe("titles — where Go lands on UNCC E004 (page 4)", () => {
  const refs = refsOn(uncc, 4);

  it("details 1, 2 and 3 are found under their drawings, top to bottom", () => {
    const at = (label: string) => findDetailTitle(refs, 4, label, uncc.sheets);
    const [one, two, three] = ["1", "2", "3"].map(at);
    expect(one && two && three).toBeTruthy();
    expect(two!.y).toBeLessThan(three!.y);
    expect(two!.form).toBe("bubble");
  });

  it("a detail not drawn there is not located — never a guess", () => {
    expect(findDetailTitle(refs, 4, "7", uncc.sheets)).toBeNull();
  });

  it("a title bubble on ANOTHER sheet is not this sheet's title", () => {
    // E121's own "1/E121" is detail 1 on page 6, not on page 4.
    expect(findDetailTitle(refsOn(uncc, 6), 4, "1", uncc.sheets)).toBeNull();
  });
});

describe("what must never be a link", () => {
  it("Weld 1 E-200's view titles (A–D/E-200) point at E-200 itself", () => {
    const refs = refsOn(weld1, 5);
    expect(
      refs
        .filter(r => r.sheet === "E-200")
        .map(r => r.label)
        .sort()
    ).toEqual(["A", "B", "C", "D"]);
    expect(linksOnSheet(refs, 5, weld1.sheets)).toEqual([]);
  });

  it("a breaker size (30/2, 20/2 on Weld 1 E-200) is not a reference at all", () => {
    const words = weld1.pages["5"];
    expect(words.some(w => w.text === "30/2")).toBe(true);
    const refs = refsOn(weld1, 5);
    expect(refs.some(r => r.sheet === "2")).toBe(false);
    // Even in a set where somebody named a sheet "2".
    const withTwo = [...weld1.sheets, { page: 9, number: "2" }];
    expect(linksOnSheet(refs, 5, withTwo)).toEqual([]);
  });

  it("Weld 1 E-100's 5/A1 names an architectural sheet not in the set", () => {
    const refs = refsOn(weld1, 4);
    expect(refs.some(r => r.label === "5" && r.sheet === "A1")).toBe(true);
    expect(linksOnSheet(refs, 4, weld1.sheets)).toEqual([]);
  });

  it("Weld 2 E4.0: 1/A3 and A2/A2 are not sheets here", () => {
    expect(linksOnSheet(refsOn(weld2, 12), 12, weld2.sheets)).toEqual([]);
  });

  it("a number two sheets share (Weld 2 reads E1.0 twice) goes nowhere", () => {
    expect(weld2.sheets.filter(s => s.number === "E1.0")).toHaveLength(2);
    expect(pageForSheet("E1.0", weld2.sheets)).toBeNull();
    // So page 3's A/E1.0 bubble is neither a link nor a findable title.
    expect(linksOnSheet(refsOn(weld2, 3), 3, weld2.sheets)).toEqual([]);
    expect(findDetailTitle(refsOn(weld2, 3), 3, "A", weld2.sheets)).toBeNull();
  });

  it("a title block's DRAWN BY over the sheet number is not a bubble", () => {
    const words: NoteWord[] = [
      { text: "BY", x0: 990, x1: 1004, cx: 997, cy: 900, height: 7 },
      { text: "E0.01", x0: 980, x1: 1020, cx: 1000, cy: 912, height: 14 },
    ];
    expect(readDetailRefs(words)).toEqual([]);
  });

  it("small type over a big sheet number (a revision 1 over E0.01) is not a bubble", () => {
    // "BY" above is already not a label; this one is, so only the size
    // test keeps it out: a bubble's two halves are about the same size.
    const words: NoteWord[] = [
      { text: "1", x0: 1046, x1: 1050, cx: 1048, cy: 893, height: 7 },
      { text: "E0.01", x0: 1010, x1: 1090, cx: 1050, cy: 912, height: 24 },
    ];
    expect(readDetailRefs(words)).toEqual([]);
    // The same two words at bubble proportions ARE one.
    const bubble = [{ ...words[0], height: 20 }, words[1]];
    expect(readDetailRefs(bubble).map(r => `${r.label}/${r.sheet}`)).toEqual([
      "1/E0.01",
    ]);
  });
});

describe("sheet numbers compare ignoring dots, dashes and case", () => {
  it("3/E5.01 finds a sheet stored as E-5.01", () => {
    const sheets = [{ page: 7, number: "E-5.01" }];
    expect(sheetKey("e5.01")).toBe(sheetKey("E-5.01"));
    expect(pageForSheet("E5.01", sheets)).toBe(7);
    const refs = readDetailRefs([
      { text: "3/E5.01", x0: 0, x1: 30, cx: 15, cy: 10, height: 8 },
    ]);
    expect(linksOnSheet(refs, 1, sheets).map(l => l.page)).toEqual([7]);
  });

  it("an unread sheet number (null) matches nothing", () => {
    expect(pageForSheet("E004", [{ page: 1, number: null }])).toBeNull();
  });
});
