/**
 * MathChangeStrip — "Total changed because…" and "Update to the current math"
 * (owner Q14 and Q22, 2026-10-12; references/baseline-screen-plan.md § 8,
 * shared/mathVersion.ts).
 *
 * Two jobs, one place, on the bid screen and Quick bid — NEVER the proposal:
 *
 *   - a Draft whose total moved because the app's math changed says so, with
 *     the old and new number and the reason, until somebody presses "Got it"
 *     (`bid_math_changes.seenAt`). A total that moved and said nothing is the
 *     failure this exists for;
 *   - a Draft still on older math (moved back to Draft, or missed by a
 *     release) OFFERS the update. A button only: it shows old → new first,
 *     and nothing moves until it is pressed.
 *
 * Renders nothing when there is nothing to say, which is nearly always.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/money";
import {
  mathChangeSentence,
  mathUpdatePreviewSentence,
} from "@shared/mathVersion";

export function MathChangeStrip({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();
  const state = trpc.bids.mathChanges.useQuery({ bidId });
  const [confirming, setConfirming] = useState(false);
  const preview = trpc.bids.mathUpdatePreview.useQuery(
    { bidId },
    { enabled: confirming }
  );

  // Everything a math move or a dismissal can change on these two screens.
  const refresh = () => {
    void utils.bids.mathChanges.invalidate({ bidId });
    void utils.bids.mathUpdatePreview.invalidate({ bidId });
    void utils.bids.get.invalidate({ id: bidId });
    void utils.bids.list.invalidate();
    void utils.takeoffGroups.list.invalidate({ bidId });
    void utils.proposals.document.invalidate({ bidId });
    void utils.quoteApp.get.invalidate({ bidId });
  };

  const dismiss = trpc.bids.dismissMathChanges.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refresh,
  });
  const update = trpc.bids.updateMath.useMutation({
    onSuccess: () => {
      setConfirming(false);
      toast.success("This bid now uses the current math.");
    },
    onError: e => toast.error(e.message),
    onSettled: refresh,
  });

  const changes = state.data?.changes ?? [];
  const canUpdate = state.data?.canUpdate ?? false;
  if (changes.length === 0 && !canUpdate) return null;

  return (
    <div className="mb-4 space-y-2">
      {changes.length > 0 && (
        // Yellow-bordered: this is "check this" — a number moved.
        <div
          className="flex items-start gap-3 rounded-xl border border-[#F5C518]/50 bg-[#F5C518]/5 px-4 py-3"
          role="status"
        >
          <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-[#F5C518]" />
          <div className="min-w-0 flex-1 space-y-1">
            {changes.map(change => (
              <p key={change.id} className="text-sm leading-snug">
                {mathChangeSentence(change, money)}
              </p>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
            onClick={() => dismiss.mutate({ bidId })}
            disabled={dismiss.isPending}
          >
            Got it
          </Button>
        </div>
      )}

      {canUpdate && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
            {confirming && preview.data
              ? mathUpdatePreviewSentence(preview.data, money)
              : confirming && preview.isLoading
                ? "Working out what would change…"
                : "This Draft is priced by older math. Nothing changes unless you update it."}
          </p>
          {confirming ? (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setConfirming(false)}
              >
                Keep as is
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => update.mutate({ bidId })}
                disabled={!preview.data || update.isPending}
              >
                {update.isPending ? "Updating…" : "Update"}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              onClick={() => setConfirming(true)}
            >
              Update to the current math
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
