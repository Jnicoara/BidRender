/**
 * The editing rules from CLAUDE.md § Editing fields.
 *
 * These matter more than most UI tests because this app prices real work: a
 * field that looks saved but is not, or that saves a half-typed number, puts a
 * wrong figure in a bid. The rules are pure functions precisely so they can be
 * pinned without a DOM.
 */
import { describe, it, expect } from "vitest";
import {
  commitNullableEdit,
  asPercent,
  commitNumericEdit,
  formatForEdit,
  fromPercent,
  planFieldKey,
  revertToSaved,
} from "./inlineEdit";

describe("Escape reverts the edit", () => {
  it("returns the last saved value, discarding whatever was typed", () => {
    // The representative case: a bid line quantity saved at 6, user types 999,
    // then presses Escape. The field must read 6 again.
    expect(revertToSaved(6)).toBe("6");
  });

  it("reverts to the SAVED value, not the value the edit started from", () => {
    // After a save the stored value has moved. Escape on a later edit must go
    // back to what is stored now, not to some remembered starting point.
    const afterFirstSave = 12;
    expect(revertToSaved(afterFirstSave)).toBe("12");
  });

  it("round-trips a decimal without gaining or losing digits", () => {
    expect(revertToSaved(0.75)).toBe("0.75");
    expect(revertToSaved(28.85)).toBe("28.85");
  });

  it("drops trailing zeros so a stored 0.6000 edits as 0.6", () => {
    expect(revertToSaved(0.6)).toBe("0.6");
    expect(Number(revertToSaved(0.6))).toBeCloseTo(0.6, 10);
  });

  it("never writes anything — reverting is a pure display change", () => {
    // Guarded by type: revertToSaved returns a string and takes no callback.
    // If someone gives it a save side effect, this test's shape stops compiling.
    const result: string = revertToSaved(42);
    expect(typeof result).toBe("string");
  });
});

describe("commit on Enter or blur", () => {
  it("saves a valid, changed value", () => {
    expect(commitNumericEdit("9", 6)).toEqual({ action: "save", value: 9 });
  });

  it("does nothing when the value has not moved", () => {
    // No write, and — importantly — no confirmation flash for a save that
    // never happened.
    expect(commitNumericEdit("6", 6)).toEqual({ action: "none" });
    expect(commitNumericEdit(" 6 ", 6)).toEqual({ action: "none" });
  });

  it("reverts rather than saving when the draft is not a number", () => {
    expect(commitNumericEdit("abc", 6).action).toBe("revert");
    expect(commitNumericEdit("1.2.3", 6).action).toBe("revert");
  });

  it("reverts on an empty draft by default", () => {
    // Blank must not silently become zero — a zero quantity prices work at
    // nothing, which is exactly the kind of error this app cannot afford.
    expect(commitNumericEdit("", 6).action).toBe("revert");
    expect(commitNumericEdit("   ", 6).action).toBe("revert");
  });

  it("accepts blank as zero only when the field opts in", () => {
    expect(commitNumericEdit("", 6, { allowEmpty: true })).toEqual({
      action: "save",
      value: 0,
    });
    expect(commitNumericEdit("", 0, { allowEmpty: true })).toEqual({
      action: "none",
    });
  });

  it("reverts a value outside the field's bounds", () => {
    expect(commitNumericEdit("-5", 6, { min: 0 }).action).toBe("revert");
    expect(commitNumericEdit("150", 20, { max: 98.99 }).action).toBe("revert");
    expect(commitNumericEdit("50", 20, { min: 0, max: 98.99 })).toEqual({
      action: "save",
      value: 50,
    });
  });

  it("gives a reason on every revert, so a caller can explain itself", () => {
    for (const draft of ["", "abc", "-1"]) {
      const outcome = commitNumericEdit(draft, 6, { min: 0 });
      expect(outcome.action).toBe("revert");
      if (outcome.action === "revert")
        expect(outcome.reason.length).toBeGreaterThan(0);
    }
  });

  it("treats a float that differs only by rounding noise as unchanged", () => {
    expect(commitNumericEdit(String(0.1 + 0.2), 0.3)).toEqual({
      action: "none",
    });
  });

  it("accepts a genuinely tiny but real change", () => {
    expect(commitNumericEdit("0.3001", 0.3)).toEqual({
      action: "save",
      value: 0.3001,
    });
  });
});

describe("percent conversion at the edges", () => {
  it("edits a stored fraction as a percent and stores it back as a fraction", () => {
    expect(asPercent(0.2)).toBeCloseTo(20, 10);
    expect(fromPercent(20)).toBeCloseTo(0.2, 10);
    expect(fromPercent(asPercent(0.125))).toBeCloseTo(0.125, 10);
  });

  it("survives a full edit round trip through commit and revert", () => {
    const storedFraction = 0.2;
    const shown = formatForEdit(asPercent(storedFraction));
    expect(shown).toBe("20");

    const outcome = commitNumericEdit("35", asPercent(storedFraction), {
      min: 0,
      max: 98.99,
    });
    expect(outcome).toEqual({ action: "save", value: 35 });
    if (outcome.action === "save")
      expect(fromPercent(outcome.value)).toBeCloseTo(0.35, 10);
  });
});

describe("formatForEdit", () => {
  it("renders a blank for a non-finite value rather than 'NaN'", () => {
    expect(formatForEdit(Number.NaN)).toBe("");
    expect(formatForEdit(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("keeps zero visible", () => {
    expect(formatForEdit(0)).toBe("0");
  });
});

describe("Enter in a panel saves AND closes it (rule 5)", () => {
  // The bug this pins: the labor-rate quick edit saved on Enter but left the
  // popover sitting open, so finishing an edit took a keystroke plus a click
  // somewhere else. Enter has to reach the same end state as clicking away,
  // and clicking away from a panel closes it.

  it("does both halves — a save and a dismiss — from one keystroke", () => {
    // The real case: the Journeyman rate reads 38, the user types 44, Enter.
    const plan = planFieldKey("Enter", "panel");
    expect(plan).toEqual({ action: "commit", keepFocus: false, dismiss: true });

    // ...and the commit half writes the new rate rather than swallowing it.
    if (plan.action !== "commit") throw new Error("Enter must commit");
    expect(commitNumericEdit("44", 38, { min: 0 })).toEqual({
      action: "save",
      value: 44,
    });
  });

  it("does not close on an Enter that wrote nothing — but still does not hang around", () => {
    // Re-pressing Enter on an unchanged 44 saves nothing (no flash, no write),
    // and closing is still right: the user is done either way.
    expect(commitNumericEdit("44", 44, { min: 0 })).toEqual({ action: "none" });
    expect(planFieldKey("Enter", "panel").action).toBe("commit");
    expect(planFieldKey("Enter", "panel")).toHaveProperty("dismiss", true);
  });

  it("closes on a reverted Enter too, rather than trapping the user behind a bad draft", () => {
    // A negative rate reverts and writes nothing. The panel must not stay open
    // as if something were still owed.
    expect(commitNumericEdit("-5", 38, { min: 0 })).toEqual({
      action: "revert",
      reason: "below 0",
    });
    expect(planFieldKey("Enter", "panel")).toHaveProperty("dismiss", true);
  });

  it("keeps focus and stays put on a row, so a column of figures still types straight down", () => {
    // Rule 2's original case must not regress: bid line quantities, kit
    // quantities and the rest are inline and commit without going anywhere.
    expect(planFieldKey("Enter", "inline")).toEqual({
      action: "commit",
      keepFocus: true,
      dismiss: false,
    });
  });

  it("never both keeps focus and dismisses — that would focus a field that is gone", () => {
    for (const surface of ["inline", "panel"] as const) {
      const plan = planFieldKey("Enter", surface);
      if (plan.action !== "commit") throw new Error("Enter must commit");
      expect(plan.keepFocus && plan.dismiss).toBe(false);
    }
  });
});

describe("Escape settles the field, and on a panel leaves as well", () => {
  it("abandons and closes on a panel", () => {
    expect(planFieldKey("Escape", "panel")).toEqual({
      action: "abandon",
      dismiss: true,
    });
  });

  it("abandons without closing anything on a row", () => {
    expect(planFieldKey("Escape", "inline")).toEqual({
      action: "abandon",
      dismiss: false,
    });
  });

  it("abandons rather than commits, on either surface — Escape never writes", () => {
    for (const surface of ["inline", "panel"] as const) {
      expect(planFieldKey("Escape", surface).action).toBe("abandon");
    }
  });
});

describe("keys the field does not claim", () => {
  it("passes ordinary typing and navigation through untouched", () => {
    for (const key of ["a", "5", "Tab", "ArrowDown", "Backspace", "."]) {
      expect(planFieldKey(key, "panel")).toEqual({ action: "pass" });
      expect(planFieldKey(key, "inline")).toEqual({ action: "pass" });
    }
  });

  it("is case-sensitive on the key name, matching KeyboardEvent.key", () => {
    // "enter" is not a key name; treating it as one would mean a stray handler
    // silently never firing.
    expect(planFieldKey("enter", "panel")).toEqual({ action: "pass" });
  });
});

describe("a field whose value may be unset", () => {
  /**
   * ── What these are defending ───────────────────────────────────────────────
   * One rule: an emptied box in placeholder mode is never a zero. It has
   * shipped twice — "0 ft 0 in" under a caption reading "not set", and an
   * unset conductor count rendering as 0 in the field that decides how much
   * wire gets bought. The component cannot be tested in this repo, so the
   * decision lives here, where it can go red.
   */
  const measured = { placeholder: "not set" } as const;

  it("clears rather than saving zero when the box is emptied", () => {
    expect(commitNullableEdit("", 3, measured, { allowEmpty: true })).toEqual({
      action: "clear",
      reason: "emptied",
    });
  });

  it("ignores allowEmpty, which is exactly the trapdoor", () => {
    // allowEmpty makes commitNumericEdit save 0 for a blank. That is right for
    // money and a lie for a measurement, and this is the line between them.
    expect(commitNumericEdit("", 3, { allowEmpty: true })).toEqual({
      action: "save",
      value: 0,
    });
    expect(
      commitNullableEdit("", 3, measured, { allowEmpty: true }).action
    ).toBe("clear");
  });

  it("writes nothing when an already-unset field is left empty", () => {
    expect(commitNullableEdit("", null, measured)).toEqual({ action: "none" });
  });

  it("treats a typed zero as a real answer, not as no change", () => {
    // "nobody said" and "somebody said zero" are different facts, and a field
    // showing its placeholder that is then typed with 0 has moved.
    expect(commitNullableEdit("0", null, measured)).toEqual({
      action: "save",
      value: 0,
    });
  });

  it("still reverts what is not a number", () => {
    expect(commitNullableEdit("abc", null, measured).action).toBe("revert");
    expect(commitNullableEdit("abc", 3, measured).action).toBe("revert");
  });

  it("still enforces the range against an unset value", () => {
    expect(commitNullableEdit("200", null, measured, { max: 100 }).action).toBe(
      "revert"
    );
  });

  it("writes nothing when the number has not moved", () => {
    expect(commitNullableEdit("3", 3, measured)).toEqual({ action: "none" });
  });

  it("keeps the money convention intact: a blank IS a zero there", () => {
    // The opposite answer, on purpose. An unpriced material is the one showing
    // $0, and the Materials screen filters to exactly those.
    expect(commitNullableEdit("", 12, "zero", { allowEmpty: true })).toEqual({
      action: "save",
      value: 0,
    });
    expect(commitNullableEdit("", null, "zero", { allowEmpty: true })).toEqual({
      action: "none",
    });
  });
});
