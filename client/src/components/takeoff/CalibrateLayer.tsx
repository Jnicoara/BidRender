/**
 * CalibrateLayer — set a sheet's scale by measuring something you know.
 *
 * Click two points, type the real distance between them, done. For the very
 * common sheet that states no scale ratio anywhere, and for the set that states
 * one that is no longer true because it was scaled on its way to you.
 *
 * ── Separate from TraceLayer on purpose ──────────────────────────────────────
 * It looks like tracing — clicks on a drawing making a line — and it is a
 * different thing: exactly two points, no bid consequence, and it ends by
 * changing what every OTHER measurement on the sheet means. Folding it into the
 * tracing overlay would put a mode flag through every branch of a component
 * that already carries four.
 *
 * ── The span rating is the point, not decoration ─────────────────────────────
 * A calibration error does not affect one number, it multiplies into every
 * measurement on the sheet. The error is governed by the SPAN, so the rating
 * appears live, WHILE the user is choosing where to click, when it can still
 * change their mind — not afterwards as a verdict on a decision already made.
 *
 * ── MEASURE HONEST, PAD VISIBLY ──────────────────────────────────────────────
 * Nothing here nudges the number. The ratio shown is the ratio measured, and
 * uncertainty is SAID rather than silently absorbed. See
 * references/plan-viewer-overhaul.md § 5a.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { CrosshairGuides, type CrosshairHandle } from "./CrosshairGuides";
import { crosshairCursorStyle } from "@/lib/crosshairCursor";
import { useCrosshairColor } from "@/hooks/useCrosshairColor";
import { Check, RotateCcw, Ruler, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  POINTS_PER_INCH,
  formatFeetInches,
  screenToPagePoints,
  segmentLength,
  type PagePoint,
} from "@shared/takeoffGeometry";
import {
  assessSpan,
  checkCalibration,
  checkHeadline,
  compareToStandardScales,
  describeErrorImpact,
  parseLengthText,
  ratioFromCalibration,
} from "@shared/planCalibration";
import { COMMON_SCALES, describeScale } from "@shared/planScale";

/**
 * The colour of the measured span ON THE DRAWING.
 *
 * Kept when the blue was taken out of this panel's chrome, because this is not
 * chrome: it is the measurement, drawn over a black-and-white sheet, and it has
 * to be unmistakable against both the drawing and the app's yellow — which
 * means marks and stamps. A line here that looked like a mark would be worse
 * than a line that stands out.
 */
const SPAN_COLOR = "#38BDF8";

const QUALITY_STYLE = {
  good: "text-emerald-400",
  fair: "text-[#F5C518]",
  short: "text-orange-400",
} as const;

export function CalibrateLayer({
  width,
  height,
  renderScale,
  points,
  onPointsChange,
  onApply,
  onChecked,
  onCancel,
  startInCheck,
  sheetRatio,
  chromeTarget,
  busy,
}: {
  width: number;
  height: number;
  renderScale: number;
  points: PagePoint[];
  onPointsChange: (points: PagePoint[]) => void;
  /**
   * Hands back the scale as text, for the existing setSheetScale route.
   *
   * Returns a promise, and the caller must NOT close this layer when it
   * settles: applying is the middle of the job now, not the end. What follows
   * is the check — see the `phase` state.
   */
  onApply: (scaleText: string) => Promise<unknown>;
  /**
   * Record that the scale was confirmed against a second distance.
   *
   * Called only when a check was actually MADE — not when it is skipped, and
   * not when the two disagreed but the estimator kept the scale anyway. The
   * stamp means "somebody looked", so it must not be set by walking past.
   */
  onChecked: () => Promise<unknown>;
  onCancel: () => void;
  /**
   * Open straight into checking the scale the sheet already has.
   *
   * This is the path from "Check it" and from picking a scale off the list:
   * there is nothing to set, only something to verify.
   */
  startInCheck?: boolean;
  /** The sheet's current ratio, which `startInCheck` measures against. */
  sheetRatio?: number | null;
  chromeTarget?: HTMLElement | null;
  busy?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [crosshairColor] = useCrosshairColor();
  /** Moved directly, never through a render. See CrosshairGuides. */
  const guidesRef = useRef<CrosshairHandle | null>(null);
  const [hover, setHover] = useState<PagePoint | null>(null);
  const [distanceText, setDistanceText] = useState("");

  /**
   * Setting the scale, then CHECKING it — one flow, not two features.
   *
   * ── Why the check is not optional, and not a separate button ─────────────
   * Added 2026-09-21 after bid 23. A scale bar reading 10-5-0-10-20 is thirty
   * feet end to end, because it starts left of its zero. Clicking the ends and
   * typing 20 set sheet 11 — a 1" = 10' sheet — to 1:80, and a 100 ft building
   * measured 67 ft.
   *
   * On THAT sheet the off-standard warning was enough on its own, once it was
   * moved somewhere it stays visible: 1:80 is 17% off the nearest rung.
   *
   * The check is for the sheet where that guard has nothing to say. The same
   * misread on a 1/8" sheet gives exactly 3/16" — a textbook scale, long span,
   * exact arithmetic, nothing to flag (server/calibrationConfidence.test.ts
   * asserts that limitation). A single measurement cannot be checked against
   * itself, so a second known distance is part of calibrating rather than
   * something to remember.
   */
  const [phase, setPhase] = useState<"set" | "check">(
    startInCheck && sheetRatio ? "check" : "set"
  );
  /** The ratio actually written to the sheet, which the check measures with. */
  const [appliedRatio, setAppliedRatio] = useState<number | null>(
    startInCheck ? (sheetRatio ?? null) : null
  );
  const [checkText, setCheckText] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);

  /**
   * Escape backs out one point at a time, then leaves.
   *
   * The same shape as Escape everywhere else in this app — abandon the smallest
   * thing first — so a misplaced second click costs one key rather than the
   * whole calibration.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (points.length > 0) {
        onPointsChange(points.slice(0, -1));
        setHover(null);
      } else {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [points, onPointsChange, onCancel]);

  const toScreen = useCallback(
    (p: PagePoint) => ({ x: p.x * renderScale, y: p.y * renderScale }),
    [renderScale]
  );

  /**
   * Pointer → page points.
   *
   * Measures the overlay's real on-screen rectangle, so the viewer's zoom and
   * pan need no special handling here — the same reasoning as TraceLayer's.
   */
  const pointerToPage = useCallback(
    (e: React.PointerEvent): PagePoint | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
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

  /** The span so far, in page points — live while the second point is chosen. */
  const spanPoints = useMemo(() => {
    if (points.length >= 2) return segmentLength(points[0], points[1]);
    if (points.length === 1 && hover) return segmentLength(points[0], hover);
    return 0;
  }, [points, hover]);

  const span = useMemo(() => assessSpan(spanPoints), [spanPoints]);
  const realInches = useMemo(
    () => parseLengthText(distanceText),
    [distanceText]
  );

  const ratio = useMemo(
    () =>
      points.length >= 2 && realInches !== null
        ? ratioFromCalibration(spanPoints, realInches)
        : null,
    [points.length, realInches, spanPoints]
  );

  const standard = useMemo(
    () =>
      ratio === null ? null : compareToStandardScales(ratio, COMMON_SCALES),
    [ratio]
  );

  const apply = async () => {
    if (ratio === null) return;
    setApplyError(null);
    try {
      // Six decimals is exactly the stored column's precision, so this is
      // lossless rather than a rounding with an opinion in it.
      await onApply(`1:${ratio.toFixed(6)}`);
    } catch (error) {
      // Staying in "set" is the point: a failed save must not look like a
      // saved scale waiting to be checked.
      setApplyError(
        error instanceof Error ? error.message : "Could not save that scale."
      );
      return;
    }
    setAppliedRatio(ratio);
    setPhase("check");
    onPointsChange([]);
    setHover(null);
  };

  /**
   * What the sheet's NEW scale says the second span measures.
   *
   * Deliberately computed from `appliedRatio` — the number actually saved —
   * rather than recomputed from the first calibration, so this is a real test
   * of what the sheet now holds.
   */
  const checkMeasuredInches =
    phase === "check" && appliedRatio !== null && spanPoints > 0
      ? (spanPoints / POINTS_PER_INCH) * appliedRatio
      : null;

  const checkExpectedInches = useMemo(
    () => parseLengthText(checkText),
    [checkText]
  );

  const check = useMemo(
    () =>
      checkMeasuredInches === null || checkExpectedInches === null
        ? null
        : checkCalibration(checkMeasuredInches, checkExpectedInches),
    [checkMeasuredInches, checkExpectedInches]
  );

  /** Back to setting, keeping nothing — a redo is a fresh measurement. */
  const startOver = () => {
    setPhase("set");
    setAppliedRatio(null);
    setDistanceText("");
    setCheckText("");
    setApplyError(null);
    onPointsChange([]);
    setHover(null);
  };

  const first = points[0] ? toScreen(points[0]) : null;
  const second = points[1] ? toScreen(points[1]) : null;
  const live = hover && points.length === 1 ? toScreen(hover) : null;

  const setPanel = (
    /*
      ── DOCKED BOTTOM-LEFT, off the drawing ──────────────────────────────────
      This sat `top-3 left-1/2`, centred over the sheet, which put it exactly
      where the first point of a measurement usually goes. Reported 2026-09-24:
      the panel covered the thing it was asking to be clicked.

      Bottom-left is the corner with least competition — the toolbar owns the
      top, the counts panel owns the right, and a title block occupying the
      bottom-left of a drawing is not something you calibrate against. Narrower
      too, so it takes less of whatever it does cover.
    */
    <div className="absolute bottom-3 left-3 w-[21rem] max-w-[calc(100%-1.5rem)] pointer-events-auto">
      <div className="rounded-xl border border-border bg-card/95 shadow-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          {/*
            `Ruler`, matching the one control this now opens from.

            It used to be MoveHorizontal in blue, to match a separate Calibrate
            button — and that pairing is gone: there is one scale control now,
            and the blue double-arrow was the only blue on the screen, which
            made the least-used thing in the toolbar the most eye-catching.
          */}
          <Ruler className="w-4 h-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-medium flex-1">Set scale by measuring</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={onCancel}
            title="Cancel (Escape)"
            aria-label="Cancel calibration"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <>
          {points.length < 2 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                {points.length === 0
                  ? "Click one end of a distance you know."
                  : "Now click the other end."}{" "}
                <span className="text-foreground">
                  Zoom in before each click.
                </span>
              </p>
              {/*
              ── The order of this advice is the advice ─────────────────────
              A printed dimension is a number the drawing states. A scale bar
              is a picture you have to read, and reading it wrong is silent —
              see the warning below. So the dimension comes first, and the bar
              is named as the fallback it is.
            */}
              <ul className="text-[0.7rem] text-muted-foreground space-y-1 pl-3.5 list-disc marker:text-muted-foreground/60">
                <li>
                  <span className="text-foreground">
                    Best: a dimension printed on the drawing
                  </span>{" "}
                  — a dimension line, a column grid, an overall building width.
                </li>
                <li>
                  <span className="text-foreground">Use the longest one</span>{" "}
                  you can find. A short span multiplies its own error into every
                  measurement on the sheet.
                </li>
                <li className="text-orange-300">
                  <span className="font-medium">
                    A scale bar often starts LEFT of zero.
                  </span>{" "}
                  One reading 10-5-0-10-20 is thirty feet end to end, not
                  twenty. Click the numbers you are typing, never the bar&apos;s
                  ends.
                </li>
              </ul>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="calibrate-distance"
                  className="text-xs text-muted-foreground shrink-0"
                >
                  That distance is
                </label>
                <Input
                  id="calibrate-distance"
                  value={distanceText}
                  onChange={e => setDistanceText(e.target.value)}
                  onFocus={selectOnFocus}
                  onKeyDown={e => {
                    if (e.key === "Enter" && ratio !== null) apply();
                    if (e.key === "Escape") onCancel();
                  }}
                  placeholder="e.g. 100, 24'-6&quot;"
                  className="h-7 text-xs font-mono"
                  autoFocus
                />
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                A plain number means <strong>feet</strong>. Inches need a mark —{" "}
                <span className="font-mono">246&quot;</span>.
              </p>
            </div>
          )}

          {/* The span rating, live while the second point is being chosen. */}
          {span && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[0.7rem] text-muted-foreground">
                  Span
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {span.paperInches.toFixed(2)}&quot; of paper
                </span>
                <span
                  className={cn(
                    "ml-auto text-[0.7rem] font-medium",
                    QUALITY_STYLE[span.quality]
                  )}
                >
                  ±{span.errorPercent.toFixed(1)}%
                </span>
              </div>
              <p
                className={cn("text-[0.7rem] leading-snug", {
                  "text-muted-foreground": span.quality === "good",
                  "text-orange-400": span.quality === "short",
                })}
              >
                {span.message}
              </p>
              {/*
              The percentage turned into feet.

              "±4.6%" needs arithmetic before it means anything; "a 1,000 ft run
              could be off by about 46 ft" is the same fact already in the units
              of the decision being made.
            */}
              {span.quality !== "good" && (
                <p className="text-[0.7rem] text-muted-foreground">
                  {describeErrorImpact(span.errorPercent)}
                </p>
              )}
            </div>
          )}

          {/* The result, in plain terms. */}
          {ratio !== null && (
            <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[0.7rem] text-muted-foreground">
                  This sheet is
                </span>
                <span className="font-mono text-sm">
                  {describeScale(ratio)}
                </span>
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                One inch of paper is{" "}
                <span className="font-mono">{(ratio / 12).toFixed(1)} ft</span>{" "}
                of building.
              </p>
              {standard?.worthMentioning && (
                <p className="text-[0.7rem] text-orange-400 flex items-start gap-1.5 pt-0.5">
                  <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    That is {Math.abs(standard.percentOff).toFixed(0)}%{" "}
                    {standard.percentOff > 0 ? "above" : "below"} the nearest
                    standard scale ({standard.nearestText}). It may be right — a
                    printed set often is. Worth checking you clicked the ends of
                    the dimension you meant.
                  </span>
                </p>
              )}
            </div>
          )}

          {/*
          A short span NEVER blocks applying, and this button is never dimmed
          for it — only for "there is no number yet".

          Sometimes a graphic scale bar is the only known distance printed on a
          sheet. Refusing a short span would leave the estimator with no scale
          at all, which is strictly worse than a scale they have been told is
          soft. The warning sits BESIDE this button, not in place of it.
        */}
          <div className="flex items-center gap-2 pt-0.5">
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs flex-1"
              onClick={apply}
              disabled={ratio === null || busy}
              title={
                span?.quality === "short"
                  ? "Applies the scale. It is on the soft side — the sheet will be marked so you remember."
                  : "Applies this scale to the sheet"
              }
            >
              <Check className="w-3.5 h-3.5" />
              {busy ? "Saving…" : "Use this scale"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                // Points only. The typed distance survives, because redoing is
                // almost always "I clicked that badly", not "I meant a different
                // dimension" — and retyping it would punish the correction.
                onPointsChange([]);
                setHover(null);
              }}
              disabled={points.length === 0}
              title="Click the two points again, keeping the distance"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Redo points
            </Button>
          </div>

          {applyError && (
            <p className="text-[0.7rem] text-orange-400 flex items-start gap-1.5">
              <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{applyError}</span>
            </p>
          )}
        </>
      </div>
    </div>
  );

  const keep = async () => {
    /*
      The stamp records that somebody LOOKED, not that the two agreed. Keeping
      a scale the check disputed is a legitimate answer — a drawing really can
      be inconsistent with itself, and the estimator can see which of the two
      dimensions to believe in a way the app cannot.

      But it is only written when a check was actually made. Closing with
      nothing measured leaves the badge up, which is the whole point of it.
    */
    if (check) await onChecked();
    onCancel();
  };

  /*
    ── CHECKING: a one-line bar, and a small card by the line ─────────────────
    Changed 2026-09-24. This used to be the same 21rem panel as setting, docked
    bottom-left, with two sentences of reassurance and three buttons — for a
    job that is two clicks and one number. The scale being checked is already
    named on the toolbar chip, so all the bar has to say is what to click next.

    The verdict goes BESIDE the measured line rather than in the corner,
    because the line is where the estimator is looking when it appears, and
    "reads half" means most next to the dimension that reads half.
  */
  const checkBar = (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] pointer-events-auto">
      <div
        className="flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-full border border-border bg-card/95 shadow-lg text-xs whitespace-nowrap"
        role="status"
        aria-live="polite"
      >
        <Ruler className="w-3.5 h-3.5 shrink-0 text-[#F5C518]" />
        <span className="font-medium">Check the scale</span>
        <span className="text-muted-foreground">·</span>
        <span className="truncate">
          {points.length === 0
            ? "Click one end of a dimension you know"
            : points.length === 1
              ? "Click the other end."
              : "Type what it should be."}
        </span>
        {/*
          Skipping is allowed, and quietly. A sheet with exactly one known
          dimension on it is a real sheet, and refusing to leave until a second
          one is found would make calibration impossible there.
        */}
        <button
          type="button"
          className="ml-1 px-2 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
          onClick={onCancel}
        >
          Skip the check
        </button>
        <span className="text-[0.65rem] text-muted-foreground pr-2">
          {/* Escape backs out a click before it leaves — say which it does. */}
          {points.length === 0 ? "Esc to cancel" : "Esc undoes the click"}
        </span>
      </div>
    </div>
  );

  /*
    Where the result card sits, in the chrome layer's pixels. Measured from the
    overlay's real rectangle each frame while it is up, because the overlay is
    INSIDE the zoom transform and the card is not — a pan or zoom with the card
    open must carry it along with the line.
  */
  const [cardAnchor, setCardAnchor] = useState<{
    x: number;
    top: number;
    bottom: number;
    w: number;
    h: number;
  } | null>(null);
  const showCard = phase === "check" && points.length >= 2;
  useEffect(() => {
    if (!showCard || !chromeTarget) {
      setCardAnchor(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const svg = svgRef.current;
      if (svg && points[0] && points[1]) {
        const r = svg.getBoundingClientRect();
        const c = chromeTarget.getBoundingClientRect();
        const sx = width === 0 ? 1 : r.width / width;
        const sy = height === 0 ? 1 : r.height / height;
        const a = toScreen(points[0]);
        const b = toScreen(points[1]);
        const next = {
          x: ((a.x + b.x) / 2) * sx + r.left - c.left,
          top: Math.min(a.y, b.y) * sy + r.top - c.top,
          bottom: Math.max(a.y, b.y) * sy + r.top - c.top,
          w: c.width,
          h: c.height,
        };
        setCardAnchor(prev =>
          prev &&
          Math.abs(prev.x - next.x) < 0.5 &&
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.bottom - next.bottom) < 0.5 &&
          prev.w === next.w &&
          prev.h === next.h
            ? prev
            : next
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [showCard, chromeTarget, points, width, height, toScreen]);

  const CARD_W = 272;
  const CARD_H = 150;
  const cardStyle: React.CSSProperties = cardAnchor
    ? {
        left: Math.max(
          8,
          Math.min(cardAnchor.x - CARD_W / 2, cardAnchor.w - CARD_W - 8)
        ),
        // Below the line when there is room, above it when there is not.
        top:
          cardAnchor.bottom + 14 + CARD_H <= cardAnchor.h
            ? cardAnchor.bottom + 14
            : Math.max(48, cardAnchor.top - 14 - CARD_H),
        width: CARD_W,
      }
    : { left: 12, bottom: 12, width: CARD_W };

  const resultCard = showCard ? (
    <div
      className="absolute pointer-events-auto rounded-lg border border-border bg-card/95 shadow-xl p-2.5 space-y-2"
      style={cardStyle}
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor="calibrate-check"
          className="text-xs text-muted-foreground shrink-0"
        >
          Should be
        </label>
        <Input
          id="calibrate-check"
          value={checkText}
          onChange={e => setCheckText(e.target.value)}
          onFocus={selectOnFocus}
          onKeyDown={e => {
            if (e.key === "Enter" && check) void keep();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="e.g. 100, 24'-6&quot;"
          className="h-7 text-xs font-mono"
          autoFocus
        />
      </div>
      {checkMeasuredInches !== null && (
        <p className="text-[0.7rem] text-muted-foreground">
          This sheet makes it{" "}
          <span className="font-mono text-foreground">
            {formatFeetInches(checkMeasuredInches)}
          </span>
          .
        </p>
      )}
      {/*
        The verdict, before anything is traced. Stated in both directions:
        agreement is worth saying out loud, because "no news" reads the same
        as "not checked". The full explanation stays on hover.
      */}
      {check && (
        <p
          className={cn(
            "flex items-start gap-1.5 text-xs font-medium leading-snug",
            check.agrees ? "text-emerald-400" : "text-orange-400"
          )}
          title={check.message}
        >
          {check.agrees ? (
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>{checkHeadline(check)}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={check?.agrees === false ? "outline" : "default"}
          className="h-7 gap-1.5 text-xs flex-1"
          onClick={() => void keep()}
          title={
            check
              ? "Record that this scale has been checked, and close"
              : "Close without checking"
          }
        >
          <Check className="w-3.5 h-3.5" /> Keep
        </Button>
        <Button
          size="sm"
          variant={check?.agrees === false ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={startOver}
          title="Measure the scale again from a different dimension"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Set it again
        </Button>
      </div>
    </div>
  ) : null;

  const chrome =
    phase === "check" ? (
      <>
        {checkBar}
        {resultCard}
      </>
    ) : (
      setPanel
    );

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full"
        /*
          The crosshair IS the cursor here, as it is when tracing. Calibration
          is the place a lagging crosshair costs the most: both clicks land on
          the ends of a dimension, and an error there multiplies into every
          measurement on the sheet rather than into one run.
        */
        style={crosshairCursorStyle(crosshairColor)}
        onPointerMove={e => {
          // Tracked from the first move, not just between the two clicks: the
          // guides have to be there while the FIRST end is being lined up,
          // which is the click that has no rubber-band line to help it.
          const page = pointerToPage(e);
          // Guides first and directly; the state update behind it drives the
          // rubber band and the live span rating, which may be a frame late.
          if (page) {
            guidesRef.current?.moveTo(
              page.x * renderScale,
              page.y * renderScale
            );
          }
          setHover(page);
        }}
        /*
          The second click mounts a box that autofocuses — and then this
          mousedown's default action moved focus to the page, so the first
          keystroke went nowhere. Nothing on the overlay itself wants focus.
        */
        onMouseDown={e => e.preventDefault()}
        onPointerLeave={() => {
          guidesRef.current?.hide();
          setHover(null);
        }}
        onPointerDown={e => {
          // Left button only. Right and middle are pan, and a pan that also
          // dropped a calibration point would be maddening — you would move the
          // sheet and silently set one end of the measurement at the same time.
          if (e.button !== 0) return;
          if (points.length >= 2) return;
          const p = pointerToPage(e);
          if (!p) return;
          onPointsChange([...points, p]);
        }}
      >
        {/* Lining up on the end of a dimension line is exactly what these are
            for — and here the alignment IS the accuracy of the whole sheet. */}
        {points.length < 2 && (
          <CrosshairGuides
            ref={guidesRef}
            width={width}
            height={height}
            color={SPAN_COLOR}
          />
        )}

        {first && live && (
          <line
            x1={first.x}
            y1={first.y}
            x2={live.x}
            y2={live.y}
            stroke={SPAN_COLOR}
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {first && second && (
          <line
            x1={first.x}
            y1={first.y}
            x2={second.x}
            y2={second.y}
            stroke={SPAN_COLOR}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {[first, second].map((p, i) =>
          p ? (
            <g key={i}>
              {/* A cross rather than a dot: a dot hides the thing you aimed at,
                  and the pixel under it is the one that matters here. */}
              <line
                x1={p.x - 9}
                y1={p.y}
                x2={p.x + 9}
                y2={p.y}
                stroke={SPAN_COLOR}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={p.x}
                y1={p.y - 9}
                x2={p.x}
                y2={p.y + 9}
                stroke={SPAN_COLOR}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : null
        )}
      </svg>

      {chromeTarget ? createPortal(chrome, chromeTarget) : chrome}
    </>
  );
}
