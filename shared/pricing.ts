/**
 * Pricing engine — the single source of truth for how a bid price is computed.
 * See ASSEMBLIES_PLAN.md § PRICING FLOW.
 *
 *   1. Direct Cost = Materials + (Labor hours × modifiers, SUMMED not compounded) × Labor Rate
 *      where Labor hours = the assembly's material-driven hours PLUS its own
 *      overhead hours (setup, testing, cleanup, trip), added before modifiers
 *   2. + Overhead  — optional, percentage or flat, applied BEFORE profit
 *   3. + Profit    — Markup % or Target Margin %, always an explicit choice
 *   4. = Final Bid Price
 *
 * Deliberately pure: no database, no I/O, no framework. Everything here is
 * directly testable, and every function returns a breakdown rather than a bare
 * number so the UI can always show its work (never a black-box price).
 *
 * ── Money handling ───────────────────────────────────────────────────────────
 * All internal arithmetic runs on integer CENTS, never decimal dollars. Decimal
 * amounts like 8.43 cannot be represented exactly in binary floating point, so
 * summing them accumulates error — across a few hundred takeoff lines that drift
 * becomes real money. Integers cannot drift.
 *
 * Public functions accept and return dollars for ergonomics. Every returned
 * amount is an exact whole-cent value, and the underlying cent values of a
 * breakdown sum exactly to its total.
 *
 * One caveat when consuming this: adding two returned *dollar* figures in JS can
 * still produce a trailing-digit artifact (8.43 + 2.45 === 10.879999999999999).
 * That is a property of JS floats, not a reconciliation error. Compare sums with
 * `roundMoney()`, or format for display, rather than using raw `===`.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** One material line inside an assembly recipe. */
export type MaterialLine = {
  /** Cost for a single unit of sale (each / foot / box). */
  costPerUnit: number;
  /** How many units of sale this recipe uses. */
  qty: number;
};

/**
 * A modifier as applied to a line item. `laborAdjustmentPct` is fractional:
 * 0.15 means +15% labor hours, -0.10 means -10%.
 */
export type AppliedModifier = {
  name?: string;
  laborAdjustmentPct: number;
};

/** Overhead is optional; when on it is either a percentage or a flat amount. */
export type OverheadSetting =
  | { enabled: false }
  | {
      enabled: true;
      mode: "percentage" | "flat";
      /** Fraction when percentage (0.10 = 10%); currency amount when flat. */
      value: number;
    };

/**
 * Profit method is never inferred — the caller must say which one.
 *   markup: price = cost × (1 + value)
 *   margin: price = cost ÷ (1 − value)   ← yields a HIGHER price than markup
 */
export type ProfitSetting = {
  method: "markup" | "margin";
  /** Fraction: 0.20 = 20%. */
  value: number;
};

export type LineItemInput = {
  materials: MaterialLine[];
  baseLaborHours: number;
  /**
   * The assembly's own overhead hours — setup, testing, cleanup, trip time.
   *
   * Added to `baseLaborHours` BEFORE modifiers, as its own step. Defaults to 0.
   * See addAssemblyOverheadHours for why it is not a modifier and not the
   * productivity factor.
   */
  overheadLaborHours?: number;
  /** Only the modifiers actually switched on for this line. */
  modifiers?: AppliedModifier[];
  /** Hourly cost of the labor role assigned to this line. */
  laborRate: number;
  /** How many of this assembly. Defaults to 1. */
  quantity?: number;
  /**
   * Company-wide productivity adjustment, as a fraction (0.10 = +10%).
   *
   * Applied AFTER modifiers as its own step, never added to them — see
   * applyProductivityToHours. Defaults to 0, meaning no adjustment.
   */
  productivityPct?: number;
};

export type LineItemBreakdown = {
  materialCost: number;
  /** The assembly's overhead hours as applied. 0 when unset. */
  overheadLaborHours: number;
  /**
   * Material hours + overhead hours, before any modifier or productivity step.
   *
   * Returned for the same reason `hoursAfterModifiers` is: the breakdown shows
   * its work. An estimator has to be able to see that 0.55 h of device work
   * plus 0.25 h of setup is what the percentages were then applied to, rather
   * than a single 0.80 that appears from nowhere.
   */
  baseHoursWithOverhead: number;
  /** Summed modifier percentage, e.g. 0.25 for +25%. */
  modifierPct: number;
  /** The productivity factor applied, as a fraction. 0 when unset. */
  productivityPct: number;
  /**
   * Hours after modifiers but BEFORE productivity.
   *
   * Returned so a breakdown can show the two adjustments as two steps. Blending
   * them into one number is exactly what keeping them separate is meant to
   * prevent: an estimator has to be able to see that the job's conditions added
   * 32% and the company's calibration added another 5%, not that "something"
   * added 38.6%.
   */
  hoursAfterModifiers: number;
  /** Base hours after modifiers AND productivity, before quantity. */
  adjustedLaborHours: number;
  /** Total hours including quantity. */
  totalLaborHours: number;
  laborCost: number;
  directCost: number;
  /**
   * True when the adjustments drove hours below zero and they were clamped.
   * Surface this — it almost always means something is misconfigured.
   */
  laborHoursClamped: boolean;
};

export type BidPriceInput = {
  directCost: number;
  overhead?: OverheadSetting;
  profit: ProfitSetting;
};

export type BidPriceBreakdown = {
  directCost: number;
  overheadAmount: number;
  /** directCost + overheadAmount — the basis profit is applied to. */
  costWithOverhead: number;
  profitAmount: number;
  finalPrice: number;
  /** Echoed back so a saved estimate records how profit was calculated. */
  profitMethod: ProfitSetting["method"];
};

// ─── Money primitives ─────────────────────────────────────────────────────────

/** Largest margin we accept. At 1.0 the formula divides by zero. */
const MAX_MARGIN = 0.99;

function assertFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number, received: ${value}`);
  }
}

/**
 * Round to a whole number, half away from zero.
 *
 * Two corrections over a bare `Math.round`:
 *  • Sign is handled explicitly — `Math.round(-0.5)` is -0, which biases
 *    negative amounts toward zero.
 *  • The nudge is RELATIVE to magnitude. `Number.EPSILON` is the gap between
 *    representable doubles at 1.0; at 100 the gap is ~100× wider, so a flat
 *    epsilon is far too small to correct anything. Scaling it means $1.005 —
 *    actually stored as 1.00499999999999989 — still rounds up to $1.01, which
 *    is what someone who typed that number expects.
 */
function roundToInt(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * Math.round(abs + abs * Number.EPSILON * 4);
}

/** Dollars → exact integer cents. */
export function toCents(dollars: number): number {
  assertFinite(dollars, "Amount");
  return roundToInt(dollars * 100);
}

/** Integer cents → dollars. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Snap a dollar amount to the nearest whole cent. */
export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

// ─── Company defaults vs per-bid overrides ────────────────────────────────────

/** Overhead and profit as stored at company level. Profit method is always set. */
export type CompanyPricingDefaults = {
  overheadEnabled: boolean;
  overheadMode: "percentage" | "flat";
  overheadValue: number;
  profitMethod: ProfitSetting["method"];
  profitValue: number;
  /** Company-wide labor adjustment as a fraction. 0 = no adjustment. */
  productivityPct: number;
};

/**
 * A bid's overrides. NULL/undefined on the GROUP KEY means "inherit".
 *
 *   overheadEnabled == null → inherit the whole overhead group
 *   profitMethod    == null → inherit the whole profit group
 */
export type BidPricingOverrides = {
  overheadEnabled?: boolean | null;
  overheadMode?: "percentage" | "flat" | null;
  overheadValue?: number | null;
  profitMethod?: ProfitSetting["method"] | null;
  profitValue?: number | null;
  /** NULL/undefined inherits the company productivity factor. */
  productivityPct?: number | null;
};

export type ResolvedPricingSettings = {
  overhead: OverheadSetting;
  profit: ProfitSetting;
  /** The productivity factor this bid actually prices with. */
  productivityPct: number;
  /** Which level each group came from — the UI says "company default" or "this bid". */
  overheadSource: "company" | "bid";
  profitSource: "company" | "bid";
  productivitySource: "company" | "bid";
};

/**
 * Work out what a bid actually prices with.
 *
 * Resolution is per GROUP, never per field. A bid that overrides its profit
 * takes both the method and the value from itself; it can never end up with its
 * own percentage applied under the company's method, which would silently
 * re-price the bid the day someone changes the company setting.
 */
export function resolveBidPricingSettings(
  company: CompanyPricingDefaults,
  overrides: BidPricingOverrides = {}
): ResolvedPricingSettings {
  const overridesOverhead =
    overrides.overheadEnabled !== null &&
    overrides.overheadEnabled !== undefined;
  const overridesProfit =
    overrides.profitMethod !== null && overrides.profitMethod !== undefined;

  const overhead: OverheadSetting = overridesOverhead
    ? overrides.overheadEnabled
      ? {
          enabled: true,
          mode: overrides.overheadMode ?? company.overheadMode,
          value: overrides.overheadValue ?? 0,
        }
      : { enabled: false }
    : company.overheadEnabled
      ? {
          enabled: true,
          mode: company.overheadMode,
          value: company.overheadValue,
        }
      : { enabled: false };

  const profit: ProfitSetting = overridesProfit
    ? { method: overrides.profitMethod!, value: overrides.profitValue ?? 0 }
    : { method: company.profitMethod, value: company.profitValue };

  // Productivity resolves on its own, not as part of a group: unlike overhead
  // and profit there is no second field it could be half-overridden against.
  const overridesProductivity =
    overrides.productivityPct !== null &&
    overrides.productivityPct !== undefined;
  const productivityPct = overridesProductivity
    ? overrides.productivityPct!
    : company.productivityPct;

  return {
    overhead,
    profit,
    productivityPct,
    overheadSource: overridesOverhead ? "bid" : "company",
    profitSource: overridesProfit ? "bid" : "company",
    productivitySource: overridesProductivity ? "bid" : "company",
  };
}

// ─── Labor rates ──────────────────────────────────────────────────────────────

/** The conventional full-time year: 40 h × 52 weeks. A starting point, not a fact. */
export const DEFAULT_ANNUAL_HOURS = 2080;

/**
 * Effective hourly rate for a salaried role, for use in bidding and overhead.
 *
 * `annualHours` is deliberately an input rather than a constant. 2,080 is the
 * payroll year, but a shop that loses time to travel, training and shop work
 * may only bill 1,850 — and billing a $60k project manager at 2,080 hours
 * quietly under-recovers their cost on every job. Whoever knows the real number
 * should be able to type it in.
 *
 * Rounds to whole cents: an unrounded rate multiplied across hundreds of takeoff
 * hours drifts, and the rate is a figure people read and sanity-check.
 */
export function effectiveHourlyRate(
  annualSalary: number,
  annualHours: number
): number {
  assertFinite(annualSalary, "annualSalary");
  assertFinite(annualHours, "annualHours");

  if (annualSalary < 0) {
    throw new Error(
      `annualSalary cannot be negative, received: ${annualSalary}`
    );
  }
  // Zero hours has no meaningful rate — it is a division by zero, not "free".
  if (annualHours <= 0) {
    throw new Error(
      `annualHours must be greater than zero, received: ${annualHours}`
    );
  }

  return fromCents(roundToInt(toCents(annualSalary) / annualHours));
}

// ─── Step 1 — Direct Cost ─────────────────────────────────────────────────────

/**
 * Sum modifier percentages. They ADD, they do not compound: +15% and +10%
 * together are +25%, NOT 1.15 × 1.10 = +26.5%. This is a deliberate product
 * decision (ASSEMBLIES_PLAN.md § DATA MODEL) — do not "fix" it to compound.
 */
export function sumModifiers(modifiers: AppliedModifier[] = []): number {
  let total = 0;
  for (const modifier of modifiers) {
    assertFinite(modifier.laborAdjustmentPct, "Modifier laborAdjustmentPct");
    total += modifier.laborAdjustmentPct;
  }
  return total;
}

/**
 * The productivity factor: a company-wide adjustment to every labor hour.
 *
 * ── A separate step, deliberately not a modifier ─────────────────────────────
 * Job-condition modifiers ADD to each other — working at height +12% and
 * overtime +20% is +32%, not 1.12 × 1.20. The productivity factor does NOT join
 * that sum. It is applied afterwards, to the already-adjusted hours, as its own
 * multiplication:
 *
 *   hours × (1 + summed modifiers) × (1 + productivity)
 *
 * The distinction is real, not cosmetic. Modifiers describe THIS job — this
 * height, this shift, this access. The productivity factor describes the crew
 * and the company: how the shop's actual output compares to the book hours the
 * assemblies were written against. Folding it into the modifier total would let
 * a company-wide calibration be mistaken for a condition of one job, and would
 * make it vanish into a single blended percentage nobody could take apart.
 *
 * ── Non-destructive ──────────────────────────────────────────────────────────
 * Applied at calculation time only. It never writes back to an assembly, a line
 * or a snapshot — the stored hours stay the hours somebody entered, and turning
 * the factor off returns every number to exactly where it was.
 *
 * 0 means no adjustment, which is what it ships at. Positive means the work
 * takes longer than book; negative means the crew beats it.
 */
export function applyProductivityToHours(
  hours: number,
  productivityPct = 0
): { hours: number; clamped: boolean } {
  assertFinite(hours, "hours");
  assertFinite(productivityPct, "productivityPct");

  const raw = hours * (1 + productivityPct);
  // Same floor as modifiers: below −100% the arithmetic goes negative, and no
  // adjustment makes a job take less than no time.
  const clamped = raw < 0;
  return { hours: clamped ? 0 : raw, clamped };
}

/**
 * An assembly's own overhead hours: the time it takes that no material line
 * accounts for — laying it out, testing it, cleaning up, the trip.
 *
 * ── The first step, and additive ─────────────────────────────────────────────
 * These hours join the material-driven hours to form the base the rest of the
 * pipeline works on:
 *
 *   (baseLaborHours + overheadLaborHours) × (1 + modifiers) × (1 + productivity)
 *
 * They are added first rather than bolted on at the end deliberately. Job
 * conditions apply to setup and testing exactly as they apply to the work
 * itself — a panel change on a lift at height takes longer to lay out too — so
 * the overhead hours have to be inside what the modifiers multiply, not beside
 * it.
 *
 * ── Three layers, and they must not be confused ──────────────────────────────
 * This is the one people mix up with the productivity factor, so, plainly:
 *
 *   overhead hours      flat HOURS, set per assembly, added first
 *   modifiers           PERCENTAGES describing this job, summed, applied next
 *   productivity factor a PERCENTAGE describing the company's crews, last
 *
 * They differ in unit, in scope and in position. Overhead hours belong to one
 * assembly and are a fixed quantity of time: 20 minutes of trip charge is 20
 * minutes whether the crew is fast or slow. The productivity factor belongs to
 * the company and scales everything, including these hours — which is correct,
 * because a crew that beats book hours beats them on cleanup as well.
 *
 * Adding overhead as a modifier would be wrong in unit (hours are not a
 * percentage). Adding it after productivity would be wrong in meaning (it would
 * stop being affected by how the crew actually performs). Neither is a
 * refactor to make later.
 *
 * Clamped at zero for the same reason the other steps are — see below.
 */
export function addAssemblyOverheadHours(
  baseLaborHours: number,
  overheadLaborHours = 0
): number {
  assertFinite(baseLaborHours, "baseLaborHours");
  assertFinite(overheadLaborHours, "overheadLaborHours");
  if (baseLaborHours < 0) {
    throw new Error(
      `baseLaborHours cannot be negative, received: ${baseLaborHours}`
    );
  }
  // Negative overhead is not "a fast assembly", it is a data-entry error, and
  // letting it through would quietly discount the work the recipe describes.
  if (overheadLaborHours < 0) {
    throw new Error(
      `overheadLaborHours cannot be negative, received: ${overheadLaborHours}`
    );
  }
  return baseLaborHours + overheadLaborHours;
}

/**
 * Apply summed modifiers to base labor hours.
 * Clamps at zero — no amount of negative modifiers makes a job take less than
 * no time. The caller is told via `clamped` so it can warn.
 */
export function applyModifiersToHours(
  baseLaborHours: number,
  modifiers: AppliedModifier[] = []
): { hours: number; modifierPct: number; clamped: boolean } {
  assertFinite(baseLaborHours, "baseLaborHours");
  if (baseLaborHours < 0) {
    throw new Error(
      `baseLaborHours cannot be negative, received: ${baseLaborHours}`
    );
  }

  const modifierPct = sumModifiers(modifiers);
  const raw = baseLaborHours * (1 + modifierPct);
  const clamped = raw < 0;

  return { hours: clamped ? 0 : raw, modifierPct, clamped };
}

/** Material cost in integer cents. Each line rounds so line items reconcile. */
function materialCostCents(materials: MaterialLine[] = []): number {
  let cents = 0;
  for (const line of materials) {
    assertFinite(line.costPerUnit, "Material costPerUnit");
    assertFinite(line.qty, "Material qty");
    cents += toCents(line.costPerUnit * line.qty);
  }
  return cents;
}

export function calculateMaterialCost(materials: MaterialLine[] = []): number {
  return fromCents(materialCostCents(materials));
}

/** Step 1 for a single assembly line item. */
export function calculateLineItem(input: LineItemInput): LineItemBreakdown {
  const quantity = input.quantity ?? 1;
  assertFinite(quantity, "quantity");
  assertFinite(input.laborRate, "laborRate");
  if (quantity < 0)
    throw new Error(`quantity cannot be negative, received: ${quantity}`);
  if (input.laborRate < 0)
    throw new Error(
      `laborRate cannot be negative, received: ${input.laborRate}`
    );

  /*
    Per-unit material rounds first, so a single unit's price is what the user
    sees on the recipe, then scales by quantity — AND ROUNDS AGAIN, because a
    line is a money amount somebody reads.

    ── The penny this closes, found on a real bid 2026-09-24 ─────────────────
    It used to stop at the multiplication, so a line could hold $40.0032 while
    showing $40.00. Nothing was wrong with that number in isolation. What was
    wrong is that the bid then added it up TWICE, two different ways:

      Materials     summed the raw line values          -> $192.2376 -> $192.24
      Direct cost   summed each line ROUNDED, in cents  -> $192.23

    A cent, on a screen where the parts are shown above the whole, so the only
    thing a reader can conclude is that the app cannot add. The rounding is
    done once, here, at the line — which is the level the number is displayed
    and billed at — so every total downstream is a sum of the same integers
    and `materials + labor === direct cost` exactly. See `sumLineCosts`.

    Rounding at the LINE rather than at each total is what makes that true for
    any set of lines: rounding two components separately and adding them can
    still miss the rounded sum by a cent (10.004 + 10.004 is 20.00 either side
    but 20.008 rounds to 20.01), and no amount of care at the total fixes it.
  */
  const materialCents = roundToInt(
    materialCostCents(input.materials) * quantity
  );

  // Step one, before anything multiplies: the assembly's own overhead hours
  // join its material-driven hours. See addAssemblyOverheadHours — this is
  // additive and per-assembly, and is not related to the productivity factor
  // applied two steps below.
  const overheadLaborHours = input.overheadLaborHours ?? 0;
  const baseHoursWithOverhead = addAssemblyOverheadHours(
    input.baseLaborHours,
    overheadLaborHours
  );

  const {
    hours: afterModifiers,
    modifierPct,
    clamped,
  } = applyModifiersToHours(baseHoursWithOverhead, input.modifiers);

  // Second, separate step — see applyProductivityToHours. Never summed into
  // modifierPct, and both figures are returned so a breakdown can show the two
  // adjustments apart rather than as one blended number.
  const productivityPct = input.productivityPct ?? 0;
  const { hours, clamped: productivityClamped } = applyProductivityToHours(
    afterModifiers,
    productivityPct
  );

  const totalLaborHours = hours * quantity;
  const laborCents = toCents(totalLaborHours * input.laborRate);

  return {
    materialCost: fromCents(materialCents),
    overheadLaborHours,
    baseHoursWithOverhead,
    modifierPct,
    productivityPct,
    hoursAfterModifiers: afterModifiers,
    adjustedLaborHours: hours,
    totalLaborHours,
    laborCost: fromCents(laborCents),
    directCost: fromCents(materialCents + laborCents),
    laborHoursClamped: clamped || productivityClamped,
  };
}

/** Roll several line items into one direct cost. Sums in cents — no drift. */
export function sumDirectCost(lines: LineItemBreakdown[]): number {
  return sumLineCosts(lines).directCost;
}

/**
 * THE THREE TOTALS, ADDED UP ONE WAY, so the parts equal the whole.
 *
 * ── Why this is one function and not three reduces ─────────────────────────
 * The bid screen shows Materials and Labor above Direct cost, so a reader can
 * check the app's arithmetic at a glance — and on 2026-09-24 they could, and
 * it was out by a cent. `sumDirectCost` summed each line in integer cents
 * while the two components above it were plain float reduces over unrounded
 * line values, so the parts and the whole were computed by two different
 * rules and disagreed whenever a line landed on a fraction of a cent.
 *
 * Every line's material and labor are now whole cents at the line
 * (`calculateLineItem`), so all three of these are sums of the same integers
 * and `materialCost + laborCost === directCost` holds exactly, for any lines.
 * `server/pricing.test.ts` asserts that identity rather than three numbers,
 * because the identity is the thing that must not break.
 */
export function sumLineCosts(lines: LineItemBreakdown[]): {
  materialCost: number;
  laborCost: number;
  directCost: number;
} {
  let materialCents = 0;
  let laborCents = 0;
  for (const line of lines) {
    materialCents += toCents(line.materialCost);
    laborCents += toCents(line.laborCost);
  }
  return {
    materialCost: fromCents(materialCents),
    laborCost: fromCents(laborCents),
    directCost: fromCents(materialCents + laborCents),
  };
}

// ─── Step 2 — Overhead ────────────────────────────────────────────────────────

function overheadCents(costCents: number, overhead?: OverheadSetting): number {
  if (!overhead || !overhead.enabled) return 0;

  assertFinite(overhead.value, "Overhead value");
  if (overhead.value < 0) {
    throw new Error(
      `Overhead value cannot be negative, received: ${overhead.value}`
    );
  }

  return overhead.mode === "flat"
    ? toCents(overhead.value)
    : roundToInt(costCents * overhead.value);
}

/** Overhead amount for a given cost. Returns 0 when disabled. */
export function calculateOverhead(
  cost: number,
  overhead?: OverheadSetting
): number {
  return fromCents(overheadCents(toCents(cost), overhead));
}

// ─── Step 3 — Profit ──────────────────────────────────────────────────────────

function profitCents(costCents: number, profit: ProfitSetting): number {
  assertFinite(profit.value, "Profit value");

  if (profit.value < 0) {
    throw new Error(
      `Profit value cannot be negative, received: ${profit.value}`
    );
  }

  if (profit.method === "markup") {
    return roundToInt(costCents * (1 + profit.value)) - costCents;
  }

  if (profit.method === "margin") {
    if (profit.value > MAX_MARGIN) {
      throw new Error(
        `Target margin must be below ${MAX_MARGIN * 100}% — a margin of 100% or more has no finite price. Received: ${profit.value * 100}%`
      );
    }
    return roundToInt(costCents / (1 - profit.value)) - costCents;
  }

  throw new Error(
    `Unknown profit method: ${(profit as ProfitSetting).method}. Must be "markup" or "margin".`
  );
}

/**
 * Profit amount for a given cost.
 *
 * The two methods are NOT interchangeable and must never be silently swapped:
 * on $100 at 20%, markup yields $120 while target margin yields $125.
 */
export function calculateProfit(cost: number, profit: ProfitSetting): number {
  return fromCents(profitCents(toCents(cost), profit));
}

// ─── Step 4 — Final Bid Price ─────────────────────────────────────────────────

/**
 * Full pipeline: direct cost → overhead → profit → final price.
 * Overhead is always applied before profit, so profit is earned on the
 * overhead-loaded cost, not the bare direct cost.
 */
export function calculateBidPrice(input: BidPriceInput): BidPriceBreakdown {
  assertFinite(input.directCost, "directCost");
  if (input.directCost < 0) {
    throw new Error(
      `directCost cannot be negative, received: ${input.directCost}`
    );
  }

  const directCents = toCents(input.directCost);
  const ohCents = overheadCents(directCents, input.overhead);
  const withOverheadCents = directCents + ohCents;
  const pCents = profitCents(withOverheadCents, input.profit);

  return {
    directCost: fromCents(directCents),
    overheadAmount: fromCents(ohCents),
    costWithOverhead: fromCents(withOverheadCents),
    profitAmount: fromCents(pCents),
    // Integer cents throughout, so this total is exact by construction.
    finalPrice: fromCents(withOverheadCents + pCents),
    profitMethod: input.profit.method,
  };
}

/** Convenience: line items straight through to a final price. */
export function priceLineItems(
  lines: LineItemInput[],
  settings: { overhead?: OverheadSetting; profit: ProfitSetting }
): BidPriceBreakdown & { lines: LineItemBreakdown[] } {
  const breakdowns = lines.map(calculateLineItem);
  const bid = calculateBidPrice({
    directCost: sumDirectCost(breakdowns),
    overhead: settings.overhead,
    profit: settings.profit,
  });
  return { ...bid, lines: breakdowns };
}
