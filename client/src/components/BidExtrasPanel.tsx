/**
 * Flat charges on a bid, plus the scope panel beneath them.
 *
 * Includes and excludes used to live in here as a second flat list; they moved
 * to `ScopeNotesPanel`, which lays them out as the two columns the proposal
 * actually prints.
 *
 * The charges themselves are `BidExpensesSection`, shared with Quick bid's
 * "Job costs" so the two screens add a charge the same way (2026-10-10).
 */
import { trpc } from "@/lib/trpc";
import { ScopeNotesPanel } from "@/components/ScopeNotesPanel";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { BidExpensesSection } from "@/components/BidExpensesSection";
import { money } from "@/lib/money";

export function BidExtrasPanel({ bidId }: { bidId: number }) {
  // The same query the section reads, so this costs no second request.
  const onBidExpenses = trpc.bidExtras.expenses.onBid.useQuery({ bidId });
  const expenses = onBidExpenses.data ?? [];
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      {/* Shut until there is a reason to open it. The summary carries the
          count and the money, which is the whole of what a closed panel has to
          answer — an estimator checking a bid before sending wants to know
          whether there are charges on it, not to re-read the form. */}
      <CollapsiblePanel
        id="bid-expenses"
        title="Additional expenses"
        summary={
          expenses.length === 0
            ? "Permits, inspections, anything not in an assembly"
            : `${expenses.length} charge${expenses.length === 1 ? "" : "s"} · ${money(expensesTotal)}`
        }
      >
        <BidExpensesSection bidId={bidId} />
      </CollapsiblePanel>

      <ScopeNotesPanel bidId={bidId} />
    </div>
  );
}
