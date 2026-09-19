/**
 * CoPilotPanel — what the plan reader found on this sheet, and what the user
 * decides to do about it.
 *
 * ── Three tiers, three different-looking rows ────────────────────────────────
 * The panel's whole job is to make the difference between the tiers impossible
 * to skim past. A confident match is ticked and ready; an uncertain one is
 * tinted and starts UNTICKED, so accepting it is a decision rather than an
 * omission; an unreadable mark has no tick box at all — there is nothing to
 * accept, only somewhere on the drawing to go and look.
 *
 * That last one is the reason the third tier exists. A two-tier design has no
 * way to say "I could not read this", so it says "22% sure it's a receptacle"
 * instead, styled like the ones that are right, one click from a quantity.
 *
 * ── Nothing here places anything ─────────────────────────────────────────────
 * Every row is a proposal until the user presses Place. The server re-checks
 * each id against the same rules regardless of what this panel offered — see
 * shared/copilotActions.ts. This is the convenient half of the guardrail, not
 * the enforcing half.
 */
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Link2,
  Loader2,
  MessageCircleQuestion,
  RefreshCw,
  ScanEye,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TIER_LABEL, type ConfidenceTier } from "@shared/copilotConfidence";
import { smartSearch } from "@/lib/smartSearch";
import type { SymbolEntry } from "@/components/takeoff/LegendPanel";

export type CopilotFinding = {
  id: number;
  rawLabel: string;
  symbolLinkId: number | null;
  assemblyId: number | null;
  assemblyName: string | null;
  confidence: ConfidenceTier;
  score: number;
  reason: string | null;
  note: string | null;
  x: number | null;
  y: number | null;
  status: "proposed" | "confirmed" | "dismissed" | "needs_review";
  acceptable: boolean;
  needsLink: boolean;
};

export type CopilotState = {
  runId: number | null;
  status: "ok" | "degraded" | "failed" | null;
  summary: string | null;
  message: string | null;
  readAt: Date | null;
  findings: CopilotFinding[];
  counts: { high: number; low: number; unreadable: number; acceptable: number };
};

/** Tier styling, in one place so a row cannot be tinted one way and badged another. */
const TIER_STYLE: Record<
  ConfidenceTier,
  { row: string; badge: string; icon: typeof Check }
> = {
  high: {
    row: "border-l-2 border-l-emerald-500/70",
    badge: "text-emerald-400 border-emerald-500/40",
    icon: Check,
  },
  low: {
    row: "border-l-2 border-l-[#F5C518] bg-[#F5C518]/5",
    badge: "text-[#F5C518] border-[#F5C518]/40",
    icon: TriangleAlert,
  },
  unreadable: {
    row: "border-l-2 border-l-muted-foreground/40 bg-muted/30",
    badge: "text-muted-foreground border-muted-foreground/30",
    icon: Eye,
  },
};

export function CoPilotPanel({
  state,
  reading,
  autoRead,
  onAutoReadChange,
  canRead,
  onRead,
  onConfirm,
  onDismiss,
  onCorrect,
  onJumpTo,
  symbols,
  onAsk,
  asking,
  answer,
  onClearAnswer,
}: {
  state: CopilotState | undefined;
  reading: boolean;
  /** Read each sheet once as it is opened, rather than on a button press. */
  autoRead: boolean;
  onAutoReadChange: (on: boolean) => void;
  /** False until the page has finished rasterising — there is nothing to send. */
  canRead: boolean;
  onRead: (force: boolean) => void;
  onConfirm: (findingIds: number[]) => void;
  onDismiss: (findingIds: number[]) => void;
  onCorrect: (findingId: number, symbolLinkId: number) => void;
  onJumpTo: (at: { x: number; y: number }) => void;
  /** The user's legend, for the "that's actually this" correction. */
  symbols: SymbolEntry[];
  onAsk: (question: string) => void;
  asking: boolean;
  answer: string | null;
  onClearAnswer: () => void;
}) {
  const [open, setOpen] = useState(true);
  /** Which proposals are ticked. Keyed by finding id. */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [question, setQuestion] = useState("");
  /** The finding whose "that's actually…" picker is open. */
  const [correcting, setCorrecting] = useState<CopilotFinding | null>(null);
  const [symbolQuery, setSymbolQuery] = useState("");

  const open_ =
    state?.findings.filter(
      f => f.status === "proposed" || f.status === "needs_review"
    ) ?? [];

  /**
   * Confident proposals arrive ticked; uncertain ones do not.
   *
   * The asymmetry is the point. Accepting a confident batch should be one
   * click, and accepting an uncertain one should be a decision the user made
   * on purpose rather than one they failed to undo.
   */
  const runKey = state?.runId ?? 0;
  useEffect(() => {
    setPicked(
      new Set(
        (state?.findings ?? [])
          .filter(
            f =>
              f.acceptable && f.confidence === "high" && f.status === "proposed"
          )
          .map(f => f.id)
      )
    );
  }, [runKey, state?.findings.length]);

  const grouped = useMemo(() => {
    const tiers: ConfidenceTier[] = ["high", "low", "unreadable"];
    return tiers.map(tier => ({
      tier,
      rows: open_.filter(f => f.confidence === tier),
    }));
  }, [open_]);

  const pickedList = useMemo(
    () => open_.filter(f => picked.has(f.id) && f.acceptable),
    [open_, picked]
  );

  const linkable = useMemo(() => {
    const linked = symbols.filter(s => s.isLinked);
    if (!symbolQuery.trim()) return linked.slice(0, 8);
    const hits = smartSearch(
      linked.map(s => ({ id: String(s.id), description: s.label })),
      symbolQuery,
      8
    );
    const byId = new Map(linked.map(s => [s.id, s]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((s): s is SymbolEntry => Boolean(s));
  }, [symbols, symbolQuery]);

  const toggle = (id: number) =>
    setPicked(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = state?.counts;
  const confirmedCount =
    state?.findings.filter(f => f.status === "confirmed").length ?? 0;

  return (
    <div className="border-t border-border shrink-0">
      <div className="px-3 py-2 flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
        <button
          type="button"
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <ScanEye className="w-3 h-3" /> Plan reader
        </button>
        {counts && open_.length > 0 && (
          <span className="ml-auto normal-case tracking-normal">
            {counts.acceptable} ready
            {counts.unreadable > 0 && ` · ${counts.unreadable} to check`}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-5 px-1.5 text-[0.7rem]", !counts && "ml-auto")}
          disabled={reading || !canRead}
          onClick={() => onRead(Boolean(state?.runId))}
          title={
            canRead
              ? "Read this sheet"
              : "Waiting for the page to finish drawing"
          }
        >
          {reading ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Reading…
            </>
          ) : state?.runId ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1" /> Re-read
            </>
          ) : (
            "Read sheet"
          )}
        </Button>
      </div>

      {open && (
        <div className="pb-2">
          {/* Cost control, stated rather than hidden: one sheet is read when it
              is opened, once, and paging back to it costs nothing. */}
          <label className="px-3 pb-2 flex items-center gap-2 text-[0.7rem] text-muted-foreground cursor-pointer">
            <Switch
              checked={autoRead}
              onCheckedChange={onAutoReadChange}
              className="scale-75 origin-left"
            />
            <span>Read each sheet as I open it (once per sheet)</span>
          </label>

          {!state?.runId && !reading && (
            <p className="px-3 pb-3 text-xs text-muted-foreground">
              The plan reader looks at the sheet on screen, finds the symbols
              you have linked in your legend, and offers to mark them. Nothing
              is counted until you say so.
            </p>
          )}

          {reading && (
            <p className="px-3 pb-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Reading the sheet —
              this takes a few seconds on a dense drawing.
            </p>
          )}

          {state?.message && (
            <p
              className={cn(
                "mx-3 mb-2 rounded px-2 py-1.5 text-[0.7rem] border",
                state.status === "failed"
                  ? "border-destructive/40 text-destructive bg-destructive/5"
                  : "border-[#F5C518]/40 text-[#F5C518] bg-[#F5C518]/5"
              )}
            >
              {state.message}
            </p>
          )}

          {state?.summary && (
            <div className="mx-3 mb-2 rounded border border-border bg-muted/20 px-2 py-1.5">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground mb-1">
                Scope on this sheet
              </p>
              <p className="text-xs leading-relaxed">{state.summary}</p>
            </div>
          )}

          {confirmedCount > 0 && (
            <p className="px-3 pb-2 text-[0.7rem] text-emerald-400">
              {confirmedCount} placed on this sheet.
            </p>
          )}

          {/* The findings, banded by tier. */}
          <div className="max-h-72 overflow-y-auto">
            {grouped.map(({ tier, rows }) =>
              rows.length === 0 ? null : (
                <div key={tier}>
                  <div className="px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground bg-muted/20 border-y border-border/50">
                    {TIER_LABEL[tier]} · {rows.length}
                    {tier === "unreadable" && (
                      <span className="normal-case tracking-normal">
                        {" "}
                        — nothing is proposed for these
                      </span>
                    )}
                  </div>
                  {rows.map(finding => {
                    const style = TIER_STYLE[finding.confidence];
                    const Icon = style.icon;
                    const at =
                      finding.x !== null && finding.y !== null
                        ? { x: finding.x, y: finding.y }
                        : null;
                    return (
                      <div
                        key={finding.id}
                        className={cn(
                          "group px-3 py-1.5 border-b border-border/40 flex items-start gap-2",
                          style.row
                        )}
                      >
                        {/* No tick box on an unreadable finding: there is
                            nothing to accept, and offering one would imply
                            there is. */}
                        {finding.acceptable ? (
                          <input
                            type="checkbox"
                            checked={picked.has(finding.id)}
                            onChange={() => toggle(finding.id)}
                            className="mt-0.5 shrink-0 accent-[#F5C518]"
                            aria-label={`Place ${finding.assemblyName ?? finding.rawLabel}`}
                          />
                        ) : (
                          <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        )}

                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left"
                          onClick={() => at && onJumpTo(at)}
                          disabled={!at}
                          title={at ? "Show me on the drawing" : undefined}
                        >
                          <p className="text-xs truncate">
                            {finding.assemblyName ?? finding.rawLabel}
                          </p>
                          {finding.assemblyName &&
                            finding.assemblyName !== finding.rawLabel && (
                              <p className="text-[0.7rem] text-muted-foreground truncate">
                                read as “{finding.rawLabel}”
                              </p>
                            )}
                          {finding.reason && (
                            <p className="text-[0.7rem] text-muted-foreground leading-snug">
                              {finding.reason}
                            </p>
                          )}
                          {finding.note && (
                            <p className="text-[0.7rem] text-muted-foreground/80 italic leading-snug">
                              {finding.note}
                            </p>
                          )}
                        </button>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={cn(
                              "rounded-full border px-1.5 text-[0.6rem] leading-4",
                              style.badge
                            )}
                          >
                            {TIER_LABEL[finding.confidence]}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1 text-[0.65rem] text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => {
                              setCorrecting(finding);
                              setSymbolQuery("");
                            }}
                            title="Tell it what this really is"
                          >
                            <Link2 className="w-3 h-3 mr-0.5" />
                            {finding.needsLink ? "Link" : "Fix"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Accept / dismiss. The only control here that writes anything. */}
          {open_.some(f => f.acceptable) && (
            <div className="px-3 pt-2 flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 flex-1 gap-1.5 text-xs"
                disabled={pickedList.length === 0}
                onClick={() => onConfirm(pickedList.map(f => f.id))}
              >
                <Check className="w-3.5 h-3.5" />
                Place {pickedList.length}{" "}
                {pickedList.length === 1 ? "mark" : "marks"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                disabled={pickedList.length === 0}
                onClick={() => {
                  onDismiss(pickedList.map(f => f.id));
                  setPicked(new Set());
                }}
              >
                <X className="w-3.5 h-3.5" /> Dismiss
              </Button>
            </div>
          )}

          {/* "That's actually…" — the correction, which is also the link flow
              for a symbol the reader could not resolve. */}
          {correcting && (
            <div className="border-t border-border mt-2 p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-medium">
                What is “{correcting.rawLabel}” really?
              </p>
              <p className="text-[0.7rem] text-muted-foreground">
                Pick one of your legend symbols. It will be read this way on the
                rest of this drawing set — for your account only.
              </p>
              <Input
                value={symbolQuery}
                onChange={e => setSymbolQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape") setCorrecting(null);
                }}
                placeholder="Search your legend…"
                className="h-7 text-xs"
                autoFocus
              />
              <div className="max-h-40 overflow-y-auto">
                {linkable.map(symbol => (
                  <button
                    key={symbol.id}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2"
                    onClick={() => {
                      onCorrect(correcting.id, symbol.id);
                      setCorrecting(null);
                    }}
                  >
                    {symbol.thumbnail ? (
                      <img
                        src={symbol.thumbnail}
                        alt=""
                        className="w-5 h-5 object-contain rounded bg-white shrink-0"
                      />
                    ) : (
                      <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 truncate">
                      {symbol.label}
                    </span>
                  </button>
                ))}
                {linkable.length === 0 && (
                  <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
                    No linked legend symbols yet. Capture one from the sheet's
                    legend below and link it to an assembly first — that is what
                    tells the reader what a symbol means.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-full text-xs text-muted-foreground"
                onClick={() => setCorrecting(null)}
              >
                Not now
              </Button>
            </div>
          )}

          {/* Questions about the sheet. Prose in, prose out, nothing written. */}
          <div className="px-3 pt-3">
            <form
              className="flex items-center gap-1.5"
              onSubmit={e => {
                e.preventDefault();
                const trimmed = question.trim();
                if (!trimmed || asking || !canRead) return;
                onAsk(trimmed);
                setQuestion("");
              }}
            >
              <MessageCircleQuestion className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask about this sheet…"
                className="h-7 text-xs"
                disabled={!canRead}
              />
              <Button
                size="sm"
                variant="ghost"
                type="submit"
                className="h-7 w-7 p-0 shrink-0"
                disabled={!question.trim() || asking || !canRead}
                aria-label="Ask"
              >
                {asking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </Button>
            </form>
            {answer && (
              <div className="mt-2 rounded border border-border bg-muted/20 px-2 py-1.5 flex items-start gap-2">
                <p className="text-xs leading-relaxed flex-1">{answer}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 shrink-0 text-muted-foreground"
                  onClick={onClearAnswer}
                  aria-label="Dismiss answer"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
