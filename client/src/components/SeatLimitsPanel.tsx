/**
 * Seats per company, set by hand until billing sets them.
 *
 * ── Why an explicit Save, not InlineNumberField ──────────────────────────────
 * InlineNumberField flashes "saved" the moment a value is committed and saves
 * behind it (CLAUDE.md § Editing fields, rule 4 and Responsiveness rule 1).
 * That is right for an edit the server always accepts. This one it may REFUSE —
 * a limit below members plus pending invites — and a green flash for a write
 * that then bounces is the confirmation-for-nothing rule 4 forbids. So each
 * row is a tiny form: Save waits for the server, and a refusal is shown on the
 * row in the server's own words, which say how many to remove first.
 *
 * Rule 1 still applies (select on focus), Enter saves, Escape reverts.
 */
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { cn } from "@/lib/utils";
import { MAX_SEAT_LIMIT } from "@shared/seats";

type Row = {
  companyId: number;
  companyName: string;
  ownerEmail: string | null;
  seatLimit: number;
  activeMembers: number;
  pendingInvites: number;
  inUse: number;
};

function SeatRow({ row }: { row: Row }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState(String(row.seatLimit));
  const [refusal, setRefusal] = useState<string | null>(null);

  const set = trpc.seatLimits.set.useMutation({
    onSuccess: saved => {
      setRefusal(null);
      setDraft(String(saved.seatLimit));
      toast.success(`${row.companyName}: ${saved.seatLimit} seats.`);
      void utils.seatLimits.list.invalidate();
    },
    onError: error => setRefusal(error.message),
  });

  const parsed = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= MAX_SEAT_LIMIT;
  const changed = valid && parsed !== row.seatLimit;

  const save = () => {
    if (!changed || set.isPending) return;
    set.mutate({ companyId: row.companyId, seatLimit: parsed });
  };
  const revert = () => {
    setDraft(String(row.seatLimit));
    setRefusal(null);
  };

  return (
    <div className="px-4 py-2.5 space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm">
            {row.companyName}
            <span className="ml-2 text-xs text-muted-foreground">
              #{row.companyId}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {row.ownerEmail ?? "—"}
          </p>
        </div>
        <span
          className={cn(
            "text-xs shrink-0",
            // Only OVER is flagged. With a default of one seat, "full" is the
            // ordinary state of nearly every company, and colouring it turned
            // the whole list amber (seen on screen 2026-09-26). Over should
            // never happen — the server refuses it — so if it does, it shouts.
            row.inUse > row.seatLimit
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {row.inUse} of {row.seatLimit} used · {row.activeMembers}{" "}
          {row.activeMembers === 1 ? "member" : "members"}
          {row.pendingInvites > 0 ? `, ${row.pendingInvites} pending` : ""}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SEAT_LIMIT}
            value={draft}
            onFocus={selectOnFocus}
            onChange={e => {
              setDraft(e.target.value);
              setRefusal(null);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") revert();
            }}
            aria-label={`Seat limit for ${row.companyName}`}
            className="h-7 w-20 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!changed || set.isPending}
            onClick={save}
          >
            Save
          </Button>
        </div>
      </div>
      {refusal && (
        <p className="text-xs text-destructive" role="alert">
          {refusal}
        </p>
      )}
    </div>
  );
}

export function SeatLimitsPanel() {
  const { data: rows = [], isLoading } = trpc.seatLimits.list.useQuery();

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold">Seats</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        How many people each company may have — members plus pending invites.
        Set by hand until billing exists. A limit below what a company is
        already using is refused.
      </p>
      {isLoading ? (
        <div className="h-16 rounded bg-muted/40 animate-pulse" />
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-[28rem] overflow-y-auto">
          {rows.map(row => (
            // Keyed on the saved limit too, so a save elsewhere resets the draft.
            <SeatRow key={`${row.companyId}:${row.seatLimit}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
