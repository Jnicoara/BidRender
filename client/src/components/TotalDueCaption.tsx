/**
 * The words above a bid's amount on every LIST of bids — the dashboard cards,
 * "Find a bid", the archive — saying which number it is.
 *
 * ── Why a list has to say ────────────────────────────────────────────────────
 * A bid has two numbers that both look like "the price". The bid screen names
 * them: "Bid price" is the work alone, "Total due" is what the customer owes
 * (every charge, and sales tax). Until 2026-09-27 the lists showed a third
 * figure, unlabelled, which matched neither on a bid with a plain charge or
 * tax — and a contractor quoting off the dashboard could not tell which one
 * they were reading. The lists now show total due and say so (owner,
 * 2026-09-27), in the bid screen's own words.
 *
 * One component rather than the same span three times, so the three lists
 * cannot drift apart in what they call it.
 */
import { cn } from "@/lib/utils";

/** The bid screen's own name for the line; the lists use exactly this. */
export const TOTAL_DUE_LABEL = "Total due";

export function TotalDueCaption({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wide text-muted-foreground whitespace-nowrap",
        className
      )}
      title="Everything the customer owes: the work, every charge, and sales tax — the bid's own Total due."
    >
      {TOTAL_DUE_LABEL}
    </span>
  );
}
