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
  type RunTypeColors,
} from "@shared/takeoffMarks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CrosshairGuides, type CrosshairHandle } from "./CrosshairGuides";
import { CROSSHAIR_COLORS, crosshairCursorStyle } from "@/lib/crosshairCursor";
import { useCrosshairColor, useCrosshairSize } from "@/hooks/useCrosshairColor";
import { Check, Ruler, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatFeetInches,
  pathRealInches,
  screenToPagePoints,
  type PagePoint,
} from "@shared/takeoffGeometry";
import type { Measurability, RunPathType } from "@shared/takeoffQuantities";
import { legSnapLabel, type LegSnap } from "@/lib/legSnap";
import { stampsInBox } from "@/lib/stampSelection";
import { projectOntoPath } from "@shared/runNetwork";
import { JOINED_WITHIN_POINTS } from "@shared/quantityDrops";

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
  /**
   * Pull points on this run (`server/runBendDetail.ts`): the proposals and
   * the accepted ones. Only positions and state — the words and the buttons
   * are in the run panel, where the rest of a run is edited.
   */
  bends?: {
    proposals: {
      x: number;
      y: number;
      suggestedKind: "lb" | "pullBox";
      answer: { status: "accepted" | "dismissed" } | null;
    }[];
    accepted: { x: number; y: number; kind: "lb" | "pullBox" }[];
  } | null;
  /** Branch legs (D20): the run this row is a leg of; NULL on a root. */
  parentRunId?: number | null;
  /** The tee at each end, if the end sits on one. */
  startTee?: DrawnTee | null;
  endTee?: DrawnTee | null;
};

/**
 * A drop on a quantity trace (D21): proposed, approved or dismissed at one
 * leg end. Positions and state only — the words and buttons are in the run
 * panel, like a pull point's.
 */
export type DropMarker = {
  legId: number;
  end: "start" | "end";
  x: number;
  y: number;
  state: "proposed" | "approved" | "dismissed";
  /** Counted feet, or null when it cannot be measured yet. */
  feet: number | null;
};

type DrawnTee = {
  id: number;
  x: number;
  y: number;
  fitting: "box" | "body" | "mark" | null;
};

/**
 * Adding legs to a run while tracing (D20). Absent when the page does not
 * support it; `active` once the run has a first leg saved.
 */
export type TraceLegs = {
  /** A run is taking legs — the Finish commits all of it. */
  active: boolean;
  /** Waiting for the click that says where the next leg starts. */
  pending: boolean;
  /** A leg is being saved; clicks wait. */
  busy: boolean;
  /** Where the previous leg stopped — one end of the dashed jump. */
  prevEnd: PagePoint | null;
  /** How the leg in progress began, for the words in the pill. */
  startLabel: string | null;
  /** Save this leg and start another; `at` is a Shift-click's point. */
  onNewLeg: (at?: LegClick) => void;
  /** The first click of a leg. */
  onStart: (at: LegClick) => void;
  /** What a click here would do — the same rule the click uses. */
  preview: (at: LegClick) => LegSnap;
};

export type LegClick = { point: PagePoint; tolerance: number; free: boolean };

/**
 * How far a new leg's first click reaches for the run, in SCREEN pixels. Half
 * the run's hit target: aiming near a run is aiming at it, and no further.
 */
const LEG_SNAP_PX = HIT_TARGET_PX * 0.75;

/** The short label a pull-point marker carries on the drawing. */
const PULL_POINT_LABEL: Record<"lb" | "pullBox", string> = {
  lb: "LB",
  pullBox: "PB",
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
  endsLabel,
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
  selectedStampIds,
  onStampClick,
  onBoxSelect,
  onDeleteSelected,
  onClearSelection,
  focusPoint,
  chromeTarget,
  legs,
  drops,
  onSelectDrop,
  runColors,
}: {
  /** Which colour each run type gets on this bid — `takeoffRuns.typeColors`. */
  runColors: RunTypeColors;
  /** Branch legs while tracing (D20). Omitted, "New leg" does not exist. */
  legs?: TraceLegs;
  /** Drops on quantity traces (D21). Tapping one opens it in the panel. */
  drops?: DropMarker[];
  onSelectDrop?: (drop: { legId: number; end: "start" | "end" }) => void;
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
  /**
   * The armed ends as one sentence — `Panel → Receptacle` — or null.
   *
   * ── Why a READOUT here when a PICKER already exists ────────────────────────
   * The pickers are sticky on purpose (§ 5d: thirty homeruns is one decision,
   * not sixty) and they live in the toolbar at the top of the SCREEN. While
   * tracing, the estimator is watching their pointer in the middle of the
   * DRAWING, several hundred pixels away, so the one value most likely to be
   * stale is the one thing not in view. Reported 2026-09-20: "sticky is right
   * for thirty homeruns off one panel and wrong when I change what I'm tracing
   * and don't notice."
   *
   * It is a string rather than the two kinds, because naming an end needs the
   * company's own height types and this layer draws — it does not query. The
   * page builds the sentence with `traceEndsLabel`, which the pickers' own
   * triggers also read, so the two cannot disagree.
   *
   * It is NOT a control. Changing an end stays in the toolbar: a second place
   * to edit the same value is a second place for them to drift, and this pill
   * is click-through by design — see the comment on its container.
   */
  endsLabel: string | null;
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
  /**
   * The marks selected for deleting (@/lib/stampSelection). A click selects
   * one, Shift-click adds or removes one, Shift-drag boxes several.
   */
  selectedStampIds: ReadonlySet<number>;
  onStampClick: (id: number, additive: boolean) => void;
  /** The saved marks inside a Shift-drag box, in page points. */
  onBoxSelect: (ids: number[]) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  /** Highlighted after a jump from the counted-items list. */
  focusPoint: { x: number; y: number } | null;
  /** Untransformed layer for screen-sized chrome. See `withChrome` below. */
  chromeTarget?: HTMLElement | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [crosshairColor] = useCrosshairColor();
  const [crosshairSize] = useCrosshairSize();
  /** Moved directly, never through a render. See CrosshairGuides. */
  const guidesRef = useRef<CrosshairHandle | null>(null);
  /** Where the pointer is, for the rubber-band segment from the last vertex. */
  const [hover, setHover] = useState<PagePoint | null>(null);
  /** Alt is held: a new leg's first click places a free point (D20). */
  const [hoverAlt, setHoverAlt] = useState(false);

  /** A leg can be finished with nothing traced yet: the run's legs are saved. */
  const canFinish = points.length >= 2 || Boolean(legs?.active);

  /**
   * The ROOT of the selected run, so every leg of it is picked out together.
   * Null when nothing is selected, or while tracing — the pen needs the whole
   * drawing at full strength to aim by.
   */
  const selectedRoot = useMemo(() => {
    if (tracing || selectedRunId === null) return null;
    const row = existingRuns.find(r => r.id === selectedRunId);
    return row ? (row.parentRunId ?? row.id) : null;
  }, [tracing, selectedRunId, existingRuns]);
  /**
   * Whether a row belongs to a run OTHER than the selected one. Its pipe,
   * its leg jumps and its tees all dim together — found looking at the
   * finished screen: dimming only the pipe left another run's grey jumps and
   * coloured tees at full strength, louder than the lines they belong to.
   */
  const dimmedRow = (run: { id: number; parentRunId?: number | null }) =>
    selectedRoot !== null && (run.parentRunId ?? run.id) !== selectedRoot;

  /**
   * The snap reach in PAGE points: a fixed distance on SCREEN, whatever the
   * zoom — the same idea as the run's hit target. Measured off the overlay's
   * laid-out size, which already includes the zoom transform.
   */
  const snapReach = useCallback((): number => {
    const svg = svgRef.current;
    if (!svg) return LEG_SNAP_PX;
    const rect = svg.getBoundingClientRect();
    const devicePerCss = rect.width === 0 ? 1 : width / rect.width;
    return (LEG_SNAP_PX * devicePerCss) / renderScale;
  }, [width, renderScale]);

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

  const clientToPage = useCallback(
    (clientX: number, clientY: number): PagePoint | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      // The SVG is laid out at CSS size but sized in device pixels, so scale the
      // pointer into the SVG's own coordinate space before converting.
      const scaleX = rect.width === 0 ? 1 : width / rect.width;
      const scaleY = rect.height === 0 ? 1 : height / rect.height;
      return screenToPagePoints(
        {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY,
        },
        renderScale
      );
    },
    [width, height, renderScale]
  );
  const pointerToPage = useCallback(
    (e: React.PointerEvent): PagePoint | null =>
      clientToPage(e.clientX, e.clientY),
    [clientToPage]
  );

  /**
   * SHIFT-DRAG SELECTS A BOX of marks (@/lib/stampSelection).
   *
   * Only while Shift is held and no tool is armed: a plain drag on the sheet
   * pans, and that stays the gesture people use most. While Shift is held the
   * unarmed overlay takes pointer events so the drag reaches it, and its
   * pointerdown stops propagation so the viewport underneath does not pan at
   * the same time — the same claim an armed overlay makes, for the same
   * reason (see onPointerDown below).
   *
   * The move and release are followed on the WINDOW, so a box dragged past
   * the edge of the sheet still finishes.
   */
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    // A Shift released while the window is not focused never sends keyup.
    const clear = () => setShiftHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  const boxing = shiftHeld && !tracing && !stamping;
  const [box, setBox] = useState<{ from: PagePoint; to: PagePoint } | null>(
    null
  );
  const boxRef = useRef(box);
  boxRef.current = box;
  useEffect(() => {
    if (!box) return;
    const move = (e: PointerEvent) => {
      const page = clientToPage(e.clientX, e.clientY);
      if (page) setBox(current => (current ? { ...current, to: page } : null));
    };
    const end = () => {
      const done = boxRef.current;
      setBox(null);
      if (!done) return;
      /*
        A press that barely moved is a click, not a box. Measured in page
        points against the snap reach, which is a fixed distance on SCREEN
        whatever the zoom.
      */
      const reach = snapReach() * 0.3;
      if (
        Math.abs(done.to.x - done.from.x) < reach &&
        Math.abs(done.to.y - done.from.y) < reach
      )
        return;
      onBoxSelect(
        stampsInBox(
          stamps.filter(s => !s.pending),
          done.from,
          done.to
        )
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    // Re-bound only when a box starts or ends, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box !== null, clientToPage, snapReach, stamps, onBoxSelect]);

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
      } else if (e.key === "Enter" && canFinish) {
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
  }, [tracing, points, onPointsChange, onCancel, onFinish, canFinish]);

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
          tracing || stamping || boxing || box ? "" : "pointer-events-none",
          (boxing || box) && "cursor-crosshair"
        )}
        /*
          The crosshair is the CURSOR, not something drawn into the overlay.
          See @/lib/crosshairCursor — the compositor draws it with the pointer,
          so it cannot trail behind the way the old drawn one did.
        */
        style={
          tracing || stamping
            ? crosshairCursorStyle(crosshairColor, crosshairSize)
            : undefined
        }
        onPointerMove={e => {
          if (!tracing) return;
          const page = pointerToPage(e);
          /*
            The guides move IMPERATIVELY and the state update follows.

            Both describe the same pointer, and that is deliberate rather than
            redundant: the guides must be exact at pointer rate, while the
            rubber-band preview and the length readout are allowed to arrive a
            frame later. Routing the guides through `setHover` would put them
            behind whatever React is doing, which is the lag this change is
            for.
          */
          if (page)
            guidesRef.current?.moveTo(
              page.x * renderScale,
              page.y * renderScale
            );
          setHover(page);
          if (e.altKey !== hoverAlt) setHoverAlt(e.altKey);
        }}
        onPointerLeave={() => {
          guidesRef.current?.hide();
          setHover(null);
        }}
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
          if (boxing) {
            // A Shift-drag selects; it must not also pan the sheet.
            e.stopPropagation();
            e.preventDefault();
            setBox({ from: page, to: page });
            return;
          }
          if (tracing) {
            /*
              Branch legs (D20). While a leg is being saved a click would snap
              to the run as it was before the save, so it waits. The first
              click of a leg is snapped — onto this run, a mark, or free with
              Alt — and Shift-click ends this leg and starts the next there.
            */
            if (legs?.busy) return;
            const at = { point: page, tolerance: snapReach(), free: e.altKey };
            if (legs?.pending) {
              legs.onStart(at);
              return;
            }
            if (legs && e.shiftKey && points.length >= 2) {
              legs.onNewLeg(at);
              return;
            }
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
          if (tracing && canFinish) {
            e.preventDefault();
            onFinish();
          }
        }}
      >
        {/* Underneath every mark, so a guide never sits on top of a stamp. */}
        {tracing && (
          <CrosshairGuides
            ref={guidesRef}
            width={width}
            height={height}
            color={CROSSHAIR_COLORS[crosshairColor].hex}
          />
        )}

        {/* Runs already traced */}
        {existingRuns.map(run => {
          const screen = run.points.map(toScreen);
          if (screen.length < 2) return null;
          const isSelected = run.id === selectedRunId;
          /*
            Selecting ANY leg picks out the whole run (T14): its legs are one
            run in every count (D20), so lighting one and leaving its
            siblings looking like strangers would contradict the totals. The
            rest dim rather than vanish — "Hide other runs" in the panel is
            the switch that takes them away.
          */
          const inSelected =
            selectedRoot !== null &&
            (run.parentRunId ?? run.id) === selectedRoot;
          const dimmed = dimmedRow(run);
          const appearance = runAppearance(runColors, run);
          return (
            <g
              key={run.id}
              className={tracing ? "" : "pointer-events-auto cursor-pointer"}
            >
              <polyline
                points={screen.map(p => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={appearance.color}
                /*
                  Clamped to a readable band on screen — see runScreenWidth.
                  Selection keeps the old 5:3 ratio rather than a fixed number,
                  so a selected run stays proportionally heavier at every zoom.
                  Every leg of the selected run gets it, not only the row
                  that was clicked.
                */
                strokeWidth={runStroke * (inSelected || isSelected ? 5 / 3 : 1)}
                strokeOpacity={dimmed ? 0.25 : run.isSuggestion ? 0.55 : 1}
                /*
                  One dash pattern, two meanings kept apart by which wins.

                  A SUGGESTION is dashed to say it is provisional — that is the
                  older meaning and it stays on top, because "the app guessed
                  this" matters more than what kind of run it would be. Once a
                  suggestion is accepted it becomes an ordinary run and takes
                  its type's style, which is cable dashed and conduit solid.
                */
                strokeDasharray={run.isSuggestion ? "10 6" : appearance.dash}
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

        {/*
          BRANCH LEGS (D20). The jump between two legs is NOT pipe, so it is
          drawn thin, grey and dashed — clearly not a run — and nothing
          measures it. Only a leg that did not start on the run has one: a
          branch starts ON the run, and its tee is drawn instead.
        */}
        {(() => {
          const byRoot = new Map<number, ExistingRun[]>();
          for (const run of existingRuns) {
            const root = run.parentRunId ?? run.id;
            byRoot.set(root, [...(byRoot.get(root) ?? []), run]);
          }
          const jumps: React.ReactNode[] = [];
          byRoot.forEach(group => {
            const ordered = [...group].sort((a, b) => a.id - b.id);
            ordered.forEach((leg, i) => {
              if (i === 0 || leg.parentRunId == null || leg.startTee) return;
              /*
                A quantity leg that starts ON the trace joins it with no tee
                (D21) — like a branch, there is no gap to draw. Decided the
                way the drop proposals decide "joined", so the two agree.
              */
              const start = leg.points[0];
              if (
                start &&
                ordered.some(other => {
                  if (other.id === leg.id) return false;
                  const hit = projectOntoPath(other.points, start);
                  return hit !== null && hit.distance <= JOINED_WITHIN_POINTS;
                })
              )
                return;
              const prev = ordered[i - 1].points;
              if (prev.length === 0 || leg.points.length === 0) return;
              const a = toScreen(prev[prev.length - 1]);
              const b = toScreen(leg.points[0]);
              jumps.push(
                <line
                  key={`jump-${leg.id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#94A3B8"
                  strokeWidth={runStroke * 0.6}
                  strokeDasharray={`${runStroke * 2} ${runStroke * 2}`}
                  strokeOpacity={dimmedRow(leg) ? 0.25 : 0.9}
                >
                  <title>Jump between legs — not pipe, not measured</title>
                </line>
              );
            });
          });
          return jumps;
        })()}
        {(() => {
          // One square per tee, however many legs meet there.
          const tees = new Map<
            number,
            { tee: DrawnTee; color: string; dim: boolean }
          >();
          for (const run of existingRuns) {
            for (const tee of [run.startTee, run.endTee]) {
              if (tee && !tees.has(tee.id))
                tees.set(tee.id, {
                  tee,
                  color: runAppearance(runColors, run).color,
                  dim: dimmedRow(run),
                });
            }
          }
          const half = markRadiusInOverlay(zoom) * 0.55;
          const stroke = markStrokeInOverlay(zoom);
          return Array.from(tees.values()).map(({ tee, color, dim }) => {
            // A tee on a mark is that mark's box: the mark already shows it.
            if (tee.fitting === "mark") return null;
            const at = toScreen(tee);
            const answered = tee.fitting === "box";
            return (
              <rect
                key={`tee-${tee.id}`}
                x={at.x - half}
                y={at.y - half}
                width={half * 2}
                height={half * 2}
                fill={answered ? color : "none"}
                fillOpacity={answered ? 0.85 : 0}
                stroke={answered ? "#0b0b0b" : color}
                opacity={dim ? 0.3 : 1}
                strokeWidth={stroke}
                strokeDasharray={
                  answered ? undefined : `${half * 0.5} ${half * 0.4}`
                }
              >
                <title>
                  {answered
                    ? "Branch tee — a box where the branch leaves"
                    : "Branch tee — no box chosen yet"}
                </title>
              </rect>
            );
          });
        })()}

        {/* Stamps already placed. Uniform high-contrast markers rather than
            symbols imitating the drawing: the job here is to see at a glance
            what HAS been counted against the plan underneath, and a marker
            that blends into the drawing defeats exactly that. */}
        {stamps.map(placed => {
          const at = toScreen({ x: placed.x, y: placed.y });
          const isSelected = !placed.pending && selectedStampIds.has(placed.id);
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
              /*
                A press that starts ON a mark is a click on that mark, never
                the start of a box: stopped here so the overlay's box does not
                begin underneath it, and Shift-click can add or remove it.
              */
              onPointerDown={e => {
                if (boxing && !placed.pending) e.stopPropagation();
              }}
              onClick={e =>
                !tracing &&
                !placed.pending &&
                onStampClick(placed.id, e.shiftKey)
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

        {/* The Shift-drag selection box, while it is being dragged. */}
        {box &&
          (() => {
            const a = toScreen(box.from);
            const b = toScreen(box.to);
            const stroke = markStrokeInOverlay(zoom);
            return (
              <rect
                x={Math.min(a.x, b.x)}
                y={Math.min(a.y, b.y)}
                width={Math.abs(b.x - a.x)}
                height={Math.abs(b.y - a.y)}
                fill="#F5C518"
                fillOpacity={0.08}
                stroke="#F5C518"
                strokeWidth={stroke}
                strokeDasharray={`${stroke * 4} ${stroke * 3}`}
                pointerEvents="none"
              />
            );
          })()}

        {/*
          PULL POINTS, on top of runs and marks so a proposal is never hidden
          under the thing it is about.

          A BOX, because an LB and a pull box are both boxes, and because no
          count is drawn as an outline with a label — so it cannot be mistaken
          for a stamp. Proposed is dashed amber ("LB?"), the app's word for
          provisional; accepted is solid ("LB"); dismissed is a slate dash
          ("no LB"), kept on the drawing so the "no" is visible rather than looking
          like a corner nobody checked. Sized through the same clamp as a
          mark. Clicking one selects its run, whose row holds the buttons.
        */}
        {existingRuns.flatMap(run => {
          if (!run.bends) return [];
          const r = markRadiusInOverlay(zoom) * 0.85;
          const stroke = markStrokeInOverlay(zoom) * 0.8;
          const font = markRadiusInOverlay(zoom) * 1.05;
          const select = () =>
            !tracing && onSelectRun(run.id === selectedRunId ? null : run.id);
          const marker = (
            key: string,
            p: { x: number; y: number },
            label: string,
            state: "proposed" | "accepted" | "dismissed",
            title: string
          ) => {
            const at = toScreen(p);
            /*
              Dismissed is SLATE at full strength, not a faded grey: it was
              #94A3B8 at 60% first, and on white paper at 19% the "no PB" was
              unreadable (seen 2026-09-26) — a "no" nobody can see is the
              unchecked-looking corner this marker exists to avoid.
            */
            const color = state === "dismissed" ? "#64748B" : "#F5C518";
            return (
              <g
                key={key}
                // Dims with its run when another run is selected — see dimmedRow.
                opacity={dimmedRow(run) ? 0.3 : 1}
                className={tracing ? "" : "pointer-events-auto cursor-pointer"}
                onClick={select}
              >
                <rect
                  x={at.x - r}
                  y={at.y - r}
                  width={r * 2}
                  height={r * 2}
                  fill={state === "accepted" ? color : "none"}
                  fillOpacity={state === "accepted" ? 0.3 : 0}
                  stroke={color}
                  strokeWidth={stroke}
                  strokeDasharray={
                    state === "accepted" ? undefined : `${r * 0.5} ${r * 0.35}`
                  }
                />
                <text
                  x={at.x + r * 1.35}
                  y={at.y + font * 0.35}
                  fontSize={font}
                  fontWeight={600}
                  fill={color}
                  // A dark halo makes amber read on white paper and drowns
                  // slate, so the dismissed label gets a light one.
                  stroke={state === "dismissed" ? "#ffffff" : "#0b0b0b"}
                  strokeWidth={font * 0.18}
                  paintOrder="stroke"
                >
                  {label}
                </text>
                <title>{title}</title>
              </g>
            );
          };
          return [
            ...run.bends.proposals
              .filter(p => p.answer?.status !== "accepted")
              .map((p, i) =>
                p.answer?.status === "dismissed"
                  ? marker(
                      `pp-${run.id}-d${i}`,
                      p,
                      "no " + PULL_POINT_LABEL[p.suggestedKind],
                      "dismissed",
                      "Pull point dismissed — pulled through"
                    )
                  : marker(
                      `pp-${run.id}-p${i}`,
                      p,
                      PULL_POINT_LABEL[p.suggestedKind] + "?",
                      "proposed",
                      "Pull point proposed — open the run to answer"
                    )
              ),
            ...run.bends.accepted.map((a, i) =>
              marker(
                `pp-${run.id}-a${i}`,
                a,
                PULL_POINT_LABEL[a.kind],
                "accepted",
                a.kind === "lb" ? "LB added" : "Pull box added"
              )
            ),
          ];
        })}

        {/*
          DROPS ON QUANTITY TRACES (D21). The same three states and colours as
          a pull point — amber dashed is offered, amber solid is counted,
          slate is a "no" kept visible — but a CIRCLE with a down arrow, so a
          drop is never read as a box. Tapping one opens it in the run panel,
          where its type and height are changed.
        */}
        {(drops ?? []).map(drop => {
          const at = toScreen(drop);
          const r = markRadiusInOverlay(zoom) * 0.75;
          const stroke = markStrokeInOverlay(zoom) * 0.8;
          const font = markRadiusInOverlay(zoom) * 1.05;
          const color = drop.state === "dismissed" ? "#64748B" : "#F5C518";
          const label =
            drop.state === "proposed"
              ? "drop?"
              : drop.state === "approved"
                ? "drop"
                : "no drop";
          // Dims with its run when another run is selected — see dimmedRow.
          const legRow = existingRuns.find(r => r.id === drop.legId);
          return (
            <g
              key={`drop-${drop.legId}-${drop.end}`}
              opacity={legRow && dimmedRow(legRow) ? 0.3 : 1}
              className={tracing ? "" : "pointer-events-auto cursor-pointer"}
              onClick={() =>
                !tracing && onSelectDrop?.({ legId: drop.legId, end: drop.end })
              }
            >
              <circle
                cx={at.x}
                cy={at.y}
                r={r}
                fill={drop.state === "approved" ? color : "none"}
                fillOpacity={drop.state === "approved" ? 0.3 : 0}
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={
                  drop.state === "approved"
                    ? undefined
                    : `${r * 0.45} ${r * 0.35}`
                }
              />
              {drop.state !== "dismissed" && (
                <path
                  d={`M ${at.x} ${at.y - r * 0.55} L ${at.x} ${at.y + r * 0.5} M ${at.x - r * 0.4} ${at.y + r * 0.1} L ${at.x} ${at.y + r * 0.5} L ${at.x + r * 0.4} ${at.y + r * 0.1}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={at.x + r * 1.35}
                y={at.y + font * 0.35}
                fontSize={font}
                fontWeight={600}
                fill={color}
                stroke={drop.state === "dismissed" ? "#ffffff" : "#0b0b0b"}
                strokeWidth={font * 0.18}
                paintOrder="stroke"
              >
                {label}
              </text>
              <title>
                {drop.state === "proposed"
                  ? "Drop proposed — tap to look at it; open the trace to approve"
                  : drop.state === "approved"
                    ? drop.feet === null
                      ? "Drop approved — not measurable yet"
                      : `Drop approved — ${drop.feet.toFixed(2)} ft`
                    : "No drop here — answered"}
              </title>
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

        {/*
          The next leg (D20): while choosing where it starts, a ring shows
          what the click will do — the same rule the click uses — and a dashed
          grey jump runs from where the last leg stopped. The jump stays until
          the leg is finished, and is never part of any length.
        */}
        {tracing &&
          legs?.active &&
          (() => {
            const preview =
              legs.pending && hover
                ? legs.preview({
                    point: hover,
                    tolerance: snapReach(),
                    free: hoverAlt,
                  })
                : null;
            const to = points[0] ?? preview?.point ?? null;
            const r = markRadiusInOverlay(zoom) * 0.7;
            const stroke = markStrokeInOverlay(zoom);
            return (
              <>
                {legs.prevEnd && to && (
                  <line
                    x1={toScreen(legs.prevEnd).x}
                    y1={toScreen(legs.prevEnd).y}
                    x2={toScreen(to).x}
                    y2={toScreen(to).y}
                    stroke="#94A3B8"
                    strokeWidth={runStroke * 0.6}
                    strokeDasharray={`${runStroke * 2} ${runStroke * 2}`}
                  />
                )}
                {preview && (
                  <g pointerEvents="none">
                    {preview.kind === "tee" ? (
                      <rect
                        x={toScreen(preview.point).x - r}
                        y={toScreen(preview.point).y - r}
                        width={r * 2}
                        height={r * 2}
                        fill="#F5C518"
                        fillOpacity={0.25}
                        stroke="#F5C518"
                        strokeWidth={stroke}
                      />
                    ) : (
                      <circle
                        cx={toScreen(preview.point).x}
                        cy={toScreen(preview.point).y}
                        r={r}
                        fill="none"
                        stroke={
                          preview.kind === "stamp" ? "#F5C518" : "#94A3B8"
                        }
                        strokeWidth={stroke}
                        strokeDasharray={
                          preview.kind === "free"
                            ? `${r * 0.4} ${r * 0.3}`
                            : undefined
                        }
                      />
                    )}
                  </g>
                )}
              </>
            );
          })()}

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

          {!tracing && !stamping && selectedStampIds.size > 0 && (
            /*
              What is selected, and the one thing to do with it. The body is
              click-through like the other pills, so a pointer crossing it does
              not stop the sheet underneath tracking; only the buttons take
              pointer events. Delete is also the Delete / Backspace key.
            */
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 w-max whitespace-nowrap flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none"
              role="status"
              aria-live="polite"
            >
              <span className="text-sm font-medium">
                {selectedStampIds.size}{" "}
                {selectedStampIds.size === 1 ? "mark" : "marks"} selected
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                Shift-click or Shift-drag to add more
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-xs pointer-events-auto"
                onClick={onDeleteSelected}
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground pointer-events-auto"
                onClick={onClearSelection}
                aria-label="Clear the selection"
                title="Clear the selection (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

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

              ── `w-max` is load-bearing, not tidying ────────────────────────
              An absolutely positioned box at `left-1/2` is laid out in the half
              of its container to the RIGHT of that point, so shrink-to-fit
              caps it at HALF the drawing's width — `-translate-x-1/2` moves it
              back into the middle afterwards but never gives the width back.
              Measured when the ends were added: parent 796px, left 398px,
              pill 398px exactly, and three of its four labels wrapping onto
              two lines. `w-max` takes the width from the content instead.

              The counting pill below has the same `left-1/2` pattern and the
              same latent ceiling. It is not over it today, so it is left
              alone — but it is the same one line if it ever gets a term added.
            */
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-max whitespace-nowrap flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none">
              <span className="text-xs text-muted-foreground">
                {pathType === "conduit" ? "Conduit run" : "Cable run"}
              </span>
              {/*
                TWO NUMBERS, EACH SAYING WHICH IT IS.

                This pill showed the length INCLUDING the rubber-band segment
                to the cursor, while the Finish button showed only the placed
                points. Two different figures, a few inches apart, neither
                labelled — so the big one read as "the run" and it was not:
                move the mouse and it changes, and what gets saved is the
                other one. Reported from bid 23 on 2026-09-21.

                Placed comes first and stays put, because it is the number
                that will exist after the next click. "To cursor" appears only
                while there IS a rubber band, so a finished path shows one
                figure rather than the same figure twice.
              */}
              {/*
                ── EVERY SLOT IN THIS PILL HAS A FIXED WIDTH ─────────────────
                Fixed 2026-09-24: the undo arrow could not be clicked. The pill
                is centred, so any change in its width moves every control in
                it — and moving the pointer ONTO a control takes the hover off
                the drawing, which dropped the "to cursor" figure, which shrank
                the pill, which slid the arrow out from under the pointer. Back
                on the drawing the figure returned and the pill grew again.

                So the readouts reserve their width whether or not they have
                anything to show (`invisible`, never unmounted), and the
                numbers sit in slots sized for the longest ordinary figure.
                The pill is the same width for the whole run, and nothing in
                it can push or cover anything else.
              */}
              <span className="font-mono text-sm tabular-nums inline-block min-w-[9ch] text-right">
                {committedInches === null
                  ? "—"
                  : formatFeetInches(committedInches)}
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                {/* No scale: the path is still worth drawing, and its length
                    is typed in the run panel once it is finished (§ 4c). */}
                {ratio === null
                  ? "no scale — type the length when finished"
                  : "placed"}
              </span>
              <span
                className={cn(
                  "flex items-center gap-2",
                  !(
                    liveInches !== null &&
                    committedInches !== null &&
                    Math.abs(liveInches - committedInches) > 0.5
                  ) && "invisible"
                )}
                aria-hidden={liveInches === null}
              >
                <span className="font-mono text-sm tabular-nums text-muted-foreground inline-block min-w-[9ch] text-right">
                  {liveInches === null ? "" : formatFeetInches(liveInches)}
                </span>
                <span className="text-[0.7rem] text-muted-foreground">
                  to cursor
                </span>
              </span>
              <span className="text-[0.7rem] text-muted-foreground inline-block min-w-[4.5rem] tabular-nums">
                {points.length} {points.length === 1 ? "point" : "points"}
              </span>

              {endsLabel && (
                <>
                  <div className="w-px h-4 bg-border" />
                  <span
                    className="text-[0.7rem] text-muted-foreground"
                    title="What this run starts and ends at — change it in the toolbar"
                  >
                    {endsLabel}
                  </span>
                </>
              )}

              {legs?.active && (
                <>
                  <div className="w-px h-4 bg-border" />
                  <span className="text-[0.7rem] text-muted-foreground">
                    {legs.busy
                      ? "Saving the leg…"
                      : legs.pending
                        ? hover
                          ? legSnapLabel(
                              legs.preview({
                                point: hover,
                                tolerance: snapReach(),
                                free: hoverAlt,
                              })
                            )
                          : "Click where the next leg starts"
                        : (legs.startLabel ?? "New leg")}
                  </span>
                </>
              )}

              <div className="w-px h-4 bg-border" />

              {legs && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs pointer-events-auto"
                  onClick={() => legs.onNewLeg()}
                  disabled={points.length < 2 || legs.busy}
                  title="Keep this leg and start another on the same run — a branch if you start on the run (Shift-click the next start)"
                >
                  New leg
                </Button>
              )}

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
                disabled={!canFinish || Boolean(legs?.busy)}
                title="Finish this run (Enter or double-click)"
              >
                <Check className="w-3 h-3" /> Finish
                <span className="font-mono inline-block min-w-[9ch] text-left">
                  {committedInches !== null && points.length >= 2
                    ? formatFeetInches(committedInches)
                    : ""}
                </span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground pointer-events-auto"
                onClick={onCancel}
                title={
                  legs?.active
                    ? "Discard this leg — the legs already saved stay (Escape twice)"
                    : "Discard this run (Escape twice)"
                }
                aria-label={
                  legs?.active ? "Discard this leg" : "Discard this run"
                }
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
