import { useState } from "react";
import { toast } from "sonner";
import { Archive, FileStack } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { BidSearchPanel } from "@/components/BidSearchPanel";
import { NewBidMenu } from "@/components/StartBidCards";
import { ArchiveBidDialog } from "@/components/ArchiveBidDialog";
import { useCompany } from "@/hooks/useCompany";
import { useStartBid } from "@/hooks/useStartBid";
import { type PendingArchive } from "@/lib/archiveBid";
import { RETENTION_DAYS } from "@shared/retention";

/**
 * Bids — every bid, as one searchable list (owner, 2026-10-14: "main nav =
 * daily work: Dashboard, Bids, Plans …").
 *
 * The Dashboard is a board by stage, built for a glance at what is live. This
 * is the other question — "where is that job?" — answered by the SAME search
 * the Dashboard's "Find a bid" opens (`BidSearchPanel`: server-side, keyset
 * paginated), shown open and filling the screen rather than folded away. One
 * search, two places, so the two can never disagree about what a bid is.
 *
 * It is not the "which one?" dead end that took the old Bids entry out of the
 * nav: the list IS the content, and "New bid" starts one from here.
 */
export default function BidListPage({
  onOpenBid,
  onOpenPlans,
  onCount,
  onOpenArchive,
}: {
  onOpenBid: (id: number) => void;
  onOpenPlans: (id: number) => void;
  onCount: (id: number) => void;
  onOpenArchive: () => void;
}) {
  const access = useCompany();
  const start = useStartBid({
    openBid: onOpenBid,
    openPlans: onOpenPlans,
    openCount: onCount,
  });
  const [confirmArchive, setConfirmArchive] = useState<PendingArchive | null>(
    null
  );

  const utils = trpc.useUtils();
  const { data: archived = [] } = trpc.bids.archived.useQuery();
  const restoreBid = trpc.bids.restore.useMutation({
    onError: error => toast.error(error.message),
    onSettled: () => {
      void utils.bids.search.invalidate();
      void utils.bids.dashboard.invalidate();
      void utils.bids.archived.invalidate();
    },
  });
  const archiveBid = trpc.bids.archive.useMutation({
    // The name is read when the archive is asked for: by the time it succeeds
    // the dialog has closed and `confirmArchive` is null.
    onMutate: () => ({ name: confirmArchive?.name }),
    onError: error => toast.error(error.message),
    onSuccess: (_result, { id }, context) => {
      toast.success(
        `${context?.name ?? "Bid"} archived — ${RETENTION_DAYS} days to change your mind.`,
        { action: { label: "Undo", onClick: () => restoreBid.mutate({ id }) } }
      );
    },
    onSettled: () => {
      void utils.bids.search.invalidate();
      void utils.bids.dashboard.invalidate();
      void utils.bids.archived.invalidate();
    },
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="page-header border-b border-border px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <FileStack className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Bids</h1>
            <p className="text-xs text-muted-foreground">
              Every bid, newest first. Search by job name, client or address.
            </p>
          </div>
          {/* Only once something is in it — same rule as the Dashboard: an
              entry to an empty room is a door to nowhere. */}
          {archived.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={onOpenArchive}
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
              <span className="text-muted-foreground">{archived.length}</span>
            </Button>
          )}
          {access.can("bids.edit") && (
            <NewBidMenu
              onUploadPlan={start.uploadPlan}
              onQuickBid={start.quickBid}
              onEmptyBid={start.emptyBid}
              busy={start.busy}
            />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
        <BidSearchPanel
          onOpenBid={onOpenBid}
          onArchive={
            access.can("bids.edit")
              ? bid => setConfirmArchive({ id: bid.id, name: bid.name })
              : undefined
          }
        />
      </div>

      <ArchiveBidDialog
        pending={confirmArchive}
        onClose={() => setConfirmArchive(null)}
        onArchive={id => archiveBid.mutate({ id })}
      />
    </div>
  );
}
