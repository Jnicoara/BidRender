/**
 * SymbolCapture — box a symbol on the legend, name it, keep the picture.
 *
 * Replaces the `window.prompt` phase 2c shipped with. A browser prompt cannot
 * show the crop the user just drew, cannot be styled, and cannot be dismissed
 * with Escape the way everything else in the app can — so it read as belonging
 * to a different application.
 *
 * ── The crop is taken from the rendered canvas ───────────────────────────────
 * Dragging a box gives a rectangle in page points; the pixels come from the
 * already-rasterised page rather than re-rendering the PDF, so capturing is
 * instant and costs nothing. It is downscaled hard: this is a thumbnail for
 * recognition, and a full-resolution crop would put a screenshot into a text
 * column.
 *
 * Only the naming is new. Link creation, reuse and the one-time question are
 * phase 2c's and are untouched.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { crosshairCursorStyle } from "@/lib/crosshairCursor";

/** Longest edge of the stored thumbnail, in pixels. */
const THUMBNAIL_MAX_EDGE = 96;

export type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Crop a region of the rendered page canvas to a small PNG data URL.
 *
 * Returns null rather than throwing on a degenerate box — a click without a
 * drag is a cancelled capture, not an error worth interrupting anyone over.
 */
export function cropToThumbnail(
  canvas: HTMLCanvasElement,
  region: CaptureRegion,
  renderScale: number
): string | null {
  // Normalise: a box dragged up-and-left has negative width.
  const left = Math.min(region.x, region.x + region.width) * renderScale;
  const top = Math.min(region.y, region.y + region.height) * renderScale;
  const width = Math.abs(region.width) * renderScale;
  const height = Math.abs(region.height) * renderScale;
  if (width < 4 || height < 4) return null;

  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width * scale));
  out.height = Math.max(1, Math.round(height * scale));

  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, left, top, width, height, 0, 0, out.width, out.height);

  try {
    return out.toDataURL("image/png");
  } catch {
    // A tainted canvas cannot be read. The link still works without a picture,
    // which is why the thumbnail is optional everywhere downstream.
    return null;
  }
}

/**
 * The naming form, shown once a box has been drawn.
 *
 * Follows the standing edit rules: the field selects on focus, Enter commits,
 * Escape abandons.
 */
export function SymbolCaptureForm({
  thumbnail,
  onSave,
  onCancel,
}: {
  thumbnail: string | null;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const trimmed = label.trim();
    // Blank writes nothing — a symbol with no name cannot be found again, and
    // the label is what the link is keyed on.
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-80 rounded-xl border border-border bg-card/98 p-3 shadow-xl">
      <p className="text-sm font-medium">Name this symbol</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Used to recognise it again on the next set of plans.
      </p>

      <div className="flex items-center gap-2 mt-2.5">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="Captured symbol"
            className="w-12 h-12 object-contain rounded bg-white shrink-0 border border-border"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted shrink-0 flex items-center justify-center">
            <span className="text-[0.65rem] text-muted-foreground">
              no image
            </span>
          </div>
        )}
        <Input
          ref={inputRef}
          value={label}
          onChange={e => setLabel(e.target.value)}
          onFocus={selectOnFocus}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder="Duplex recep"
          className="h-8 text-sm"
          aria-label="Symbol name"
        />
      </div>

      <div className="flex items-center gap-1.5 mt-2.5">
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs flex-1"
          onClick={commit}
          disabled={!label.trim()}
        >
          <Check className="w-3 h-3" /> Save symbol
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={onCancel}
        >
          <X className="w-3 h-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The drag-a-box layer, shown while capturing.
 *
 * Its own overlay above the trace/stamp one so a capture drag can never be
 * mistaken for a stamp click — the two tools would otherwise both be listening
 * for a pointer down on the same pixels.
 */
export function SymbolCaptureLayer({
  width,
  height,
  renderScale,
  onRegion,
  onCancel,
}: {
  width: number;
  height: number;
  renderScale: number;
  onRegion: (region: CaptureRegion) => void;
  onCancel: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const toPage = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : width / rect.width;
    const scaleY = rect.height === 0 ? 1 : height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX) / renderScale,
      y: ((e.clientY - rect.top) * scaleY) / renderScale,
    };
  };

  const box =
    start && current
      ? {
          x: Math.min(start.x, current.x) * renderScale,
          y: Math.min(start.y, current.y) * renderScale,
          w: Math.abs(current.x - start.x) * renderScale,
          h: Math.abs(current.y - start.y) * renderScale,
        }
      : null;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("absolute inset-0 w-full h-full z-10")}
      /*
        The same cursor as tracing and calibrating. Boxing a symbol on a legend
        is an aiming job too, and a crosshair that differs between overlays
        reads as a different tool rather than the same one somewhere else.
      */
      style={crosshairCursorStyle}
      onPointerDown={e => {
        if (e.button !== 0) return;
        /*
          This layer CLAIMS the drag, and that one line is the whole fix.

          The viewport underneath listens for a plain left-drag and pans the
          sheet with it (TakeoffPage, `beginPlainPan`, which arrived with zoom
          and pan in v6.8). A React event raised here bubbles to it, so boxing
          a symbol on the legend drew the box AND panned the drawing out from
          under it at the same time. Nothing about the capture layer changed;
          an ancestor started wanting the same gesture.

          Right-drag, middle-drag and space-drag still pan, because those are
          taken in the CAPTURE phase on the viewport and never reach here — the
          sheet can still be moved mid-capture without putting the tool down.
        */
        e.stopPropagation();
        const at = toPage(e);
        if (at) {
          try {
            // Keeps the drag alive past the edge of the page, so a box started
            // on a symbol near the margin still ends where it is dropped.
            // Guarded: a pointer that is no longer active throws here, and a
            // capture that cannot be taken is not a reason to lose the drag.
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* the drag still works, it just stops at the edge */
          }
          setStart(at);
          setCurrent(at);
        }
      }}
      onPointerMove={e => {
        if (start) setCurrent(toPage(e));
      }}
      onPointerUp={() => {
        if (!start || !current) return;
        onRegion({
          x: start.x,
          y: start.y,
          width: current.x - start.x,
          height: current.y - start.y,
        });
        setStart(null);
        setCurrent(null);
      }}
    >
      {/* Dim everything but the box being drawn, so the crop is obvious. */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#000"
        fillOpacity={0.35}
      />
      {box && box.w > 0 && box.h > 0 && (
        <>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill="#000"
            fillOpacity={0}
          />
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill="#F5C518"
            fillOpacity={0.12}
            stroke="#F5C518"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </>
      )}
    </svg>
  );
}
