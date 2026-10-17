/**
 * BID METHODS — each bid prices ONE way (owner, 2026-10-12;
 * references/bid-methods-plan.md, all 16 picks approved).
 *
 *   A  "markup_rate"  Markup + charge rate: material at cost + material
 *                     markup, labor at each role's hourly CHARGE rate,
 *                     no overhead, no profit.
 *   B  "cost_op"      Cost + O&P: material and labor at cost, overhead and
 *                     profit on top, no material markup.
 *   —  null           The old math, from before methods existed: markup AND
 *                     overhead AND profit, stacked. Not a method anyone can
 *                     pick. Every existing bid is NULL, so none moves.
 *
 * ── No stacking is the TYPE, not a rule somebody remembers ───────────────────
 * `BidMethodInput` has one member per method, and each carries only its own
 * inputs: the Cost + O&P member has no markup field and the Markup + charge
 * rate member has no overhead or profit. Handing a markup to a Cost + O&P bid
 * does not compile (CLAUDE.md: prefer a forcing function).
 *
 * `methodInputs` is the one place a full set of company/bid settings is
 * narrowed to that shape, and `server/bidMethods.test.ts` checks the promise
 * from outside: a Cost + O&P bid at markup 0% and 50% gives one total, to
 * the cent, and a Markup + charge rate bid at overhead and profit 0% and 50%
 * gives one total.
 *
 * Every pricer returns the SAME breakdown shape the old math returns, with
 * the parts it does not use at 0, so everything downstream — sales tax, the
 * proposal's units, the accounting split — reads one shape.
 */
import {
  bottomOfBidRatio,
  calculateBidPrice,
  fromCents,
  toCents,
  type BidPriceBreakdown,
  type OverheadSetting,
  type ProfitSetting,
} from "./pricing";
import {
  priceExpenses,
  sumMarkedUpExpenses,
  type ExpenseLine,
} from "./bidExtras";

export type PricingMethod = "markup_rate" | "cost_op";

export const PRICING_METHODS: readonly PricingMethod[] = [
  "cost_op",
  "markup_rate",
];

/** What the method is called on screen. Plain words, both sides. */
export const PRICING_METHOD_LABEL: Record<PricingMethod, string> = {
  cost_op: "Cost + O&P",
  markup_rate: "Markup + charge rate",
};

/**
 * The method a NEW bid takes from its company. NULL — every company before
 * methods existed — is Cost + O&P, the owner's own default (plan § 7, Q1).
 * An EXISTING bid never goes through this: its NULL is the old math.
 */
export function methodForNewBid(
  companyMethod: PricingMethod | null | undefined
): PricingMethod {
  return companyMethod ?? "cost_op";
}

/**
 * What a company has said about how it bids, read from its settings
 * (`db.companyMethodState`). `usesMaterialMarkup` is a company % or any
 * markup rule in force (an accepted starter counts; an unaccepted one does
 * not, because it prices nothing).
 */
export type CompanyMethodState = {
  method: PricingMethod | null;
  usesMaterialMarkup: boolean;
};

/**
 * The method a NEW bid is created with — owner Q8, 2026-10-16.
 *
 * A company that never chose a method and HAS material markup set keeps the
 * old math (NULL) on its new bids until it answers "How do you bid?": Cost +
 * O&P drops material markup, so its next bid would otherwise price lower
 * than yesterday's with nobody asked (golden op-and-tax: $1,369.54 →
 * $1,349.40). A company with no markup loses nothing on Cost + O&P, so it
 * gets the owner's default straight away.
 */
export function newBidMethod(
  company: CompanyMethodState
): PricingMethod | null {
  if (company.method !== null) return company.method;
  return company.usesMaterialMarkup ? null : "cost_op";
}

/**
 * Whether the one-time "How do you bid?" question is still open: exactly
 * the companies whose new bids `newBidMethod` keeps on the old math.
 * Answering it (choosing a method) closes it for good.
 */
export function howYouBidOpen(company: CompanyMethodState): boolean {
  return newBidMethod(company) === null;
}

// ─── Per line ────────────────────────────────────────────────────────────────

/**
 * What a line is priced with under a method, from what was frozen on it.
 *
 *   old math       its frozen material markup; labor at cost
 *   Cost + O&P     NO material markup, whatever was frozen; labor at cost
 *   Markup + rate  its frozen material markup; labor at its frozen charge
 *                  rate, and NULL there is "Not priced" (owner Q5)
 *
 * Spread into `calculateLineItem`'s input. A line keeps its snapshot either
 * way; this decides which parts of it the method reads.
 */
export function lineMethodTerms(
  method: PricingMethod | null,
  frozen: { materialMarkupPct: number; chargeRate: number | null }
): { materialMarkupPct: number; chargeRate?: number | null } {
  if (method === "cost_op") return { materialMarkupPct: 0 };
  if (method === "markup_rate")
    return {
      materialMarkupPct: frozen.materialMarkupPct,
      chargeRate: frozen.chargeRate,
    };
  return { materialMarkupPct: frozen.materialMarkupPct };
}

// ─── Per bid ─────────────────────────────────────────────────────────────────

/** The line sums every method starts from (`sumLineCosts`, plus charges). */
export type BidSums = {
  /** Material + labor at cost, plus marked-up charges at cost. */
  directCost: number;
  /** Summed per-line material markup. Read by the old math and by A. */
  materialMarkup: number;
  /** Summed per-line labor markup (charge − cost). Read by A only. */
  laborMarkup: number;
};

/** Everything a bid COULD be priced with; each method reads its own part. */
export type BidMethodSettings = {
  overhead: OverheadSetting;
  profit: ProfitSetting;
  /**
   * The company's flat material markup, as a fraction. On A a "Marked up"
   * charge takes it, because A has no overhead or profit to give a charge
   * (owner Q6). NULL company setting = 0.
   */
  companyMaterialMarkupPct: number;
};

export type BidMethodInput =
  | {
      method: null;
      directCost: number;
      materialMarkup: number;
      overhead: OverheadSetting;
      profit: ProfitSetting;
    }
  | {
      method: "cost_op";
      directCost: number;
      overhead: OverheadSetting;
      profit: ProfitSetting;
    }
  | {
      method: "markup_rate";
      directCost: number;
      materialMarkup: number;
      laborMarkup: number;
      /** What the marked-up charges gain over their cost (`expenseMarkupOnA`). */
      expenseMarkup: number;
      /** The company % those charges were marked up by, echoed for billing. */
      chargeMarkupPct: number;
    };

/**
 * Narrow everything a bid could be priced with to what its method uses.
 * The only place the two meet, so the other method's numbers stop here.
 */
export function methodInputs(
  method: PricingMethod | null,
  sums: BidSums,
  settings: BidMethodSettings,
  expenses: readonly ExpenseLine[]
): BidMethodInput {
  if (method === "cost_op")
    return {
      method,
      directCost: sums.directCost,
      overhead: settings.overhead,
      profit: settings.profit,
    };
  if (method === "markup_rate")
    return {
      method,
      directCost: sums.directCost,
      materialMarkup: sums.materialMarkup,
      laborMarkup: sums.laborMarkup,
      expenseMarkup: expenseMarkupOnA(
        expenses,
        settings.companyMaterialMarkupPct
      ),
      chargeMarkupPct: settings.companyMaterialMarkupPct,
    };
  return {
    method: null,
    directCost: sums.directCost,
    materialMarkup: sums.materialMarkup,
    overhead: settings.overhead,
    profit: settings.profit,
  };
}

/** The breakdown every method returns: the old shape plus what A adds. */
export type MethodPriceBreakdown = BidPriceBreakdown & {
  method: PricingMethod | null;
  /** Labor at charge rate over labor at cost. 0 except on A. */
  laborMarkup: number;
  /** Marked-up charges' markup. 0 except on A (elsewhere O&P carry it). */
  expenseMarkup: number;
  /**
   * The factor a "Marked up" charge is billed at (`priceExpenses`). The old
   * math and Cost + O&P scale it by the bid's own overhead and profit — the
   * bottom-of-bid ratio; A has neither and gives it the company material
   * markup (owner Q6). On the breakdown so billing cannot pick the wrong one.
   */
  expenseUplift: number;
};

/** Price a bid by its method. Pure; integer cents throughout. */
export function priceBid(input: BidMethodInput): MethodPriceBreakdown {
  if (input.method === "markup_rate") {
    for (const [label, value] of [
      ["directCost", input.directCost],
      ["materialMarkup", input.materialMarkup],
      ["laborMarkup", input.laborMarkup],
      ["expenseMarkup", input.expenseMarkup],
    ] as const)
      if (!Number.isFinite(value))
        throw new Error(`${label} must be a finite number, received: ${value}`);
    if (input.directCost < 0)
      throw new Error(
        `directCost cannot be negative, received: ${input.directCost}`
      );
    if (input.materialMarkup < 0)
      throw new Error(
        `materialMarkup cannot be negative, received: ${input.materialMarkup}`
      );
    const directCents = toCents(input.directCost);
    // Everything A adds is a markup on a cost, and all of it is in
    // costWithMarkup: the bottom-of-bid ratio is then exactly 1, because A
    // puts nothing on the bottom of the bid.
    const withMarkupCents =
      directCents +
      toCents(input.materialMarkup) +
      toCents(input.laborMarkup) +
      toCents(input.expenseMarkup);
    return {
      method: "markup_rate",
      directCost: fromCents(directCents),
      materialMarkup: input.materialMarkup,
      laborMarkup: input.laborMarkup,
      expenseMarkup: input.expenseMarkup,
      expenseUplift: 1 + input.chargeMarkupPct,
      costWithMarkup: fromCents(withMarkupCents),
      overheadAmount: 0,
      costWithOverhead: fromCents(withMarkupCents),
      profitAmount: 0,
      finalPrice: fromCents(withMarkupCents),
      // Echoed for the shape; A has no profit, and nothing reads it there.
      profitMethod: "markup",
    };
  }
  const price = calculateBidPrice({
    directCost: input.directCost,
    // Cost + O&P has no markup to pass: the member has no such field.
    materialMarkup: input.method === null ? input.materialMarkup : 0,
    overhead: input.overhead,
    profit: input.profit,
  });
  return {
    ...price,
    method: input.method,
    laborMarkup: 0,
    expenseMarkup: 0,
    expenseUplift: bottomOfBidRatio(price),
  };
}

/**
 * What a marked-up charge gains on A: the company's material markup, per
 * charge, rounded the way `priceExpenses` rounds it — so the charge's billed
 * line and the bid total are the same integers (owner Q6).
 */
export function expenseMarkupOnA(
  expenses: readonly ExpenseLine[],
  companyMaterialMarkupPct: number
): number {
  const billed = priceExpenses(expenses, 1 + companyMaterialMarkupPct);
  return fromCents(
    toCents(billed.markedUpCharged) - toCents(sumMarkedUpExpenses(expenses))
  );
}

// ─── Effective margin (plan § 4) — display only, on every method ─────────────

/**
 * Margin and markup of the whole bid, before tax (owner Q10: charges are
 * cost, tax is not margin). `cost` is material at cost + labor at LOADED
 * COST + every charge at cost — never the charge rate. NULL when there is no
 * price to divide by, or no cost to divide by for the markup.
 */
export function effectiveMargin(input: { cost: number; price: number }): {
  margin: number | null;
  markup: number | null;
  cost: number;
  price: number;
} {
  const costCents = toCents(input.cost);
  const priceCents = toCents(input.price);
  const gain = priceCents - costCents;
  return {
    cost: fromCents(costCents),
    price: fromCents(priceCents),
    margin: priceCents > 0 ? gain / priceCents : null,
    markup: costCents > 0 ? gain / costCents : null,
  };
}

/**
 * "Effective margin 27.4% (markup 37.8%) · cost $18,420.00 → price
 * $25,380.00". Both percentages named, because margin and markup are the two
 * numbers people confuse (plan § 4). NULL when there is no price yet.
 */
export function effectiveMarginLine(
  m: ReturnType<typeof effectiveMargin>,
  formatMoney: (n: number) => string
): string | null {
  if (m.margin === null) return null;
  const one = (f: number) => `${(f * 100).toFixed(1)}%`;
  const markup = m.markup === null ? "" : ` (markup ${one(m.markup)})`;
  return `Effective margin ${one(m.margin)}${markup} · cost ${formatMoney(m.cost)} → price ${formatMoney(m.price)}`;
}

// ─── The "how bid" line (plan § 7) ───────────────────────────────────────────

const pct = (fraction: number) =>
  `${Number((fraction * 100).toFixed(2)).toString()}%`;

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function overheadWords(overhead: OverheadSetting): string | null {
  if (!overhead.enabled) return null;
  return overhead.mode === "flat"
    ? `overhead ${money(overhead.value)} flat`
    : `overhead ${pct(overhead.value)}`;
}

function profitWords(profit: ProfitSetting): string {
  return `profit ${pct(profit.value)} ${profit.method}`;
}

/**
 * One sentence under the bid total saying what the bid was priced WITH, so
 * a number on the screen can always be traced to the settings behind it.
 * Bid screen only — never the proposal.
 */
export function howBidLine(input: {
  method: PricingMethod | null;
  overhead: OverheadSetting;
  profit: ProfitSetting;
  /** The bid's summed material markup, dollars. Says whether any applied. */
  materialMarkup: number;
  /**
   * On A: how material is marked up ("by rule (brackets)", "25%"), and each
   * role's charge rate. Unused on the other two.
   */
  markupWords?: string;
  chargeRates?: readonly { role: string; rate: number | null }[];
}): string {
  if (input.method === "cost_op") {
    const parts = [overheadWords(input.overhead) ?? "no overhead"];
    parts.push(
      input.profit.value > 0 ? profitWords(input.profit) : "no profit"
    );
    return `Priced by Cost + O&P: ${parts.join(", ")}.`;
  }
  if (input.method === "markup_rate") {
    const parts = [`material markup ${input.markupWords ?? "by rule"}`];
    for (const r of input.chargeRates ?? [])
      parts.push(
        r.rate === null
          ? `${r.role} has no charge rate (not priced)`
          : `${r.role} ${money(r.rate)}/h charge`
      );
    return `Priced by Markup + charge rate: ${parts.join(", ")}.`;
  }
  const parts: string[] = [];
  if (input.materialMarkup > 0) parts.push("material markup");
  const oh = overheadWords(input.overhead);
  if (oh) parts.push(oh);
  if (input.profit.value > 0) parts.push(profitWords(input.profit));
  if (parts.length === 0)
    return "Priced the old way: at cost, with no markup, overhead or profit.";
  if (parts.length === 1) return `Priced the old way: ${parts[0]} only.`;
  return `Priced the old way, all together: ${parts.join(" + ")}.`;
}
