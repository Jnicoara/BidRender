/**
 * Pricing one bid, end to end — the rollup both the bid screen and the client
 * proposal are built from.
 *
 * ── Why this is not inside bidsRouter ────────────────────────────────────────
 * It used to be. Then the proposal generator needed the same numbers, and there
 * are exactly two ways to do that: call the bid router's `get` from another
 * router, or lift the arithmetic out where both can reach it. The first shape
 * is the one that eventually diverges — a fix applied in one place, a rounding
 * step added in the other, and a contractor sends a client a total that does
 * not match the bid they approved it from.
 *
 * So there is one rollup, here, and every caller is a formatter over it. What a
 * proposal does differently is decide what to SHOW (shared/proposal.ts); it
 * does not decide what anything costs.
 *
 * All the actual math is still delegated to shared/pricing.ts. Nothing in this
 * file computes a percentage.
 */
import type { Bid, BidLineItem, TaxJurisdictionRow } from "../drizzle/schema";
import {
  bottomOfBidRatio,
  calculateBidPrice,
  calculateLineItem,
  resolveBidPricingSettings,
  type ResolvedPricingSettings,
  roundMoney,
  sumLineCosts,
  type CompanyPricingDefaults,
} from "../shared/pricing";
import { storedMarkupPct } from "../shared/materialMarkup";
import {
  DEFAULT_TAX_RULES,
  calculateSalesTax,
  combinedRatePct,
  matchJurisdiction,
  type JurisdictionMatch,
  type TaxJurisdiction,
  type TaxRateComponent,
  type TaxRules,
} from "../shared/salesTax";
import {
  priceExpenses,
  sumMarkedUpExpenses,
  type ExpenseLine,
} from "../shared/bidExtras";
import * as db from "./db";

/**
 * Resolve a user's company defaults into the shape the pricing engine wants.
 * Shared by every caller so one bid cannot price two ways.
 */
export async function companyDefaultsFor(
  userId: number
): Promise<CompanyPricingDefaults> {
  const defaults = await db.getPricingDefaults(userId);
  return {
    overheadEnabled: defaults?.overheadEnabled ?? false,
    overheadMode: defaults?.overheadMode ?? "percentage",
    overheadValue: Number(defaults?.overheadValue ?? 0),
    profitMethod: defaults?.profitMethod ?? "markup",
    profitValue: Number(defaults?.profitValue ?? 0),
    productivityPct: Number(defaults?.productivityPct ?? 0),
  };
}

/**
 * The company's sales tax rules.
 *
 * Falls back to DEFAULT_TAX_RULES — off, taxing nothing — rather than to a
 * plausible-looking configuration. A user who has never opened the tax settings
 * has not decided anything, and inventing a decision for them is precisely what
 * the header of shared/salesTax.ts forbids.
 */
export async function taxRulesFor(userId: number): Promise<TaxRules> {
  const defaults = await db.getPricingDefaults(userId);
  if (!defaults) return DEFAULT_TAX_RULES;
  return {
    enabled: defaults.salesTaxEnabled,
    taxMaterials: defaults.taxMaterials,
    taxLabor: defaults.taxLabor,
    applyTo: defaults.taxApplyTo,
  };
}

/** The row shape salesTax wants, from the stored jurisdiction. */
export function toTaxJurisdiction(row: TaxJurisdictionRow): TaxJurisdiction {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    county: row.county,
    city: row.city,
    components: Array.isArray(row.components) ? row.components : [],
  };
}

/**
 * Decide which rate governs a bid, and be able to say why.
 *
 * ── The order is the whole point ─────────────────────────────────────────────
 *   1. an explicit rate typed on the bid          — the last resort, so it wins
 *   2. a tax area pinned to the bid               — the user overrode matching
 *   3. the area matched from the job address      — the automatic path
 *
 * Every step reports its `source`, because a tax figure nobody can trace is a
 * tax figure nobody can defend. The UI shows this; it is not debug output.
 */
export type ResolvedTaxRate = {
  ratePct: number | null;
  components: TaxRateComponent[];
  source: "bid-override" | "bid-jurisdiction" | "matched" | "none";
  jurisdictionName: string | null;
  /** What in the address the match keyed on. Empty unless source is "matched". */
  matchedOn: string[];
  precision: JurisdictionMatch["precision"];
};

export function resolveTaxRate(
  bid: Pick<Bid, "taxJurisdictionId" | "taxRateOverridePct" | "siteAddress">,
  jurisdictions: TaxJurisdiction[]
): ResolvedTaxRate {
  const none: ResolvedTaxRate = {
    ratePct: null,
    components: [],
    source: "none",
    jurisdictionName: null,
    matchedOn: [],
    precision: "none",
  };

  // A rate typed on the bid outranks everything. Note the null check rather
  // than a truthiness test: 0 is a deliberate zero-rate, not "unset".
  if (bid.taxRateOverridePct !== null) {
    return {
      ...none,
      ratePct: Number(bid.taxRateOverridePct),
      source: "bid-override",
    };
  }

  if (bid.taxJurisdictionId !== null) {
    const pinned = jurisdictions.find(j => j.id === bid.taxJurisdictionId);
    if (pinned) {
      return {
        ratePct: combinedRatePct(pinned.components),
        components: pinned.components,
        source: "bid-jurisdiction",
        jurisdictionName: pinned.name,
        matchedOn: [],
        precision: "none",
      };
    }
    // Pinned to an area that has since been archived or deleted. Fall through
    // to matching rather than silently charging nothing.
  }

  const match = matchJurisdiction(jurisdictions, bid.siteAddress);
  if (!match.jurisdiction) return none;
  return {
    ratePct: combinedRatePct(match.jurisdiction.components),
    components: match.jurisdiction.components,
    source: "matched",
    jurisdictionName: match.jurisdiction.name,
    matchedOn: match.matchedOn,
    precision: match.precision,
  };
}

/**
 * Price one snapshot line at its quantity, through the shared engine.
 *
 * ── What is frozen and what is not ───────────────────────────────────────────
 * Everything that describes the WORK is read off the snapshot: material cost,
 * labor hours, the labor rate and the summed modifier percentage, all captured
 * when the line was added. Re-pricing a material or editing an assembly later
 * cannot move an existing bid, which is the whole point of the snapshot — and
 * it is why a proposal generated months afterwards still shows the price the
 * client was quoted.
 *
 * The productivity factor is not one of those. It is a company-level dial
 * passed in at calculation time, so a bid that inherits it does follow a later
 * change — exactly as it follows a later change to overhead or profit, and for
 * the same reason: those three are settings the bid is priced UNDER, not facts
 * about the work it contains. A bid that should stop following gets its own
 * override, and then nothing at company level reaches it.
 */
export function priceLine(line: BidLineItem, productivityPct: number) {
  return calculateLineItem({
    // The snapshot is already a single rolled-up material figure for one
    // assembly, so it enters as one material line at qty 1 and the bid
    // quantity scales the whole thing.
    materials: [{ costPerUnit: Number(line.snapshotMaterialCost), qty: 1 }],
    /**
     * Already includes the assembly's overhead hours — they were added into
     * this figure when the line was snapshotted (see addAssemblyToBid).
     *
     * So `overheadLaborHours` is deliberately NOT passed below. Passing it
     * would add the same setup time twice, and the result would look entirely
     * plausible: a bid a few percent high with nothing on screen to explain it.
     * server/assemblyOverhead.test.ts asserts a bid line prices to exactly the
     * assembly it came from, which is what would catch that.
     */
    baseLaborHours: Number(line.snapshotLaborHours),
    modifiers: [{ laborAdjustmentPct: Number(line.snapshotModifierPct) }],
    laborRate: Number(line.snapshotLaborRate),
    quantity: Number(line.qty),
    productivityPct,
    // Frozen with the rest of the snapshot. NULL — a line from before markup
    // rules — reads as 0%, which is what keeps every such line where it was.
    materialMarkupPct: storedMarkupPct(line.snapshotMarkupPct),
  });
}

/**
 * Price a bid whose direct cost has ALREADY been summed, in SQL.
 *
 * ── Why this exists beside rollUpBid ─────────────────────────────────────────
 * `rollUpBid` needs the line items, because it prices each one. Two screens do
 * not have them and must not fetch them: the Dashboard and the Performance
 * screen both sum the lines in the database and never ship them out, which is
 * the whole reason they stay fast as a bid history grows.
 *
 * What is left is the per-BID half, and it cannot be summed first — a bid may
 * override overhead or profit, flat overhead is an amount rather than a rate,
 * and a target margin divides rather than multiplies. So the resolution and the
 * final arithmetic run here, through the same two functions the bid screen uses.
 *
 * ── It refuses rather than guesses ───────────────────────────────────────────
 * A bid whose stored settings the engine will not accept — a margin at or above
 * 100% has no finite price — comes back at its direct cost with `priced: false`,
 * so one unquotable bid costs a caller one row rather than taking down a screen
 * that is summarising a thousand of them.
 */
export function priceFromDirectCost(
  /**
   * The bid ROW, not a pre-converted override bag.
   *
   * Its decimal columns arrive from drizzle as strings, and the conversion is
   * done here rather than by each caller for the same reason rollUpBid does it:
   * a caller that forgets turns "0.2000" into a silently different price.
   */
  bid: Pick<
    Bid,
    | "overheadEnabled"
    | "overheadMode"
    | "overheadValue"
    | "profitMethod"
    | "profitValue"
    | "productivityPct"
  >,
  directCost: number,
  /**
   * The bid's material markup, summed per line in SQL beside the direct cost.
   * Required rather than defaulted: a caller that forgot it would price every
   * marked-up bid at cost-plus-profit and the card would quietly undersell
   * the bid it opens.
   */
  materialMarkup: number,
  company: CompanyPricingDefaults
): { price: number; priced: boolean; settings: ResolvedPricingSettings } {
  const settings = resolveBidPricingSettings(company, {
    overheadEnabled: bid.overheadEnabled,
    overheadMode: bid.overheadMode,
    overheadValue:
      bid.overheadValue === null ? null : Number(bid.overheadValue),
    profitMethod: bid.profitMethod,
    profitValue: bid.profitValue === null ? null : Number(bid.profitValue),
    productivityPct:
      bid.productivityPct === null ? null : Number(bid.productivityPct),
  });
  try {
    const priced = calculateBidPrice({
      directCost,
      materialMarkup,
      overhead: settings.overhead,
      profit: settings.profit,
    });
    return { price: priced.finalPrice, priced: true, settings };
  } catch {
    return {
      price: roundMoney(directCost + materialMarkup),
      priced: false,
      settings,
    };
  }
}

/** Roll one bid's lines up to a price, at whatever settings apply to it. */
export function rollUpBid(
  bid: Bid,
  lines: BidLineItem[],
  company: CompanyPricingDefaults,
  /** Charges on the bid. Only the marked-up ones affect the direct cost. */
  expenses: readonly ExpenseLine[] = []
) {
  const settings = resolveBidPricingSettings(company, {
    overheadEnabled: bid.overheadEnabled,
    overheadMode: bid.overheadMode,
    overheadValue:
      bid.overheadValue === null ? null : Number(bid.overheadValue),
    profitMethod: bid.profitMethod,
    profitValue: bid.profitValue === null ? null : Number(bid.profitValue),
    productivityPct:
      bid.productivityPct === null ? null : Number(bid.productivityPct),
  });

  const breakdowns = lines.map(line =>
    priceLine(line, settings.productivityPct)
  );
  /**
   * Materials and labor, plus any charge the user marked up.
   *
   * A marked-up charge enters the direct cost so it runs through the SAME
   * overhead and profit as everything else — that is what "the same
   * calculation already used for materials and labor" has to mean if the two
   * are never to disagree. Applying a markup to it separately here would be a
   * second implementation of the thing shared/pricing.ts exists to own.
   *
   * Flat charges are absent by design; they are added after profit.
   */
  const lineSums = sumLineCosts(breakdowns);
  const workCost = lineSums.directCost;
  const directCost = roundMoney(workCost + sumMarkedUpExpenses(expenses));
  /*
    Material markup is summed from the LINES only. A marked-up expense enters
    the direct cost above and so takes overhead and profit, but it is not
    material and no markup rule ever reaches it.
  */
  const bidPrice = calculateBidPrice({
    directCost,
    materialMarkup: lineSums.materialMarkup,
    overhead: settings.overhead,
    profit: settings.profit,
  });

  return { settings, breakdowns, workCost, directCost, bidPrice };
}

/**
 * The whole detail view of a bid: every line priced, unit subtotals, and the
 * totals the screen and the proposal both read.
 *
 * Returned as one object rather than assembled per caller, because the unit
 * subtotals and the totals have to be derived from the SAME per-line
 * breakdowns — two callers each summing their own way is how a bid's parts stop
 * adding up to its whole.
 */
export function bidRollup(
  bid: Bid,
  lines: BidLineItem[],
  company: CompanyPricingDefaults,
  /**
   * Sales tax context. Optional so every existing caller and test keeps
   * working unchanged — omit it and the bid prices exactly as it did before
   * tax existed, which is also what a user who never switched tax on gets.
   */
  tax?: { rules: TaxRules; jurisdictions: TaxJurisdiction[] },
  /**
   * Flat charges on the bid — permits, inspections, dispatch. Optional for the
   * same reason: a bid with none prices exactly as it did before they existed.
   */
  expenses: readonly ExpenseLine[] = []
) {
  const { settings, breakdowns, directCost, bidPrice } = rollUpBid(
    bid,
    lines,
    company,
    expenses
  );
  const priced = lines.map((line, index) => ({
    line,
    breakdown: breakdowns[index],
  }));

  // Unit subtotals, so a hotel bid can answer "what does one room cost?"
  //
  // `costWithMarkup` is carried beside `directCost` because it is the one the
  // proposal prices a unit from. A unit of cheap parts and a unit of gear carry
  // different markups, so a unit's share of the price follows ITS
  // cost-with-markup, not its bare cost scaled by a bid-wide ratio.
  const unitTotals = new Map<
    string,
    { directCost: number; costWithMarkup: number; lines: number }
  >();
  for (const { line, breakdown } of priced) {
    if (!line.unitLabel) continue;
    const current = unitTotals.get(line.unitLabel) ?? {
      directCost: 0,
      costWithMarkup: 0,
      lines: 0,
    };
    current.directCost += breakdown.directCost;
    current.costWithMarkup += breakdown.costWithMarkup;
    current.lines += 1;
    unitTotals.set(line.unitLabel, current);
  }

  /*
    THE SAME ADDITION `workCost` USES, which is the whole point.

    These were two float reduces over unrounded line values while `directCost`
    summed the same lines in integer cents — two rules for one column of
    figures, and on a real bid they came to $192.24 and $192.23. The screen
    shows Materials and Labor directly above Direct cost, so the only thing a
    reader could conclude was that the app cannot add up.

    `sumLineCosts` returns all three from one pass, so the parts equal the
    whole by construction rather than by both happening to round the same way.
  */
  const { materialCost, laborCost, materialMarkup } = sumLineCosts(breakdowns);

  /**
   * Sales tax, computed here so the bid screen and the proposal cannot differ.
   *
   * This is the same reasoning that put the rollup in this file at all: two
   * callers each applying their own tax is how a customer receives a document
   * whose total does not match the bid it was approved from — and with tax that
   * is not just embarrassing, it is a wrong amount of money collected.
   */
  const rate = tax
    ? resolveTaxRate(bid, tax.jurisdictions)
    : ({
        ratePct: null,
        components: [],
        source: "none",
        jurisdictionName: null,
        matchedOn: [],
        precision: "none",
      } as ResolvedTaxRate);

  /**
   * Charges, each priced according to its own two switches.
   *
   * A marked-up charge was already folded into `directCost` above, so it is
   * inside `bidPrice.finalPrice` — scaled by the same overhead and profit the
   * work got. Its billed value is recovered here so it can still appear as its
   * own line: itemisation is the whole reason a permit is a separate charge,
   * and losing it into the bid price would defeat that.
   *
   * `workPrice` is therefore the bid price with those charges taken back out —
   * the marked-up materials and labor alone.
   */
  /*
    THE BOTTOM-OF-BID RATIO, not finalPrice ÷ directCost.

    That was right while every dollar of cost was marked up alike. With
    material markup it hands the wire's markup to a permit: a marked-up expense
    takes overhead and profit — the same as the work — and no material markup,
    because it is not material. `bottomOfBidRatio` divides by cost-with-markup
    for exactly that reason (shared/pricing.ts). With no markup on the bid the
    two ratios are identical, which is why existing bids did not move.
  */
  const uplift = bottomOfBidRatio(bidPrice);
  const pricedExpenses = priceExpenses(expenses, uplift);
  const workPrice = roundMoney(
    bidPrice.finalPrice - pricedExpenses.markedUpCharged
  );

  const salesTax = calculateSalesTax({
    materialCost,
    // Taxed under "price" as part of the material's billed share; ignored
    // under "cost", which taxes what the contractor paid.
    materialMarkup,
    laborCost,
    // The work only. Charges carry their own taxability and are passed
    // separately rather than blended into a figure taxed wholesale.
    finalPrice: workPrice,
    expenses: pricedExpenses.lines,
    rules: tax?.rules ?? DEFAULT_TAX_RULES,
    ratePct: rate.ratePct,
    components: rate.components,
    exempt: bid.taxExempt,
  });

  /** Everything billed, before tax. What the tax line sits under. */
  const expensesTotal = pricedExpenses.total;
  const subtotal = roundMoney(workPrice + expensesTotal);
  /** Everything the customer owes. */
  const totalDue = roundMoney(subtotal + salesTax.amount);

  return {
    settings,
    priced,
    units: Array.from(unitTotals, ([label, totals]) => ({
      label,
      ...totals,
    })),
    /** Where the rate came from, so the number can be traced and defended. */
    taxRate: rate,
    salesTax,
    totals: {
      // bidPrice carries its own directCost (identical, rounded through the
      // engine) — spread it first so the authoritative one wins.
      ...bidPrice,
      totalLaborHours: priced.reduce(
        (sum, p) => sum + p.breakdown.totalLaborHours,
        0
      ),
      /**
       * The same hours BEFORE the productivity factor, at quantity.
       *
       * Sent so the breakdown can show the adjustment as its own step rather
       * than as a total that silently differs from the hours on the assemblies.
       * hoursAfterModifiers is per-unit, so it scales by qty here exactly as
       * totalLaborHours does — comparing one to the other is the whole point,
       * and they have to be on the same footing.
       */
      laborHoursBeforeProductivity: priced.reduce(
        (sum, p) => sum + p.breakdown.hoursAfterModifiers * Number(p.line.qty),
        0
      ),
      materialCost,
      laborCost,
      // `materialMarkup` and `costWithMarkup` arrive with the ...bidPrice
      // spread above, from the engine that computed them.
      /**
       * Tax, and the price with it. Kept as their own fields beside
       * `finalPrice` rather than folded into it — a bid total that silently
       * includes tax is one nobody can check, and every screen that shows a
       * price needs to be able to show the two apart.
       *
       * `totalWithTax` is price + tax and excludes expenses; it is kept
       * because the tax engine returns it and the tests pin it. `totalDue` is
       * the number a customer actually owes.
       */
      salesTaxAmount: salesTax.amount,
      totalWithTax: salesTax.totalWithTax,
      /** Charges as billed, summed. Zero when the bid has none. */
      expensesTotal,
      /**
       * The marked-up materials and labor alone.
       *
       * Differs from `finalPrice` only when a charge is marked up: that charge
       * is inside finalPrice (it ran through overhead and profit with
       * everything else) but is billed on its own line, so the screen shows
       * this to avoid counting it twice.
       */
      workPrice,
      /** Every charge with what it is billed at, for itemising. */
      expenseLines: pricedExpenses.lines,
      /** finalPrice + expenses, before tax. */
      subtotal,
      /** finalPrice + expenses + tax. The bottom line. */
      totalDue,
    },
  };
}
