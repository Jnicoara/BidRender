/**
 * The bridge's rules, tested as the sentences they are.
 *
 * R3 has been listed Missing in references/takeoff-spec.md since 2026-09-14 and
 * twice described as belonging "in the CODE, not only in this document". These
 * are what make that true: each one reads like the rule it pins, so a change
 * that breaks a rule fails a test that names it rather than one that asserts a
 * number.
 *
 * Fixtures price themselves. Nothing here borrows a shipped assembly or a
 * seeded rate — CLAUDE.md § Starter content: a test that leans on seed data is
 * really asserting the seed has not changed.
 */
import { describe, expect, it } from "vitest";
import {
  countsWaitingToSend,
  countsWithNoPrice,
  doubleCountedAssemblies,
  resolveLineQty,
  sendWarning,
  sendability,
  type BridgeGroup,
  type BridgeLine,
} from "../shared/takeoffBridge";

function group(over: Partial<BridgeGroup> = {}): BridgeGroup {
  return {
    id: 1,
    label: "Exit signs",
    kind: "assembly",
    assemblyId: 90,
    materialId: null,
    unitCost: null,
    count: 14,
    ...over,
  };
}

function line(over: Partial<BridgeLine> = {}): BridgeLine {
  return {
    id: 1,
    name: "Exit sign LED",
    takeoffGroupId: null,
    assemblyId: null,
    ...over,
  };
}

describe("whether a count can cross to the bid", () => {
  it("lets an assembly count with marks cross", () => {
    expect(sendability(group(), [])).toEqual({ sendable: true });
  });

  it("refuses a count that is already on the bid", () => {
    const onBid = [line({ takeoffGroupId: 1, assemblyId: 90 })];
    expect(sendability(group(), onBid)).toEqual({
      sendable: false,
      reason: "already-on-bid",
    });
  });

  it("refuses a count with no marks, and says that rather than 'no price'", () => {
    // The nearer problem wins. Telling somebody their count cannot be priced
    // when what is actually wrong is that they have not marked anything sends
    // them to the wrong screen.
    expect(sendability(group({ count: 0 }), [])).toEqual({
      sendable: false,
      reason: "nothing-counted",
    });
  });

  it("never lets a level 1 count cross — that is the feature, not a limit", () => {
    const plain = group({ kind: "plain", assemblyId: null });
    expect(sendability(plain, [])).toEqual({
      sendable: false,
      reason: "no-price",
    });
  });

  it("refuses an assembly count whose library assembly has been deleted", () => {
    // The group keeps its label and its fourteen marks, but there is nothing
    // left to price from, and inventing a cost is the one thing never done.
    const orphan = group({ assemblyId: null });
    expect(sendability(orphan, [])).toEqual({
      sendable: false,
      reason: "no-price",
    });
  });

  it("reports a typed or material count as not supported YET, not as unpriceable", () => {
    // Step one carries level 4 only. These are honestly reported rather than
    // silently skipped, and this is the test that should change when step two
    // lands — see references/plan-viewer-overhaul.md § 5f.0 OVERRIDE 1.
    for (const kind of ["typed", "material"] as const) {
      expect(sendability(group({ kind, assemblyId: null }), [])).toEqual({
        sendable: false,
        reason: "unsupported-level",
      });
    }
  });
});

describe("the number the screen shows for work waiting to go over", () => {
  it("counts only what the estimator can act on right now", () => {
    const groups = [
      group({ id: 1 }), // sendable
      group({ id: 2, kind: "plain", assemblyId: null }), // needs a price
      group({ id: 3, count: 0 }), // nothing marked
      group({ id: 4 }), // sendable
    ];
    expect(countsWaitingToSend(groups, [])).toBe(2);
  });

  it("goes down when a count is sent, which is what makes it worth showing", () => {
    const groups = [group({ id: 1 }), group({ id: 2 })];
    expect(countsWaitingToSend(groups, [])).toBe(2);
    const afterSend = [line({ takeoffGroupId: 1, assemblyId: 90 })];
    expect(countsWaitingToSend(groups, afterSend)).toBe(1);
  });
});

describe("counts that will never reach the bid", () => {
  it("names a level 1 count as money missing from the bid", () => {
    const groups = [group({ id: 1, kind: "plain", assemblyId: null })];
    expect(countsWithNoPrice(groups, [])).toBe(1);
  });

  it("does not count an unmarked group — there is no money missing yet", () => {
    const groups = [
      group({ id: 1, kind: "plain", assemblyId: null, count: 0 }),
    ];
    expect(countsWithNoPrice(groups, [])).toBe(0);
  });

  it("is what tells the two zero-states apart on the panel", () => {
    /*
      The bug this pins was found by LOOKING at a real bid, after every test
      passed. A job whose only count is unpriced has `waitingToSend` of 0, and
      the panel said "Every priced count is on the bid." — vacuously true,
      because there were no priced counts, and it reads exactly like a finished
      takeoff while money is missing from the bid entirely.

      So the two numbers have to disagree in this case, and that is the whole
      point of reporting both.
    */
    const onlyUnpriced = [group({ id: 1, kind: "plain", assemblyId: null })];
    expect(countsWaitingToSend(onlyUnpriced, [])).toBe(0);
    expect(countsWithNoPrice(onlyUnpriced, [])).toBe(1);
  });

  it("does not flag a sent count whose assembly was deleted afterwards", () => {
    // It reads as unpriceable on its own — the link is gone — while sitting on
    // the bid perfectly well. Reporting it as missing money would be wrong.
    const orphanButSent = group({ id: 1, assemblyId: null });
    const lines = [line({ takeoffGroupId: 1 })];
    expect(countsWithNoPrice([orphanButSent], lines)).toBe(0);
    expect(countsWithNoPrice([orphanButSent], [])).toBe(1);
  });
});

describe("a from-plans line's quantity follows the marks", () => {
  it("takes the count from the drawing, not from the stored number", () => {
    const counts = new Map([[7, 16]]);
    expect(resolveLineQty({ takeoffGroupId: 7, qty: 14 }, counts)).toBe(16);
  });

  it("leaves a hand-added line's quantity exactly as typed", () => {
    const counts = new Map([[7, 16]]);
    expect(resolveLineQty({ takeoffGroupId: null, qty: 6 }, counts)).toBe(6);
  });

  it("resolves to 0 when every mark is removed, rather than to the old count", () => {
    // The line stays and reads 0. Money leaving a bid because somebody undid a
    // click, with nothing on screen saying so, is the worse failure.
    expect(resolveLineQty({ takeoffGroupId: 7, qty: 14 }, new Map([[7, 0]]))).toBe(
      0
    );
  });

  it("falls back to the stored number when the group is absent entirely", () => {
    // Unreachable through the app — RESTRICT stops a linked group being
    // deleted — but if it is ever reached, the last real number beats zeroing
    // a priced line.
    expect(resolveLineQty({ takeoffGroupId: 7, qty: 14 }, new Map())).toBe(14);
  });
});

describe("R3 — the same assembly on the bid twice", () => {
  it("finds an assembly counted on the plans AND added by hand", () => {
    const lines = [
      line({ id: 1, name: "Duplex receptacle", takeoffGroupId: 3, assemblyId: 5 }),
      line({ id: 2, name: "Duplex receptacle", assemblyId: 5 }),
    ];
    expect(doubleCountedAssemblies(lines)).toEqual(["Duplex receptacle"]);
  });

  it("says nothing when both lines came from the plans", () => {
    const lines = [
      line({ id: 1, takeoffGroupId: 3, assemblyId: 5 }),
      line({ id: 2, takeoffGroupId: 4, assemblyId: 5 }),
    ];
    expect(doubleCountedAssemblies(lines)).toEqual([]);
  });

  it("says nothing when both were added by hand — that is ordinary work", () => {
    const lines = [
      line({ id: 1, assemblyId: 5 }),
      line({ id: 2, assemblyId: 5 }),
    ];
    expect(doubleCountedAssemblies(lines)).toEqual([]);
  });

  it("ignores lines with nothing behind them, which cannot be compared", () => {
    const lines = [
      line({ id: 1, takeoffGroupId: 3, assemblyId: null }),
      line({ id: 2, assemblyId: null }),
    ];
    expect(doubleCountedAssemblies(lines)).toEqual([]);
  });

  it("CATCHES THE HAND-ADDED LINE THAT ARRIVES AFTER THE SEND", () => {
    // The half a one-time warning at send time would miss, and the reason this
    // is a standing check over the whole bid rather than a moment.
    const afterSend = [
      line({ id: 1, name: "Exit sign LED", takeoffGroupId: 3, assemblyId: 5 }),
    ];
    expect(doubleCountedAssemblies(afterSend)).toEqual([]);

    const thenSomebodyTypedOne = [
      ...afterSend,
      line({ id: 2, name: "Exit sign LED", assemblyId: 5 }),
    ];
    expect(doubleCountedAssemblies(thenSomebodyTypedOne)).toEqual([
      "Exit sign LED",
    ]);
  });
});

describe("what is said at the moment of sending", () => {
  it("warns when the bid already carries a hand-added line for the assembly", () => {
    const lines = [line({ name: "Duplex receptacle", assemblyId: 90 })];
    const warning = sendWarning(group(), lines);
    expect(warning).toContain("Duplex receptacle");
    expect(warning).toContain("added by hand");
  });

  it("says nothing when the existing line also came from the plans", () => {
    const lines = [line({ takeoffGroupId: 2, assemblyId: 90 })];
    expect(sendWarning(group(), lines)).toBeNull();
  });

  it("says nothing for a count with no assembly to collide on", () => {
    expect(sendWarning(group({ assemblyId: null }), [])).toBeNull();
  });

  it("does not refuse — it is a fact in time to change your mind", () => {
    // sendWarning returns a string; sendability is what decides. A group that
    // warns is still sendable.
    const lines = [line({ name: "Duplex receptacle", assemblyId: 90 })];
    expect(sendWarning(group(), lines)).not.toBeNull();
    expect(sendability(group(), lines)).toEqual({ sendable: true });
  });
});
