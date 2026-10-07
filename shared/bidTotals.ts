/**
 * A total built from several bids, and what it leaves out.
 *
 * ── Why this exists (2026-09-27, references/track-b-next-batch-plan.md § 2) ──
 * Each Dashboard card already says "+ 3 lines not priced" beside its figure
 * (owner, 2026-09-26: a total with unpriced lines in it never reads as a bare
 * figure). The totals built FROM those cards — the "Out for bid" headline and
 * each column's figure — summed `totalDue` and said nothing, so four lines
 * nobody priced added $0 to the headline without a word. They were tagged only
 * for lines the engine cannot price at all (`incomplete`), which is a
 * different fact.
 *
 * One function, taking the rows whole, so the headline and a column cannot
 * disagree about what a sum leaves out, and so a later kind of gap has one
 * place to be added.
 *
 * ── The sample is left out of every total ───────────────────────────────────
 * Through `countsTowardTotals`, the same rule `realBidValue` uses. Until this
 * change the column figures included the sample bid's fictional value while
 * the headline did not; both now go through here.
 */
import { NOTHING_NOT_PRICED, type NotPricedTally } from "./lineNotPriced";
import { countsTowardTotals } from "./sampleProject";

export type SummableBid = {
  isSample?: boolean | null;
  /** Lines and parts nobody priced, counted as $0 in the bid's figure. */
  notPriced: NotPricedTally;
  /** The bid's figure leaves out a line the engine cannot price. */
  incomplete: boolean;
};

export type BidTotal = {
  total: number;
  /** Bids summed. */
  count: number;
  /** Sample bids left out of the sum. */
  sampleExcluded: number;
  /** Every summed bid's unpriced lines and parts, added up. */
  notPriced: NotPricedTally;
  /** Some summed bid carries a line the engine cannot price. */
  incomplete: boolean;
};

export function sumBidTotals<T extends SummableBid>(
  bids: readonly T[],
  value: (bid: T) => number
): BidTotal {
  let total = 0;
  let count = 0;
  let sampleExcluded = 0;
  let notPriced = NOTHING_NOT_PRICED;
  let incomplete = false;
  for (const bid of bids) {
    if (!countsTowardTotals(bid)) {
      sampleExcluded += 1;
      continue;
    }
    total += value(bid);
    count += 1;
    notPriced = {
      lines: notPriced.lines + bid.notPriced.lines,
      parts: notPriced.parts + bid.notPriced.parts,
      hours: notPriced.hours + bid.notPriced.hours,
    };
    incomplete = incomplete || bid.incomplete;
  }
  return {
    total: Math.round(total * 100) / 100,
    count,
    sampleExcluded,
    notPriced,
    incomplete,
  };
}
