/**
 * Sales tax: what is taxable, at what rate, and on which part of a bid.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE CHANGING ANYTHING HERE
 *
 * Sales tax is legally significant and this file does NOT know the law. It
 * knows arithmetic. Every rate and every rule it applies was typed in by the
 * contractor, and the app's job is to apply them consistently and show its
 * working — not to decide what is taxable in Ohio.
 *
 * That is a deliberate design constraint, not a gap to be filled in later by
 * someone with a rate table:
 *
 *  • Rates change constantly, by state, county, city and special district, and
 *    a stale hardcoded table is worse than no table. A wrong rate looks exactly
 *    like a right one on screen, gets bid, gets won, and the difference comes
 *    out of the contractor's margin — or out of an audit.
 *  • The RULES vary more than the rates. Some states tax materials and labor
 *    together; some tax materials only; some treat a real-property improvement
 *    as the contractor consuming the materials (tax paid at the supply house,
 *    nothing charged to the customer) while a retail sale of the same goods is
 *    taxed at the till. Encoding one state's treatment as "the" behaviour would
 *    be wrong everywhere else and invisible until it mattered.
 *
 * So: nothing is taxable unless the user says so, no rate exists unless the
 * user entered it, and the whole feature is OFF until switched on. A bid with
 * tax enabled and no rate configured reports `no-rate` — it never quietly
 * charges zero, because a silent zero is indistinguishable from a genuine
 * exemption and is the single most expensive failure this module could have.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { apportionWorkPrice, fromCents, toCents } from "./pricing";

// ─── Rates ────────────────────────────────────────────────────────────────────

/**
 * One line of a stacked rate — "State 6.25%", "Cook County 1.75%".
 *
 * Kept as components rather than one summed number because that is how a rate
 * is quoted, checked and defended. A contractor confirming a rate with their
 * accountant is told the parts; showing 9.5% with no breakdown gives them
 * nothing to check against, and a proposal that itemises the jurisdictions is
 * what makes the number auditable.
 */
export type TaxRateComponent = {
  /** "State", "Cook County", "Chicago", "RTA special district". */
  label: string;
  /** Percent, as typed: 6.25 means 6.25%, NOT 0.0625. */
  ratePct: number;
};

/**
 * A place, and what it charges.
 *
 * `state` / `county` / `city` are the matching keys, all optional so a user can
 * be as coarse or as precise as their work requires — one state-wide rate, or a
 * row per municipality.
 */
export type TaxJurisdiction = {
  id: number;
  name: string;
  /** Two-letter code or full name, matched case-insensitively either way. */
  state: string | null;
  county: string | null;
  city: string | null;
  components: TaxRateComponent[];
};

/** Sum the stack. Percent in, percent out. */
export function combinedRatePct(components: TaxRateComponent[]): number {
  return components.reduce((sum, part) => sum + (Number(part.ratePct) || 0), 0);
}

// ─── What is taxable ──────────────────────────────────────────────────────────

/**
 * Which part of a bid the tax applies to, and on what figure.
 *
 * ── `applyTo` is the subtle one ──────────────────────────────────────────────
 * "price"  Tax the customer-facing amount — the material and/or labor SHARE of
 *          the final price, after overhead and profit. This is the usual
 *          treatment where the contract is a retail sale.
 * "cost"   Tax the underlying cost instead, before markup. Used where the rule
 *          is written against what the contractor paid rather than what they
 *          charge.
 *
 * The two produce materially different numbers on the same bid, which is
 * exactly why it is a setting and not an assumption.
 */
export type TaxApplyTo = "price" | "cost";

export type TaxRules = {
  enabled: boolean;
  taxMaterials: boolean;
  taxLabor: boolean;
  applyTo: TaxApplyTo;
};

/** Off, and taxing nothing, until somebody decides otherwise. */
export const DEFAULT_TAX_RULES: TaxRules = {
  enabled: false,
  taxMaterials: false,
  taxLabor: false,
  applyTo: "price",
};

// ─── The calculation ──────────────────────────────────────────────────────────

export type SalesTaxInput = {
  /** Cost of materials across the bid, before overhead and profit. */
  materialCost: number;
  /**
   * The bid's MATERIAL markup (references/material-markup.md). Under "price"
   * it is part of what the customer is billed for material, so it weights the
   * material share of the price; under "cost" it is ignored, because "cost"
   * taxes what the contractor paid. Omitted is 0 — a bid with no markup, which
   * taxes exactly as it did before markup existed.
   */
  materialMarkup?: number;
  /** Cost of labor across the bid, before overhead and profit. */
  laborCost: number;
  /**
   * What the customer is charged for the WORK — materials and labor with
   * overhead and profit on top, and nothing else.
   *
   * Deliberately excludes additional charges even when those are marked up:
   * each charge decides its own taxability, so they are supplied separately
   * below rather than blended into a figure the rate is applied to wholesale.
   * On a bid with no charges this is simply the bid price, which is why every
   * caller that predates them is unaffected.
   */
  finalPrice: number;
  /**
   * Flat charges — permits, inspections, fees — each with its own taxability.
   *
   * `amount` is the cost and `charged` is what the customer pays for it, which
   * differ only when the charge is marked up. Which one enters the base
   * follows `applyTo`, exactly as it does for materials and labor: "cost"
   * taxes what was paid, "price" taxes what is billed.
   */
  expenses?: readonly {
    amount: number;
    charged: number;
    taxable?: boolean;
  }[];
  rules: TaxRules;
  /**
   * The rate to apply, as a percent. Null when nothing supplied one — which is
   * an outcome to report, never a reason to use zero.
   */
  ratePct: number | null;
  /** Rate components, for showing the stack. Optional; display only. */
  components?: TaxRateComponent[];
  /** This bid is exempt. Wins over everything except `enabled`. */
  exempt?: boolean;
};

/**
 * Why the tax is what it is.
 *
 *   ok        A rate applied. `amount` is real.
 *   disabled  Sales tax is switched off company-wide. Nothing to show.
 *   exempt    This bid is exempt. Shown as an explicit $0, not as absence —
 *             a customer who is exempt should SEE that they were not charged.
 *   nothing-taxable
 *             Enabled, rated, but neither materials nor labor is marked
 *             taxable, so the base is zero by configuration.
 *   no-rate   Enabled and taxable, but no rate could be determined. The bid
 *             CANNOT be priced correctly and the UI must say so loudly.
 */
export type SalesTaxStatus =
  | "ok"
  | "disabled"
  | "exempt"
  | "nothing-taxable"
  | "no-rate";

export type SalesTaxBreakdown = {
  status: SalesTaxStatus;
  /** The amount of tax. Always 0 unless status is "ok". */
  amount: number;
  /** The figure the rate was applied to. */
  taxableAmount: number;
  /** The rate used, as a percent. Null when none applied. */
  ratePct: number | null;
  components: TaxRateComponent[];
  /** finalPrice + amount. The number the customer actually owes. */
  totalWithTax: number;
  /**
   * The material / labor split of the taxable base, for showing the working.
   * Both zero when nothing was taxed.
   */
  taxableMaterial: number;
  taxableLabor: number;
  /** The part of the base contributed by taxable charges. */
  taxableExpenses: number;
};

/**
 * Work out the sales tax on a bid.
 *
 * ── Proportional allocation, and why it is stated rather than hidden ─────────
 * When `applyTo` is "price" and only one of materials/labor is taxable, the
 * final price has to be split — and the final price is not made of materials
 * and labor any more, it is those plus overhead plus profit. This allocates
 * overhead and profit across the two in the same proportion as the direct
 * cost: if materials are 60% of cost, they are treated as 60% of the price.
 *
 * That is a convention, not a law. It is the common one and it is defensible,
 * but a jurisdiction that demands a different allocation would need a different
 * rule here — which is why the breakdown returns `taxableMaterial` and
 * `taxableLabor` separately rather than only the total. Someone checking the
 * number can see what was allocated where.
 *
 * All arithmetic runs in integer cents, as everywhere else in the engine, so
 * the parts add up to the whole exactly.
 */
export function calculateSalesTax(input: SalesTaxInput): SalesTaxBreakdown {
  const components = input.components ?? [];
  const finalPriceCents = toCents(input.finalPrice);

  const none = (status: SalesTaxStatus): SalesTaxBreakdown => ({
    status,
    amount: 0,
    taxableAmount: 0,
    ratePct: status === "ok" ? input.ratePct : null,
    components: status === "no-rate" ? [] : components,
    totalWithTax: fromCents(finalPriceCents),
    taxableMaterial: 0,
    taxableLabor: 0,
    taxableExpenses: 0,
  });

  const expenses = input.expenses ?? [];
  const taxableExpenses = expenses.filter(line => line.taxable);

  if (!input.rules.enabled) return none("disabled");
  // Exemption outranks the rate: an exempt bid is $0 whether or not a
  // jurisdiction matched, and saying "no rate" there would be misleading.
  if (input.exempt) return none("exempt");
  // A charge marked taxable is taxable whatever the company rules say about
  // materials and labor — that is what "per expense, not global" means. So
  // "nothing taxable" has to account for it, or a bid whose only taxable thing
  // is a fee would report as untaxable and quietly charge nothing.
  if (
    !input.rules.taxMaterials &&
    !input.rules.taxLabor &&
    taxableExpenses.length === 0
  ) {
    return none("nothing-taxable");
  }
  if (input.ratePct === null || !Number.isFinite(input.ratePct)) {
    return none("no-rate");
  }

  const materialCents = toCents(input.materialCost);
  const laborCents = toCents(input.laborCost);

  let baseMaterialCents: number;
  let baseLaborCents: number;

  if (input.rules.applyTo === "cost") {
    // What the contractor paid — material markup is not a cost, so it is not
    // here even when material is taxable.
    baseMaterialCents = input.rules.taxMaterials ? materialCents : 0;
    baseLaborCents = input.rules.taxLabor ? laborCents : 0;
  } else {
    /*
      Allocate the billed price across material and labor.

      By each side's cost WITH ITS MARKUP, through the one function the
      accounting export also uses — so the material share here is the same
      number the invoice books as Materials. It used to be bare cost share,
      which was right only while nothing was marked up differently: with a 40%
      markup on material it would tax labor for money the customer pays for
      material. Labor takes the remainder, so the two sum to exactly the final
      price. A bid with no cost has no shares to allocate, which is what keeps
      an empty bid at zero rather than NaN.
    */
    const split = apportionWorkPrice({
      workPrice: input.finalPrice,
      materialCost: input.materialCost,
      materialMarkup: input.materialMarkup ?? 0,
      laborCost: input.laborCost,
    });
    baseMaterialCents =
      split && input.rules.taxMaterials ? split.materialCents : 0;
    baseLaborCents = split && input.rules.taxLabor ? split.laborCents : 0;
  }

  // Each taxable charge enters on the same footing as materials and labor:
  // what it cost under "cost", what it is billed at under "price".
  const baseExpenseCents = taxableExpenses.reduce(
    (cents, line) =>
      cents +
      toCents(input.rules.applyTo === "cost" ? line.amount : line.charged),
    0
  );

  const baseCents = baseMaterialCents + baseLaborCents + baseExpenseCents;
  const taxCents = Math.round((baseCents * input.ratePct) / 100);

  return {
    status: "ok",
    amount: fromCents(taxCents),
    taxableAmount: fromCents(baseCents),
    ratePct: input.ratePct,
    components,
    totalWithTax: fromCents(finalPriceCents + taxCents),
    taxableMaterial: fromCents(baseMaterialCents),
    taxableLabor: fromCents(baseLaborCents),
    taxableExpenses: fromCents(baseExpenseCents),
  };
}

// ─── Matching a job address to a jurisdiction ─────────────────────────────────

export type JurisdictionMatch = {
  jurisdiction: TaxJurisdiction | null;
  /**
   * How confident the match is, which the UI shows rather than hides.
   *
   *   city    Matched down to the city — the most specific this can be.
   *   county  Matched a county rule.
   *   state   Matched a state-wide rule only.
   *   none    Nothing matched. The bid has no rate.
   */
  precision: "city" | "county" | "state" | "none";
  /** What in the address produced the match, for showing the user. */
  matchedOn: string[];
};

/** Loose containment test — case and punctuation insensitive. */
function mentions(haystack: string, needle: string | null): boolean {
  if (!needle) return false;
  const cleanNeedle = needle.trim().toLowerCase();
  if (!cleanNeedle) return false;
  // Word-boundary-ish: avoids "OR" (Oregon) matching inside "NORTH".
  const pattern = new RegExp(
    `(^|[^a-z0-9])${cleanNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
    "i"
  );
  return pattern.test(haystack);
}

/**
 * Find the jurisdiction that governs a job address.
 *
 * ── Most specific wins, and it says which ────────────────────────────────────
 * A city rule beats a county rule beats a state rule, because that is how rates
 * stack in reality — the city row is expected to contain the whole stack. Where
 * two rules are equally specific the FIRST is taken and that is a tie the user
 * resolves by deleting one; the app does not guess between two rates.
 *
 * ── Deliberately dumb, and transparent about it ──────────────────────────────
 * This is substring matching over a free-text address, not geocoding. It will
 * miss an address that names a county nobody wrote down, and it can be fooled.
 * That is acceptable ONLY because the result is always shown with what it
 * matched on, and is always overridable per bid. It is a starting point that
 * the user checks, never an answer the user cannot see or change.
 */
export function matchJurisdiction(
  jurisdictions: TaxJurisdiction[],
  address: string | null | undefined
): JurisdictionMatch {
  const text = (address ?? "").trim();
  if (!text) return { jurisdiction: null, precision: "none", matchedOn: [] };

  let best: JurisdictionMatch = {
    jurisdiction: null,
    precision: "none",
    matchedOn: [],
  };
  const rank = { none: 0, state: 1, county: 2, city: 3 } as const;

  for (const jurisdiction of jurisdictions) {
    const matchedOn: string[] = [];
    // Every key the row DECLARES has to match. A row naming a city and a state
    // describes that city in that state, and matching the state alone would
    // apply a city's rate to the whole state.
    if (jurisdiction.state) {
      if (!mentions(text, jurisdiction.state)) continue;
      matchedOn.push(jurisdiction.state);
    }
    if (jurisdiction.county) {
      if (!mentions(text, jurisdiction.county)) continue;
      matchedOn.push(jurisdiction.county);
    }
    if (jurisdiction.city) {
      if (!mentions(text, jurisdiction.city)) continue;
      matchedOn.push(jurisdiction.city);
    }
    // A row with no keys at all matches nothing — it would otherwise apply to
    // every address in the world, which is never what anyone meant.
    if (matchedOn.length === 0) continue;

    const precision: JurisdictionMatch["precision"] = jurisdiction.city
      ? "city"
      : jurisdiction.county
        ? "county"
        : "state";

    if (rank[precision] > rank[best.precision]) {
      best = { jurisdiction, precision, matchedOn };
    }
  }

  return best;
}

/**
 * A plain-language reason a bid has no tax on it.
 *
 * Returned as a sentence rather than a code because every one of these is
 * shown to a person deciding whether the bid is right, and "no-rate" tells
 * them nothing about what to do next.
 */
export function explainTaxStatus(
  status: SalesTaxStatus,
  jobAddress?: string | null
): string | null {
  switch (status) {
    case "ok":
      return null;
    case "disabled":
      return "Sales tax is switched off in your company settings.";
    case "exempt":
      return "This bid is marked tax exempt.";
    case "nothing-taxable":
      return "Sales tax is on, but neither materials nor labor is set as taxable in your company settings.";
    case "no-rate":
      return jobAddress?.trim()
        ? "No tax area matches this job address, so no rate could be applied. Add one in Settings, or set a rate on this bid."
        : "This bid has no job address, so no tax area could be matched. Add the address on the Proposal screen, or set a rate on this bid.";
  }
}
