/**
 * Send-again on a run-type line: refill what a line was sent without (a price,
 * a labor unit, or both), swap a fitting to its type's current style, and
 * never overwrite a price or hours that are set.
 */
import { describe, expect, it } from "vitest";
import { resendPlan, swapText } from "../shared/resendLine";
import { laborInRunRate } from "../shared/runFittings";

const setScrew = {
  key: 110,
  name: '1/2" EMT set-screw coupling',
  costPerUnit: "0.4500",
};
const setScrewUnpriced = { ...setScrew, costPerUnit: "0.0000" };
const compression = {
  key: 13443,
  name: '1/2" EMT compression coupling',
  costPerUnit: "0.9000",
};
/**
 * A fitting that KEEPS its own hours. The labor-refill tests below used to use
 * the coupling; since 2026-09-29 a coupling's labor is in the run's per-foot
 * rate and never refills, so the mechanics are tested on an elbow instead.
 */
const elbow = {
  key: 120,
  name: '1/2" EMT 90-degree elbow',
  costPerUnit: "1.1000",
};

/** A line and its part that both have their hours — only money is at issue. */
const hoursSet = { lineHours: "0.0500", currentHours: "0.0500" };

describe("refill a price", () => {
  it("fills a 'Not priced' line from the material's current price", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.0000",
        ...hoursSet,
      })
    ).toEqual({ kind: "refill", price: 0.45, hours: null });
  });

  it("never overwrites a price that is already set", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.3000",
        ...hoursSet,
      })
    ).toEqual({ kind: "keep" });
  });

  it("does nothing while the material is still unpriced", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrewUnpriced,
        currentPart: setScrewUnpriced,
        lineCost: "0",
        ...hoursSet,
      })
    ).toEqual({ kind: "keep" });
  });

  it("refills pipe with an unrecoverable part from the type's own link", () => {
    const emt = { key: 90, name: '1/2" EMT', costPerUnit: "1.2500" };
    expect(
      resendPlan({
        isFitting: false,
        laborOnly: false,
        laborInRunRate: false,
        linePart: null,
        currentPart: emt,
        lineCost: "0",
        ...hoursSet,
      })
    ).toEqual({ kind: "refill", price: 1.25, hours: null });
  });
});

describe("refill labor — a line sent before its part had hours", () => {
  it("fills in hours when the line has none and the part has them now", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: false,
        linePart: elbow,
        currentPart: elbow,
        lineCost: "1.1000",
        lineHours: null,
        currentHours: "0.2500",
      })
    ).toEqual({ kind: "refill", price: null, hours: 0.25 });
  });

  it("fills in both at once when the line has neither", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: false,
        linePart: elbow,
        currentPart: elbow,
        lineCost: "0.0000",
        lineHours: null,
        currentHours: "0.2500",
      })
    ).toEqual({ kind: "refill", price: 1.1, hours: 0.25 });
  });

  it("never refills over hours already set — a 0 included", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: false,
        linePart: elbow,
        currentPart: elbow,
        lineCost: "1.1000",
        lineHours: "0.0000",
        currentHours: "0.2500",
      })
    ).toEqual({ kind: "keep" });
  });

  it("does nothing while the part still has no hours", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: false,
        linePart: elbow,
        currentPart: elbow,
        lineCost: "1.1000",
        lineHours: null,
        currentHours: null,
      })
    ).toEqual({ kind: "keep" });
  });
});

describe("couplings, connectors and straps: the run's per-foot rate covers them", () => {
  // Owner, 2026-09-29. The labor is in every foot of the run already; filling
  // the part's own hours in would pay for it twice.
  it("names exactly those three, and nothing else a run counts", () => {
    expect(
      ["coupling", "connector", "strap"].map(r => laborInRunRate(r))
    ).toEqual([true, true, true]);
    expect(
      [
        "elbow90",
        "elbow45",
        "fieldBend",
        "lb",
        "pullBox",
        "teeBox",
        "teeCover",
        "raceway",
        "conductor",
        "ground",
        null,
      ].map(r => laborInRunRate(r))
    ).toEqual(Array(11).fill(false));
  });

  it("never refills hours, even when the line has none and the part has some", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.4500",
        lineHours: null,
        currentHours: "0.0500",
      })
    ).toEqual({ kind: "keep" });
  });

  it("still refills its PRICE — only the labor is covered", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.0000",
        lineHours: null,
        currentHours: "0.0500",
      })
    ).toEqual({ kind: "refill", price: 0.45, hours: null });
  });
});

describe("a field bend is priced by HOURS on a $0 part", () => {
  // The line points at the raceway, which HAS a price per foot. The money rule
  // would read the field bend's deliberate $0 as "Not priced" and refill it
  // with the pipe's cost — buying pipe once per bend.
  const pipe = { key: 90, name: '3/4" EMT', costPerUnit: "1.2500" };

  it("never takes the pipe's price", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: true,
        laborInRunRate: false,
        linePart: pipe,
        currentPart: pipe,
        lineCost: "0.0000",
        lineHours: "0.2500",
        currentHours: "0.2500",
      })
    ).toEqual({ kind: "keep" });
  });

  it("fills in hours when it was sent with none — and only hours", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: true,
        laborInRunRate: false,
        linePart: pipe,
        currentPart: pipe,
        lineCost: "0.0000",
        lineHours: null,
        currentHours: "0.2500",
      })
    ).toEqual({ kind: "refill", price: null, hours: 0.25 });
  });

  it("swaps when the type's raceway changed, like any fitting", () => {
    const other = { key: 91, name: '1" EMT', costPerUnit: "2" };
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: true,
        laborInRunRate: false,
        linePart: pipe,
        currentPart: other,
        lineCost: "0.0000",
        lineHours: null,
        currentHours: null,
      })
    ).toEqual({ kind: "swap", from: pipe.name, to: other.name });
  });
});

describe("swap", () => {
  it("moves a fitting to the type's current style", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: setScrew,
        currentPart: compression,
        lineCost: "0.4500",
        ...hoursSet,
      })
    ).toEqual({ kind: "swap", from: setScrew.name, to: compression.name });
  });

  it("leaves a fitting alone when nobody can say what it holds", () => {
    expect(
      resendPlan({
        isFitting: true,
        laborOnly: false,
        laborInRunRate: true,
        linePart: null,
        currentPart: compression,
        lineCost: "0",
        ...hoursSet,
      })
    ).toEqual({ kind: "keep" });
  });

  it("never swaps pipe or wire — only the fitting style was decided", () => {
    const other = { key: 91, name: '3/4" EMT', costPerUnit: "2" };
    expect(
      resendPlan({
        isFitting: false,
        laborOnly: false,
        laborInRunRate: false,
        linePart: { key: 90, name: '1/2" EMT', costPerUnit: "1" },
        currentPart: other,
        lineCost: "1",
        lineHours: null,
        currentHours: "0.05",
      })
    ).toEqual({ kind: "keep" });
  });
});

it("words a swap by what changed", () => {
  expect(swapText(setScrew.name, compression.name, 9)).toBe(
    "set-screw coupling → compression coupling, 9"
  );
});
