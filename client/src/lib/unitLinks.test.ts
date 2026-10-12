/**
 * The wording of the link badges and the two destructive confirmations.
 *
 * Worth testing separately from the components because these strings ARE the
 * safety mechanism: "Archive 40 copies of Standard Room?" is the only thing
 * standing between a mis-click and forty rooms leaving the bid, and a string
 * inside JSX is checked by nobody.
 */
import { describe, it, expect } from "vitest";
import {
  archiveCopiesConfirmCopy,
  pushConfirmCopy,
  pushDoneCopy,
  templateActionsEnabled,
  unitBadge,
  type UnitState,
} from "./unitLinks";

const state = (over: Partial<UnitState> = {}): UnitState => ({
  label: "Standard Room",
  role: "template",
  templateLabel: null,
  linkedCount: 0,
  forkedCount: 0,
  ...over,
});

describe("unitBadge", () => {
  it("counts a template's copies", () => {
    const badge = unitBadge(state({ linkedCount: 35, forkedCount: 0 }))!;
    expect(badge.tone).toBe("template");
    expect(badge.text).toBe("Template · 35");
    expect(badge.title).toBe("Template for 35 copies.");
  });

  it("splits linked from edited when a template has both", () => {
    const badge = unitBadge(state({ linkedCount: 33, forkedCount: 2 }))!;
    expect(badge.text).toBe("Template · 35");
    expect(badge.title).toContain("33 still following");
    expect(badge.title).toContain("2 edited separately");
  });

  it("warns a linked copy that editing it will unlink it", () => {
    const badge = unitBadge(
      state({ role: "linked", label: "Room 104", templateLabel: "ADA Room" })
    )!;
    expect(badge.tone).toBe("linked");
    expect(badge.text).toBe("Linked");
    expect(badge.title).toContain("ADA Room");
    expect(badge.title).toMatch(/unlink/i);
  });

  it("says a forked copy no longer receives template changes", () => {
    const badge = unitBadge(
      state({
        role: "forked",
        label: "Room 102",
        templateLabel: "Standard Room",
      })
    )!;
    expect(badge.tone).toBe("forked");
    // "Edited", not "Forked" — the estimator never chose the word "fork".
    expect(badge.text).toBe("Edited");
    expect(badge.title).toContain("no longer reach it");
  });

  it("gives a one-off label no badge at all", () => {
    // Most bids never use templates; badging every hand-typed label would put
    // an unused feature on every row.
    expect(unitBadge(state({ role: "standalone" }))).toBeNull();
  });

  it("uses singular wording for a single copy", () => {
    expect(unitBadge(state({ linkedCount: 1 }))!.title).toBe(
      "Template for 1 copy."
    );
  });
});

describe("templateActionsEnabled", () => {
  it("is on for a template with copies still following", () => {
    expect(templateActionsEnabled(state({ linkedCount: 3 }))).toBe(true);
  });

  it("is off when every copy has been forked away", () => {
    // Both actions would be no-ops, and a button that does nothing reads as
    // broken rather than empty.
    expect(
      templateActionsEnabled(state({ linkedCount: 0, forkedCount: 5 }))
    ).toBe(false);
  });

  it("is off for anything that is not a template", () => {
    expect(templateActionsEnabled(state({ role: "linked" }))).toBe(false);
    expect(templateActionsEnabled(state({ role: "standalone" }))).toBe(false);
  });
});

describe("pushConfirmCopy", () => {
  it("puts the count and the template in the title", () => {
    const copy = pushConfirmCopy("Standard Room", 35, 0);
    expect(copy.title).toBe("Update 35 copies of Standard Room?");
    expect(copy.confirm).toBe("Update 35");
  });

  it("says forked copies are left alone when there are any", () => {
    const copy = pushConfirmCopy("Standard Room", 33, 2);
    expect(copy.body).toContain(
      "2 copies you edited separately are left alone"
    );
  });

  it("stays quiet about forks when there are none", () => {
    expect(pushConfirmCopy("Standard Room", 5, 0).body).not.toMatch(
      /edited separately/
    );
  });

  it("reads correctly for one copy and one fork", () => {
    const copy = pushConfirmCopy("ADA Room", 1, 1);
    expect(copy.title).toBe("Update 1 copy of ADA Room?");
    expect(copy.body).toContain("1 copy you edited separately is left alone");
  });
});

describe("archiveCopiesConfirmCopy", () => {
  it("says archive rather than delete, and promises the undo", () => {
    const copy = archiveCopiesConfirmCopy("Standard Room", 40, 0);
    expect(copy.title).toBe("Archive 40 copies of Standard Room?");
    expect(copy.body).toMatch(/undo/i);
    expect(copy.body).not.toMatch(/delete/i);
  });

  it("promises the template itself survives", () => {
    expect(archiveCopiesConfirmCopy("Standard Room", 40, 0).body).toContain(
      "Standard Room itself stays"
    );
  });

  it("says edited copies are kept", () => {
    expect(archiveCopiesConfirmCopy("Standard Room", 38, 2).body).toContain(
      "2 copies you edited separately are kept"
    );
  });
});

describe("what a finished push says", () => {
  const result = {
    updated: ["Room 101", "Room 102"],
    skippedForked: [] as string[],
    scopeKept: [] as string[],
  };

  it("says how many copies moved, as before", () => {
    expect(pushDoneCopy(result)).toBe("Updated 2 copies.");
    expect(pushDoneCopy({ ...result, skippedForked: ["Room 103"] })).toBe(
      "Updated 2 copies, left 1 edited one alone."
    );
  });

  it("on a locked bid, names the copies whose tags were kept (0146)", () => {
    expect(pushDoneCopy({ ...result, scopeKept: ["Room 101"] })).toBe(
      "Updated 2 copies. The bid is locked, so who does the work did not change on Room 101 — unlock it to push that too."
    );
    expect(
      pushDoneCopy({ ...result, scopeKept: ["Room 101", "Room 102"] })
    ).toContain("did not change on 2 copies");
  });
});
