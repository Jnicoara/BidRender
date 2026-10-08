/**
 * The starters added 2026-10-07: canless wafers at the four sizes the owner
 * ships, the can lights at 4" and 6" in both housing types, and the twelve
 * top-30 gap starters (top-assemblies-draft.md § 2b).
 *
 * Pure: the seed files, no database. The seeding itself — present, exactly
 * its recipe, hours NULL — is starterAssembliesSeed.test.ts, which now counts
 * these too.
 */
import { describe, expect, it } from "vitest";
import { BASELINE_ASSEMBLIES } from "./seed/baselineAssemblies";
import { BASELINE_MATERIALS } from "./seed/materials";
import { starterPartName } from "./seed/starterParts";

const PLAIN_WAFER = /^(\d+)" canless wafer LED downlight$/;
const usersOf = (name: string) =>
  BASELINE_ASSEMBLIES.filter(a =>
    a.materials.some(l => starterPartName(l.part) === name)
  );

describe('canless wafers: a starter at 2", 4", 6", 8" only', () => {
  const catalogSizes = BASELINE_MATERIALS.map(
    m => PLAIN_WAFER.exec(m.name)?.[1]
  ).filter((s): s is string => s !== undefined);

  it('leaves 3" and 5" in the catalog with NO starter (owner, 2026-10-07)', () => {
    // The materials stay; only the assemblies were not wanted.
    expect(catalogSizes).toEqual(expect.arrayContaining(["3", "5"]));
    for (const size of ["3", "5", "7"])
      expect(
        usersOf(`${size}" canless wafer LED downlight`).map(a => a.ref),
        `${size}"`
      ).toEqual([]);
    expect(
      BASELINE_ASSEMBLIES.filter(a => /^Wafer LED downlight/.test(a.name))
        .map(a => a.name)
        .sort()
    ).toEqual(
      ["2", "4", "6", "8"].map(s => `Wafer LED downlight, ${s}" (canless)`)
    );
  });

  it.each([["2"], ["4"], ["6"], ["8"]])(
    '%s": its own starter, on its own plain wafer as the fixture, hours not set, Both',
    size => {
      const wafer = `${size}" canless wafer LED downlight`;
      const users = BASELINE_ASSEMBLIES.filter(a =>
        a.materials.some(l => starterPartName(l.part) === wafer)
      );
      // One starter per size: never a variant (CCT, gimbal, slim, wet) and
      // never a different size standing in.
      expect(users.map(a => a.name)).toEqual([
        `Wafer LED downlight, ${size}" (canless)`,
      ]);
      const [spec] = users;
      const line = spec.materials.find(l => starterPartName(l.part) === wafer)!;
      expect(line.fixture).toBe(true);
      expect(line.qty).toBe(1);
      expect(spec.baseLaborHours).toBeNull();
      expect(spec.projectType).toBe("both");
    }
  );

  it('keeps LT7 (6") and LT8 (4") as they were', () => {
    const byRef = new Map(BASELINE_ASSEMBLIES.map(a => [a.ref, a]));
    expect(byRef.get("LT7")?.name).toBe('Wafer LED downlight, 6" (canless)');
    expect(byRef.get("LT8")?.name).toBe('Wafer LED downlight, 4" (canless)');
  });
});

/*
  Can lights, owner 2026-10-07: 4" and 6", new construction AND remodel —
  four in all, each an IC-rated housing (the fixture line) plus the LED
  retrofit trim of the SAME size, hours not set, tagged Both. Three shipped
  already (LT4, LT5, LT6); LT33 is the 4" remodel.
*/
describe('can lights: 4" and 6", new construction and remodel', () => {
  const CANS: Array<[string, string, string, string]> = [
    ["4", "new construction", "LT5", 'Recessed can new construction, 4"'],
    ["4", "remodel", "LT33", 'Recessed can retrofit, 4"'],
    ["6", "new construction", "LT4", 'Recessed can new construction, 6"'],
    ["6", "remodel", "LT6", 'Recessed can retrofit, 6"'],
  ];

  it.each(CANS)(
    '%s" %s (%s): IC housing + same-size trim, hours not set, Both',
    (size, kind, ref, name) => {
      const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref)!;
      expect(spec.name).toBe(name);
      const parts = spec.materials.map(l => ({
        name: starterPartName(l.part),
        fixture: l.fixture === true,
        qty: l.qty,
      }));
      expect(parts).toContainEqual({
        name: `${size}" recessed can, ${kind} IC`,
        fixture: true,
        qty: 1,
      });
      expect(parts).toContainEqual({
        name: `${size}" LED retrofit trim`,
        fixture: false,
        qty: 1,
      });
      // Exactly one housing and one trim, both this size.
      expect(parts.filter(p => /recessed can,/.test(p.name))).toHaveLength(1);
      expect(parts.filter(p => /trim$/.test(p.name))).toHaveLength(1);
      expect(spec.baseLaborHours).toBeNull();
      expect(spec.projectType).toBe("both");
    }
  );
});

describe("the twelve top-30 gap starters", () => {
  const GAPS: Array<[string, string, "commercial" | "residential"]> = [
    ["GC1", "Emergency battery pack added to a troffer", "commercial"],
    ["GC2", "Panelboard replacement, 3-phase, existing feeders", "commercial"],
    ["GC3", "Site / parking lot pole light", "commercial"],
    ["GC4", "Emergency light, remote head", "commercial"],
    ["GC5", "120V feed for door hardware / access control", "commercial"],
    ["GR1", "Single-pole switch, old work", "residential"],
    ["GR2", "Service upgrade 200A, underground", "residential"],
    ["GR3", "Service 320A / 400A residential (two 200A panels)", "residential"],
    ["GR4", "Generator inlet and interlock, 50A", "residential"],
    ["GR5", "Detached garage / shop feeder and panel", "residential"],
    ["GR6", "Kitchen countertop 20A circuit", "residential"],
    ["GR7", "Bathroom 20A circuit", "residential"],
  ];

  it.each(GAPS)("%s %s ships, %s, hours not set", (ref, name, type) => {
    const spec = BASELINE_ASSEMBLIES.find(a => a.ref === ref);
    expect(spec?.name).toBe(name);
    expect(spec?.projectType).toBe(type);
    expect(spec?.baseLaborHours).toBeNull();
    expect(spec?.missingParts ?? []).toEqual([]);
  });

  it("GR3 is on the 320A meter base, not the 400A stand-in", () => {
    const parts = BASELINE_ASSEMBLIES.find(a => a.ref === "GR3")!.materials.map(
      l => starterPartName(l.part)
    );
    expect(parts).toContain("320A meter base");
    expect(parts).not.toContain("400A meter base");
  });
});

/*
  The draft gave "Underground warning tape" a quantity of 1 on GR2 and GR5.
  The catalog sells it by the FOOT, so that line would have bought one foot
  of tape for a whole trench — a wrong number that looks fine. The general
  rule behind it: no starter buys one foot of anything sold by the foot.
*/
describe("no starter buys a single foot of a by-the-foot material", () => {
  it("every per-foot line is more than one foot", () => {
    const unit = new Map(BASELINE_MATERIALS.map(m => [m.name, m.unitOfSale]));
    const oneFoot = BASELINE_ASSEMBLIES.flatMap(a =>
      a.materials
        .filter(l => unit.get(starterPartName(l.part)) === "foot" && l.qty <= 1)
        .map(l => `${a.ref}: ${starterPartName(l.part)} x${l.qty}`)
    );
    expect(oneFoot).toEqual([]);
  });
});

/*
  DV34, owner's answers 2026-10-07: 700-series metal raceway whose LENGTH
  comes from the traced run (so no per-foot raceway line in the recipe), a
  matching 700-series device plate, wire left to the run, hours not set,
  Commercial. Held until the plate ships — never seeded half-built.
*/
describe("DV34 surface raceway receptacle, per the owner's answers", () => {
  const dv34 = BASELINE_ASSEMBLIES.find(a => a.ref === "DV34")!;
  const unit = new Map(BASELINE_MATERIALS.map(m => [m.name, m.unitOfSale]));
  const parts = dv34.materials.map(l => starterPartName(l.part));

  it("is Commercial, with hours not set", () => {
    expect(dv34.projectType).toBe("commercial");
    expect(dv34.baseLaborHours).toBeNull();
  });

  it("carries no per-foot line — the raceway and the wire come from the traced run", () => {
    expect(parts.filter(n => unit.get(n) === "foot")).toEqual([]);
  });

  it("is 700 series throughout — box AND matching plate — plus the entrance fitting", () => {
    expect(parts).toEqual(
      expect.arrayContaining([
        "Surface raceway device box, 700 series",
        "Surface raceway device plate, 700 series",
        "Raceway entrance end fitting",
        "20A duplex receptacle",
      ])
    );
    // Not the generic box it carried while it waited for the plate.
    expect(parts).not.toContain("Raceway device box, 1-gang");
  });

  /*
    Until 2026-10-08 DV34 was held with the plate listed missing. Track A
    shipped the plate (and a 700-series box) with the cover family; Track B
    added both lines and emptied the list, so DV34 now LOADS.
  */
  it("waits on nothing — so it seeds", () => {
    expect(dv34.missingParts ?? []).toEqual([]);
  });
});
