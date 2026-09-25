/**
 * A bid's numbers, in the shape QuickBooks Online's invoice importer reads.
 *
 * ── Numbers out, not documents ───────────────────────────────────────────────
 * This carries the customer, the job reference, a date and the money. It does
 * NOT carry the scope of work, the includes and excludes, or anything else the
 * proposal prints — those are the customer's document and stay in BidRidge.
 * Accounting needs what is owed and by whom, and giving it more is not
 * generosity, it is a second copy of the proposal that will go stale.
 *
 * ── What must never leave, and why the split is not obvious ──────────────────
 * Overhead, profit and cost basis stay inside the company. That sounds simple
 * until you try to export "labor and materials", because the labor and material
 * figures ON THE BID ARE COSTS — what the contractor pays, before overhead and
 * profit. Exporting those two numbers directly would hand an accountant (and
 * anyone the file is forwarded to) the margin on every job, and they would not
 * add up to what the customer owes anyway.
 *
 * So the split exported here is of the CHARGE, not the cost: each side scaled
 * by the same uplift that turns direct cost into the bid price, which is the
 * factor `bidPricing.ts` already computes for marked-up charges. The two lines
 * sum to exactly what the customer is billed for the work, and neither the
 * uplift, the overhead percentage, the profit percentage nor either cost
 * appears anywhere in the file.
 *
 * `INTERNAL_FIELDS` names what is deliberately absent, and the test suite scans
 * every generated file for all of it. That list is the specification.
 *
 * ── Sales tax is a line, not a tax code, and this is deliberate ──────────────
 * QuickBooks Online's CSV importer does not accept a tax AMOUNT. Given a tax
 * code it recalculates the tax itself from its own rate tables — which means a
 * bid that a customer approved at one figure would import as an invoice for a
 * different one, silently, whenever the two rate tables disagree.
 *
 * That is precisely the failure `shared/salesTax.ts` exists to prevent, and it
 * is worse here than on screen: nobody re-checks an imported invoice against
 * the bid. So tax is emitted as an ordinary line item carrying the exact figure
 * from the bid, and every line is marked non-taxable so QuickBooks does not add
 * its own on top. The imported invoice total then equals the bid total exactly,
 * which is the property worth protecting.
 *
 * The cost of that choice, stated plainly because it is a real one: a tax line
 * imported this way posts wherever its product/service is mapped, so somebody
 * has to point "Sales tax" at the sales-tax liability account in QuickBooks
 * once. That is a one-time setup step with a visible consequence, as against a
 * wrong total with an invisible one.
 *
 * ── Column names are for auto-mapping, not for correctness ───────────────────
 * QuickBooks' importer has a mapping step: if a header does not match, the user
 * points at the right field by hand. The headers below are the ones its sample
 * file uses, so the mapping screen fills itself in — but a spelling change at
 * Intuit's end costs a few clicks, not a failed import. Worth knowing before
 * anyone treats this list as load-bearing.
 */
import { csvDocument } from "./csvWrite";
import { apportionWorkPrice } from "./pricing";

/**
 * QuickBooks Online's invoice import columns, in its sample file's order.
 *
 * Verified against Intuit's import documentation and two independent write-ups
 * of the sample file (see the commit message). Item Tax Code is last because
 * that is where the sample puts it.
 */
export const QUICKBOOKS_COLUMNS = [
  "Invoice No.",
  "Customer",
  "Invoice Date",
  "Due Date",
  "Terms",
  "Item(Product/Service)",
  "Item Description",
  "Item Quantity",
  "Item Rate",
  "Item Amount",
  "Item Tax Code",
] as const;

/**
 * QuickBooks Online's stated import ceilings: 100 invoices, 1,000 rows.
 *
 * Unreachable from a per-bid export — a bid would need a thousand separate
 * charges — but named so a future bulk export starts from the real number
 * rather than rediscovering it after a user's file is rejected.
 */
export const QUICKBOOKS_MAX_INVOICES = 100;
export const QUICKBOOKS_MAX_ROWS = 1000;

/**
 * The product/service each line is booked against.
 *
 * A deliberately tiny fixed set. QuickBooks creates a product or service for
 * every distinct name it imports, so putting the expense's own name here would
 * grow a chart of accounts one permit at a time. The specifics go in the
 * description, which is free text and books nowhere.
 */
export const QUICKBOOKS_ITEMS = {
  labor: "Labor",
  materials: "Materials",
  work: "Electrical work",
  charge: "Other charges",
  tax: "Sales tax",
} as const;

/**
 * Marked non-taxable so QuickBooks does not compute tax on top of the tax line
 * this file already carries. See the header.
 */
export const NON_TAXABLE_CODE = "NON";

/**
 * Everything that must never appear in an exported file.
 *
 * Not documentation — `accountingExport.test.ts` iterates this list against
 * every generated CSV, so adding a term here adds a test. Both the label a
 * human would recognise and the field name a careless `...totals` spread would
 * emit are listed, because the realistic way this leaks is someone widening the
 * row builder, not someone typing "profit margin" into a header.
 */
export const INTERNAL_FIELDS = [
  "overhead",
  "overheadPct",
  "overheadValue",
  "profit",
  "profitPct",
  "profitValue",
  "margin",
  "markup",
  "markupPct",
  "directCost",
  "materialCost",
  "laborCost",
  "cost basis",
  "productivity",
  "productivityPct",
  "uplift",
  "snapshot",
] as const;

/** One row of the file: one line of one invoice. */
export type AccountingLine = {
  item: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

export type AccountingExport = {
  /** Stable per bid, so a re-export updates rather than duplicates. */
  invoiceNo: string;
  customer: string;
  invoiceDate: Date;
  dueDate: Date;
  terms: string;
  lines: AccountingLine[];
  /** Sum of every line. Equals the bid's Total due. */
  total: number;
  /** Anything the user should know before importing. Shown, never in the file. */
  warnings: string[];
};

/** Money to cents and back, so a chain of × and + cannot drift. */
const cents = (value: number) => Math.round(value * 100);
const money = (c: number) => c / 100;

/**
 * A reference a person can match to a bid, and QuickBooks can treat as one
 * invoice.
 *
 * Built from the bid id rather than its name: names are not unique and are
 * edited, and re-importing under a changed reference would create a second
 * invoice for the same job rather than updating the first.
 */
export function invoiceReference(bidId: number): string {
  return `BR-${bidId}`;
}

/** `MM/DD/YYYY` — the format QuickBooks Online's US importer expects. */
export function formatQuickBooksDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

/** What the rollup has to supply. Structural, so tests need no database. */
export type AccountingSource = {
  bidId: number;
  bidName: string;
  /** Resolved through shared/bidClient — the bid's text, then the record. */
  customerName: string | null;
  status: string;
  /** The shipped example. Must never be posted to a real set of books. */
  isSample?: boolean;
  totals: {
    materialCost: number;
    /**
     * The bid's material markup. Required: the split below weights material
     * by cost PLUS markup, and a caller that left it out would book part of
     * what the customer pays for material as labor.
     */
    materialMarkup: number;
    laborCost: number;
    workPrice: number;
    salesTaxAmount: number;
    totalDue: number;
    expenseLines: readonly { name: string; charged: number }[];
  };
};

/**
 * Build the export.
 *
 * `now` is a parameter rather than a `Date.now()` inside, for the same reason
 * `shared/retention.ts` takes one: a date this file stamps onto an accounting
 * record has to be assertable in a test, and one that reads the clock itself
 * can only be tested by agreeing with itself.
 */
export function buildAccountingExport(
  source: AccountingSource,
  now: Date
): AccountingExport {
  const lines: AccountingLine[] = [];
  const warnings: string[] = [];

  const workCents = cents(source.totals.workPrice);
  /*
    The split is the one sales tax uses, from the one function both call.
    Material is weighted by its cost PLUS its markup — what the customer is
    charged for material — and labor takes the remainder. Weighting by bare
    cost (as this did before material markup) would book part of the
    material's markup as labor, so the invoice and the tax on it would
    disagree about what "Materials" was.
  */
  const split = apportionWorkPrice({
    workPrice: source.totals.workPrice,
    materialCost: source.totals.materialCost,
    materialMarkup: source.totals.materialMarkup,
    laborCost: source.totals.laborCost,
  });

  if (workCents !== 0) {
    if (split === null) {
      // Nothing to apportion by. One line for the whole charge rather than
      // attributing it all to labor, which would be a made-up split.
      lines.push({
        item: QUICKBOOKS_ITEMS.work,
        description: source.bidName,
        quantity: 1,
        rate: money(workCents),
        amount: money(workCents),
      });
    } else {
      // Charged, not cost: each side carries its share of overhead and profit.
      // Materials is computed and labor takes the remainder, so the two always
      // sum to the work price exactly — apportioning both independently leaves
      // a cent adrift on roughly half of all bids, and an invoice that misses
      // the bid by a penny is one somebody has to reconcile by hand.
      const materialCharge = split.materialCents;
      const laborCharge = split.laborCents;

      if (materialCharge !== 0) {
        lines.push({
          item: QUICKBOOKS_ITEMS.materials,
          description: "Materials",
          quantity: 1,
          rate: money(materialCharge),
          amount: money(materialCharge),
        });
      }
      if (laborCharge !== 0) {
        lines.push({
          item: QUICKBOOKS_ITEMS.labor,
          // No hour count: hours reveal the crew's productivity against book
          // rates, which is company-internal, and accounting does not need it
          // to book a lump-sum charge.
          description: "Labor",
          quantity: 1,
          rate: money(laborCharge),
          amount: money(laborCharge),
        });
      }
    }
  }

  // Charges keep their own names — a permit posted as "Other charges: City of
  // Portland permit" is the itemisation the whole feature exists for.
  for (const expense of source.totals.expenseLines) {
    const amount = cents(expense.charged);
    if (amount === 0) continue;
    lines.push({
      item: QUICKBOOKS_ITEMS.charge,
      description: expense.name,
      quantity: 1,
      rate: money(amount),
      amount: money(amount),
    });
  }

  const taxCents = cents(source.totals.salesTaxAmount);
  if (taxCents !== 0) {
    lines.push({
      item: QUICKBOOKS_ITEMS.tax,
      description: "Sales tax",
      quantity: 1,
      rate: money(taxCents),
      amount: money(taxCents),
    });
  }

  const total = money(lines.reduce((sum, line) => sum + cents(line.amount), 0));

  // ── Warnings: shown on screen, never written into the file ────────────────
  if (!source.customerName) {
    warnings.push(
      "This bid has no customer name. QuickBooks needs one and will reject the row — " +
        "add a client to the bid, or fill the Customer column in before importing."
    );
  }
  if (source.isSample) {
    // Loudest of the three, and first. A permit charge on a fictional retail
    // buildout landing in somebody's real ledger is a mess to unpick, and the
    // export looks completely ordinary once it is a file on disk.
    warnings.unshift(
      "This is the SAMPLE bid. Do not import it — it is example data, not a real job."
    );
  }
  if (source.status !== "Won") {
    warnings.push(
      `This bid is marked ${source.status}. Importing it creates an invoice for work that has not been won.`
    );
  }
  if (lines.length === 0) {
    warnings.push(
      "This bid has nothing to bill yet, so the file would be empty."
    );
  }
  if (Math.abs(cents(source.totals.totalDue) - cents(total)) > 0) {
    // Should be unreachable. Loud rather than silent if it ever is not: an
    // export that does not match the bid is the one thing this must not do.
    warnings.push(
      `The exported lines total ${total.toFixed(2)} but the bid's total due is ${source.totals.totalDue.toFixed(2)}. Do not import this — please report it.`
    );
  }

  return {
    invoiceNo: invoiceReference(source.bidId),
    customer: source.customerName ?? "",
    invoiceDate: now,
    // Same day, deliberately. The bid's own `dueDate` is the deadline for
    // SUBMITTING the bid, not for the customer paying it, and quietly reusing
    // it would put a payment deadline on an invoice that nobody agreed to.
    // Payment terms belong to whoever runs the books; they set them in
    // QuickBooks.
    dueDate: now,
    terms: "",
    lines,
    total,
    warnings,
  };
}

/** The file itself. One row per line, sharing an invoice number. */
export function toQuickBooksCsv(doc: AccountingExport): string {
  const invoiceDate = formatQuickBooksDate(doc.invoiceDate);
  const dueDate = formatQuickBooksDate(doc.dueDate);

  return csvDocument([
    [...QUICKBOOKS_COLUMNS],
    ...doc.lines.map(line => [
      doc.invoiceNo,
      doc.customer,
      invoiceDate,
      dueDate,
      doc.terms,
      line.item,
      line.description,
      line.quantity,
      line.rate.toFixed(2),
      line.amount.toFixed(2),
      NON_TAXABLE_CODE,
    ]),
  ]);
}

/** A filename that says which bid and when, for a downloads folder. */
export function accountingFilename(doc: AccountingExport): string {
  return `${doc.invoiceNo}-quickbooks-${doc.invoiceDate.toISOString().slice(0, 10)}.csv`;
}
