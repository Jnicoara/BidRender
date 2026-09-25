/**
 * Jumping to a sheet by number. The numbers are real ones from the bid sets
 * in references/plan-viewer-overhaul.md § 17.4, including the duplicate `E1.0`
 * in Weld County's 18-sheet set.
 */
import { describe, expect, it } from "vitest";
import {
  enterTarget,
  jumpMatches,
  normaliseSheetNumber,
  type JumpEntry,
} from "@/lib/sheetJump";

const entry = (
  pageNumber: number,
  number: string | null,
  title = `Sheet ${pageNumber}`,
  bidPdfId = 1
): JumpEntry => ({ bidPdfId, pageNumber, number, title });

const set: JumpEntry[] = [
  entry(1, "E1.0", "ELECTRICAL LEGEND AND SHEET INDEX"),
  entry(2, "E0.1", "ELECTRICAL SPECIFICATIONS"),
  entry(3, "E1.0", "ELECTRICAL SINGLE-LINE DIAGRAM"),
  entry(4, "E1.1", "PANELBOARD SCHEDULES"),
  entry(5, "E1.01", "SOMETHING ELSE"),
  entry(6, "E-101", "LIGHTING PLAN"),
  entry(7, "E-001", "INDEX"),
  entry(8, null, "Sheet 8"),
];

describe("normaliseSheetNumber", () => {
  it("ignores case, spaces, hyphens and leading zeros", () => {
    for (const typed of ["E-101", "e101", "e-101", "E 101", "e-0101"])
      expect(normaliseSheetNumber(typed)).toBe("E101");
    expect(normaliseSheetNumber("E-001")).toBe("E1");
    expect(normaliseSheetNumber("e-1")).toBe("E1");
  });

  it("keeps the dot and the zeros after it — those name different sheets", () => {
    expect(normaliseSheetNumber("E1.01")).toBe("E1.01");
    expect(normaliseSheetNumber("E1.1")).toBe("E1.1");
    expect(normaliseSheetNumber("E1.01")).not.toBe(
      normaliseSheetNumber("E101")
    );
    expect(normaliseSheetNumber("E0.01")).toBe("E0.01");
  });
});

describe("jumpMatches", () => {
  it("finds an exact number whatever the case or hyphens", () => {
    expect(jumpMatches("e101", set)[0]).toMatchObject({
      pageNumber: 6,
      kind: "exact",
    });
  });

  it("finds a zero-padded number from the short form", () => {
    expect(jumpMatches("e-1", set).filter(m => m.kind === "exact")).toEqual([
      expect.objectContaining({ pageNumber: 7 }),
    ]);
  });

  it("lists BOTH sheets that share a number", () => {
    const exact = jumpMatches("e1.0", set).filter(m => m.kind === "exact");
    expect(exact.map(m => m.pageNumber)).toEqual([1, 3]);
  });

  it("does not confuse E1.1 with E1.01", () => {
    const exact = jumpMatches("E1.1", set).filter(m => m.kind === "exact");
    expect(exact.map(m => m.pageNumber)).toEqual([4]);
  });

  it("finds nothing for a number that is not in the set, without failing", () => {
    expect(jumpMatches("Z-999", set)).toEqual([]);
    expect(jumpMatches("", set)).toEqual([]);
    expect(jumpMatches("   ", set)).toEqual([]);
  });

  it("never matches a sheet with no number by number", () => {
    expect(jumpMatches("8", set).some(m => m.pageNumber === 8)).toBe(false);
  });

  it("puts exact before prefix before title matches", () => {
    const kinds = jumpMatches("e1", set).map(m => m.kind);
    expect(kinds.indexOf("exact")).toBeLessThan(kinds.indexOf("prefix"));
    const byTitle = jumpMatches("lighting", set);
    expect(byTitle).toEqual([
      expect.objectContaining({ pageNumber: 6, kind: "title" }),
    ]);
  });
});

describe("enterTarget — Enter never guesses between duplicates", () => {
  it("jumps when exactly one sheet has the number", () => {
    expect(enterTarget(jumpMatches("e101", set), null)?.pageNumber).toBe(6);
  });

  it("stays open when two sheets share the number", () => {
    expect(enterTarget(jumpMatches("e1.0", set), null)).toBeNull();
  });

  it("goes where the person put the highlight", () => {
    expect(enterTarget(jumpMatches("e1.0", set), 1)?.pageNumber).toBe(3);
  });

  it("does nothing when nothing matched", () => {
    expect(enterTarget(jumpMatches("Z-999", set), null)).toBeNull();
  });
});
