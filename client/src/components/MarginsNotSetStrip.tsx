/**
 * "Profit / overhead not set" on the bid (owner, 2026-10-16). The bid
 * follows a company default of 0 that nobody chose, so it adds nothing for
 * profit or overhead while looking complete. Amber, with the one button that
 * fixes it — Settings › Pricing — like the unset labor rate for traced runs
 * there. A label only; the rule and its limits are in shared/marginsNotSet.ts.
 *
 * Reads `bids.get`, so every mutation that refreshes the bid refreshes this
 * too; renders nothing when both are set, which is the usual case.
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  marginsNotSetSentence,
  type MarginsNotSet,
} from "@shared/marginsNotSet";

export function MarginsNotSetStrip({
  marginsNotSet,
}: {
  marginsNotSet: MarginsNotSet | undefined;
}) {
  const sentence = marginsNotSet ? marginsNotSetSentence(marginsNotSet) : null;
  if (!sentence) return null;
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 px-4 py-2.5"
      role="status"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-xs leading-snug text-amber-700 dark:text-amber-300">
        {sentence}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 text-xs"
        onClick={() => {
          window.location.hash = "/settings/pricing";
        }}
      >
        Set in Settings › Pricing
      </Button>
    </div>
  );
}
