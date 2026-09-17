/**
 * BidArchivePage — archived bids, counting down to permanent deletion.
 *
 * ── The countdown here is real ───────────────────────────────────────────────
 * The app's older Trash screen showed "N days left" that nothing enforced:
 * there was no scheduled job, so the number was decoration and archived work
 * stayed forever. This one is backed by an actual sweep
 * (server/scheduled/purgeArchivedBids.ts), which is why the wording commits to
 * a date rather than hedging.
 *
 * The number itself is computed SERVER-side and sent down. A laptop with a
 * wrong clock would otherwise show a deadline that disagrees with the deletion
 * that actually happens, and the deletion is the one that matters.
 *
 * ── Restore is the loud action, delete is the quiet one ──────────────────────
 * Restoring is free and reversible; deleting now is neither. So Restore is the
 * primary button on every row and "Delete now" is a muted icon that opens a
 * confirmation naming the bid. The user got here to rescue something.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Archive, ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RETENTION_DAYS, type RetentionUrgency } from "@shared/retention";
import { moneyWhole } from "@/lib/money";

/** Only a deadline worth acting on gets colour. The rest stays quiet. */
const URGENCY_STYLE: Record<RetentionUrgency, string> = {
  expiring: "text-destructive border-destructive/40 bg-destructive/10",
  soon: "text-[#F5C518] border-[#F5C518]/40 bg-[#F5C518]/10",
  normal: "text-muted-foreground border-border bg-muted/40",
};

const formatDeleteDate = (value: string | Date) =>
  new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

type ArchivedBid = {
  id: number;
  name: string;
  status: string;
  daysRemaining: number;
  urgency: RetentionUrgency;
  purgeDueAt: string | Date;
};

export default function BidArchivePage({
  onBack,
  onOpenBid,
}: {
  onBack: () => void;
  onOpenBid: (bidId: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.bids.archived.useQuery();
  const [confirmDelete, setConfirmDelete] = useState<ArchivedBid | null>(null);

  const invalidate = () => {
    void utils.bids.archived.invalidate();
    void utils.bids.dashboard.invalidate();
    void utils.bids.list.invalidate();
  };

  const restore = trpc.bids.restore.useMutation({
    onSuccess: (_result, variables) => {
      const bid = rows.find(r => r.id === variables.id);
      toast.success(`${bid?.name ?? "Bid"} is back on your dashboard.`);
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const deleteForever = trpc.bids.deleteForever.useMutation({
    onSuccess: () => {
      toast.success("Bid deleted permanently.");
      invalidate();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Archive className="w-4 h-4 text-muted-foreground" /> Archive
            </h1>
            <p className="text-xs text-muted-foreground">
              Archived bids stay here for {RETENTION_DAYS} days, then they are
              deleted for good. Restore one any time before its date.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="space-y-2 max-w-3xl">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-16 rounded-xl border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="max-w-3xl rounded-xl border border-border bg-card p-10 text-center">
            <Archive className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing archived</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
              Archiving a bid takes it off the dashboard without deleting it —
              useful for a job that is finished or one you are no longer
              chasing. Anything you archive shows up here with {RETENTION_DAYS}{" "}
              days to change your mind.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {rows.map(bid => (
              <div
                key={bid.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <button
                    className="text-sm font-medium truncate hover:text-[#F5C518] transition-colors text-left"
                    onClick={() => onOpenBid(bid.id)}
                    title={`Open ${bid.name}`}
                  >
                    {bid.name}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {bid.status}
                    </span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">
                      {bid.lineCount} {bid.lineCount === 1 ? "line" : "lines"}
                    </span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {moneyWhole(bid.finalPrice)}
                    </span>
                  </div>
                </div>

                {/* The countdown, with the actual date underneath it. "9 days
                    left" tells you the urgency; the date tells you the
                    deadline without arithmetic. */}
                <div className="text-right shrink-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[0.7rem] font-medium",
                      URGENCY_STYLE[bid.urgency]
                    )}
                  >
                    {bid.daysRemaining === 0
                      ? "Deleting shortly"
                      : `${bid.daysRemaining} ${bid.daysRemaining === 1 ? "day" : "days"} left`}
                  </Badge>
                  <p className="text-[0.7rem] text-muted-foreground mt-1">
                    Deletes {formatDeleteDate(bid.purgeDueAt)}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  onClick={() => restore.mutate({ id: bid.id })}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(bid as ArchivedBid)}
                  aria-label={`Delete ${bid.name} permanently`}
                  title="Delete now, without waiting"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={open => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{confirmDelete?.name}” for good?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the bid, every line on it and any plans attached to
              it, right now — rather than on{" "}
              {confirmDelete
                ? formatDeleteDate(confirmDelete.purgeDueAt)
                : "its date"}
              . It cannot be undone. If you are not sure, leave it here and it
              will delete itself when the time is up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete)
                  deleteForever.mutate({ id: confirmDelete.id });
                setConfirmDelete(null);
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
