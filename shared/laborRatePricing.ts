/**
 * Which labor rates are still waiting for the contractor's real number.
 *
 * The material equivalent is `needsPricing` in ./materialPricing, and the rule
 * is deliberately identical — zero means "nobody has set this", because a
 * separate "has it been set" flag is a second fact that can drift out of step
 * with the first, and the direction it drifts is the dangerous one.
 *
 * ── Why this matters more than an unpriced material ──────────────────────────
 * An unpriced material understates one line of a bid. The labor rate multiplies
 * EVERY line at once: hours × rate is most of the number on most jobs, so a bid
 * built on a $0 rate is not slightly low, it is missing its entire labor cost
 * and still looks like a finished bid. That asymmetry is why the first-run flow
 * asks for a rate before it lets a new user near their first bid, and why this
 * check exists separately rather than being folded into the material one.
 */
import { needsPricing } from "./materialPricing";

/** The fields that decide whether a role has a real rate behind it. */
export type RateLike = {
  rateType: "hourly" | "salary";
  hourlyCost: string | number | null;
  annualSalary: string | number | null;
  annualHours: string | number | null;
  /**
   * TRUE on a shipped role carrying BidRidge's example loaded rate (0134).
   * Optional so a caller that never selected it is not broken — but every
   * screen that asks "has this shop set its rate?" must pass it.
   */
  isExampleRate?: boolean | null;
};

/**
 * True when this role still carries the shipped $0 and needs a real rate.
 *
 * Reads whichever field actually drives the rate: an hourly role is priced
 * straight off `hourlyCost`, while a salaried one derives from salary and
 * hours and ignores `hourlyCost` entirely. Checking the wrong one would call
 * every salaried role unrated forever, since their hourlyCost is always zero.
 *
 * Hours are checked too — not because they are a price, but because a salary
 * with no hours has no rate at all: `effectiveHourlyRate` treats zero hours as
 * a division by zero and refuses it rather than returning "free".
 */
export function needsRate(rate: RateLike): boolean {
  // An EXAMPLE rate is BidRidge's number, not the shop's (owner, 2026-10-07).
  // This line is the trap starter-vs-company-plan.md § 3b names: once shipped
  // rates are non-zero, "$0 = needs a rate" alone would call every
  // unconfigured shop "rate set", and the first-run prompt would stop asking.
  if (rate.isExampleRate) return true;
  if (rate.rateType === "salary") {
    if (needsPricing(rate.annualSalary)) return true;
    const hours = Number(rate.annualHours ?? 0);
    return !Number.isFinite(hours) || hours <= 0;
  }
  return needsPricing(rate.hourlyCost);
}

/** How many of these still need a rate. Drives the count on the filter. */
export function countNeedingRate(rates: RateLike[]): number {
  return rates.reduce((n, r) => (needsRate(r) ? n + 1 : n), 0);
}

// ─── The same $0, one layer down: a bid line ──────────────────────────────────

/**
 * A bid line, as far as unpriced labor is concerned.
 *
 * The two frozen fields that decide whether its hours cost anything. See
 * drizzle/schema.ts on `bid_line_items` for why they are snapshots.
 */
export type PricedLineLike = {
  snapshotLaborHours: string | number | null;
  snapshotLaborRate: string | number | null;
};

/**
 * True when this line carries real hours that are being priced at nothing.
 *
 * ── Why a line can end up like this ──────────────────────────────────────────
 * An assembly's `laborRateId` is nullable, and `set null` on delete, so an
 * assembly can carry hours with no role attached — six of the fourteen starter
 * assemblies do. Adding one to a bid freezes `snapshotLaborRate` at 0, and the
 * line then contributes its hours to the total and nothing at all to the price.
 *
 * ── Why it needs saying out loud ─────────────────────────────────────────────
 * This is the exact failure the whole $0 convention exists to prevent, arriving
 * by a route the convention did not cover. An unpriced MATERIAL is flagged on
 * the Materials screen and an unpriced RATE is flagged on Labor Rates, but a
 * bid built from a correctly-priced catalog and an unlinked assembly shows a
 * confident total with a chunk of labor silently missing — and unlike a $0
 * material, nothing on the bid looks unfinished.
 *
 * Hours are required, not just a zero rate: a line with no hours and no rate is
 * a materials-only line, which is ordinary and not worth a warning.
 */
export function lineHasUnpricedLabor(line: PricedLineLike): boolean {
  const hours = Number(line.snapshotLaborHours ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return false;
  return needsPricing(line.snapshotLaborRate);
}

/** How many lines on a bid are giving their labor away. */
export function countUnpricedLaborLines(lines: PricedLineLike[]): number {
  return lines.reduce((n, l) => (lineHasUnpricedLabor(l) ? n + 1 : n), 0);
}

// ─── A line frozen at a rate that has since changed ───────────────────────────

/**
 * An assembly line, as far as its frozen rate is concerned.
 *
 * Only ASSEMBLY lines can be compared: the line stores no role, and an
 * assembly names one (`laborRateId`), so "what would this line be priced at
 * today" has an answer. A hand-priced line's rate was picked on the line and
 * a run-type line's comes from its type; neither leaves anything to compare
 * against, so they are not in scope.
 */
export type RatedLineLike = PricedLineLike & {
  id: number;
  name: string;
  assemblyId: number | null;
};

export type StaleRateLine = {
  lineId: number;
  name: string;
  /** The rate frozen on the line when it was added. */
  frozenRate: number;
  /** What the assembly's role costs today. */
  currentRate: number;
};

/**
 * Lines priced at a labor rate that is no longer the rate of their role.
 *
 * ── The freeze is right; saying nothing about it is not ───────────────────────
 * A line keeps the rate it was added at, by design (R4: the library does not
 * move a bid behind the estimator's back). But the owner's own bid carried
 * seven lines at $68/hr against a Journeyman rate of $43/hr, and nothing on
 * the bid said so (`references/takeoff-spec.md` § 16). The $0 case was flagged
 * (`lineHasUnpricedLabor`); a stale NON-zero rate was not. This flags it and
 * changes nothing — re-pricing is a money-moving action and its own piece.
 *
 * Left out, each for a reason:
 *   - a line with no hours: its rate multiplies nothing;
 *   - a line frozen at $0: `lineHasUnpricedLabor` already says so, louder;
 *   - a role that is $0 now: "your rate went to $0" is the unrated-role
 *     warning's job, and flagging the line would send the estimator to the
 *     wrong fix;
 *   - a line whose assembly or role cannot be found (`currentRateFor` null).
 *
 * `currentRateFor` is given the line's stored assemblyId and answers through
 * the same fork-following lookup that prices a new line (`hourlyCostFor` over
 * the resolved assembly), so "current" means what adding it again would freeze.
 */
export function staleRateLines(
  lines: readonly RatedLineLike[],
  currentRateFor: (assemblyId: number) => number | null
): StaleRateLine[] {
  const stale: StaleRateLine[] = [];
  for (const line of lines) {
    if (line.assemblyId === null) continue;
    const hours = Number(line.snapshotLaborHours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const frozenRate = Number(line.snapshotLaborRate ?? 0);
    if (!Number.isFinite(frozenRate) || frozenRate <= 0) continue;
    const currentRate = currentRateFor(line.assemblyId);
    if (currentRate === null || !Number.isFinite(currentRate)) continue;
    if (currentRate <= 0) continue;
    // Rates are stored to 4 places; a difference under half a cent an hour
    // is rounding, not a changed rate.
    if (Math.abs(currentRate - frozenRate) < 0.005) continue;
    stale.push({ lineId: line.id, name: line.name, frozenRate, currentRate });
  }
  return stale;
}

/** Stale lines that share a frozen rate and a current rate. */
export type StaleRateGroup = {
  frozenRate: number;
  currentRate: number;
  /** How many LINES — two lines can share a name. */
  lineCount: number;
  /** Line names, in bid order, each once. */
  names: string[];
};

/**
 * One group per (frozen rate, current rate) pair, in first-appearance order,
 * so the bid says "4 lines use $68.00/hr" once rather than four times. A line
 * name appearing twice at the same rates is listed once.
 */
export function groupStaleRates(
  lines: readonly StaleRateLine[]
): StaleRateGroup[] {
  const groups: StaleRateGroup[] = [];
  for (const line of lines) {
    let group = groups.find(
      g =>
        g.frozenRate === line.frozenRate && g.currentRate === line.currentRate
    );
    if (!group) {
      group = {
        frozenRate: line.frozenRate,
        currentRate: line.currentRate,
        lineCount: 0,
        names: [],
      };
      groups.push(group);
    }
    group.lineCount += 1;
    if (!group.names.includes(line.name)) group.names.push(line.name);
  }
  return groups;
}

/**
 * Has this user set up labor at all?
 *
 * The first-run flow and the getting-started checklist both turn on this one
 * question, and they must agree: "set your labor rates" is complete as soon as
 * ONE role carries a real rate. Requiring all of them would block a sole
 * operator who only ever bills one rate, which is most new accounts.
 */
export function hasAnyRealRate(rates: RateLike[]): boolean {
  return rates.some(rate => !needsRate(rate));
}
