import { describe, expect, it } from "vitest";
import {
  draftHoursSource,
  draftStepLines,
  type LibraryStep,
} from "./assemblyStepsDraft";

const lib = (
  id: number,
  minutes: string | null,
  baselineId: number | null = null
): LibraryStep => ({
  id,
  baselineId,
  name: `Step ${id}`,
  unit: "each",
  minutes,
  reasoning: null,
  isExample: false,
  usedBy: 1,
});

const nm = (qty: number, laborHours: string | null) => ({
  qty,
  unitOfSale: "foot",
  category: "Wire & Cable",
  laborHours,
  overrideLaborHours: null,
});

describe("the editor's step lines (assemblyStepsDraft)", () => {
  it("follows a shipped step to the company's fork of it", () => {
    const [line] = draftStepLines(
      [{ kind: "step", laborStepId: 5, count: 2 }],
      [lib(5, "4.00"), lib(90, "6.00", 5)].filter(s => s.id !== 5),
      []
    );
    expect(line).toMatchObject({ kind: "step", minutes: "6.00", count: 2 });
  });

  it("a step the library no longer has is NOT SET, never dropped", () => {
    const { source, crossCheck } = draftHoursSource({
      typedHours: "",
      steps: [
        { kind: "step", laborStepId: 1, count: 1 },
        { kind: "step", laborStepId: 404, count: 1 },
      ],
      library: [lib(1, "30.00")],
      recipe: [],
    });
    expect(source).toMatchObject({ source: "notSet", hours: null });
    expect(crossCheck).toBe("Steps: 1 of 2 timed");
  });

  it("the cable step counts only the recipe's foot-sold cable", () => {
    const { source } = draftHoursSource({
      typedHours: "",
      steps: [{ kind: "cable" }],
      library: [],
      recipe: [
        nm(25, "0.0080"),
        // A box is not cable; its hours are no business of the cable step.
        { ...nm(1, null), unitOfSale: "each", category: "Boxes" },
      ],
    });
    expect(source).toMatchObject({ source: "steps", hours: 0.2 });
  });

  it("typed hours win, and the steps become the quiet line beside them", () => {
    const { source, crossCheck } = draftHoursSource({
      typedHours: "0.75",
      steps: [{ kind: "step", laborStepId: 1, count: 1 }],
      library: [lib(1, "30.00")],
      recipe: [],
    });
    expect(source).toMatchObject({ source: "typed", hours: 0.75 });
    expect(crossCheck).toBe("Steps add to 0.5 h");
  });

  it("no steps: no line at all", () => {
    expect(
      draftHoursSource({ typedHours: "", steps: [], library: [], recipe: [] })
        .crossCheck
    ).toBeNull();
  });
});
