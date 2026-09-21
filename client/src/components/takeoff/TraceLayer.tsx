/**
 * TraceLayer — clicking a route onto the drawing, and seeing what it measures.
 *
 * An absolutely-positioned SVG over the page canvas. SVG rather than a second
 * canvas because each vertex needs to be individually hoverable and removable,
 * and hit-testing shapes is what SVG already does.
 *
 * ── Coordinates ─────────────────────────────────────────────────────────────
 * Everything stored is in PDF page points. The overlay renders at the same
 * scale the page was rasterised at, so screen ↔ page conversion happens once,
 * here, via screenToPagePoints. Nothing downstream ever sees a pixel — a
 * length measured in pixels would change with zoom, and nothing on screen
 * would reveal it.
 *
 * ── The gate ────────────────────────────────────────────────────────────────
 * When the sheet cannot be measured, TRACING is off and a note says why — an
 * explanation and the way out rather than a disabled cursor, because the fix
 * is on another control and the user has to know which.
 *
 * COUNTING is not gated, and used to be by accident. This component returned
 * early on an unmeasurable sheet and rendered nothing at all, which took the
 * stamp tool and every already-placed mark with it. Counting receptacles has
 * nothing to do with distance.
 *
 * ── Two layers, and the split matters ───────────────────────────────────────
 * The SVG sits inside the viewer's zoom transform, so a mark stays on its
 * symbol at every magnification for free. The pills and buttons are portalled
 * OUT to an untransformed layer (`chromeTarget`), because chrome that scales
 * with the drawing is three pixels tall at 20% and off-screen at 400%.
 */
import {
  markAppearance,
  markPath,
  markRadiusInOverlay,
  markStrokeInOverlay,
  runAppearance,
  runStrokeInOverlay,
  runWidthInOverlay,
} from "@shared/takeoffMarks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CrosshairGuides } from "./CrosshairGuides";
import { Check, Ruler, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatFeetInches,
  pathRealInches,
  screenToPagePoints,
  type PagePoint,
} from "@shared/takeoffGeometry";
import type { Measurability, RunPathType } from "@shared/takeoffQuantities";

/**
 * How wide a run's invisible click target is, in SCREEN pixels.
 *
 * 18 matches what it has always been at 100% zoom; the difference is that it
 * no longer shrinks with the drawing. Comfortably bigger than a cursor's hot
 * spot and than the line itself, so aiming at a run means aiming near it.
 */
const HIT_TARGET_PX = 18;

export type ExistingRun = {
  id: number;
  name: string;
  /** Which kind of run — decides its colour. Null on a run traced before types. */
  runTypeId: number | null;
  pathType: RunPathType;
  points: PagePoint[];
  status: "draft" | "committed";
  isSuggestion: boolean;
};

const RUN_COLOR: Record<RunPathType, string> = {
  conduit: "#F5C518",
  cable: "#4ADE80",
};

export type PlacedStamp = {
  id: number;
  /** What it is counting — the group's label. See shared/takeoffCounts.ts. */
  name: string;
  /** Which count this belongs to — decides its shape and colour. */
  groupId: number | null;
  /** Fallback key for a mark placed before groups existed. */
  assemblyId: number | null;
  /** Keeps an assembly-backed count's shape meaningful across jobs. */
  assemblyCategory: string | null;
  x: number;
  y: number;
  /**
   * Clicked, drawn, and not yet acknowledged by the server.
   *
   * Drawn exactly like a saved mark rather than as a ghost, deliberately. An
   * estimator counting forty lights in a row is trusting the drawing to say
   * what has landed; a mark that changes appearance when the network answers
   * is one more thing moving on a screen where the count is the only thing
   * that should. It is not clickable — there is no row to select yet.
   */
  pending?: boolean;
};

/**
 * A mark the plan reader proposed and nobody has accepted yet.
 *
 * Drawn deliberately unlike a placed stamp: dashed, hollow, and in the tier's
 * own colour. A traced suggestion is dashed for the same reason (see the
 * polyline below) — anything provisional has to read as provisional at a
 * glance, or the drawing stops being a record of what has been counted.
 */
export type ProposedStamp = {
  id: number;
  label: string;
  confidence: "high" | "low" | "unreadable";
  x: number;
  y: number;
};

const PROPOSAL_COLOR: Record<ProposedStamp["confidence"], string> = {
  high: "#34D399",
  low: "#F5C518",
  unreadable: "#94A3B8",
};

export function TraceLayer({
  width,
  height,
  renderScale,
  zoom,
  measurability,
  tracing,
  pathType,
  points,
  onPointsChange,
  existingRuns,
  onFinish,
  onCancel,
  selectedRunId,
  onSelectRun,
  stamping,
  armedGroupName,
  stamps,
  proposals,
  onDropStamp,
  selectedStampId,
  onSelectStamp,
  focusPoint,
  chromeTarget,
}: {
  /** Canvas size in device pixels — the overlay matches it exactly. */
  width: number;
  height: number;
  /** What the page was rasterised at. Divided out to get page points. */
  renderScale: number;
  /**
   * The viewer's display zoom.
   *
   * Needed because this overlay lives INSIDE the zoom transform, so a mark's
   * size on screen is whatever it is drawn at multiplied by this. Marks are
   * specified in screen pixels and divided back out — see
   * shared/takeoffMarks.ts, which has the measurements that made the clamp
   * necessary.
   */
  zoom: number;
  measurability: Measurability;
  tracing: boolean;
  pathType: RunPathType;
  points: PagePoint[];
  onPointsChange: (points: PagePoint[]) => void;
  existingRuns: ExistingRun[];
  onFinish: () => void;
  onCancel: () => void;
  selectedRunId: number | null;
  onSelectRun: (id: number | null) => void;
  /** The stamp tool is armed: clicks drop instances of the chosen assembly. */
  stamping: boolean;
  armedGroupName: string | null;
  stamps: PlacedStamp[];
  /** Awaiting the user's decision. Never counted, never priced. */
  proposals?: ProposedStamp[];
  onDropStamp: (at: { x: number; y: number }) => void;
  selectedStampId: number | null;
  onSelectStamp: (id: number | null) => void;
  /** Highlighted after a jump from the counted-items list. */
  focusPoint: { x: number; y: number } | null;
  /** Untransformed layer for screen-sized chrome. See `withChrome` below. */
  chromeTarget?: HTMLElement | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Where the pointer is, for the rubber-band segment from the last vertex. */
  const [hover, setHover] = useState<PagePoint | null>(null);

  const ratio = measurability.ok ? measurability.ratio : null;

  /** Page points → the overlay's pixel space. */
  /*
    Every width this layer draws with, in overlay units, from one clamp.

    Worked out here rather than at each call site so there is one place that
    knows a run must stay readable on SCREEN while living in a coordinate
    system that is about to be multiplied by the zoom. See runScreenWidth for
    the measurement behind the numbers.
  */
  const runStroke = runStrokeInOverlay(zoom);
  const hitWidth = runWidthInOverlay(zoom, HIT_TARGET_PX);

  const toScreen = useCallback(
    (p: PagePoint) => ({ x: p.x * renderScale, y: p.y * renderScale }),
    [renderScale]
  );

  const pointerToPage = useCallback(
    (e: React.PointerEvent): PagePoint | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      // The SVG is laid out at CSS size but sized in device pixels, so scale the
      // pointer into the SVG's own coordinate space before converting.
      const scaleX = rect.width === 0 ? 1 : width / rect.width;
      const scaleY = rect.height === 0 ? 1 : height / rect.height;
      return screenToPagePoints(
        {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        },
        renderScale
      );
    },
    [width, height, renderScale]
  );

  /** Live length of what is being traced, including the rubber-band segment. */
  const liveInches = useMemo(() => {
    if (!tracing || ratio === null) return null;
    const withHover = hover && points.length > 0 ? [...points, hover] : points;
    return pathRealInches(withHover, ratio);
  }, [tracing, points, hover, ratio]);

  const committedInches = useMemo(() => {
    if (ratio === null) return null;
    return pathRealInches(points, ratio);
  }, [points, ratio]);

  // Escape backs out one vertex at a time, then cancels — the same shape as
  // Escape everywhere else in the app: abandon the smallest thing first.
  useEffect(() => {
    if (!tracing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (points.length > 0) onPointsChange(points.slice(0, -1));
        else onCancel();
      } else if (e.key === "Enter" && points.length >= 2) {
        e.preventDefault();
        onFinish();
      } else if (
        (e.key === "z" && (e.ctrlKey || e.metaKey)) ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        if (points.length > 0) onPointsChange(points.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tracing, points, onPointsChange, onCancel, onFinish]);

  /**
   * ── Not measurable ────────────────────────────────────────────────────────
   * Only TRACING is blocked, and only tracing ever was — measuring needs a
   * scale and counting does not. This used to return early and render nothing
   * at all, which took the stamp tool and every already-placed mark down with
   * it: on a sheet with no scale you could not count a receptacle, and could
   * not see the ones you had already counted. Counting devices has nothing to
   * do with distance.
   *
   * So the overlay always renders. `tracing` is gated by the caller, and this
   * is a note rather than a wall.
   */
  const blocked = !measurability.ok ? measurability : null;

  /**
   * The SVG scales with the drawing; everything else must not.
   *
   * The marks belong ON the page — a stamp has to sit on its symbol at every
   * zoom, which is exactly what being inside the transform gives for free. The
   * pills and buttons belong on the SCREEN. Left in the transform they were 3
   * pixels tall at 20% zoom and somewhere off the edge at 400%.
   *
   * `chromeTarget` is the untransformed layer over the viewport. Without one,
   * chrome renders in place — which keeps this component usable on its own and
   * is correct whenever there is no zoom to fight.
   */
  const withChrome = (chrome: React.ReactNode) =>
    chromeTarget ? createPortal(chrome, chromeTarget) : chrome;

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn(
          "absolute inset-0 w-full h-full",
          tracing || stamping ? "cursor-crosshair" : "pointer-events-none"
        )}
        onPointerMove={e => {
          if (tracing) setHover(pointerToPage(e));
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={e => {
          if (e.button !== 0) return;
          /*
            An ARMED overlay claims the gesture, for the same reason the legend
            capture layer does: the viewport underneath pans on a plain
            left-drag, and a React event raised here bubbles to it.

            The comment on `beginPlainPan` used to say an armed overlay "takes
            the event and this never fires". That was never true of a React
            event. Every mark dropped and every vertex clicked also began a pan,
            so any wobble between press and release slid the sheet under the
            click. Unarmed, the overlay is `pointer-events-none` and a drag on
            the drawing should pan — so the claim is conditional, not blanket.
          */
          if (tracing || stamping) e.stopPropagation();
          const page = pointerToPage(e);
          if (!page) return;
          if (tracing) {
            onPointsChange([...points, page]);
            return;
          }
          // The stamp mechanic: one selection, then a drop per click with
          // nothing to re-choose in between.
          if (stamping) onDropStamp(page);
        }}
        onDoubleClick={e => {
          // Double-click finishes, which is what every drawing tool does. The
          // extra point the first click added is already in the path.
          if (tracing && points.length >= 2) {
            e.preventDefault();
            onFinish();
          }
        }}
      >
        {/* Underneath every mark, so a guide never sits on top of a stamp. */}
        {tracing && (
          <CrosshairGuides
            at={hover}
            width={width}
            height={height}
            renderScale={renderScale}
            color={RUN_COLOR[pathType]}
          />
        )}

        {/* Runs already traced */}
        {existingRuns.map(run => {
          const screen = run.points.map(toScreen);
          if (screen.length < 2) return null;
          const isSelected = run.id === selectedRunId;
          return (
            <g
              key={run.id}
              className={tracing ? "" : "pointer-events-auto cursor-pointer"}
            >
              <polyline
                points={screen.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={runAppearance(run).color}
                /*
                  Clamped to a readable band on screen — see runScreenWidth.
                  Selection keeps the old 5:3 ratio rather than a fixed number,
                  so a selected run stays proportionally heavier at every zoom.
                */
                strokeWidth={runStroke * (isSelected ? 5 / 3 : 1)}
                strokeOpacity={run.isSuggestion ? 0.55 : 1}
                /*
                  One dash pattern, two meanings kept apart by which wins.

                  A SUGGESTION is dashed to say it is provisional — that is the
                  older meaning and it stays on top, because "the app guessed
                  this" matters more than what kind of run it would be. Once a
                  suggestion is accepted it becomes an ordinary run and takes
                  its type's style, which is cable dashed and conduit solid.
                */
                strokeDasharray={
                  run.isSuggestion ? "10 6" : runAppearance(run).dash
                }
                strokeLinejoin="round"
                strokeLinecap="round"
                onClick={() =>
                  !tracing && onSelectRun(isSelected ? null : run.id)
                }
              />
              {/* A fat invisible line makes the run clickable without needing
                  pixel-accurate aim on a thin stroke.

                  This needed the same clamp and for a sharper reason: 18 units
                  is 3.5 SCREEN pixels at Fit, so the run you could not see was
                  also one you could not click. A target is a thing for a finger
                  or a cursor, which are sized in screen pixels and not in the
                  drawing's units. */}
              <polyline
                points={screen.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth={hitWidth}
                onClick={() =>
                  !tracing && onSelectRun(isSelected ? null : run.id)
                }
              />
            </g>
          );
        })}

        {/* Stamps already placed. Uniform high-contrast markers rather than
            symbols imitating the drawing: the job here is to see at a glance
            what HAS been counted against the plan underneath, and a marker
            that blends into the drawing defeats exactly that. */}
        {stamps.map(placed => {
          const at = toScreen({ x: placed.x, y: placed.y });
          const isSelected = placed.id === selectedStampId;
          const { shape, color } = markAppearance(placed);
          /*
            Sized in screen pixels and expressed in overlay units, because this
            overlay is inside the zoom transform. Selection adds a fifth on top
            of whatever the clamp allowed, so it reads as "this one" at every
            zoom rather than only where there is room for it.
          */
          const r = markRadiusInOverlay(zoom) * (isSelected ? 1.2 : 1);
          const stroke = markStrokeInOverlay(zoom);
          return (
            <g
              key={`${placed.pending ? "pending" : "stamp"}-${placed.id}`}
              className={
                tracing || placed.pending
                  ? ""
                  : "pointer-events-auto cursor-pointer"
              }
              onClick={() =>
                !tracing &&
                !placed.pending &&
                onSelectStamp(isSelected ? null : placed.id)
              }
            >
              <path
                d={markPath(shape, at.x, at.y, r)}
                fill={color}
                fillOpacity={0.22}
                stroke={color}
                strokeWidth={isSelected ? stroke * 1.4 : stroke}
                strokeLinejoin="round"
              />
              {/*
                The centre dot is what makes a mark point at something. Kept at
                a fixed fraction of the shape so it stays a dot rather than
                becoming a filled shape at one zoom and vanishing at another.
              */}
              <circle cx={at.x} cy={at.y} r={r * 0.28} fill={color} />
              <title>{placed.name}</title>
            </g>
          );
        })}

        {/* Proposals from the plan reader. Under the focus ring and over the
            page, dashed and hollow: an estimator glancing at the drawing must
            be able to tell what has been counted from what has only been
            offered, without reading a legend to do it. */}
        {(proposals ?? []).map(proposal => {
          const at = toScreen({ x: proposal.x, y: proposal.y });
          const color = PROPOSAL_COLOR[proposal.confidence];
          return (
            <g key={`proposal-${proposal.id}`}>
              <circle
                cx={at.x}
                cy={at.y}
                r={10}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 3"
                strokeOpacity={0.9}
              />
              <title>{proposal.label} — proposed, not placed</title>
            </g>
          );
        })}

        {/* Where a click from the counted-items list landed. */}
        {focusPoint && (
          <circle
            cx={toScreen(focusPoint).x}
            cy={toScreen(focusPoint).y}
            r={runWidthInOverlay(zoom, 26)}
            fill="none"
            stroke="#F5C518"
            strokeWidth={runStroke}
            strokeDasharray="7 5"
            className="animate-pulse"
          />
        )}

        {/* The trace in progress */}
        {tracing && points.length > 0 && (
          <>
            <polyline
              points={points
                .map(toScreen)
                .map(p => `${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke={RUN_COLOR[pathType]}
              strokeWidth={runStroke}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Rubber band to the pointer, so the length updates before the
                click rather than after it. */}
            {hover && (
              <line
                x1={toScreen(points[points.length - 1]).x}
                y1={toScreen(points[points.length - 1]).y}
                x2={toScreen(hover).x}
                y2={toScreen(hover).y}
                stroke={RUN_COLOR[pathType]}
                strokeWidth={runStroke * (2 / 3)}
                strokeDasharray="6 5"
                strokeOpacity={0.75}
              />
            )}
            {points.map((point, index) => {
              const screen = toScreen(point);
              return (
                <circle
                  key={index}
                  cx={screen.x}
                  cy={screen.y}
                  r={runWidthInOverlay(zoom, index === 0 ? 6 : 4)}
                  fill={index === 0 ? RUN_COLOR[pathType] : "#0b0b0b"}
                  stroke={RUN_COLOR[pathType]}
                  strokeWidth={runStroke * (2 / 3)}
                />
              );
            })}
          </>
        )}
      </svg>

      {withChrome(
        <>
          {/*
            The no-scale notice is NOT here any more — it is a status chip in
            the viewer's top bar, beside the button that fixes it.

            It began pinned across the top-centre of the sheet, over the
            drawing, swallowing clicks in that whole region. It was moved to
            the bottom-left corner, which was better and still wrong: a panel
            that sits on the work is a panel people learn to resent, and a
            warning with no remedy next to it is only an interruption. Status
            and its remedy now live permanently in the same place, out of the
            drawing entirely.

            `blocked` still drives the CURSOR and the refusal to start a
            trace — that part was never about the notice.
          */}

          {stamping && armedGroupName && (
            /*
              Nothing in here is clickable — it is a label saying what is armed
              — so it takes no pointer events at all. Same reason as the tracing
              readout below: a pointer crossing a number must not change the
              cursor, and must not stop the drawing underneath from tracking it.
            */
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[#F5C518]/50 bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none">
              {/*
                "Counting", not "Stamping", since phase 6: a plain count has no
                stamp behind it, and the panel this feeds is called Counted
                items. One verb across the screen, and it is the true one for
                all four levels.
              */}
              <span className="text-xs text-muted-foreground">Counting</span>
              <span className="text-sm font-medium">{armedGroupName}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                click to place · Esc to stop
              </span>
            </div>
          )}

          {/* Live readout. Sits over the drawing because the number IS the task —
            making the user look elsewhere to see what they are measuring is how
            a wrong run gets committed. */}
          {tracing && (
            /*
              ── The BODY of this pill is click-through, and that is a fix ────
              It used to be `pointer-events-auto` across the whole rounded box.
              The pill floats at the top centre of the DRAWING, so tracing along
              the top of a sheet dragged the pointer across it — and over it the
              pointer stopped being the crosshair the armed tool sets, flicking
              to a normal arrow and back, several times in one run. Reported as
              "the crosshair flickers in and out as I move" on 2026-09-20.

              It cost more than the cursor. While the box swallowed pointer
              moves, the overlay below stopped receiving them, so the alignment
              guides froze mid-drawing at wherever the pointer was when it went
              under.

              So the container is click-through and only the CONTROLS take
              pointer events. The readout is something to look at, not something
              to hit, and a pointer passing over a number should not change
              what the tool is doing.
            */
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none">
              <span className="text-xs text-muted-foreground">
                {pathType === "conduit" ? "Conduit run" : "Cable run"}
              </span>
              <span className="font-mono text-sm tabular-nums">
                {liveInches === null ? "—" : formatFeetInches(liveInches)}
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                {points.length} {points.length === 1 ? "point" : "points"}
              </span>

              <div className="w-px h-4 bg-border" />

              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 pointer-events-auto"
                onClick={() => onPointsChange(points.slice(0, -1))}
                disabled={points.length === 0}
                title="Undo last point (Backspace)"
                aria-label="Undo last point"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-6 gap-1 text-xs pointer-events-auto"
                onClick={onFinish}
                disabled={points.length < 2}
                title="Finish this run (Enter or double-click)"
              >
                <Check className="w-3 h-3" /> Finish
                {committedInches !== null && points.length >= 2 && (
                  <span className="font-mono">
                    {formatFeetInches(committedInches)}
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground pointer-events-auto"
                onClick={onCancel}
                title="Discard this run (Escape twice)"
                aria-label="Discard this run"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
