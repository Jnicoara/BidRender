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
import type { PinStyle } from "@shared/pinLetters";
import {
  LETTER_MIN_PX,
  letterFit,
  markAppearance,
  markPaint,
  markPath,
  markRadiusInOverlay,
  markScreenDiameter,
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
import {
  useCrosshairColor,
  useCrosshairSize,
  useShowNextSegment,
} from "@/hooks/useCrosshairColor";
import { Check, Ruler, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeightFields } from "@/components/HeightFields";
import { traceReadout } from "@/lib/traceReadout";
import {
  formatFeetInches,
  screenToPagePoints,
  type PagePoint,
} from "@shared/takeoffGeometry";
import type { Measurability, RunPathType } from "@shared/takeoffQuantities";
import {
  legSnapLabel,
  snapToMark,
  type LegSnap,
  type SnapStamp,
} from "@/lib/legSnap";
import {
  MARK_STATUS_LABEL,
  USER_MARK_STATUSES,
  isUserMarkStatus,
  type MarkStatus,
  type UserMarkStatus,
} from "@shared/markStatus";
import {
  connectLabel,
  connectShortLabel,
  type ConnectPoint,
} from "@shared/connectPoint";
import { stampsInBox } from "@/lib/stampSelection";
import { projectOntoPath } from "@shared/runNetwork";
import { JOINED_WITHIN_POINTS } from "@shared/quantityDrops";
import { traceClickPoint } from "@/lib/traceClick";
import { pastDragThreshold } from "@/lib/dragThreshold";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  insertPoint,
  isPinned,
  movePoint,
  removePoint,
  samePoints,
  segmentMidpoints,
  type PinnedEnds,
} from "@/lib/runPointEdit";

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

/**
 * Where a run meets a wall device: at the wall (found), or at the centre and
 * short (amber, dashed, "?" — the drawing's language for provisional).
 */
const MEETS_WALL_COLOR = "#22D3EE";
const MEETS_UNSURE_COLOR = "#F59E0B";
/** The same two, dark enough to read as text on a white sheet. */
const MEETS_WALL_TEXT = "#0E7490";
const MEETS_UNSURE_TEXT = "#B45309";
/** A run end this close to a mark's point (page points) sits on it. */
const ON_END_POINTS = 0.75;

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
   * NULL = new. Required, like SnapStamp's: the snap reads it, and a list that
   * left it out would let a run snap to an unconfirmed mark (@shared/markStatus).
   */
  status: MarkStatus | null;
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
  moveTargets,
  onMoveSelected,
  onSetStatusSelected,
  selectedDrop,
  onSetHeightSelected,
  onSetDropExcludedSelected,
  onClearSelection,
  focusPoint,
  chromeTarget,
  legs,
  drops,
  onSelectDrop,
  runColors,
  pins,
  editableRunId = null,
  onEditPoints,
  onPickEnd,
  selectMode = false,
  freePoints = false,
  onToggleFreePoints,
  connects,
}: {
  /**
   * Where a run meets each mark (shared/connectPoint.ts), by stamp id. Every
   * snap to a mark lands here: at the wall for a wall device, else the centre.
   * Omitted, a run meets every mark at its centre, as before.
   */
  connects?: ReadonlyMap<number, ConnectPoint>;
  /**
   * Each count's letter and first-use colour on this bid (shared/pinLetters).
   * The panel's swatches read the same map, so a card and its pins agree.
   */
  pins?: ReadonlyMap<number, PinStyle>;
  /**
   * The run whose points can be dragged (T8, D7a) — the selected one, when
   * nothing else is armed and the bid is not locked. Null shows no handles.
   */
  editableRunId?: number | null;
  /** A drag, an added point or a removed one, finished: save these points. */
  onEditPoints?: (runId: number, points: PagePoint[]) => void;
  /** An end of the selected run clicked (not dragged): show it in Run ends. */
  onPickEnd?: (runId: number, end: "start" | "end") => void;
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
  /**
   * The counts the selection can be moved to. Empty hides "Move to" — on a
   * locked bid, where the server would refuse it anyway.
   */
  moveTargets?: { id: number; label: string }[];
  onMoveSelected?: (groupId: number) => void;
  /** Set the selected marks' status. Omitted (a locked bid), no control. */
  onSetStatusSelected?: (status: UserMarkStatus) => void;
  /**
   * The selection's own height (null: none set, or they differ) and how
   * many have their drop left off (vertical-drops-plan § 2).
   */
  selectedDrop?: { inches: number | null; mixed: boolean; excluded: number };
  /** Set the selected marks' own height, or null to follow the count. */
  onSetHeightSelected?: (inches: number | null) => void;
  /** "No drop on these" / give them back. Omitted (locked), no control. */
  onSetDropExcludedSelected?: (excluded: boolean) => void;
  onClearSelection: () => void;
  /** Highlighted after a jump from the counted-items list. */
  focusPoint: { x: number; y: number } | null;
  /** Untransformed layer for screen-sized chrome. See `withChrome` below. */
  chromeTarget?: HTMLElement | null;
  /**
   * SELECT, the touch version of Shift (references/device-audit.md § Touch).
   * While on, a tap on a mark adds or removes it and a finger drag boxes
   * marks — exactly what Shift-click and Shift-drag do with a mouse.
   */
  selectMode?: boolean;
  /**
   * FREE POINTS, the touch version of Alt: the next leg's first point lands
   * where it is put rather than snapping to the run or a mark (D20).
   */
  freePoints?: boolean;
  /** Shows the Snap / Free switch in the trace pill on a coarse pointer. */
  onToggleFreePoints?: () => void;
}) {
  const coarse = useCoarsePointer();
  /**
   * The floating pills' shape. One line with a mouse, as always. With a
   * finger every button in them is 44 px, and on one line the trace pill ran
   * past both edges of an upright tablet's drawing (seen 2026-10-01: "Run
   * total" cut to "n Run total"), so there it wraps inside the drawing.
   */
  const pillShape = coarse
    ? "w-max max-w-[calc(100%-1rem)] flex-wrap justify-center rounded-2xl"
    : "w-max whitespace-nowrap rounded-full";
  /*
    The SELECTION pill wraps on every device. With "Move to…", "Mark as…",
    a height and "No drop on these" it is wider than the drawing pane at
    laptop width, and one unwrapped row ran off both sides — the count of
    marks selected was under the side panel (seen 2026-10-05, 1536 px).
  */
  const widePillShape =
    "w-max max-w-[calc(100%-1rem)] flex-wrap justify-center rounded-2xl";
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** When the last press while tracing landed — see @/lib/traceClick. */
  const lastTracePress = useRef(Number.NEGATIVE_INFINITY);
  const [crosshairColor] = useCrosshairColor();
  const [crosshairSize] = useCrosshairSize();
  /** Moved directly, never through a render. See CrosshairGuides. */
  const guidesRef = useRef<CrosshairHandle | null>(null);
  /** Where the pointer is, for the rubber-band segment from the last vertex. */
  const [hover, setHover] = useState<PagePoint | null>(null);
  /** Alt is held: a new leg's first click places a free point (D20). */
  const [hoverAlt, setHoverAlt] = useState(false);

  /**
   * The marks a run can snap to, each with where a run MEETS it. A mark still
   * on its way to the server is not a target: it has no row to link yet.
   */
  const snapStamps = useMemo<SnapStamp[]>(
    () =>
      stamps
        .filter(s => !s.pending)
        .map(s => ({
          id: s.id,
          x: s.x,
          y: s.y,
          status: s.status,
          connect: connects?.get(s.id)?.point,
        })),
    [stamps, connects]
  );

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
  const pagePerScreenPx = useCallback((): number => {
    const svg = svgRef.current;
    if (!svg) return 1;
    const rect = svg.getBoundingClientRect();
    const devicePerCss = rect.width === 0 ? 1 : width / rect.width;
    return devicePerCss / renderScale;
  }, [width, renderScale]);
  const snapReach = useCallback(
    (): number => LEG_SNAP_PX * pagePerScreenPx(),
    [pagePerScreenPx]
  );

  /**
   * An ordinary trace click near a mark lands on the mark's connect point —
   * since 2026-10-01; before, it stayed where it fell, so a run "ending at" a
   * wall receptacle ended at the middle of its symbol, short by the stand-off
   * (references/connect-point-plan.md). Alt, or Free on a touch screen,
   * places the point exactly where it falls. Null: no mark in reach.
   */
  const traceSnap = useCallback(
    (at: PagePoint, free: boolean) =>
      free ? null : snapToMark(at, snapReach(), snapStamps),
    [snapReach, snapStamps]
  );
  /** The same snap for where the pointer is, so the ring shows the click. */
  const hoverSnap =
    tracing && !legs?.pending && hover
      ? traceSnap(hover, hoverAlt || freePoints)
      : null;

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

  /**
   * WHERE A RUN MEETS A DEVICE, drawn (connect-point plan § 4.1, § 5.3).
   *
   * - At the wall: a short solid tick from the symbol's centre to the foot on
   *   the wall, ending in a dot — the run stops at the box, and this says why
   *   it does not reach the middle of the symbol.
   * - A wall device met at its centre (a scan, no wall found, not read yet):
   *   a dashed amber ring with "?" — that end is short by the stand-off, and
   *   nothing else on the screen would say so.
   * - A centre-mounted device: nothing extra; meeting a light in the middle
   *   is what everyone expects.
   *
   * `label` adds the few words beside it, for the cursor preview only.
   */
  const renderMeets = (
    key: string,
    stamp: { x: number; y: number },
    connect: ConnectPoint | undefined,
    label: boolean,
    title?: string
  ) => {
    if (!connect || connect.kind === "centre") return null;
    const r = markRadiusInOverlay(zoom) * 0.45;
    const stroke = markStrokeInOverlay(zoom);
    const centre = toScreen(stamp);
    const at = toScreen(connect.point);
    const text = label ? connectShortLabel(connect) : null;
    const fontSize = runWidthInOverlay(zoom, 11);
    const labelSize = runWidthInOverlay(zoom, 13);
    return (
      <g key={key} pointerEvents="none">
        <title>{title ?? connectLabel(connect)}</title>
        {connect.kind === "wall" ? (
          <>
            <line
              x1={centre.x}
              y1={centre.y}
              x2={at.x}
              y2={at.y}
              stroke={MEETS_WALL_COLOR}
              strokeWidth={stroke}
              strokeLinecap="round"
            />
            <circle
              cx={at.x}
              cy={at.y}
              r={r * 0.6}
              fill={MEETS_WALL_COLOR}
              stroke="#0b0b0b"
              strokeWidth={stroke * 0.5}
            />
          </>
        ) : (
          <>
            <circle
              cx={at.x}
              cy={at.y}
              r={r * 1.6}
              fill="none"
              stroke={MEETS_UNSURE_COLOR}
              strokeWidth={stroke}
              strokeDasharray={`${r * 0.5} ${r * 0.35}`}
            />
            <text
              x={at.x}
              y={at.y + fontSize * 0.35}
              textAnchor="middle"
              fontSize={fontSize}
              fontWeight={700}
              fill={MEETS_UNSURE_COLOR}
              stroke="#0b0b0b"
              strokeWidth={fontSize * 0.18}
              paintOrder="stroke"
            >
              ?
            </text>
          </>
        )}
        {text && (
          /*
            Dark text on a white halo, not the "Next" label's light-on-dark:
            this one sits right on the line work it is talking about, and a
            sheet is white. Checked at 1536 px and on a tablet, 2026-10-01 —
            the dark halo read as a smudge.
          */
          <text
            x={at.x + runWidthInOverlay(zoom, 12)}
            y={at.y + runWidthInOverlay(zoom, 18)}
            fontSize={labelSize}
            fontWeight={600}
            fill={connect.kind === "wall" ? MEETS_WALL_TEXT : MEETS_UNSURE_TEXT}
            stroke="#ffffff"
            strokeWidth={labelSize * 0.3}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {text}
          </text>
        )}
      </g>
    );
  };

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
  const boxing = (shiftHeld || selectMode) && !tracing && !stamping;
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

  /*
    ── EDITING A RUN'S POINTS (T8, D7a) ────────────────────────────────────────
    The selected run shows a round handle per point and a faint "+" on each
    segment. Drag a handle to move it, drag a "+" to add a point there,
    right-click a handle (or click it, then Delete) to remove it. The line
    follows the pointer live and saves on release; Escape during a drag puts
    it back and saves nothing. The rules are @/lib/runPointEdit.

    A handle's press calls stopPropagation: the viewport pans on a plain
    left-drag, and a React event raised here bubbles to it (CLAUDE.md § "a
    comment claiming that SOMETHING ELSE handles it").
  */
  type Drag = {
    runId: number;
    index: number;
    /** The points before the drag, with an inserted point already in. */
    origin: PagePoint[];
    points: PagePoint[];
    pinned: PinnedEnds;
    moved: boolean;
    /** Started on a "+": the point exists only if the drag goes somewhere. */
    inserted: boolean;
    /** Where the press began, on screen — for the drag threshold. */
    start: { x: number; y: number };
  };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const [pickedVertex, setPickedVertex] = useState<{
    runId: number;
    index: number;
  } | null>(null);
  useEffect(() => {
    setPickedVertex(null);
    setDrag(null);
  }, [editableRunId]);

  /*
    The points just saved, held until the run list catches up. Without it the
    line jumps back to where it was for the length of the save and then
    forward again, on the one thing the person is watching. Cleared by ANY
    change to the list: the page writes the new points into its cache at once,
    and restores the old ones if the save fails, and both arrive here as a new
    list.
  */
  const [settled, setSettled] = useState<{
    runId: number;
    points: PagePoint[];
  } | null>(null);
  useEffect(() => setSettled(null), [existingRuns]);
  /** Where a run's points are drawn: mid-drag, just saved, or as stored. */
  const pointsNow = (run: ExistingRun): PagePoint[] =>
    drag && drag.runId === run.id
      ? drag.points
      : settled && settled.runId === run.id
        ? settled.points
        : run.points;
  const commitEdit = useCallback(
    (runId: number, points: PagePoint[]) => {
      setSettled({ runId, points });
      onEditPoints?.(runId, points);
    },
    [onEditPoints]
  );

  /**
   * An END let go near a mark lands on it, as tracing does — at its connect
   * point, through the same `snapToMark` a click uses, so a dragged end and a
   * clicked one cannot meet the same device in two places.
   */
  const snapEnd = useCallback(
    (d: Drag, points: PagePoint[]): PagePoint[] => {
      if (d.index !== 0 && d.index !== points.length - 1) return points;
      const hit = snapToMark(points[d.index], snapReach(), snapStamps);
      if (!hit) return points;
      return movePoint(points, d.index, hit.point, d.pinned) ?? points;
    },
    [snapReach, snapStamps]
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const page = clientToPage(e.clientX, e.clientY);
      const d = dragRef.current;
      if (!page || !d) return;
      /*
        A press is a CLICK until the pointer has moved DRAG_THRESHOLD_PX
        (2026-09-29). It used to become a move on ANY movement, so a click
        meant to pick a point committed a hair's shift to the run's length.
      */
      if (
        !d.moved &&
        !pastDragThreshold(d.start, { x: e.clientX, y: e.clientY })
      )
        return;
      const next = movePoint(d.origin, d.index, page, d.pinned);
      if (next) setDrag({ ...d, points: next, moved: true });
    };
    const end = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        // A press with no movement picks the point, so Delete can remove it.
        // A "+" pressed and not dragged adds nothing.
        if (!d.inserted) {
          setPickedVertex({ runId: d.runId, index: d.index });
          // An END pressed and let go shows that end in the Run ends section.
          const last = d.origin.length - 1;
          if (d.index === 0 || d.index === last)
            onPickEnd?.(d.runId, d.index === 0 ? "start" : "end");
        }
        return;
      }
      const final = snapEnd(d, d.points);
      const run = existingRuns.find(r => r.id === d.runId);
      if (run && !samePoints(run.points, final)) commitEdit(d.runId, final);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", key, true);
    };
    // Re-bound only when a drag starts or ends, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drag !== null,
    clientToPage,
    snapEnd,
    existingRuns,
    commitEdit,
    onPickEnd,
  ]);

  /**
   * Remove the picked point — the Delete key, a right-click on the handle,
   * and (for a finger, which has neither) the "Remove point" button in the
   * pill below. One function, so the three cannot disagree about pinned ends.
   */
  const pickedRun = pickedVertex
    ? (existingRuns.find(r => r.id === pickedVertex.runId) ?? null)
    : null;
  const pickedRemoval =
    pickedVertex && pickedRun
      ? removePoint(pickedRun.points, pickedVertex.index, {
          start: !!pickedRun.startTee,
          end: !!pickedRun.endTee,
        })
      : null;
  const removePicked = useCallback(() => {
    if (!pickedRun || !pickedRemoval) return;
    setPickedVertex(null);
    commitEdit(pickedRun.id, pickedRemoval);
  }, [pickedRun, pickedRemoval, commitEdit]);

  /** Delete or Backspace removes the picked point; Escape lets go of it. */
  useEffect(() => {
    if (!pickedVertex) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        setPickedVertex(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const run = existingRuns.find(r => r.id === pickedVertex.runId);
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      const next = removePoint(run.points, pickedVertex.index, {
        start: !!run.startTee,
        end: !!run.endTee,
      });
      setPickedVertex(null);
      if (next) commitEdit(run.id, next);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pickedVertex, existingRuns, commitEdit]);

  /**
   * Run total (clicked points only — the pill) and Next (last point to the
   * cursor — the label at the cursor). @/lib/traceReadout keeps the cursor
   * out of the total; its test is what says so.
   */
  const readout = useMemo(
    // The snapped point, so "Next" is the length the click will actually add.
    () =>
      traceReadout(points, tracing ? (hoverSnap?.point ?? hover) : null, ratio),
    [tracing, points, hover, hoverSnap?.point.x, hoverSnap?.point.y, ratio]
  );
  const [showNext] = useShowNextSegment();

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

  /**
   * A glyph for each run end that sits ON a wall device: at its wall foot
   * (meets the wall), or at its centre (short — a run traced before this, or
   * placed with Alt). Only a mark the end actually sits on.
   */
  const runEndMeets = () =>
    existingRuns.flatMap(run => {
      const inSelected =
        selectedRoot !== null && (run.parentRunId ?? run.id) === selectedRoot;
      if (!tracing && !inSelected) return [];
      const pts = pointsNow(run);
      if (pts.length < 2) return [];
      return [pts[0], pts[pts.length - 1]].flatMap((end, i) => {
        const near = (p: PagePoint) =>
          Math.hypot(p.x - end.x, p.y - end.y) <= ON_END_POINTS;
        for (const s of snapStamps) {
          const connect = connects?.get(s.id);
          // Not read yet: say nothing rather than flash amber for the half
          // second the worker takes.
          if (
            !connect ||
            (connect.kind === "no-wall" && connect.reason === "reading")
          )
            continue;
          const key = `meets-${run.id}-${i}`;
          if (connect.kind === "wall" && near(connect.point))
            return [renderMeets(key, s, connect, false)];
          if (connect.kind !== "centre" && near(s))
            return [
              connect.kind === "wall"
                ? renderMeets(
                    key,
                    s,
                    {
                      kind: "no-wall",
                      point: { x: s.x, y: s.y },
                      reason: "none-in-reach",
                    },
                    false,
                    "This end stops at the symbol's centre — the wall is beside it. Drag the end onto the mark to meet the wall."
                  )
                : renderMeets(key, s, connect, false),
            ];
        }
        return [];
      });
    });

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
        // In Select mode a finger boxes marks instead of panning the sheet
        // (TakeoffPage's touch router passes it straight through).
        data-touch-drag={boxing || box ? "" : undefined}
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
            const at = {
              point: page,
              tolerance: snapReach(),
              free: e.altKey || freePoints,
            };
            if (legs?.pending) {
              legs.onStart(at);
              return;
            }
            if (legs && e.shiftKey && points.length >= 2) {
              legs.onNewLeg(at);
              return;
            }
            // The second press of a double-click lands on or near the point
            // the first one placed; adding it drew a stub the bend counter
            // read as an elbow. Judged by distance AND by the time since the
            // previous press, so a drifting double-click at low zoom is
            // caught too. @/lib/traceClick.
            const now = e.timeStamp;
            const since = now - lastTracePress.current;
            lastTracePress.current = now;
            //
            // On a mark the point is its connect point (the wall, for a wall
            // device), and the double-click test reads THAT point, not the
            // raw press — see traceClickPoint for the stub it stops.
            const next = traceClickPoint(
              points,
              page,
              traceSnap(page, e.altKey || freePoints)?.point ?? null,
              pagePerScreenPx(),
              since
            );
            if (next) onPointsChange([...points, next]);
            return;
          }
          // The stamp mechanic: one selection, then a drop per click with
          // nothing to re-choose in between.
          if (stamping) onDropStamp(page);
        }}
        onDoubleClick={e => {
          // Double-click finishes, which is what every drawing tool does. The
          // first press placed the end point; the second added nothing
          // (traceClickPoint above).
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
          // While a point is being dragged the line follows the pointer.
          const livePoints = pointsNow(run);
          const screen = livePoints.map(toScreen);
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
          const { shape, color, letter, status } = markAppearance(placed, pins);
          const paint = markPaint(status, color);
          // Below the size a letter can be read at, shape + colour remain.
          const showLetter =
            letter !== null && markScreenDiameter(zoom) >= LETTER_MIN_PX;
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
                onStampClick(placed.id, e.shiftKey || selectMode)
              }
            >
              {/*
                STATUS (pin plan § 7, shared/takeoffMarks.ts `statusLook`):
                new is filled; existing is HOLLOW with a SOLID outline — never
                dashed, which is "unconfirmed"; remove adds an X; relocate an
                arrow badge. The card says the same split in words.
              */}
              <path
                d={markPath(shape, at.x, at.y, r)}
                // Hollow is truly hollow: a white fill hid the plan symbol
                // underneath (seen 2026-10-05), which § 4 forbids.
                // Fill, outline weight and letter paint all come from
                // `markPaint`, so filled and hollow differ in three places.
                fill={status.filled ? color : "none"}
                fillOpacity={paint.fillOpacity}
                stroke={color}
                strokeWidth={
                  (isSelected ? stroke * 1.4 : stroke) * paint.strokeScale
                }
                strokeDasharray={
                  status.dashed ? `${r * 0.45} ${r * 0.3}` : undefined
                }
                strokeLinejoin="round"
              />
              {status.cross && (
                <path
                  d={`M${at.x - r * 0.75},${at.y - r * 0.75}L${at.x + r * 0.75},${at.y + r * 0.75}M${at.x + r * 0.75},${at.y - r * 0.75}L${at.x - r * 0.75},${at.y + r * 0.75}`}
                  stroke="#DC2626"
                  strokeWidth={stroke * 1.4}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {status.arrow && (
                /*
                  A filled arrowhead on a dark disc: a thin stroked arrow
                  read as a "+" at the size a pin is drawn (seen at 212%,
                  2026-10-05).
                */
                <g pointerEvents="none">
                  <circle
                    cx={at.x + r * 0.9}
                    cy={at.y - r * 0.9}
                    r={r * 0.6}
                    fill="#0b0b0b"
                    stroke={color}
                    strokeWidth={stroke * 0.8}
                  />
                  <path
                    d={`M${at.x + r * 0.55},${at.y - r * 1.02}H${at.x + r * 0.95}V${at.y - r * 1.25}L${at.x + r * 1.32},${at.y - r * 0.9}L${at.x + r * 0.95},${at.y - r * 0.55}V${at.y - r * 0.78}H${at.x + r * 0.55}Z`}
                    fill="#ffffff"
                  />
                </g>
              )}
              {/*
                The centre dot is what makes a mark point at something. Kept at
                a fixed fraction of the shape so it stays a dot rather than
                becoming a filled shape at one zoom and vanishing at another.

                Where the pin is big enough, the count's LETTER takes the dot's
                place (shared/pinLetters.ts): it points just as well, and it
                says which count this is on a print or to a colour-blind eye.
                On a filled pin: dark text over a pale halo, so it reads on
                white paper and on black linework alike. On a HOLLOW pin the
                letter is in the count's color over a thin dark halo instead
                (`markPaint`): the pale halo filled the inside back in, and
                new and existing looked the same (2026-10-05).
              */}
              {showLetter ? (
                <text
                  x={at.x}
                  y={at.y + letterFit(shape, r, letter).dy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={letterFit(shape, r, letter).size}
                  fontWeight={700}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  fill={paint.letterFill}
                  stroke={paint.letterHalo}
                  strokeWidth={stroke * paint.letterHaloScale}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {letter}
                </text>
              ) : (
                <circle cx={at.x} cy={at.y} r={r * 0.28} fill={color} />
              )}
              <title>
                {(letter ? `${letter} — ${placed.name}` : placed.name) +
                  (status.status === "new"
                    ? ""
                    : ` — ${MARK_STATUS_LABEL[status.status]}, not priced`)}
              </title>
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
                    free: hoverAlt || freePoints,
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
                    {preview.kind === "stamp" &&
                      (() => {
                        const s = snapStamps.find(
                          st => st.id === preview.stampId
                        );
                        return s
                          ? renderMeets(
                              "meets-leg",
                              s,
                              connects?.get(s.id),
                              true
                            )
                          : null;
                      })()}
                  </g>
                )}
              </>
            );
          })()}

        {/* Where the next click lands, when it lands on a mark. */}
        {hoverSnap && (
          <g pointerEvents="none">
            <circle
              cx={toScreen(hoverSnap.point).x}
              cy={toScreen(hoverSnap.point).y}
              r={markRadiusInOverlay(zoom) * 0.7}
              fill="none"
              stroke="#F5C518"
              strokeWidth={markStrokeInOverlay(zoom)}
            />
            {renderMeets(
              "meets-hover",
              hoverSnap.stamp,
              connects?.get(hoverSnap.stamp.id),
              true
            )}
          </g>
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
            {/* Rubber band to the pointer: where the next click goes. A third
                of the run's stroke and faint, so it cannot be mistaken for
                traced run (it was two thirds at 0.75 until 2026-09-29). It
                stays when the Next label is switched off. */}
            {hover && (
              <line
                x1={toScreen(points[points.length - 1]).x}
                y1={toScreen(points[points.length - 1]).y}
                x2={toScreen(hoverSnap?.point ?? hover).x}
                y2={toScreen(hoverSnap?.point ?? hover).y}
                stroke={RUN_COLOR[pathType]}
                strokeWidth={runStroke * (1 / 3)}
                strokeDasharray="6 5"
                strokeOpacity={0.45}
              />
            )}
            {/* "Next": this segment's length alone, at the cursor. Dim and
                small, because it is a preview; the run total is in the pill.
                Settings → Display turns it off. */}
            {hover && showNext && readout.next !== null && (
              <text
                x={toScreen(hover).x + runWidthInOverlay(zoom, 14)}
                y={toScreen(hover).y - runWidthInOverlay(zoom, 10)}
                fontSize={runWidthInOverlay(zoom, 11)}
                fill="#94A3B8"
                stroke="#0b0b0b"
                strokeWidth={runWidthInOverlay(zoom, 11) * 0.18}
                paintOrder="stroke"
                pointerEvents="none"
              >
                Next {formatFeetInches(readout.next)}
              </text>
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

        {/* Point handles on the selected run — last, so they sit on top. */}
        {!tracing &&
          !stamping &&
          editableRunId !== null &&
          onEditPoints &&
          (() => {
            const run = existingRuns.find(r => r.id === editableRunId);
            if (!run || run.points.length < 2) return null;
            const pts = pointsNow(run);
            const pinned = { start: !!run.startTee, end: !!run.endTee };
            const color = runAppearance(runColors, run).color;
            // A finger needs a bigger handle to land on (and to SEE past its
            // own tip): 24 px across on a touch screen, 10 with a mouse.
            const r = runWidthInOverlay(zoom, coarse ? 12 : 5);
            const stroke = runWidthInOverlay(zoom, 1.5);
            const begin = (
              e: React.PointerEvent,
              index: number,
              origin: PagePoint[],
              inserted: boolean
            ) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              setPickedVertex(null);
              setDrag({
                runId: run.id,
                index,
                origin,
                points: origin,
                pinned,
                moved: false,
                inserted,
                start: { x: e.clientX, y: e.clientY },
              });
            };
            return (
              <g className="pointer-events-auto">
                {!drag &&
                  segmentMidpoints(run.points).map(({ segment, at }) => {
                    const s = toScreen(at);
                    const origin = insertPoint(run.points, segment, at);
                    if (!origin) return null;
                    return (
                      <g
                        key={`add-${segment}`}
                        className="cursor-copy"
                        data-touch-drag
                        onPointerDown={e => begin(e, segment + 1, origin, true)}
                      >
                        <circle
                          cx={s.x}
                          cy={s.y}
                          r={r * 0.8}
                          fill="#0b0b0b"
                          fillOpacity={0.55}
                          stroke={color}
                          strokeOpacity={0.6}
                          strokeWidth={stroke}
                        />
                        <path
                          d={`M${s.x - r * 0.45},${s.y}H${s.x + r * 0.45}M${s.x},${s.y - r * 0.45}V${s.y + r * 0.45}`}
                          stroke={color}
                          strokeOpacity={0.8}
                          strokeWidth={stroke}
                        />
                        <title>Drag to add a point here</title>
                      </g>
                    );
                  })}
                {pts.map((p, index) => {
                  const s = toScreen(p);
                  if (isPinned(index, pts.length, pinned))
                    return (
                      <rect
                        key={`pt-${index}`}
                        x={s.x - r * 0.8}
                        y={s.y - r * 0.8}
                        width={r * 1.6}
                        height={r * 1.6}
                        fill="#94A3B8"
                        stroke="#0b0b0b"
                        strokeWidth={stroke}
                        className="cursor-pointer"
                        // Cannot move, but can still be looked up in Run ends.
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() =>
                          onPickEnd?.(run.id, index === 0 ? "start" : "end")
                        }
                      >
                        <title>
                          This end is on a branch tee, so it stays where the
                          branch leaves the run.
                        </title>
                      </rect>
                    );
                  const picked =
                    pickedVertex?.runId === run.id &&
                    pickedVertex.index === index;
                  return (
                    <circle
                      key={`pt-${index}`}
                      cx={s.x}
                      cy={s.y}
                      r={r}
                      fill={picked ? "#F5C518" : "#ffffff"}
                      stroke={color}
                      strokeWidth={stroke * 1.4}
                      className="cursor-move"
                      // Dragging a point is this handle's whole job, so a
                      // finger on it moves the point, not the sheet.
                      data-touch-drag
                      onPointerDown={e => begin(e, index, run.points, false)}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const next = removePoint(run.points, index, pinned);
                        if (next) commitEdit(run.id, next);
                      }}
                    >
                      <title>
                        {run.points.length > 2
                          ? "Drag to move · right-click (or click, then Delete) to remove"
                          : "Drag to move · a run needs at least two points"}
                      </title>
                    </circle>
                  );
                })}
              </g>
            );
          })()}

        {/*
          Where each run's ENDS meet a device — while tracing (every run, so
          a new one can be lined up against them) or on the selected run. The
          rest of the time it is clutter on a drawing already full of marks.
          LAST in the drawing, over the drag handles: on a touch screen a
          handle is big enough to hide the whole tick (seen on a tablet,
          2026-10-01), and this takes no pointer events, so it hides nothing
          from a finger.
        */}
        {connects && runEndMeets()}
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
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none",
                widePillShape
              )}
              role="status"
              aria-live="polite"
            >
              <span className="text-sm font-medium">
                {selectedStampIds.size}{" "}
                {selectedStampIds.size === 1 ? "mark" : "marks"} selected
              </span>
              <span className="text-[0.7rem] text-muted-foreground">
                {/* A finger has no Shift: it has the Select switch. */}
                {!coarse
                  ? "Shift-click or Shift-drag to add more"
                  : selectMode
                    ? "Tap marks to add or remove · drag to box more"
                    : "Turn on Select to pick more"}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-xs pointer-events-auto"
                onClick={onDeleteSelected}
              >
                Delete
              </Button>
              {onMoveSelected && moveTargets && moveTargets.length > 1 && (
                /*
                  Counted as the wrong thing — most often a device drawn as
                  existing to remain, counted with the new ones. A plain
                  select: one choice, and the keyboard and screen readers
                  already know it.
                */
                <select
                  className="h-6 rounded-md border border-border bg-background px-1.5 text-xs pointer-events-auto max-w-56"
                  value=""
                  aria-label="Move the selected marks to another count"
                  title="Move the selected marks to another count. They keep their places."
                  onChange={e => {
                    const id = Number(e.target.value);
                    if (id > 0) onMoveSelected(id);
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
              {onSetStatusSelected && (
                /*
                  What these marks ARE (pin plan § 7). Existing, remove and
                  relocate are drawn differently and are NOT priced as new
                  (shared/markStatus.ts) — the card says how many.
                */
                <select
                  className="h-6 rounded-md border border-border bg-background px-1.5 text-xs pointer-events-auto"
                  value=""
                  aria-label="Mark the selected marks as new, existing, remove or relocate"
                  title="New is priced. Existing to remain, remove and relocate are not priced as new devices."
                  onChange={e => {
                    if (isUserMarkStatus(e.target.value))
                      onSetStatusSelected(e.target.value);
                  }}
                >
                  <option value="">Mark as…</option>
                  {USER_MARK_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {MARK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
              {onSetHeightSelected && selectedDrop && (
                /*
                  THESE MARKS' OWN HEIGHT (vertical-drops-plan § 2). Empty
                  follows the count — a real height IS in effect, so it is
                  not "not set". The same control the count row and the run
                  ends use, so the three cannot drift apart.
                */
                <span className="flex items-center gap-1 pointer-events-auto text-xs">
                  <span className="text-muted-foreground">Height</span>
                  <HeightFields
                    compact
                    value={selectedDrop.inches}
                    belowFloor={false}
                    ariaPrefix="The selected marks' own height"
                    onSave={inches => onSetHeightSelected(inches)}
                    onClear={
                      selectedDrop.inches !== null || selectedDrop.mixed
                        ? () => onSetHeightSelected(null)
                        : undefined
                    }
                    clearLabel="Follow the count"
                    unsetLabel={
                      selectedDrop.mixed ? "heights differ" : "the count's"
                    }
                    setLabel="Set"
                  />
                </span>
              )}
              {onSetDropExcludedSelected && selectedDrop && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs pointer-events-auto"
                  onClick={() =>
                    onSetDropExcludedSelected(selectedDrop.excluded === 0)
                  }
                  title={
                    selectedDrop.excluded === 0
                      ? "Leave these marks' drops off the bid. They stay counted as devices."
                      : "Count these marks' drops again."
                  }
                >
                  {selectedDrop.excluded === 0
                    ? "No drop on these"
                    : "Give these a drop"}
                </Button>
              )}
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

          {!tracing && !stamping && pickedVertex && pickedRun && (
            /*
              A PICKED POINT, and what can be done to it. Before this pill the
              only ways to remove a point were Delete and a right-click on the
              handle — neither of which a finger has (device audit, touch #27).
              Shown on every device: a button that says what Delete does is
              not in a mouse user's way either.
            */
            <div
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none",
                pillShape
              )}
              role="status"
              aria-live="polite"
            >
              <span className="text-sm font-medium">Point picked</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-xs pointer-events-auto"
                onClick={removePicked}
                disabled={!pickedRemoval}
                title={
                  pickedRemoval
                    ? "Remove this point from the run (Delete)"
                    : "A run needs at least two points, and a pinned end stays"
                }
              >
                Remove point
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground pointer-events-auto"
                onClick={() => setPickedVertex(null)}
                aria-label="Let go of the point"
                title="Let go of the point (Esc)"
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
            <div
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 border border-[#F5C518]/50 bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none",
                pillShape
              )}
            >
              {/*
                "Counting", not "Stamping", since phase 6: a plain count has no
                stamp behind it, and the panel this feeds is called Counted
                items. One verb across the screen, and it is the true one for
                all four levels.
              */}
              <span className="text-xs text-muted-foreground">Counting</span>
              <span className="text-sm font-medium">{armedGroupName}</span>
              <span className="text-[0.7rem] text-muted-foreground">
                {coarse
                  ? "tap to place · two fingers move the sheet"
                  : "click to place · Esc to stop"}
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
            <div
              className={cn(
                "absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 border border-border bg-card/95 px-3 py-1.5 shadow-lg pointer-events-none",
                pillShape
              )}
            >
              <span className="text-xs text-muted-foreground">
                {pathType === "conduit" ? "Conduit run" : "Cable run"}
              </span>
              {/*
                ONE NUMBER: THE RUN TOTAL.

                This pill showed the length INCLUDING the rubber-band segment
                to the cursor, while the Finish button showed only the placed
                points. Two different figures, a few inches apart, neither
                labelled — so the big one read as "the run" and it was not:
                move the mouse and it changes, and what gets saved is the
                other one. Reported from bid 23 on 2026-09-21.

                The 2026-09-21 fix labelled both ("placed" and "to cursor"),
                but "to cursor" was still the whole path plus the preview, so a
                stray mouse still made a big number appear. Since 2026-09-29
                the pill holds only the clicked points, which never move with
                the mouse, and the preview segment alone is a dim "Next" label
                at the cursor (@/lib/traceReadout).
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
              <span className="text-[0.7rem] text-muted-foreground">
                {/* No scale: the path is still worth drawing, and its length
                    is typed in the run panel once it is finished (§ 4c). */}
                {ratio === null
                  ? "no scale — type the length when finished"
                  : "Run total"}
              </span>
              <span className="font-mono text-sm tabular-nums inline-block min-w-[9ch] text-right">
                {readout.runTotal === null
                  ? "—"
                  : formatFeetInches(readout.runTotal)}
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
                                free: hoverAlt || freePoints,
                              })
                            )
                          : "Click where the next leg starts"
                        : (legs.startLabel ?? "New leg")}
                  </span>
                </>
              )}

              <div className="w-px h-4 bg-border" />

              {/*
                SNAP / FREE, the finger's Alt. Only where there is no Alt key
                to hold; on a laptop the pill stays as it was.
              */}
              {coarse && onToggleFreePoints && legs && (
                <Button
                  size="sm"
                  variant={freePoints ? "default" : "outline"}
                  className="h-6 text-xs pointer-events-auto"
                  onClick={onToggleFreePoints}
                  aria-pressed={freePoints}
                  title={
                    freePoints
                      ? "A new leg starts exactly where you tap"
                      : "A new leg's start snaps to the run or a mark"
                  }
                >
                  {freePoints ? "Free" : "Snap"}
                </Button>
              )}

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
                  {readout.runTotal !== null && points.length >= 2
                    ? formatFeetInches(readout.runTotal)
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
