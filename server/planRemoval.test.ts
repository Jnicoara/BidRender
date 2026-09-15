/**
 * The words of the remove-plan warning (references/takeoff-spec.md, row V3).
 *
 * The old dialog promised that only sheet names and scales would go and that
 * the file could simply be attached again, while the delete took every stamp
 * and traced run with it. These pin the replacement to what actually happens.
 */
import { describe, expect, it } from "vitest";
import {
  describePlanRemoval,
  hasTakeoffWork,
  type PlanRemovalImpact,
  type PlanRemovalWarning,
} from "../shared/planRemoval";

const worked: PlanRemovalImpact = {
  sheets: 4,
  stamps: 14,
  runs: 3,
  circuits: 5,
  readerResults: 1,
};

const untouched: PlanRemovalImpact = {
  sheets: 4,
  stamps: 0,
  runs: 0,
  circuits: 0,
  readerResults: 0,
};

const allText = (w: PlanRemovalWarning) =>
  [w.title, w.lead, ...w.losses, ...w.after, w.confirmLabel].join(" | ");

describe("the remove-plan warning", () => {
  it("lists what will be deleted, with counts", () => {
    const warning = describePlanRemoval("E-Series.pdf", worked);
    expect(warning.title).toBe("Delete this plan and its takeoff?");
    expect(warning.lead).toBe("Removing E-Series.pdf permanently deletes:");
    expect(warning.losses).toEqual([
      "14 stamps",
      "3 traced runs, with 5 circuits",
      "1 plan-reader result",
      "the names and scales of its 4 sheets",
    ]);
    expect(warning.after.join(" ")).toMatch(/cannot be undone/);
    expect(warning.after.join(" ")).toMatch(/drawing only/);
    expect(warning.confirmLabel).toBe("Delete plan and takeoff");
  });

  it("uses the singular for one of anything", () => {
    const warning = describePlanRemoval("E1.pdf", {
      sheets: 1,
      stamps: 1,
      runs: 1,
      circuits: 0,
      readerResults: 0,
    });
    expect(warning.losses).toEqual([
      "1 stamp",
      "1 traced run",
      "the names and scales of its 1 sheet",
    ]);
  });

  it("never repeats the promises that made the old dialog wrong", () => {
    const text = allText(describePlanRemoval("E-Series.pdf", worked));
    expect(text).not.toMatch(/untouched/i);
    expect(text).not.toMatch(/you can attach the file again/i);
  });

  it("treats a plan-reader result on its own as work to lose", () => {
    const readerOnly = { ...untouched, readerResults: 2 };
    expect(hasTakeoffWork(readerOnly)).toBe(true);
    expect(describePlanRemoval("E1.pdf", readerOnly).confirmLabel).toBe(
      "Delete plan and takeoff"
    );
  });

  it("says plainly when nothing has been placed", () => {
    const warning = describePlanRemoval("E-Series.pdf", untouched);
    expect(hasTakeoffWork(untouched)).toBe(false);
    expect(warning.title).toBe("Remove this plan?");
    expect(warning.lead).toBe(
      "Nothing has been stamped or traced on E-Series.pdf."
    );
    expect(warning.losses).toEqual([]);
    expect(warning.after.join(" ")).toMatch(/names and scales of its 4 sheets/);
    expect(warning.confirmLabel).toBe("Remove plan");
  });

  it("still warns in full when the count could not be loaded", () => {
    const warning = describePlanRemoval("E-Series.pdf", null);
    expect(warning.title).toBe("Delete this plan and its takeoff?");
    expect(warning.losses).toContain("every stamp");
    expect(warning.losses).toContain("every traced run, and its circuits");
    expect(warning.after.join(" ")).toMatch(/could not be checked/);
    expect(warning.confirmLabel).toBe("Delete plan and takeoff");
  });

  it("writes large counts the way people read them", () => {
    const warning = describePlanRemoval("Set.pdf", { ...worked, stamps: 1204 });
    expect(warning.losses[0]).toBe("1,204 stamps");
  });
});
