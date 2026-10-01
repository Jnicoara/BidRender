/**
 * EVERY PART THE STARTER ASSEMBLIES PLAN NAMES IS A ROW THE CATALOG SHIPS
 * (references/starter-assemblies-plan.md, 2026-09-29).
 *
 * The plan is a list of recipes written against the catalog by name, and the
 * seeder matches starter materials by EXACT name — a starter naming a row that
 * does not ship is silently skipped, which is how "200A main panel furnish and
 * install" went missing for weeks (CLAUDE.md § single-pole). So the plan's
 * names are checked here rather than by eye, and a rename or retirement that
 * strands one goes red before anybody seeds from it.
 *
 * What this reads: text inside backticks in the parts tables, between the
 * "DV — Devices" heading and "Gaps". Parts the catalog does not have yet are
 * written in italics with ‡, not backticks, so they are outside the check by
 * construction — and the last test says which ones are allowed to be.
 *
 * Pure: the seed and a file, no database.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASELINE_MATERIALS } from "./seed/materials";
import { mcFittingNames } from "../shared/runFittingMaterials";

const shipped = new Set(BASELINE_MATERIALS.map(m => m.name));
const plan = readFileSync(
  path.join(__dirname, "..", "references", "starter-assemblies-plan.md"),
  "utf8"
);
const tables = plan.split("## Gaps")[0].split("## DV — Devices")[1] ?? "";

describe("the starter assemblies plan", () => {
  it("names only parts the catalog ships", () => {
    const named = Array.from(
      new Set(Array.from(tables.matchAll(/`([^`]+)`/g), match => match[1]))
    );
    expect(named.length).toBeGreaterThan(250);
    expect(named.filter(name => !shipped.has(name))).toEqual([]);
  });

  it("leaves only surface raceway waiting on a missing part", () => {
    const waiting = Array.from(tables.matchAll(/‡_([^_]+)_/g), m => m[1]);
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.filter(name => !/^Surface raceway/.test(name))).toEqual([]);
  });
});

/*
  The eleven rows the plan's § Gaps asked for, built 2026-09-29. Listed so a
  later rename that forgets RENAMED_BASELINE_MATERIALS fails here by name.
*/
const GAP_ROWS: Array<[string, string]> = [
  ["System smoke detector", "Life Safety"],
  ["12-2 submersible pump cable", "Wire & Cable"],
  ["14-4 mini-split cable", "Wire & Cable"],
  ['2" meter hub', "Panels"],
  ['2" mast roof flashing', "Conduit Fittings"],
  ['2" riser strap', "Conduit Fittings"],
  ['2" SE cable connector', "Connectors & Terminations"],
  ["Roof flashing boot", "Conduit Fittings"],
  ["Cat6 RJ45 end", "Low Voltage"],
  ["Temporary pole, 6x6 post", "Strut & Supports"],
  ["Temporary light string, 100 ft", "Lighting Hardware"],
];

describe("the rows built for the plan's gaps", () => {
  it.each(GAP_ROWS)("%s ships, unpriced, on %s", (name, category) => {
    const row = BASELINE_MATERIALS.find(m => m.name === name);
    expect(row?.category).toBe(category);
    expect(Number(row?.costPerUnit)).toBe(0);
    expect(row?.searchAliases.length).toBeGreaterThan(0);
  });

  it("the two new cables sell by the foot", () => {
    for (const name of ["12-2 submersible pump cable", "14-4 mini-split cable"])
      expect(BASELINE_MATERIALS.find(m => m.name === name)?.unitOfSale).toBe(
        "foot"
      );
  });

  // The seed comment says neither is read as MC; this is what makes it true.
  it("neither new cable buys MC connectors or straps", () => {
    expect(mcFittingNames("12-2 submersible pump cable")).toBeNull();
    expect(mcFittingNames("14-4 mini-split cable")).toBeNull();
    expect(mcFittingNames("14-4 MC cable")).not.toBeNull();
  });
});
