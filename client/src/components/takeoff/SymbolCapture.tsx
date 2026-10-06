/**
 * SymbolCapture — box a symbol on the legend, name it, keep the picture.
 *
 * Replaces the `window.prompt` phase 2c shipped with. A browser prompt cannot
 * show the crop the user just drew, cannot be styled, and cannot be dismissed
 * with Escape the way everything else in the app can — so it read as belonging
 * to a different application.
 *
 * ── The picture is rendered again from the PDF, sharp ────────────────────────
 * Dragging a box gives a rectangle in page points. Until 2026-09-30 the pixels
 * were cut from the viewer's backdrop (1.5x, 108 px per paper inch) and shrunk
 * to 96 px — so a symbol that was crisp on screen was saved soft, and that
 * soft picture is what the reader-accuracy test hands the model as the legend.
 * Now the box is drawn again by the PDF worker at `captureRenderScale`
 * (shared/symbolCapture.ts): never softer than the screen it was boxed on,
 * nor than 400 px per inch. The backdrop crop is still taken, instantly, so
 * the naming form has a picture at once; the sharp one replaces it when the
 * render arrives, and Save waits for it.
 *
 * Only the naming is new. Link creation, reuse and the one-time question are
 * phase 2c's and are untouched.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { crosshairCursorStyle } from "@/lib/crosshairCursor";
import { useCrosshairColor, useCrosshairSize } from "@/hooks/useCrosshairColor";
import {
  CAPTURE_MAX_EDGE,
  SYMBOL_THUMBNAIL_MAX_CHARS,
  captureRenderScale,
  capturePixelSize,
  normaliseCaptureBox,
  type CaptureBox,
} from "@shared/symbolCapture";
import { lookAlikeWarning, type LookAlike } from "@shared/symbolLooks";

/** Longest edge of the instant PREVIEW, in pixels. Not what is saved. */
const THUMBNAIL_MAX_EDGE = 96;

export type CaptureRegion = CaptureBox;

/** Draws a page region from the PDF — PlanPane's worker, region in points. */
export type CaptureRenderer = (
  rect: CaptureRegion,
  scale: number
) => Promise<{ bitmap: ImageBitmap }>;

/**
 * Render a boxed region from the PDF itself, as a PNG data URL.
 *
 * At `captureRenderScale`, so the picture is at least as sharp as the screen
 * the box was drawn on. If the encoded picture is over the stored limit (rare:
 * a box much bigger than a symbol), it is stepped down 20% at a time until it
 * fits, rather than failing the save. Null for a box with no area, or when the
 * picture cannot be read back — the caller keeps the preview and says so.
 */
export async function renderSharpCapture(
  region: CaptureRegion,
  screenScale: number,
  renderRegion: CaptureRenderer
): Promise<string | null> {
  const box = normaliseCaptureBox(region);
  const scale = captureRenderScale(box, screenScale);
  if (!(scale > 0)) return null;
  const size = capturePixelSize(box, scale);
  if (size.width < 4 || size.height < 4) return null;

  const { bitmap } = await renderRegion(box, scale);
  try {
    return encodeCapture(bitmap, 0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * A region of an already-rendered image as the PNG data URL a symbol is
 * stored with: no longer than CAPTURE_MAX_EDGE on its long side, and stepped
 * down 20% at a time until it fits SYMBOL_THUMBNAIL_MAX_CHARS rather than
 * failing the save. Single capture and "Capture whole legend" both encode
 * here, so the two cannot store pictures by different rules.
 */
export function encodeCapture(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): string | null {
  if (!(sw >= 1 && sh >= 1)) return null;
  const fit = Math.min(1, CAPTURE_MAX_EDGE / Math.max(sw, sh));
  let width = Math.max(1, Math.round(sw * fit));
  let height = Math.max(1, Math.round(sh * fit));
  const out = document.createElement("canvas");
  for (let attempt = 0; attempt < 8; attempt++) {
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
    let url: string;
    try {
      url = out.toDataURL("image/png");
    } catch {
      return null;
    }
    if (url.length <= SYMBOL_THUMBNAIL_MAX_CHARS) return url;
    width = Math.max(1, Math.round(width * 0.8));
    height = Math.max(1, Math.round(height * 0.8));
  }
  return null;
}

/**
 * Crop a region of the rendered page canvas to a small PNG data URL.
 *
 * The instant PREVIEW only, from the 1.5x backdrop — soft by construction.
 * `renderSharpCapture` makes the picture that is saved.
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
 *
 * ── It is portalled to the screen layer, and that is not optional ───────────
 * This form is rendered from the sheet's overlay, which sits INSIDE the zoom
 * transform. Until 2026-09-30 it was drawn there, so it scaled and moved with
 * the drawing: measured on E0.01, 62x31 px at 19% (a speck at the top of the
 * sheet) and 1,826 px ABOVE the window at 179%, where a legend symbol is
 * actually boxed. The form opened, took the keyboard focus, and could not be
 * seen — so Capture read as doing nothing at all. `chromeTarget` is the
 * untransformed layer the calibrate and select-text cards already use; it is
 * a required prop so a caller cannot forget it.
 */
export function SymbolCaptureForm({
  thumbnail,
  sharpening,
  soft,
  chromeTarget,
  existingFor,
  onCapture,
  onCancel,
}: {
  thumbnail: string | null;
  /**
   * The sharp picture is still being rendered. Save waits for it, because
   * saving the preview would store exactly the soft picture this replaces.
   */
  sharpening: boolean;
  /** The sharp render failed, so `thumbnail` is the soft preview. Said aloud. */
  soft: boolean;
  /** PlanPane's screen-space layer. Null only before it has mounted. */
  chromeTarget: HTMLElement | null;
  /**
   * The legend item this name already belongs to, if any — then saving asks
   * whether this picture is another LOOK of it (multiple-looks-plan.md § 1).
   */
  existingFor: (label: string) => {
    label: string;
    looks: number;
    thumbnail: string | null;
  } | null;
  /**
   * Save the capture: a new item ("Save symbol"), or another look of an
   * existing one ("Yes, another look", multiple-looks-plan.md § 1). Either
   * way the look is checked first (plan § 4). Resolves with the other items
   * it also lands on when it was NOT saved for that reason — the card then
   * asks, Cancel first — or null once saved. `accepted` is "Add anyway".
   */
  onCapture: (
    label: string,
    opts: { addAsLook: boolean; accepted: boolean }
  ) => Promise<LookAlike[] | null>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [asking, setAsking] = useState<ReturnType<typeof existingFor>>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Saving: checking the look, or the look-alike question it raised. */
  const [lookStep, setLookStep] = useState<
    null | "checking" | { alike: LookAlike[]; addAsLook: boolean }
  >(null);
  const save = (addAsLook: boolean, accepted: boolean) => {
    setLookStep("checking");
    onCapture(label.trim(), { addAsLook, accepted }).then(
      alike => setLookStep(alike ? { alike, addAsLook } : null),
      () => setLookStep(null)
    );
  };
  const warning =
    lookStep !== null && typeof lookStep === "object" ? lookStep : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const trimmed = label.trim();
    // Blank writes nothing — a symbol with no name cannot be found again, and
    // the label is what the link is keyed on.
    if (!trimmed || sharpening || lookStep !== null) return;
    const existing = existingFor(trimmed);
    if (existing) {
      setAsking(existing);
      return;
    }
    save(false, false);
  };

  // pointer-events-auto: the screen layer is click-through by default.
  const card = (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-80 max-w-[calc(100%-1rem)] pointer-events-auto rounded-xl border border-border bg-card/98 p-3 shadow-xl">
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

      {soft && (
        <p className="text-xs text-[#F5C518] mt-2" role="status">
          The sharp picture could not be made, so this one is lower resolution.
          Cancel and box it again to retry.
        </p>
      )}

      {note && !asking && (
        <p className="text-xs text-[#F5C518] mt-2" role="status">
          {note}
        </p>
      )}

      {warning ? (
        // Default is Cancel (plan § 4): it takes the focus, and Enter on it
        // adds nothing.
        <div
          className="mt-2.5 rounded-lg border border-border p-2"
          role="alert"
        >
          <p className="text-xs text-[#F5C518]">
            {lookAlikeWarning(warning.alike)}
          </p>
          <p className="text-xs mt-1 text-muted-foreground">
            If it is drawn like {warning.alike[0].name} on this set, every{" "}
            {warning.alike[0].name} would be offered as{" "}
            {asking?.label ?? label.trim()}.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              autoFocus
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => save(warning.addAsLook, true)}
            >
              {warning.addAsLook ? "Add anyway" : "Save anyway"}
            </Button>
          </div>
        </div>
      ) : asking ? (
        <div
          className="mt-2.5 rounded-lg border border-border p-2"
          role="group"
        >
          <p className="text-xs font-medium">
            “{asking.label}” is already in your legend.
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {asking.thumbnail ? (
              <img
                src={asking.thumbnail}
                alt={`${asking.label}, as saved`}
                className="w-10 h-10 object-contain rounded bg-white border border-border"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-muted" />
            )}
            <span className="text-[0.65rem] text-muted-foreground">
              {asking.looks === 1 ? "its look" : `${asking.looks} looks`}
            </span>
            <span className="text-muted-foreground">·</span>
            {thumbnail ? (
              <img
                src={thumbnail}
                alt="This one"
                className="w-10 h-10 object-contain rounded bg-white border border-border"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-muted" />
            )}
            <span className="text-[0.65rem] text-muted-foreground">
              this one
            </span>
          </div>
          {
            <>
              <p className="text-xs mt-1.5">
                Add this as another look for {asking.label}? It stays one item:
                one count, one price.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={lookStep === "checking"}
                  onClick={() => save(true, false)}
                >
                  {lookStep === "checking"
                    ? "Checking against this sheet…"
                    : "Yes, another look"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    // Two items cannot share a name (plan § 9 Q1): back to the
                    // name, the old one ready to edit.
                    setAsking(null);
                    setNote(
                      `Two items cannot share a name — give this one its own, e.g. ${asking.label} — weather resistant.`
                    );
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  }}
                >
                  No, a separate item
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              </div>
            </>
          }
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mt-2.5">
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs flex-1"
            onClick={commit}
            disabled={!label.trim() || sharpening || lookStep !== null}
          >
            <Check className="w-3 h-3" />{" "}
            {sharpening
              ? "Sharpening picture…"
              : lookStep === "checking"
                ? "Checking against this sheet…"
                : "Save symbol"}
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
      )}
    </div>
  );

  // The same fallback as CalibrateLayer and TextSelect. PlanPane sets the
  // layer on its first commit (`ref={setChromeLayer}`), and this form only
  // exists after a box has been dragged on a rendered page, so the inline
  // branch is for a layer that has not mounted, not a normal path.
  return chromeTarget ? createPortal(card, chromeTarget) : card;
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
  const [crosshairColor] = useCrosshairColor();
  const [crosshairSize] = useCrosshairSize();
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
      // A finger drags the box here rather than panning (TakeoffPage touch
      // router); two fingers still move the sheet.
      data-touch-drag
      /*
        The same cursor as tracing and calibrating. Boxing a symbol on a legend
        is an aiming job too, and a crosshair that differs between overlays
        reads as a different tool rather than the same one somewhere else.
      */
      style={crosshairCursorStyle(crosshairColor, crosshairSize)}
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
