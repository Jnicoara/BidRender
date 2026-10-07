/**
 * THE STARTER SHEETS' NUMBERS MAY NOT SHIP UNTAGGED.
 *
 * pricing/loadStarterSheets.mts writes the owner's filled pricing and labor
 * sheets into server/seed/materials/starterPrices.ts and
 * starterLaborUnits.ts, and the seed applies them to every database on start
 * (references/starter-vs-company-plan.md § 3, the file loader).
 *
 * A shipped number that does not say it is an example is indistinguishable on
 * screen from one the shop chose — so a bid can go out on a price or an hour
 * nobody at the shop looked at. The owner's rule (2026-10-07): a shipped
 * price shows "Example price" on the bid screen and printing warns first,
 * from `materials.isExamplePrice` / `snapshotPriceWasExample` (Batch 5, not
 * yet written). This file is what keeps the loader's output inert until then:
 * it goes red the moment either map holds a value while the column that tags
 * it does not exist.
 */
import { describe, expect, it } from "vitest";
import { materials } from "../drizzle/schema";
import { STARTER_PRICES } from "./seed/materials/starterPrices";
import { STARTER_LABOR_UNITS } from "./seed/materials/starterLaborUnits";
import { BASELINE_MATERIALS } from "./seed/materials";

const hasColumn = (name: string) => name in materials;

describe("starter sheet values", () => {
  it("ship no PRICE until materials.isExamplePrice exists", () => {
    if (!hasColumn("isExamplePrice")) {
      expect(Object.keys(STARTER_PRICES)).toEqual([]);
    }
  });

  it("ship no LABOR HOURS until shipped hours can be tagged as an example", () => {
    // No column decided yet for hours (owner question, plan § 3). The name
    // below is the one the plan proposes; this goes red if hours are loaded
    // before it exists, and is edited when the decision is made.
    if (!hasColumn("isExampleLaborHours")) {
      expect(Object.keys(STARTER_LABOR_UNITS)).toEqual([]);
    }
  });

  it("name only shipped rows, with positive numbers", () => {
    // The loader refuses anything else; this holds the generated files to it.
    const shipped = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
    for (const [name, price] of Object.entries(STARTER_PRICES)) {
      expect(shipped.has(name), name).toBe(true);
      expect(Number(price), name).toBeGreaterThan(0);
    }
    for (const [name, hours] of Object.entries(STARTER_LABOR_UNITS)) {
      expect(shipped.has(name), name).toBe(true);
      for (const v of [hours.laborHours, hours.fieldBendLaborHours])
        if (v !== undefined) expect(Number(v), name).toBeGreaterThan(0);
      if (hours.fieldBendLaborHours !== undefined)
        expect(
          shipped.get(name)!.raceway,
          `${name}: bend hours on a non-raceway`
        ).toBeDefined();
    }
  });
});
