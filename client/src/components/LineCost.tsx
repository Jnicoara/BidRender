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
  lineHoursNotSet,
  lineMaterialNotPriced,
  lineNotPriced,
  type PartsLineLike,
} from "@shared/lineNotPriced";
import { lineShortfallWords } from "@/lib/notPricedTotal";
import type { LineExampleFlags } from "@shared/exampleTags";
import { ExampleTags } from "./ExampleTags";
import { TapExplain } from "./TapExplain";
import { FixableLabel } from "./FixableLabel";

export function LineCost({
  line,
  className,
  onFix,
}: {
  /**
   * Opens the line's "fix this line" panel (bid screen only, gap 11). Given,
   * the amber words become that button; the panel says what they explained.
   */
  onFix?: () => void;
  line: PartsLineLike &
    LineExampleFlags & {
      breakdown: { directCost: number } | null;
      problem?: { message: string; ref?: string | null } | null;
    };
  /** Width and alignment, which differ between the two screens. */
  className?: string;
}) {
  /*
    Every explanation in this cell opens on a TAP as well as a hover
    (TapExplain). They were `title` attributes, which a finger cannot reach,
    so on a tablet "Not priced" said what was wrong and never why
    (references/never-stuck-plan.md, gap 3).
  */
  if (line.breakdown === null) {
    const why =
      line.problem?.message ?? "The pricing engine refused this line.";
    return (
      <TapExplain
        explanation={why}
        className={cn("text-xs text-red-500", className)}
      >
        Can't price
        {line.problem?.ref ? (
          <span className="font-mono"> · {line.problem.ref}</span>
        ) : null}
      </TapExplain>
    );
  }
  const cost = line.breakdown.directCost;
  if (lineNotPriced(line, cost)) {
    if (onFix)
      return (
        <FixableLabel
          onFix={onFix}
          className={cn("text-xs text-[#F5C518]", className)}
        >
          Not priced
        </FixableLabel>
      );
    return (
      <TapExplain
        explanation={
          cost > 0
            ? `The material has no price. ${money(cost)} of labor is in the total; the material is not.`
            : "Nothing on this line has a price yet, so it adds nothing to the total."
        }
        className={cn("text-xs text-[#F5C518]", className)}
      >
        Not priced
      </TapExplain>
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
  /*
    Hours not set (D1, 2026-09-29): the labor adds nothing and says so —
    "+ hours not set" — rather than leaving the material figure to read as
    the whole cost of the work. The words come from `lineShortfallWords`,
    which counts with the total's own rule.
  */
  const materialMissing =
    lineMaterialNotPriced(line, cost) && Math.floor(line.unpricedParts) <= 0;
  const hoursMissing = lineHoursNotSet(line);
  const parts = lineShortfallWords(line, cost);
  if (parts) {
    return (
      <span
        className={cn(
          "inline-flex flex-wrap items-baseline justify-end gap-x-1",
          className
        )}
      >
        <span className="font-mono text-sm">{money(cost)}</span>
        {onFix ? (
          <FixableLabel
            onFix={onFix}
            className="text-[11px] text-[#F5C518] whitespace-nowrap"
          >
            + {parts}
          </FixableLabel>
        ) : (
          <TapExplain
            className="text-[11px] text-[#F5C518] whitespace-nowrap"
            explanation={
              hoursMissing && parts === "hours not set"
                ? `${money(cost)} of material is in the total. The assembly's hours were not set when this line was added, so its labor is not.`
                : materialMissing
                  ? `${money(cost)} of labor is in the total. This line has no material price, so its material is not.`
                  : "This line's price was frozen when it was added, and some of the assembly's parts (or its hours) had no price then. They add nothing to it."
            }
          >
            + {parts}
          </TapExplain>
        )}
        <ExampleTags line={line} only={["price"]} />
      </span>
    );
  }
  /*
    "Example price" (0132): the money is real, but BidRidge's number, not
    the shop's. Wraps under the figure on a narrow column, like "+ parts".
    The hours and rate tags sit in the hours cell, beside what they explain.
  */
  if (line.snapshotPriceWasExample) {
    return (
      <span
        className={cn(
          "inline-flex flex-wrap items-baseline justify-end gap-x-1",
          className
        )}
      >
        <span className="font-mono text-sm">{money(cost)}</span>
        <ExampleTags line={line} only={["price"]} />
      </span>
    );
  }
  return (
    <span className={cn("font-mono text-sm", className)}>{money(cost)}</span>
  );
}
