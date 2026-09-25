/**
 * TakeoffPage — the plan workspace for a bid.
 *
 * A fresh build rather than a reworking of the legacy takeoff screen. The PDF
 * rendering engine underneath is unchanged, as ASSEMBLIES_PLAN.md § TAKEOFF
 * PAGE REDESIGN intends: this is the surrounding workflow.
 *
 * ── What is on it ────────────────────────────────────────────────────────────
 * All of it, now. Documents and the sheet index, per-sheet scale, stamping
 * assemblies onto the drawing, tracing conduit and cable runs against that
 * scale, the legend that maps a symbol to an assembly, layer visibility, and
 * the plan reader that proposes stamps for you to accept.
 *
 * **What is placed here is COUNTED, not priced.** Marks and runs become
 * quantities on this screen and on the supplier materials list — see RunsPanel
 * and the counted-items list for the totals — and they stop there. Nothing that
 * prices a bid reads a stamp or a run (server/routers/materialsListRouter.ts
 * says so in its header), so a finished takeoff is still typed into the bid by
 * hand. The screen claimed the opposite until 2026-09-18. The bridge that would
 * make the claim true is its own phase: references/plan-viewer-overhaul.md § 5e.
 *
 * ── Layout, and why this shape ───────────────────────────────────────────────
 *   documents + sheet index │ the drawing │ work pane
 *
 * The index is permanently docked rather than a drawer, because choosing the
 * sheet is the single most frequent action on this screen and a drawer would
 * put a click in front of every one of them. The work pane is a resizable
 * split holding the Co-pilot, Layers and Legend panels above the counted-items
 * list — a two-pane structure rather than a stack of bolted-on drawers.
 *
 * ── What happens when a document opens ───────────────────────────────────────
 * 1. Bytes are fetched and handed to the worker (phase 1).
 * 2. The outline is read and posted to `ensureSheets`, which creates the sheet
 *    rows once. Renames survive this — see the router.
 * 3. The visible page's text is extracted and posted to `detectSheetScale`,
 *    which applies a reading only when it is certain. Everything else becomes a
 *    suggestion on the scale control.
 *
 * Steps 2 and 3 are best-effort: a document with no outline and no legible
 * scale still opens, still lists every sheet, and still measures once the user
 * sets a scale by hand.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  ClipboardList,
  Loader2,
  Plus,
  ChevronDown,
  MapPin,
  Ruler,
  Maximize2,
  Minimize2,
  Minus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BUTTON_ZOOM_STEP,
  REGION_SETTLE_MS,
  clampView,
  fitView,
  formatZoom,
  regionStillGood,
  snapToDevicePixel,
  wantedRegion,
  wheelZoomFactor,
  zoomAbout,
  type PlanView,
  type ViewBounds,
} from "@/lib/planView";
import { SheetIndex } from "@/components/takeoff/SheetIndex";
// The tool button and the row it produces draw the same icon, from one place.
import { CableIcon, ConduitIcon } from "@/components/takeoff/runIcons";
import { SheetChip } from "@/components/takeoff/SheetChip";
import { SidePanel } from "@/components/takeoff/SidePanel";
import {
  PANELS_DEFAULT,
  PANELS_STORAGE_KEY,
  PANEL_LIMITS,
  isFocusMode,
  parsePanelState,
  serialisePanelState,
  setPanelWidth,
  toggleFocus,
  togglePanel,
  type PanelState,
} from "@/lib/takeoffPanels";
import { StampPicker } from "@/components/takeoff/StampPicker";
import {
  RunTypePicker,
  type RunTypePatch,
} from "@/components/takeoff/RunTypePicker";
import { RunSpecEditor } from "@/components/takeoff/RunSpecEditor";
import { resolveRunType } from "@shared/runTypeLookup";
import { runTypeSpec } from "@shared/takeoffCounts";
import { CalibrateLayer } from "@/components/takeoff/CalibrateLayer";
import { ScaleControl } from "@/components/takeoff/ScaleControl";
import { JobHeightsChip } from "@/components/takeoff/JobHeightsChip";
import { RunEndsEditor, TraceEndsPickers } from "@/components/takeoff/runEnds";
import {
  DISTRIBUTION_KIND,
  traceEndsLabel,
  SUGGEST_WITHIN_INCHES,
  shouldSuggestStampLink,
} from "@shared/takeoffHeights";
import { pointsToRealInches, segmentLength } from "@shared/takeoffGeometry";
import { UploadProgress } from "@/components/takeoff/UploadProgress";
import { describePlanRemoval } from "@shared/planRemoval";
import {
  MAX_PDF_BYTES,
  VIEWER_COMFORTABLE_BYTES,
  checkPdfUpload,
  formatBytes,
  looksLikePdf,
} from "@shared/uploadLimits";
import {
  postViaServer,
  putDirectToStorage,
  type UploadError,
} from "@/lib/planUploadTransport";
import {
  fileIdentity,
  planParts,
  shouldUseMultipart,
} from "@shared/multipartPlan";
import { uploadInParts } from "@/lib/multipartUpload";
import { useUploadSpeeds } from "@/lib/useUploadSpeeds";
import {
  findResumableUpload,
  forgetUpload,
  rememberUpload,
} from "@/lib/uploadResumeStore";
import {
  appendJobs,
  clearFinished,
  dismissJob,
  failJob,
  isBusy,
  makeJob,
  patchJob,
  resetForRetry,
  type UploadJob,
} from "@/lib/uploadQueue";
import { takePendingPlan } from "@/lib/pendingPlanUpload";
import { TraceLayer } from "@/components/takeoff/TraceLayer";
import {
  RunsPanel,
  type GroupBridgeState,
} from "@/components/takeoff/RunsPanel";
import {
  clearDraft,
  clearStampQueue,
  hasUnsavedWork,
  loadDraft,
  loadStampQueue,
  saveDraft,
  saveStampQueue,
} from "@/lib/traceDraft";
import { LegendPanel } from "@/components/takeoff/LegendPanel";
import { CoPilotPanel } from "@/components/takeoff/CoPilotPanel";
import { snapshotPage } from "@/lib/planSnapshot";
import { withSavedSheet, withSheetChecked } from "@/lib/sheetScaleCache";
import { canRetryWithFreshUrl, isExpiredPlanUrl } from "@/lib/planUrlRefresh";
import { groupStamps } from "@shared/takeoffCounts";
import { LayersPanel } from "@/components/takeoff/LayersPanel";
import { MaterialsListDialog } from "@/components/MaterialsListDialog";
import {
  SymbolCaptureForm,
  SymbolCaptureLayer,
  cropToThumbnail,
  type CaptureRegion,
} from "@/components/takeoff/SymbolCapture";
import {
  allLayersOn,
  filterByLayers,
  layersPresent,
  locationKeyOf,
  systemKeyForRun,
  systemKeyForStamp,
  type LayerState,
} from "@shared/takeoffLayers";
import { runAppearance } from "@shared/takeoffMarks";
import type { PageRect } from "@shared/planRegion";
import type { PagePoint } from "@shared/takeoffGeometry";
import type { RunPathType } from "@shared/takeoffQuantities";
import { describeScale } from "@shared/planScale";

// The upload queue's shape and its operations live in lib/uploadQueue.ts, so
// that retrying and dismissing can be tested without rendering this page.

type Document = {
  id: number;
  filename: string;
  byteSize: number;
  pageCount: number | null;
  url: string;
};

// ── Worker plumbing ──────────────────────────────────────────────────────────

type Pending = { resolve: (value: any) => void; reject: (e: Error) => void };

/**
 * What comes back from a render: the picture, and the terms it was drawn on.
 *
 * `scale` and `rect` are what the worker ACTUALLY used, not what was requested.
 * They ride with the bitmap so no caller has to hold a constant that could
 * drift out of step — the mistake `snapshotPage` was one refactor away from
 * making, which would have told the plan reader the wrong page size and put
 * every proposed stamp in the wrong place.
 */
type RenderedRegion = {
  bitmap: ImageBitmap;
  scale: number;
  rect: PageRect;
  pageWidth: number;
  pageHeight: number;
  elapsed: string;
};

/**
 * One worker for this screen, torn down with it.
 *
 * Not the module-level singleton the legacy viewer keeps: this page owns its
 * document, and leaving a parsed PDF resident after the user navigates away
 * holds its decoded pages in memory for nobody.
 */
function usePdfWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const loadWaiters = useRef<
    { resolve: (pages: number) => void; reject: (e: Error) => void }[]
  >([]);

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/pdfRenderer.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      // pdfjs runs its own worker entry inside ours and posts a handshake that
      // arrives here first. Anything without a known type is not ours.
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "loaded") {
        loadWaiters.current.splice(0).forEach(w => w.resolve(msg.numPages));
        return;
      }
      if (msg.type === "rendered") {
        // The whole reply, not just the bitmap. The scale and the rect that
        // were actually used travel WITH the picture so nothing downstream has
        // to remember what it asked for — see @shared/planRegion.
        pending.current.get(msg.reqId)?.resolve({
          bitmap: msg.bitmap,
          scale: msg.scale,
          rect: msg.rect,
          pageWidth: msg.pageWidth,
          pageHeight: msg.pageHeight,
          elapsed: msg.elapsed,
        });
        pending.current.delete(msg.reqId);
        return;
      }
      if (msg.type === "outline") {
        pending.current.get(msg.reqId)?.resolve(msg.entries);
        pending.current.delete(msg.reqId);
        return;
      }
      if (msg.type === "text") {
        pending.current.get(msg.reqId)?.resolve(msg.text);
        pending.current.delete(msg.reqId);
        return;
      }
      if (msg.type === "error") {
        const waiter = pending.current.get(msg.reqId);
        if (waiter) {
          waiter.reject(new Error(msg.message));
          pending.current.delete(msg.reqId);
          return;
        }
        // An error with no request to attach it to can only be the load, which
        // would otherwise hang on a spinner forever.
        loadWaiters.current
          .splice(0)
          .forEach(w => w.reject(new Error(msg.message)));
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      pending.current.clear();
      loadWaiters.current = [];
    };
  }, []);

  const ask = useCallback(
    <T,>(message: Record<string, unknown>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) return reject(new Error("Viewer not ready"));
        const reqId = `${Date.now()}:${Math.random()}`;
        pending.current.set(reqId, { resolve, reject });
        worker.postMessage({ ...message, reqId });
      });
    },
    []
  );

  const load = useCallback((pdfData: ArrayBuffer, hash: string) => {
    return new Promise<number>((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) return reject(new Error("Viewer not ready"));
      loadWaiters.current.push({ resolve, reject });
      worker.postMessage({ type: "load", pdfData, hash }, [pdfData]);
    });
  }, []);

  // byteSize decides whether pdf.js also downloads the rest of the document in
  // the background — see shared/pdfRangeLoading.ts. Passed rather than guessed,
  // because the wrong answer on a 1GB set is a gigabyte of wasted connection.
  const loadUrl = useCallback(
    (url: string, hash: string, byteSize: number | null) => {
      return new Promise<number>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) return reject(new Error("Viewer not ready"));
        loadWaiters.current.push({ resolve, reject });
        worker.postMessage({ type: "loadUrl", url, hash, byteSize });
      });
    },
    []
  );

  // Memoised as a whole. These go into effect dependency arrays, and a fresh
  // function identity per render restarts the document load on every render —
  // which cancels the one in flight, so the viewer spins forever and never
  // finishes opening anything.
  return useMemo(
    () => ({
      load,
      loadUrl,
      /**
       * Draw part of a page — or all of it, if no rect is given.
       *
       * `rect` is in page points (see `@shared/planRegion`). The viewer passes
       * the part someone is looking at; the plan reader's tiler will pass a
       * grid of rectangles on the same page. This function does not know the
       * difference and must not learn it.
       *
       * Returns the bitmap together with the scale and rect the worker actually
       * used, which may not be what was asked for — the region is trimmed to
       * the page and the scale drops if the bitmap would be too large. Callers
       * read those from here rather than holding a constant.
       *
       * The timing line is wall time rather than the worker's internal figure,
       * because queueing is part of what the user waits through. It is cheap
       * and it turns every sheet anyone opens into a measurement; keep it.
       */
      render: async (
        pageNum: number,
        scale: number,
        hash: string,
        rect?: PageRect
      ): Promise<RenderedRegion> => {
        const t0 = performance.now();
        const result = await ask<RenderedRegion>({
          type: "render",
          pageNum,
          scale,
          hash,
          rect,
        });
        const ms = Math.round(performance.now() - t0);
        const { bitmap } = result;
        const mp = (bitmap.width * bitmap.height) / 1e6;
        // Never let a reduced scale pass unmentioned. A drawing that is quietly
        // softer than it was asked to be is exactly the kind of thing nobody
        // notices until they are measuring off it.
        // Never let a reduced scale pass unmentioned, and say what it COSTS
        // rather than only what it was: a bitmap drawn at 0.61 of the asked
        // resolution is displayed stretched by 1/0.61, and "soft" is the only
        // thing the user will notice about it.
        const cut =
          result.scale < scale - 1e-6
            ? ` — ASKED ${scale.toFixed(2)}x, CUT TO ${result.scale.toFixed(
                2
              )}x to fit, so this patch is ${(scale / result.scale).toFixed(
                2
              )}x softer than the screen`
            : "";
        const where =
          rect === undefined
            ? "whole page"
            : `region ${Math.round(result.rect.width)}x${Math.round(
                result.rect.height
              )}pt at ${Math.round(result.rect.x)},${Math.round(
                result.rect.y
              )}`;
        console.info(
          `[plan] page ${pageNum} ${where} at ${result.scale.toFixed(
            2
          )}x — ${ms}ms, ` +
            `${bitmap.width}x${bitmap.height} (${mp.toFixed(1)} Mpx, ` +
            `${Math.round((mp * 4e6) / 1048576)} MB)${cut}`
        );
        return result;
      },
      outline: (hash: string) =>
        ask<{ pageNumber: number; title: string }[]>({ type: "outline", hash }),
      pageText: (pageNum: number, hash: string) =>
        ask<string>({ type: "text", pageNum, hash }),
    }),
    [load, loadUrl, ask]
  );
}

// ── The drawing pane ─────────────────────────────────────────────────────────

/**
 * What the backdrop is drawn at — the whole sheet, once per page.
 *
 * Not the resolution anything is finally read at. It is the picture that has
 * to exist before the user has aimed at anything: it fits the pane, it is what
 * the plan reader is handed, and it is the layer the sharp region sits on top
 * of so there is never a blank hole while a region is being drawn.
 *
 * Left at 1.5 deliberately. Raising it looks free on a machine whose Chrome
 * hands big canvases to the software rasteriser — sharper AND faster — but it
 * would cost 107MB a page instead of 38MB and be a pessimisation on any
 * machine without that behaviour. See references/plan-viewer-overhaul.md § 4b.
 */
const RENDER_SCALE = 1.5;

/**
 * What to assume the plan reader runs on before the server has said.
 *
 * The server names the real one in `planCopilot.state.readerModel`, because it
 * is the side that holds `PLAN_COPILOT_MODEL`. This only stands in for the
 * instant before that query answers, and it deliberately names the SMALLER
 * tier's behaviour by naming a model this client does not recognise — an
 * unknown id falls back to standard-tier limits in
 * `shared/visionImageLimits.ts`, which under-sends rather than over-sends. A
 * snapshot that is smaller than it could have been loses a little detail; one
 * that is larger than the model will look at is silently shrunk on arrival and
 * the extra upload is simply burnt.
 */
const PLAN_READER_FALLBACK_MODEL = "unknown";

/**
 * How wide a sheet thumbnail is drawn, in pixels.
 *
 * Generously sized on purpose. The grid shows them about 160 CSS pixels wide,
 * and on a DPR-2 screen that is 320 device pixels — a thumbnail drawn at 160
 * would be visibly mushy on exactly the machines this app is used on. The
 * point of the grid is recognising a sheet by its SHAPE, and a blurred shape
 * is no shape.
 */
const THUMBNAIL_PIXELS = 360;

/**
 * How many device pixels one CSS pixel is, kept current.
 *
 * Read once and cached it would be wrong for the rest of the session the
 * moment a laptop is plugged into an external monitor or the browser's own
 * zoom is changed — both of which change devicePixelRatio, and both of which
 * are ordinary things to do mid-takeoff. A stale value makes every sharp
 * render ask for the wrong resolution, which is invisible except that the
 * drawing is soft.
 *
 * The media query is the only event browsers give for this. It matches only
 * the CURRENT ratio, so it has to be re-armed after each change.
 */
function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() =>
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [dpr]);
  return dpr;
}

/**
 * Storage refused the plan's URL, which almost always means it simply aged out.
 *
 * Carries the same message the plain failure would, so if the retry does not
 * help — the object really is missing — the user sees exactly what they saw
 * before this recovery existed, rather than an empty error.
 */
class PlanUrlExpired extends Error {
  constructor() {
    super("Could not fetch the plan (403)");
    this.name = "PlanUrlExpired";
  }
}

function PlanPane({
  doc,
  page,
  onPageCount,
  onPage,
  onDocumentReady,
  onSheetVisible,
  onPageRendered,
  overlay,
  onUrlExpired,
  controlsTarget,
  drawThumbnails,
  onThumbnail,
}: {
  doc: Document;
  page: number;
  /**
   * Where this pane's own zoom controls go — the one top bar.
   *
   * Null keeps them in a strip of their own, so the component still works on
   * its own and a bar that has not mounted yet does not swallow the controls.
   */
  controlsTarget?: HTMLElement | null;
  /**
   * Draw a thumbnail of every sheet, one at a time, while this is true.
   *
   * Gated rather than eager because the worker draws one thing at a time: a
   * grid rendered in the background would queue itself in front of the sharp
   * patch for the sheet somebody is reading. See SheetChip.
   */
  drawThumbnails?: boolean;
  onThumbnail?: (pageNumber: number, dataUrl: string) => void;
  onPageCount: (pageCount: number) => void;
  onPage: (page: number) => void;
  /** Fires once per document, with the page count and outline. */
  onDocumentReady: (info: {
    pageCount: number;
    outline: { pageNumber: number; title: string }[];
  }) => void;
  /** Fires when a page is shown, with its extracted text, for scale detection. */
  onSheetVisible: (pageNumber: number, text: string) => void;
  /**
   * Fires each time a page finishes rasterising, with the canvas holding it.
   *
   * The plan reader is sent this raster rather than making its own — the worker
   * has already paid for it once. See lib/planSnapshot.ts.
   */
  onPageRendered?: (
    pageNumber: number,
    canvas: HTMLCanvasElement,
    /** The scale it was drawn at — see RenderedRegion. Do not assume it. */
    scale: number
  ) => void;
  /**
   * The tracing layer, drawn over the page at the same size. Given the canvas
   * dimensions so its coordinate space matches the rasterised page exactly —
   * a mismatch here would put every measurement out by a constant factor.
   */
  overlay?: (size: {
    width: number;
    height: number;
    renderScale: number;
    /**
     * The display zoom the overlay is being scaled by.
     *
     * Passed because the overlay cannot see it: it renders inside the
     * transform, so anything that must hold a size ON SCREEN — a counted
     * mark — has to divide it back out. See shared/takeoffMarks.ts.
     */
    zoom: number;
    canvas: HTMLCanvasElement | null;
    /**
     * Where to put anything that must stay screen-sized.
     *
     * The overlay is rendered INSIDE the zoom transform so its marks sit on the
     * drawing — which is right for a stamp and wrong for a button. Chrome left
     * in the transform is 3 pixels tall at 20% and off-screen at 400%. Portal
     * it here instead: this layer sits over the viewport, untransformed.
     */
    chromeTarget: HTMLElement | null;
  }) => React.ReactNode;
  /**
   * Ask the server for a fresh URL for this document, and return it.
   *
   * Called only when storage refuses the current one — plan URLs are signed
   * and expire (server/storageTokens.ts), so a plan left open long enough will
   * eventually be reading with a stale token. Returns null when there is
   * nothing to retry with.
   */
  onUrlExpired?: () => Promise<string | null>;
}) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  /**
   * The scale the canvas on screen was actually drawn at.
   *
   * Starts at RENDER_SCALE because that is what the first render asks for, and
   * is replaced by whatever the worker reports. Once sharp zoom lands this
   * stops being a constant, and every conversion between canvas pixels and
   * page points must already be reading it rather than the constant.
   */
  const [drawnScale, setDrawnScale] = useState(RENDER_SCALE);

  /**
   * The sharp patch drawn over the backdrop, and the terms it was drawn on.
   *
   * `rect` and `scale` are what the worker ACTUALLY used — the rect trimmed to
   * the page, the scale reduced if the bitmap would have been too big. They
   * are what positions the patch, so reading back the request instead of the
   * reply would put it in the wrong place at every page edge.
   *
   * `key` is the sheet it belongs to. A patch of sheet 5 laid over sheet 6
   * looks like corrupted data rather than a stale bitmap, and page flips are
   * exactly when a render is most likely to be in flight.
   */
  const [sharp, setSharp] = useState<{
    key: string;
    rect: PageRect;
    scale: number;
    /**
     * The bitmap's own pixel size, which is what the patch is SIZED from.
     *
     * Not the same as `rect.width * scale`: the worker rounds a region's pixel
     * size up to whole pixels, and a canvas displayed a fraction of a pixel
     * narrower than its own bitmap is resampled — the exact softness this
     * layer exists to remove. Sizing from the bitmap makes the ratio exactly
     * one; the geometric error left over is under half a device pixel.
     */
    bitmapWidth: number;
    bitmapHeight: number;
  } | null>(null);
  const sharpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /**
   * The bitmap waiting for the canvas that the next commit will create.
   *
   * It cannot be drawn where it arrives: the canvas element does not exist
   * until `sharp` has rendered. Drawing it in a layout effect instead means
   * the pixels and the position land in the same frame — draw first and
   * position after and the patch is visibly in the wrong place for a frame.
   */
  const pendingSharp = useRef<ImageBitmap | null>(null);

  const dpr = useDevicePixelRatio();
  const { load, loadUrl, render, outline, pageText } = usePdfWorker();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  /** State, not a ref: the overlay has to re-render once this layer exists. */
  const [chromeLayer, setChromeLayer] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<PlanView>({ zoom: 1, x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  /** Where the drag started, and the view it started from. */
  const panFrom = useRef<{
    pointerX: number;
    pointerY: number;
    view: PlanView;
  } | null>(null);

  /** Viewport and drawing sizes, read fresh — the pane is resizable. */
  const readBounds = useCallback((): ViewBounds | null => {
    const vp = viewportRef.current;
    if (!vp || canvasSize.width === 0) return null;
    return {
      viewportWidth: vp.clientWidth,
      viewportHeight: vp.clientHeight,
      contentWidth: canvasSize.width,
      contentHeight: canvasSize.height,
    };
  }, [canvasSize.width, canvasSize.height]);

  /**
   * True while the view is still exactly the one fit last produced.
   *
   * The moment the user zooms or pans it goes false and stays false until the
   * next fit — which is what makes re-fitting on a resize safe. Re-fitting a
   * view somebody has aimed would throw their position away every time a
   * panel opened.
   */
  const viewIsFitted = useRef(true);

  /**
   * Set the view because the USER aimed it — a wheel, a drag, a zoom button.
   *
   * Everything that moves the view on the user's behalf goes through here, so
   * that "is this still a fit?" is answered by one fact rather than by
   * comparing numbers after the event. Fit itself, the page-flip fit and the
   * resize handler set the view directly, because they are the ones deciding
   * what the flag should say.
   */
  const aimView = useCallback(
    (next: PlanView | ((current: PlanView) => PlanView)) => {
      viewIsFitted.current = false;
      setView(next);
    },
    []
  );

  const fitToView = useCallback(() => {
    const bounds = readBounds();
    if (!bounds) return;
    viewIsFitted.current = true;
    setView(fitView(bounds));
  }, [readBounds]);

  /** The page this view was last fitted for, as `docId:page`. */
  const fittedFor = useRef<string | null>(null);

  /**
   * Fit once per page, on arrival.
   *
   * Keyed on the DOCUMENT AND PAGE, not on the canvas size. Keying on size was
   * the obvious choice and was wrong in the ordinary case: every sheet in a
   * drawing set is usually the same size, so the size never changed, the effect
   * never re-fired, and flipping pages carried the previous zoom and pan across
   * — landing the reader somewhere arbitrary on a sheet they have not seen.
   *
   * Still waits for a raster, because fitting needs the sheet's dimensions. The
   * ref is what stops a re-render refitting a page the user has since zoomed.
   */
  useEffect(() => {
    if (canvasSize.width === 0) return;
    const key = `${doc.id}:${page}`;
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fitToView();
  }, [doc.id, page, canvasSize.width, canvasSize.height, fitToView]);

  /**
   * The pane changed size — re-fit if the view was a fit, otherwise re-clamp.
   *
   * **Re-clamping alone was not enough, and the symptom did not look like a
   * fit bug.** `clampView` only pulls the offsets back inside the sheet; it
   * cannot make a sheet smaller. So a fit computed against a wider pane
   * survived the pane getting narrower, and the drawing carried on being
   * drawn at the old zoom — running off its own pane and disappearing behind
   * whatever is beside it, cut off mid-column with nothing to say the rest was
   * still there. It reads as the panel covering the drawing rather than as a
   * stale zoom, which is why it went unexplained.
   *
   * It happens on both axes and for ordinary reasons: collapsing or opening a
   * side panel, dragging the split, the window being resized, and the tool bar
   * wrapping to a second line as controls are added.
   *
   * Only while the view is still the fitted one. Somebody who has zoomed in
   * has chosen where they are looking, and a resize must not take it away.
   */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const bounds = readBounds();
      if (!bounds) return;
      if (viewIsFitted.current) {
        setView(fitView(bounds));
        return;
      }
      setView(current => clampView(current, bounds));
    });
    observer.observe(vp);
    return () => observer.disconnect();
  }, [readBounds]);

  /**
   * Wheel zoom, attached by hand because it must not be passive.
   *
   * React's own onWheel is registered passively, where preventDefault is
   * ignored — so the page behind would scroll while the drawing zoomed.
   */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      const bounds = readBounds();
      if (!bounds) return;
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      aimView(current =>
        zoomAbout(current, bounds, wheelZoomFactor(e.deltaY), anchor)
      );
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [readBounds, aimView]);

  /** Zoom a step about the middle of the viewport, for the buttons and keys. */
  const zoomByStep = useCallback(
    (factor: number) => {
      const bounds = readBounds();
      if (!bounds) return;
      aimView(current =>
        zoomAbout(current, bounds, factor, {
          x: bounds.viewportWidth / 2,
          y: bounds.viewportHeight / 2,
        })
      );
    },
    [readBounds, aimView]
  );

  /**
   * Space is the "pan regardless" modifier.
   *
   * Without it the only way to pan is a drag on empty drawing, which is exactly
   * what you cannot do while a tool is armed — and mid-trace is when you most
   * need to move the sheet.
   */
  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomByStep(BUTTON_ZOOM_STEP);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomByStep(1 / BUTTON_ZOOM_STEP);
      } else if (e.key === "0") {
        e.preventDefault();
        fitToView();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    // Cleared on blur too: a Space held while the window loses focus never
    // sends its keyup, and the cursor would stay stuck in grab mode forever.
    const clear = () => setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [zoomByStep, fitToView]);

  /** Mirrors `view` so the drag handlers can read it without re-subscribing. */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const startPan = useCallback((e: PointerEvent | React.PointerEvent) => {
    panFrom.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      view: viewRef.current,
    };
    setPanning(true);
  }, []);

  /**
   * A plain left-drag pans — but only when it reaches us.
   *
   * ── This comment used to be wrong, and the wrongness shipped ──────────────
   * It said no check for "is a tool armed" was needed because "TraceLayer's
   * overlay takes the event and this never fires". A React event bubbles: the
   * overlay handled it AND it arrived here. Marking and tracing were unharmed
   * only because a click that does not move pans by nothing — but boxing a
   * symbol on the legend is a DRAG, so Capture drew its box and panned the
   * sheet out from under it at the same time, and looked like it was only
   * panning.
   *
   * The overlays now claim the gesture when they are armed, by calling
   * `stopPropagation` in their own pointerdown, so the sentence is true by
   * construction rather than by assumption. If the event got here, nothing
   * above it wanted it.
   */
  const beginPlainPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || spaceHeld) return;
      startPan(e);
    },
    [spaceHeld, startPan]
  );

  /**
   * Pan without putting the tool down: RIGHT-drag, middle-drag, or space-drag.
   *
   * Right-drag is the one people reach for, and it has to work mid-trace — the
   * moment you most need to move the sheet is halfway along a run that leaves
   * the screen. Capture phase with `stopPropagation`, so the overlay never sees
   * the event and cannot mistake it for a point.
   *
   * `spaceHeld` is read from a ref rather than the closure. As state it was
   * stale here often enough to look broken: the listener is re-registered on
   * every change, and a keydown landing between render and re-registration
   * left the old handler still saying "space is not held".
   */
  const spaceHeldRef = useRef(spaceHeld);
  useEffect(() => {
    spaceHeldRef.current = spaceHeld;
  }, [spaceHeld]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onDown = (e: PointerEvent) => {
      const wants =
        e.button === 2 ||
        e.button === 1 ||
        (e.button === 0 && spaceHeldRef.current);
      if (!wants) return;
      e.preventDefault();
      e.stopPropagation();
      startPan(e);
    };
    /**
     * The menu is suppressed for the whole viewport, not just during a drag.
     * A right-click that opens a context menu over the drawing is never what
     * was wanted here, and suppressing it only after a drag has begun still
     * flashes the menu on a click that does not move.
     */
    const onMenu = (e: MouseEvent) => e.preventDefault();
    vp.addEventListener("pointerdown", onDown, true);
    vp.addEventListener("contextmenu", onMenu);
    return () => {
      vp.removeEventListener("pointerdown", onDown, true);
      vp.removeEventListener("contextmenu", onMenu);
    };
  }, [startPan]);

  /** The drag itself, on the window so it survives leaving the viewport. */
  useEffect(() => {
    if (!panning) return;
    const move = (e: PointerEvent) => {
      const from = panFrom.current;
      const bounds = readBounds();
      if (!from || !bounds) return;
      aimView(
        clampView(
          {
            zoom: from.view.zoom,
            x: from.view.x + (e.clientX - from.pointerX),
            y: from.view.y + (e.clientY - from.pointerY),
          },
          bounds
        )
      );
    };
    const end = () => {
      panFrom.current = null;
      setPanning(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [panning, readBounds, aimView]);
  const [pageCount, setPageCount] = useState(doc.pageCount ?? 0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pages already sent for scale detection, so it runs once each. */
  const detected = useRef(new Set<number>());

  /**
   * Held in a ref, and deliberately NOT in the effect's dependencies.
   *
   * The caller passes an inline arrow, so its identity changes every render.
   * Listing it as a dependency would restart the document load on every render
   * — the exact failure `usePdfWorker` memoises its own functions to avoid,
   * where each load cancels the one in flight and the viewer spins forever.
   * A ref keeps the latest callback reachable without making it a trigger.
   */
  const onUrlExpiredRef = useRef(onUrlExpired);
  onUrlExpiredRef.current = onUrlExpired;

  /**
   * The URL that has already been refreshed once.
   *
   * One retry per URL. If a fresh URL fails the same way, the second failure is
   * reported rather than triggering another round — a refresh loop behind a
   * spinner is worse than an error, because it never ends and says nothing.
   */
  const refreshedFor = useRef<string | null>(null);

  const hash = String(doc.id);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    detected.current.clear();

    (async () => {
      try {
        // URL loading asks pdf.js to use byte ranges directly from storage.
        // This keeps very large plan sets out of the main tab's memory. Some
        // storage gateways cannot answer range requests; only in that case do
        // we retain the previous complete-download path as a compatibility
        // fallback for ordinary-sized files.
        const pages = await loadUrl(doc.url, hash, doc.byteSize ?? null).catch(
          async rangeError => {
            const resp = await fetch(doc.url);
            // A refused URL is usually just an old one — plan URLs are signed and
            // expire. Distinguished here so the outer catch can ask for a fresh
            // one instead of telling the user their plan is broken.
            if (isExpiredPlanUrl(resp.status)) throw new PlanUrlExpired();
            if (!resp.ok)
              throw new Error(`Could not fetch the plan (${resp.status})`);
            const buffer = await resp.arrayBuffer();
            try {
              return await load(buffer, hash);
            } catch {
              throw rangeError;
            }
          }
        );
        if (cancelled) return;
        setPageCount(pages);
        setLoading(false);
        if (doc.pageCount !== pages) onPageCount(pages);

        // Best-effort: no outline is normal, and must not fail the open.
        const entries = await outline(hash).catch(() => []);
        if (cancelled) return;
        onDocumentReady({ pageCount: pages, outline: entries });
      } catch (err) {
        if (cancelled) return;

        /**
         * An expired URL is recoverable, and silently: ask for a new one and
         * let this effect run again on it.
         *
         * `loading` stays true throughout, so the user sees one continuous
         * spinner rather than an error that flashes and heals itself.
         *
         * Two guards keep this from becoming a loop. One refresh per URL, and
         * `canRetryWithFreshUrl` refuses a URL identical to the one that just
         * failed — which is what comes back when the 403 was never an expiry
         * (this storage answers 403 for a missing object too). Either way it
         * falls through to the honest error below.
         */
        if (err instanceof PlanUrlExpired && refreshedFor.current !== doc.url) {
          refreshedFor.current = doc.url;
          const fresh = await onUrlExpiredRef.current?.().catch(() => null);
          if (cancelled) return;
          if (canRetryWithFreshUrl(doc.url, fresh)) return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "That plan could not be opened. Your takeoff is saved — try opening it again."
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.url, hash, load, loadUrl, outline]);

  // Paint the backdrop: the whole sheet, once per page, at RENDER_SCALE.
  useEffect(() => {
    if (loading || error || pageCount === 0) return;
    let cancelled = false;
    setRendering(true);

    // No rect: the backdrop is the whole sheet. The sharp patch below asks
    // for a rectangle of the same page, on top of this.
    render(page, RENDER_SCALE, hash)
      .then(({ bitmap, scale }) => {
        if (cancelled) return bitmap.close();
        const canvas = canvasRef.current;
        if (!canvas) return bitmap.close();
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        setCanvasSize({ width: bitmap.width, height: bitmap.height });
        // The scale this canvas was ACTUALLY drawn at, kept beside the canvas
        // it describes. Anything that converts between canvas pixels and page
        // points reads this, never RENDER_SCALE.
        setDrawnScale(scale);
        bitmap.close();
        setRendering(false);
        onPageRendered?.(page, canvas, scale);
      })
      .catch(err => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "That page could not be drawn. Move to another sheet and back."
        );
        setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, pageCount, loading, error, render, hash]);

  /**
   * ── Sharp zoom ────────────────────────────────────────────────────────────
   *
   * The backdrop is drawn once per sheet and stretched by the CSS transform,
   * which is instant and goes soft the moment the magnification passes the
   * resolution it was drawn at. What follows draws the part being looked at
   * again, properly, and lays it on top.
   *
   * The whole sheet cannot simply be redrawn sharper. Measured on a real 36x24
   * E-sheet, the 260% that was reported as too soft needs 7.8x, and the whole
   * page at 7.8x does not allocate — the browser refuses near a gigabyte of
   * bitmap. The same rectangle, screen-sized, took 83ms and 24MB. See
   * references/plan-viewer-overhaul.md § 4b.
   */

  /** This sheet, for stamping requests so a page flip cannot mismatch them. */
  const pageKey = `${hash}:${page}`;

  /**
   * What to ask for, once movement has stopped.
   *
   * The settle delay is the coalescing. A wheel zoom or a drag throws off a
   * stream of positions and rendering for each one would queue a minute of
   * work for views nobody is looking at any more — so nothing is requested
   * until the view has held still for `REGION_SETTLE_MS`.
   *
   * Then the identity check is what stops the rest. `regionStillGood` compares
   * the new want against the LAST ASK rather than against what is on screen,
   * deliberately: a request already in flight should not be sent twice, and a
   * nudge that lands inside the margin already being drawn needs nothing at
   * all. Returning the same object means no new state, so the effect below
   * does not re-run.
   */
  const [ask, setAsk] = useState<{
    key: string;
    rect: PageRect;
    scale: number;
  } | null>(null);

  useEffect(() => {
    if (loading || error || canvasSize.width === 0) return;
    const timer = setTimeout(() => {
      const bounds = readBounds();
      if (!bounds) return;
      // devicePixelRatio is not decoration: on a Retina or 4K laptop it is 2,
      // which doubles the resolution the same zoom needs. Read from the hook
      // rather than from window, so plugging in a monitor re-runs this.
      const want = wantedRegion(view, bounds, drawnScale, dpr);
      setAsk(current => {
        // Zoomed back out far enough that the backdrop is already sharper than
        // the screen shows it — there is nothing to add.
        if (!want) return null;
        const next = { key: pageKey, ...want };
        if (current?.key === pageKey && regionStillGood(current, want)) {
          return current;
        }
        return next;
      });
    }, REGION_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [
    view,
    canvasSize.width,
    canvasSize.height,
    drawnScale,
    dpr,
    readBounds,
    loading,
    error,
    pageKey,
  ]);

  /**
   * Draw the asked-for region, latest wins.
   *
   * The cleanup is the cancellation. There is no way to recall a render
   * already started in the worker, and none is needed — a reply nobody wants
   * is closed rather than shown, which costs one wasted render at most,
   * because the settle delay means asks do not arrive in a stream.
   */
  useEffect(() => {
    if (!ask || ask.key !== pageKey) {
      pendingSharp.current?.close();
      pendingSharp.current = null;
      setSharp(null);
      return;
    }
    let cancelled = false;
    render(page, ask.scale, hash, ask.rect)
      .then(({ bitmap, scale, rect }) => {
        if (cancelled) return bitmap.close();
        pendingSharp.current?.close();
        pendingSharp.current = bitmap;
        setSharp({
          key: ask.key,
          rect,
          scale,
          bitmapWidth: bitmap.width,
          bitmapHeight: bitmap.height,
        });
      })
      .catch(() => {
        // A region that will not draw is not worth an error screen. The
        // backdrop is still there and still correct — just soft — which is
        // exactly what the viewer looked like before this existed.
      });
    return () => {
      cancelled = true;
    };
  }, [ask, pageKey, page, hash, render]);

  /**
   * Put the pixels in the canvas the commit above just created, before paint.
   */
  useLayoutEffect(() => {
    const bitmap = pendingSharp.current;
    const canvas = sharpCanvasRef.current;
    if (!bitmap || !canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    pendingSharp.current = null;
  }, [sharp]);

  /** An ImageBitmap holds its memory until it is closed, mounted or not. */
  useEffect(() => {
    return () => {
      pendingSharp.current?.close();
      pendingSharp.current = null;
    };
  }, []);

  /**
   * ── Thumbnails ────────────────────────────────────────────────────────────
   *
   * One small render per sheet, in page order, and ONLY while somebody has the
   * grid open. The worker is a single queue, so a background pass over a
   * 40-sheet set would sit in front of the sharp patch for the sheet being
   * read — the user would see the drawing go soft every time they opened the
   * sheet picker, which is a strange thing for a picker to do.
   *
   * Sequential rather than parallel for the same reason, and because the
   * pictures are worth more early than all at once: the grid fills in from the
   * top while it is being looked at.
   *
   * `done` is a ref, not state — it is a record of what has been paid for, and
   * putting it in state would restart this effect on every arrival.
   */
  const thumbnailsDone = useRef<Set<number>>(new Set());
  useEffect(() => {
    thumbnailsDone.current = new Set();
  }, [hash]);

  useEffect(() => {
    if (!drawThumbnails || !onThumbnail) return;
    if (loading || error || pageCount === 0) return;
    let cancelled = false;

    (async () => {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (cancelled) return;
        if (thumbnailsDone.current.has(pageNumber)) continue;
        try {
          /*
            Sized from the sheet rather than from a fixed scale. Drawings come
            in wildly different sizes — a 36x24 E-sheet beside an 8.5x11 detail
            — and one scale for both gives a grid of one enormous picture and
            one stamp. Falls back to the whole-sheet render scale divided down
            when the page size is not known yet.
          */
          const pageWidthPoints =
            canvasSize.width > 0 && drawnScale > 0
              ? canvasSize.width / drawnScale
              : 0;
          const scale =
            pageWidthPoints > 0 ? THUMBNAIL_PIXELS / pageWidthPoints : 0.12;
          const { bitmap } = await render(pageNumber, scale, hash);
          if (cancelled) {
            bitmap.close();
            return;
          }
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          bitmap.close();
          thumbnailsDone.current.add(pageNumber);
          onThumbnail(pageNumber, canvas.toDataURL("image/jpeg", 0.75));
        } catch {
          // A sheet that will not draw small is not worth an error anywhere.
          // Its cell keeps its placeholder and its name, which is still enough
          // to click. Marked done so the grid does not retry it for ever.
          thumbnailsDone.current.add(pageNumber);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    drawThumbnails,
    onThumbnail,
    loading,
    error,
    pageCount,
    hash,
    render,
    canvasSize.width,
    drawnScale,
  ]);

  // Pull the page's text once, for scale detection.
  useEffect(() => {
    if (loading || error || pageCount === 0) return;
    if (detected.current.has(page)) return;
    detected.current.add(page);
    let cancelled = false;

    pageText(page, hash)
      .then(text => {
        if (!cancelled) onSheetVisible(page, text);
      })
      // Detection is a convenience. A page whose text will not extract simply
      // stays unscaled until someone sets it.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [page, pageCount, loading, error, pageText, hash, onSheetVisible]);

  const go = useCallback(
    (to: number) => {
      onPage(Math.min(Math.max(to, 1), pageCount || 1));
    },
    [pageCount, onPage]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      )
        return;
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown"
      ) {
        e.preventDefault();
        go(page + 1);
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        go(page - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(1);
      } else if (e.key === "End") {
        e.preventDefault();
        go(pageCount);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page, pageCount]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">
            {doc.filename} could not be opened
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </div>
    );
  }

  /**
   * The zoom cluster, sent up to the one top bar.
   *
   * These controls belong to this component — only it knows the zoom — but
   * they belong ON the bar with everything else, because a second row of
   * chrome above the drawing is a row of drawing gone. Same portal trick the
   * trace layer already uses for its own chrome, for the same reason: the
   * thing that owns the state is not always the thing that owns the space.
   */
  const zoomControls = (
    <div className="flex items-center gap-1">
      {rendering && !loading && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Drawing…
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => zoomByStep(1 / BUTTON_ZOOM_STEP)}
        disabled={loading}
        aria-label="Zoom out"
        title="Zoom out (−)"
      >
        <Minus className="w-4 h-4" />
      </Button>
      <span
        className="font-mono text-xs tabular-nums min-w-[3.5rem] text-center text-muted-foreground"
        aria-live="polite"
        aria-label={`Zoom ${formatZoom(view.zoom)}`}
      >
        {loading ? "—" : formatZoom(view.zoom)}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => zoomByStep(BUTTON_ZOOM_STEP)}
        disabled={loading}
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        <Plus className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={fitToView}
        disabled={loading}
        title="Fit the whole sheet (0)"
      >
        <Maximize2 className="w-3.5 h-3.5" /> Fit
      </Button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {controlsTarget ? (
        createPortal(zoomControls, controlsTarget)
      ) : (
        /* No bar to portal into — keep the controls usable in place. */
        <div className="flex items-center justify-end px-3 py-2 border-b border-border bg-card shrink-0">
          {zoomControls}
        </div>
      )}
      <div
        ref={viewportRef}
        className={cn(
          "flex-1 overflow-hidden bg-muted/20 min-h-0 relative",
          panning ? "cursor-grabbing" : spaceHeld ? "cursor-grab" : null
        )}
        onPointerDown={beginPlainPan}
      >
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Opening {doc.filename}…</p>
            <p className="text-xs">Large drawings can take a few seconds.</p>
          </div>
        ) : (
          /*
            ONE transform, wrapping the page and the overlay together.

            This is the load-bearing decision of the whole zoom feature: the
            drawing and the marks on it cannot drift apart, because there is no
            arrangement of numbers in which they are scaled differently. They
            are one box. Transforming them separately would work on the first
            try and go wrong on the tenth, and the symptom — every stamp sitting
            an inch off its symbol — looks exactly like corrupted data rather
            than a display bug.

            Clicks need no adjustment for any of this: TraceLayer's
            `pointerToPage` measures the overlay's real on-screen rectangle,
            which already reflects the transform.
          */
          <div
            className="absolute top-0 left-0 origin-top-left will-change-transform"
            style={{
              /*
                Snapped to whole DEVICE pixels, not left as the raw offset.

                A composited layer translated by half a pixel is resampled, and
                a drawing resampled by half a pixel is a drawing of grey lines.
                The shift this applies is at most half a screen pixel, so the
                view does not move as far as anyone can see — and it is what
                lets the sharp patch inside be pixel-for-pixel exact, because
                the patch's own offset is measured from here.

                view.x and view.y themselves are NOT rounded: every measurement
                and every hit test reads them, and a rounded pan would drift.
              */
              transform: `translate(${snapToDevicePixel(view.x, dpr)}px, ${snapToDevicePixel(
                view.y,
                dpr
              )}px) scale(${view.zoom})`,
            }}
          >
            <div className="relative w-fit">
              <canvas
                ref={canvasRef}
                className="rounded-lg shadow-lg bg-white block"
              />
              {/*
                The sharp patch, laid over the backdrop.

                Its POSITION and SIZE are given in backdrop-canvas pixels —
                the rect in page points multiplied by the scale the backdrop
                was drawn at. That is what makes it land exactly right under
                any zoom or pan without knowing about either: it is inside the
                same single transform as the drawing and the marks, so the
                three cannot drift apart. Only its pixel DENSITY is higher,
                which is the entire trick.

                The backdrop stays underneath rather than being replaced, so
                there is never a blank hole while a region is being drawn, and
                so a sheet at rest looks the same as it always did.
              */}
              {sharp && sharp.key === pageKey && (
                <canvas
                  ref={sharpCanvasRef}
                  aria-hidden
                  className="absolute block pointer-events-none"
                  style={{
                    /*
                      Position SNAPPED to the device grid, size taken from the
                      BITMAP. Both halves are needed for one bitmap pixel to
                      land on one device pixel, and both were missing.

                      Size: the box is the bitmap's own pixels converted back
                      through the scale it was actually drawn at, so the ratio
                      is exactly one rather than nearly one. Reading the scale
                      that came BACK is what keeps a region the worker had to
                      draw coarser than asked on the right rectangle.

                      Position: rect.x times drawnScale is the true offset;
                      rounding it to a whole device pixel moves the patch by
                      under half a screen pixel, and is the difference between
                      a crisp hairline and a grey one.
                    */
                    left: snapToDevicePixel(
                      sharp.rect.x * drawnScale,
                      view.zoom * dpr
                    ),
                    top: snapToDevicePixel(
                      sharp.rect.y * drawnScale,
                      view.zoom * dpr
                    ),
                    width: (sharp.bitmapWidth / sharp.scale) * drawnScale,
                    height: (sharp.bitmapHeight / sharp.scale) * drawnScale,
                  }}
                />
              )}
              {canvasSize.width > 0 &&
                overlay?.({
                  ...canvasSize,
                  zoom: view.zoom,
                  /*
                    The scale the page was ACTUALLY drawn at, reported by the
                    worker with the bitmap — no longer the constant. Both
                    `snapshotPage` calls further down this file now read the
                    same fact from `pageCanvasScale`, so there is nothing left
                    that has to be kept in step by hand.

                    It still happens to equal RENDER_SCALE, because nothing
                    asks for a region yet. That is a fact about today, not
                    something to rely on.
                  */
                  renderScale: drawnScale,
                  canvas: canvasRef.current,
                  chromeTarget: chromeLayer,
                })}
            </div>
          </div>
        )}

        {/* Screen-space chrome, outside the transform. Click-through by
            default; anything inside it that needs clicking turns pointer
            events back on for itself. */}
        <div
          ref={setChromeLayer}
          className="absolute inset-0 pointer-events-none z-10"
        />
      </div>
    </div>
  );
}

/**
 * Where the sticky trace ends are remembered — PER BID. Machine-only name.
 *
 * ── It used to be one key for every job, and that was the bug ──────────────
 * Fixed 2026-09-20. `helixbid:trace-ends` carried no bid, so the pickers a
 * job was left on became the pickers the NEXT job opened with — a different
 * building, possibly months later, with "Panel → Receptacle" already loaded
 * and nothing on screen having been decided for that job.
 *
 * Sticky is right and stays: § 5d argues it from "thirty homeruns off one
 * panel", and thirty homeruns is one decision rather than sixty. But that is
 * an argument about runs WITHIN a job. It never reached across jobs, and
 * across jobs is where a stale end is least likely to be noticed, because
 * nothing about opening a new bid suggests a picker is already set.
 *
 * So a new bid starts at the trap-2 default — `Distribution → not answered` —
 * which counts no verticals until somebody says what is there.
 *
 * The old global key is deliberately left where it is rather than deleted.
 * Nothing reads it, it holds no work, and removing somebody's stored data to
 * tidy up is not worth the line.
 */
const traceEndsKey = (bidId: number) => `helixbid:trace-ends:${bidId}`;

// ── The page ─────────────────────────────────────────────────────────────────

/**
 * A click that has been made and not yet confirmed by the server.
 *
 * Carries enough to DRAW the mark — the count it belongs to, and the Category
 * that decides its shape — as well as enough to send it. Before this existed
 * the queue held only coordinates, because nothing rendered it.
 */
type PendingMark = {
  /** Negative, so a mark awaiting the server cannot collide with a real id. */
  key: number;
  sheetId: number;
  groupId: number;
  name: string;
  assemblyId: number | null;
  assemblyCategory: string | null;
  x: number;
  y: number;
  /** In flight. Still drawn, no longer waiting to be sent. */
  sent: boolean;
};

/**
 * How long a click may sit unsent.
 *
 * A CEILING, not a quiet period. It used to be restarted by every click, which
 * meant a fast run of forty marks sent nothing until the hand stopped.
 */
const FLUSH_AFTER_MS = 700;

export default function TakeoffPage({
  bidId,
  onBack,
}: {
  bidId: number;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: bid } = trpc.bids.get.useQuery({ id: bidId });
  const { data: docs = [], isLoading } = trpc.bidPdfs.list.useQuery({ bidId });

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  /**
   * The queue as it is right now, for reading outside render.
   *
   * Retry needs the failed job's File, and a state updater is the wrong place
   * to look one up — updaters must be pure and React invokes them twice in
   * development to enforce it.
   */
  const uploadsRef = useRef<UploadJob[]>([]);
  uploadsRef.current = uploads;
  /** The transfer in flight, so it can be cancelled. */
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  /** Speed and time-left for each upload row. See lib/useUploadSpeeds.ts. */
  const readingFor = useUploadSpeeds();
  /** Cancels an upload that is going up in pieces. See cancelUpload. */
  const abortRef = useRef<AbortController | null>(null);
  const uploading = isBusy(uploads);
  const [confirmRemove, setConfirmRemove] = useState<Document | null>(null);
  const [materialsListOpen, setMaterialsListOpen] = useState(false);
  /**
   * Which sheets state NOT TO SCALE, by sheet id.
   *
   * Per sheet rather than one flag: a single shared value carries the last
   * detection's answer onto whatever sheet is opened next, so a diagram marked
   * N.T.S. makes the plan after it claim the same thing.
   */
  const [notToScaleBySheet, setNotToScaleBySheet] = useState<
    Record<number, boolean>
  >({});

  // ── Layout: how much of the screen the drawing gets ───────────────────────
  /**
   * Which side panels are open, how wide, and whether focus mode is on.
   *
   * The whole point of this arrangement is that the drawing gets much bigger.
   * Measured on a 1536x791 screen: the drawing was 44% of it with both panels
   * docked and a tool bar underneath, and is about 83% with both folded — so
   * folding a panel is not a tidiness feature, it is most of the screen.
   *
   * Read from storage on the first render rather than in an effect, so the
   * screen never flashes the wrong arrangement and then corrects itself.
   */
  const [panels, setPanels] = useState<PanelState>(() => {
    if (typeof window === "undefined") return PANELS_DEFAULT;
    try {
      return parsePanelState(window.localStorage.getItem(PANELS_STORAGE_KEY));
    } catch {
      return PANELS_DEFAULT;
    }
  });
  const updatePanels = useCallback(
    (next: PanelState | ((current: PanelState) => PanelState)) => {
      setPanels(current => {
        const resolved = typeof next === "function" ? next(current) : next;
        try {
          window.localStorage.setItem(
            PANELS_STORAGE_KEY,
            serialisePanelState(resolved)
          );
        } catch {
          // Private browsing. The arrangement simply does not stick.
        }
        return resolved;
      });
    },
    []
  );
  const focusMode = isFocusMode(panels);

  /**
   * Focus mode: one key on, the same key off.
   *
   * Its own control rather than "collapse two things", because mid-takeoff the
   * point is to get the most drawing without hunting for two separate
   * chevrons — and to get it all back the same way.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        updatePanels(toggleFocus);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [updatePanels]);

  /** Where PlanPane puts its zoom controls — see its `controlsTarget`. */
  const [zoomSlot, setZoomSlot] = useState<HTMLElement | null>(null);

  /**
   * Sheet thumbnails, and the switch that pays for them.
   *
   * Drawn only while the picker is open (see SheetChip), because every one is
   * a real page render and the worker draws one thing at a time.
   */
  const [browsingSheets, setBrowsingSheets] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const rememberThumbnail = useCallback(
    (pageNumber: number, dataUrl: string) => {
      setThumbnails(current =>
        current[pageNumber] === dataUrl
          ? current
          : { ...current, [pageNumber]: dataUrl }
      );
    },
    []
  );

  // ── Tracing (phase 2b) ────────────────────────────────────────────────────
  /**
   * Calibration is its own mode, not a kind of tracing.
   *
   * Exactly two points, nothing reaches the bid, and finishing changes what
   * every other measurement on the sheet means.
   */
  const [calibrating, setCalibrating] = useState(false);
  /**
   * Whether the overlay opens on SETTING a scale or on CHECKING the one there.
   *
   * Both come from the single scale control now: "Measure it" sets, "Check it"
   * and picking from the list verify. Held here rather than inside
   * CalibrateLayer because the layer is remounted per sheet and the intent
   * belongs to the click that opened it.
   */
  const [calibrateMode, setCalibrateMode] = useState<"set" | "check">("set");
  /**
   * Bumped on EVERY "Measure it" / "Check it", and used as CalibrateLayer's
   * key, so each request starts a fresh layer in the mode asked for.
   *
   * ── The fault, 2026-09-25 ─────────────────────────────────────────────
   * The layer reads the mode once, when it mounts. Clicking the toolbar's
   * "Check it" while "Measure it" was already open changed the mode here and
   * nothing there: the bar still said "Measure the scale", so the estimator's
   * two points and length were a MEASUREMENT, and Enter re-set the scale —
   * which clears any check — and then asked for a check. What they did as a
   * check ended as "not checked". Reproduced locally before the fix.
   */
  const [calibrateSession, setCalibrateSession] = useState(0);
  const startCalibrating = (mode: "set" | "check") => {
    setCalibratePoints([]);
    setCalibrateMode(mode);
    setCalibrateSession(n => n + 1);
    setCalibrating(true);
    setArmedGroup(null);
  };
  const [calibratePoints, setCalibratePoints] = useState<PagePoint[]>([]);

  /**
   * What the next run starts and ends at. STICKY: forty runs is eighty ends,
   * and nobody answers eighty questions — so this is set once and every run
   * traced afterwards carries it, exactly like the stamp tool staying armed.
   *
   * The START defaults to carrying on at run height, which is a defence rather
   * than a convenience: a run continuing through a junction box must not
   * collect a phantom drop into it and a rise back out, which is four feet of
   * pipe per box that does not exist.
   *
   * Kept in localStorage under the same prefix as its siblings — the prefix is
   * machine-only and CLAUDE.md keeps it that way — and keyed PER BID, for the
   * reason written on `traceEndsKey`.
   *
   * Reading the key in the initialiser is enough, with no effect watching
   * `bidId`, because `BidRenderShell` mounts this page keyed on the bid — a
   * different bid is a different component instance. Do not add a defensive
   * effect here: it would re-read on a bid change that cannot happen, and on
   * nothing else.
   */
  const [traceEnds, setTraceEnds] = useState<{
    startKind: string | null;
    endKind: string | null;
  }>(() => {
    try {
      const held = window.localStorage.getItem(traceEndsKey(bidId));
      if (held) return JSON.parse(held);
    } catch {
      // A blocked or corrupt store is not a reason to fail to trace.
    }
    return { startKind: DISTRIBUTION_KIND, endKind: null };
  });

  /**
   * The armed ends, named, for the readout over the drawing.
   *
   * The query is the one `EndKindSelect` already makes, so this shares its
   * cache entry rather than costing a second request — and sharing it is also
   * what stops the pill and the picker naming the same key differently while
   * one of them is still loading.
   *
   * Types may not have arrived yet, and that is fine: `traceEndsLabel` falls
   * through to the shipped list, which covers everything except a type this
   * company invented. Worst case for one frame is a humanised slug, never a
   * blank — a readout that disappears while loading is a readout nobody trusts.
   */
  const { data: heightsForBid } = trpc.takeoffHeights.forBid.useQuery({
    bidId,
  });
  const armedEndsLabel = useMemo(
    () => traceEndsLabel(traceEnds, heightsForBid?.types),
    [traceEnds, heightsForBid?.types]
  );

  const updateTraceEnds = useCallback(
    (next: { startKind: string | null; endKind: string | null }) => {
      setTraceEnds(next);
      try {
        window.localStorage.setItem(traceEndsKey(bidId), JSON.stringify(next));
      } catch {
        // Remembering it is a convenience; tracing still works without it.
      }
    },
    [bidId]
  );
  /**
   * A gated measuring tool is under the pointer or holds focus.
   *
   * The scale chip is plain until this or calibration is true. On a
   * specifications or legend sheet there is nothing to measure, so a standing
   * warning there is a warning about a non-problem — and one learned to be
   * ignored is worse than none at all.
   */
  const [reachingForMeasure, setReachingForMeasure] = useState(false);

  const [tracing, setTracing] = useState(false);
  const [tracePathType, setTracePathType] = useState<RunPathType>("conduit");
  const [tracePoints, setTracePoints] = useState<PagePoint[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  /** The server row this trace is autosaving into, once one exists. */
  const draftRunId = useRef<number | null>(null);
  /** How many points the server has. Drives the unsaved-work warning. */
  const savedPointCount = useRef(0);
  const [recoverable, setRecoverable] =
    useState<ReturnType<typeof loadDraft>>(null);

  // ── Stamping (phase 2c, on groups since phase 6) ──────────────────────────
  /**
   * What the stamp tool is holding. Chosen once, then click, click, click.
   *
   * A GROUP rather than an assembly since phase 6, and that is the whole shape
   * of the change: the tool no longer needs the library to have heard of the
   * thing being counted. An assembly is armed by finding or making its group
   * (takeoffGroups.forAssembly); a plain count is armed by making one. After
   * that the two are the same path — see server/routers/takeoffGroupsRouter.ts.
   */
  /**
   * The kind of run each tool is holding, one per path type.
   *
   * Kept per path type rather than as a single armed value so switching
   * between conduit and cable does not lose either — the decision is made once
   * and spent many times, which is the whole point of a palette (D3(a)).
   * Null means nothing armed yet, and the first trace opens the picker.
   */
  const [armedRunType, setArmedRunType] = useState<{
    conduit: { id: number; label: string } | null;
    cable: { id: number; label: string } | null;
  }>({ conduit: null, cable: null });

  const [armedGroup, setArmedGroup] = useState<{
    groupId: number;
    label: string;
    /** Null for a plain count. Kept for the legend panel's active-row mark. */
    assemblyId: number | null;
  } | null>(null);
  const [selectedStampId, setSelectedStampId] = useState<number | null>(null);
  /** Where a click in the counted-items list sent the viewer. */
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null
  );
  const [capturingSymbol, setCapturingSymbol] = useState(false);
  /** The crop taken from the page, awaiting a name. */
  const [pendingCapture, setPendingCapture] = useState<{
    thumbnail: string | null;
  } | null>(null);
  /**
   * Clicks not yet confirmed by the server — drawn here, mirrored to storage.
   *
   * State as well as a ref, because these are now RENDERED. The ref is what the
   * flush reads when its timer fires, and both are written by `setPending` so
   * the ref can never be a render behind the drawing.
   */
  const [pendingMarks, setPendingMarks] = useState<PendingMark[]>([]);
  const pendingStamps = useRef<PendingMark[]>([]);
  const setPending = useCallback((next: PendingMark[]) => {
    pendingStamps.current = next;
    setPendingMarks(next);
  }, []);
  const nextPendingKey = useRef(-1);
  /** Which layers are showing. Null until a sheet's contents are known. */
  const [layerState, setLayerState] = useState<LayerState | null>(null);
  const hadSystem = useRef<Set<string>>(new Set());
  const hadLocation = useRef<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement | null>(null);

  const doc = docs.find(d => d.id === selectedDocId) ?? docs[0] ?? null;

  /** A different plan is a different set of pictures. */
  useEffect(() => {
    setThumbnails({});
  }, [doc?.id]);

  const { data: sheets = [], isLoading: sheetsLoading } =
    trpc.bidPdfs.sheets.useQuery(
      { bidPdfId: doc?.id ?? 0 },
      { enabled: Boolean(doc) }
    );
  const activeSheet = sheets.find(s => s.pageNumber === page) ?? null;

  /**
   * A sheet changed — usually its scale.
   *
   * Two queries, not one, and forgetting the second is a bug that shipped:
   * `measurability` is derived from the sheet's scale but cached separately, so
   * refreshing only the sheet list updated the scale control while leaving the
   * "no scale set" warning on screen reading a stale answer. The user had set
   * the scale and the app still said they had not.
   *
   * Anything else deriving from a sheet belongs here too.
   */
  const refreshSheets = () => {
    if (doc) void utils.bidPdfs.sheets.invalidate({ bidPdfId: doc.id });
    void utils.takeoffRuns.measurability.invalidate();
    /*
      A sheet's SCALE is what every traced length on it is worked out from,
      so a sheet refresh is also a runs refresh. Found 2026-09-25: after a
      scale changed and changed back, the traced-footage panel kept showing
      lengths at the in-between scale — 115.74 ft of 1/2" EMT against the
      true 111.12 ft — until the page was reloaded. Same class as the
      counted-items panel in CLAUDE.md: a derived number in a query the
      mutation never told to let go.
    */
    refreshRuns();
  };

  const createTicket = trpc.bidPdfs.createUploadTicket.useMutation();
  const confirmAttach = trpc.bidPdfs.confirmAttach.useMutation();
  // The pieces path, for a set too large to send as one request. See
  // client/src/lib/multipartUpload.ts.
  const startMultipart = trpc.bidPdfs.createMultipartUpload.useMutation();
  const signUploadParts = trpc.bidPdfs.signUploadParts.useMutation();
  const completeMultipart = trpc.bidPdfs.completeMultipartUpload.useMutation();
  const abortMultipart = trpc.bidPdfs.abortMultipartUpload.useMutation();

  const setPageCount = trpc.bidPdfs.setPageCount.useMutation({
    onSuccess: () => void utils.bidPdfs.list.invalidate({ bidId }),
  });

  const remove = trpc.bidPdfs.remove.useMutation({
    onSuccess: () => {
      toast.success("Plan removed from this bid.");
      setSelectedDocId(null);
      setPage(1);
      void utils.bidPdfs.list.invalidate({ bidId });
    },
    onError: error => toast.error(error.message),
  });

  /**
   * What removing the plan in the confirm dialog would delete.
   *
   * Fetched fresh each time the dialog opens, and the delete button waits for
   * it, so nobody confirms a removal without seeing how much takeoff goes with
   * the plan. See references/takeoff-spec.md, row V3.
   */
  const removalImpact = trpc.bidPdfs.removalImpact.useQuery(
    { id: confirmRemove?.id ?? 0 },
    { enabled: confirmRemove !== null, staleTime: 0, retry: 1 }
  );
  const removalChecking =
    confirmRemove !== null &&
    (removalImpact.isFetching ||
      (removalImpact.isPending && !removalImpact.isError));
  const removalWarning = confirmRemove
    ? describePlanRemoval(
        confirmRemove.filename,
        removalImpact.isError ? null : (removalImpact.data ?? null)
      )
    : null;

  const ensureSheets = trpc.bidPdfs.ensureSheets.useMutation({
    onSuccess: refreshSheets,
  });

  const detectScale = trpc.bidPdfs.detectSheetScale.useMutation({
    onSuccess: (result, { id }) => {
      setNotToScaleBySheet(prev => ({
        ...prev,
        [id]: Boolean(result.notToScale),
      }));
      refreshSheets();
    },
  });

  const renameSheet = trpc.bidPdfs.renameSheet.useMutation({
    // Optimistic: a rename is a one-field edit and must land instantly.
    onMutate: async ({ id, name }) => {
      if (!doc) return {};
      await utils.bidPdfs.sheets.cancel({ bidPdfId: doc.id });
      const snapshot = utils.bidPdfs.sheets.getData({ bidPdfId: doc.id });
      utils.bidPdfs.sheets.setData({ bidPdfId: doc.id }, old =>
        old?.map(s =>
          s.id === id ? { ...s, name, nameSource: "user" as const } : s
        )
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      if (context?.snapshot && doc) {
        utils.bidPdfs.sheets.setData({ bidPdfId: doc.id }, context.snapshot);
      }
      toast.error(error.message);
    },
    onSettled: refreshSheets,
  });

  /**
   * Put a scale mutation's saved row into the sheet list NOW.
   *
   * The scale chip reads this list, and used to change only when the refetch
   * behind `refreshSheets` landed — a whole round trip after the save, in
   * which a confirmed check still read "not checked" (2026-09-25; see
   * @/lib/sheetScaleCache). Cancelling first matters: a fetch already in
   * flight read the row BEFORE this save, and would otherwise land after this
   * write and put the old value back. The refetch still runs afterwards, so
   * anything else on the row catches up as before.
   */
  type SheetView = (typeof sheets)[number];
  const writeSavedSheet = async (saved: SheetView) => {
    if (!doc) return;
    await utils.bidPdfs.sheets.cancel({ bidPdfId: doc.id });
    utils.bidPdfs.sheets.setData({ bidPdfId: doc.id }, old =>
      withSavedSheet(old, saved)
    );
  };

  const setSheetScale = trpc.bidPdfs.setSheetScale.useMutation({
    onSuccess: async sheet => {
      // Plain words, matching the chip — "Scale set to 1:64.015002" is a
      // confirmation nobody can read back to check.
      toast.success(
        `Scale set to ${sheet.scaleRatio === null ? "none" : describeScale(sheet.scaleRatio)}.`
      );
      await writeSavedSheet(sheet);
      refreshSheets();
    },
    onError: error => toast.error(error.message),
  });

  const confirmSheetScale = trpc.bidPdfs.confirmSheetScale.useMutation({
    // Optimistic: "checked" shows the instant Enter is pressed, and is put
    // back if the save fails — a failed confirm must never read as checked.
    onMutate: async ({ id }) => {
      if (!doc) return {};
      await utils.bidPdfs.sheets.cancel({ bidPdfId: doc.id });
      const snapshot = utils.bidPdfs.sheets.getData({ bidPdfId: doc.id });
      utils.bidPdfs.sheets.setData({ bidPdfId: doc.id }, old =>
        withSheetChecked(old, id, new Date())
      );
      return { snapshot };
    },
    onSuccess: async sheet => {
      toast.success("Scale checked.");
      await writeSavedSheet(sheet);
    },
    onError: (error, _vars, context) => {
      if (context?.snapshot && doc) {
        utils.bidPdfs.sheets.setData({ bidPdfId: doc.id }, context.snapshot);
      }
      toast.error(error.message);
    },
    onSettled: refreshSheets,
  });

  const clearSheetScale = trpc.bidPdfs.clearSheetScale.useMutation({
    onSuccess: async sheet => {
      await writeSavedSheet(sheet);
      refreshSheets();
    },
    onError: error => toast.error(error.message),
  });

  const handleDocumentReady = useCallback(
    (info: {
      pageCount: number;
      outline: { pageNumber: number; title: string }[];
    }) => {
      if (!doc) return;
      ensureSheets.mutate({
        bidPdfId: doc.id,
        pageCount: info.pageCount,
        outline: info.outline,
      });
    },
    [doc?.id]
  );

  // ── Tracing: queries, autosave, recovery ──────────────────────────────────

  const { data: measurability } = trpc.takeoffRuns.measurability.useQuery(
    { sheetId: activeSheet?.id ?? 0 },
    { enabled: Boolean(activeSheet) }
  );
  const { data: runs = [] } = trpc.takeoffRuns.listForSheet.useQuery(
    { sheetId: activeSheet?.id ?? 0 },
    { enabled: Boolean(activeSheet) }
  );
  const { data: totals } = trpc.takeoffRuns.totals.useQuery({ bidId });

  /**
   * Why tracing is off, in the words a disabled button needs.
   *
   * Null when tracing is available. Says "no scale set" rather than naming
   * calibration, because calibration does not exist yet — this wants revisiting
   * when it does, since there will then be two ways out rather than one.
   */
  const traceBlockedReason = useMemo(() => {
    if (!measurability) return "Checking this sheet…";
    if (measurability.ok) return null;
    return measurability.reason === "not-to-scale"
      ? "This sheet is marked not to scale — set a scale by hand to trace on it"
      : "No scale set for this sheet — set one to trace on it";
  }, [measurability]);

  const refreshRuns = useCallback(() => {
    if (activeSheet)
      void utils.takeoffRuns.listForSheet.invalidate({
        sheetId: activeSheet.id,
      });
    void utils.takeoffRuns.totals.invalidate({ bidId });
    /*
      The bridge counts RUNS, so it goes stale on anything that touches one —
      tracing, deleting, or answering the branch-wiring question.

      It belongs HERE rather than on the one mutation that came to mind, which
      is the lesson CLAUDE.md draws from the counted-items panel: a query added
      to a screen that already has mutations goes into the screen s single
      refresh helper, or it confidently shows the drawing as it was a minute
      ago. Keyed by BID while the panel is per SHEET, deliberately — a run
      traced on another sheet changes what this type would send.
    */
    void utils.takeoffRunTypes.bridgeForBid.invalidate({ bidId });
  }, [utils, activeSheet?.id, bidId]);

  const { data: stamps = [] } = trpc.takeoffStamps.listForSheet.useQuery(
    { sheetId: activeSheet?.id ?? 0 },
    { enabled: Boolean(activeSheet) }
  );
  const { data: symbols = [] } = trpc.takeoffStamps.symbols.useQuery();
  const { data: allAssemblies = [] } = trpc.assemblies.list.useQuery();

  /**
   * The catalog, for the run-type pickers.
   *
   * Fetched here rather than inside the picker because React Query dedupes by
   * key and the Count picker's materials will want the same rows — one request
   * either way, and the page is where the other library lists already live.
   */
  const { data: allMaterials = [] } = trpc.materials.list.useQuery();

  const refreshStamps = useCallback(() => {
    if (activeSheet) {
      void utils.takeoffStamps.listForSheet.invalidate({
        sheetId: activeSheet.id,
      });
      void utils.takeoffStamps.countedItems.invalidate({
        sheetId: activeSheet.id,
      });
    }
    /*
      The bridge reads a count's whole-bid tally, so it goes stale on a mark.

      Not optional, and the symptom is quiet: without this, the send control
      keeps offering the number it saw when the page loaded, and the line under
      the list goes on saying "every priced count is on the bid" while a count
      sits there waiting. Both are confidently wrong rather than blank, which is
      the worse kind.

      It is invalidated on EVERY mark change rather than only on the first,
      because the number in "Send 14 to bid" has to be the number that will
      actually go over. Bid-wide, so it is keyed by bid rather than by sheet —
      marks on another sheet move it too.

      Found by looking at the running app: the tests call the router directly
      and so never see a stale cache.
    */
    void utils.takeoffGroups.list.invalidate({ bidId });
  }, [utils, activeSheet?.id, bidId]);

  const dropStamps = trpc.takeoffStamps.drop.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshStamps,
  });

  /*
    Arming the tool, in two flavours that end in the same state.

    A library assembly finds or makes its group; a typed name makes a plain
    one. Both hand back a group, and from the click onward nothing downstream
    can tell which door was used — which is the point, and is why the level-1
    path is not a second stamping mode with its own queue and its own bugs.
  */
  /** The palette: shipped types and this contractor's own, in one list. */
  const runTypes = trpc.takeoffRunTypes.list.useQuery(
    { includeArchived: false },
    { staleTime: 60_000 }
  );
  const createRunType = trpc.takeoffRunTypes.create.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => runTypes.refetch(),
  });
  const updateRunType = trpc.takeoffRunTypes.update.useMutation({
    onError: e => toast.error(e.message),
  });

  /**
   * Save what a run type is made of, and follow the fork when there is one.
   *
   * ── Two things have to move, not one ──────────────────────────────────────
   * Editing a SHIPPED type forks it server-side, so the id that comes back is
   * a different row from the one that was edited. If the armed type is not
   * re-pointed at the fork, the next six runs are traced under the shipped row
   * the user has just decided is not what they wanted — the specification
   * would be saved and ignored, which looks exactly like it not saving.
   *
   * Runs are refreshed too, because a run reads its type's LIVE label: renaming
   * a type renames every run traced under it, and the panel is where that shows.
   */
  const saveRunType = useCallback(
    async (id: number, patch: RunTypePatch) => {
      const result = await updateRunType.mutateAsync({ id, ...patch });
      await runTypes.refetch();
      refreshRuns();

      setArmedRunType(previous => {
        const next = { ...previous };
        for (const key of ["conduit", "cable"] as const) {
          const armed = previous[key];
          if (!armed) continue;
          if (armed.id === id || armed.id === result.id)
            next[key] = { id: result.id, label: patch.label };
        }
        return next;
      });

      toast.success(
        result.forked
          ? `Saved as your own "${patch.label}" — the one BidRidge ships is untouched.`
          : `Saved. Every run of "${patch.label}" says so.`
      );
    },
    [updateRunType, runTypes, refreshRuns]
  );

  /**
   * What each run type is made of, by id.
   *
   * Built once here rather than looked up per row: the palette is already on
   * this screen for the toolbar, so a run row costs a Map hit instead of a
   * fetch. `runTypeSpec` is the one place that turns two materials and a count
   * into a sentence — see shared/takeoffCounts.ts on why it is not written out
   * at each surface.
   */
  const specByRunType = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const type of runTypes.data ?? []) map.set(type.id, runTypeSpec(type));
    return map;
  }, [runTypes.data]);

  /**
   * What one circuit of each type pulls, so a circuit added to a run starts as
   * what the run already says it is.
   *
   * Listed by hand rather than passing the whole type, because this feeds a
   * SCREEN: the panel takes what it renders and nothing arrives there because
   * it happened to be on the row (CLAUDE.md § "Where to be structural, and
   * where to be explicit").
   */
  const circuitDefaultsByRunType = useMemo(() => {
    const map = new Map<
      number,
      { conductorCount: number | null; groundCount: number | null }
    >();
    for (const type of runTypes.data ?? []) {
      map.set(type.id, {
        conductorCount: type.conductorCount,
        groundCount: type.groundCount,
      });
    }
    return map;
  }, [runTypes.data]);

  /** Say what an already-traced run is. D3(b), the way to change it later. */
  const setRunTypeFor = trpc.takeoffRuns.setRunType.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      refreshRuns();
      toast.success(
        result.label
          ? `This run is a "${result.label}" now.`
          : "This run no longer says what it is."
      );
    },
  });

  /**
   * Say what a FINISHED run is made of — conduit, wire, how many. The server
   * finds or makes the type that says so; see shared/runRespecify.ts.
   *
   * A new type may have been made, so the palette refetches as well as the
   * runs — otherwise the row would name a type the picker has never heard of.
   */
  const respecifyRun = trpc.takeoffRuns.respecify.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      void runTypes.refetch();
      refreshRuns();
      toast.success(
        result.circuits === "several"
          ? `This run is a "${result.label}" now. It has ${result.circuitCount} circuits — set the wires on each.`
          : `This run is a "${result.label}" now.`
      );
    },
  });

  const groupForAssembly = trpc.takeoffGroups.forAssembly.useMutation({
    onError: e => toast.error(e.message),
  });
  const createGroup = trpc.takeoffGroups.create.useMutation({
    onError: e => toast.error(e.message),
  });

  /**
   * Every count on this BID, and where each one stands with the bid.
   *
   * Bid-wide on purpose, unlike `stampGroups` below, which is this sheet after
   * the Layers filter. A count marked across five sheets is one thing on the
   * bid and one line, so what the send control offers has to be the whole
   * number rather than the part of it currently on screen.
   */
  const bidCounts = trpc.takeoffGroups.list.useQuery({ bidId });

  /**
   * Whether this bid's quantities are frozen (shared/quantityLock.ts).
   *
   * Read off the count list rather than from a query of its own, because that
   * one is already invalidated on every mark change (`refreshStamps`) and on
   * every run change (`refreshRuns`). A second query would be a second thing to
   * remember to invalidate, and the one that got forgotten would leave this
   * screen promising that marks move a bid somebody has just locked.
   */
  const quantitiesLocked = bidCounts.data?.quantitiesLockedAt != null;

  const bridgeByGroup = useMemo(() => {
    const map = new Map<number, GroupBridgeState>();
    for (const row of bidCounts.data?.groups ?? []) {
      map.set(row.id, {
        bidCount: row.count,
        onBid:
          !row.sendability.sendable &&
          row.sendability.reason === "already-on-bid",
        sendable: row.sendability.sendable,
      });
    }
    return map;
  }, [bidCounts.data]);

  const sendToBid = trpc.takeoffGroups.sendToBid.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      void bidCounts.refetch();
      /*
        The warning is shown as its own message rather than folded into the
        success line, and it does not block.

        R3's rule is that a double count is VISIBLE, not impossible — a second
        line for the same assembly may be exactly what the job has. So the send
        succeeds, and the fact arrives beside it in time to be acted on. The
        standing check on the bid screen is what covers the other order, where
        the hand-added line turns up afterwards.
      */
      toast.success(
        quantitiesLocked
          ? `${result.count} on the bid, frozen at that number — this bid's ` +
              `quantities are locked, so further marks will not change it.`
          : `${result.count} on the bid. The line follows your marks from here.`
      );
      if (result.warning) toast.warning(result.warning);
    },
  });

  /** Pick the tool up. One function, so both doors leave the same state. */
  const armGroup = useCallback(
    (group: { id: number; label: string }, assemblyId: number | null) => {
      setArmedGroup({
        groupId: group.id,
        label: group.label,
        assemblyId,
      });
      toast.success(`Counting ${group.label} — click to place.`);
    },
    []
  );
  const removeStamp = trpc.takeoffStamps.remove.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshStamps,
  });
  const captureSymbol = trpc.takeoffStamps.captureSymbol.useMutation({
    onError: e => toast.error(e.message),
    onSettled: () => void utils.takeoffStamps.symbols.invalidate(),
  });
  const linkSymbol = trpc.takeoffStamps.linkSymbol.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: r =>
      toast.success(`Linked to ${r.assemblyName} — one click from now on.`),
    onSettled: () => void utils.takeoffStamps.symbols.invalidate(),
  });
  const unlinkSymbol = trpc.takeoffStamps.unlinkSymbol.useMutation({
    onError: e => toast.error(e.message),
    onSettled: () => void utils.takeoffStamps.symbols.invalidate(),
  });
  const removeSymbol = trpc.takeoffStamps.removeSymbol.useMutation({
    onError: e => toast.error(e.message),
    onSettled: () => void utils.takeoffStamps.symbols.invalidate(),
  });

  // ── Plan reader (AI co-pilot) ─────────────────────────────────────────────
  /**
   * The rasterised page, and the text pulled off it.
   *
   * Both are per page and both are captured as a side effect of the viewer
   * doing its ordinary job, so opening the reader costs nothing extra — the
   * canvas is already drawn and the text was already extracted for scale
   * detection.
   */
  const pageCanvas = useRef<HTMLCanvasElement | null>(null);
  /**
   * The scale `pageCanvas` was drawn at, captured beside the canvas itself.
   *
   * `snapshotPage` divides the canvas width by this to tell the plan reader how
   * big the sheet is in points. Read from the render that produced the canvas,
   * never from RENDER_SCALE — the moment resolution stops being fixed, a stale
   * constant reports the wrong page size and every proposed stamp lands in the
   * wrong place.
   */
  const pageCanvasScale = useRef(RENDER_SCALE);
  const pageTextByPage = useRef<Map<number, string>>(new Map());
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  /**
   * Read each sheet as it is opened, rather than on a button press.
   *
   * ── OFF until somebody turns it on, and that is a rule not a preference ────
   * This defaulted ON, and the reasoning written here at the time was that
   * "each sheet is still read at most once — the server returns a stored
   * reading unless the user asks for a re-read — so leaving it on cannot run
   * away with the bill." That argument was about the SIZE of the bill, and it
   * answered the wrong question. Opening a sheet spent the contractor's money
   * on a call they had not asked for, and they found out from the invoice.
   *
   * CLAUDE.md now states the rule plainly: a call is a button. The default is
   * `=== "on"` rather than `!== "off"` precisely so that "no saved preference"
   * means off — a browser that has never been asked has never consented.
   *
   * The cost argument has since stopped holding anyway. At one call per sheet,
   * clicking through a forty-sheet submission to find the electrical drawings
   * spent forty calls. Under the tiling work (references/ai-reader-cost.md)
   * one sheet is six, so the same click-through would spend two hundred and
   * forty and about four dollars, all of it unasked.
   *
   * Still remembered per browser rather than per account: it is a preference
   * about how this one machine works, and a contractor on a metered connection
   * in a truck may well want it off there and on at the office.
   */
  // The storage key keeps the product's old name on purpose, so a choice a
  // browser has already saved still applies.
  const [autoRead, setAutoRead] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("helixbid.planReader.autoRead") === "on";
  });
  const setAutoReadPersisted = useCallback((on: boolean) => {
    setAutoRead(on);
    try {
      window.localStorage.setItem(
        "helixbid.planReader.autoRead",
        on ? "on" : "off"
      );
    } catch {
      // Private browsing. The preference simply does not stick.
    }
  }, []);

  const handlePageRendered = useCallback(
    (pageNumber: number, canvas: HTMLCanvasElement, scale: number) => {
      pageCanvas.current = canvas;
      pageCanvasScale.current = scale;
      setRenderedPage(pageNumber);
    },
    []
  );

  /** False while the server has AI switched off (server/aiFeatures.ts). */
  const readerAvailable = useCompany().hasFeature("takeoff.copilot");

  const { data: copilot } = trpc.planCopilot.state.useQuery(
    { sheetId: activeSheet?.id ?? 0 },
    { enabled: Boolean(activeSheet) && readerAvailable }
  );

  const refreshCopilot = useCallback(() => {
    if (activeSheet)
      void utils.planCopilot.state.invalidate({ sheetId: activeSheet.id });
  }, [utils, activeSheet?.id]);

  const readSheet = trpc.planCopilot.read.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshCopilot,
  });
  const askCopilot = trpc.planCopilot.ask.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => setCopilotAnswer(result.answer),
  });
  const confirmFindings = trpc.planCopilot.confirm.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      if (result.placed > 0) {
        toast.success(
          `Placed ${result.placed} ${result.placed === 1 ? "mark" : "marks"}.`
        );
      }
      // Every refusal is shown rather than counted. A user who ticked twelve
      // and got eleven needs to know which one did not go on, and why.
      for (const reason of result.refused) toast.warning(reason);
    },
    onSettled: () => {
      refreshCopilot();
      refreshStamps();
    },
  });
  const dismissFindings = trpc.planCopilot.dismiss.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshCopilot,
  });
  const correctFinding = trpc.planCopilot.correct.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result =>
      toast.success(
        result.assemblyName
          ? `Noted — reading that as ${result.assemblyName} from now on.`
          : `Noted — reading that as “${result.symbolLabel}” from now on.`
      ),
    onSettled: refreshCopilot,
  });

  /** True once this page is drawn, so there is something to send. */
  const canRead = renderedPage === page && Boolean(activeSheet);

  const runReader = useCallback(
    (force: boolean) => {
      if (!activeSheet || !canRead) return;
      const snapshot = snapshotPage(
        pageCanvas.current,
        pageCanvasScale.current,
        copilot?.readerModel ?? PLAN_READER_FALLBACK_MODEL
      );
      if (!snapshot) {
        toast.error("The page is still drawing — give it a moment.");
        return;
      }
      readSheet.mutate({
        bidId,
        sheetId: activeSheet.id,
        pageImage: snapshot.image,
        pageText: pageTextByPage.current.get(page) ?? "",
        pageWidthPoints: snapshot.pageWidthPoints,
        pageHeightPoints: snapshot.pageHeightPoints,
        force,
      });
    },
    [activeSheet?.id, canRead, bidId, page, readSheet, copilot?.readerModel]
  );

  /**
   * Read a sheet when it is opened — this one, not the other thirty-nine.
   *
   * The whole cost-control decision in one effect: reading is driven by what
   * the estimator is actually looking at. A forty-sheet submission read up
   * front would bill forty times before anyone had seen a drawing, and most of
   * those sheets are schedules, details and civil work the electrician will
   * never take off.
   */
  const readerFired = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!readerAvailable || !autoRead || !canRead || !activeSheet) return;
    // A sheet that already has a stored reading costs nothing to show, so there
    // is nothing to fire for. `copilot` being undefined means the query has not
    // answered yet — firing then would race it and pay for a second read.
    if (copilot === undefined || copilot.runId !== null) return;
    if (readerFired.current.has(activeSheet.id)) return;
    readerFired.current.add(activeSheet.id);
    runReader(false);
  }, [
    readerAvailable,
    autoRead,
    canRead,
    activeSheet?.id,
    copilot?.runId,
    runReader,
  ]);

  /** A question is about the sheet on screen, so the answer goes with it. */
  useEffect(() => {
    setCopilotAnswer(null);
  }, [activeSheet?.id]);

  /**
   * Proposals still awaiting a decision, for drawing on the plan.
   *
   * Only the ones a user could accept: an unreadable finding is a place to look
   * rather than a mark to place, and drawing it like a pending stamp would put
   * the guess back on the drawing that the third tier exists to keep off it.
   * It is still listed in the panel, and clicking it still jumps the viewer.
   */
  const proposals = useMemo(
    () =>
      (copilot?.findings ?? [])
        .filter(
          f =>
            f.status === "proposed" &&
            f.acceptable &&
            f.x !== null &&
            f.y !== null
        )
        .map(f => ({
          id: f.id,
          label: f.assemblyName ?? f.rawLabel,
          confidence: f.confidence,
          x: f.x as number,
          y: f.y as number,
        })),
    [copilot?.findings]
  );

  /**
   * The Category of the armed count, for drawing a mark the server has not
   * seen yet.
   *
   * Looked up rather than left null because the Category decides the SHAPE
   * (shared/takeoffMarks.ts). Leave it out and the mark drawn on the click
   * changes shape when the real row arrives — reintroducing, in the fix, the
   * flicker the fix exists to remove.
   */
  const armedCategory = useMemo(() => {
    if (!armedGroup || armedGroup.assemblyId === null) return null;
    return (
      allAssemblies.find(a => a.id === armedGroup.assemblyId)?.category ?? null
    );
  }, [armedGroup, allAssemblies]);

  /**
   * Write what is still unconfirmed for one sheet to the crash mirror.
   *
   * Everything unconfirmed, in flight or not: a tab closed mid-request loses
   * the request, and those clicks exist nowhere else. `saveStampQueue` removes
   * the key when the list is empty, so this is also how the mirror is cleared.
   */
  const mirrorQueue = useCallback(
    (sheetId: number) => {
      saveStampQueue(
        sheetId,
        bidId,
        pendingStamps.current
          .filter(m => m.sheetId === sheetId)
          .map(m => ({ groupId: m.groupId, x: m.x, y: m.y }))
      );
    },
    [bidId]
  );

  const flushTimer = useRef<number | null>(null);

  /**
   * Send every click that has not been sent yet.
   *
   * Its own function rather than only a timer body, because two things must
   * not wait for the timer: the armed count changing and the sheet changing.
   * A batch goes over under ONE group id and one sheet id, so a click made
   * after the tool changed hands would otherwise be counted as the previous
   * thing — correct-looking, and wrong.
   */
  const flushStamps = useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const batch = pendingStamps.current.filter(m => !m.sent);
    if (batch.length === 0) return;

    const sheetId = batch[0].sheetId;
    const keys = new Set(batch.map(m => m.key));
    // Still drawn, no longer waiting to be sent.
    setPending(
      pendingStamps.current.map(m =>
        keys.has(m.key) ? { ...m, sent: true } : m
      )
    );

    dropStamps.mutate(
      {
        bidId,
        sheetId,
        groupId: batch[0].groupId,
        at: batch.map(m => ({ x: m.x, y: m.y })),
      },
      {
        /*
          The drawn copy goes only once the refetch has LANDED, which is what
          `invalidate` resolves on. Dropping it when the response arrives
          instead would blank the marks for the length of one refetch and paint
          them again — a flicker in exactly the place a count is being read.
        */
        onSuccess: async () => {
          await utils.takeoffStamps.listForSheet.invalidate({ sheetId });
          setPending(pendingStamps.current.filter(m => !keys.has(m.key)));
          mirrorQueue(sheetId);
        },
        /*
          Back in the queue, and still on the drawing. A failed request must not
          take a count off the screen: it rides the next flush, and survives a
          reload in the mirror either way.
        */
        onError: () => {
          setPending(
            pendingStamps.current.map(m =>
              keys.has(m.key) ? { ...m, sent: false } : m
            )
          );
        },
      }
    );
  }, [bidId, dropStamps, mirrorQueue, setPending, utils]);
  /**
   * Take a click: draw it now, send it shortly after.
   *
   * ── Drawn on the click, not on the answer ─────────────────────────────────
   * The mark used to appear only when the sheet's list came back from the
   * server — a round trip after a debounce that was RESTARTED by every click,
   * so counting forty lights in a row put nothing on the drawing at all until
   * the hand stopped. Losing your place is the expensive part: a count that
   * cannot be read off the screen gets done again by hand.
   *
   * ── Still batched, because the drawing no longer waits for it ─────────────
   * One request per click is forty requests. The timer is now a ceiling on how
   * long a click may sit unsent rather than a quiet period, so a fast run
   * flushes every FLUSH_AFTER_MS instead of never.
   */
  const queueStamp = useCallback(
    (at: { x: number; y: number }) => {
      if (!activeSheet || !armedGroup) return;
      const sheetId = activeSheet.id;

      setPending([
        ...pendingStamps.current,
        {
          key: nextPendingKey.current--,
          sheetId,
          groupId: armedGroup.groupId,
          name: armedGroup.label,
          assemblyId: armedGroup.assemblyId,
          assemblyCategory: armedCategory,
          x: at.x,
          y: at.y,
          sent: false,
        },
      ]);
      mirrorQueue(sheetId);

      if (flushTimer.current === null) {
        flushTimer.current = window.setTimeout(flushStamps, FLUSH_AFTER_MS);
      }
    },
    [
      activeSheet?.id,
      armedGroup,
      armedCategory,
      flushStamps,
      mirrorQueue,
      setPending,
    ]
  );

  /**
   * Put the batch in before the thing it belongs to changes.
   *
   * The old comment inside the flush claimed "the batch is flushed whenever the
   * tool changes hands — putting the tool down clears the queue first". Nothing
   * did that. Clicks made within the window after switching counts went over
   * under the PREVIOUS count's id, which is a wrong quantity on two counts at
   * once and nothing on screen to say so.
   */
  useEffect(() => {
    flushStamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armedGroup?.groupId, activeSheet?.id]);

  /**
   * Recover stamps clicked but never sent, after a crash or reload.
   *
   * ── The queue may predate groups ────────────────────────────────────────
   * A browser can be holding clicks written by the build before phase 6: the
   * storage key survives deploys on purpose and the mirror lives for a week.
   * Those entries name an assembly and know nothing about a group, so one is
   * found or made for them before they are sent. Discarding them instead would
   * throw away work that exists nowhere else, which is the failure this whole
   * mirror exists to prevent.
   */
  useEffect(() => {
    if (!activeSheet) return;
    const queued = loadStampQueue(activeSheet.id);
    if (!queued || queued.stamps.length === 0) return;

    const sheetId = activeSheet.id;
    const at = queued.stamps.map(st => ({ x: st.x, y: st.y }));
    const announce = () => {
      clearStampQueue(sheetId);
      toast.success(
        `Recovered ${queued.stamps.length} mark${queued.stamps.length === 1 ? "" : "s"} from your last session.`
      );
    };

    const first = queued.stamps[0];
    if (typeof first.groupId === "number" && first.groupId > 0) {
      dropStamps.mutate(
        { bidId: queued.bidId, sheetId, groupId: first.groupId, at },
        { onSuccess: announce }
      );
      return;
    }

    // Older shape. The assembly is the honest reading of what was counted; a
    // queue with only a name becomes a plain count under that name, reusing
    // one if the bid already has it rather than making a second.
    const resolve =
      typeof first.assemblyId === "number" && first.assemblyId > 0
        ? groupForAssembly.mutateAsync({
            bidId: queued.bidId,
            assemblyId: first.assemblyId,
          })
        : createGroup.mutateAsync({
            bidId: queued.bidId,
            label: first.assemblyName?.trim() || "Recovered count",
            reuseExisting: true,
          });

    resolve
      .then(group =>
        dropStamps.mutateAsync({
          bidId: queued.bidId,
          sheetId,
          groupId: group.id,
          at,
        })
      )
      .then(announce)
      .catch(() => {
        // Left in storage on purpose: a failed recovery must not be a silent
        // deletion. The next visit to this sheet tries again.
      });
  }, [activeSheet?.id]);

  /** Escape puts the stamp tool down. */
  useEffect(() => {
    if (!armedGroup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setArmedGroup(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedGroup]);

  /**
   * Everything on the sheet, expressed on the two layer axes.
   *
   * Stamps carry their assembly's Category (snapshotted at drop time); runs
   * have no assembly and so get their own System keys. One checklist covers
   * the sheet — see shared/takeoffLayers.ts.
   */
  const layeredStamps = useMemo(
    () =>
      stamps.map(st => ({
        ...st,
        systemKey: systemKeyForStamp(st.assemblyCategory),
        location: st.location ?? null,
      })),
    [stamps]
  );
  const layeredRuns = useMemo(
    () =>
      runs.map(run => ({
        ...run,
        // The type's name, so the checklist filters by what a run IS rather
        // than by which of two raceway kinds it belongs to.
        systemKey: systemKeyForRun(
          run.pathType as "conduit" | "cable",
          run.typeName
        ),
        // The colour it is already drawn in. A swatch that disagreed with the
        // line would be a legend teaching a code the drawing does not use.
        systemColor: runAppearance({
          runTypeId: run.runTypeId,
          pathType: run.pathType as "conduit" | "cable",
        }).color,
        location: run.location ?? null,
      })),
    [runs]
  );

  const present = useMemo(
    () => layersPresent([...layeredStamps, ...layeredRuns]),
    [layeredStamps, layeredRuns]
  );

  /**
   * Default every layer on when a sheet's contents change shape.
   *
   * Keyed on the set of layer keys rather than the items: adding a stamp to a
   * system already showing must not reset a filter the user set, but a system
   * appearing for the first time should arrive visible rather than silently
   * hidden.
   */
  const presentKey = useMemo(
    () =>
      [
        ...present.systems.map(s => s.key),
        "|",
        ...present.locations.map(l => l.key),
      ].join(","),
    [present]
  );
  useEffect(() => {
    // Snapshot what was present BEFORE updating the refs. The state updater
    // below runs later, and reading a ref that has already been reassigned
    // makes every key look like one we had seen — so nothing gets switched on
    // and a sheet opens with everything hidden.
    const seenSystems = hadSystem.current;
    const seenLocations = hadLocation.current;
    hadSystem.current = new Set(present.systems.map(entry => entry.key));
    hadLocation.current = new Set(present.locations.map(entry => entry.key));

    setLayerState(current => {
      // First sight of this sheet's contents: everything on, per the plan's
      // "Default: all layers on when a sheet is first opened".
      if (!current) return allLayersOn([...layeredStamps, ...layeredRuns]);

      // Otherwise keep the user's choices and switch on anything that has
      // appeared since — a new system arriving hidden would be invisible work.
      const systems = new Set(current.systems);
      const locations = new Set(current.locations);
      for (const entry of present.systems) {
        if (!seenSystems.has(entry.key)) systems.add(entry.key);
      }
      for (const entry of present.locations) {
        if (!seenLocations.has(entry.key)) locations.add(entry.key);
      }
      return { systems, locations };
    });
  }, [presentKey]);

  const effectiveLayers =
    layerState ?? allLayersOn([...layeredStamps, ...layeredRuns]);

  const visibleStamps = useMemo(
    () => filterByLayers(layeredStamps, effectiveLayers),
    [layeredStamps, effectiveLayers]
  );
  const visibleRuns = useMemo(
    () => filterByLayers(layeredRuns, effectiveLayers),
    [layeredRuns, effectiveLayers]
  );
  const hiddenCount =
    layeredStamps.length -
    visibleStamps.length +
    (layeredRuns.length - visibleRuns.length);

  const stampGroups = useMemo(
    () =>
      groupStamps(
        visibleStamps.map(st => ({
          id: st.id,
          sheetId: st.sheetId,
          groupId: st.groupId,
          name: st.name,
          assemblyId: st.assemblyId,
          assemblyCategory: st.assemblyCategory ?? null,
          x: st.x,
          y: st.y,
        }))
      ),
    [visibleStamps]
  );

  /**
   * A stamp sitting on a run's end that nothing has claimed yet.
   *
   * ── When this appears, and why that rule is narrow ────────────────────
   * Only when the run ACTUALLY COUNTS a drop at that end and no stamp is
   * linked to it. That is exactly the situation where the same drop could be
   * counted twice once stamps carry their own verticals — and nowhere else,
   * so the chip never appears on a run where there is nothing to decide.
   *
   * ── It proposes; it never applies itself ─────────────────────────────
   * The nearest mark is not evidence of anything. Two receptacles a foot
   * apart, a homerun ending beside a device it does not feed, a stamp
   * dropped to mark something else entirely — all of them look identical to
   * a distance check. So the distance only decides whether to ASK.
   *
   * ── The range is in real feet, not page points ───────────────────────
   * A fixed number of page points means something different on every sheet:
   * three feet at 1/4 inch scale is forty at 1 inch = 100 feet. Two real
   * feet is two real feet on any drawing.
   */
  const suggestionForRun = useCallback(
    (runId: number) => {
      const ratio = measurability?.ok ? measurability.ratio : null;
      if (ratio === null) return null;
      const run = visibleRuns.find(r => r.id === runId);
      if (!run) return null;

      const last = run.points[run.points.length - 1];
      if (!last) return null;

      let best: { id: number; name: string; inches: number } | null = null;
      for (const stamp of visibleStamps) {
        const inches = pointsToRealInches(
          segmentLength(last, { x: stamp.x, y: stamp.y }),
          ratio
        );
        if (inches === null || inches > SUGGEST_WITHIN_INCHES) continue;
        if (!best || inches < best.inches)
          best = { id: stamp.id, name: stamp.name, inches };
      }
      if (
        !best ||
        !shouldSuggestStampLink({
          endVerticalCounted: Boolean(run.quantities?.verticals?.end.counted),
          endStampId: run.ends?.endStampId ?? null,
          distanceInches: best.inches,
        })
      )
        return null;
      return {
        stampId: best.id,
        label: best.name,
        // Nothing links an assembly to a height type yet, so accepting sets
        // the LINK and leaves the kind alone. Guessing the type from the
        // assembly's name would be the inference this feature refuses.
        typeKey: null as string | null,
      };
    },
    [measurability, visibleStamps, visibleRuns]
  );

  const saveRun = trpc.takeoffRuns.save.useMutation({
    onError: e => toast.error(e.message),
  });
  const commitRun = trpc.takeoffRuns.commit.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result =>
      // "traced", because this is the FLAT length and the panel two inches
      // away may already be showing a larger number with the drops added.
      // Two figures for the same run in the same second, one of them
      // unlabelled, is the confusion this phase exists to remove.
      toast.success(`Run finished — ${result.lengthFeet} ft traced.`),
    onSettled: refreshRuns,
  });
  const removeRun = trpc.takeoffRuns.remove.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshRuns,
  });
  const acceptSuggestion = trpc.takeoffRuns.acceptSuggestion.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => toast.success("Route accepted — finish it to count it."),
    onSettled: refreshRuns,
  });
  const addCircuit = trpc.takeoffRuns.addCircuit.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshRuns,
  });
  const updateCircuit = trpc.takeoffRuns.updateCircuit.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshRuns,
  });
  const removeCircuit = trpc.takeoffRuns.removeCircuit.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshRuns,
  });
  /**
   * Whose wire a traced run is (D18).
   *
   * Goes through `refreshRuns`, like every run mutation above it, rather than
   * invalidating whichever query came to mind — CLAUDE.md § "a test that calls
   * the server cannot see a screen showing yesterday's answer". The panel
   * decides what to show from `wireOwnership`, which the SERVER derives, so a
   * cache left alone here would leave the question on screen after it was
   * answered and the totals unchanged after the answer changed them.
   */
  const setBranchWiring = trpc.takeoffRuns.setEnds.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshRuns,
  });

  /**
   * What each traced run type would put on this bid (R2).
   *
   * Refetched through `refreshRuns` like everything else on this screen, which
   * matters more here than usual: this panel counts RUNS, so tracing one,
   * deleting one, or answering the branch question all change what it says. A
   * query invalidated only by its own mutation would leave the footage on
   * screen describing the drawing as it was a minute ago.
   */
  const runTypeBridge = trpc.takeoffRunTypes.bridgeForBid.useQuery(
    { bidId },
    { enabled: Number.isFinite(bidId) }
  );
  const [sendingRunTypeId, setSendingRunTypeId] = useState<number | null>(null);
  const sendRunType = trpc.takeoffRunTypes.sendToBid.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result => {
      /*
        Say what actually happened, including what did NOT go and why.

        "Sent to bid" on a type whose ground has no material named would be
        true and useless: two lines crossed and one did not, and the estimator
        needs to know which before they price the job.
      */
      const parts: string[] = [];
      if (result.sent.length > 0)
        parts.push(
          `${result.sent.length} line${result.sent.length === 1 ? "" : "s"} added`
        );
      if (result.updated.length > 0)
        parts.push(`${result.updated.length} updated`);
      const blocked = result.skipped.filter(
        s => s.why !== "Already on the bid, and unchanged."
      );
      if (parts.length === 0 && blocked.length === 0) {
        toast.success("Already on the bid, and up to date.");
      } else if (blocked.length > 0) {
        /*
          The skip is its OWN sentence, not clause-joined to the success.

          "1 line added — Nothing traced under this type yet." reads as though
          the skip explains the add. Saying how many did not go, and then why,
          is the difference between a report and a riddle.
        */
        toast.success(
          `${parts.join(", ") || "Nothing added"}. ${blocked.length} not sent: ` +
            Array.from(new Set(blocked.map(s => s.why))).join(" ")
        );
      } else {
        toast.success(parts.join(", "));
      }
    },
    onSettled: () => {
      setSendingRunTypeId(null);
      // refreshRuns invalidates the bridge too — see the helper.
      refreshRuns();
    },
  });

  /**
   * Autosave, on a timer while tracing.
   *
   * Every 4 seconds rather than on every click: a click is cheap locally but a
   * round trip per vertex would put a request behind every point of a
   * forty-point run. The localStorage mirror below covers the gap between
   * timer ticks, which is the window a crash would otherwise fall into.
   */
  useEffect(() => {
    if (!tracing || !activeSheet || tracePoints.length < 2) return;
    const timer = window.setInterval(() => {
      if (tracePoints.length === savedPointCount.current) return;
      saveRun.mutate(
        {
          bidId,
          sheetId: activeSheet.id,
          id: draftRunId.current ?? undefined,
          name: draftRunId.current
            ? `Run ${draftRunId.current}`
            : `Run on ${activeSheet.name}`,
          pathType: tracePathType,
          points: tracePoints,
          status: "draft",
        },
        {
          onSuccess: result => {
            draftRunId.current = result.id;
            savedPointCount.current = tracePoints.length;
            refreshRuns();
          },
        }
      );
    }, 4000);
    return () => window.clearInterval(timer);
  }, [tracing, activeSheet?.id, tracePoints, tracePathType, bidId]);

  /** The crash mat: mirrored locally on every change, which is nearly free. */
  useEffect(() => {
    if (!tracing || !activeSheet || tracePoints.length < 2) return;
    saveDraft({
      sheetId: activeSheet.id,
      bidId,
      runId: draftRunId.current,
      name: `Run on ${activeSheet.name}`,
      pathType: tracePathType,
      points: tracePoints,
    });
  }, [tracing, activeSheet?.id, tracePoints, tracePathType, bidId]);

  /** Offer to restore a stranded local draft when a sheet opens. */
  useEffect(() => {
    if (!activeSheet || tracing) return;
    setRecoverable(loadDraft(activeSheet.id));
  }, [activeSheet?.id, tracing]);

  /**
   * Warn on the way out with work in the gap between autosaves.
   *
   * The browser shows its own generic wording; what matters is that the prompt
   * appears at all, and only when something would genuinely be lost.
   */
  useEffect(() => {
    if (!tracing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWork(tracePoints, savedPointCount.current)) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [tracing, tracePoints]);

  const startTracing = useCallback((pathType: RunPathType) => {
    setTracePathType(pathType);
    setTracePoints([]);
    draftRunId.current = null;
    savedPointCount.current = 0;
    setTracing(true);
    setSelectedRunId(null);
  }, []);

  /**
   * Arm a kind of run, and start tracing it.
   *
   * One function for both doors — picking from the palette and defining a new
   * one — so the state after either is identical. Same shape as `armGroup`
   * for marks, and for the same reason: two ways to reach one state is two
   * states that drift.
   */
  const armRunType = useCallback(
    (
      pathType: RunPathType,
      type: { id: number; label: string },
      andTrace = true
    ) => {
      setArmedRunType(previous => ({ ...previous, [pathType]: type }));
      if (andTrace) startTracing(pathType);
    },
    [startTracing]
  );

  const finishTrace = useCallback(() => {
    if (!activeSheet || tracePoints.length < 2) return;
    saveRun.mutate(
      {
        bidId,
        sheetId: activeSheet.id,
        id: draftRunId.current ?? undefined,
        name: `Run on ${activeSheet.name}`,
        pathType: tracePathType,
        points: tracePoints,
        status: "draft",
        // What the pickers said at the moment this run was finished. The
        // KIND is copied down; the HEIGHT stays a live setting.
        startKind: traceEnds.startKind,
        endKind: traceEnds.endKind,
        /*
          What this run IS. The server reads the label off the type rather than
          taking one from here, so a run cannot be saved claiming to be
          something its type does not say.
        */
        runTypeId: armedRunType[tracePathType]?.id ?? null,
      },
      {
        onSuccess: result => {
          commitRun.mutate({ id: result.id });
          clearDraft(activeSheet.id);
          setTracing(false);
          setTracePoints([]);
          draftRunId.current = null;
          savedPointCount.current = 0;
          setRecoverable(null);
        },
      }
    );
  }, [
    activeSheet,
    tracePoints,
    tracePathType,
    bidId,
    saveRun,
    commitRun,
    traceEnds,
    armedRunType,
  ]);

  const cancelTrace = useCallback(() => {
    if (activeSheet) clearDraft(activeSheet.id);
    setTracing(false);
    setTracePoints([]);
    draftRunId.current = null;
    savedPointCount.current = 0;
  }, [activeSheet?.id]);

  const handleSheetVisible = useCallback(
    (pageNumber: number, text: string) => {
      // Kept for the plan reader too. The extraction has already happened for
      // scale detection, so the reader gets the sheet's own words — title
      // block, general notes, keynotes — for free alongside the picture.
      pageTextByPage.current.set(pageNumber, text);
      const sheet = sheets.find(s => s.pageNumber === pageNumber);
      // Nothing to attach a reading to yet; ensureSheets is still in flight and
      // this page's text will be re-read the next time it is shown.
      if (!sheet) return;
      if (sheet.scaleSource !== "none") return;
      detectScale.mutate({ id: sheet.id, sheetText: text });
    },
    [sheets]
  );

  /**
   * Send ONE queued file: check it, transfer it, record the sheet.
   *
   * Separate from `acceptFiles` so that retrying is the same code path as the
   * first attempt rather than a second, subtly different one — a retry that
   * skipped a validation step or a fallback would be a retry that behaves
   * unlike the thing it is retrying.
   *
   * Everything is addressed by `job.id`, never by position: the dismiss button
   * removes rows while a transfer is in flight, and index-addressed updates
   * used to land on whichever row had shifted into place.
   */
  const runJob = useCallback(
    async (job: UploadJob) => {
      const file = job.file;
      const setState = (patch: Partial<Omit<UploadJob, "id" | "file">>) =>
        setUploads(prev => patchJob(prev, job.id, patch));

      /**
       * Send a large set in pieces, continuing an interrupted one if there is
       * one for this exact file.
       *
       * Returns the storage key, or null when this server cannot do pieces —
       * in which case the caller carries on down the ordinary path rather than
       * failing, because a backend without the operation is a configuration
       * fact, not the user's problem.
       */
      const uploadLargeFile = async (file: File): Promise<string | null> => {
        const resumed = findResumableUpload(bidId, file);
        let started: { storageKey: string; uploadId: string };

        if (resumed) {
          started = {
            storageKey: resumed.storageKey,
            uploadId: resumed.uploadId,
          };
        } else {
          try {
            started = await startMultipart.mutateAsync({
              bidId,
              filename: file.name,
              byteSize: file.size,
            });
          } catch (error) {
            // PRECONDITION_FAILED means this server is not on R2. Anything
            // else is a real failure and must not be swallowed into a silent
            // fallback that would then fail more confusingly.
            const code = (error as { data?: { code?: string } })?.data?.code;
            if (code === "PRECONDITION_FAILED") return null;
            throw error;
          }
        }

        const { partSize } = planParts(file.size);
        rememberUpload({
          bidId,
          storageKey: started.storageKey,
          uploadId: started.uploadId,
          file: fileIdentity(file),
          partSize,
          startedAt: resumed?.startedAt ?? Date.now(),
        });

        const controller = new AbortController();
        // The cancel button aborts an XHR; give it something that aborts the
        // whole run of pieces instead.
        abortRef.current = controller;

        try {
          await uploadInParts({
            file,
            byteSize: file.size,
            partSize,
            signal: controller.signal,
            transport: {
              signParts: partNumbers =>
                signUploadParts.mutateAsync({
                  bidId,
                  storageKey: started.storageKey,
                  uploadId: started.uploadId,
                  partNumbers,
                }),
              listParts: () =>
                utils.bidPdfs.listUploadedParts.fetch({
                  bidId,
                  storageKey: started.storageKey,
                  uploadId: started.uploadId,
                }),
              complete: parts =>
                completeMultipart
                  .mutateAsync({
                    bidId,
                    storageKey: started.storageKey,
                    uploadId: started.uploadId,
                    parts,
                  })
                  .then(() => undefined),
            },
            onProgress: p =>
              setState({
                sent: p.bytesSent,
                partsDone: p.partsDone,
                partCount: p.partCount,
                paused: p.paused,
                stalled: p.stalled,
                retrying: p.retrying,
              }),
          });
        } catch (error) {
          // The record survives a failure on purpose: that is what makes the
          // next attempt a resume rather than a fresh start. It is only
          // forgotten on success or on an explicit cancel.
          if (controller.signal.aborted) {
            forgetUpload(started.storageKey);
            void abortMultipart
              .mutateAsync({
                bidId,
                storageKey: started.storageKey,
                uploadId: started.uploadId,
              })
              .catch(() => {});
          }
          throw error;
        } finally {
          abortRef.current = null;
        }

        forgetUpload(started.storageKey);
        return started.storageKey;
      };

      /**
       * `retryable: false` is for failures the same bytes will always produce —
       * too large, not a PDF. Offering Retry there is offering a button that
       * cannot work; the way forward is a different file.
       */
      const fail = (
        message: string,
        {
          detail = null,
          retryable = true,
        }: { detail?: string | null; retryable?: boolean } = {}
      ) => {
        setUploads(prev =>
          failJob(prev, job.id, { error: message, detail, retryable })
        );
        toast.error(message);
      };

      // Cheap checks first, so an obviously wrong file fails instantly rather
      // than after a long upload.
      const check = checkPdfUpload({
        filename: file.name,
        byteSize: file.size,
      });
      if (!check.ok) {
        fail(check.message, { retryable: false });
        return;
      }

      // The magic bytes, read from the first few bytes of the file rather than
      // the whole thing. Catches a document renamed to .pdf, which otherwise
      // uploads perfectly and then fails to open with nothing explaining why.
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (!looksLikePdf(head)) {
        fail(
          `${file.name} is not a PDF inside, whatever it is named. Export a real PDF and try again.`,
          { retryable: false }
        );
        return;
      }

      // A genuinely huge set opens fine but takes a visible moment the first
      // time. This used to warn from 150MB that it "may not render on a
      // low-memory device", which was true when the viewer read the whole
      // document into memory and stopped being true when it started fetching
      // byte ranges a page at a time. A warning that has stopped being true is
      // worse than none, so the threshold moved and the alarm came out of the
      // wording — see VIEWER_COMFORTABLE_BYTES.
      if (file.size > VIEWER_COMFORTABLE_BYTES) {
        toast.info(
          `${file.name} is ${formatBytes(file.size)}. It will attach and open normally — just give it a moment the first time.`
        );
      }

      try {
        setState({ state: "uploading", sent: 0 });

        const handle = {
          onProgress: (sent: number) => setState({ sent }),
          onStart: (xhr: XMLHttpRequest) => {
            xhrRef.current = xhr;
          },
        };

        let storageKey: string;

        /**
         * A set too large for one request goes up in pieces.
         *
         * Tried before the single-PUT path rather than as a fallback from it:
         * discovering that a 1.5GB upload needed pieces by watching it fail
         * twenty minutes in is precisely the experience this exists to remove.
         * `shouldUseMultipart` is a size check, so the decision costs nothing.
         *
         * If the server says it cannot do pieces — anything but R2 — this
         * falls through to the ordinary path, which is the honest behaviour
         * for a backend that has no such operation.
         */
        if (shouldUseMultipart(file.size)) {
          const sent = await uploadLargeFile(file);
          if (sent) {
            storageKey = sent;
            xhrRef.current = null;
            setState({ state: "finishing", sent: file.size });
            const attached = await confirmAttach.mutateAsync({
              bidId,
              filename: file.name,
              storageKey,
              byteSize: file.size,
            });
            setState({ state: "done" });
            setSelectedDocId(attached.id);
            setPage(1);
            void utils.bidPdfs.list.invalidate({ bidId });
            toast.success(`${attached.filename} attached.`);
            return;
          }
        }

        // The direct path first: browser straight to storage, no size ceiling
        // and nothing buffered on our server. See lib/planUploadTransport.ts.
        try {
          const ticket = await createTicket.mutateAsync({
            bidId,
            filename: file.name,
            byteSize: file.size,
          });
          await putDirectToStorage(ticket.uploadUrl, file, handle);
          storageKey = ticket.storageKey;
        } catch (directError) {
          // Only a `blocked` failure is worth another attempt. It means zero
          // bytes left the browser — the request was refused before its body
          // was read, which is what a storage bucket with no CORS rule for
          // this origin does to every upload at every size. Our own origin
          // cannot be refused that way, so the same file goes through the
          // server instead.
          //
          // Anything else — dropped, stalled, an HTTP rejection — would fail
          // the same way through a smaller pipe, so it is reported as-is
          // rather than turned into two errors.
          if ((directError as UploadError).kind !== "blocked")
            throw directError;

          setState({ sent: 0 });
          storageKey = await postViaServer(bidId, file, handle);
        }
        xhrRef.current = null;

        setState({ state: "finishing", sent: file.size });
        // One place records a sheet, whichever path carried the bytes.
        const attached = await confirmAttach.mutateAsync({
          bidId,
          filename: file.name,
          storageKey,
          byteSize: file.size,
        });

        setState({ state: "done" });
        setSelectedDocId(attached.id);
        setPage(1);
        void utils.bidPdfs.list.invalidate({ bidId });
        toast.success(`${attached.filename} attached.`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "That file could not be attached. Nothing was added to this bid.";
        const detail =
          err instanceof Error
            ? ((err as Error & { detail?: string | null }).detail ?? null)
            : null;
        fail(message, { detail });
      }
    },
    [
      bidId,
      createTicket,
      confirmAttach,
      utils,
      startMultipart,
      signUploadParts,
      completeMultipart,
      abortMultipart,
    ]
  );

  /**
   * Attach picked files.
   *
   * One at a time rather than in parallel. A 500MB set uploading alongside two
   * others gives three progress bars all crawling and a saturated connection;
   * sequential means the first sheet is usable while the rest arrive.
   *
   * New files are APPENDED. They used to replace the list, which wiped a failed
   * row — and its message — the moment the user picked anything else.
   */
  const acceptFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const queued = Array.from(files).map(makeJob);
      setUploads(prev => appendJobs(prev, queued));

      // The input is cleared immediately so that picking the SAME file again
      // still fires a change event — otherwise a failed upload could not be
      // re-attempted from the picker at all.
      if (fileInput.current) fileInput.current.value = "";

      for (const job of queued) await runJob(job);

      // Successes disappear — the sheet they produced is the confirmation.
      // Failures stay, with their reason and a Retry button.
      setUploads(prev => clearFinished(prev));
    },
    [runJob]
  );

  /**
   * Send a failed upload again, without the user finding the file twice.
   *
   * The job is read from `uploadsRef` rather than from inside a state updater:
   * an updater must be pure, React calls it twice in development to prove it,
   * and reaching into one for a value would start the upload twice.
   */
  const retryUpload = useCallback(
    async (id: string) => {
      const job = uploadsRef.current.find(
        candidate => candidate.id === id && candidate.state === "failed"
      );
      if (!job) return;

      setUploads(prev => resetForRetry(prev, id));
      await runJob(job);
      setUploads(prev => clearFinished(prev));
    },
    [runJob]
  );

  const cancelUpload = useCallback(() => {
    // Two shapes of upload, two ways to stop one. A single-request upload is
    // one XHR to abort; an upload in pieces has several in flight plus a queue
    // behind them, so it carries an AbortController instead.
    xhrRef.current?.abort();
    xhrRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /**
   * Pick up a plan chosen on the Dashboard's "Upload a plan" card.
   *
   * That card takes the file before a bid exists, creates one named after it,
   * and lands here — so the upload starts on arrival rather than asking the
   * user to find the same file a second time. See lib/pendingPlanUpload.
   *
   * `takePendingPlan` clears as it reads, so returning to this screen later
   * never re-uploads. The empty dependency list is deliberate: this runs once
   * per mount, and a re-run on any changing value would be a second upload.
   */
  useEffect(() => {
    const handed = takePendingPlan();
    if (!handed) return;
    const list = new DataTransfer();
    list.items.add(handed);
    void acceptFiles(list.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex flex-col h-full bg-background"
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        void acceptFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={e => void acceptFiles(e.target.files)}
      />

      <MaterialsListDialog
        bidId={bidId}
        open={materialsListOpen}
        onOpenChange={setMaterialsListOpen}
      />

      {/*
        Hidden in focus mode, which is what makes focus mode worth a key.
        Everything here is about the BID — its name, its materials list, adding
        another plan — and none of it is reached mid-count. The tool bar below
        stays, because that is the bar you work from.
      */}
      {!focusMode && (
        <div className="border-b border-border px-6 py-2 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={onBack}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Bid
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">
                Plans{bid?.bid?.name ? ` — ${bid.bid.name}` : ""}
              </h1>
              {/*
                Corrected 2026-09-21. This read "Counts feed the materials
                list, not the bid price", which stopped being true when the
                takeoff bridge shipped: a counted group can carry a bid line
                whose quantity is derived live from the marks
                (shared/takeoffBridge.ts). Telling an estimator their counts do
                not reach the price, while the price moves underneath them, is
                worse than saying nothing.
              */}
              <p className="text-xs text-muted-foreground">
                Set each sheet&apos;s scale, then mark and trace what is on it.
                Counts you send to the bid change its price; the rest stay here
                until you do.
              </p>
            </div>
            {/* Left of "Add PDF" and available from the first mark, not at the
              end: a supplier quote is how a contractor finds out what things
              cost, so it must not sit behind a finished, priced bid. It stays
              outlined rather than filled because adding a plan is still the
              louder action on this screen. */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setMaterialsListOpen(true)}
              title="Materials list — quantities only, for a supplier quote"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Materials list
            </Button>
            {docs.length > 0 && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Add PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/*
        ── THE ONE TOP BAR ──────────────────────────────────────────────────

        It replaces the pager row above the drawing AND the tool bar below it.
        Removing the bottom bar alone gives back 41px across the full width,
        and it was the bar that clipped: its rightmost control was the SCALE,
        so on a narrow drawing pane the one control you need when a sheet has
        no scale was the first thing to slide off the edge.

        Order is by how often a hand reaches for it: where you are, what you
        are doing with it, then what it is drawn at and how big.

        It wraps rather than clipping, and wrapping is now safe — the drawing
        re-fits when its pane changes height, so a second row of tools no
        longer leaves the sheet cropped at the bottom with nothing to say so.
      */}
      {docs.length > 0 && (
        <div className="border-b border-border bg-card px-3 py-1.5 shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <SheetChip
            sheets={sheets}
            page={page}
            pageCount={doc?.pageCount ?? sheets.length}
            thumbnails={thumbnails}
            onOpenPage={next => {
              const last = doc?.pageCount ?? sheets.length;
              if (next < 1 || (last > 0 && next > last)) return;
              setPage(next);
            }}
            onBrowsing={setBrowsingSheets}
            disabled={!doc}
          />

          <div className="w-px h-4 bg-border" />

          {/*
            ── COUNT ────────────────────────────────────────────────────────

            First, and alone in its group, because it is the tool that ALWAYS
            works. Counting is not measuring and needs no scale, so on a sheet
            with none this is the whole of what the bar still offers — and it
            should not have to be found among two dimmed buttons that do.

            The divider after it is the only label this grouping gets. Words
            were considered and dropped: the bar already wraps to a second row
            on a narrow drawing pane, and wrapping is what used to push the
            scale control off the edge. The dimming does the explaining on the
            sheets where it matters — on an unscaled sheet everything left of
            the divider is live and everything right of it is not, which says
            "these two are a kind, and they need something" without spending a
            pixel of width on saying so.
          */}
          {armedGroup ? (
            /*
              Outside the measurability gate on purpose. The control that says
              what is being stamped — and the only way to stop — must not
              disappear on an unscaled sheet.
            */
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setArmedGroup(null)}
            >
              <MapPin className="w-3.5 h-3.5" />
              Counting {armedGroup.label}
              <X className="w-3 h-3" />
            </Button>
          ) : (
            activeSheet &&
            !tracing && (
              <StampPicker
                assemblies={allAssemblies.map(a => ({
                  id: a.id,
                  name: a.name,
                  category: a.category ?? null,
                }))}
                disabled={allAssemblies.length === 0}
                onPick={assembly => {
                  groupForAssembly
                    .mutateAsync({ bidId, assemblyId: assembly.id })
                    .then(group => armGroup(group, assembly.id))
                    .catch(() => {
                      /* the mutation's onError has already said so */
                    });
                }}
                onCountPlain={label => {
                  createGroup
                    .mutateAsync({ bidId, label })
                    .then(group => armGroup(group, null))
                    .catch(() => {
                      /* a duplicate name is refused by name, and said so */
                    });
                }}
              />
            )
          )}

          {activeSheet && !tracing && <div className="w-px h-4 bg-border" />}

          {/*
            ── MEASURE ──────────────────────────────────────────────────────

            Always rendered, disabled with a reason when the sheet cannot be
            measured. Hiding them was worse than it sounds: on an unscaled
            sheet the screen offered NO tool at all, and a tool that is not on
            screen does not read as unavailable, it reads as non-existent.
          */}
          {activeSheet && !tracing && (
            <>
              {/*
                aria-disabled, not disabled. A truly disabled button gets
                pointer-events: none from the button variants, which takes the
                title tooltip with it — so the reason these were off was
                written down and then made unhoverable, unfocusable and
                unclickable. The quiet scale chip leans on that reason being
                reachable, so it has to actually be reachable: hovering or
                focusing one raises the chip, and clicking says why in words.
              */}
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 gap-1.5 text-xs",
                  !measurability?.ok && "opacity-50"
                )}
                aria-disabled={!measurability?.ok}
                onClick={() => {
                  if (!measurability?.ok) {
                    if (traceBlockedReason) toast.info(traceBlockedReason);
                    return;
                  }
                  startTracing("conduit");
                }}
                onMouseEnter={() => setReachingForMeasure(true)}
                onMouseLeave={() => setReachingForMeasure(false)}
                onFocus={() => setReachingForMeasure(true)}
                onBlur={() => setReachingForMeasure(false)}
                title={traceBlockedReason ?? "Trace a conduit run"}
              >
                {/* Plain, deliberately — see runIcons. The shape says which
                    tool this is; colour on the drawing says which TYPE, and a
                    tinted toolbar would be teaching the older code. */}
                <ConduitIcon className="w-3.5 h-3.5" />{" "}
                {armedRunType.conduit?.label ?? "Conduit"}
              </Button>
              {/*
                Change what the tool is holding, without starting a trace.

                Separate from the button because the button is the frequent
                action — arm once, trace six times — and burying "trace" behind
                a menu would tax the thing people do most to make room for the
                thing they do once. Same division as the mark tool: the armed
                thing is shown, and changing it is one deliberate click.
              */}
              <RunTypePicker
                pathType="conduit"
                types={runTypes.data ?? []}
                armedId={armedRunType.conduit?.id ?? null}
                onPick={type => armRunType("conduit", type, false)}
                catalog={allMaterials}
                onCreate={spec =>
                  createRunType
                    .mutateAsync({ ...spec, pathType: "conduit" })
                    .then(type => armRunType("conduit", type, false))
                    .catch(() => {
                      /* the mutation's onError has already said so */
                    })
                }
                onSave={saveRunType}
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-6 px-0 text-xs"
                  title="Change what kind of conduit run this traces"
                  aria-label="Change conduit run type"
                >
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </RunTypePicker>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 gap-1.5 text-xs",
                  !measurability?.ok && "opacity-50"
                )}
                aria-disabled={!measurability?.ok}
                onClick={() => {
                  if (!measurability?.ok) {
                    if (traceBlockedReason) toast.info(traceBlockedReason);
                    return;
                  }
                  startTracing("cable");
                }}
                onMouseEnter={() => setReachingForMeasure(true)}
                onMouseLeave={() => setReachingForMeasure(false)}
                onFocus={() => setReachingForMeasure(true)}
                onBlur={() => setReachingForMeasure(false)}
                title={
                  traceBlockedReason ??
                  "Trace a run of self-contained cable — MC or Romex"
                }
              >
                <CableIcon className="w-3.5 h-3.5" />{" "}
                {armedRunType.cable?.label ?? "Cable"}
              </Button>
              <RunTypePicker
                pathType="cable"
                types={runTypes.data ?? []}
                armedId={armedRunType.cable?.id ?? null}
                onPick={type => armRunType("cable", type, false)}
                catalog={allMaterials}
                onCreate={spec =>
                  createRunType
                    .mutateAsync({ ...spec, pathType: "cable" })
                    .then(type => armRunType("cable", type, false))
                    .catch(() => {
                      /* the mutation's onError has already said so */
                    })
                }
                onSave={saveRunType}
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-6 px-0 text-xs"
                  title="Change what kind of cable run this traces"
                  aria-label="Change cable run type"
                >
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </RunTypePicker>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/*
              ── CALIBRATE — beside the thing it changes, not among the tools ─

              It used to sit fourth in the tool row, after Conduit, Cable and
              Stamp, reading as a fourth drawing tool. It is not one. **It does
              not measure anything — it SETS the scale**, which is what the
              other two then measure against, so its home is next to the scale
              chip it writes to rather than next to its consumers.

              And it is called Calibrate now, not Measure, for a reason that is
              about the NEXT thing to be built rather than about this button:
              Phase 4b is a measure-only tool, which needs the word "Measure"
              honestly. Two buttons both called some flavour of measure is the
              confusion this grouping exists to remove, so the word is handed
              over before it gets claimed.

              **`ghost`, not `outline`, and that changed AFTER looking at it.**
              It kept the outline it wore among the tools, and on the right it
              became the only bordered control in a row of borderless ones —
              so on a specifications sheet, the loudest thing in the whole bar
              was the button that starts a calibration. That is the exact
              nagging this change set out to remove, arriving by a side door.
              Ghost puts it at the weight of its neighbours: findable, not
              insistent.

              **And it no longer borrows the Ruler.** `Ruler` means THE SCALE
              everywhere in this app — SheetChip, SheetIndex, ScaleControl, the
              materials list — so sitting a second one immediately beside the
              scale chip put the same glyph twice in two inches meaning two
              different things. `MoveHorizontal` is a dimension line, which is
              literally what is being clicked. Changed in CalibrateLayer too,
              so the button and the mode it opens still agree.
            */}
            {/*
              The sticky ends, shown while a run is being traced. They sit with
              the trace tools rather than in the runs panel because this is the
              moment the answer is known — you are looking at the thing you are
              tracing to.
            */}
            {tracing && (
              <>
                <TraceEndsPickers
                  bidId={bidId}
                  value={traceEnds}
                  onChange={updateTraceEnds}
                />
                <div className="w-px h-4 bg-border" />
              </>
            )}

            {/*
              ── The Calibrate button is GONE, folded into the scale chip ─────
              It sat here, beside the scale, doing the same job under a
              different name and a different icon — two controls for one
              question, neither saying it was an alternative to the other. The
              chip below now offers both ways in: measure it, or type it.
            */}

            {/*
              ── The scale, as ONE status chip ──────────────────────────────

              Out of the drawing entirely. It used to be a panel floating over
              the bottom-left of the sheet — over the work — and a warning that
              covers the work is a warning people learn to resent.

              There used to be TWO things here: an amber "No scale" warning and
              the ScaleControl beside it saying "Set scale" under a second
              warning triangle. The same complaint, twice, in one bar. The
              ScaleControl chip IS the status now — it reads the scale when
              there is one, says "Set scale" plainly when there is not, and
              carries the not-to-scale note itself.

              And it stays plain until measuring is actually being attempted.
              Counting needs no scale, and a specifications or legend sheet has
              nothing on it to measure at all.
            */}
            {activeSheet && (
              <ScaleControl
                sheet={activeSheet}
                wanted={
                  !measurability?.ok && (reachingForMeasure || calibrating)
                }
                notToScale={notToScaleBySheet[activeSheet.id] ?? false}
                onSet={scaleText =>
                  setSheetScale.mutateAsync({ id: activeSheet.id, scaleText })
                }
                onClear={() => clearSheetScale.mutate({ id: activeSheet.id })}
                onMeasure={() => startCalibrating("set")}
                onCheck={() => startCalibrating("check")}
              />
            )}

            {/*
              The heights this job measures its DROPS from, beside the scale it
              measures its LENGTHS against. Same kind of setting, same bar: one
              makes flat distance measurable, the other makes vertical distance
              measurable, and neither of them counts anything until it is set.
            */}
            <JobHeightsChip bidId={bidId} />

            <div className="w-px h-4 bg-border" />

            {/* PlanPane portals its zoom cluster in here. */}
            <div ref={setZoomSlot} className="flex items-center" />

            <div className="w-px h-4 bg-border" />

            <Button
              size="sm"
              variant={focusMode ? "default" : "ghost"}
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => updatePanels(toggleFocus)}
              title={
                focusMode
                  ? "Show the panels again (F)"
                  : "Focus mode — both panels away, drawing only (F)"
              }
              aria-pressed={focusMode}
            >
              {focusMode ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              Focus
            </Button>
          </div>
        </div>
      )}

      {/* Above the workspace rather than inside the empty state, so it is in
          the same place whether this is the first plan or the tenth. */}
      <UploadProgress
        // Speed and time left are derived here rather than stored on the job:
        // they are a view of recent history, not a fact about the upload, and
        // putting them in state would re-render every row on every reading.
        jobs={uploads.map(job => ({
          ...job,
          ...readingFor(job.id, job.sent, job.byteSize),
        }))}
        onCancel={cancelUpload}
        onDismiss={id => setUploads(prev => dismissJob(prev, id))}
        onRetry={id => void retryUpload(id)}
      />

      {isLoading ? (
        <div className="flex-1 p-6">
          <div className="h-full rounded-xl border border-border bg-card animate-pulse" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className={cn(
              "w-full max-w-lg rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
              "hover:border-[#F5C518] hover:bg-[#F5C518]/5 focus-visible:outline-none",
              "focus-visible:border-[#F5C518] focus-visible:bg-[#F5C518]/5",
              dragging
                ? "border-[#F5C518] bg-[#F5C518]/10"
                : "border-border bg-card"
            )}
          >
            {uploading ? (
              <Loader2 className="w-9 h-9 mx-auto mb-4 animate-spin text-[#F5C518]" />
            ) : (
              <Upload className="w-9 h-9 mx-auto mb-4 text-muted-foreground" />
            )}
            <p className="text-base font-medium">
              {dragging ? "Drop to attach" : "Drop plan PDFs here"}
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              or click to choose files from this computer
            </p>
            <p className="text-xs text-muted-foreground/70 mt-4">
              PDFs only, up to {formatBytes(MAX_PDF_BYTES)} each. Attach as many
              sheets as the job has.
            </p>
          </button>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/*
            Documents, then the sheets within the chosen one.

            Still on the LEFT and still vertical. Moving it to the top was
            considered and rejected: sheet names are long — E1.01 POWER PLAN —
            LEVEL 2 — so horizontal chips either truncate to uselessness or eat
            the width the tools need, and a vertical list shows fifteen names
            at once where a strip shows four.

            What changed is that it no longer has to stay open. The top bar
            always names the sheet you are on and moves one either way, and the
            same chip drops a grid of thumbnails, so folding this costs
            nothing.
          */}
          <SidePanel
            side="left"
            label="the sheet list"
            open={panels.sheets}
            width={panels.sheetsWidth}
            minWidth={PANEL_LIMITS.sheets.min}
            maxWidth={PANEL_LIMITS.sheets.max}
            onToggle={() =>
              updatePanels(current => togglePanel(current, "sheets"))
            }
            onWidth={width =>
              updatePanels(current => setPanelWidth(current, "sheets", width))
            }
          >
            <div className="border-b border-border shrink-0 max-h-44 overflow-y-auto">
              <div className="px-3 py-2 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                {docs.length} {docs.length === 1 ? "document" : "documents"}
              </div>
              {docs.map(d => (
                <div
                  key={d.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDocId(d.id);
                    setPage(1);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedDocId(d.id);
                      setPage(1);
                    }
                  }}
                  className={cn(
                    "group flex items-start gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors",
                    doc?.id === d.id
                      ? "border-l-[#F5C518] bg-[#F5C518]/5"
                      : "border-l-transparent hover:bg-muted/50"
                  )}
                >
                  <FileText
                    className={cn(
                      "w-3.5 h-3.5 mt-0.5 shrink-0",
                      doc?.id === d.id
                        ? "text-[#F5C518]"
                        : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" title={d.filename}>
                      {d.filename}
                    </p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {d.pageCount ? `${d.pageCount} pages · ` : ""}
                      {formatBytes(d.byteSize)}
                    </p>
                  </div>
                  {/* Always visible, with a 44px tap target: it used to appear
                      only on mouse hover, which hid it on a tablet. The negative
                      margin keeps the row compact while the target stays full
                      size. Keys stop here so Enter opens the dialog instead of
                      selecting the row. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 -my-2 -mr-2 p-0 shrink-0 self-center text-muted-foreground hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      setConfirmRemove(d);
                    }}
                    onKeyDown={e => e.stopPropagation()}
                    aria-label={`Remove ${d.filename}`}
                    title={`Remove ${d.filename}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex-1 min-h-0">
              <SheetIndex
                sheets={sheets}
                activePage={page}
                loading={sheetsLoading}
                onOpenPage={setPage}
                onRename={(sheetId, name) =>
                  renameSheet.mutate({ id: sheetId, name })
                }
              />
            </div>
          </SidePanel>

          {doc && (
            <PlanPane
              key={doc.id}
              doc={doc}
              page={page}
              onPage={setPage}
              controlsTarget={zoomSlot}
              drawThumbnails={browsingSheets}
              onThumbnail={rememberThumbnail}
              onPageCount={pageCount =>
                setPageCount.mutate({ id: doc.id, pageCount })
              }
              onDocumentReady={handleDocumentReady}
              onSheetVisible={handleSheetVisible}
              onPageRendered={handlePageRendered}
              /**
               * Re-read the sheet list and hand back this document's
               * current URL. Invalidating awaits the refetch, so what
               * `getData` returns afterwards is the freshly minted URL —
               * or the same one, if the window has not rolled over and
               * the refusal was never an expiry.
               */
              onUrlExpired={async () => {
                await utils.bidPdfs.list.invalidate({ bidId });
                const fresh = utils.bidPdfs.list.getData({ bidId });
                return fresh?.find(d => d.id === doc.id)?.url ?? null;
              }}
              overlay={size =>
                measurability ? (
                  <>
                    {/* Calibration takes the drawing while it is on: two
                              clicks that mean something different from every
                              other click on this screen. */}
                    {calibrating && activeSheet && (
                      <CalibrateLayer
                        // A fresh layer per request — see calibrateSession.
                        key={calibrateSession}
                        width={size.width}
                        height={size.height}
                        renderScale={size.renderScale}
                        chromeTarget={size.chromeTarget}
                        points={calibratePoints}
                        onPointsChange={setCalibratePoints}
                        busy={setSheetScale.isPending}
                        /*
                          Applying no longer CLOSES this. The layer moves on to
                          checking the scale against a second known dimension,
                          which is the half that catches a plausible wrong
                          answer — see CalibrateLayer's `phase`. It closes
                          through onCancel, from Done or from skipping.
                        */
                        onApply={scaleText =>
                          setSheetScale.mutateAsync({
                            id: activeSheet.id,
                            scaleText,
                          })
                        }
                        onChecked={() =>
                          confirmSheetScale.mutateAsync({ id: activeSheet.id })
                        }
                        startInCheck={calibrateMode === "check"}
                        sheetRatio={activeSheet.scaleRatio}
                        onCancel={() => {
                          setCalibrating(false);
                          setCalibratePoints([]);
                        }}
                      />
                    )}
                    {capturingSymbol && (
                      <SymbolCaptureLayer
                        width={size.width}
                        height={size.height}
                        renderScale={size.renderScale}
                        onCancel={() => setCapturingSymbol(false)}
                        onRegion={(region: CaptureRegion) => {
                          const thumbnail = size.canvas
                            ? cropToThumbnail(
                                size.canvas,
                                region,
                                size.renderScale
                              )
                            : null;
                          setCapturingSymbol(false);
                          setPendingCapture({ thumbnail });
                        }}
                      />
                    )}
                    {pendingCapture && (
                      <SymbolCaptureForm
                        thumbnail={pendingCapture.thumbnail}
                        onCancel={() => setPendingCapture(null)}
                        onSave={label => {
                          captureSymbol.mutate(
                            {
                              label,
                              thumbnail: pendingCapture.thumbnail,
                              capturedFromSheetId: activeSheet?.id,
                            },
                            {
                              onSuccess: r =>
                                toast.success(
                                  r.alreadyKnown
                                    ? "Already in your legend."
                                    : "Captured — click it to choose an assembly."
                                ),
                            }
                          );
                          setPendingCapture(null);
                        }}
                      />
                    )}
                    <TraceLayer
                      width={size.width}
                      height={size.height}
                      renderScale={size.renderScale}
                      measurability={measurability}
                      tracing={tracing}
                      pathType={tracePathType}
                      endsLabel={armedEndsLabel}
                      points={tracePoints}
                      onPointsChange={setTracePoints}
                      existingRuns={visibleRuns}
                      onFinish={finishTrace}
                      onCancel={cancelTrace}
                      selectedRunId={selectedRunId}
                      onSelectRun={setSelectedRunId}
                      stamping={Boolean(armedGroup) && !tracing}
                      armedGroupName={armedGroup?.label ?? null}
                      zoom={size.zoom}
                      stamps={[
                        ...visibleStamps.map(st => ({
                          id: st.id,
                          name: st.name,
                          groupId: st.groupId,
                          assemblyId: st.assemblyId,
                          assemblyCategory: st.assemblyCategory ?? null,
                          x: st.x,
                          y: st.y,
                        })),
                        /*
                          Clicked and not yet saved, drawn the same way.

                          Deliberately NOT put through the Layers filter above:
                          these are the marks somebody is placing right now with
                          that very count armed, and a mark that does not appear
                          because a layer is hidden is indistinguishable from a
                          click that missed.
                        */
                        ...pendingMarks
                          .filter(m => m.sheetId === activeSheet?.id)
                          .map(m => ({
                            id: m.key,
                            name: m.name,
                            groupId: m.groupId,
                            assemblyId: m.assemblyId,
                            assemblyCategory: m.assemblyCategory,
                            x: m.x,
                            y: m.y,
                            pending: true,
                          })),
                      ]}
                      proposals={proposals}
                      onDropStamp={queueStamp}
                      selectedStampId={selectedStampId}
                      onSelectStamp={setSelectedStampId}
                      focusPoint={focusPoint}
                      chromeTarget={size.chromeTarget}
                    />
                  </>
                ) : null
              }
            />
          )}

          {/*
            The work pane. Folds to its rail like the sheet list, and for the
            same reason: on a laptop this is 400px of drawing.
          */}
          <SidePanel
            side="right"
            label="counted items"
            open={panels.work}
            width={panels.workWidth}
            minWidth={PANEL_LIMITS.work.min}
            maxWidth={PANEL_LIMITS.work.max}
            onToggle={() =>
              updatePanels(current => togglePanel(current, "work"))
            }
            onWidth={width =>
              updatePanels(current => setPanelWidth(current, "work", width))
            }
          >
            <RunsPanel
              runs={visibleRuns.map(r => ({
                ...r,
                firstPoint: r.points[0] ?? null,
                spec:
                  r.runTypeId === null
                    ? null
                    : (specByRunType.get(r.runTypeId) ?? null),
                typeDefaults:
                  r.runTypeId === null
                    ? null
                    : (circuitDefaultsByRunType.get(r.runTypeId) ?? null),
              }))}
              stampGroups={stampGroups}
              bridge={bridgeByGroup}
              quantitiesLocked={quantitiesLocked}
              waitingToSend={bidCounts.data?.waitingToSend}
              countedWithNoPrice={bidCounts.data?.countedWithNoPrice}
              onSendToBid={id => sendToBid.mutate({ id })}
              sendingGroupId={
                sendToBid.isPending ? (sendToBid.variables?.id ?? null) : null
              }
              onJumpTo={at => {
                setFocusPoint(at);
                // Clear the highlight after a moment — a marker that stays
                // ringed forever stops meaning "this is the one".
                window.setTimeout(() => setFocusPoint(null), 2200);
              }}
              onRemoveStamp={id => removeStamp.mutate({ id })}
              onAnswerBranchWiring={(runId, answer) =>
                setBranchWiring.mutate({ id: runId, branchWiring: answer })
              }
              runTypeBridge={runTypeBridge.data}
              sendingRunTypeId={sendingRunTypeId}
              onSendRunType={runTypeId => {
                setSendingRunTypeId(runTypeId);
                sendRunType.mutate({ bidId, runTypeId });
              }}
              renderRunType={run => {
                const armed = (runTypes.data ?? []).find(
                  t => t.id === run.runTypeId
                );
                return (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[0.7rem] text-muted-foreground shrink-0">
                        This run is
                      </span>
                      <RunTypePicker
                        pathType={run.pathType}
                        types={runTypes.data ?? []}
                        armedId={run.runTypeId}
                        onPick={type =>
                          setRunTypeFor.mutate({
                            id: run.id,
                            runTypeId: type.id,
                          })
                        }
                        catalog={allMaterials}
                        onCreate={spec =>
                          createRunType
                            .mutateAsync({ ...spec, pathType: run.pathType })
                            .then(type =>
                              setRunTypeFor.mutate({
                                id: run.id,
                                runTypeId: type.id,
                              })
                            )
                            .catch(() => {
                              /* the mutation's onError has already said so */
                            })
                        }
                        onSave={saveRunType}
                        disabled={quantitiesLocked}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[0.7rem] min-w-0"
                          aria-label={`Change what this run is`}
                          disabled={quantitiesLocked}
                        >
                          <span className="truncate">
                            {armed?.label ?? run.typeName ?? "Not said"}
                          </span>
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        </Button>
                      </RunTypePicker>
                    </div>
                    <RunSpecEditor
                      pathType={run.pathType}
                      current={resolveRunType(
                        runTypes.data ?? [],
                        run.runTypeId
                      )}
                      circuits={run.circuits}
                      locked={quantitiesLocked}
                      onSave={patch =>
                        respecifyRun.mutateAsync({ id: run.id, ...patch })
                      }
                    />
                  </div>
                );
              }}
              renderRunEnds={run => (
                <RunEndsEditor
                  bidId={bidId}
                  runId={run.id}
                  ends={
                    run.ends ?? {
                      startKind: null,
                      endKind: null,
                      startHeightInches: null,
                      endHeightInches: null,
                      distributionHeightInches: null,
                      startStampId: null,
                      endStampId: null,
                    }
                  }
                  verticals={run.quantities?.verticals ?? null}
                  suggestion={suggestionForRun(run.id)}
                />
              )}
              legend={
                <>
                  {/* Above the layers and the legend: what the reader found
                        is the thing a user comes to this pane to act on, and
                        the legend it depends on sits below it where it is
                        still one glance away. */}
                  {readerAvailable && (
                    <CoPilotPanel
                      state={copilot}
                      reading={readSheet.isPending}
                      autoRead={autoRead}
                      onAutoReadChange={setAutoReadPersisted}
                      canRead={canRead}
                      onRead={runReader}
                      onConfirm={findingIds => {
                        if (!copilot?.runId) return;
                        confirmFindings.mutate({
                          runId: copilot.runId,
                          findingIds,
                          confirmed: true,
                        });
                      }}
                      onDismiss={findingIds =>
                        dismissFindings.mutate({ findingIds })
                      }
                      onCorrect={(findingId, symbolLinkId) =>
                        correctFinding.mutate({
                          findingId,
                          symbolLinkId,
                          confirmed: true,
                        })
                      }
                      onJumpTo={at => {
                        setFocusPoint(at);
                        window.setTimeout(() => setFocusPoint(null), 2200);
                      }}
                      symbols={symbols}
                      onAsk={question => {
                        if (!activeSheet) return;
                        const snapshot = snapshotPage(
                          pageCanvas.current,
                          pageCanvasScale.current,
                          copilot?.readerModel ?? PLAN_READER_FALLBACK_MODEL
                        );
                        if (!snapshot) return;
                        askCopilot.mutate({
                          sheetId: activeSheet.id,
                          question,
                          pageImage: snapshot.image,
                          pageText: pageTextByPage.current.get(page) ?? "",
                        });
                      }}
                      asking={askCopilot.isPending}
                      answer={copilotAnswer}
                      onClearAnswer={() => setCopilotAnswer(null)}
                    />
                  )}
                  <LayersPanel
                    present={present}
                    state={effectiveLayers}
                    onChange={update =>
                      setLayerState(previous =>
                        update(
                          previous ??
                            allLayersOn([...layeredStamps, ...layeredRuns])
                        )
                      )
                    }
                    filtered={hiddenCount > 0}
                    hiddenCount={hiddenCount}
                  />
                  <LegendPanel
                    symbols={symbols}
                    assemblies={allAssemblies.map(a => ({
                      id: a.id,
                      name: a.name,
                      category: a.category,
                    }))}
                    activeAssemblyId={armedGroup?.assemblyId ?? null}
                    capturing={capturingSymbol}
                    onStartCapture={() => setCapturingSymbol(true)}
                    onCancelCapture={() => setCapturingSymbol(false)}
                    onLink={(symbolId, assemblyId) =>
                      linkSymbol.mutate({ id: symbolId, assemblyId })
                    }
                    onUnlink={id => unlinkSymbol.mutate({ id })}
                    onRemove={id => removeSymbol.mutate({ id })}
                    onUseSymbol={symbol => {
                      const assembly = allAssemblies.find(
                        a => a.id === symbol.assemblyId
                      );
                      if (!assembly) return;
                      groupForAssembly
                        .mutateAsync({ bidId, assemblyId: assembly.id })
                        .then(group => armGroup(group, assembly.id))
                        .catch(() => {
                          /* the mutation's onError has already said so */
                        });
                    }}
                  />
                </>
              }
              totals={totals}
              selectedRunId={selectedRunId}
              onSelectRun={setSelectedRunId}
              onRemoveRun={id => removeRun.mutate({ id })}
              onCommitRun={id => commitRun.mutate({ id })}
              onAcceptSuggestion={id => acceptSuggestion.mutate({ id })}
              onAddCircuit={(runId, name, conductorCount, groundCount) =>
                addCircuit.mutate({ runId, name, conductorCount, groundCount })
              }
              onUpdateCircuit={(id, patch) =>
                updateCircuit.mutate({ id, ...patch })
              }
              onRemoveCircuit={id => removeCircuit.mutate({ id })}
            />
          </SidePanel>
        </div>
      )}

      {dragging && docs.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-[#F5C518] bg-card px-10 py-8 text-center">
            <Upload className="w-9 h-9 mx-auto mb-3 text-[#F5C518]" />
            <p className="text-base font-medium">Drop to attach to this bid</p>
          </div>
        </div>
      )}

      <AlertDialog
        open={confirmRemove !== null}
        onOpenChange={open => !open && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removalChecking || !removalWarning
                ? "Remove this plan?"
                : removalWarning.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {removalChecking || !removalWarning ? (
                  <p>Checking what is on {confirmRemove?.filename}…</p>
                ) : (
                  <>
                    <p>{removalWarning.lead}</p>
                    {removalWarning.losses.length > 0 && (
                      <ul className="list-disc pl-5 space-y-0.5 text-foreground">
                        {removalWarning.losses.map(loss => (
                          <li key={loss}>{loss}</li>
                        ))}
                      </ul>
                    )}
                    {removalWarning.after.map(line => (
                      <p key={line}>{line}</p>
                    ))}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={removalChecking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmRemove) remove.mutate({ id: confirmRemove.id });
                setConfirmRemove(null);
              }}
            >
              {removalChecking || !removalWarning
                ? "Remove plan"
                : removalWarning.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
