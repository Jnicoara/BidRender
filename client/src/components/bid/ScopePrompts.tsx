/**
 * "WHO DOES THIS?" — the shipped prompts on a bid (scope-tags-plan.md step
 * 6a). Lines that look like work whose scope is often split (light
 * fixtures, permits, trenching…) and that nobody has answered yet, grouped
 * by prompt, with the four chips.
 *
 * Asks, never answers: the matching is `matchScopePrompts`
 * (shared/scopePrompts.ts), and an answer is the line menu's own call
 * (`useSetLineScope`) — same Undo, same refusals, same refresh. Closed by
 * default; never blocks print or send; absent on a locked bid. "Don't ask on
 * this bid" (S3) hides it on this bid only, and "Ask again" brings it back.
 */
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useSetLineScope } from "@/hooks/useSetLineScope";
import {
  LINE_SCOPES,
  scopeChoicesFor,
  scopeLabel,
  type LineScope,
} from "@shared/lineScope";
import type { ScopePrompt } from "@shared/scopePrompts";
import type { FinderLine } from "./ScopeNoteFinder";

type Match = { prompt: ScopePrompt; lines: FinderLine[] };

export function ScopePrompts({
  bidId,
  matches,
  refresh,
}: {
  bidId: number;
  matches: readonly Match[];
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dismiss = useDismissScopePrompts(bidId);
  const items = matches.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 min-h-10 text-left"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90"
          )}
        />
        <span className="text-sm font-medium">
          Who does this? — {items} {items === 1 ? "item" : "items"}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          Nothing changes until you pick
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {matches.map(match => (
            <PromptRow
              key={match.prompt.key}
              bidId={bidId}
              match={match}
              refresh={refresh}
            />
          ))}
          <button
            type="button"
            onClick={() => dismiss.mutate({ bidId, dismissed: true })}
            disabled={dismiss.isPending}
            className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground min-h-8 px-1"
          >
            Don’t ask on this bid
          </button>
        </div>
      )}
    </div>
  );
}

/** The quiet way back after "Don't ask on this bid". */
export function ScopePromptsOff({ bidId }: { bidId: number }) {
  const dismiss = useDismissScopePrompts(bidId);
  return (
    <div className="flex flex-wrap items-center gap-x-2 px-4 py-2 min-h-10 text-xs text-muted-foreground">
      <span>“Who does this?” is off for this bid.</span>
      <button
        type="button"
        onClick={() => dismiss.mutate({ bidId, dismissed: false })}
        disabled={dismiss.isPending}
        className="underline underline-offset-2 hover:text-foreground min-h-8 px-1"
      >
        Ask again
      </button>
    </div>
  );
}

/**
 * Optimistic, with Undo: the card changes at once and the column follows.
 * Only `bids.get` holds the column, so only it is touched.
 */
function useDismissScopePrompts(bidId: number) {
  const utils = trpc.useUtils();
  const mutation = trpc.bids.setScopePromptsDismissed.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            bid: {
              ...old.bid,
              scopePromptsDismissedAt: vars.dismissed ? new Date() : null,
            },
          }
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSuccess: (_result, vars) => {
      if (vars.dismissed)
        toast.success("Won’t ask “Who does this?” on this bid.", {
          action: {
            label: "Undo",
            onClick: () => mutation.mutate({ bidId, dismissed: false }),
          },
        });
    },
    onSettled: () => void utils.bids.get.invalidate({ id: bidId }),
  });
  return mutation;
}

function PromptRow({
  bidId,
  match,
  refresh,
}: {
  bidId: number;
  match: Match;
  refresh: () => void;
}) {
  const { prompt, lines } = match;
  // The prompt asked about exactly these lines, so they start ticked; untick
  // any it should not touch. Nothing is applied until a chip is picked.
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const setScope = useSetLineScope(bidId, refresh);
  const ticked = lines.filter(l => !unticked.has(l.id));
  const takes = (tag: LineScope) =>
    ticked.filter(l => scopeChoicesFor(l).includes(tag));

  return (
    <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
      <p className="text-sm font-medium">
        {prompt.label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {lines.length} {lines.length === 1 ? "line" : "lines"}
        </span>
      </p>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {lines.map(line => (
          <li key={line.id}>
            <label className="flex items-center gap-2 text-sm min-h-8">
              <Checkbox
                checked={!unticked.has(line.id)}
                onCheckedChange={value => {
                  const next = new Set(unticked);
                  if (value === true) next.delete(line.id);
                  else next.add(line.id);
                  setUnticked(next);
                }}
              />
              <span className="min-w-0 flex-1 truncate">
                {line.name}
                {line.unitLabel && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {line.unitLabel}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={`Who does ${prompt.label.toLowerCase()}?`}
      >
        {LINE_SCOPES.map(tag => {
          const lineIds = takes(tag).map(l => l.id);
          return (
            <button
              key={tag}
              type="button"
              disabled={lineIds.length === 0 || setScope.isPending}
              onClick={() => setScope.mutate({ bidId, lineIds, scopeTag: tag })}
              className="rounded-full border border-border px-2.5 py-1 min-h-8 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
            >
              {scopeLabel(tag)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
