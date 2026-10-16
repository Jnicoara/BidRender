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

// ─── A starter rate edit: the part AND the rate it makes, together ───────────

export const RATE_PARTS = [
  "baseWage",
  "payrollTaxPct",
  "workersCompPct",
  "insurancePct",
  "benefitsPct",
] as const;
export type RatePart = (typeof RATE_PARTS)[number];

/**
 * The fields ONE edit to a shipped labor rate must write, in one batch
 * (references/starter-offers-plan.md; Track B 2026-10-15):
 *
 *   broken down  a part changes, and `hourlyCost` is re-made from the parts
 *                by `loadedRate` — the same arithmetic the company's own
 *                editor uses. Typing the rate itself is refused: it would
 *                leave the rate disagreeing with its own breakdown.
 *   not broken   the hourly rate itself.
 *   salaried     the salary or the hours a year (the hourly figure is
 *                derived on read, `hourlyCostOf`).
 *
 * Values arrive as the server stores them: parts as FRACTIONS (0.10 = 10%).
 */
export function rateEditFields(
  row: StoredParts & { rateType: string },
  field: string,
  value: number
): Array<{ field: string; value: string | number }> | { refused: string } {
  if (!Number.isFinite(value) || value < 0)
    return { refused: "Must be a number of 0 or more." };
  if (row.rateType === "salary") {
    if (field === "annualSalary" || field === "annualHours")
      return [{ field, value }];
    return { refused: "A salaried role changes by its salary or its hours." };
  }
  const parts = readParts(row);
  if (parts) {
    if (!(RATE_PARTS as readonly string[]).includes(field))
      return {
        refused:
          "This rate is its wage plus burden. Change the wage or a burden part; the rate follows.",
      };
    if (field === "baseWage" && value <= 0)
      return { refused: "The wage must be above 0." };
    const next = { ...parts, [field]: value } as LoadedParts;
    return [
      { field, value },
      { field: "hourlyCost", value: loadedRate(next).toFixed(4) },
    ];
  }
  if (field === "hourlyCost") return [{ field, value }];
  return {
    refused: "This rate isn't broken into wage and burden; change the rate.",
  };
}
