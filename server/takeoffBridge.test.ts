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
  runTypeRows,
  runRowSendability,
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

  it("lets a free count cross with no price — it is priced on the bid line", () => {
    // CHANGED 2026-09-25. This test used to read "never lets a level 1 count
    // cross". A free count now crosses UNPRICED — NULL price, NULL hours — and
    // the bid's strip names it until somebody types them. See
    // shared/handPricedLines.ts and plan-viewer-overhaul.md § 5f.4.
    const plain = group({ kind: "plain", assemblyId: null });
    expect(sendability(plain, [])).toEqual({ sendable: true });
  });

  it("still refuses a free count that has no marks", () => {
    const plain = group({ kind: "plain", assemblyId: null, count: 0 });
    expect(sendability(plain, [])).toEqual({
      sendable: false,
      reason: "nothing-counted",
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
      group({ id: 2, kind: "plain", assemblyId: null }), // sendable, unpriced
      group({ id: 3, count: 0 }), // nothing marked
      group({ id: 4 }), // sendable
      group({ id: 5, assemblyId: null }), // assembly deleted: nothing to price
      group({ id: 6, kind: "typed", assemblyId: null }), // not built
    ];
    expect(countsWaitingToSend(groups, [])).toBe(3);
  });

  it("goes down when a count is sent, which is what makes it worth showing", () => {
    const groups = [group({ id: 1 }), group({ id: 2 })];
    expect(countsWaitingToSend(groups, [])).toBe(2);
    const afterSend = [line({ takeoffGroupId: 1, assemblyId: 90 })];
    expect(countsWaitingToSend(groups, afterSend)).toBe(1);
  });
});

describe("counts that will never reach the bid", () => {
  it("names a count whose library assembly was deleted as money missing", () => {
    const groups = [group({ id: 1, assemblyId: null })];
    expect(countsWithNoPrice(groups, [])).toBe(1);
  });

  it("does not name a free count — it can go over, and is priced there", () => {
    // It used to. Since 2026-09-25 a free count waits to be SENT, and once on
    // the bid its blank price is named by the bid's own strip.
    const groups = [group({ id: 1, kind: "plain", assemblyId: null })];
    expect(countsWithNoPrice(groups, [])).toBe(0);
    expect(countsWaitingToSend(groups, [])).toBe(1);
  });

  it("does not count an unmarked group — there is no money missing yet", () => {
    const groups = [group({ id: 1, assemblyId: null, count: 0 })];
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
    const onlyUnpriced = [group({ id: 1, assemblyId: null })];
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
    expect(
      resolveLineQty({ takeoffGroupId: 7, qty: 14 }, new Map([[7, 0]]))
    ).toBe(0);
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
      line({
        id: 1,
        name: "Duplex receptacle",
        takeoffGroupId: 3,
        assemblyId: 5,
      }),
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

describe("a run type becomes one line per material", () => {
  const conduit = {
    pathType: "conduit" as const,
    racewayMaterialId: 90,
    racewayMaterialName: '1/2" EMT',
    conductorMaterialId: 2,
    conductorMaterialName: "#12 THHN",
    groundMaterialId: 68,
    groundMaterialName: "#12 bare CU, solid",
  };

  it("splits pipe, wire and ground into three orderable rows", () => {
    /*
      125 ft of pipe with 2 #12 and a ground through it. Three purchases at
      three prices — one row holding 375 ft of "wire and pipe" is not orderable
      and is what § 5f.2 rejects.
    */
    const rows = runTypeRows({
      ...conduit,
      footage: {
        conduitFeet: 125,
        cableFeet: 0,
        insulatedFeet: 250,
        groundFeet: 125,
      },
    });
    expect(rows.map(r => [r.role, r.feet])).toEqual([
      ["raceway", 125],
      ["conductor", 250],
      ["ground", 125],
    ]);
    expect(rows.every(r => runRowSendability(r).ok)).toBe(true);
  });

  it("EMPTY CONDUIT FOR FUTURE USE IS JUST THE PIPE ROW", () => {
    // A real thing to bid, and the case that would be easiest to lose by
    // assuming every conduit type carries wire.
    const rows = runTypeRows({
      pathType: "conduit",
      racewayMaterialId: 90,
      racewayMaterialName: '1/2" EMT',
      conductorMaterialId: null,
      conductorMaterialName: null,
      groundMaterialId: null,
      groundMaterialName: null,
      footage: {
        conduitFeet: 80,
        cableFeet: 0,
        insulatedFeet: 0,
        groundFeet: 0,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("raceway");
    expect(rows[0].feet).toBe(80);
    expect(runRowSendability(rows[0]).ok).toBe(true);
  });

  it("a CABLE type is one row, and its ground is not a second one", () => {
    /*
      The cable IS the raceway, and its ground is inside the jacket where
      cableFeet has already paid for it. A ground row here would buy bare
      copper nobody pulls.
    */
    const rows = runTypeRows({
      pathType: "cable",
      racewayMaterialId: null,
      racewayMaterialName: null,
      conductorMaterialId: 45,
      conductorMaterialName: "12-2 MC cable",
      groundMaterialId: 68,
      groundMaterialName: "#12 bare CU, solid",
      footage: {
        conduitFeet: 0,
        cableFeet: 210,
        insulatedFeet: 0,
        groundFeet: 0,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "conductor", feet: 210 });
  });

  it("keeps a row for a named material nobody has traced yet", () => {
    // Priced at nothing and visibly so, rather than the type vanishing off a
    // bid the estimator has already set up.
    const rows = runTypeRows({
      ...conduit,
      footage: {
        conduitFeet: 0,
        cableFeet: 0,
        insulatedFeet: 0,
        groundFeet: 0,
      },
    });
    expect(rows).toHaveLength(3);
    expect(runRowSendability(rows[0])).toMatchObject({
      ok: false,
      reason: "no-footage",
    });
  });

  it("SHOWS footage the type cannot name, but refuses to send it", () => {
    /*
      A half-specified type. The footage is real and must not disappear, but
      "125 ft of something" cannot be quoted by a supplier — so the row exists
      and the refusal says what to do about it.
    */
    const rows = runTypeRows({
      pathType: "conduit",
      racewayMaterialId: null,
      racewayMaterialName: null,
      conductorMaterialId: null,
      conductorMaterialName: null,
      groundMaterialId: null,
      groundMaterialName: null,
      footage: {
        conduitFeet: 125,
        cableFeet: 0,
        insulatedFeet: 250,
        groundFeet: 0,
      },
    });
    expect(rows.map(r => r.feet)).toEqual([125, 250]);
    expect(runRowSendability(rows[0])).toMatchObject({
      ok: false,
      reason: "no-material",
    });
  });
});
