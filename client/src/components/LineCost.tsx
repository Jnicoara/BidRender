/**
 * The cost cell of a bid line — the one place that decides what it says.
 *
 * Three states, and none of them is a $0 nobody chose:
 *   • "Can't price" — the engine refused the line (shared/linePricingProblems)
 *   • "Not priced"  — nothing priced it yet (shared/lineNotPriced)
 *   • the money     — everything else, including a typed $0
 *
 * Shared by the bid screen and the Count screen, because two copies of this
 * cell is two chances for one of them to print $0.00 on an unpriced line
 * (CLAUDE.md § "Copying a layout does not copy the behaviour with it").
 */
import { money } from "@/lib/money";
import { cn } from "@/lib/utils";
import { lineNotPriced, type NotPricedLineLike } from "@shared/lineNotPriced";

export function LineCost({
  line,
  className,
}: {
  line: NotPricedLineLike & {
    breakdown: { directCost: number } | null;
    problem?: { message: string; ref?: string | null } | null;
  };
  /** Width and alignment, which differ between the two screens. */
  className?: string;
}) {
  if (line.breakdown === null) {
    return (
      <span
        className={cn("text-xs text-red-500", className)}
        title={line.problem?.message ?? undefined}
      >
        Can't price
        {line.problem?.ref ? (
          <span className="font-mono"> · {line.problem.ref}</span>
        ) : null}
      </span>
    );
  }
  const cost = line.breakdown.directCost;
  if (lineNotPriced(line, cost)) {
    return (
      <span
        className={cn("text-xs text-[#F5C518]", className)}
        title={
          cost > 0
            ? `The material has no price. ${money(cost)} of labor is in the total; the material is not.`
            : "Nothing on this line has a price yet, so it adds nothing to the total."
        }
      >
        Not priced
      </span>
    );
  }
  return (
    <span className={cn("font-mono text-sm", className)}>{money(cost)}</span>
  );
}
