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

import {
  hourlyCostOf,
  resolveLaborRate,
  type ResolvableLaborRate,
} from "./laborRateLookup";

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

// ─── A bid on a wage set: what each classification costs, beside the role ───

/** A role as the comparison needs it (`labor_rates`, fractions). */
export type RoleForWage = ResolvableLaborRate & {
  name: string;
  chargeRate: string | number | null;
  payrollTaxPct: string | number | null;
  workersCompPct: string | number | null;
  insurancePct: string | number | null;
};

export type BidWageRow = {
  label: string;
  classification: WageClassification;
  /** The role this row stands in for, resolved through its fork. */
  roleName: string | null;
  /** Loaded prevailing cost per hour this row costs at on this bid. */
  prevailingCost: number | null;
  /** What the role costs on the Labor rates screen — what lines price at. */
  roleCost: number | null;
  warnings: string[];
};

const dollars = (n: number) => `$${n.toFixed(2)}`;

function burdenOf(role: RoleForWage): RoleBurden | null {
  const parts = [role.payrollTaxPct, role.workersCompPct, role.insurancePct];
  if (parts.every(p => p === null)) return null;
  return {
    payrollTaxPct: Number(role.payrollTaxPct ?? 0),
    workersCompPct: Number(role.workersCompPct ?? 0),
    insurancePct: Number(role.insurancePct ?? 0),
  };
}

/**
 * Each row of a bid's wage set: its prevailing cost on THIS bid (the
 * apprentice answer applied — unanswered is never yes), beside the cost the
 * role carries in the library, with what is wrong said in words. Moves no
 * number: lines keep the rate they froze (bid-methods-plan.md § 5 re-costing
 * is not built — morning-questions-b.md Q9).
 */
export function bidWageRows(
  set: Pick<WageSet, "rates" | "fringePaidAsCash">,
  roles: readonly RoleForWage[],
  registeredApprentices: boolean | null,
  method: "markup_rate" | "cost_op" | null
): BidWageRow[] {
  return set.rates.map(row => {
    const role =
      row.laborRateId === null
        ? undefined
        : resolveLaborRate([...roles], row.laborRateId);
    const warnings: string[] = [];
    let costRow: { baseWage: number; fringe: number } = row;
    if (row.classification === "apprentice" && registeredApprentices !== true) {
      const j = set.rates.find(r => r.classification === "journeyman");
      if (!j) {
        warnings.push(
          "No journeyman row in this set to cost apprentice hours at — add one."
        );
        return {
          label: row.label,
          classification: row.classification,
          roleName: role?.name ?? null,
          prevailingCost: null,
          roleCost: role ? hourlyCostOf(role) : null,
          warnings,
        };
      }
      costRow = j;
      warnings.push(
        registeredApprentices === null
          ? "Costs at the journeyman rate until you answer: will registered apprentices work this job?"
          : "Costs at the journeyman rate: no registered apprentices on this job."
      );
    }
    const { cost, burdenMissing } = prevailingLoadedCost(
      costRow,
      role ? burdenOf(role) : null,
      set.fringePaidAsCash
    );
    if (!role)
      warnings.push(
        "Not tied to a role — pick the role this row stands in for."
      );
    else {
      if (burdenMissing)
        warnings.push(
          `${role.name} has no payroll tax, comp or insurance broken down, so this is wage + fringe only.`
        );
      const roleCost = hourlyCostOf(role);
      if (roleCost < cost)
        warnings.push(
          `${role.name} is ${dollars(roleCost)}/h on your Labor rates — below this job's prevailing cost of ${dollars(cost)}/h. Lines on this bid are priced at ${dollars(roleCost)}/h.`
        );
      if (method === "markup_rate") {
        const charge =
          role.chargeRate === null ? null : Number(role.chargeRate);
        const below = chargeBelowCostWarning(charge, cost);
        if (below) warnings.push(below);
      }
    }
    return {
      label: row.label,
      classification: row.classification,
      roleName: role?.name ?? null,
      prevailingCost: cost,
      roleCost: role ? hourlyCostOf(role) : null,
      warnings,
    };
  });
}

/**
 * A Date as "YYYY-MM-DD" in the zone it is read in — the browser's day, for
 * the reminder. Never `toISOString().slice(0, 10)`, which is UTC: tomorrow
 * every American evening.
 */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
