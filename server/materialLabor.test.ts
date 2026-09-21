/**
 * Labor units on materials, and who owns the hours.
 *
 * ── Why the ownership tests are the important ones ───────────────────────────
 * The arithmetic here is multiplication. What is worth testing is the RULE:
 * that an assembly's typed number prices no matter what its parts say, and that
 * an unset labor unit never quietly becomes zero. Both failures produce a
 * number that looks finished — one too high, one too low — and neither would
 * show on screen as anything other than a total.
 */
import { describe, it, expect } from "vitest";
import {
  laborUnitHours,
  needsLaborUnit,
  countNeedingLaborUnit,
  componentLaborUnit,
  componentLabor,
  laborForAssembly,
  laborForRun,
} from "../shared/materialLabor";

describe("an unset labor unit is not zero hours", () => {
  it("reads NULL and undefined as unset", () => {
    expect(laborUnitHours(null)).toBeNull();
    expect(laborUnitHours(undefined)).toBeNull();
    expect(needsLaborUnit(null)).toBe(true);
  });

  it("takes the decimal string the column actually stores", () => {
    // tRPC hands decimals across as strings; the column is decimal(10,4).
    expect(laborUnitHours("0.0450")).toBe(0.045);
    expect(needsLaborUnit("0.0450")).toBe(false);
  });

  it("treats a DELIBERATE zero as answered, unlike an unpriced material", () => {
    /*
      The difference from `needsPricing`, and the reason the column is nullable.
      Wire nuts add no time of their own when they are made up as part of
      terminating a device. Typing 0 settles that and the row goes quiet; a
      genuinely free MATERIAL can never go quiet, and materialPricing.ts accepts
      that as a cost.
    */
    expect(laborUnitHours(0)).toBe(0);
    expect(needsLaborUnit(0)).toBe(false);
    expect(needsLaborUnit("0.0000")).toBe(false);
  });

  it("flags a broken row rather than passing it as zero hours", () => {
    // A non-numeric value is the one case that must not price work at nothing
    // silently — it lands in the same worklist as an unset row.
    expect(laborUnitHours("not a number")).toBeNull();
    expect(needsLaborUnit("not a number")).toBe(true);
  });

  it("counts what is still waiting on the user", () => {
    expect(
      countNeedingLaborUnit([
        { laborHours: "0.0450" },
        { laborHours: null },
        { laborHours: 0 },
        { laborHours: undefined },
      ])
    ).toBe(2);
  });
});

describe("a recipe's own override beats the material's default", () => {
  it("follows the material when the line says nothing", () => {
    expect(componentLaborUnit({ qty: 1, laborHours: "0.2000" })).toBe(0.2);
  });

  it("uses the override when the line has one", () => {
    expect(
      componentLaborUnit({
        qty: 1,
        laborHours: "0.2000",
        overrideLaborHours: "0.3500",
      })
    ).toBe(0.35);
  });

  it("lets a recipe override DOWN to zero", () => {
    // Zero is a real answer here too: a part this particular recipe installs
    // as part of another operation. Null-means-inherit is what makes it sayable.
    expect(
      componentLaborUnit({
        qty: 1,
        laborHours: "0.2000",
        overrideLaborHours: 0,
      })
    ).toBe(0);
  });

  it("falls back to the material when the override is null, not to zero", () => {
    // NULL on the override means "follow the material" and never "no hours" —
    // the inheritance rule, not a cleared value.
    expect(
      componentLaborUnit({
        qty: 1,
        laborHours: "0.2000",
        overrideLaborHours: null,
      })
    ).toBe(0.2);
  });
});

describe("what a recipe's parts add up to, and what is missing from it", () => {
  it("multiplies each unit by its quantity", () => {
    const sum = componentLabor([
      { qty: 1, laborHours: 0.2 },
      { qty: 3, laborHours: 0.05 },
    ]);
    expect(sum.hours).toBe(0.35);
    expect(sum.unsetCount).toBe(0);
  });

  it("reports unanswered lines rather than treating them as free", () => {
    /*
      The failure this exists to catch: a sum with unanswered lines in it looks
      exactly like a complete one. 0.2 h is not the answer for this recipe — it
      is the answer for the part of it somebody has costed.
    */
    const sum = componentLabor([
      { qty: 1, laborHours: 0.2 },
      { qty: 25, laborHours: null },
      { qty: 3, laborHours: undefined },
    ]);
    expect(sum.hours).toBe(0.2);
    expect(sum.unsetCount).toBe(2);
  });

  it("counts a broken quantity as unanswered too", () => {
    const sum = componentLabor([{ qty: "oops", laborHours: 0.2 }]);
    expect(sum.hours).toBe(0);
    expect(sum.unsetCount).toBe(1);
  });
});

describe("THE TYPED NUMBER PRICES — the parts never add to it", () => {
  /*
    The guard. A duplex rough-in is 0.45 h because that is what doing the whole
    thing at once takes; summing box + device + plate + wire + nuts describes
    somebody doing five unrelated jobs. If this ever goes red, an assembly has
    started pricing its parts instead of its operation.
  */
  const duplex = [
    { qty: 1, laborHours: 0.15 }, // single-gang box
    { qty: 1, laborHours: 0.12 }, // duplex receptacle
    { qty: 1, laborHours: 0.05 }, // wall plate
    { qty: 25, laborHours: 0.008 }, // 25 ft of 12-2
    { qty: 3, laborHours: 0.02 }, // wire nuts
  ];

  it("prices the typed number, whatever the parts come to", () => {
    const labor = laborForAssembly({ typedHours: 0.45, components: duplex });
    expect(labor.pricedHours).toBe(0.45);
    // 0.15 + 0.12 + 0.05 + 0.2 + 0.06
    expect(labor.crossCheckHours).toBe(0.58);
  });

  it("does not move when the parts change", () => {
    // The strongest form of the rule: nothing about the components can reach
    // the number that prices.
    const cheap = laborForAssembly({ typedHours: 0.45, components: [] });
    const dear = laborForAssembly({
      typedHours: 0.45,
      components: [{ qty: 100, laborHours: 5 }],
    });
    expect(cheap.pricedHours).toBe(0.45);
    expect(dear.pricedHours).toBe(0.45);
    expect(dear.crossCheckHours).toBe(500);
  });

  it("adds the assembly's own overhead hours, which ARE typed", () => {
    // Setup, testing, cleanup, the trip back to the van. Entered by hand on the
    // assembly like baseLaborHours, so it belongs to the priced number.
    const labor = laborForAssembly({
      typedHours: 0.45,
      overheadHours: 0.2,
      components: duplex,
    });
    expect(labor.pricedHours).toBe(0.65);
    expect(labor.crossCheckHours).toBe(0.58);
  });

  it("carries the unset count so the cross-check cannot mislead", () => {
    // A cross-check of 0.32 against a typed 0.45 reads as "you are claiming a
    // 29% efficiency". With two components unpriced it means nothing of the
    // sort, and the screen has to be able to say so.
    const labor = laborForAssembly({
      typedHours: 0.45,
      components: [
        { qty: 1, laborHours: 0.32 },
        { qty: 1, laborHours: null },
        { qty: 25, laborHours: null },
      ],
    });
    expect(labor.crossCheckHours).toBe(0.32);
    expect(labor.crossCheckUnsetCount).toBe(2);
  });

  it("lets the gap be NEGATIVE without complaint", () => {
    // Typing MORE than the parts is legitimate — a difficult install the
    // estimator knows costs more than the book. Nothing here judges the gap.
    const labor = laborForAssembly({
      typedHours: 1.2,
      components: [{ qty: 1, laborHours: 0.3 }],
    });
    expect(labor.pricedHours).toBe(1.2);
    expect(labor.crossCheckHours).toBe(0.3);
  });
});

describe("a traced run has no typed number, so the parts ARE the answer", () => {
  it("sums its raceway and its conductors", () => {
    /*
      340 ft of 3/4" EMT at 0.04 h/ft, with 3 #12 through it at 0.0055 h per
      conductor-foot: 1,020 conductor-feet.
    */
    const run = laborForRun([
      { qty: 340, laborHours: 0.04 },
      { qty: 1020, laborHours: 0.0055 },
    ]);
    expect(run.hours).toBe(19.21);
    expect(run.unsetCount).toBe(0);
  });

  it("says so when the pipe is costed and the wire is not", () => {
    // The half-counted failure, in labour rather than verticals: 13.6 h is a
    // confident number and the wire pull is missing from it entirely.
    const run = laborForRun([
      { qty: 340, laborHours: 0.04 },
      { qty: 1020, laborHours: null },
    ]);
    expect(run.hours).toBe(13.6);
    expect(run.unsetCount).toBe(1);
  });

  it("does not borrow the assembly rule — there is nothing typed to borrow", () => {
    // Guards the asymmetry itself. If somebody ever gives runs a typed number,
    // this is where the decision has to be re-made rather than inherited.
    const run = laborForRun([{ qty: 10, laborHours: 0.5 }]);
    expect(run.hours).toBe(5);
    expect(run).not.toHaveProperty("pricedHours");
  });
});
