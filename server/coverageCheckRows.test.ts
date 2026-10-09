/**
 * THE COVERAGE CHECK'S MISSING CATALOG ROWS (owner-approved, 2026-10-09;
 * references/coverage-check.md on track-c, both lists).
 *
 * Additive only: every row here is NEW, nothing is renamed or retired, and
 * each carries a Residential / Commercial / Both tag and search words. Four
 * kinds are Specialty (meter center, switchboard, CT cabinet, HCF cable).
 *
 * "CT cabinet" is NOT added: it already ships as "Current transformer
 * cabinet", Specialty since the catalog review — the coverage search looked
 * for a different name. Adding it would have made a duplicate.
 *
 * Every case fails on the catalog before this change.
 */
import { describe, expect, it } from "vitest";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { SPECIALTY_MATERIALS } from "./seed/materials/specialty";
import { smartSearch } from "../client/src/lib/smartSearch";

type Kind = "residential" | "commercial" | "both";

/** name -> [category, unit, kind, specialty] */
const ADDED: Record<string, [string, "each" | "foot", Kind, boolean]> = {
  // First list
  "15A 250V receptacle, NEMA 6-15R": [
    "Receptacles",
    "each",
    "commercial",
    false,
  ],
  "20A 250V receptacle, NEMA 6-20R": ["Receptacles", "each", "both", false],
  "Fan-forced wall heater": ["Equipment & Appliances", "each", "both", false],
  "Wall heater thermostat": ["Equipment & Appliances", "each", "both", false],
  "Floor heating mat": ["Equipment & Appliances", "each", "residential", false],
  "Floor heating thermostat, GFCI": [
    "Equipment & Appliances",
    "each",
    "residential",
    false,
  ],
  "Pop-up countertop receptacle": ["Receptacles", "each", "residential", false],
  // Wider list
  "30A 250V receptacle, NEMA 6-30R": [
    "Receptacles",
    "each",
    "commercial",
    false,
  ],
  "50A 250V receptacle, NEMA 6-50R": ["Receptacles", "each", "both", false],
  "L15-30 receptacle": ["Receptacles", "each", "commercial", false],
  "L21-30 receptacle": ["Receptacles", "each", "commercial", false],
  "12/2 MC cable healthcare (HCF) Copper": [
    "Wire & Cable",
    "foot",
    "commercial",
    true,
  ],
  "20A red emergency receptacle": ["Receptacles", "each", "commercial", false],
  "Meter center, 4-position": ["Panels", "each", "both", true],
  "Meter center, 6-position": ["Panels", "each", "both", true],
  "400A switchboard": ["Distribution Equipment", "each", "commercial", true],
  "600A switchboard": ["Distribution Equipment", "each", "commercial", true],
  "800A switchboard": ["Distribution Equipment", "each", "commercial", true],
  "Handhole with lid, polymer concrete": [
    "Underground",
    "each",
    "commercial",
    false,
  ],
  "Dock light, swing arm": ["Lighting Hardware", "each", "commercial", false],
  "Cord reel": ["Equipment & Appliances", "each", "commercial", false],
  "Telecom backboard, plywood 4x8": [
    "Low Voltage",
    "each",
    "commercial",
    false,
  ],
  "Telecom grounding busbar": ["Low Voltage", "each", "commercial", false],
  "4/3 NM-B Copper": ["Wire & Cable", "foot", "residential", false],
};

const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));

describe("the coverage check's catalog rows", () => {
  it("ships all 24, each with its shelf, unit, job tag, $0 and search words", () => {
    expect(Object.keys(ADDED)).toHaveLength(24);
    for (const [name, [category, unit, kind]] of Object.entries(ADDED)) {
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      expect([row!.category, row!.unitOfSale, row!.jobKind], name).toEqual([
        category,
        unit,
        kind,
      ]);
      expect(Number(row!.costPerUnit), name).toBe(0);
      expect(row!.searchAliases.trim().length, name).toBeGreaterThan(0);
    }
  });

  it("tags Specialty on exactly the meter centers, switchboards and HCF cable — and the CT cabinet is already there", () => {
    for (const [name, [, , , specialty]] of Object.entries(ADDED))
      expect(SPECIALTY_MATERIALS.includes(name), name).toBe(specialty);
    expect(SPECIALTY_MATERIALS).toContain("Current transformer cabinet");
    expect(byName.has("Current transformer cabinet")).toBe(true);
  });

  it("is additive: no new row is a rename target, a retired name, or an old spelling", () => {
    const renamedFrom = new Set(Object.keys(RENAMED_BASELINE_MATERIALS));
    for (const name of Object.keys(ADDED)) {
      expect(renamedFrom.has(name), name).toBe(false);
      expect(RETIRED_BASELINE_MATERIALS, name).not.toContain(name);
    }
    // Nothing shipped before was removed: the catalog grew by exactly 24.
    expect(BASELINE_MATERIALS).toHaveLength(1801 + 24);
  });

  it("is found by the words a counter would use — within the top three", () => {
    // The same raw search materialsCatalog.test.ts uses; the app's role and
    // commonness tie-breaks only ever improve on it.
    const index = BASELINE_MATERIALS.map((m, i) => ({
      id: String(i),
      description: m.name,
      unit: m.unitOfSale,
      searchAliases: m.searchAliases,
    }));
    const top3 = (q: string) =>
      smartSearch(index, q, 3).map(h => BASELINE_MATERIALS[Number(h.id)].name);
    const cases: [string, string][] = [
      ["6-20r", "20A 250V receptacle, NEMA 6-20R"],
      ["6-15", "15A 250V receptacle, NEMA 6-15R"],
      ["6-30r", "30A 250V receptacle, NEMA 6-30R"],
      ["6-50 receptacle", "50A 250V receptacle, NEMA 6-50R"],
      ["welder receptacle", "50A 250V receptacle, NEMA 6-50R"],
      ["l15-30", "L15-30 receptacle"],
      ["l21-30", "L21-30 receptacle"],
      ["hcf", "12/2 MC cable healthcare (HCF) Copper"],
      ["red receptacle", "20A red emergency receptacle"],
      ["meter center", "Meter center, 4-position"],
      ["meter stack", "Meter center, 6-position"],
      ["switchboard", "400A switchboard"],
      ["handhole", "Handhole with lid, polymer concrete"],
      ["dock light", "Dock light, swing arm"],
      ["cord reel", "Cord reel"],
      ["tmgb", "Telecom grounding busbar"],
      ["telecom backboard", "Telecom backboard, plywood 4x8"],
      ["4/3 romex", "4/3 NM-B Copper"],
      ["pop up countertop", "Pop-up countertop receptacle"],
      ["cadet heater", "Fan-forced wall heater"],
      ["wall heater thermostat", "Wall heater thermostat"],
      ["floor heat mat", "Floor heating mat"],
      ["floor heat thermostat", "Floor heating thermostat, GFCI"],
    ];
    for (const [query, name] of cases)
      expect(top3(query), `"${query}"`).toContain(name);
  });
});
