/**
 * shared/sheetWorkTag.ts and the status-view half of shared/markStatus.ts —
 * the rules the Plans screen only iterates (status-and-scope-plan § 1, § 2a;
 * owner answers § 8 Q2, Q4, Q5).
 */
import { describe, expect, it } from "vitest";
import {
  placingChoices,
  placingOnSheet,
  suggestedWorkTag,
  type Placing,
} from "../shared/sheetWorkTag";
import {
  STATUS_FOCUS_DIM_OPACITY,
  emptySplit,
  markFocusOpacity,
  splitsByGroup,
  splitsBySheet,
  statusViewParts,
  statusViewWanted,
  sumSplits,
} from "../shared/markStatus";

const chosen = (status: Placing["status"]): Placing => ({
  status,
  fromSheet: false,
});

describe("what 'Placing as' starts at when a sheet opens", () => {
  it("a demo sheet starts at Remove, and says the sheet chose it", () => {
    expect(placingOnSheet("demo", chosen("new"))).toEqual({
      status: "remove",
      fromSheet: true,
    });
    expect(placingOnSheet("demo", chosen("existing"))).toEqual({
      status: "remove",
      fromSheet: true,
    });
  });

  it("a Remove the demo sheet chose does not follow you onto an untagged or both sheet", () => {
    const fromDemo = placingOnSheet("demo", chosen("new"));
    expect(placingOnSheet(null, fromDemo)).toEqual(chosen("new"));
    expect(placingOnSheet("both", fromDemo)).toEqual(chosen("new"));
  });

  it("a person's own choice stays on an untagged or both sheet (it is sticky)", () => {
    expect(placingOnSheet(null, chosen("existing"))).toEqual(
      chosen("existing")
    );
    expect(placingOnSheet(null, chosen("remove"))).toEqual(chosen("remove"));
    expect(placingOnSheet("both", chosen("remove"))).toEqual(chosen("remove"));
  });

  it("a new-work sheet starts at New", () => {
    expect(placingOnSheet("new", chosen("existing"))).toEqual(chosen("new"));
    expect(
      placingOnSheet("new", { status: "remove", fromSheet: true })
    ).toEqual(chosen("new"));
  });

  it("not said changes nothing — the screen as it was before the tag", () => {
    for (const status of ["new", "existing"] as const)
      expect(placingOnSheet(null, chosen(status))).toEqual(chosen(status));
  });
});

describe("which 'Placing as' buttons show", () => {
  it("the basic path keeps its two", () => {
    expect(placingChoices(null, "new")).toEqual(["new", "existing"]);
    expect(placingChoices("new", "existing")).toEqual(["new", "existing"]);
  });
  it("a demo or both sheet adds Remove", () => {
    expect(placingChoices("demo", "remove")).toEqual([
      "new",
      "existing",
      "remove",
    ]);
    expect(placingChoices("both", "new")).toContain("remove");
  });
  it("never hides the choice that is active", () => {
    expect(placingChoices(null, "remove")).toContain("remove");
  });
});

describe("the title's suggestion — offered, never applied", () => {
  it("reads demolition words", () => {
    expect(suggestedWorkTag("E-101 ELECTRICAL DEMOLITION PLAN")).toBe("demo");
    expect(suggestedWorkTag("Demo plan — level 1")).toBe("demo");
    expect(suggestedWorkTag("DEMOLITION AND NEW WORK PLAN")).toBe("both");
  });
  it("says nothing about anything else", () => {
    expect(suggestedWorkTag("LIGHTING PLAN")).toBeNull();
    expect(suggestedWorkTag("DEMONSTRATION KITCHEN")).toBeNull();
    expect(suggestedWorkTag(null)).toBeNull();
  });
});

describe("the bid's status bar", () => {
  const rows = [
    { groupId: 1, sheetId: 10, status: null, total: 4 },
    { groupId: 1, sheetId: 10, status: "existing", total: 2 },
    { groupId: 1, sheetId: 11, status: "remove", total: 5 },
    { groupId: 2, sheetId: 11, status: "relocate", total: 1 },
    // No count: left out everywhere, as the cards always did.
    { groupId: null, sheetId: 11, status: "remove", total: 9 },
  ];

  it("adds up the same way by count and by sheet", () => {
    const byGroup = sumSplits(splitsByGroup(rows).values());
    const bySheet = sumSplits(splitsBySheet(rows).values());
    expect(bySheet).toEqual(byGroup);
    expect(byGroup).toEqual({
      new: 4,
      existing: 2,
      remove: 5,
      relocate: 1,
      unconfirmed: 0,
    });
    expect(splitsBySheet(rows).get(11)).toEqual({
      ...emptySplit(),
      remove: 5,
      relocate: 1,
    });
  });

  it("shows nothing on a bid with only new marks — the basic path", () => {
    expect(statusViewWanted({ ...emptySplit(), new: 30 })).toBe(false);
    expect(statusViewWanted({ ...emptySplit(), new: 30, remove: 1 })).toBe(
      true
    );
  });

  it("reads '30 new · 8 staying · 12 removed · 4 relocated', unconfirmed only when any", () => {
    const split = {
      new: 30,
      existing: 8,
      remove: 12,
      relocate: 4,
      unconfirmed: 0,
    };
    expect(
      statusViewParts(split)
        .map(p => `${p.count} ${p.word}`)
        .join(" · ")
    ).toBe("30 new · 8 staying · 12 removed · 4 relocated");
    expect(
      statusViewParts({ ...split, unconfirmed: 3 }).map(p => p.word)
    ).toContain("unconfirmed");
  });

  it("picking a status dims the others and hides none", () => {
    expect(markFocusOpacity("remove", "remove")).toBe(1);
    expect(markFocusOpacity(null, "remove")).toBe(STATUS_FOCUS_DIM_OPACITY);
    expect(markFocusOpacity(null, "new")).toBe(1);
    expect(markFocusOpacity("existing", null)).toBe(1);
    expect(STATUS_FOCUS_DIM_OPACITY).toBeGreaterThan(0);
  });
});
