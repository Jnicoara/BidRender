/**
 * FIND ALL MATCHING on the sheet: the rings over each copy, and the panel
 * that says what was found and takes the decisions. 2026-10-01.
 *
 * The finding is @/lib/findMatching (in the PDF worker); what a click
 * decides is @/lib/findMatchingSession. Nothing here is stored: a ring is an
 * offer, and only "Count it" places a mark — an ordinary one, through the
 * same queue as a click.
 *
 * The rings live in the sheet's overlay, inside the zoom, so each one sits on
 * its symbol at every zoom; only the rings take the pointer, so the drawing
 * still pans and the armed count still places marks between them. The panel
 * is portalled to the screen layer, like the symbol-naming form, for the
 * reason SymbolCapture.tsx records: inside the zoom it scales and moves off
 * the window.
 */
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchBox } from "@/lib/findMatching";
import {
  aiBatch,
  clearOpen,
  itemKind,
  summary,
  type ItemKind,
  type MatchItem,
} from "@/lib/findMatchingSession";
import { DEMOLITION_REASON } from "@/lib/scanMatching";

const RING: Record<ItemKind, { stroke: string; dash: string; tag: string }> = {
  clear: { stroke: "#22D3EE", dash: "5 3", tag: "" },
  needsLook: { stroke: "#F59E0B", dash: "3 2", tag: "?" },
  maybeExisting: { stroke: "#94A3B8", dash: "2 2", tag: "E?" },
  already: { stroke: "#64748B", dash: "1 3", tag: "" },
  // On a demolition plan: offered, never counted unless chosen.
  demolition: { stroke: "#FB7185", dash: "1 2", tag: "D" },
};

export function MatchLayer({
  width,
  height,
  renderScale,
  items,
  selectedId,
  onSelect,
}: {
  width: number;
  height: number;
  renderScale: number;
  items: readonly MatchItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full z-10 pointer-events-none select-none"
      aria-label="Matches found on this sheet"
    >
      {items
        .filter(i => i.state === "open")
        .map(item => {
          const kind = itemKind(item);
          const look = RING[kind];
          const r =
            (Math.max(item.halfWidth, item.halfHeight) + 2.5) * renderScale;
          const cx = item.x * renderScale;
          const cy = item.y * renderScale;
          const selected = item.id === selectedId;
          return (
            <g
              key={item.id}
              className={
                kind === "already"
                  ? undefined
                  : "pointer-events-auto cursor-pointer"
              }
              onPointerDown={e => {
                if (kind === "already" || e.button !== 0) return;
                // Taken here so the click neither pans nor places a mark.
                e.stopPropagation();
                onSelect(item.id);
              }}
            >
              {/* A wider invisible ring, so a thin one is easy to hit. */}
              <circle cx={cx} cy={cy} r={r} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={selected ? `${look.stroke}22` : "none"}
                stroke={look.stroke}
                strokeWidth={
                  (selected ? 3 : 2) * Math.max(1, renderScale / 1.5)
                }
                strokeDasharray={look.dash}
                className={selected ? "animate-pulse" : undefined}
              />
              {look.tag && (
                <text
                  x={cx + r * 0.75}
                  y={cy - r * 0.75}
                  fontSize={Math.max(8, r * 0.7)}
                  fontWeight={700}
                  fill={look.stroke}
                >
                  {look.tag}
                </text>
              )}
              <title>
                {kind === "already"
                  ? `Already counted as ${item.alreadyCounted}`
                  : [
                      ...(item.onDemolitionPlan
                        ? [DEMOLITION_REASON(item.onDemolitionPlan)]
                        : []),
                      ...item.needsLook,
                      ...item.maybeExisting,
                    ].join("; ") || "Found — not counted yet"}
              </title>
            </g>
          );
        })}
    </svg>
  );
}

export type MatchPanelState =
  | { phase: "boxing" }
  | { phase: "finding" }
  | { phase: "message"; text: string }
  | {
      phase: "results";
      items: MatchItem[];
      selectedId: number | null;
      readMs: number;
      findMs: number;
      /** The box that was searched for, page points; null = looks only. */
      box: MatchBox | null;
      /** Present on a scan (@/lib/scanMatching): the plan searched. */
      scan: { plan: string | null; pixels: number } | null;
      /** The item's saved looks searched too, and what was left out. */
      looks: { searched: number; notes: string[] } | null;
      /** The AI button's state (scans only): asking, and its last word. */
      ai: { busy: boolean; message: string | null };
    };

export function MatchPanel({
  label,
  existingLabel,
  state,
  chromeTarget,
  canAskAi,
  onAskAi,
  savedLooks,
  onSearchLooks,
  onConfirm,
  onConfirmExisting,
  onReject,
  onNext,
  onClose,
}: {
  /** The AI reader is on for this company: the scan button may be shown. */
  canAskAi: boolean;
  /** One press, one small call, about the next AI_BATCH copies. */
  onAskAi: () => void;
  /**
   * The armed item's saved looks (multiple-looks-plan.md § 3): searched with
   * the box, and searchable without one. How many come from THIS plan set
   * decides the wording — a look from another set only suggests.
   */
  savedLooks: { total: number; thisSet: number };
  /** Search the saved looks alone, no box. */
  onSearchLooks: () => void;
  /** The count a confirmed copy goes to. */
  label: string;
  /** Its existing-to-remain twin, when there is one to put a copy in. */
  existingLabel: string | null;
  state: MatchPanelState;
  chromeTarget: HTMLElement | null;
  onConfirm: (ids: number[]) => void;
  onConfirmExisting: (ids: number[]) => void;
  onReject: (ids: number[]) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  // Escape closes the search, and only the search: taken in the capture
  // phase so it does not also put the count down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  let body: React.ReactNode;
  if (state.phase === "boxing") {
    body = (
      <>
        <p className="text-xs text-muted-foreground">
          Drag a box snugly round ONE {label} on the drawing. Every copy on this
          sheet will be found. Esc to stop.
        </p>
        {savedLooks.total > 0 && (
          <>
            <p className="text-xs text-muted-foreground mt-1.5">
              Its {savedLooks.total} saved look
              {savedLooks.total === 1 ? "" : "s"} will be searched too
              {savedLooks.thisSet < savedLooks.total
                ? ` — ${savedLooks.total - savedLooks.thisSet} from other plan sets, which only suggest: the same symbol can mean something else on this set.`
                : "."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs mt-2"
              onClick={onSearchLooks}
            >
              Search the saved look{savedLooks.total === 1 ? "" : "s"} without a
              box
            </Button>
          </>
        )}
      </>
    );
  } else if (state.phase === "finding") {
    body = (
      <p className="text-xs text-muted-foreground" role="status">
        Looking across the sheet… On a scanned sheet this takes several seconds.
      </p>
    );
  } else if (state.phase === "message") {
    body = (
      <p className="text-xs" role="status">
        {state.text}
      </p>
    );
  } else {
    const s = summary(state.items);
    const sel = state.items.find(i => i.id === state.selectedId) ?? null;
    const selKind = sel ? itemKind(sel) : null;
    const clear = clearOpen(state.items);
    const askable = state.scan ? aiBatch(state.items) : [];
    body = (
      <>
        <p className="text-xs" role="status" aria-live="polite">
          Found {s.found}{" "}
          {state.scan?.plan ? (
            <>
              on <span className="font-medium">{state.scan.plan}</span>
            </>
          ) : (
            "on this sheet"
          )}
          <span className="text-muted-foreground">
            {" "}
            (
            {(state.readMs + state.findMs) / 1000 < 0.1
              ? "under 0.1"
              : ((state.readMs + state.findMs) / 1000).toFixed(1)}{" "}
            s)
          </span>
          . None is counted until you confirm it.
        </p>
        {state.looks && state.looks.searched > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {state.box ? "Also searched" : "Searched"} {state.looks.searched}{" "}
            saved look{state.looks.searched === 1 ? "" : "s"}.
          </p>
        )}
        {state.looks?.notes.map(n => (
          <p key={n} className="text-xs text-muted-foreground mt-1">
            {n}
          </p>
        ))}
        {state.scan && (
          <p className="text-xs text-muted-foreground mt-1">
            A scan: matched by picture, so the tag or an E beside each one is
            not read.{" "}
            {canAskAi ? "Check them, or ask the AI." : "Check each one."}
          </p>
        )}
        <ul className="mt-1.5 space-y-0.5 text-xs">
          <li>
            <span className="inline-block w-2 h-2 rounded-full bg-[#22D3EE] mr-1.5" />
            {s.clear} clear
          </li>
          {s.needsLook > 0 && (
            <li>
              <span className="inline-block w-2 h-2 rounded-full bg-[#F59E0B] mr-1.5" />
              {s.needsLook} need a look — confirm these one at a time
            </li>
          )}
          {s.maybeExisting > 0 && (
            <li>
              <span className="inline-block w-2 h-2 rounded-full bg-[#94A3B8] mr-1.5" />
              {s.maybeExisting} maybe existing
            </li>
          )}
          {s.demolition > 0 && (
            <li>
              <span className="inline-block w-2 h-2 rounded-full bg-[#FB7185] mr-1.5" />
              {s.demolition} on the demolition plan — not counted unless you
              count them
            </li>
          )}
          {s.already > 0 && (
            <li className="text-muted-foreground">
              {s.already} already counted, left alone
            </li>
          )}
          {(s.confirmed > 0 || s.rejected > 0) && (
            <li className="text-muted-foreground">
              {s.confirmed} counted, {s.rejected} set aside
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={clear.length === 0}
            onClick={() => onConfirm(clear.map(i => i.id))}
          >
            <Check className="w-3 h-3" /> Confirm all {clear.length} clear
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={onNext}
            disabled={
              s.clear + s.needsLook + s.maybeExisting + s.demolition === 0
            }
          >
            Next <ChevronRight className="w-3 h-3" />
          </Button>
          {canAskAi && state.scan && state.box && askable.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              disabled={state.ai.busy}
              onClick={onAskAi}
              title="Sends small pictures of these spots, never the sheet. Answers are suggestions; nothing is counted."
            >
              <Sparkles className="w-3 h-3" />
              {state.ai.busy
                ? "Asking…"
                : `Ask AI about ${askable.length} (under 1¢)`}
            </Button>
          )}
        </div>
        {state.ai.message && (
          <p className="text-xs text-muted-foreground mt-1.5" role="status">
            {state.ai.message}
          </p>
        )}

        {sel && sel.state === "open" && selKind !== "already" && (
          <div className="mt-2.5 rounded-lg border border-border p-2">
            <p className="text-xs font-medium">
              {selKind === "demolition"
                ? "On the demolition plan — not counted"
                : selKind === "needsLook"
                  ? "Needs a look"
                  : selKind === "maybeExisting"
                    ? "Maybe existing"
                    : "Looks the same as the one you boxed"}
            </p>
            {/* The heading already says "demolition plan — not counted". */}
            {[
              ...sel.needsLook,
              ...sel.maybeExisting,
              ...(sel.foundBy && sel.foundBy > 1
                ? [`Found by ${sel.foundBy} looks.`]
                : []),
              ...(sel.ai === "same"
                ? ["The AI reads the same tag or label beside it."]
                : sel.ai === "noAnswer"
                  ? ["The AI could not tell."]
                  : []),
            ].map(reason => (
              <p key={reason} className="text-xs text-muted-foreground mt-0.5">
                {reason}
              </p>
            ))}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => onConfirm([sel.id])}
              >
                Count it
              </Button>
              {existingLabel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  title={`Count it as ${existingLabel}`}
                  onClick={() => onConfirmExisting([sel.id])}
                >
                  Count as existing
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onReject([sel.id])}
              >
                Not this one
              </Button>
            </div>
          </div>
        )}
        {!sel && (
          <p className="text-xs text-muted-foreground mt-2">
            Click a ring to see why it was flagged and decide.
          </p>
        )}
      </>
    );
  }

  const card = (
    <div
      className={cn(
        // Below the row of pills at the top of the pane ("Counting …",
        // "N marks selected"): at top-3 it covered "Counting", the one
        // label saying what a click places (seen on screen 2026-10-01).
        "absolute top-14 left-3 z-20 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto",
        "pointer-events-auto rounded-xl border border-border bg-card/98 p-3 shadow-xl"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Find all matching — {label}</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
          onClick={onClose}
          aria-label="Close Find all matching"
          title="Close (Esc). Anything not confirmed is dropped."
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="mt-1">{body}</div>
    </div>
  );
  return chromeTarget ? createPortal(card, chromeTarget) : card;
}
