/**
 * THE LABOR-UNIT SHEET IMPORT — shared/laborImport.ts, no database.
 *
 * Each rule is one a tidy-up could remove, and each goes red if it does:
 *   - blank MY HOURS writes nothing (unset stays unset, never 0);
 *   - "per 100 ft" is divided by 100 into the per-foot labor unit;
 *   - an ID whose name disagrees is NOT written (another database's sheet);
 *   - a shipped rename still matches;
 *   - an unknown ID is listed, never created;
 *   - a field bend writes fieldBendLaborHours, and only on a raceway;
 *   - a unit that disagrees with the material's unit of sale is refused.
 */
import { describe, expect, it } from "vitest";
import {
  parseLaborSheet,
  planAssemblyHoursImport,
  planLaborImport,
  type ImportMaterial,
} from "../shared/laborImport";

const TAB = "\t";
const sheet = (...rows: string[][]) =>
  [["ID", "Name", "Unit", "MY HOURS", "ANCHOR", "SUGGESTED", "Notes"], ...rows]
    .map(r => r.join(TAB))
    .join("\n");

const EMT: ImportMaterial = {
  id: 101,
  name: '1/2" EMT',
  unitOfSale: "foot",
  laborHours: null,
  fieldBendLaborHours: null,
  isRaceway: true,
};
const BOX: ImportMaterial = {
  id: 202,
  name: "4x4 pull box",
  unitOfSale: "each",
  laborHours: 0.5,
  fieldBendLaborHours: null,
  isRaceway: false,
};
const catalog = new Map([
  [EMT.id, EMT],
  [BOX.id, BOX],
]);
const find = (id: number) => catalog.get(id) ?? null;
const noRenames = () => null;

function plan(
  text: string,
  renamedTo: (n: string) => string | null = noRenames
) {
  const parsed = parseLaborSheet(text);
  if (parsed.kind !== "materials") throw new Error(`parsed as ${parsed.kind}`);
  return planLaborImport(parsed.rows, find, renamedTo);
}

describe("the labor-unit sheet import", () => {
  it("divides 'per 100 ft' into the per-foot labor unit", () => {
    const p = plan(
      sheet(["101", '1/2" EMT', "per 100 ft", "4.5", "yes", "", ""])
    );
    expect(p.changes).toEqual([
      expect.objectContaining({
        materialId: 101,
        field: "laborHours",
        from: null,
        to: 0.045,
      }),
    ]);
  });

  it("leaves a blank MY HOURS alone — unset stays unset, never 0", () => {
    // SUGGESTED is filled, MY HOURS is not: nothing may be written.
    const p = plan(sheet(["101", '1/2" EMT', "per 100 ft", "", "", "4.2", ""]));
    expect(p.changes).toEqual([]);
    expect(p.blank).toBe(1);
  });

  it("writes a typed 0 — it is an answer", () => {
    const p = plan(sheet(["202", "4x4 pull box", "each", "0", "", "", ""]));
    expect(p.changes[0]).toMatchObject({ from: 0.5, to: 0 });
  });

  it("refuses an ID whose name disagrees — a sheet from another database", () => {
    const p = plan(sheet(["101", '3/4" PVC', "per 100 ft", "4", "", "", ""]));
    expect(p.changes).toEqual([]);
    expect(p.unmatched[0].reason).toMatch(/another database/);
  });

  it("matches an ID whose sheet name is a recorded OLD name", () => {
    const p = plan(
      sheet(["101", "Half inch EMT", "per 100 ft", "4", "", "", ""]),
      n => (n === "Half inch EMT" ? '1/2" EMT' : null)
    );
    expect(p.changes).toHaveLength(1);
  });

  it("never creates: an unknown ID or a 'missing from catalog' row is listed", () => {
    const p = plan(
      sheet(
        ["999", "Something", "each", "1", "", "", ""],
        ["", '1/2" ENT', "per 100 ft", "3", "", "", "missing from catalog"]
      )
    );
    expect(p.changes).toEqual([]);
    expect(p.unmatched.map(u => u.reason)).toEqual([
      "no material with ID 999 in this database",
      "no ID — a row the catalog does not have",
    ]);
  });

  it("writes a field bend to fieldBendLaborHours, and only on a raceway", () => {
    const p = plan(
      sheet(
        ["101", '1/2" EMT', "per field bend", "0.15", "", "", ""],
        ["202", "4x4 pull box", "per field bend", "0.15", "", "", ""]
      )
    );
    expect(p.changes).toEqual([
      expect.objectContaining({ field: "fieldBendLaborHours", to: 0.15 }),
    ]);
    expect(p.unmatched[0].reason).toMatch(/not a raceway/);
  });

  it("refuses a unit that disagrees with how the material is sold", () => {
    const p = plan(
      sheet(["202", "4x4 pull box", "per 100 ft", "3", "", "", ""])
    );
    expect(p.changes).toEqual([]);
    expect(p.unmatched[0].reason).toMatch(/sold by the each/);
  });

  it("counts an unchanged value as unchanged, not as a change", () => {
    const p = plan(sheet(["202", "4x4 pull box", "each", "0.5", "", "", ""]));
    expect(p.changes).toEqual([]);
    expect(p.unchanged).toBe(1);
  });
});

describe("the assembly hours tab", () => {
  it("writes typed hours, skips blanks, refuses a name that disagrees", () => {
    const parsed = parseLaborSheet(
      [
        "Assembly ID\tAssembly\tMY HOURS\tNotes",
        "7\tGFCI receptacle\t0.8\t",
        "8\tDimmer switch\t\t",
        "9\tWrong name\t1\t",
      ].join("\n")
    );
    if (parsed.kind !== "assemblies") throw new Error(parsed.kind);
    const p = planAssemblyHoursImport(parsed.rows, id =>
      id === 7
        ? { id: 7, name: "GFCI receptacle", baseLaborHours: 0.9 }
        : id === 8
          ? { id: 8, name: "Dimmer switch", baseLaborHours: 0.7 }
          : id === 9
            ? { id: 9, name: "Single-pole switch", baseLaborHours: 0.6 }
            : null
    );
    expect(p.changes).toEqual([
      expect.objectContaining({ assemblyId: 7, from: 0.9, to: 0.8 }),
    ]);
    expect(p.blank).toBe(1);
    expect(p.unmatched).toHaveLength(1);
  });
});
