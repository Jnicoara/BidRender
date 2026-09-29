/**
 * A real bid to look at before you have one of your own.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * A brand-new account opens on a dashboard with nothing on it. Every control
 * works and none of them mean anything yet, and the honest question a
 * contractor has — "what does this actually produce?" — cannot be answered
 * without them first doing an hour of setup on faith. The sample answers it in
 * one click: a priced small-commercial job they can open, poke at, and print a
 * proposal from.
 *
 * ── It is REAL data in their own company, and that is the point ─────────────
 * Not a mock, not a read-only preview, not a screenshot. It is an ordinary bid
 * with ordinary line items, so every screen in the app works on it exactly as
 * it will on their first real job — including the ones that would be tedious to
 * fake, like the proposal and the materials list. A preview that behaves
 * differently from the product teaches the wrong thing.
 *
 * The cost of that choice is that fake money is sitting in a real account, and
 * the whole of this module is about making that impossible to mistake:
 *
 *   • `bids.isSample` is a COLUMN, not a naming convention. "Call it [SAMPLE]"
 *     is a promise kept by remembering, across a dashboard, a search, a
 *     proposal, an export and whatever gets built next. A column is a promise
 *     the query keeps.
 *
 *   • It is excluded from every money AGGREGATE. The dashboard's "Out for bid"
 *     figure is the one number a contractor glances at and trusts, and a
 *     fictional $15,000 inside it is the exact "confusable with a real bid"
 *     failure — worse than an unlabelled row, because nobody inspects a total.
 *
 *   • It is badged everywhere it is listed, and it can be deleted in one click.
 *
 * ── Its prices come from the line snapshots, not from the library ───────────
 * Every shipped material and labor rate in this app costs $0 on purpose
 * (CLAUDE.md § Starter content ships unpriced), so a sample built out of the
 * starter library would price at nothing and demonstrate the opposite of what
 * it is for. Bid line items carry FROZEN snapshots of cost and hours, which is
 * exactly the mechanism needed: the sample's numbers live on its own lines, the
 * library stays untouched at $0, and nothing about the user's own pricing is
 * invented for them. It also happens to demonstrate the snapshot rule itself.
 *
 * The same reasoning applies to overhead and profit: the sample carries its own
 * PER-BID overrides rather than inheriting a new account's unset company
 * defaults, so it shows a marked-up bid on day one without quietly writing a
 * margin into the user's settings.
 */

/** The name is part of the guarantee — see the header. */
export const SAMPLE_BID_NAME = "SAMPLE — Retail buildout, 2,400 sq ft";
export const SAMPLE_CLIENT_NAME = "SAMPLE — Northgate Retail Partners";
export const SAMPLE_SITE_ADDRESS = "1420 Northgate Plaza, Unit 7";

/**
 * The labor rate the sample prices against.
 *
 * Frozen onto the lines, never written to the user's labor rates. A loaded
 * journeyman rate in the range a small shop would actually run.
 */
export const SAMPLE_LABOR_RATE = 68;

/** Overhead and profit, as per-bid overrides. Ordinary figures for the trade. */
export const SAMPLE_OVERHEAD_PCT = 0.12;
export const SAMPLE_MARKUP_PCT = 0.18;

/**
 * One line of the sample.
 *
 * `assemblyName` is matched against the shipped starter library so the line
 * points at a real assembly where one exists — which is what makes "open the
 * assembly behind this line" work. Where it does not match, the line still
 * stands on its own snapshot, exactly as a line whose assembly was later
 * deleted does.
 */
export type SampleLine = {
  assemblyName: string;
  qty: number;
  /** Material cost for ONE, frozen. */
  materialCost: number;
  /** Base hours for ONE, before modifiers. */
  laborHours: number;
  /** Summed modifier fraction, already added rather than compounded. */
  modifierPct?: number;
  modifierNames?: string[];
  /** Which part of the job this is, for the repeating-unit demonstration. */
  unitLabel?: string | null;
};

/**
 * A small commercial retail buildout — the shape of job this app was built
 * around.
 *
 * Chosen over a house because it shows the app doing something a spreadsheet
 * does badly: a few dozen of one device, a handful of another, one big piece of
 * gear, and a labor modifier on the work that happens off a ladder. A
 * three-line job would demonstrate nothing.
 */
export const SAMPLE_LINES: readonly SampleLine[] = [
  {
    assemblyName: "Duplex receptacle standard",
    qty: 24,
    materialCost: 18.5,
    laborHours: 0.75,
  },
  {
    assemblyName: "GFCI receptacle",
    qty: 4,
    materialCost: 34.0,
    laborHours: 0.9,
  },
  {
    assemblyName: "Dedicated 20A receptacle",
    qty: 6,
    materialCost: 46.0,
    laborHours: 1.25,
    // Registers and the cooler — the circuits a retail fit-out always needs.
  },
  {
    assemblyName: "Single-pole switch",
    qty: 8,
    materialCost: 16.0,
    laborHours: 0.6,
  },
  {
    assemblyName: "Dimmer switch",
    qty: 2,
    materialCost: 38.0,
    laborHours: 0.7,
  },
  {
    assemblyName: "Surface-mount ceiling fixture",
    qty: 32,
    materialCost: 92.0,
    laborHours: 1.1,
    // The one line carrying a modifier, so the breakdown has something to show:
    // a 14ft ceiling means every fixture is lift work.
    modifierPct: 0.25,
    modifierNames: ["Working at height (14ft ceiling)"],
  },
  {
    assemblyName: "200A main panel furnish and install",
    qty: 1,
    materialCost: 1850.0,
    laborHours: 12,
  },
];

/** Charges a real retail job carries, to show the expenses layer working. */
export const SAMPLE_EXPENSES: ReadonlyArray<{
  name: string;
  amount: number;
  taxable: boolean;
  markedUp: boolean;
}> = [
  {
    name: "City electrical permit",
    amount: 340,
    // Passed through at cost and not taxed, which is the common treatment —
    // and shows the two switches doing different things.
    taxable: false,
    markedUp: false,
  },
  {
    name: "Scissor lift, one week",
    amount: 425,
    taxable: false,
    markedUp: true,
  },
];

/** What the proposal says the price does and does not cover. */
export const SAMPLE_SCOPE: ReadonlyArray<{
  kind: "include" | "exclude";
  text: string;
}> = [
  {
    kind: "include",
    text: "All rough-in and trim for the sales floor and back of house",
  },
  { kind: "include", text: "Panel, feeders and circuit directory" },
  { kind: "include", text: "Final testing and as-built circuit schedule" },
  { kind: "exclude", text: "Fire alarm, data and low voltage" },
  { kind: "exclude", text: "Utility company charges and transformer" },
  { kind: "exclude", text: "Cutting, patching and painting" },
];

/**
 * The banner shown on the sample bid itself.
 *
 * Says three things, in this order, because that is the order a person needs
 * them: what it is, that touching it is safe, and how to get rid of it.
 */
export const SAMPLE_NOTICE = {
  title: "This is a sample bid",
  body:
    "Nothing here is yours — the prices and hours are illustrative, and your " +
    "own material costs and labor rates are untouched. Change anything you " +
    "like to see how it works; it is left out of your dashboard totals and " +
    "you can delete it whenever you want.",
} as const;

/**
 * Whether a bid should count toward money shown as a company's own figures.
 *
 * The single rule behind "never confusable with a real bid". Anything summing
 * bids into a headline number filters through this, so adding a new total
 * somewhere means calling it rather than remembering the sample exists.
 */
export function countsTowardTotals(bid: {
  isSample?: boolean | null;
}): boolean {
  return !bid.isSample;
}

/**
 * Sum only what is really the contractor's.
 *
 * The Dashboard no longer calls this: its totals go through `sumBidTotals`
 * (@shared/bidTotals), which applies the same `countsTowardTotals` rule AND
 * adds up the lines each bid leaves unpriced. Kept for its test, which pins
 * the sample rule on its own.
 */
export function realBidValue<T extends { isSample?: boolean | null }>(
  bids: readonly T[],
  value: (bid: T) => number
): { total: number; count: number; sampleExcluded: number } {
  let total = 0;
  let count = 0;
  let sampleExcluded = 0;
  for (const bid of bids) {
    if (countsTowardTotals(bid)) {
      total += value(bid);
      count += 1;
    } else {
      sampleExcluded += 1;
    }
  }
  return { total: Math.round(total * 100) / 100, count, sampleExcluded };
}

/**
 * Is this name one the sample seeder produced?
 *
 * Used only to avoid seeding twice and to explain a row to a human. It is NOT
 * how the app decides what is a sample — that is the column. A name check
 * would break the moment a user renamed the bid, which they are free to do.
 */
export function looksLikeSampleName(name: string): boolean {
  return name.trim().toUpperCase().startsWith("SAMPLE —");
}
