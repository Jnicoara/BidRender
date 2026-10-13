/**
 * The starter's number rules (shared/starterChange.ts) and the sheet's row
 * checks (shared/starterSheetChecks.ts) — references/baseline-screen-plan.md
 * § 2, § 3, § 5. Track C's half of the baseline screen (owner Q12). No
 * database: these are the rules the screen and the upload will both read.
 */
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  assemblies,
  laborRates,
  materials,
  modifiers,
  takeoffRunTypes,
} from "../drizzle/schema";
import {
  STARTER_FIELDS,
  acceptAllTakes,
  offerBucket,
  sameStarterValue,
  starterChangeRefusal,
  type StarterTable,
} from "../shared/starterChange";
import {
  cellNumber,
  checkHoursRow,
  checkPriceRow,
} from "../shared/starterSheetChecks";

const TABLES: Record<StarterTable, object> = {
  materials,
  assemblies,
  laborRates,
  modifiers,
  runTypes: takeoffRunTypes,
};

describe("every starter column is decided (§ 3)", () => {
  for (const [name, table] of Object.entries(TABLES) as [
    StarterTable,
    Parameters<typeof getTableColumns>[0],
  ][]) {
    it(`${name}: every column has a kind, and every kind names a real column`, () => {
      const columns = Object.keys(getTableColumns(table)).sort();
      const listed = Object.keys(STARTER_FIELDS[name]).sort();
      expect(listed).toEqual(columns);
    });
  }
});

describe("what the screen may change (§ 3)", () => {
  it("never changes a unit — owner rework item 3", () => {
    expect(starterChangeRefusal("materials", "unitOfSale")).toMatch(
      /unit is never changed/
    );
    // Hourly vs salaried changes what every amount means: also a unit.
    expect(starterChangeRefusal("laborRates", "rateType")).toMatch(
      /unit is never changed/
    );
  });

  it("refuses what the app keeps, and anything it does not know", () => {
    expect(starterChangeRefusal("materials", "isExamplePrice")).toMatch(
      /kept by the app/
    );
    expect(starterChangeRefusal("materials", "baselineVersion")).toMatch(
      /kept by the app/
    );
    expect(starterChangeRefusal("materials", "noSuchColumn")).toMatch(
      /not a field/
    );
  });

  it("allows numbers and names (offers) and finding fields (everyone)", () => {
    for (const f of ["costPerUnit", "laborHours", "name", "searchAliases"])
      expect(starterChangeRefusal("materials", f)).toBeNull();
    expect(STARTER_FIELDS.materials.costPerUnit).toBe("offer");
    expect(STARTER_FIELDS.materials.name).toBe("offer"); // Q17
    expect(STARTER_FIELDS.materials.searchAliases).toBe("everyone"); // Q21
    expect(STARTER_FIELDS.assemblies.mountHeightTypeKey).toBe("offer");
  });
});

describe("who a change reaches (§ 2, Q18)", () => {
  it("a copy still on the old value is offered; one on the new value is not", () => {
    expect(
      offerBucket({
        oldValue: "0.4800",
        newValue: "0.5500",
        companyValue: 0.48,
      })
    ).toBe("offer");
    expect(
      offerBucket({
        oldValue: "0.4800",
        newValue: "0.5500",
        companyValue: "0.55",
      })
    ).toBe("nothing");
  });

  it("a company's own value is listed apart, and Accept all never takes it", () => {
    const rows = [
      {
        id: 1,
        bucket: offerBucket({ oldValue: 1, newValue: 2, companyValue: 1 }),
      },
      {
        id: 2,
        bucket: offerBucket({ oldValue: 1, newValue: 2, companyValue: 1.25 }),
      },
    ];
    expect(rows.map(r => r.bucket)).toEqual(["offer", "own-value"]);
    expect(acceptAllTakes(rows).map(r => r.id)).toEqual([1]);
  });

  it("compares stored values, not spellings — and null is not zero", () => {
    expect(sameStarterValue("0.5000", 0.5)).toBe(true);
    expect(sameStarterValue(null, 0)).toBe(false);
    expect(sameStarterValue(null, undefined)).toBe(true);
    expect(sameStarterValue("", 0)).toBe(false);
    expect(sameStarterValue(true, 1)).toBe(false);
  });
});

describe("the sheet's row checks, one copy for script and screen (§ 5)", () => {
  const item = { unitOfSale: "each" };

  it("blank is no value, never 0; a bad number or unit is refused", () => {
    const seen = new Set<string>();
    const blank = checkPriceRow({
      at: "row 3",
      name: "Wire nut",
      item,
      unit: "each",
      packQty: null,
      packPrice: cellNumber("  "),
      seen,
    });
    expect(blank).toEqual({ problems: [], value: null });

    const bad = checkPriceRow({
      at: "row 4",
      name: "Gem box",
      item,
      unit: "foot",
      packQty: 10,
      packPrice: cellNumber("abc"),
      seen,
    });
    expect(bad.value).toBeNull();
    expect(bad.problems).toEqual([
      'row 4: unit "foot", the catalog sells it by "each"',
      "row 4: pack price is not a number above 0",
    ]);
  });

  it("prices per unit from the pack, and refuses a name twice or a stranger", () => {
    const seen = new Set<string>();
    expect(
      checkPriceRow({
        at: "row 5",
        name: "Wire nut",
        item,
        unit: "each",
        packQty: 100,
        packPrice: cellNumber("$12.50"),
        seen,
      })
    ).toEqual({ problems: [], value: "0.1250" });
    expect(
      checkPriceRow({
        at: "row 6",
        name: "Wire nut",
        item,
        unit: "each",
        packQty: 100,
        packPrice: 12.5,
        seen,
      }).problems
    ).toEqual(["row 6: listed twice"]);
    expect(
      checkPriceRow({
        at: "row 7",
        name: "Wire nutt",
        item: undefined,
        unit: "each",
        packQty: 1,
        packPrice: 1,
        seen,
      }).problems
    ).toEqual(["row 7: not a shipped name"]);
  });

  it("hours: per 100 ft stored per foot; bend hours only on a raceway", () => {
    const seen = new Set<string>();
    expect(
      checkHoursRow({
        at: "row 8",
        name: '1/2" EMT',
        item: { raceway: true },
        expectedPer: "100 ft",
        per: "100 ft",
        hours: 4,
        bend: 0.25,
        seen,
      })
    ).toEqual({
      problems: [],
      value: { laborHours: "0.0400", fieldBendLaborHours: "0.2500" },
    });
    expect(
      checkHoursRow({
        at: "row 9",
        name: "Duplex receptacle",
        item: {},
        expectedPer: "each",
        per: "each",
        hours: 0,
        bend: 0.1,
        seen,
      }).problems
    ).toEqual([
      "row 9: MY HOURS is not a number above 0 (blank = not set)",
      "row 9: bend hours on a row that is not a raceway",
    ]);
  });
});
