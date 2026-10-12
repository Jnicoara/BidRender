/**
 * "Not priced" instead of $0 on a bid line — which lines, and which not.
 * See shared/lineNotPriced.ts for why each kind of line reads $0 differently.
 */
import { describe, expect, it } from "vitest";
import {
  countNotPriced,
  lineHoursMissing,
  lineHoursUnset,
  lineMaterialNotPriced,
  lineNotPriced,
  linePartsNotPriced,
} from "../shared/lineNotPriced";
import { missingEntryCounts } from "../shared/handPricedLines";

const base = {
  qty: "4",
  assemblyId: null as number | null,
  takeoffRunTypeId: null as number | null,
  runMaterialRole: null as string | null,
  snapshotMaterialCost: null as string | null,
  snapshotLaborHours: null as string | null,
  snapshotLaborOnly: null,
  lineRole: "install",
  scopeTag: null,
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
  it("is unset on a traced line whose part had no labor unit", () => {
    // Pipe, wire, an elbow — not only a field bend (owner, 2026-09-26). This
    // used to say "a coupling, a pipe"; a coupling left the list 2026-09-29.
    for (const role of ["raceway", "conductor", "elbow90", "lb", "pullBox"]) {
      expect(
        lineHoursUnset({
          takeoffRunTypeId: 7,
          runMaterialRole: role,
          snapshotLaborHours: null,
        })
      ).toBe(true);
    }
  });
  it("is never unset on a coupling, connector or strap — the run rate pays them", () => {
    // Owner, 2026-09-29. A line of theirs sent before the rule holds NULL;
    // calling it "Not priced" would ask for hours that must never be used.
    for (const role of ["coupling", "connector", "strap"]) {
      expect(
        lineHoursUnset({
          takeoffRunTypeId: 7,
          runMaterialRole: role,
          snapshotLaborHours: null,
        })
      ).toBe(false);
    }
  });
  it("is an answer at a SET 0 — wire nuts made up with the device", () => {
    expect(
      lineHoursUnset({
        takeoffRunTypeId: 7,
        runMaterialRole: "raceway",
        snapshotLaborHours: "0.0000",
      })
    ).toBe(false);
  });
  it("leaves hand-priced lines to their own rule and their own strip", () => {
    expect(
      lineHoursUnset({
        takeoffRunTypeId: null,
        runMaterialRole: null,
        snapshotLaborHours: null,
      })
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
  it("keeps its labor in the total — it is not unpriced as a WHOLE", () => {
    expect(lineNotPriced(assembly, 85)).toBe(false);
  });
  it("but never reads FULLY priced: its missing material is counted (owner, 2026-10-05)", () => {
    // The trap: a light pole assembly with 6 h of labor and no material read
    // "$510.00" and the bid total looked finished — a pole bid with no pole
    // in it. Labor stays in; the material is one thing not priced.
    const line = { ...assembly, snapshotLaborHours: "6", unpricedParts: 0 };
    expect(lineMaterialNotPriced(line, 510)).toBe(true);
    expect(linePartsNotPriced(line, 510)).toBe(1);
    expect(countNotPriced([{ line, directCost: 510 }])).toEqual({
      lines: 0,
      parts: 1,
      hours: 0,
    });
  });
  it("counts the missing material ONCE, not on top of unpriced recipe parts", () => {
    // Two $0 parts already say the material is short; "+ 3" would overstate it.
    const line = { ...assembly, snapshotLaborHours: "6", unpricedParts: 2 };
    expect(linePartsNotPriced(line, 510)).toBe(2);
  });
  it("is fully priced when it has material", () => {
    const line = {
      ...assembly,
      snapshotMaterialCost: "42",
      snapshotLaborHours: "6",
      snapshotLaborOnly: null,
      lineRole: "install",
      scopeTag: null,
      unpricedParts: 0,
    };
    expect(lineMaterialNotPriced(line, 552)).toBe(false);
    expect(linePartsNotPriced(line, 552)).toBe(0);
  });
});

describe("nothing to price", () => {
  it("is never 'not priced' at a zero quantity — $0 for nothing is true", () => {
    expect(lineNotPriced({ ...base, qty: "0" }, 0)).toBe(false);
  });
});

it("counts the lines a total leaves out", () => {
  // No assembly parts anywhere, so the part count is a real 0, not a default.
  const noParts = { unpricedParts: 0 };
  expect(
    countNotPriced([
      { line: { ...base, ...noParts }, directCost: 0 },
      {
        line: { ...base, ...noParts, snapshotMaterialCost: "0" },
        directCost: 0,
      },
      {
        line: {
          ...base,
          ...noParts,
          assemblyId: 1,
          snapshotMaterialCost: "0",
        },
        directCost: 0,
      },
    ])
  ).toEqual({ lines: 2, parts: 0, hours: 0 });
});

/*
  WHO DOES THE WORK (0146, shared/lineScope.ts). By others / Excluded: no
  part of the line is ours, so nothing is missing from it. Owner furnishes:
  the material is the owner's, so only our HOURS can be missing.
*/
describe("a line tagged by scope", () => {
  const hoursMissingOn = (line: Parameters<typeof lineHoursMissing>[0]) =>
    lineHoursMissing(line, 100);

  it.each(["by_others", "excluded"] as const)(
    "%s: never 'not priced', whatever kind of line it is",
    scopeTag => {
      // Blank typed price, $0 run-type part, $0 assembly, role line, no hours.
      expect(lineNotPriced({ ...base, scopeTag }, 0)).toBe(false);
      expect(
        lineNotPriced(
          {
            ...base,
            scopeTag,
            takeoffRunTypeId: 7,
            snapshotMaterialCost: "0",
          },
          0
        )
      ).toBe(false);
      expect(
        lineNotPriced(
          { ...base, scopeTag, assemblyId: 1, snapshotMaterialCost: "0" },
          0
        )
      ).toBe(false);
      expect(lineNotPriced({ ...base, scopeTag, lineRole: "remove" }, 0)).toBe(
        false
      );
      const assemblyLine = {
        ...base,
        scopeTag,
        assemblyId: 1,
        snapshotMaterialCost: "0",
        unpricedParts: 3,
      };
      expect(linePartsNotPriced(assemblyLine, 0)).toBe(0);
      expect(hoursMissingOn(assemblyLine)).toBe(false);
    }
  );

  it("ofci: a typed line with no price but hours set is priced", () => {
    expect(
      lineNotPriced({ ...base, scopeTag: "ofci", snapshotLaborHours: "1" }, 50)
    ).toBe(false);
  });
  it("ofci: a typed line with no hours is not priced — our labor is missing", () => {
    expect(lineNotPriced({ ...base, scopeTag: "ofci" }, 0)).toBe(true);
  });
  it("ofci: a coupling is never not priced — the run rate pays its labor", () => {
    expect(
      lineNotPriced(
        {
          ...base,
          scopeTag: "ofci",
          takeoffRunTypeId: 7,
          runMaterialRole: "coupling",
          snapshotMaterialCost: "0",
        },
        0
      )
    ).toBe(false);
  });
  it("ofci: an assembly line never says material or parts are missing", () => {
    const line = {
      ...base,
      scopeTag: "ofci" as const,
      assemblyId: 1,
      snapshotMaterialCost: "0",
      snapshotLaborHours: "1",
      unpricedParts: 2,
    };
    expect(lineNotPriced(line, 50)).toBe(false);
    expect(lineMaterialNotPriced(line, 50)).toBe(false);
    expect(linePartsNotPriced(line, 50)).toBe(0);
    // The same line untagged says both.
    expect(lineMaterialNotPriced({ ...line, scopeTag: null }, 50)).toBe(true);
    expect(linePartsNotPriced({ ...line, scopeTag: null }, 50)).toBe(2);
  });
  it("ofci: an assembly line with no hours says its hours, as ours", () => {
    const line = {
      ...base,
      scopeTag: "ofci" as const,
      assemblyId: 1,
      snapshotMaterialCost: "0",
      unpricedParts: 0,
    };
    expect(lineNotPriced(line, 0)).toBe(false);
    expect(hoursMissingOn(line)).toBe(true);
  });
});
