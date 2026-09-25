/**
 * Sheet numbers and titles: parsing what the PDF says, choosing between the
 * three sources, and what the sheet list shows. The strings below are real
 * page labels and bookmarks from public bid sets (2026-09-25), not invented.
 */
import { describe, expect, it } from "vitest";
import {
  asSheetNumber,
  parseSheetName,
  resolveSheetIdentity,
  sheetDisplay,
  sheetLabel,
} from "@shared/sheetIdentity";

const label = (s: string) => parseSheetName(s, { titleOnly: true });
const bookmark = (s: string) => parseSheetName(s, { titleOnly: false });

describe("asSheetNumber", () => {
  it("accepts the shapes real sets use", () => {
    for (const n of ["E-101", "E101", "E1.01", "E0.1", "E1.1A", "ED-101B"])
      expect(asSheetNumber(n)).toBe(n);
  });

  it("joins a number drawn as separate pieces", () => {
    expect(asSheetNumber("AD - 101")).toBe("AD-101");
    expect(asSheetNumber("E–101")).toBe("E-101");
  });

  it("refuses what is not a sheet number", () => {
    for (const s of ["18", "LIGHTING PLAN", "24-6476", "A101D-E", ""])
      expect(asSheetNumber(s)).toBeNull();
  });
});

describe("parseSheetName — page labels and bookmarks", () => {
  it("reads number and title from the common shape", () => {
    expect(label("E-001 - ELECTRICAL SPECIFICATIONS")).toEqual({
      number: "E-001",
      title: "ELECTRICAL SPECIFICATIONS",
    });
    expect(bookmark("E001 - ELECTRICAL SYMBOLS AND NOTES")).toEqual({
      number: "E001",
      title: "ELECTRICAL SYMBOLS AND NOTES",
    });
  });

  it("reads a Bluebeam-style '[1] E-001 TITLE' label", () => {
    expect(label("[1] E-001 INDEX, LEGEND AND NOTES")).toEqual({
      number: "E-001",
      title: "INDEX, LEGEND AND NOTES",
    });
  });

  it("finds the number in the middle of a long bookmark", () => {
    expect(
      bookmark("24-6476_1017 & 1029 Brebeuf Rd_ELEC - E-001 - SPECS")
    ).toEqual({ number: "E-001", title: "SPECS" });
  });

  it("gives nothing for a label that is only a page number", () => {
    // One real set's labels were "18", "19" … — page numbers from a bigger set.
    expect(label("18")).toBeNull();
  });

  it("treats a numberless BOOKMARK as nothing — it may be a group heading", () => {
    expect(bookmark("GENERAL")).toBeNull();
    expect(bookmark("Sheets")).toBeNull();
  });

  it("lets a numberless LABEL name its page, if it is words", () => {
    expect(label("Cover Sheet")).toEqual({
      number: null,
      title: "Cover Sheet",
    });
    expect(label("iii")).toBeNull();
  });

  it("leaves the title blank rather than inventing one", () => {
    expect(label("E-101")).toEqual({ number: "E-101", title: null });
  });
});

describe("resolveSheetIdentity — which source wins, per field", () => {
  const e101 = { number: "E-101", title: "LIGHTING PLAN" };

  it("prefers the page label, then the bookmark, then the title block", () => {
    const got = resolveSheetIdentity({
      label: e101,
      bookmark: { number: "E101", title: "LIGHTING" },
      titleBlock: { number: "E-999", title: "WRONG" },
    });
    expect(got.number).toEqual({ value: "E-101", source: "label" });
    expect(got.title).toEqual({ value: "LIGHTING PLAN", source: "label" });
  });

  it("fills each field separately", () => {
    // A bookmark that names the sheet but not its number, joined by a number
    // read off the title block.
    const got = resolveSheetIdentity({
      label: null,
      bookmark: { number: null, title: "POWER PLAN" },
      titleBlock: { number: "E-201", title: "SOMETHING ELSE" },
    });
    expect(got.number).toEqual({ value: "E-201", source: "titleblock" });
    expect(got.title).toEqual({ value: "POWER PLAN", source: "bookmark" });
  });

  it("says 'nothing found' explicitly, so a re-read can clear an old guess", () => {
    const got = resolveSheetIdentity({
      label: null,
      bookmark: null,
      titleBlock: null,
    });
    expect(got.number).toEqual({ value: null, source: null });
    expect(got.title).toEqual({ value: null, source: null });
  });
});

describe("sheetDisplay — hand edits win", () => {
  const read = { sheetNumber: "E-101", sheetTitle: "LIGHTING PLAN" };

  it("shows what was read", () => {
    const got = sheetDisplay({ name: "Sheet 4", nameSource: "default" }, read);
    expect(sheetLabel(got)).toBe("E-101  LIGHTING PLAN");
    expect(got.provisional).toBe(false);
  });

  it("a title a person typed beats anything read", () => {
    const got = sheetDisplay(
      { name: "Level 1 lights", nameSource: "user" },
      read
    );
    expect(got.title).toBe("Level 1 lights");
    expect(got.number).toBe("E-101");
  });

  it("falls back to the sheet's name, marked provisional if it is Sheet N", () => {
    expect(
      sheetDisplay({ name: "Sheet 7", nameSource: "default" }, undefined)
    ).toEqual({ number: null, title: "Sheet 7", provisional: true });
  });

  it("does not repeat a number the bookmark name already starts with", () => {
    const got = sheetDisplay(
      { name: "E1 - Power Plan", nameSource: "bookmark" },
      { sheetNumber: "E1", sheetTitle: null }
    );
    expect(sheetLabel(got)).toBe("E1  Power Plan");
  });
});
