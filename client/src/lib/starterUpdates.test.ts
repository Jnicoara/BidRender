/**
 * How a starter update reads (client/src/lib/starterUpdates.ts). The numbers
 * a shop decides on must read exactly as stored: a price with its cents, a
 * fraction as the percent people say, and unset as "not set", never 0.
 */
import { describe, expect, it } from "vitest";
import {
  acceptAllSentence,
  fieldLabel,
  formatUpdateValue,
  partSentence,
  recountWarning,
  updatesCardText,
} from "./starterUpdates";

describe("values read as stored", () => {
  it("a price keeps its cents; a rate says per hour", () => {
    expect(formatUpdateValue("materials", "costPerUnit", "0.5500")).toMatch(
      /0\.55/
    );
    expect(formatUpdateValue("laborRates", "hourlyCost", "42.5")).toMatch(
      /42\.50 \/ h$/
    );
  });

  it("a fraction is the percent people say (0.10 = 10%)", () => {
    expect(formatUpdateValue("runTypes", "wireExtraPct", "0.1000")).toBe("10%");
    expect(formatUpdateValue("modifiers", "laborAdjustmentPct", "-0.1")).toBe(
      "-10%"
    );
  });

  it("unset is 'not set', never 0 — and a real 0 stays 0", () => {
    expect(formatUpdateValue("materials", "laborHours", null)).toBe("not set");
    expect(formatUpdateValue("runTypes", "conductorCount", null)).toBe(
      "not set"
    );
    expect(formatUpdateValue("materials", "laborHours", "0.0000")).toBe("0 h");
    // A waste with none of its own follows the company default: say so.
    expect(formatUpdateValue("runTypes", "wireExtraPct", null)).toBe(
      "your default"
    );
  });

  it("a reference names its row, never shows a bare id", () => {
    expect(
      formatUpdateValue("runTypes", "racewayMaterialId", 812, {
        "812": '1/2" EMT',
      })
    ).toBe('1/2" EMT');
    expect(formatUpdateValue("runTypes", "racewayMaterialId", 9)).toBe(
      "another item"
    );
  });

  it("lengths and switches", () => {
    expect(formatUpdateValue("materials", "stickLengthFeet", "10.00")).toBe(
      "10 ft"
    );
    expect(formatUpdateValue("assemblies", "laborOnly", true)).toBe("yes");
  });

  it("fields read in the shop's words", () => {
    expect(fieldLabel("materials", "costPerUnit")).toBe("Price");
    expect(fieldLabel("runTypes", "wireExtraPct")).toBe("Wire waste");
  });
});

describe("recipe updates read as one sentence (plan § 3b)", () => {
  it("add, remove, and a quantity", () => {
    const base = { childName: "Wire connector", field: null };
    expect(
      partSentence({
        ...base,
        kind: "part",
        yours: null,
        latest: { qty: "2.0000" },
      })
    ).toBe("Add 2 × Wire connector");
    expect(
      partSentence({ ...base, kind: "part", yours: { qty: "2" }, latest: null })
    ).toBe("Remove Wire connector");
    expect(
      partSentence({
        ...base,
        kind: "part",
        yours: { qty: "2" },
        latest: { qty: "3" },
      })
    ).toBe("Wire connector: quantity 2 → 3");
  });
});

describe("the warnings say how many bids move, before Accept (Q6)", () => {
  it("none for a price or hours update", () => {
    expect(recountWarning(0)).toBeNull();
    expect(recountWarning(1)).toBe("1 draft bid uses this and will re-count.");
    expect(recountWarning(3)).toBe("3 draft bids use this and will re-count.");
  });

  it("Accept all states the total first", () => {
    expect(acceptAllSentence(4, 3)).toMatch(
      /^Accept 4 updates .* re-counts 3 draft bids/
    );
    expect(acceptAllSentence(1, 0)).toMatch(/No bid re-counts/);
  });

  it("the Dashboard card is silent at zero", () => {
    expect(updatesCardText(0)).toBeNull();
    expect(updatesCardText(1)).toBe("1 starter update available");
    expect(updatesCardText(5)).toBe("5 starter updates available");
  });
});
