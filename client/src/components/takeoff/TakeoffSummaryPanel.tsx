/**
 * THE WHOLE PLAN SET: WHAT IS ON THE BID, WHAT IS NOT YET, AND WHY — and the
 * one button that sends the rest.
 *
 * references/track-b-deletes-summary-pan-plan.md §§ 2–3. The data is
 * `takeoffSummary.forBid` (shared/takeoffSummary.ts); this only lays it out.
 *
 *  - "Not on the bid yet — N" is AMBER and OPEN whenever N > 0. It is the
 *    thing that makes a bid look finished when it is not, so it is never a
 *    grey line and never folded away. Since 2026-09-30 its ROWS fold by
 *    reason, one amber line per reason with its count (`foldNotOnBid`;
 *    track-b-phone-and-readability-plan.md § 2.4) — every reason and every
 *    count stays on screen, only the rows behind each wait for a press.
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
import {
  foldNotOnBid,
  type NotOnBidFold,
  type RunPlace,
  type SummaryItem,
  type TakeoffSummary,
} from "@shared/takeoffSummary";

function qtyText(item: SummaryItem): string {
  if (item.qty === null) return "";
  if (item.unit === "runs") return "";
  const n =
    item.unit === "ft"
      ? item.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : item.qty.toLocaleString();
  return item.unit === "ft" ? `${n} ft` : `${n}`;
}

/** A row: 14px, its quantity never in the muted grey (plan § 2, items 2 and 5). */
function ItemRow({
  item,
  why,
  onPickWire,
}: {
  item: SummaryItem;
  why: string | null;
  onPickWire?: (to: RunPlace) => void;
}) {
  return (
    <li className="py-1">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <span className="shrink-0 tabular-nums">{qtyText(item)}</span>
      </div>
      {/* The run type on its own line: as a prefix it took the room at 280px
          and the item itself was what got cut off (seen 2026-09-30). */}
      {item.group ? (
        <p className="truncate text-xs text-muted-foreground">{item.group}</p>
      ) : null}
      {why ? <p className="text-xs text-warning">{why}</p> : null}
      <FixHere item={item} onPickWire={onPickWire} />
    </li>
  );
}

/**
 * THE FIX, WHERE THE PROBLEM IS SAID (never-stuck rule, 2026-10-08). An item
 * no Send can fix used to end at a sentence: "Wire for 1 conduit run", and
 * nothing to press. Now the "no wire" item opens the first such run with its
 * wire picker open; that run's own line offers "No wire (empty pipe)" too.
 */
function FixHere({
  item,
  onPickWire,
  onDone,
}: {
  item: SummaryItem;
  onPickWire?: (to: RunPlace) => void;
  onDone?: () => void;
}) {
  if (!item.fixAt || !onPickWire) return null;
  const to = item.fixAt;
  return (
    <button
      type="button"
      className="mt-1 min-h-8 text-sm underline text-warning hover:text-foreground"
      onClick={() => {
        onDone?.();
        onPickWire(to);
      }}
    >
      {item.qty === 1
        ? "Go to the run and pick its wire"
        : "Go to the first one and pick its wire"}
    </button>
  );
}

/**
 * One reason, its count, and its rows behind one press. The line is a
 * warning row — amber on a tinted band — so it reads as a different kind of
 * row and not as another grey one.
 */
function FoldRow({
  fold,
  onPickWire,
}: {
  fold: NotOnBidFold;
  onPickWire?: (to: RunPlace) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded bg-warning/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex w-full min-h-8 items-center gap-1.5 px-2 py-1 text-left text-sm text-warning"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">{fold.label}</span>
        <span className="shrink-0 tabular-nums font-medium">{fold.count}</span>
      </button>
      {open ? (
        <div className="px-2 pb-1.5">
          {fold.why ? (
            <p className="text-xs text-muted-foreground">{fold.why}</p>
          ) : null}
          <ul className="mt-0.5 divide-y divide-border/60">
            {fold.items.map(item => (
              <ItemRow
                key={item.key}
                item={item}
                why={item.ownWhy}
                onPickWire={onPickWire}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function TakeoffSummaryPanel({
  summary,
  sending,
  onSendAll,
  onPickWire,
}: {
  summary: TakeoffSummary | undefined;
  sending: boolean;
  /** Called with the keys the preview showed. */
  onSendAll: (expect: string[]) => void;
  /** Open a run with no wire, its wire picker open. */
  onPickWire: (to: RunPlace) => void;
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
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <TriangleAlert className="w-4 h-4 shrink-0" />
            Not on the bid yet — {notOnBid.length}
          </p>
          <ul className="mt-1.5 space-y-1">
            {foldNotOnBid(notOnBid).map(fold => (
              <FoldRow key={fold.id} fold={fold} onPickWire={onPickWire} />
            ))}
          </ul>
          {n > 0 ? (
            <Button
              size="sm"
              className="mt-2 h-8 text-sm w-full"
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
            aria-expanded={showOnBid}
            className="flex min-h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowOnBid(v => !v)}
          >
            {showOnBid ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            On the bid — {onBid.length}
          </button>
          {showOnBid ? (
            <ul className="mt-1 px-2 divide-y divide-border/60">
              {onBid.map(item => (
                <ItemRow key={item.key} item={item} why={null} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
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
                {item.note ? (
                  <span className="block text-xs text-muted-foreground">
                    {item.note}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{qtyText(item)}</span>
              <span className="shrink-0 text-xs">
                {item.notPriced ? (
                  <span className="text-warning">Not priced</span>
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
                  <FixHere
                    item={item}
                    onPickWire={onPickWire}
                    onDone={() => setPreviewing(false)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
