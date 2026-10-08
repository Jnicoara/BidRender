/**
 * Baseline labor rates — the starter roles shipped with the app.
 *
 * These become rows in `labor_rates` with `userId = NULL`: owned by nobody,
 * read-only, and forked the moment a user edits one. Same ownership model as
 * BASELINE_MATERIALS.
 *
 * ── Field roles ship EXAMPLE LOADED rates, tagged — since 2026-10-07 ─────────
 * Until then every role shipped at $0, because a plausible number nobody chose
 * is indistinguishable on screen from one the contractor set — and the rate
 * multiplies EVERY line of a bid at once. That reasoning still holds; what
 * changed is that the number now SAYS what it is. The owner approved example
 * loaded rates (references/starter-vs-company-plan.md § 3b):
 *
 *   Foreman/Master Electrician  $50.00 wage -> $70.50 loaded
 *   Journeyman                  $42.00      -> $59.22
 *   Apprentice                  $26.00      -> $36.66
 *   Helper (new role)           $24.00      -> $33.84
 *
 * wages set ~30% above the BLS national mean on purpose ("if wrong, better
 * high than low"), plus a 41% burden shown as its parts (payroll 10%, comp
 * 7%, insurance 4%, benefits 20%) — shared/loadedRate.ts. Every one ships
 * `isExampleRate`: an "Example rate" tag on the bid screen, a banner until
 * the shop sets its own, a warning before printing, and `needsRate` still
 * reads it as "needs a rate". The rates and the flag ship TOGETHER, never
 * the rates alone (0134).
 *
 * Supervisor and Project Manager stay unrated ($0): their cost varies too
 * much to guess usefully.
 *
 * Roles are free text on purpose — a contractor's org chart is their own.
 */
import type { LaborRateType } from "../../drizzle/schema";
import {
  EXAMPLE_BURDEN,
  EXAMPLE_WAGES,
  loadedRate,
} from "../../shared/loadedRate";

export type BaselineLaborRate = {
  name: string;
  rateType: LaborRateType;
  /** Decimal columns — strings so no float rounding happens on the way in. */
  hourlyCost: string;
  /** Salary roles only; NULL on hourly roles. */
  annualSalary: string | null;
  annualHours: string | null;
  /**
   * The example loaded rate as its parts, on a role that ships one. Omitted
   * = an unrated role ($0, no breakdown, not an example).
   */
  example?: {
    baseWage: string;
    payrollTaxPct: string;
    workersCompPct: string;
    insurancePct: string;
    benefitsPct: string;
  };
};

/** The rate an unrated starter role ships at. See the file header. */
export const UNRATED = "0.0000";

/** A field role at its owner-approved example loaded rate. */
function exampleRole(name: string): BaselineLaborRate {
  const wage = EXAMPLE_WAGES[name];
  if (wage === undefined) throw new Error(`no example wage for "${name}"`);
  return {
    name,
    rateType: "hourly",
    hourlyCost: loadedRate({ baseWage: wage, ...EXAMPLE_BURDEN }).toFixed(4),
    annualSalary: null,
    annualHours: null,
    example: {
      baseWage: wage.toFixed(4),
      payrollTaxPct: EXAMPLE_BURDEN.payrollTaxPct.toFixed(4),
      workersCompPct: EXAMPLE_BURDEN.workersCompPct.toFixed(4),
      insurancePct: EXAMPLE_BURDEN.insurancePct.toFixed(4),
      benefitsPct: EXAMPLE_BURDEN.benefitsPct.toFixed(4),
    },
  };
}

export const BASELINE_LABOR_RATES: BaselineLaborRate[] = [
  exampleRole("Apprentice"),
  exampleRole("Journeyman"),
  exampleRole("Foreman/Master Electrician"),
  // New 2026-10-07 with the example rates (owner): the role a shop's
  // material handling and rough-in help is priced at.
  exampleRole("Helper"),
  {
    name: "Supervisor",
    rateType: "hourly",
    hourlyCost: UNRATED,
    annualSalary: null,
    annualHours: null,
  },

  // The one salaried starter, present so the salary path is exercised out of
  // the box. hourlyCost stays 0 because for a salary role the rate is DERIVED
  // and never read from that column.
  //
  // annualHours stays at a real 2,080 while the salary is what ships at zero.
  // That is not cosmetic: effectiveHourlyRate treats zero hours as a division
  // by zero and throws rather than returning "free", so zeroing the hours
  // instead would take out every screen that prices a salaried role.
  {
    name: "Project Manager",
    rateType: "salary",
    hourlyCost: UNRATED,
    annualSalary: "0.00",
    annualHours: "2080.00",
  },
];
