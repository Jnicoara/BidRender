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
 * from `materials.isExamplePrice` / `snapshotPriceWasExample` (0132–0134).
 * This file kept the loader's output inert until those columns existed, and
 * now holds the other half: a shipped number ALWAYS arrives with its tag.
 */
import { describe, expect, it } from "vitest";
import { assemblies, materials } from "../drizzle/schema";
import { STARTER_PRICES } from "./seed/materials/starterPrices";
import { STARTER_LABOR_UNITS } from "./seed/materials/starterLaborUnits";
import { STARTER_BRAND_PRICES } from "./seed/materials/starterBrandPrices";
import { STARTER_ASSEMBLY_HOURS } from "./seed/starterAssemblyHours";
import { BASELINE_MATERIALS, withStarterValues } from "./seed/materials";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";

const hasColumn = (name: string) => name in materials;

describe("a shipped number always says it is an example (0132–0134)", () => {
  it("the tag columns exist", () => {
    expect(hasColumn("isExamplePrice")).toBe(true);
    expect(hasColumn("isExampleLaborHours")).toBe(true);
    expect("isExampleHours" in assemblies).toBe(true);
  });

  it("a sheet price or sheet hours arrive WITH their tag", () => {
    const row = BASELINE_MATERIALS[0];
    const priced = withStarterValues(row, { [row.name]: "1.2500" }, {});
    expect(priced.costPerUnit).toBe("1.2500");
    expect(priced.isExamplePrice).toBe(true);
    expect(priced.isExampleLaborHours).toBeUndefined();

    const timed = withStarterValues(
      row,
      {},
      {
        [row.name]: { laborHours: "0.2000" },
      }
    );
    expect(timed.laborHours).toBe("0.2000");
    expect(timed.isExampleLaborHours).toBe(true);
    expect(timed.isExamplePrice).toBeUndefined();

    // Not on the sheet: untouched, untagged.
    const plain = withStarterValues(row, {}, {});
    expect(plain.isExamplePrice).toBeUndefined();
    expect(plain.isExampleLaborHours).toBeUndefined();
  });

  it("no shipped material carries a price without the tag", () => {
    for (const m of BASELINE_MATERIALS)
      if (Number(m.costPerUnit) > 0)
        expect(m.isExamplePrice, `${m.name} priced, untagged`).toBe(true);
  });

  it("no shipped labor rate carries a number without the tag", () => {
    for (const r of BASELINE_LABOR_RATES)
      if (Number(r.hourlyCost) > 0 || Number(r.annualSalary ?? 0) > 0)
        expect(r.example, `${r.name} rated, untagged`).toBeDefined();
  });
});

describe("starter sheet values", () => {
  // The price and hours guards that stood here ("ship nothing until the
  // column exists") retired with 0132–0133; "the tag columns exist" above is
  // what they became.

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
