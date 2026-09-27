/**
 * How a bid total admits the lines it leaves out.
 *
 * ── The decision (owner, 2026-09-26) ─────────────────────────────────────────
 * A bid total with unpriced lines in it reads "$4,210 + 4 lines not priced",
 * never a bare figure. The bare figure is the wrong-number failure this app is
 * built against: a total quietly short by four parts reads exactly like a
 * finished one. The per-line half already shipped (a line nobody priced says
 * "Not priced", `shared/lineNotPriced.ts`); this is the total's half.
 *
 * ── When EVERY line is unpriced, the $0 stays ────────────────────────────────
 * "$0 + 4 lines not priced", not "4 lines not priced". The figure is still what
 * the total adds up to, and dropping it would make this the one total on the
 * screen that is not a number. The words next to it are what stop the $0 being
 * read as an answer.
 *
 * ── The figure comes in formatted ────────────────────────────────────────────
 * The caller formats with `money` or `moneyWhole` — the precision is the
 * screen's decision (`client/src/lib/money.ts`), and the caveat must read the
 * same at either precision.
 *
 * The count itself is `countNotPriced` in `shared/lineNotPriced.ts`, the same
 * rule the line cell uses, so a total and its lines cannot disagree about
 * which lines are unpriced. `bidNotPricedCount` below is that rule applied to
 * lines as the bid screens hold them.
 */
import { countNotPriced, type NotPricedLineLike } from "@shared/lineNotPriced";

/** "+ 1 line not priced" / "+ 4 lines not priced", or "" for none. */
export function notPricedSuffix(notPriced: number): string {
  if (!Number.isFinite(notPriced) || notPriced <= 0) return "";
  const n = Math.floor(notPriced);
  return `+ ${n} line${n === 1 ? "" : "s"} not priced`;
}

/** The whole total as one string: "$4,210.00 + 4 lines not priced". */
export function totalWithNotPriced(
  formattedAmount: string,
  notPriced: number
): string {
  const suffix = notPricedSuffix(notPriced);
  return suffix ? `${formattedAmount} ${suffix}` : formattedAmount;
}

/**
 * How many of a bid's lines the totals leave out — for lines as `bids.get`
 * returns them, with the pricing engine's breakdown on each (null when the
 * line could not be priced at all).
 */
export function bidNotPricedCount(
  lines: readonly (NotPricedLineLike & {
    breakdown: { directCost: number } | null;
  })[]
): number {
  return countNotPriced(
    lines.map(line => ({
      line,
      directCost: line.breakdown?.directCost ?? null,
    }))
  );
}
