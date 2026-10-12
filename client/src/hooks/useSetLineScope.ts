import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { scopeLabel, type LineScope } from "@shared/lineScope";

/**
 * "Who does this?" on a bid line, with Undo (0146; scope-tags-plan.md
 * step 3). Shared by every screen that offers it, so the menu, the prompts
 * and the note finder cannot drift (CLAUDE.md § "Copying a layout does not
 * copy the behaviour").
 *
 * The tag shows at once (optimistic); the money follows the refetch, because
 * what a tag does to a total is the server's rule (shared/lineScope.ts) and
 * guessing it here would be a second copy. The toast's Undo sends back each
 * line's tag as it was — NULL included, so an Undo returns "not said" rather
 * than "We install".
 *
 * Everything the tag moves is invalidated HERE, not only in `refresh`: the
 * bid (totals and cost cells), the materials list, the drops readout and the
 * proposal. A query that this missed would state yesterday's number in the
 * voice of a fresh one (CLAUDE.md § "a screen showing yesterday's answer");
 * `client/src/lib/lineScopeWired.test.ts` reads this file for each of them.
 */
export function useSetLineScope(bidId: number, refresh: () => void) {
  const utils = trpc.useUtils();

  const refreshAll = () => {
    refresh();
    void utils.bids.get.invalidate({ id: bidId });
    void utils.materialsList.get.invalidate({ bidId });
    void utils.takeoffRuns.drops.invalidate({ bidId });
    void utils.proposals.document.invalidate({ bidId });
    void utils.bids.list.invalidate();
  };

  const undo = trpc.bids.setLineScope.useMutation({
    onSuccess: () => toast.success("Put back."),
    onError: error => toast.error(error.message),
    onSettled: refreshAll,
  });

  return trpc.bids.setLineScope.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      const tagOf = new Map<number, LineScope | null>(
        "changes" in vars
          ? vars.changes.map(c => [c.id, c.scopeTag])
          : vars.lineIds.map(id => [id, vars.scopeTag])
      );
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            lines: old.lines.map(line =>
              tagOf.has(line.id)
                ? { ...line, scopeTag: tagOf.get(line.id) ?? null }
                : line
            ),
          }
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSuccess: (result, vars) => {
      const count = result.changes.length;
      const tag = "changes" in vars ? null : vars.scopeTag;
      const what = tag === null ? "We install" : scopeLabel(tag);
      toast.success(
        count === 1 ? `Marked ${what}.` : `Marked ${count} lines ${what}.`,
        {
          action: {
            label: "Undo",
            onClick: () => undo.mutate({ bidId, changes: result.previous }),
          },
        }
      );
    },
    onSettled: refreshAll,
  });
}
