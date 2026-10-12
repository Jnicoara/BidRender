import { useCallback } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * "Count these as existing" on an old "- EXISTING TO REMAIN" twin count
 * (shared/twinFold.ts) — ONE hook for the bid screen and the Plans screen's
 * status bar, so the fold and its Undo cannot drift between them (CLAUDE.md
 * § "Copying a layout does not copy the behaviour").
 *
 * The fold moves marks, so every screen's counts and marks are told — the
 * caller's `refresh`, plus the takeoff lists here.
 *
 * ── When there is an Undo, and why only then ─────────────────────────────────
 * Undo puts the marks back on the twin as they were. It needs the twin to
 * still exist, which it does exactly when a bid line holds it
 * (`twinKept`) — and that is also exactly when the fold moves a NUMBER: a
 * twin on no line priced nothing, and folding it changes only which count
 * the marks sit under. So the rule "a change that moves a bid number comes
 * with Undo" holds, and a fold with no line says plainly that there is
 * nothing on the bid to put back.
 */
export function useFoldTwin(
  bidId: number,
  refresh: () => void,
  /** After a fold lands — the Plans screen notes it on its undo arrow. */
  onFolded?: () => void
) {
  const utils = trpc.useUtils();
  const unfoldMove = trpc.takeoffStamps.moveToGroup.useMutation();
  const unfoldStatus = trpc.takeoffStamps.setStatus.useMutation();
  const afterFold = useCallback(() => {
    refresh();
    void utils.takeoffGroups.invalidate();
    void utils.takeoffStamps.invalidate();
    void utils.bids.get.invalidate({ id: bidId });
  }, [refresh, utils, bidId]);

  return trpc.takeoffGroups.foldExistingTwin.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: (result, vars) => {
      onFolded?.();
      const marks = `${result.moved} mark${result.moved === 1 ? "" : "s"}`;
      const backToNew = result.previous
        .filter(m => m.status === null || m.status === "new")
        .map(m => m.id);
      toast.success(
        `${marks} now count as existing to remain on ${result.baseLabel}.`,
        result.twinKept && result.moved > 0
          ? {
              action: {
                label: "Undo",
                onClick: () =>
                  void (async () => {
                    try {
                      await unfoldMove.mutateAsync({
                        ids: result.previous.map(m => m.id),
                        groupId: vars.id,
                      });
                      if (backToNew.length > 0)
                        await unfoldStatus.mutateAsync({
                          bidId,
                          ids: backToNew,
                          status: null,
                        });
                      toast.success("Put back.");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : String(error)
                      );
                    } finally {
                      afterFold();
                    }
                  })(),
              },
            }
          : {
              description:
                "Nothing on the bid moved — that count was not on it.",
            }
      );
    },
    onSettled: afterFold,
  });
}
