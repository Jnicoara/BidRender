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
 * ── And the PARTS missing from lines that are otherwise priced (0087) ────────
 * An assembly of two lugs and half an hour is priced — the labor is real
 * money — while the lugs in it are not. The line reads "$25.00 + 1 part not
 * priced", and the total counts the part: "+ 2 lines, 1 part not priced".
 * Two numbers, not one sum, because a line and a part are different things
 * and "3 not priced" would not say which to go and look for.
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
import {
  countNotPriced,
  type NotPricedTally,
  type PartsLineLike,
} from "@shared/lineNotPriced";

function whole(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "1 part" / "3 parts", or "" for none — the words a line carries. */
export function partsNotPricedWords(parts: number): string {
  const n = whole(parts);
  return n === 0 ? "" : `${plural(n, "part")} not priced`;
}

/**
 * "+ 4 lines not priced", "+ 1 part not priced",
 * "+ 2 lines, 3 parts not priced", or "" for none.
 */
export function notPricedSuffix(notPriced: NotPricedTally): string {
  const lines = whole(notPriced.lines);
  const parts = whole(notPriced.parts);
  const pieces = [
    lines > 0 ? plural(lines, "line") : "",
    parts > 0 ? plural(parts, "part") : "",
  ].filter(Boolean);
  return pieces.length === 0 ? "" : `+ ${pieces.join(", ")} not priced`;
}

/**
 * The same tally as a sentence's subject: "1 line is not priced",
 * "3 parts are not priced", "2 lines and 1 part are not priced". `one` is
 * true when it names a single thing, so the sentence around it can say "it".
 */
export function notPricedHeadline(notPriced: NotPricedTally): {
  text: string;
  one: boolean;
} {
  const lines = whole(notPriced.lines);
  const parts = whole(notPriced.parts);
  const pieces = [
    lines > 0 ? plural(lines, "line") : "",
    parts > 0 ? plural(parts, "part") : "",
  ].filter(Boolean);
  const one = lines + parts === 1;
  return {
    text:
      pieces.length === 0
        ? ""
        : `${pieces.join(" and ")} ${one ? "is" : "are"} not priced`,
    one,
  };
}

/** Whether a total leaves anything out at all. */
export function anyNotPriced(notPriced: NotPricedTally): boolean {
  return notPricedSuffix(notPriced) !== "";
}

/** The whole total as one string: "$4,210.00 + 4 lines not priced". */
export function totalWithNotPriced(
  formattedAmount: string,
  notPriced: NotPricedTally
): string {
  const suffix = notPricedSuffix(notPriced);
  return suffix ? `${formattedAmount} ${suffix}` : formattedAmount;
}

/**
 * How much of a bid the totals leave out — for lines as `bids.get` returns
 * them, with the pricing engine's breakdown on each (null when the line could
 * not be priced at all).
 */
export function bidNotPricedCount(
  lines: readonly (PartsLineLike & {
    breakdown: { directCost: number } | null;
  })[]
): NotPricedTally {
  return countNotPriced(
    lines.map(line => ({
      line,
      directCost: line.breakdown?.directCost ?? null,
    }))
  );
}
