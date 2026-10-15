/**
 * Every shipped material's sheet pack maps to a real pack the app can store
 * (shared/packPricing.ts `realPackFromSheet`, pricing-safety-plan step 6).
 * Nothing writes these yet — see the function's note — so this is what makes
 * the rule ready: a label the rule cannot read fails here, not on the day
 * the packs are unheld.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";
import { packFor } from "../pricing/starterSheetLayout";
import { realPackFromSheet } from "../shared/packPricing";

describe("realPackFromSheet", () => {
  it("reads every kind of label", () => {
    expect(realPackFromSheet("per foot (from 250 ft roll)", 1)).toEqual({
      packQty: 250,
      packLabel: "roll",
    });
    expect(realPackFromSheet("box of 25", 25)).toEqual({
      packQty: 25,
      packLabel: "box",
    });
    expect(realPackFromSheet("10 ft stick", 10)).toEqual({
      packQty: 10,
      packLabel: "stick",
    });
    expect(realPackFromSheet("pair", 2)).toEqual({
      packQty: 2,
      packLabel: "pair",
    });
    expect(realPackFromSheet("each", 1).packQty).toBeNull();
    expect(realPackFromSheet("per foot (cut to length)", 1).packQty).toBeNull();
  });

  it("refuses a label whose number disagrees with its qty, rather than guessing", () => {
    expect(() => realPackFromSheet("box of 25", 50)).toThrow();
  });

  it("maps every shipped material's sheet pack", () => {
    const failures: string[] = [];
    let packs = 0;
    for (const m of BASELINE_MATERIALS) {
      const [label, qty] = packFor(m);
      try {
        if (realPackFromSheet(label, qty).packQty !== null) packs++;
      } catch (e) {
        failures.push(`${m.name}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
    // Not a fixed count (it moves as STARTER_PACKS grows): only that the rule
    // found packs at all, so a pass is not a run over nothing.
    expect(packs).toBeGreaterThan(0);
  });
});
