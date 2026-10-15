/**
 * The two prompts in front of removing a library item.
 *
 * ── Two steps, said differently on purpose ───────────────────────────────────
 * Archiving is reversible and Delete forever is not, so the two dialogs are
 * deliberately not variations on one another:
 *
 *   Archive        neutral wording, default button, says where it goes and
 *                  that nothing is lost. It is a safe action and should not
 *                  read as a dangerous one.
 *   Delete forever destructive styling, says plainly that it cannot be undone,
 *                  and offers the safer alternative in the same breath.
 *
 * Dressing them alike is how people learn to click through both without
 * reading, which costs them the one that matters.
 *
 * Shared by Materials, Assemblies, Kits and Modifiers so the wording cannot
 * drift between screens.
 */
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

/** What is pending, in the singular language of whichever screen asked. */
export type PendingItem = { id: number; name: string };

/**
 * Confirm an archive.
 *
 * `noun` is the screen's own word ("material", "assembly", "kit", "modifier")
 * so the sentence reads naturally rather than saying "item" everywhere.
 * `stillUsedNote` is the reassurance specific to that screen — an archived
 * material keeps its id, so assemblies referencing it are untouched.
 */
export function ArchiveItemDialog({
  pending,
  noun,
  stillUsedNote,
  onClose,
  onConfirm,
}: {
  pending: PendingItem | null;
  noun: string;
  stillUsedNote?: string;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={open => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive “{pending?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This moves the {noun} to Archived. It is{" "}
            <strong>not deleted</strong> — nothing about it is lost, and you can
            restore it from the Archived tab at any time. There is no time
            limit.
            {stillUsedNote ? (
              <>
                <br />
                <br />
                {stillUsedNote}
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel takes default focus, so Enter on a dialog nobody meant to
              open keeps the row. */}
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pending) onConfirm(pending.id);
              onClose();
            }}
          >
            Archive {noun}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Confirm a permanent delete. Reachable only from the Archived view.
 *
 * `keepsNote` says what already-priced work retains, because the real question
 * behind this dialog is "will this change a bid I already sent".
 */
export function DeleteForeverDialog({
  pending,
  noun,
  keepsNote,
  onClose,
  onConfirm,
}: {
  pending: PendingItem | null;
  noun: string;
  keepsNote?: string;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={open => !open && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{pending?.name}” forever?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the {noun}. It will not appear in the
            Archived list and <strong>cannot be undone</strong>.
            {keepsNote ? <> {keepsNote}</> : null}
            <br />
            <br />
            If you only want it out of the way, leave it archived instead —
            archived ones stay recoverable indefinitely.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (pending) onConfirm(pending.id);
              onClose();
            }}
          >
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
