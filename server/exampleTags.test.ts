/**
 * EXAMPLE PRICE / HOURS / RATE — the pure rules (shared/exampleTags.ts,
 * shared/loadedRate.ts, needsRate). The database half — the seed setting the
 * flags, an edit clearing them, a line freezing them — is in
 * server/exampleTagsFlow.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_LABEL,
  changed,
  exampleSummary,
  exampleWarning,
  lineExampleKinds,
  materialFlagsClearedBy,
} from "../shared/exampleTags";
import {
  EXAMPLE_BURDEN,
  EXAMPLE_WAGES,
  loadedRate,
  readParts,
} from "../shared/loadedRate";
import { needsRate } from "../shared/laborRatePricing";
import { BASELINE_LABOR_RATES } from "./seed/baselineLaborRates";

describe("a line's example kinds", () => {
  it("reads the frozen flags, in a fixed order, and NULL as not an example", () => {
    expect(lineExampleKinds({})).toEqual([]);
    expect(
      lineExampleKinds({
        snapshotLaborRateWasExample: true,
        snapshotPriceWasExample: true,
        snapshotHoursWereExample: null,
      })
    ).toEqual(["price", "rate"]);
    expect(EXAMPLE_LABEL.hours).toBe("Example hours");
  });
});

describe("the warning before printing", () => {
  it("is null when nothing is an example — a bid of the shop's own numbers prints as it always did", () => {
    expect(
      exampleWarning(exampleSummary([{}, { snapshotPriceWasExample: false }]))
    ).toBeNull();
  });

  it("counts lines once and says which kinds, in plain words", () => {
    const s = exampleSummary([
      { snapshotPriceWasExample: true, snapshotLaborRateWasExample: true },
      { snapshotLaborRateWasExample: true },
      {},
    ]);
    expect(s).toEqual({ lines: 2, price: 1, hours: 0, rate: 2 });
    expect(exampleWarning(s)).toBe(
      "2 lines are priced from BidRidge's example numbers (1 with example prices, 2 with example labor rates). Check them against your own before this goes out."
    );
  });
});

describe("an edit clears the flag of the number it changed — and only that one", () => {
  const before = {
    costPerUnit: "12.5000",
    laborHours: "0.2500",
    fieldBendLaborHours: null,
  };

  it("a new price clears the price flag", () => {
    expect(materialFlagsClearedBy(before, { costPerUnit: "13" })).toEqual({
      isExamplePrice: false,
    });
  });

  it("the same price written back is not an edit", () => {
    expect(materialFlagsClearedBy(before, { costPerUnit: "12.5" })).toEqual({});
  });

  it("new hours (or bend hours) clear the hours flag, not the price", () => {
    expect(materialFlagsClearedBy(before, { laborHours: "0.3" })).toEqual({
      isExampleLaborHours: false,
    });
    expect(
      materialFlagsClearedBy(before, { fieldBendLaborHours: "0.1" })
    ).toEqual({
      isExampleLaborHours: false,
    });
  });

  it("a field the edit does not mention leaves its flag alone (a form is a patch)", () => {
    expect(materialFlagsClearedBy(before, {})).toEqual({});
    expect(changed("1", undefined)).toBe(false);
    expect(changed(null, null)).toBe(false);
    expect(changed("1", null)).toBe(true);
  });
});

describe("the example LOADED rates (owner-approved 2026-10-07)", () => {
  it("are wage x 1.41 — payroll 10%, comp 7%, insurance 4%, benefits 20%", () => {
    expect(EXAMPLE_BURDEN).toEqual({
      payrollTaxPct: 0.1,
      workersCompPct: 0.07,
      insurancePct: 0.04,
      benefitsPct: 0.2,
    });
    const rate = (name: string) =>
      loadedRate({ baseWage: EXAMPLE_WAGES[name], ...EXAMPLE_BURDEN });
    expect(rate("Foreman/Master Electrician")).toBe(70.5);
    expect(rate("Journeyman")).toBe(59.22);
    expect(rate("Apprentice")).toBe(36.66);
    expect(rate("Helper")).toBe(33.84);
  });

  it("ship on the four field roles, Helper included, each with its parts and the flag implied", () => {
    const shipped = new Map(BASELINE_LABOR_RATES.map(r => [r.name, r]));
    for (const [name, loaded] of [
      ["Foreman/Master Electrician", "70.5000"],
      ["Journeyman", "59.2200"],
      ["Apprentice", "36.6600"],
      ["Helper", "33.8400"],
    ] as const) {
      const r = shipped.get(name)!;
      expect(r, name).toBeDefined();
      expect(r.hourlyCost, name).toBe(loaded);
      expect(r.example, name).toBeDefined();
      expect(loadedRate(readParts(r.example!)!), name).toBe(Number(loaded));
    }
    // Their cost varies too much to guess: still unrated, no example.
    expect(shipped.get("Supervisor")!.example).toBeUndefined();
    expect(shipped.get("Supervisor")!.hourlyCost).toBe("0.0000");
    expect(shipped.get("Project Manager")!.example).toBeUndefined();
  });

  it("a breakdown left blank is NOT a zero wage", () => {
    expect(
      readParts({
        baseWage: null,
        payrollTaxPct: null,
        workersCompPct: null,
        insurancePct: null,
        benefitsPct: null,
      })
    ).toBeNull();
  });
});

describe("needsRate and the example rate — the trap the plan named", () => {
  it("an example rate still NEEDS the shop's own rate, though it is not $0", () => {
    // Without the isExampleRate check this is false — and every
    // unconfigured shop reads as "rate set" the day example rates ship.
    expect(
      needsRate({
        rateType: "hourly",
        hourlyCost: "59.2200",
        annualSalary: null,
        annualHours: null,
        isExampleRate: true,
      })
    ).toBe(true);
  });

  it("the shop's own rate does not", () => {
    expect(
      needsRate({
        rateType: "hourly",
        hourlyCost: "61.0000",
        annualSalary: null,
        annualHours: null,
        isExampleRate: false,
      })
    ).toBe(false);
  });
});
