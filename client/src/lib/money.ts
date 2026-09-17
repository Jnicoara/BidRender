/**
 * How money is written on screen.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * This was defined fifteen times — once in nearly every screen that shows a
 * figure, each a hand-copied `toLocaleString` block. They all agreed, which is
 * exactly what made it dangerous: nothing was visibly wrong, so nothing would
 * have caught the sixteenth copy being written with the wrong precision, or one
 * of the fifteen being "tidied" out of step. A contractor comparing the
 * Dashboard against the bid it links to would have been the detector, on a day
 * they were busy.
 *
 * ── Three precisions, and they are a product decision ────────────────────────
 * Not a formatting preference — see `references/writing-style.md` § 8.
 *
 *   `moneyWhole`  0 decimals   Bid totals and dashboard figures. Read at a
 *                              glance, often a column of them; cents are noise
 *                              and make the column harder to scan.
 *   `money`       2 decimals   The working numbers: line items, labor rates,
 *                              kit and assembly costs, anything on a proposal.
 *                              The default, and what to reach for when unsure.
 *   `unitCost`    2-4 decimals Material unit cost ONLY. A wire nut really does
 *                              cost $0.0432, and rounding it to $0.04 is an 8%
 *                              error multiplied by a box of 500.
 *
 * `unitCost` keeps a MINIMUM of 2 so a $3 fitting reads `$3.00` beside a
 * `$0.0432` wire nut rather than `$3`, which would look like a different kind
 * of number in the same column.
 *
 * ── Do not add a fourth ──────────────────────────────────────────────────────
 * If a screen seems to want one, it is worth asking what it is really showing.
 * Four precisions is the point at which nobody can predict what a figure will
 * look like, and an estimator who cannot predict it starts checking every one.
 *
 * US dollars throughout. There is no currency setting, and the day there is,
 * this is the one file that has to learn about it.
 */

/** The shared shape. Every tier is this with different precision. */
function format(value: number, min: number, max: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/**
 * Whole dollars — bid totals, dashboard figures, an annual salary.
 *
 * `$13,375` rather than `$13,375.51`. Used where figures stack into a column
 * that gets scanned rather than read.
 */
export function moneyWhole(value: number): string {
  return format(value, 0, 0);
}

/**
 * Two decimals — the working numbers, and the default.
 *
 * Line items, hourly rates, assembly and kit costs, everything printed on a
 * proposal. When in doubt, this one.
 */
export function money(value: number): string {
  return format(value, 2, 2);
}

/**
 * Material unit cost — two decimals, up to four when the price is small.
 *
 * `$0.0432` for a wire nut, `$3.00` for a fitting. Nothing but a material's
 * per-unit price should use this; a line item's total is `money`.
 *
 * Takes a string as well as a number because material costs arrive from the
 * database as decimal strings, and `Number("")` is 0 rather than an error —
 * the caller that wants to show "no price yet" has to check before calling.
 */
export function unitCost(value: number | string): string {
  return format(Number(value), 2, 4);
}
