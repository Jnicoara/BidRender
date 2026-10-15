/**
 * "This bid is in Recently deleted" — on the bid's own screens.
 *
 * Drilled 2026-10-15 (references/overnight-log.md 6s): archive a bid in one
 * tab and every edit from another tab still saved — to a bid that looked
 * live and would be deleted for good when its 30 days ran out. Nothing on
 * the bid page or Count screen read `archivedAt`. The server still accepts
 * the edits (blocking them means guarding every route that touches a bid,
 * plan-screen routes included — todo.md); this makes the state impossible
 * to miss and one click to undo.
 *
 * The date, not "N days left": the deadline is the server's archive time
 * plus the retention period, so it needs no browser clock — the reason the
 * Recently deleted screen has its days counted on the server.
 */
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorText } from "@/lib/errorText";
import { trpc } from "@/lib/trpc";
import { purgeDueAt } from "@shared/retention";

export function ArchivedBidNotice({
  bidId,
  archivedAt,
}: {
  bidId: number;
  archivedAt: Date | string | null | undefined;
}) {
  const utils = trpc.useUtils();
  const restore = trpc.bids.restore.useMutation({
    onSuccess: () => {
      toast.success("Bid restored — it's back on your dashboard.");
      void utils.bids.get.invalidate({ id: bidId });
      void utils.bids.archived.invalidate();
      void utils.bids.dashboard.invalidate();
      void utils.bids.list.invalidate();
    },
    onError: error => toast.error(errorText(error)),
  });
  if (!archivedAt) return null;
  const due = purgeDueAt(new Date(archivedAt)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <p className="flex-1 min-w-[12rem] text-sm">
        <span className="font-medium">This bid is in Recently deleted.</span>{" "}
        <span className="text-muted-foreground">
          It will be deleted for good on {due}, with any changes you make here.
          Restore it to keep working on it.
        </span>
      </p>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 shrink-0"
        disabled={restore.isPending}
        onClick={() => restore.mutate({ id: bidId })}
      >
        <ArchiveRestore className="w-3.5 h-3.5" />
        Restore
      </Button>
    </div>
  );
}
