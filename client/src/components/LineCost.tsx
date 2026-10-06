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
import {
  lineMaterialNotPriced,
  lineNotPriced,
  linePartsNotPriced,
  type PartsLineLike,
} from "@shared/lineNotPriced";
import { partsNotPricedWords } from "@/lib/notPricedTotal";

export function LineCost({
  line,
  className,
}: {
  line: PartsLineLike & {
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
  /*
    Priced, but with $0 parts inside (0087) — an assembly of two lugs and
    half an hour shows the labor as money, and says the lugs are missing from
    it. Same amber as "Not priced", smaller than the figure, and wrapping
    under it rather than pushing it off a narrow column.
  */
  /*
    Labor, and NO material at all (owner, 2026-10-05): never fully priced.
    Said as what it is — "material not priced" — rather than as a part
    count, because there may be no parts to count: a light pole whose
    assembly is all labor read "$510.00" and looked finished.
  */
  const materialMissing =
    lineMaterialNotPriced(line, cost) && Math.floor(line.unpricedParts) <= 0;
  const parts = materialMissing
    ? "material not priced"
    : partsNotPricedWords(linePartsNotPriced(line, cost));
  if (parts) {
    return (
      <span
        className={cn(
          "inline-flex flex-wrap items-baseline justify-end gap-x-1",
          className
        )}
      >
        <span className="font-mono text-sm">{money(cost)}</span>
        <span
          className="text-[11px] text-[#F5C518] whitespace-nowrap"
          title={
            materialMissing
              ? `${money(cost)} of labor is in the total. This line has no material price, so its material is not.`
              : "This line's price was frozen when it was added, and some of the assembly's parts had no price then. They add nothing to it."
          }
        >
          + {parts}
        </span>
      </span>
    );
  }
  return (
    <span className={cn("font-mono text-sm", className)}>{money(cost)}</span>
  );
}
