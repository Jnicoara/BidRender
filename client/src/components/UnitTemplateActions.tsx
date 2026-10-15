/**
 * The two bulk actions a template offers: push its current lines onto the
 * copies still following it, and archive those copies.
 *
 * Both confirm first, and neither ever runs on its own. Pushing rewrites whole
 * units and archiving removes them from the bid — the estimator is the only one
 * who knows whether the edit they just made was meant for one room or forty, so
 * the app never guesses on their behalf.
 *
 * The wording lives in @/lib/unitLinks, which is tested. This is wiring.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArrowDownToLine } from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import {
  archiveCopiesConfirmCopy,
  pushConfirmCopy,
  pushDoneCopy,
  templateActionsEnabled,
  type ConfirmCopy,
  type UnitState,
} from "@/lib/unitLinks";
import { errorText } from "@/lib/errorText";

type Pending = { kind: "push" | "archive"; copy: ConfirmCopy };

export function UnitTemplateActions({
  bidId,
  state,
  onDone,
}: {
  bidId: number;
  state: UnitState;
  onDone: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);

  const push = trpc.bids.pushToLinkedCopies.useMutation({
    onError: error => toast.error(errorText(error)),
    onSuccess: result => {
      toast.success(pushDoneCopy(result));
      onDone();
    },
  });

  const restore = trpc.bids.restoreUnits.useMutation({
    onError: error => toast.error(errorText(error)),
    onSuccess: () => {
      toast.success("Copies restored.");
      onDone();
    },
  });

  const archive = trpc.bids.archiveLinkedCopies.useMutation({
    onError: error => toast.error(errorText(error)),
    onSuccess: result => {
      // The undo lives in the toast rather than a Trash screen: this is a bulk
      // removal someone may regret within seconds, and the fastest correct
      // response is the one right where the mistake was made.
      toast.success(
        `Archived ${result.archived.length} cop${result.archived.length === 1 ? "y" : "ies"}.`,
        {
          action:
            result.archived.length > 0
              ? {
                  label: "Undo",
                  onClick: () =>
                    restore.mutate({ bidId, unitLabels: result.archived }),
                }
              : undefined,
          duration: 10000,
        }
      );
      onDone();
    },
  });

  if (!templateActionsEnabled(state)) return null;

  const run = () => {
    if (pending?.kind === "push") {
      push.mutate({ bidId, templateLabel: state.label });
    } else if (pending?.kind === "archive") {
      archive.mutate({ bidId, templateLabel: state.label });
    }
    setPending(null);
  };

  const busy = push.isPending || archive.isPending;

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() =>
          setPending({
            kind: "push",
            copy: pushConfirmCopy(
              state.label,
              state.linkedCount,
              state.forkedCount
            ),
          })
        }
      >
        <ArrowDownToLine className="w-3 h-3" />
        Push to {state.linkedCount}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
        onClick={() =>
          setPending({
            kind: "archive",
            copy: archiveCopiesConfirmCopy(
              state.label,
              state.linkedCount,
              state.forkedCount
            ),
          })
        }
      >
        <Archive className="w-3 h-3" />
        Archive {state.linkedCount}
      </Button>

      <AlertDialog
        open={pending !== null}
        // Escape and a click outside both mean "no", same as Cancel.
        onOpenChange={open => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.copy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.copy.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Cancel holds default focus, so Enter on a dialog nobody meant to
                open changes nothing. */}
            <AlertDialogCancel onClick={() => setPending(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={run}>
              {pending?.copy.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
