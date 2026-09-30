/**
 * ONE confirm for the Plans screen, sized to what is lost.
 *
 * references/track-b-deletes-summary-pan-plan.md § 1.1. Every confirm that
 * guards a loss — a whole count, a run, a sheet — and the Send all preview
 * use this, so they behave the same:
 *
 *  - the title NAMES what is lost ("Delete run R3, 84 ft, 2 drops?");
 *  - the action button says what it does ("Delete run"), never "Yes";
 *  - Cancel has focus when it opens (Radix's default, not overridden);
 *  - ENTER NEVER PRESSES THE ACTION (@/lib/confirmKeys). Space and a click do.
 *
 * `tone: "destructive"` is red; "default" is for a confirm that adds, like
 * Send all, where red would read as danger that is not there.
 */
import type { ReactNode } from "react";
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
import { actionKeyAllowed } from "@/lib/confirmKeys";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  cancelLabel = "Cancel",
  actionLabel,
  tone,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is lost, or what will happen — lines, a list. */
  children: ReactNode;
  cancelLabel?: string;
  /** Names the act: "Delete run", "Send 5 to bid". Never "Yes" or "OK". */
  actionLabel: string;
  tone: "destructive" | "default";
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85dvh] flex flex-col">
        <AlertDialogHeader className="shrink-0">
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogDescription asChild>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-sm">
            {children}
          </div>
        </AlertDialogDescription>
        <AlertDialogFooter className="shrink-0">
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            className={
              tone === "destructive"
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
            onKeyDown={e => {
              if (!actionKeyAllowed(e.key)) e.preventDefault();
            }}
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
