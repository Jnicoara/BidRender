import { describe, expect, it } from "vitest";
import { countDeleteQuestion, runDeleteQuestion } from "./deleteQuestions";

const row = (
  over: Partial<Parameters<typeof runDeleteQuestion>[0][number]> = {}
) => ({
  name: "Homerun",
  parentRunId: null,
  circuits: [],
  quantities: { runFeet: 84, verticalFeet: 0 },
  ...over,
});

describe("the question before deleting a whole run", () => {
  it("names the run and its length, and the button says what it does", () => {
    const q = runDeleteQuestion([row()]);
    expect(q.title).toBe("Delete run Homerun — 84 ft?");
    expect(q.action).toBe("Delete run");
  });

  it("adds every leg, the drops and the wire that go with it", () => {
    const q = runDeleteQuestion([
      row({ quantities: { runFeet: 60, verticalFeet: 8 }, circuits: [1] }),
      row({
        name: "leg",
        parentRunId: 1,
        quantities: { runFeet: 24.5, verticalFeet: 4 },
        circuits: [1, 2],
      }),
    ]);
    expect(q.title).toBe("Delete run Homerun — 84.5 ft, 12 ft of drops?");
    expect(q.lines).toContain(
      "All 2 legs go with it, and the tees that join them."
    );
    expect(q.lines).toContain("3 circuits of wire in it go too.");
  });

  it("says a run with no scale has no length, rather than 0 ft", () => {
    const q = runDeleteQuestion([row({ quantities: null })]);
    expect(q.title).toBe("Delete run Homerun — no length yet?");
    expect(q.title).not.toMatch(/0 ft/);
  });
});

describe("the question before deleting a whole count", () => {
  it("says every sheet, and points at the card's trash for one sheet", () => {
    const q = countDeleteQuestion({ label: "Exit sign", marks: 14 });
    expect(q.title).toBe('Delete count "Exit sign" — 14 marks on every sheet?');
    expect(q.action).toBe("Delete count");
    expect(q.lines.join(" ")).toMatch(/trash on the card/);
  });
});
