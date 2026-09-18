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
import { CrosshairGuides } from "./CrosshairGuides";
import {
  Check,
  MoveHorizontal,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  screenToPagePoints,
  segmentLength,
  type PagePoint,
} from "@shared/takeoffGeometry";
import {
  assessSpan,
  compareToStandardScales,
  describeErrorImpact,
  parseLengthText,
  ratioFromCalibration,
} from "@shared/planCalibration";
import { COMMON_SCALES, formatRatio } from "@shared/planScale";

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
  onCancel,
  chromeTarget,
  busy,
}: {
  width: number;
  height: number;
  renderScale: number;
  points: PagePoint[];
  onPointsChange: (points: PagePoint[]) => void;
  /** Hands back the scale as text, for the existing setSheetScale route. */
  onApply: (scaleText: string) => void;
  onCancel: () => void;
  chromeTarget?: HTMLElement | null;
  busy?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<PagePoint | null>(null);
  const [distanceText, setDistanceText] = useState("");

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

  const apply = () => {
    if (ratio === null) return;
    // Six decimals is exactly the stored column's precision, so this is
    // lossless rather than a rounding with an opinion in it.
    onApply(`1:${ratio.toFixed(6)}`);
  };

  const first = points[0] ? toScreen(points[0]) : null;
  const second = points[1] ? toScreen(points[1]) : null;
  const live = hover && points.length === 1 ? toScreen(hover) : null;

  const chrome = (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[26rem] max-w-[calc(100%-1.5rem)] pointer-events-auto">
      <div className="rounded-xl border border-border bg-card/95 shadow-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          {/* Matches the Calibrate button that opened this. NOT `Ruler`,
              which means the scale itself everywhere else in the app. */}
          <MoveHorizontal className="w-4 h-4 text-[#38BDF8] shrink-0" />
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

        {points.length < 2 ? (
          <p className="text-xs text-muted-foreground">
            {points.length === 0
              ? "Click one end of a distance you know — a dimension line, a column grid, a wall."
              : "Now click the other end."}{" "}
            <span className="text-foreground">
              Use the longest one you can find, and zoom in before each click.
            </span>
          </p>
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
              <span className="text-[0.7rem] text-muted-foreground">Span</span>
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
          <div className="rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/5 px-2.5 py-2 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[0.7rem] text-muted-foreground">
                This sheet is
              </span>
              <span className="font-mono text-sm">{formatRatio(ratio)}</span>
            </div>
            <p className="text-[0.7rem] text-muted-foreground">
              One inch of paper is{" "}
              <span className="font-mono">{(ratio / 12).toFixed(1)} ft</span> of
              building.
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
      </div>
    </div>
  );

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onPointerMove={e => {
          // Tracked from the first move, not just between the two clicks: the
          // guides have to be there while the FIRST end is being lined up,
          // which is the click that has no rubber-band line to help it.
          setHover(pointerToPage(e));
        }}
        onPointerLeave={() => setHover(null)}
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
            at={hover}
            width={width}
            height={height}
            renderScale={renderScale}
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
