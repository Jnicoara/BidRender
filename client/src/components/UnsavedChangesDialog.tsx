import { useSyncExternalStore } from "react";
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
  answerLeave,
  isAskingToLeave,
  subscribeUnsaved,
} from "@/lib/unsavedGuard";

/**
 * The one "Discard changes?" question, mounted once in the shell. It opens
 * whenever something asks to leave an editor holding unsaved work
 * (@/lib/unsavedGuard).
 */
export default function UnsavedChangesDialog() {
  const open = useSyncExternalStore(subscribeUnsaved, isAskingToLeave);
  return (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next) answerLeave(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            What you changed here has not been saved. Leaving now throws it
            away.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={() => answerLeave(true)}>
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
