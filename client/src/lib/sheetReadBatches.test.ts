import { describe, expect, it } from "vitest";
import { pageBatch, sourcesByPage, titleBatch } from "@/lib/sheetReadBatches";

const page = (pageNumber: number, titleBlockNumber: string | null = null) => ({
  pageNumber,
  text: `text of ${pageNumber}`,
  hasTextLayer: true,
  titleBlockNumber,
});

describe("sourcesByPage", () => {
  it("parses labels by position and ignores bare page numbers", () => {
    const got = sourcesByPage(["E-001 - SPECS", "18"], []);
    expect(got.get(1)?.label).toEqual({ number: "E-001", title: "SPECS" });
    expect(got.get(2)).toBeUndefined();
  });

  it("takes the first bookmark on a page that names a sheet", () => {
    // Outline order: a group heading, then the sheet, both on page 1.
    const got = sourcesByPage(null, [
      { pageNumber: 1, title: "GENERAL" },
      { pageNumber: 1, title: "G-000 - COVER SHEET" },
      { pageNumber: 1, title: "G-001 - CODE ANALYSIS" },
    ]);
    expect(got.get(1)?.bookmark).toEqual({
      number: "G-000",
      title: "COVER SHEET",
    });
  });
});

describe("pageBatch", () => {
  it("fills the number from the title block only when nothing better said", () => {
    const sources = sourcesByPage(["E-101 - LIGHTING PLAN"], []);
    const [first, second] = pageBatch(
      [page(1, "E-999"), page(2, "E-102")],
      sources
    );
    expect(first.number).toEqual({ value: "E-101", source: "label" });
    expect(second.number).toEqual({ value: "E-102", source: "titleblock" });
  });

  it("says 'found nothing' out loud, so a re-read can clear an old guess", () => {
    const [only] = pageBatch([page(1)], new Map());
    expect(only.number).toEqual({ value: null, source: null });
    expect(only.title).toEqual({ value: null, source: null });
    expect(only.text).toEqual({ text: "text of 1", hasTextLayer: true });
  });
});

describe("titleBatch", () => {
  it("sends a title-block title only where no label or bookmark gave one", () => {
    const sources = sourcesByPage(["E-101 - LIGHTING PLAN"], []);
    expect(titleBatch(["WRONG", "POWER PLAN", null], sources)).toEqual([
      { pageNumber: 2, title: { value: "POWER PLAN", source: "titleblock" } },
    ]);
  });
});
