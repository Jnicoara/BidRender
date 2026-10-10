import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Remove a bid line, with Undo — shared by the bid screen and Quick bid so the
 * two cannot drift (CLAUDE.md § "Copying a layout does not copy the behaviour").
 *
 * The line leaves the list at once (optimistic, as before). The toast's Undo
 * sends back the server's sealed packet, which puts the SAME row back — its
 * frozen prices included — rather than re-adding the assembly at today's
 * prices (owner, 2026-09-30; server/bidLineRestore.ts). No packet (no restore
 * secret configured) means a plain toast with no button, never a button that
 * cannot work.
 *
 * `refresh` is the screen's one helper every line mutation goes through, so a
 * restored line moves every number a removed one did.
 */
export function useRemoveBidLine(bidId: number, refresh: () => void) {
  const utils = trpc.useUtils();

  const restoreLine = trpc.bids.restoreLine.useMutation({
    onSuccess: () => toast.success("Line put back."),
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  return trpc.bids.removeLine.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      const name = previous?.lines.find(line => line.id === vars.id)?.name;
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            lines: old.lines.filter(line => line.id !== vars.id),
          }
      );
      return { previous, name };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSuccess: (result, _vars, context) => {
      const undo = result.undo;
      toast.success(
        context?.name ? `Removed ${context.name}.` : "Removed one line.",
        undo
          ? {
              action: {
                label: "Undo",
                onClick: () => restoreLine.mutate({ bidId, undo }),
              },
            }
          : undefined
      );
    },
    onSettled: refresh,
  });
}
