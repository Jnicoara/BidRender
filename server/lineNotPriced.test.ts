/**
 * "Not priced" instead of $0 on a bid line — which lines, and which not.
 * See shared/lineNotPriced.ts for why each kind of line reads $0 differently.
 */
import { describe, expect, it } from "vitest";
import {
  countNotPriced,
  lineHoursUnset,
  lineNotPriced,
} from "../shared/lineNotPriced";
import { missingEntryCounts } from "../shared/handPricedLines";

const base = {
  qty: "4",
  assemblyId: null as number | null,
  takeoffRunTypeId: null as number | null,
  runMaterialRole: null as string | null,
  snapshotMaterialCost: null as string | null,
  snapshotLaborHours: null as string | null,
};

describe("a line priced by hand", () => {
  it("is not priced while the price is blank", () => {
    expect(lineNotPriced(base, 0)).toBe(true);
  });
  it("is priced at a TYPED zero — an owner-supplied part is an answer", () => {
    expect(lineNotPriced({ ...base, snapshotMaterialCost: "0" }, 0)).toBe(
      false
    );
  });
});

describe("a line from a run type", () => {
  const run = { ...base, takeoffRunTypeId: 7, snapshotLaborHours: "0" };
  it("is not priced when its catalog row was $0 — nobody chose that zero", () => {
    expect(lineNotPriced({ ...run, snapshotMaterialCost: "0.0000" }, 0)).toBe(
      true
    );
  });
  it("is not priced even with labor on it, because the material is missing", () => {
    expect(
      lineNotPriced(
        { ...run, snapshotMaterialCost: "0.0000", snapshotLaborHours: "0.1" },
        12.5
      )
    ).toBe(true);
  });
  it("is priced once the snapshot carries a price", () => {
    expect(lineNotPriced({ ...run, snapshotMaterialCost: "0.4500" }, 1.8)).toBe(
      false
    );
  });
});

describe("a field bend — labor on a part that is $0 by nature", () => {
  const bend = {
    ...base,
    takeoffRunTypeId: 7,
    runMaterialRole: "fieldBend",
    snapshotMaterialCost: "0.0000",
  };
  it("is NOT PRICED while its hours are unset — never read as a free bend", () => {
    expect(lineNotPriced({ ...bend, snapshotLaborHours: null }, 0)).toBe(true);
  });
  it("is priced once it has hours, though its material is $0", () => {
    expect(lineNotPriced({ ...bend, snapshotLaborHours: "0.2500" }, 21)).toBe(
      false
    );
  });
  it("is priced at a SET zero hours — zero is an answer for labor", () => {
    expect(lineNotPriced({ ...bend, snapshotLaborHours: "0.0000" }, 0)).toBe(
      false
    );
  });
  it("shows its hours as unset, not as 0 h, while they are NULL", () => {
    expect(lineHoursUnset({ ...bend, snapshotLaborHours: null })).toBe(true);
    expect(lineHoursUnset({ ...bend, snapshotLaborHours: "0.0000" })).toBe(
      false
    );
  });
});

describe("labor on a traced line — 'Not priced', never 0 h", () => {
  it("is unset on ANY traced line whose part had no labor unit", () => {
    // A coupling, a pipe — not only a field bend (owner, 2026-09-26).
    expect(
      lineHoursUnset({ takeoffRunTypeId: 7, snapshotLaborHours: null })
    ).toBe(true);
  });
  it("is an answer at a SET 0 — wire nuts made up with the device", () => {
    expect(
      lineHoursUnset({ takeoffRunTypeId: 7, snapshotLaborHours: "0.0000" })
    ).toBe(false);
  });
  it("leaves hand-priced lines to their own rule and their own strip", () => {
    expect(
      lineHoursUnset({ takeoffRunTypeId: null, snapshotLaborHours: null })
    ).toBe(false);
    expect(
      missingEntryCounts([
        { ...base, takeoffRunTypeId: 7, snapshotMaterialCost: "0.45" },
        base,
      ])
    ).toEqual({ noPrice: 1, noHours: 1 });
  });
});

describe("a line from an assembly", () => {
  const assembly = { ...base, assemblyId: 3, snapshotMaterialCost: "0" };
  it("is not priced when the whole line comes to $0", () => {
    expect(lineNotPriced(assembly, 0)).toBe(true);
  });
  it("is priced when it is labor only — no material is legitimate there", () => {
    expect(lineNotPriced(assembly, 85)).toBe(false);
  });
});

describe("nothing to price", () => {
  it("is never 'not priced' at a zero quantity — $0 for nothing is true", () => {
    expect(lineNotPriced({ ...base, qty: "0" }, 0)).toBe(false);
  });
});

it("counts the lines a total leaves out", () => {
  expect(
    countNotPriced([
      { line: base, directCost: 0 },
      { line: { ...base, snapshotMaterialCost: "0" }, directCost: 0 },
      {
        line: { ...base, assemblyId: 1, snapshotMaterialCost: "0" },
        directCost: 0,
      },
    ])
  ).toBe(2);
});
