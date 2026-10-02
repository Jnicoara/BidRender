/**
 * CHECK SHEET — the panel and the rings. 2026-10-01.
 *
 * The finding is @/lib/sheetCheck (in the PDF worker), the lists are
 * @/lib/sheetCheckSession. What this file adds is buttons, and every one of
 * them is an ordinary action the page already has: Move and Delete are the
 * selection's own, "Count it" queues a mark exactly as a click does, "Split"
 * makes a count and moves marks into it. Nothing here changes a mark by
 * itself, and on a locked bid there are no buttons at all — only the report.
 *
 * The AI is one button, "Ask AI to pick", on the ties code could not settle,
 * and its answer is shown as a suggestion like everything else.
 */
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SheetCheckResult } from "@/lib/sheetCheck";
import {
  markReport,
  tieBreakBatch,
  unmarkedSpots,
  variantLabel,
  type SessionLegendRow,
  type UnmarkedSpot,
} from "@/lib/sheetCheckSession";
import { MARK_HEIGHT_COLUMN } from "@shared/sheetCheckSwitches";
import type { PageRect } from "@shared/planRegion";

export type SheetCheckState =
  | { phase: "noLegend" }
  | { phase: "checking" }
  | { phase: "message"; text: string }
  | { phase: "done"; result: SheetCheckResult; ms: number };

type Group = { groupId: number; label: string; assemblyId: number | null };

const short = (s: string, n = 40) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

/** A small picture of the drawing round one spot, drawn when it scrolls in. */
function SpotPicture({
  x,
  y,
  renderRegion,
}: {
  x: number;
  y: number;
  renderRegion: (
    rect: PageRect,
    scale: number
  ) => Promise<{ bitmap: ImageBitmap }>;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  /*
    The latest renderer, read when the picture is drawn. NOT an effect
    dependency: the overlay hands down a new function on every render, and
    as a dependency it cancelled each picture's draw before it landed —
    the "Not marked" list stayed blank on a tablet (seen 2026-10-01).
  */
  const render = useRef(renderRegion);
  render.current = renderRegion;
  useEffect(() => {
    let live = true;
    const canvas = ref.current;
    if (!canvas) return;
    const half = 14;
    const draw = () =>
      render
        .current(
          { x: x - half, y: y - half, width: 2 * half, height: 2 * half },
          3
        )
        .then(({ bitmap }) => {
          if (!live) return bitmap.close();
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0);
            ctx.strokeStyle = "#e11d48";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(
              canvas.width / 2,
              canvas.height / 2,
              canvas.width / 4,
              0,
              7
            );
            ctx.stroke();
          }
          bitmap.close();
        })
        .catch(() => {});
    // Only the pictures scrolled into the panel are drawn: one list can hold
    // dozens, and each is a render in the same worker as the sheet itself.
    if (typeof IntersectionObserver === "undefined") {
      void draw();
      return () => {
        live = false;
      };
    }
    const seen = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        seen.disconnect();
        void draw();
      }
    });
    seen.observe(canvas);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, [x, y]);
  return (
    <canvas
      ref={ref}
      className="w-14 h-14 shrink-0 rounded border border-border bg-white"
      aria-hidden
    />
  );
}

/**
 * Starts one check when mounted. The check needs the viewer's worker for this
 * page, which only the overlay holds, so the toolbar asks for a run and this
 * — rendered in the overlay, keyed by the run — carries it out.
 */
export function SheetCheckRunner({ run }: { run: () => void }) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, [run]);
  return null;
}

/** Rings on the drawing: amber on a questioned mark, cyan on an unmarked spot. */
export function SheetCheckLayer({
  width,
  height,
  renderScale,
  rings,
  selected,
}: {
  width: number;
  height: number;
  renderScale: number;
  rings: readonly {
    key: string;
    x: number;
    y: number;
    tone: "issue" | "spot";
  }[];
  selected: string | null;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      aria-label="Sheet check"
    >
      {rings.map(r => (
        <circle
          key={r.key}
          cx={r.x * renderScale}
          cy={r.y * renderScale}
          r={(r.key === selected ? 11 : 8) * renderScale}
          fill="none"
          stroke={r.tone === "issue" ? "#F59E0B" : "#22D3EE"}
          strokeWidth={(r.key === selected ? 2.5 : 1.5) * renderScale}
          strokeDasharray={
            r.tone === "spot"
              ? `${4 * renderScale} ${2 * renderScale}`
              : undefined
          }
        />
      ))}
    </svg>
  );
}

/** The rings for a result, with the dismissed ones taken out. */
export function sheetCheckRings(
  result: SheetCheckResult,
  hidden: ReadonlySet<string>
): { key: string; x: number; y: number; tone: "issue" | "spot" }[] {
  const { issues } = markReport(result);
  return [
    ...issues.map(i => ({
      key: `m${i.markId}`,
      x: i.x,
      y: i.y,
      tone: "issue" as const,
    })),
    ...unmarkedSpots(result.spots)
      .filter(s => s.kind !== "same")
      .map(s => ({
        key: `s${s.spotId}`,
        x: s.x,
        y: s.y,
        tone: "spot" as const,
      })),
  ].filter(r => !hidden.has(r.key));
}

type Tab = "marks" | "unmarked" | "variants" | "notes";

/** Below this the drawing pane cannot spare a 320px column for the panel. */
const NARROW_PANE_PX = 720;

function usePaneNarrow(pane: HTMLElement | null): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!pane) return;
    const measure = () => setNarrow(pane.clientWidth < NARROW_PANE_PX);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [pane]);
  return narrow;
}

export function SheetCheckPanel({
  state,
  legendName,
  legendRows,
  picks,
  locked,
  countForItem,
  moveTargets,
  hidden,
  selected,
  canAskAi,
  renderRegion,
  chromeTarget,
  onPick,
  onHide,
  onSelectRing,
  onJump,
  onMove,
  onDelete,
  onSelectMarks,
  onCount,
  onCountNew,
  onSplit,
  onAskAi,
  onRerun,
  onClose,
}: {
  state: SheetCheckState;
  legendName: string | null;
  legendRows: readonly SessionLegendRow[];
  picks: Readonly<Record<string, string>>;
  locked: boolean;
  /** The bid's count for a legend item, when there is exactly one. */
  countForItem: (item: string) => Group | null;
  moveTargets: readonly { id: number; label: string }[];
  hidden: ReadonlySet<string>;
  selected: string | null;
  canAskAi: boolean;
  renderRegion: (
    rect: PageRect,
    scale: number
  ) => Promise<{ bitmap: ImageBitmap }>;
  chromeTarget: HTMLElement | null;
  onPick: (count: string, item: string | null) => void;
  onHide: (key: string) => void;
  onSelectRing: (key: string, at: { x: number; y: number }) => void;
  onJump: (at: { x: number; y: number }) => void;
  onMove: (markIds: number[], groupId: number) => void;
  onDelete: (marks: { id: number; name: string }[]) => void;
  onSelectMarks: (markIds: number[]) => void;
  onCount: (group: Group, at: { x: number; y: number }[]) => void;
  /** No count is this item yet: start one named after the legend row. */
  onCountNew: (item: string, at: { x: number; y: number }[]) => void;
  onSplit: (count: string, markIds: number[], label: string) => void;
  onAskAi: (
    batch: ReturnType<typeof tieBreakBatch>
  ) => Promise<{ picks: Map<number, string | null>; message: string | null }>;
  onRerun: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("marks");
  const narrow = usePaneNarrow(chromeTarget);
  const [aiPicks, setAiPicks] = useState<Map<number, string | null>>(new Map());
  const [asking, setAsking] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

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

  const result = state.phase === "done" ? state.result : null;
  const report = useMemo(() => (result ? markReport(result) : null), [result]);
  const spots = useMemo(
    () => (result ? unmarkedSpots(result.spots) : []),
    [result]
  );
  const batch = useMemo(
    () => tieBreakBatch(spots, legendRows),
    [spots, legendRows]
  );
  const markName = useMemo(
    () => new Map((result?.marks ?? []).map(m => [m.id, m.count] as const)),
    [result]
  );

  const actions = !locked;
  const rowClass = (key: string) =>
    cn(
      "flex gap-2 rounded-lg border p-1.5",
      key === selected ? "border-primary" : "border-border"
    );

  let body: React.ReactNode = null;
  if (state.phase === "noLegend") {
    body = (
      <p className="text-xs">
        Nothing to compare with yet. Open the legend sheet, choose{" "}
        <span className="font-medium">Whole legend</span> and box the legend —
        then come back here and check. The legend is kept while this tab is
        open.
      </p>
    );
  } else if (state.phase === "checking") {
    body = (
      <p
        className="text-xs text-muted-foreground flex items-center gap-1.5"
        role="status"
      >
        <Loader2 className="w-3 h-3 animate-spin" /> Checking the sheet against
        the legend…
      </p>
    );
  } else if (state.phase === "message") {
    body = (
      <p className="text-xs" role="status">
        {state.text}
      </p>
    );
  } else if (result && report) {
    const unpicked = report.counts.filter(c => c.item === null);
    const tabs: { id: Tab; label: string; n: number }[] = [
      {
        id: "marks",
        label: "Your marks",
        n: report.issues.filter(i => !hidden.has(`m${i.markId}`)).length,
      },
      {
        id: "unmarked",
        label: "Not marked",
        n: spots.filter(s => s.kind !== "same" && !hidden.has(`s${s.spotId}`))
          .length,
      },
      { id: "variants", label: "Variants", n: result.variants.length },
      {
        id: "notes",
        label: "Notes",
        n: result.notes.filter(
          n =>
            n.words.heights.length +
              n.words.existing.length +
              n.keynotes.length >
            0
        ).length,
      },
    ];

    let list: React.ReactNode = null;
    if (tab === "marks") {
      const open = report.issues.filter(i => !hidden.has(`m${i.markId}`));
      list = (
        <>
          <ul className="text-xs space-y-0.5">
            {report.counts.map(c => (
              <li key={c.count} className="flex justify-between gap-2">
                <span className="truncate">{c.count}</span>
                <span className="text-muted-foreground shrink-0">
                  {c.item === null
                    ? "no legend item to compare"
                    : `${c.matches} of ${c.marks} match${c.issues ? `, ${c.issues} to look at` : ""}`}
                </span>
              </li>
            ))}
          </ul>
          {unpicked.length > 0 && (
            <div className="mt-2 rounded-lg bg-muted/50 p-1.5">
              <p className="text-xs font-medium">Compare with</p>
              <p className="text-[11px] text-muted-foreground">
                These counts are named differently from every legend row. Pick
                the row each one is.
              </p>
              {unpicked.map(c => (
                <label
                  key={c.count}
                  className="flex items-center gap-1.5 mt-1 text-xs"
                >
                  <span className="w-24 truncate shrink-0">{c.count}</span>
                  <select
                    className="h-6 flex-1 min-w-0 rounded border border-border bg-background text-xs"
                    value={picks[c.count.trim().toLowerCase()] ?? ""}
                    onChange={e => onPick(c.count, e.target.value || null)}
                  >
                    <option value="">— not on the legend —</option>
                    {result.looks.map(n => (
                      <option key={n} value={n}>
                        {short(n, 60)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {open.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              Every mark that has a legend item agrees with the drawing.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {open.map(i => {
                const key = `m${i.markId}`;
                const suggested = i.suggest ? countForItem(i.suggest) : null;
                return (
                  <li key={key} className={rowClass(key)}>
                    <button
                      type="button"
                      onClick={() => onSelectRing(key, i)}
                      title="Show it on the sheet"
                    >
                      <SpotPicture
                        x={i.x}
                        y={i.y}
                        renderRegion={renderRegion}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{i.count}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {i.says}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[11px] gap-1"
                          onClick={() => onJump(i)}
                        >
                          <Crosshair className="w-3 h-3" /> Go to
                        </Button>
                        {actions && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() => onHide(key)}
                              title="It is right as it is"
                            >
                              Keep
                            </Button>
                            {suggested ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[11px]"
                                onClick={() => {
                                  onMove([i.markId], suggested.groupId);
                                  onHide(key);
                                }}
                              >
                                Move to {short(suggested.label, 18)}
                              </Button>
                            ) : (
                              <select
                                aria-label="Move to"
                                className="h-6 max-w-[7rem] rounded border border-border bg-background text-[11px]"
                                value=""
                                onChange={e => {
                                  const id = Number(e.target.value);
                                  if (id > 0) {
                                    onMove([i.markId], id);
                                    onHide(key);
                                  }
                                }}
                              >
                                <option value="">Move to…</option>
                                {moveTargets.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] text-destructive"
                              onClick={() => {
                                onDelete([{ id: i.markId, name: i.count }]);
                                onHide(key);
                              }}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      );
    } else if (tab === "unmarked") {
      const open = spots.filter(
        s => s.kind !== "same" && !hidden.has(`s${s.spotId}`)
      );
      const same = spots.filter(s => s.kind === "same").length;
      const ties = open.filter(s => s.kind === "tie").length;
      const asked = batch.crops.filter(c => aiPicks.has(c.spotId)).length;
      list = (
        <>
          <p className="text-[11px] text-muted-foreground">
            Legend symbols drawn where there is no mark. None is counted until
            you say so.
          </p>
          {same > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {same} more {same === 1 ? "is" : "are"} drawn the same as another
              legend item, so no picture can tell which — left out.
            </p>
          )}
          {ties > 0 && canAskAi && actions && batch.crops.length > asked && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 mt-1.5 gap-1.5 text-xs"
              disabled={asking}
              onClick={async () => {
                setAsking(true);
                setAiMessage(null);
                try {
                  const r = await onAskAi(batch);
                  setAiPicks(prev => {
                    const next = new Map(prev);
                    r.picks.forEach((v, k) => next.set(k, v));
                    return next;
                  });
                  setAiMessage(r.message);
                } finally {
                  setAsking(false);
                }
              }}
              title="Sends small pictures of these spots and of the legend rows they could be. About a cent."
            >
              {asking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              Ask AI to pick ({Math.min(batch.crops.length, ties)})
            </Button>
          )}
          {aiMessage && <p className="text-[11px] mt-1">{aiMessage}</p>}
          {open.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              Nothing unmarked.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {open.map(s => (
                <UnmarkedRow
                  key={s.spotId}
                  spot={s}
                  aiPick={aiPicks.get(s.spotId)}
                  className={rowClass(`s${s.spotId}`)}
                  actions={actions}
                  countForItem={countForItem}
                  renderRegion={renderRegion}
                  onSelect={() => onSelectRing(`s${s.spotId}`, s)}
                  onJump={() => onJump(s)}
                  onCount={(g: Group) => {
                    onCount(g, [{ x: s.x, y: s.y }]);
                    onHide(`s${s.spotId}`);
                  }}
                  onCountNew={item => {
                    onCountNew(item, [{ x: s.x, y: s.y }]);
                    onHide(`s${s.spotId}`);
                  }}
                  onHide={() => onHide(`s${s.spotId}`)}
                />
              ))}
            </ul>
          )}
        </>
      );
    } else if (tab === "variants") {
      list =
        result.variants.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every count's marks are drawn alike, with the same words beside
            them.
          </p>
        ) : (
          <div className="space-y-2">
            {result.variants.map(v => (
              <div key={v.count}>
                <p className="text-xs font-medium truncate">{v.count}</p>
                <ul className="mt-1 space-y-1">
                  {v.groups.map(g => {
                    const key = `v${v.count}|${g.look}|${g.beside}`;
                    if (hidden.has(key)) return null;
                    const first = result.marks.find(m => m.id === g.markIds[0]);
                    return (
                      <li
                        key={key}
                        className="rounded-lg border border-border p-1.5"
                      >
                        <p className="text-[11px]">
                          <span className="font-medium">
                            {g.markIds.length}{" "}
                            {g.markIds.length === 1 ? "mark" : "marks"}
                          </span>{" "}
                          — {variantLabel(g, v.groups)}
                          {!g.minor && (
                            <span className="text-muted-foreground">
                              {" "}
                              — most of them
                            </span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {first && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[11px] gap-1"
                              onClick={() => onJump(first)}
                            >
                              <Crosshair className="w-3 h-3" /> Go to
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => onSelectMarks(g.markIds)}
                            title="Select them on the sheet, to move or delete together"
                          >
                            Select {g.markIds.length}
                          </Button>
                          {actions && g.minor && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[11px]"
                                onClick={() => onHide(key)}
                              >
                                Keep
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[11px]"
                                onClick={() => {
                                  onSplit(
                                    v.count,
                                    g.markIds,
                                    `${v.count} — ${g.beside || g.lookName || `look ${g.look}`}`
                                  );
                                  onHide(key);
                                }}
                                title="Make a new count for these and move them into it"
                              >
                                Split off
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        );
    } else {
      const withNotes = result.notes.filter(
        n =>
          n.words.heights.length + n.words.existing.length + n.keynotes.length >
          0
      );
      const existing = withNotes
        .filter(n => n.words.existing.length > 0)
        .map(n => n.markId);
      list = (
        <>
          <p className="text-[11px] text-muted-foreground">
            Read from the words beside each mark. Suggestions only — nothing is
            applied.
            {!MARK_HEIGHT_COLUMN &&
              " Heights are shown, not saved: a mark has nowhere to keep one yet."}
          </p>
          {existing.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 mt-1.5 text-xs"
              onClick={() => onSelectMarks(existing)}
              title="Select them, then Move to the existing-to-remain count"
            >
              Select the {existing.length} marked (E) or (X)
            </Button>
          )}
          <ul className="mt-2 space-y-1">
            {withNotes.slice(0, 200).map(n => {
              const m = result.marks.find(k => k.id === n.markId);
              if (!m) return null;
              const parts = [
                ...n.words.heights.map(h => h.text),
                ...n.words.existing,
                ...n.keynotes.map(k => `keynote ${k}`),
              ];
              return (
                <li
                  key={n.markId}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 shrink-0"
                    onClick={() => onJump(m)}
                    aria-label="Go to"
                  >
                    <Crosshair className="w-3 h-3" />
                  </Button>
                  <span className="truncate">{markName.get(n.markId)}</span>
                  <span className="ml-auto shrink-0 font-medium">
                    {parts.join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      );
    }

    body = (
      <>
        <p className="text-[11px] text-muted-foreground">
          Against {legendName ? short(legendName, 36) : "the legend"} ·{" "}
          {result.looks.length} legend symbols ·{" "}
          {(state.phase === "done" ? state.ms : 0) < 100
            ? "under 0.1"
            : ((state.phase === "done" ? state.ms : 0) / 1000).toFixed(1)}{" "}
          s{locked && " · locked bid: report only"}
        </p>
        <div
          role="tablist"
          className="flex gap-0.5 mt-1.5 border-b border-border"
        >
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-1.5 py-1 text-[11px] -mb-px border-b-2",
                tab === t.id
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {t.label}
              {t.n > 0 && <span className="ml-1 tabular-nums">{t.n}</span>}
            </button>
          ))}
        </div>
        <div className="mt-2">{list}</div>
      </>
    );
  }

  const card = (
    <div
      className={cn(
        // A narrow pane (a tablet held upright) is mostly panel at w-80, and
        // "Go to" then moved the sheet underneath it. There the panel is a
        // sheet along the bottom, leaving the top half of the drawing clear.
        narrow
          ? "absolute bottom-3 left-3 right-3 z-20 max-h-[45%] overflow-y-auto"
          : "absolute top-14 left-3 z-20 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-4.25rem)] overflow-y-auto",
        "pointer-events-auto rounded-xl border border-border bg-card/98 p-3 shadow-xl"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">Check sheet</p>
        <div className="flex items-center gap-1">
          {state.phase === "done" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={onRerun}
            >
              Check again
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
            onClick={onClose}
            aria-label="Close Check sheet"
            title="Close (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-1">{body}</div>
    </div>
  );
  return chromeTarget ? createPortal(card, chromeTarget) : card;
}

function UnmarkedRow({
  spot,
  aiPick,
  className,
  actions,
  countForItem,
  renderRegion,
  onSelect,
  onJump,
  onCount,
  onCountNew,
  onHide,
}: {
  spot: UnmarkedSpot;
  /** undefined: not asked; null: asked, no answer; string: the AI's pick. */
  aiPick: string | null | undefined;
  className: string;
  actions: boolean;
  countForItem: (item: string) => Group | null;
  renderRegion: (
    rect: PageRect,
    scale: number
  ) => Promise<{ bitmap: ImageBitmap }>;
  onSelect: () => void;
  onJump: () => void;
  onCount: (g: Group) => void;
  onCountNew: (item: string) => void;
  onHide: () => void;
}) {
  const choices =
    spot.kind === "clear" ? spot.items : aiPick ? [aiPick] : spot.items;
  return (
    <li className={className}>
      <button type="button" onClick={onSelect} title="Show it on the sheet">
        <SpotPicture x={spot.x} y={spot.y} renderRegion={renderRegion} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {spot.kind === "clear"
            ? short(spot.items[0])
            : aiPick
              ? `${short(aiPick)} (AI's pick)`
              : `${spot.items.length} items fit`}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {spot.kind === "clear"
            ? spot.byWords
              ? `Settled by the ${spot.byWords} beside it · unconfirmed`
              : "Unconfirmed"
            : aiPick === null
              ? "The AI could not tell either · pick by eye"
              : aiPick
                ? "Unconfirmed — check the picture"
                : spot.items.map(i => short(i, 24)).join(" or ")}
        </p>
        <div className="flex flex-wrap gap-1 mt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] gap-1"
            onClick={onJump}
          >
            <Crosshair className="w-3 h-3" /> Go to
          </Button>
          {actions &&
            choices.map(item => {
              const g = countForItem(item);
              return g ? (
                <Button
                  key={item}
                  size="sm"
                  variant="outline"
                  className="h-6 px-1.5 text-[11px]"
                  onClick={() => onCount(g)}
                >
                  Count as {short(g.label, 18)}
                </Button>
              ) : null;
            })}
          {actions && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={onHide}
            >
              Not it
            </Button>
          )}
        </div>
        {actions && choices.length === 1 && !countForItem(choices[0]) && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 mt-1 px-1.5 text-[11px]"
            onClick={() => onCountNew(choices[0])}
            title="Start a count named after this legend row, with this mark in it"
          >
            Start a count for it
          </Button>
        )}
      </div>
    </li>
  );
}
