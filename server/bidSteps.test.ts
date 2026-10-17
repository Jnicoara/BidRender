import { describe, expect, it } from "vitest";
import { bidSteps, type BidProgress } from "../shared/bidSteps";

const empty: BidProgress = {
  sheets: 0,
  scaledSheets: 0,
  marks: 0,
  runs: 0,
  lines: 0,
  status: "Draft",
};

describe("bidSteps", () => {
  it("starts a new bid at Plans", () => {
    const { next, states } = bidSteps(empty);
    expect(next).toBe("plans");
    expect(states.plans).toBe("next");
    expect(states.runs).toBe("optional");
  });

  it("walks the usual order: scale, then count, then review, then print", () => {
    expect(bidSteps({ ...empty, sheets: 5 }).next).toBe("scale");
    expect(bidSteps({ ...empty, sheets: 5, scaledSheets: 1 }).next).toBe(
      "count"
    );
    expect(
      bidSteps({ ...empty, sheets: 5, scaledSheets: 1, marks: 12 }).next
    ).toBe("review");
    expect(
      bidSteps({ ...empty, sheets: 5, scaledSheets: 1, marks: 12, lines: 4 })
        .next
    ).toBe("print");
    expect(
      bidSteps({
        sheets: 5,
        scaledSheets: 1,
        marks: 12,
        runs: 0,
        lines: 4,
        status: "Active",
      }).next
    ).toBeNull();
  });

  // Runs are a step you CAN take, never the one you are pushed to.
  it("never makes Runs the next step", () => {
    const s = bidSteps({ ...empty, sheets: 5, scaledSheets: 1, marks: 3 });
    expect(s.next).not.toBe("runs");
    expect(s.states.runs).toBe("optional");
    expect(
      bidSteps({ ...empty, sheets: 5, scaledSheets: 1, marks: 3, runs: 2 })
        .states.runs
    ).toBe("done");
  });

  // CLAUDE.md § "as manual as the user wants": a bid counted by hand is not
  // behind because it has no drawings.
  it("skips Plans and Scale for a bid counted by hand", () => {
    const s = bidSteps({ ...empty, lines: 6 });
    expect(s.states.plans).toBe("skipped");
    expect(s.states.scale).toBe("skipped");
    expect(s.states.count).toBe("done");
    expect(s.next).toBe("print");
  });

  it("does not skip Plans for an empty bid — there is nothing yet", () => {
    expect(bidSteps(empty).states.plans).toBe("next");
  });

  // A step done out of order still counts as done: guidance, not a gate.
  it("counts a step done out of order", () => {
    const s = bidSteps({ ...empty, sheets: 2, marks: 4 });
    expect(s.states.count).toBe("done");
    expect(s.next).toBe("scale");
  });
});
