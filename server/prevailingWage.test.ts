/**
 * Prevailing wage arithmetic (references/bid-methods-plan.md § 5, owner
 * Q11–Q15). Pure. Every number worked in its comment.
 */
import { describe, expect, it } from "vitest";
import {
  asksAboutApprentices,
  chargeBelowCostWarning,
  monthsSince,
  prevailingLoadedCost,
  recheckDue,
  recheckPrintWarning,
  recheckReminder,
  setRateForRole,
  type WageSet,
} from "../shared/prevailingWage";

const burden = { payrollTaxPct: 0.1, workersCompPct: 0.07, insurancePct: 0.04 };

describe("loaded cost from a wage set", () => {
  it("burden on the base, fringe added untaxed: $45 + 21% + $20 = $74.45", () => {
    // 45 × 1.21 = 54.45; + 20.00 fringe = 74.45. Benefits % is not an
    // input at all: the fringe replaces it (Q13).
    expect(
      prevailingLoadedCost({ baseWage: 45, fringe: 20 }, burden, null)
    ).toEqual({ cost: 74.45, burdenMissing: false });
  });

  it("fringe paid as cash takes payroll tax too: + $2.00 = $76.45", () => {
    // 20 × 1.10 = 22.00 (Q15). Comp and insurance stay on the base only.
    expect(
      prevailingLoadedCost({ baseWage: 45, fringe: 20 }, burden, true).cost
    ).toBe(76.45);
    expect(
      prevailingLoadedCost({ baseWage: 45, fringe: 20 }, burden, false).cost
    ).toBe(74.45);
  });

  it("a role with no burden costs wage + fringe and says the burden is missing", () => {
    expect(
      prevailingLoadedCost({ baseWage: 45, fringe: 20 }, null, true)
    ).toEqual({ cost: 65, burdenMissing: true });
  });

  it("refuses a negative wage rather than pricing it", () => {
    expect(() =>
      prevailingLoadedCost({ baseWage: -1, fringe: 0 }, burden, null)
    ).toThrow(/baseWage/);
  });
});

const set: WageSet = {
  name: "Pierce County public works 2026",
  wageDeterminationNumber: "2026-0123",
  dateSet: "2026-03-15",
  fringePaidAsCash: null,
  rates: [
    {
      classification: "journeyman",
      label: "Journeyman",
      laborRateId: 11,
      baseWage: 52,
      fringe: 24,
    },
    {
      classification: "apprentice",
      label: "Apprentice",
      laborRateId: 12,
      baseWage: 29,
      fringe: 12,
    },
  ],
};

describe("which row a role costs at", () => {
  it("an apprentice costs at the JOURNEYMAN row unless the bid says yes", () => {
    for (const answer of [null, false] as const) {
      const r = setRateForRole(set, 12, answer);
      expect(r).toMatchObject({ kind: "set", apprenticeAtJourneyman: true });
      if (r.kind === "set") expect(r.row.label).toBe("Journeyman");
    }
    const yes = setRateForRole(set, 12, true);
    expect(yes).toMatchObject({ kind: "set", apprenticeAtJourneyman: false });
    if (yes.kind === "set") expect(yes.row.label).toBe("Apprentice");
  });

  it("a role not in the set says so; an apprentice with no journeyman refuses", () => {
    expect(setRateForRole(set, 99, true)).toEqual({ kind: "not-in-set" });
    expect(setRateForRole({ rates: [set.rates[1]] }, 12, null)).toEqual({
      kind: "no-journeyman-row",
    });
  });

  it("asks about apprentices only when the set has an apprentice row", () => {
    expect(asksAboutApprentices(set)).toBe(true);
    expect(asksAboutApprentices({ rates: [set.rates[0]] })).toBe(false);
  });
});

describe("re-check after 6 months — a warning, never a block", () => {
  it("is due six calendar months on, clamped to the month's last day", () => {
    expect(recheckDue("2026-03-15")).toBe("2026-09-15");
    expect(recheckDue("2026-08-31")).toBe("2027-02-28");
    expect(recheckDue("2027-08-31")).toBe("2028-02-29");
    expect(recheckDue("2026-12-01")).toBe("2027-06-01");
  });

  it("counts whole months", () => {
    expect(monthsSince("2026-03-15", "2026-10-16")).toBe(7);
    expect(monthsSince("2026-03-15", "2026-10-14")).toBe(6);
  });

  it("says nothing before the due day, then names the WD and its age", () => {
    expect(recheckReminder(set, "2026-09-14")).toBeNull();
    expect(recheckReminder(set, "2026-09-15")).toBe(
      "Re-check WD 2026-0123 — set 6 months ago"
    );
    expect(recheckReminder(set, "2026-10-16")).toBe(
      "Re-check WD 2026-0123 — set 7 months ago"
    );
    expect(recheckPrintWarning(set, "2026-10-16")).toBe(
      "This bid uses a wage determination set 7 months ago — check it before this goes out."
    );
    expect(recheckPrintWarning(set, "2026-09-01")).toBeNull();
  });
});

describe("charge rate below the prevailing cost (Q11)", () => {
  it("warns, with both numbers", () => {
    expect(chargeBelowCostWarning(70, 78.15)).toBe(
      "Charge rate $70.00/h is below this job's prevailing wage cost $78.15/h"
    );
    expect(chargeBelowCostWarning(78.15, 78.15)).toBeNull();
    expect(chargeBelowCostWarning(null, 78.15)).toBeNull();
  });
});
