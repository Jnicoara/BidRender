/**
 * "Your bids are using example labor rates" — shown until every shipped
 * example rate (0134) has been replaced by the shop's own.
 *
 * Owner, 2026-10-07: a new shop gets BidRidge's example LOADED rates so a
 * first bid is not priced at $0 labor, and is told so until it sets its own.
 * The rate multiplies every line (CLAUDE.md § "Starter content ships
 * unpriced"), so this is a banner and not just a tag on each line.
 *
 * Read from the library rows' own flag, through the same list query the
 * Labor rates screen edits — so typing a rate there clears this with no
 * extra invalidation to remember. Not on the customer quote, ever.
 */
import { Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export function ExampleRatesBanner({ className }: { className?: string }) {
  const { data: rates = [] } = trpc.laborRates.list.useQuery();
  const examples = rates.filter(r => r.isExampleRate === true);
  if (examples.length === 0) return null;
  const names = examples.map(r => r.name).join(", ");
  return (
    <div
      className={cn(
        "rounded-lg border border-sky-500/30 bg-sky-500/[0.05] px-4 py-3 flex items-start gap-3",
        className
      )}
    >
      <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-medium">
          Labor is priced from BidRidge's example rates
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {names} {examples.length === 1 ? "is" : "are"} still on the example
          loaded rate — a typical wage plus payroll tax, workers' comp,
          insurance and benefits, not your shop's.{" "}
          <a
            href="#/library/labor-rates"
            className="text-sky-400 underline-offset-2 hover:underline"
          >
            Set your own rates
          </a>
        </p>
      </div>
    </div>
  );
}
