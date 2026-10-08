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
import { assemblies, materials } from "../drizzle/schema";
import { STARTER_PRICES } from "./seed/materials/starterPrices";
import { STARTER_LABOR_UNITS } from "./seed/materials/starterLaborUnits";
import { STARTER_BRAND_PRICES } from "./seed/materials/starterBrandPrices";
import { STARTER_ASSEMBLY_HOURS } from "./seed/starterAssemblyHours";
import { BASELINE_MATERIALS } from "./seed/materials";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";

const hasColumn = (name: string) => name in materials;

describe("starter sheet values", () => {
  it("ship no PRICE until materials.isExamplePrice exists", () => {
    if (!hasColumn("isExamplePrice")) {
      expect(Object.keys(STARTER_PRICES)).toEqual([]);
    }
  });

  it('ship no LABOR HOURS until shipped hours can say "Example hours"', () => {
    // Owner, 2026-10-07: hours get the price treatment — an "Example hours"
    // tag on the bid screen (never the customer quote), cleared when the shop
    // edits it, a warning before printing; shipped together with the hours,
    // never hours alone. Columns in Batch 5: materials.isExampleLaborHours,
    // assemblies.isExampleHours.
    if (!hasColumn("isExampleLaborHours")) {
      expect(Object.keys(STARTER_LABOR_UNITS)).toEqual([]);
    }
    if (!("isExampleHours" in assemblies)) {
      expect(Object.keys(STARTER_ASSEMBLY_HOURS)).toEqual([]);
    }
  });

  it("ship no BRAND VARIANT price until the variant model and the price tag exist", () => {
    // Nothing reads these until materials.parentId exists (ASSEMBLIES_PLAN.md
    // § "Parent items and brand variants").
    if (!hasColumn("parentId") || !hasColumn("isExamplePrice")) {
      expect(Object.keys(STARTER_BRAND_PRICES)).toEqual([]);
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
    for (const [name, v] of Object.entries(STARTER_BRAND_PRICES)) {
      expect(shipped.has(v.parent), `${name}: parent ${v.parent}`).toBe(true);
      expect(Number(v.price), name).toBeGreaterThan(0);
    }
    const starters = new Set(BASELINE_ASSEMBLIES.map(a => a.name));
    for (const [name, hours] of Object.entries(STARTER_ASSEMBLY_HOURS)) {
      expect(starters.has(name), name).toBe(true);
      expect(Number(hours), name).toBeGreaterThan(0);
    }
  });
});
