/**
 * PREVAILING WAGE — what a labor hour COSTS on a job priced from a saved wage
 * set (references/bid-methods-plan.md § 5; owner picks Q11–Q15, 2026-10-12).
 *
 * A set is one wage determination: rows per classification (Journeyman,
 * Apprentice, Trainee…), each with a base wage and a fringe typed apart, and
 * the role it stands in for. Pure: the columns are drafts BM-M6..M8, M10.
 *
 *   loaded cost = base × (1 + payroll tax + comp + insurance)
 *               + fringe × (1 + payroll tax, ONLY when fringe is paid as cash)
 *
 * The role's BENEFITS % is not applied: the fringe IS the benefit (Q13).
 * Payroll tax reaches the fringe only on a set ticked "fringe paid as cash",
 * off by default (Q15). On Markup + charge rate the CHARGE stays the role's;
 * only cost moves (§ 2).
 */

export type WageClassification =
  | "journeyman"
  | "apprentice"
  | "trainee"
  | "other";

export type WageSetRate = {
  classification: WageClassification;
  label: string;
  /** The role this row stands in for. NULL = not tied to a role yet. */
  laborRateId: number | null;
  baseWage: number;
  fringe: number;
};

export type WageSet = {
  name: string;
  wageDeterminationNumber: string | null;
  /** "YYYY-MM-DD" — the day the determination was set. */
  dateSet: string;
  /** NULL = not ticked = the fringe is not taxed (Q15). */
  fringePaidAsCash: boolean | null;
  rates: readonly WageSetRate[];
};

/** The role's burden as FRACTIONS (0.10 = 10%), from `labor_rates`. */
export type RoleBurden = {
  payrollTaxPct: number;
  workersCompPct: number;
  insurancePct: number;
};

/**
 * One classification's loaded hourly cost, to the cent. A role with no
 * burden broken down passes NULL: the cost is then wage + fringe ONLY, and
 * `burdenMissing` says so, because that cost is low and the bid must say why.
 */
export function prevailingLoadedCost(
  rate: { baseWage: number; fringe: number },
  burden: RoleBurden | null,
  fringePaidAsCash: boolean | null
): { cost: number; burdenMissing: boolean } {
  for (const [label, v] of [
    ["baseWage", rate.baseWage],
    ["fringe", rate.fringe],
  ] as const)
    if (!Number.isFinite(v) || v < 0)
      throw new Error(`${label} must be 0 or more, received: ${v}`);
  const b = burden ?? { payrollTaxPct: 0, workersCompPct: 0, insurancePct: 0 };
  const onBase = b.payrollTaxPct + b.workersCompPct + b.insurancePct;
  const onFringe = fringePaidAsCash === true ? b.payrollTaxPct : 0;
  const cents =
    rate.baseWage * (1 + onBase) * 100 + rate.fringe * (1 + onFringe) * 100;
  return { cost: Math.round(cents) / 100, burdenMissing: burden === null };
}

/** Does this set make the bid ask "Will registered apprentices work this job?" */
export function asksAboutApprentices(set: Pick<WageSet, "rates">): boolean {
  return set.rates.some(r => r.classification === "apprentice");
}

export type SetRateForRole =
  | {
      kind: "set";
      row: WageSetRate;
      /**
       * An apprentice row was asked for and the bid has not said YES to
       * registered apprentices, so the journeyman row stands in (§ 5:
       * unanswered is never yes — the wrong guess underbids a public job).
       */
      apprenticeAtJourneyman: boolean;
    }
  /** The role has no row in this set: it keeps its own rate, and says so. */
  | { kind: "not-in-set" }
  /** An apprentice line with no journeyman row to stand in. Refuse to guess. */
  | { kind: "no-journeyman-row" };

/** Which row of a set a role's lines cost at on this bid. */
export function setRateForRole(
  set: Pick<WageSet, "rates">,
  laborRateId: number,
  registeredApprentices: boolean | null
): SetRateForRole {
  const row = set.rates.find(r => r.laborRateId === laborRateId);
  if (!row) return { kind: "not-in-set" };
  if (row.classification !== "apprentice" || registeredApprentices === true)
    return { kind: "set", row, apprenticeAtJourneyman: false };
  const journeyman = set.rates.find(r => r.classification === "journeyman");
  if (!journeyman) return { kind: "no-journeyman-row" };
  return { kind: "set", row: journeyman, apprenticeAtJourneyman: true };
}

// ─── Re-check reminder (Q12: a warning, never a block) ───────────────────────

const RECHECK_MONTHS = 6;

function parseDay(day: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`Expected YYYY-MM-DD, received: ${day}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** dateSet + 6 calendar months; the 31st of August is due the last day of February. */
export function recheckDue(dateSet: string): string {
  const { y, m, d } = parseDay(dateSet);
  const months = m - 1 + RECHECK_MONTHS;
  const year = y + Math.floor(months / 12);
  const month = (months % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

/** Whole calendar months from `dateSet` to `today` (both "YYYY-MM-DD"). */
export function monthsSince(dateSet: string, today: string): number {
  const a = parseDay(dateSet);
  const b = parseDay(today);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}

/**
 * The reminder on a set past its re-check date, or NULL while it is fresh.
 * `today` is passed in — nothing here reads the clock (CLAUDE.md § Scheduled
 * work: a 6-month rule cannot be tested by waiting 6 months).
 */
export function recheckReminder(
  set: Pick<WageSet, "name" | "wageDeterminationNumber" | "dateSet">,
  today: string
): string | null {
  if (today < recheckDue(set.dateSet)) return null;
  const months = monthsSince(set.dateSet, today);
  const what = set.wageDeterminationNumber
    ? `WD ${set.wageDeterminationNumber}`
    : set.name;
  return `Re-check ${what} — set ${months} month${months === 1 ? "" : "s"} ago`;
}

/** Before printing or sending: the same fact, as the warning (Q12). */
export function recheckPrintWarning(
  set: Pick<WageSet, "name" | "wageDeterminationNumber" | "dateSet">,
  today: string
): string | null {
  if (today < recheckDue(set.dateSet)) return null;
  const months = monthsSince(set.dateSet, today);
  return `This bid uses a wage determination set ${months} month${months === 1 ? "" : "s"} ago — check it before this goes out.`;
}

/** A charge rate below the job's prevailing cost: a warning, not a block (Q11). */
export function chargeBelowCostWarning(
  chargeRate: number | null,
  prevailingCost: number
): string | null {
  if (chargeRate === null || chargeRate >= prevailingCost) return null;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  return `Charge rate ${usd(chargeRate)}/h is below this job's prevailing wage cost ${usd(prevailingCost)}/h`;
}
