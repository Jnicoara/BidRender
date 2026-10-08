/**
 * A LOADED labor rate as its parts: wage + payroll taxes + workers' comp +
 * insurance + benefits (owner-approved 2026-10-07;
 * references/starter-vs-company-plan.md § 3b).
 *
 * `labor_rates.hourlyCost` stays THE number every bid uses. When a rate is
 * broken down, the editor WRITES hourlyCost from this function; nothing
 * derives it on read, so changing a breakdown can never re-price a sent bid
 * (lines froze `snapshotLaborRate`). All parts NULL = "not broken down" —
 * never 0 (CLAUDE.md § Editing fields 6).
 */

export type LoadedParts = {
  baseWage: number;
  payrollTaxPct: number;
  workersCompPct: number;
  insurancePct: number;
  benefitsPct: number;
};

/** The parts as stored: decimal strings, any of them NULL. */
export type StoredParts = {
  baseWage: string | number | null;
  payrollTaxPct: string | number | null;
  workersCompPct: string | number | null;
  insurancePct: string | number | null;
  benefitsPct: string | number | null;
};

/** wage x (1 + taxes + comp + insurance + benefits), to the cent. */
export function loadedRate(p: LoadedParts): number {
  const burden =
    p.payrollTaxPct + p.workersCompPct + p.insurancePct + p.benefitsPct;
  return Math.round(p.baseWage * (1 + burden) * 100) / 100;
}

/** The parts as numbers, or null when the rate is not broken down. */
export function readParts(row: StoredParts): LoadedParts | null {
  if (row.baseWage === null || row.baseWage === undefined) return null;
  const n = (v: string | number | null) =>
    v === null || v === undefined ? 0 : Number(v);
  return {
    baseWage: Number(row.baseWage),
    payrollTaxPct: n(row.payrollTaxPct),
    workersCompPct: n(row.workersCompPct),
    insurancePct: n(row.insurancePct),
    benefitsPct: n(row.benefitsPct),
  };
}

/**
 * The owner-approved EXAMPLE burden (2026-10-07): payroll taxes 10% (FICA
 * 7.65% + unemployment ~2.35%), workers' comp 7% (electrical class),
 * insurance 4%, benefits 20% = 41%. A starting point a shop replaces.
 */
export const EXAMPLE_BURDEN = {
  payrollTaxPct: 0.1,
  workersCompPct: 0.07,
  insurancePct: 0.04,
  benefitsPct: 0.2,
} as const;

/**
 * The owner-approved EXAMPLE WAGES (2026-10-07), set ~30% above the BLS OEWS
 * national mean on purpose — "if wrong, better high than low". BLS May 2023
 * mean hourly wage: electricians $32.60, helpers--electricians $19.83
 * (bls.gov/oes/2023/may/oes472111.htm, oes473013.htm). Re-check against the
 * current release when these change. Keyed by the shipped role NAME
 * (server/seed/baselineLaborRates.ts).
 */
export const EXAMPLE_WAGES: Readonly<Record<string, number>> = {
  "Foreman/Master Electrician": 50,
  Journeyman: 42,
  Apprentice: 26,
  Helper: 24,
};
