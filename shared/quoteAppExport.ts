/**
 * "FOR YOUR QUOTE APP" — a bid's price to the customer, before tax, in the
 * shape the owner's quote app takes: scopes, each with five buckets.
 * references/quote-app-panel-plan.md (owner's answers § 1a, 2026-09-29).
 *
 * ── An ADAPTER, not a second pricing engine ──────────────────────────────────
 * Every figure comes from `bidRollup`, the one pricing path the bid screen,
 * the proposal and the QuickBooks export all read. This file only reshapes it.
 * A second implementation of the money is how an export comes to disagree
 * with its bid, and in the quote app nobody re-checks a number against
 * BidRidge. BidRidge is not reshaped to match the quote app either: this file
 * totals BidRidge's structure into the app's shape.
 *
 * ── The customer's price, not the cost ───────────────────────────────────────
 * The quote app has no line for overhead or profit, so they have to be inside
 * the figures or the job is under-quoted by exactly the margin. Material and
 * Labor are the bid's WORK PRICE split by `apportionWorkPrice` — the split
 * sales tax and the QuickBooks export already use — so each carries its
 * markup and its share of overhead and profit. Each charge enters at what the
 * bid BILLS for it (`charged`). No cost reaches the document.
 *
 * ── Before tax, always ───────────────────────────────────────────────────────
 * The quote app adds its own tax, on labor as well as material. So every
 * bucket is pre-tax, and the buckets add up to the bid's pre-tax total — Total
 * due minus tax, to the cent (server/quoteAppPanel.test.ts, T1). This file
 * does not import the sales tax engine and cannot work tax out: it is handed
 * the bid's own figures only to say, in words, that the totals will differ.
 *
 * ── A bid with a line nobody priced shows NO figures ─────────────────────────
 * Owner, 2026-09-29, replacing the plan's first rule (refuse to open): the
 * panel opens, lists each such line as "Not priced" or "Can't price", and
 * shows no bucket, no total and no copy button until they are fixed. A partial
 * set of figures keyed into a quote reads as a whole one. The blocked document
 * is a separate member of the union with no money fields at all, so nothing
 * can render a figure from it.
 */
import { apportionWorkPrice, toCents } from "./pricing";
import {
  lineHoursUnset,
  lineNotPriced,
  linePartsNotPriced,
  type PartsLineLike,
} from "./lineNotPriced";

// ─── The shape of the quote app ──────────────────────────────────────────────

/** The quote app's five buckets, in its order. */
export const QUOTE_BUCKETS = [
  "Tasks",
  "Material",
  "Equipment",
  "Labor",
  "Misc",
] as const;
export type QuoteBucketName = (typeof QUOTE_BUCKETS)[number];

/** What the panel says under its heading, word for word (plan § 5). */
export const CUSTOMER_PRICE_WORDING =
  "What you charge the customer, before tax. Material and labor include your markup, overhead and profit. These are not your costs.";

// ─── Input ───────────────────────────────────────────────────────────────────

/** A line on the bid that stops the figures, and why. */
export type QuoteGap = {
  /** Null for the bid itself — its overhead or profit setting. */
  lineId: number | null;
  name: string;
  status: "Not priced" | "Can't price";
  /** What is missing, in words: "no price", "labor hours", "2 parts". */
  detail: string;
};

/** One of `bidRollup`'s `priced` rows, reduced to what a gap needs. */
export type QuoteGapLine = {
  line: PartsLineLike & {
    id: number;
    name: string;
    unitLabel: string | null;
  };
  breakdown: {
    directCost: number;
    totalLaborHours: number;
    laborCost: number;
  } | null;
  problem: { code: string } | null;
};

/**
 * Every line that stops the figures. The same rules the bid screen shows
 * "Not priced" and "Can't price" by (shared/lineNotPriced.ts), so the panel
 * and the bid cannot disagree about which lines are missing.
 *
 * A line that is priced but missing PARTS, a traced line whose hours are
 * unset, or a line whose hours carry a $0 labor rate is listed too: its
 * figure is short, and a short figure copied into a quote is the thing this
 * panel must not produce.
 */
export function quoteGaps(
  priced: readonly QuoteGapLine[],
  bidProblems: readonly { lineId: number | null }[]
): QuoteGap[] {
  const gaps: QuoteGap[] = [];
  if (bidProblems.some(p => p.lineId === null))
    gaps.push({
      lineId: null,
      name: "This bid's overhead or profit setting",
      status: "Can't price",
      detail: "the setting has no finite price — check it on the bid",
    });
  for (const { line, breakdown, problem } of priced) {
    const name = line.unitLabel ? `${line.unitLabel}: ${line.name}` : line.name;
    const directCost = breakdown?.directCost ?? null;
    if (problem) {
      gaps.push({
        lineId: line.id,
        name,
        status: "Can't price",
        detail: "the bid cannot work this line out",
      });
    } else if (lineNotPriced(line, directCost)) {
      gaps.push({
        lineId: line.id,
        name,
        status: "Not priced",
        detail: "no price",
      });
    } else if (lineHoursUnset(line)) {
      gaps.push({
        lineId: line.id,
        name,
        status: "Not priced",
        detail: "labor hours not set",
      });
    } else if (
      breakdown &&
      breakdown.totalLaborHours > 0 &&
      breakdown.laborCost === 0
    ) {
      /*
        Hours with no rate behind them — a starter labor rate still at $0
        (CLAUDE.md § "Starter content ships unpriced"). Found on screen
        2026-09-29: without this, 20 hours at $0 showed Labor as "None", an
        empty-looking figure for labor that is on the bid and unpriced.
      */
      gaps.push({
        lineId: line.id,
        name,
        status: "Not priced",
        detail: "labor rate not set",
      });
    } else {
      const parts = linePartsNotPriced(line, directCost);
      if (parts > 0)
        gaps.push({
          lineId: line.id,
          name,
          status: "Not priced",
          detail: `${parts} ${parts === 1 ? "part" : "parts"} with no price`,
        });
    }
  }
  return gaps;
}

export type QuoteAppSource = {
  bidName: string;
  /** The shipped example job. Its figures are not a real quote. */
  isSample: boolean;
  gaps: readonly QuoteGap[];
  /** From `bidRollup(...).totals`, unchanged. */
  totals: {
    materialCost: number;
    materialMarkup: number;
    laborCost: number;
    /** Materials and labor at their price to the customer. */
    workPrice: number;
    /** workPrice + every charge as billed. Before tax. */
    subtotal: number;
    salesTaxAmount: number;
    totalDue: number;
    /** Every charge at what the bid bills for it. */
    expenseLines: readonly { name: string; charged: number }[];
  };
  /**
   * Lines priced from an EXAMPLE price (plan § 6). Always 0 until Track A's
   * example-price flag exists (handoff H2); the panel's wording for it is
   * built and tested now so it is ready the day it is fed.
   */
  examplePricedLines: number;
};

// ─── Output ──────────────────────────────────────────────────────────────────

/** A named figure under Misc — one charge. */
export type QuoteRow = { name: string; cents: number };

export type QuoteBucket = {
  bucket: QuoteBucketName;
  /** The bucket's figure, or null for "None" — an empty bucket, not a 0. */
  cents: number | null;
  /** The charges making up Misc, each with its own figure. */
  rows: QuoteRow[];
};

export type QuoteScope = { name: string; buckets: QuoteBucket[] };

export type QuoteAppDoc =
  | {
      state: "blocked";
      bidName: string;
      isSample: boolean;
      gaps: QuoteGap[];
    }
  | {
      state: "ready";
      bidName: string;
      isSample: boolean;
      /** One scope per bid (owner, Q1). */
      scopes: QuoteScope[];
      /** Every bucket added up — equals the bid's pre-tax total. */
      preTaxCents: number;
      /** The bid charges tax, so the quote app's total will differ. */
      taxOn: boolean;
      /** The bid's own Total due, named in that sentence. */
      totalDueCents: number;
      examplePricedLines: number;
      /** What the figures mean and what is not in them, one line each. */
      notes: string[];
    };

// ─── Building it ─────────────────────────────────────────────────────────────

export function buildQuoteAppDoc(source: QuoteAppSource): QuoteAppDoc {
  if (source.gaps.length > 0) {
    return {
      state: "blocked",
      bidName: source.bidName,
      isSample: source.isSample,
      gaps: [...source.gaps],
    };
  }

  const t = source.totals;
  const workCents = toCents(t.workPrice);
  const split = apportionWorkPrice({
    workPrice: t.workPrice,
    materialCost: t.materialCost,
    materialMarkup: t.materialMarkup,
    laborCost: t.laborCost,
  });

  /*
    Misc: every charge by name, at what the bid bills for it. Subcontract
    lines join here when they exist (owner, Q5). Tasks and Equipment stay
    "None" until a charge can say which bucket it belongs in (Track A, H1).
  */
  const misc: QuoteRow[] = t.expenseLines
    .map(line => ({ name: line.name, cents: toCents(line.charged) }))
    .filter(row => row.cents !== 0);
  if (split === null && workCents !== 0) {
    /*
      A price with no material or labor behind it to split by — a flat
      overhead on a bid of charges only. One named figure rather than a split
      that would be made up.
    */
    misc.unshift({ name: "Work on this bid", cents: workCents });
  }

  const sum = (rows: readonly QuoteRow[]) =>
    rows.reduce((cents, row) => cents + row.cents, 0);
  const figure = (cents: number) => (cents === 0 ? null : cents);
  const byBucket: Record<QuoteBucketName, QuoteBucket> = {
    Tasks: { bucket: "Tasks", cents: null, rows: [] },
    Material: {
      bucket: "Material",
      cents: split ? figure(split.materialCents) : null,
      rows: [],
    },
    Equipment: { bucket: "Equipment", cents: null, rows: [] },
    Labor: {
      bucket: "Labor",
      cents: split ? figure(split.laborCents) : null,
      rows: [],
    },
    Misc: { bucket: "Misc", cents: figure(sum(misc)), rows: misc },
  };
  const buckets = QUOTE_BUCKETS.map(name => byBucket[name]);
  const preTaxCents = buckets.reduce((c, b) => c + (b.cents ?? 0), 0);

  const notes = [
    "Charges are all under Misc until each one says which bucket it goes in.",
    "Subcontract lines, when you add them, go under Misc.",
    "Alternates, unit prices, allowances, exclusions and addenda are not in these figures.",
  ];

  return {
    state: "ready",
    bidName: source.bidName,
    isSample: source.isSample,
    scopes: [{ name: source.bidName, buckets }],
    preTaxCents,
    taxOn: t.salesTaxAmount !== 0,
    totalDueCents: toCents(t.totalDue),
    examplePricedLines: source.examplePricedLines,
    notes,
  };
}

// ─── Showing and copying a figure ────────────────────────────────────────────

/**
 * What Copy puts on the clipboard: `1050.00`. No `$` and no comma, because it
 * pastes into a numeric field on a phone (owner, Q3: exact cents).
 */
export function clipboardAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** What the screen shows: `$1,050.00`. */
export function displayAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}
