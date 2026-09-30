import { describe, expect, it } from "vitest";
import { sheetClearQuestion } from "./sheetClearQuestion";

describe("the question before clearing a sheet", () => {
  it("names exactly what goes, and the button carries the number", () => {
    const q = sheetClearQuestion("E1.01", {
      runs: 12,
      runsWithLegs: 3,
      marks: 40,
      counts: 5,
      countsLeftEmpty: 2,
    });
    expect(q.lines[0]).toBe(
      "Remove 12 runs (3 with branch legs) and 40 marks in 5 counts from E1.01?"
    );
    expect(q.lines[1]).toBe(
      "2 counts have no marks on any other sheet, so their bid lines will read 0."
    );
    expect(q.lines[2]).toMatch(/undo/);
    expect(q.confirm).toBe("Remove 52 items");
  });

  it("speaks in the singular when there is one", () => {
    const q = sheetClearQuestion("E2", {
      runs: 1,
      runsWithLegs: 0,
      marks: 1,
      counts: 1,
      countsLeftEmpty: 1,
    });
    expect(q.lines[0]).toBe("Remove 1 run and 1 mark in 1 count from E2?");
    expect(q.lines[1]).toMatch(/^1 count has .* its bid line will read 0\.$/);
    expect(q.confirm).toBe("Remove 2 items");
  });

  it("leaves out what is not there", () => {
    const q = sheetClearQuestion("E3", {
      runs: 0,
      runsWithLegs: 0,
      marks: 4,
      counts: 2,
      countsLeftEmpty: 0,
    });
    expect(q.lines[0]).toBe("Remove 4 marks in 2 counts from E3?");
    expect(q.lines.some(l => /read 0/.test(l))).toBe(false);
  });

  it("offers nothing on an empty sheet", () => {
    const q = sheetClearQuestion("E4", {
      runs: 0,
      runsWithLegs: 0,
      marks: 0,
      counts: 0,
      countsLeftEmpty: 0,
    });
    expect(q.empty).toBe(true);
  });
});
