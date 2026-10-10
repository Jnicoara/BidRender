/**
 * A count's REMOVE / RELOCATE labor, on its card (owner, 2026-10-05;
 * shared/roleLines.ts).
 *
 * - The note says what is not priced, and only that: a kind whose labor line
 *   is already on the bid drops out of "labor not on the bid".
 * - Its FIX-IT is right here: "Add remove labor to bid" sends the missing
 *   labor line(s) — the same send the card's "Send N" uses, which adds only
 *   what the bid lacks.
 * - This bid's own hours sit behind ONE fold ("Hours…"), closed by default:
 *   blank follows the assembly's hours, and a set value reaches lines sent
 *   after it. A line already on the bid keeps what it froze.
 *
 * Hours are a MEASUREMENT: blank shows "the assembly's", never 0.
 */
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { InlineNumberField } from "@/components/InlineNumberField";
import { unpricedStatusNote, type StatusSplit } from "@shared/markStatus";
import type { GroupBridgeState } from "./RunsPanel";

export function CountLaborNote({
  groupId,
  split,
  state,
  locked,
  busy,
  onSendToBid,
}: {
  groupId: number | null;
  split: StatusSplit;
  state: GroupBridgeState | undefined;
  locked: boolean;
  busy: boolean;
  onSendToBid?: (groupId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const setHours = trpc.takeoffGroups.setLaborRoleHours.useMutation({
    onError: error => toast.error(error.message),
    onSettled: () => void utils.takeoffGroups.list.invalidate(),
  });

  const onBid = {
    remove: state?.laborRolesOnBid?.includes("remove") ?? false,
    relocate: state?.laborRolesOnBid?.includes("relocate") ?? false,
  };
  const note = unpricedStatusNote(split, onBid);
  const waiting = state?.laborRolesWaiting ?? [];
  const kinds = (["remove", "relocate"] as const).filter(k => split[k] > 0);
  if (!note && kinds.length === 0) return null;

  const fixLabel =
    waiting.length === 2
      ? "Add remove and relocate labor to bid"
      : waiting[0] === "remove"
        ? "Add remove labor to bid"
        : "Add relocate labor to bid";

  return (
    <div className="space-y-0.5">
      {note && (
        <p className="text-[0.7rem] text-amber-600 dark:text-amber-400">
          {note}
        </p>
      )}
      {groupId !== null &&
        !locked &&
        (waiting.length > 0 || kinds.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {waiting.length > 0 && onSendToBid && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSendToBid(groupId)}
                className="text-xs underline underline-offset-2 text-amber-700 dark:text-amber-300 hover:text-foreground disabled:opacity-60"
              >
                {busy ? "Sending…" : fixLabel}
              </button>
            )}
            {kinds.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
              >
                Hours…
              </button>
            )}
          </div>
        )}
      {open && groupId !== null && !locked && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {kinds.map(kind => {
            const own = state?.laborHours?.[kind] ?? null;
            return (
              <label
                key={kind}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                {kind === "remove" ? "Remove" : "Relocate"} each
                <InlineNumberField
                  value={own === null ? null : Number(own)}
                  whenUnset={{ placeholder: "the assembly's" }}
                  onSave={next =>
                    setHours.mutate({ id: groupId, role: kind, hours: next })
                  }
                  onClear={() =>
                    setHours.mutate({ id: groupId, role: kind, hours: null })
                  }
                  rules={{ min: 0, max: 999 }}
                  suffix="h"
                  className="h-7 w-28 text-sm"
                  ariaLabel={`${kind === "remove" ? "Remove" : "Relocate"} hours on this bid`}
                />
              </label>
            );
          })}
          <p className="basis-full text-[0.7rem] text-muted-foreground">
            This bid only. Blank follows the assembly. Lines already on the bid
            keep their hours.
          </p>
        </div>
      )}
    </div>
  );
}
