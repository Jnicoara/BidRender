/**
 * QuantityLockPanel — freezing a bid's quantities, and saying so.
 *
 * ── Three states, and the quiet one matters as much as the loud one ──────────
 *   locked                → a banner. The numbers on this screen have stopped
 *                           following the plans, and that is the one fact a
 *                           person reading a total needs to know about it.
 *   following, has lines  → one quiet sentence and a button. NOT a warning
 *                           panel: a bid whose quantities follow the drawing is
 *                           a bid working exactly as designed, and a yellow
 *                           strip urging everyone to lock would be the app
 *                           nagging toward its own feature on every draft
 *                           forever (CLAUDE.md § Customization … never in the
 *                           way, rule 3).
 *   nothing from plans    → nothing at all. There is no quantity here a lock
 *                           would hold, so a control offering to hold it is a
 *                           question about nothing.
 *
 * ── Locking is one click; unlocking asks ─────────────────────────────────────
 * Not an inconsistency — the two acts differ in what they do to the numbers on
 * screen. Locking writes down what the bid is ALREADY showing, so nothing moves
 * and there is nothing to warn about. Unlocking hands the quantities back to a
 * drawing that has moved on since, which can change the price of a bid somebody
 * has already sent. So that one names every quantity it will move, by name, with
 * both numbers, and the estimator says yes to a fact rather than to a risk.
 *
 * The copy and the comparison live in shared/quantityLock.ts, which is tested.
 * This file is the wiring — the same split as ArchiveBidDialog and
 * @/lib/archiveBid.
 */
import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import {
  lockedBannerCopy,
  unlockConfirmCopy,
  unlockedNoticeCopy,
} from "@shared/quantityLock";

/**
 * How many changed quantities the confirmation lists before summarising.
 *
 * A dialog is not a report: twelve rows of "name: 14 → 16" stops being read at
 * about the fifth, and the point of naming them is that they are read. The rest
 * are counted, which is still honest — the estimator can cancel and look at the
 * bid.
 */
const MAX_LISTED = 8;

export function QuantityLockPanel({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();
  const state = trpc.bids.quantityLock.useQuery({ bidId });
  const [confirming, setConfirming] = useState(false);

  /**
   * Both mutations refresh the same three things.
   *
   * `bids.get` because every quantity and every total on this screen changes
   * meaning, `bids.quantityLock` because this panel is drawn from it, and
   * `takeoffGroups.list` because the Plans screen reads the lock from there to
   * decide whether a count says "follows your marks" or "locked". Skipping the
   * third leaves that screen confidently telling somebody their marks are moving
   * a bid they have just frozen — the staleness failure CLAUDE.md describes,
   * which is worse than a blank because it is believable.
   */
  const refresh = () => {
    void utils.bids.get.invalidate({ id: bidId });
    void utils.bids.quantityLock.invalidate({ bidId });
    void utils.takeoffGroups.list.invalidate({ bidId });
  };

  const lock = trpc.bids.lockQuantities.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      toast.success(
        result.frozen === 1
          ? "1 quantity is frozen. It no longer follows your plans."
          : `${result.frozen} quantities are frozen. They no longer follow your plans.`
      );
    },
    onSettled: refresh,
  });

  const unlock = trpc.bids.unlockQuantities.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      toast.success("Quantities follow your plans again.");
    },
    onSettled: refresh,
  });

  // Nothing is drawn until the answer is known: a panel that guesses at "not
  // locked" and then corrects itself has told somebody their bid is live when it
  // is frozen, which is the one thing this panel exists to prevent.
  if (!state.data) return null;

  const { lockedAt, followingLines, changes } = state.data;

  if (lockedAt !== null) {
    const copy = lockedBannerCopy(lockedAt, followingLines);
    const confirm = unlockConfirmCopy(changes);
    return (
      <>
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
          {/* Grey, not yellow. A locked bid is not a problem — it is a bid
              somebody has finished. Yellow in this app means "check this". */}
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{copy.title}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {copy.body}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={() => setConfirming(true)}
            disabled={unlock.isPending}
          >
            <LockOpen className="h-3.5 w-3.5" />
            Unlock quantities
          </Button>
        </div>

        <AlertDialog
          open={confirming}
          // Escape and a click outside both mean "leave it locked".
          onOpenChange={open => {
            if (!open) setConfirming(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
            </AlertDialogHeader>
            {confirm.changeLines.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <ul className="space-y-0.5">
                  {confirm.changeLines.slice(0, MAX_LISTED).map(line => (
                    <li
                      key={line}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
                {confirm.changeLines.length > MAX_LISTED && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    and {confirm.changeLines.length - MAX_LISTED} more.
                  </p>
                )}
              </div>
            )}
            <AlertDialogFooter>
              {/* Cancel takes the default focus, so Enter on a dialog nobody
                  meant to open leaves the bid frozen. */}
              <AlertDialogCancel onClick={() => setConfirming(false)}>
                Keep them locked
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setConfirming(false);
                  unlock.mutate({ bidId });
                }}
              >
                Unlock quantities
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (followingLines === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <p className="min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
        {unlockedNoticeCopy(followingLines)}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 text-xs"
        onClick={() => lock.mutate({ bidId })}
        disabled={lock.isPending}
      >
        <Lock className="h-3.5 w-3.5" />
        {lock.isPending ? "Locking…" : "Lock quantities"}
      </Button>
    </div>
  );
}
