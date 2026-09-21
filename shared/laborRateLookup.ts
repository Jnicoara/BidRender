/**
 * Turning an assembly's `laborRateId` into an hourly cost.
 *
 * Every consumer must go through here rather than doing
 * `rates.find(r => r.id === laborRateId)`, for one non-obvious reason:
 *
 * ── Forks move the id out from under the reference ───────────────────────────
 * An assembly stores the id of the role it uses. Editing a SHIPPED starter role
 * does not change that row — it forks, producing a NEW row with a new id, and
 * the fork then supersedes the starter in the user's library. The assembly is
 * still pointing at the starter's id, which the merged library view now hides.
 *
 * A plain `find` therefore returns nothing, the rate reads as 0, and every
 * assembly using that role silently prices its labor at nothing — the moment
 * the user edits the rate. Which is exactly what someone does when they adjust
 * a rate from the Assembly Builder.
 *
 * So resolution follows the supersede chain: look for the id directly, and
 * failing that, for the user's fork OF that id.
 */
import { effectiveHourlyRate } from "./pricing";
import { resolveForkedRow } from "./forkedRows";

/** The subset of a labor rate row needed to resolve and price it. */
export type ResolvableLaborRate = {
  id: number;
  baselineId: number | null;
  rateType: "hourly" | "salary";
  hourlyCost: string | number;
  annualSalary: string | number | null;
  annualHours: string | number | null;
};

/**
 * The rate an assembly means by `laborRateId`, following a fork if one exists.
 *
 * Returns undefined when the role was never set, or has been removed outright.
 */
export function resolveLaborRate<T extends ResolvableLaborRate>(
  rates: T[],
  laborRateId: number | null | undefined
): T | undefined {
  // Delegates so the resolvers for every forkable thing cannot drift apart.
  // This one was written first and the generic was lifted out of it.
  return resolveForkedRow(rates, laborRateId);
}

/**
 * What one hour of this role costs.
 *
 * Hourly roles carry their rate directly. Salaried roles derive it from the raw
 * salary and working hours through the shared pricing engine, so this figure
 * always agrees with the Labor Rates screen. A salary with no usable hours
 * prices at 0 rather than throwing — the row is still shown, flagged, and
 * fixable, which beats a crash on a screen full of other numbers.
 */
export function hourlyCostOf(rate: ResolvableLaborRate | undefined): number {
  if (!rate) return 0;
  if (rate.rateType === "hourly") return Number(rate.hourlyCost) || 0;

  const salary = Number(rate.annualSalary ?? 0);
  const hours = Number(rate.annualHours ?? 0);
  if (!(hours > 0)) return 0;

  try {
    return effectiveHourlyRate(salary, hours);
  } catch {
    return 0;
  }
}

/** Convenience: resolve and price in one step. */
export function hourlyCostFor<T extends ResolvableLaborRate>(
  rates: T[],
  laborRateId: number | null | undefined
): number {
  return hourlyCostOf(resolveLaborRate(rates, laborRateId));
}
