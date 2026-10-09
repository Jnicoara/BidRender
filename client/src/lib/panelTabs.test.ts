import { describe, expect, it } from "vitest";
import {
  sheetLine,
  storedTab,
  tabForSelection,
  tabWarnings,
  visibleTabs,
} from "./panelTabs";

describe("the remembered tab (§ 1 rule 2)", () => {
  it("opens what was remembered", () => {
    expect(storedTab("runs", false)).toBe("runs");
    expect(storedTab("totals", true)).toBe("totals");
  });

  it("opens Counts for nothing stored, or anything it does not know", () => {
    expect(storedTab(null, true)).toBe("counts");
    expect(storedTab("drawers", true)).toBe("counts");
  });

  it("never opens the Reader where the reader does not exist (rule 6)", () => {
    expect(visibleTabs(false)).not.toContain("reader");
    expect(storedTab("reader", false)).toBe("counts");
    expect(storedTab("reader", true)).toBe("reader");
  });
});

describe("selecting on the drawing opens its tab (rule 4)", () => {
  it("a run opens Runs, a mark opens Counts", () => {
    expect(tabForSelection("run")).toBe("runs");
    expect(tabForSelection("mark")).toBe("counts");
  });
});

describe("the pinned 'This sheet' line (answer 6)", () => {
  it("never adds marks to runs — the fixture's '9' was 3 marks + 6 runs", () => {
    const line = sheetLine({
      counts: [{ placed: 3 }],
      runs: Array.from({ length: 6 }, (_, i) => ({
        runTypeId: i < 4 ? 1 : 2,
        isSuggestion: false,
        feet: 10,
      })),
    });
    expect(line).toBe("This sheet: 3 marks · 3 items · 60 ft of runs");
    expect(line).not.toContain("9");
  });

  it("says when some runs could not be measured, rather than a short total", () => {
    expect(
      sheetLine({
        counts: [],
        runs: [
          { runTypeId: 1, isSuggestion: false, feet: 12.5 },
          { runTypeId: 1, isSuggestion: false, feet: null },
        ],
      })
    ).toBe("This sheet: 0 marks · 1 item · 12.5 ft of runs (1 not measured)");
  });

  it("leaves suggestions out, and says nothing about runs when there are none", () => {
    expect(
      sheetLine({
        counts: [{ placed: 1 }],
        runs: [{ runTypeId: 1, isSuggestion: true, feet: 40 }],
      })
    ).toBe("This sheet: 1 mark · 1 item");
  });

  /*
    The sheet's marks (or runs) have not arrived yet. The page used to feed
    `[]` here, so the line read "0 marks" — a zero nobody had counted, which
    looks exactly like marks that were lost (todo.md, smoke step 10).
  */
  it("says it is loading — never '0 marks' — until the sheet's lists arrive", () => {
    for (const input of [
      { counts: null, runs: null },
      { counts: null, runs: [] },
      { counts: [], runs: null },
    ]) {
      const line = sheetLine(input);
      expect(line).toBe("This sheet: loading…");
      expect(line).not.toMatch(/\d/);
    }
  });

  it("still says 0 marks when the sheet really has none", () => {
    expect(sheetLine({ counts: [], runs: [] })).toBe(
      "This sheet: 0 marks · 0 items"
    );
  });
});

describe("a tab with a warning in it shows a mark (rule 5)", () => {
  it("Totals is marked while anything is not on the bid", () => {
    const quiet = tabWarnings({
      notOnBid: 0,
      totalsLeftOut: 0,
      countsThatCannotSend: 0,
    });
    expect(quiet.size).toBe(0);
    expect(
      tabWarnings({ notOnBid: 2, totalsLeftOut: 0, countsThatCannotSend: 0 })
    ).toContain("totals");
    expect(
      tabWarnings({ notOnBid: 0, totalsLeftOut: 1, countsThatCannotSend: 0 })
    ).toContain("totals");
  });

  it("Counts is marked for a count that can never reach the bid", () => {
    expect(
      tabWarnings({ notOnBid: 0, totalsLeftOut: 0, countsThatCannotSend: 1 })
    ).toContain("counts");
  });
});
