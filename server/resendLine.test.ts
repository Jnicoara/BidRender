/**
 * Send-again on a run-type line: refill an unpriced line, swap a fitting to
 * its type's current style, and never overwrite a price that is set.
 */
import { describe, expect, it } from "vitest";
import { resendPlan, swapText } from "../shared/resendLine";

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

describe("refill", () => {
  it("fills a 'Not priced' line from the material's current price", () => {
    expect(
      resendPlan({
        isFitting: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.0000",
      })
    ).toEqual({ kind: "refill", price: 0.45 });
  });

  it("never overwrites a price that is already set", () => {
    expect(
      resendPlan({
        isFitting: true,
        linePart: setScrew,
        currentPart: setScrew,
        lineCost: "0.3000",
      })
    ).toEqual({ kind: "keep" });
  });

  it("does nothing while the material is still unpriced", () => {
    expect(
      resendPlan({
        isFitting: true,
        linePart: setScrewUnpriced,
        currentPart: setScrewUnpriced,
        lineCost: "0",
      })
    ).toEqual({ kind: "keep" });
  });

  it("refills pipe with an unrecoverable part from the type's own link", () => {
    const emt = { key: 90, name: '1/2" EMT', costPerUnit: "1.2500" };
    expect(
      resendPlan({
        isFitting: false,
        linePart: null,
        currentPart: emt,
        lineCost: "0",
      })
    ).toEqual({ kind: "refill", price: 1.25 });
  });
});

describe("swap", () => {
  it("moves a fitting to the type's current style", () => {
    expect(
      resendPlan({
        isFitting: true,
        linePart: setScrew,
        currentPart: compression,
        lineCost: "0.4500",
      })
    ).toEqual({ kind: "swap", from: setScrew.name, to: compression.name });
  });

  it("leaves a fitting alone when nobody can say what it holds", () => {
    expect(
      resendPlan({
        isFitting: true,
        linePart: null,
        currentPart: compression,
        lineCost: "0",
      })
    ).toEqual({ kind: "keep" });
  });

  it("never swaps pipe or wire — only the fitting style was decided", () => {
    const other = { key: 91, name: '3/4" EMT', costPerUnit: "2" };
    expect(
      resendPlan({
        isFitting: false,
        linePart: { key: 90, name: '1/2" EMT', costPerUnit: "1" },
        currentPart: other,
        lineCost: "1",
      })
    ).toEqual({ kind: "keep" });
  });
});

it("words a swap by what changed", () => {
  expect(swapText(setScrew.name, compression.name, 9)).toBe(
    "set-screw coupling → compression coupling, 9"
  );
});
