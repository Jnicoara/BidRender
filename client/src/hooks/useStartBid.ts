import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  bidNameFromFilename,
  clearPendingPlan,
  newBidName,
  putPendingPlan,
} from "@/lib/pendingPlanUpload";

/**
 * The three ways to start a bid — upload a plan, count without one, or an
 * empty bid — for the screens OTHER than the Dashboard that offer "New bid"
 * (the Bids list and the Plans list, 2026-10-14).
 *
 * One hook rather than a copy per screen: CLAUDE.md § "Copying a layout does
 * not copy the behaviour with it". It does the same as the Dashboard's own
 * handlers — make the bid, then open the screen the choice was for, with an
 * uploaded file handed over through pendingPlanUpload so the Plans screen is
 * still the one place that decides what a plan may be.
 *
 * The empty bid is named for the day, like Quick bid's, instead of asking for
 * a name first; the name is editable the moment the bid opens.
 */
export function useStartBid(go: {
  openBid: (id: number) => void;
  openPlans: (id: number) => void;
  openCount: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const refresh = () => {
    void utils.bids.dashboard.invalidate();
    void utils.bids.list.invalidate();
    void utils.bids.search.invalidate();
  };

  const fromPlan = trpc.bids.create.useMutation({
    onError: error => {
      clearPendingPlan();
      toast.error(error.message);
    },
    onSuccess: bid => {
      if (!bid) {
        clearPendingPlan();
        return;
      }
      go.openPlans(bid.id);
    },
    onSettled: refresh,
  });

  const counting = trpc.bids.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: bid => {
      if (bid) go.openCount(bid.id);
    },
    onSettled: refresh,
  });

  const empty = trpc.bids.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: bid => {
      if (bid) go.openBid(bid.id);
    },
    onSettled: refresh,
  });

  return {
    uploadPlan: (file: File) => {
      putPendingPlan(file);
      fromPlan.mutate({ name: bidNameFromFilename(file.name) });
    },
    quickBid: () => counting.mutate({ name: newBidName(new Date()) }),
    emptyBid: () =>
      empty.mutate({
        name: `New bid — ${new Date().toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}`,
      }),
    busy: fromPlan.isPending || counting.isPending || empty.isPending,
  };
}
