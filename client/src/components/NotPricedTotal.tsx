/**
 * A bid total, and — when lines on the bid are unpriced — how many it leaves
 * out: "$4,210.00 + 4 lines not priced" (owner, 2026-09-26).
 *
 * The total's half of what LineCost does for a line. Shared by the bid screen
 * and the Count screen for the same reason LineCost is: two copies of this are
 * two chances for one of them to show a bare figure that is quietly short.
 * The words come from `@/lib/notPricedTotal`, where they are tested.
 *
 * The figure keeps the styling the caller gives it; the caveat is smaller and
 * amber, the colour of the "Not priced" cells it counts, so the eye finds the
 * number first and the admission right beside it. It wraps under the figure
 * rather than pushing it off a narrow card.
 */
import { cn } from "@/lib/utils";
import { notPricedSuffix } from "@/lib/notPricedTotal";

export function NotPricedTotal({
  amount,
  notPriced,
  className,
}: {
  /** Already formatted — `money` or `moneyWhole`, the screen's choice. */
  amount: string;
  /** From `bidNotPricedCount`. */
  notPriced: number;
  /** The figure's own classes (font, size, colour). */
  className?: string;
}) {
  const suffix = notPricedSuffix(notPriced);
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 text-right">
      <span className={className}>{amount}</span>
      {suffix && (
        <span
          className="text-[11px] font-sans text-[#F5C518] whitespace-nowrap"
          title="Lines nobody has priced add nothing to this total. Each says “Not priced” on the bid."
        >
          {suffix}
        </span>
      )}
    </span>
  );
}
