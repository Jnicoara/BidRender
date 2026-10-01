/**
 * THE WHOLE PLAN SET: WHAT IS ON THE BID, WHAT IS NOT YET, AND WHY — and the
 * one button that sends the rest.
 *
 * references/track-b-deletes-summary-pan-plan.md §§ 2–3. The data is
 * `takeoffSummary.forBid` (shared/takeoffSummary.ts); this only lays it out.
 *
 *  - "Not on the bid yet — N" is AMBER and OPEN whenever N > 0. It is the
 *    thing that makes a bid look finished when it is not, so it is never a
 *    grey line and never folded away.
 *  - "On the bid — M" is folded: it is the reassurance, not the work.
 *  - Words in a panel, never a badge on the drawing (§ 5f.0 OVERRIDE 2).
 *
 * "Send N to bid…" opens ONE preview (ConfirmDialog, non-destructive) with
 * both lists: what will go, and what cannot and why. The press sends the
 * keys the preview showed; the server refuses if they no longer match.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SummaryItem, TakeoffSummary } from "@shared/takeoffSummary";

function qtyText(item: SummaryItem): string {
  if (item.qty === null) return "";
  if (item.unit === "runs") return "";
  const n =
    item.unit === "ft"
      ? item.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : item.qty.toLocaleString();
  return item.unit === "ft" ? `${n} ft` : `${n}`;
}

function ItemRow({ item, showWhy }: { item: SummaryItem; showWhy: boolean }) {
  return (
    <li className="py-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate">
          {item.group ? (
            <span className="text-muted-foreground">{item.group} · </span>
          ) : null}
          {item.name}
        </span>
        <span className="shrink-0 tabular-nums">{qtyText(item)}</span>
      </div>
      {showWhy && item.why ? (
        <p className="text-[0.7rem] text-muted-foreground">{item.why}</p>
      ) : null}
    </li>
  );
}

export function TakeoffSummaryPanel({
  summary,
  sending,
  onSendAll,
}: {
  summary: TakeoffSummary | undefined;
  sending: boolean;
  /** Called with the keys the preview showed. */
  onSendAll: (expect: string[]) => void;
}) {
  const [showOnBid, setShowOnBid] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  if (!summary) return null;
  const { onBid, notOnBid, sendable } = summary;
  if (onBid.length === 0 && notOnBid.length === 0) return null;

  const willGo = notOnBid.filter(i => i.send !== null);
  const cannot = notOnBid.filter(i => i.send === null);
  const n = sendable.length;

  return (
    <div className="border-b border-border px-3 py-2.5 space-y-2">
      {notOnBid.length > 0 ? (
        <section>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#F5C518]">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0" />
            Not on the bid yet — {notOnBid.length}
          </p>
          <ul className="mt-1 divide-y divide-border/60">
            {notOnBid.map(item => (
              <ItemRow key={item.key} item={item} showWhy />
            ))}
          </ul>
          {n > 0 ? (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs w-full"
              disabled={sending}
              onClick={() => setPreviewing(true)}
            >
              {sending ? "Sending…" : `Send ${n} to bid…`}
            </Button>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">
          Everything counted and traced is on the bid.
        </p>
      )}

      {onBid.length > 0 ? (
        <section>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowOnBid(v => !v)}
          >
            {showOnBid ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            On the bid — {onBid.length}
          </button>
          {showOnBid ? (
            <ul className="mt-1 divide-y divide-border/60">
              {onBid.map(item => (
                <ItemRow key={item.key} item={item} showWhy={false} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="text-[0.65rem] text-muted-foreground">
        Runs not finished yet still count on the bid. A free count goes on with
        no price, and the bid says "Not priced" until you type one.
      </p>

      <ConfirmDialog
        open={previewing}
        onOpenChange={setPreviewing}
        title={`Send ${n} to the bid?`}
        actionLabel={`Send ${n} to bid`}
        tone="default"
        disabled={sending || n === 0}
        onConfirm={() => {
          setPreviewing(false);
          onSendAll(sendable);
        }}
      >
        <p className="font-medium text-foreground">
          Will go on the bid ({willGo.length})
        </p>
        <ul className="divide-y divide-border/60">
          {willGo.map(item => (
            <li key={item.key} className="flex items-baseline gap-2 py-1">
              <span className="min-w-0 flex-1">
                {item.group ? `${item.group} · ` : ""}
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{qtyText(item)}</span>
              <span className="shrink-0 text-xs">
                {item.notPriced ? (
                  <span className="text-[#F5C518]">Not priced</span>
                ) : (
                  "new line"
                )}
              </span>
            </li>
          ))}
        </ul>
        {cannot.length > 0 ? (
          <>
            <p className="pt-2 font-medium text-foreground">
              Cannot go on the bid ({cannot.length})
            </p>
            <ul className="divide-y divide-border/60">
              {cannot.map(item => (
                <li key={item.key} className="py-1">
                  <span>
                    {item.group ? `${item.group} · ` : ""}
                    {item.name}
                  </span>
                  <span className="block text-xs">{item.why}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
