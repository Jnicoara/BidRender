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
 * the plan reader that proposes stamps for you to accept. Everything placed
 * lands on the bid — see RunsPanel and the counted-items list for the totals.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Cable,
  ChevronLeft,
  ChevronRight,
  FileText,
  ClipboardList,
  Loader2,
  Plus,
  MapPin,
  Maximize2,
  Minus,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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
  clampView,
  fitView,
  formatZoom,
  wheelZoomFactor,
  zoomAbout,
  type PlanView,
  type ViewBounds,
} from "@/lib/planView";
import { SheetIndex } from "@/components/takeoff/SheetIndex";
import { ScaleControl } from "@/components/takeoff/ScaleControl";
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
import { RunsPanel } from "@/components/takeoff/RunsPanel";
import {
  clearDraft,
  clearStampQueue,
  hasUnsavedWork,
  loadDraft,
  loadStampQueue,
  saveDraft,
  saveStampQueue,
  type QueuedStamp,
} from "@/lib/traceDraft";
import { LegendPanel } from "@/components/takeoff/LegendPanel";
import { CoPilotPanel } from "@/components/takeoff/CoPilotPanel";
import { snapshotPage } from "@/lib/planSnapshot";
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
import type { PagePoint } from "@shared/takeoffGeometry";
import type { RunPathType } from "@shared/takeoffQuantities";

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
        pending.current.get(msg.reqId)?.resolve(msg.bitmap);
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
      render: (pageNum: number, scale: number, hash: string) =>
        ask<ImageBitmap>({ type: "render", pageNum, scale, hash }),
      outline: (hash: string) =>
        ask<{ pageNumber: number; title: string }[]>({ type: "outline", hash }),
      pageText: (pageNum: number, hash: string) =>
        ask<string>({ type: "text", pageNum, hash }),
    }),
    [load, loadUrl, ask]
  );
}

// ── The drawing pane ─────────────────────────────────────────────────────────

const RENDER_SCALE = 1.5;

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
}: {
  doc: Document;
  page: number;
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
  onPageRendered?: (pageNumber: number, canvas: HTMLCanvasElement) => void;
  /**
   * The tracing layer, drawn over the page at the same size. Given the canvas
   * dimensions so its coordinate space matches the rasterised page exactly —
   * a mismatch here would put every measurement out by a constant factor.
   */
  overlay?: (size: {
    width: number;
    height: number;
    renderScale: number;
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

  const fitToView = useCallback(() => {
    const bounds = readBounds();
    if (bounds) setView(fitView(bounds));
  }, [readBounds]);

  /**
   * Fit whenever a different page is drawn.
   *
   * Keyed on the canvas size rather than the page number, because that is what
   * actually changes when a new raster lands — and a sheet of a different size
   * needs a different fit, which a page number would not tell us.
   */
  useEffect(() => {
    fitToView();
  }, [canvasSize.width, canvasSize.height, fitToView]);

  /** Re-clamp when the pane is resized, so a drag cannot strand the sheet. */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const bounds = readBounds();
      if (bounds) setView(current => clampView(current, bounds));
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
      setView(current =>
        zoomAbout(current, bounds, wheelZoomFactor(e.deltaY), anchor)
      );
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [readBounds]);

  /** Zoom a step about the middle of the viewport, for the buttons and keys. */
  const zoomByStep = useCallback(
    (factor: number) => {
      const bounds = readBounds();
      if (!bounds) return;
      setView(current =>
        zoomAbout(current, bounds, factor, {
          x: bounds.viewportWidth / 2,
          y: bounds.viewportHeight / 2,
        })
      );
    },
    [readBounds]
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
   * No check for "is a tool armed" is needed, and that is not laziness: while
   * tracing or stamping, TraceLayer's overlay takes the event and this never
   * fires. If the event got here, nothing else wanted it.
   */
  const beginPlainPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || spaceHeld) return;
      startPan(e);
    },
    [spaceHeld, startPan]
  );

  /** Space-drag and middle-drag pan even while a tool is armed. */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1 && !spaceHeld) return;
      e.preventDefault();
      e.stopPropagation();
      startPan(e);
    };
    vp.addEventListener("pointerdown", onDown, true);
    return () => vp.removeEventListener("pointerdown", onDown, true);
  }, [spaceHeld, startPan]);

  /** The drag itself, on the window so it survives leaving the viewport. */
  useEffect(() => {
    if (!panning) return;
    const move = (e: PointerEvent) => {
      const from = panFrom.current;
      const bounds = readBounds();
      if (!from || !bounds) return;
      setView(
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
  }, [panning, readBounds]);
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

  // Paint the current page.
  useEffect(() => {
    if (loading || error || pageCount === 0) return;
    let cancelled = false;
    setRendering(true);

    render(page, RENDER_SCALE, hash)
      .then(bitmap => {
        if (cancelled) return bitmap.close();
        const canvas = canvasRef.current;
        if (!canvas) return bitmap.close();
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        setCanvasSize({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
        setRendering(false);
        onPageRendered?.(page, canvas);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => go(page - 1)}
          disabled={loading || page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-mono text-xs tabular-nums min-w-[4.5rem] text-center">
          {loading ? "—" : `${page} / ${pageCount}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => go(page + 1)}
          disabled={loading || page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {rendering && !loading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Drawing…
          </span>
        )}

        {/* Zoom. Sits beside the page controls because both are "where am I
            looking", and both get reached constantly while counting. */}
        <div className="ml-auto flex items-center gap-1">
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
      </div>

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
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            }}
          >
            <div className="relative w-fit">
              <canvas
                ref={canvasRef}
                className="rounded-lg shadow-lg bg-white block"
              />
              {canvasSize.width > 0 &&
                overlay?.({
                  ...canvasSize,
                  /*
                    STEP 5 WILL CHANGE THIS LINE. When the render resolution
                    becomes dynamic, this must pass the scale the page was
                    ACTUALLY drawn at, not the constant — and so must both
                    `snapshotPage` calls further down this file, or the plan
                    reader is told the wrong scale for the image it is given
                    and every proposed stamp lands in the wrong place.

                    Safe today precisely because the resolution is pinned:
                    `snapshotPage` reads `canvas.width`, the bitmap's intrinsic
                    size, which a CSS transform never touches.
                  */
                  renderScale: RENDER_SCALE,
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

// ── The page ─────────────────────────────────────────────────────────────────

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

  // ── Tracing (phase 2b) ────────────────────────────────────────────────────
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

  // ── Stamping (phase 2c) ───────────────────────────────────────────────────
  /** The assembly the stamp tool holds. Chosen once, then click, click, click. */
  const [stampAssembly, setStampAssembly] = useState<{
    id: number | null;
    name: string;
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
  /** Clicks not yet confirmed by the server. Mirrored locally; see traceDraft. */
  const pendingStamps = useRef<QueuedStamp[]>([]);
  /** Which layers are showing. Null until a sheet's contents are known. */
  const [layerState, setLayerState] = useState<LayerState | null>(null);
  const hadSystem = useRef<Set<string>>(new Set());
  const hadLocation = useRef<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement | null>(null);

  const doc = docs.find(d => d.id === selectedDocId) ?? docs[0] ?? null;

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

  const setSheetScale = trpc.bidPdfs.setSheetScale.useMutation({
    onSuccess: sheet => {
      toast.success(`Scale set to ${sheet.scaleText}.`);
      refreshSheets();
    },
    onError: error => toast.error(error.message),
  });

  const clearSheetScale = trpc.bidPdfs.clearSheetScale.useMutation({
    onSuccess: refreshSheets,
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

  const refreshRuns = useCallback(() => {
    if (activeSheet)
      void utils.takeoffRuns.listForSheet.invalidate({
        sheetId: activeSheet.id,
      });
    void utils.takeoffRuns.totals.invalidate({ bidId });
  }, [utils, activeSheet?.id, bidId]);

  const { data: stamps = [] } = trpc.takeoffStamps.listForSheet.useQuery(
    { sheetId: activeSheet?.id ?? 0 },
    { enabled: Boolean(activeSheet) }
  );
  const { data: symbols = [] } = trpc.takeoffStamps.symbols.useQuery();
  const { data: allAssemblies = [] } = trpc.assemblies.list.useQuery();

  const refreshStamps = useCallback(() => {
    if (activeSheet) {
      void utils.takeoffStamps.listForSheet.invalidate({
        sheetId: activeSheet.id,
      });
      void utils.takeoffStamps.countedItems.invalidate({
        sheetId: activeSheet.id,
      });
    }
  }, [utils, activeSheet?.id]);

  const dropStamps = trpc.takeoffStamps.drop.useMutation({
    onError: e => toast.error(e.message),
    onSettled: refreshStamps,
  });
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
  const pageTextByPage = useRef<Map<number, string>>(new Map());
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  /**
   * Read each sheet as it is opened, rather than on a button press.
   *
   * Remembered per browser rather than per account: it is a preference about
   * how this one machine works, and a contractor on a metered connection in a
   * truck may well want it off there and on at the office. Each sheet is still
   * read at most once — the server returns a stored reading unless the user
   * asks for a re-read — so leaving it on cannot run away with the bill.
   */
  // The storage key keeps the product's old name on purpose, so a choice a
  // browser has already saved still applies.
  const [autoRead, setAutoRead] = useState(() => {
    if (typeof window === "undefined") return true;
    return (
      window.localStorage.getItem("helixbid.planReader.autoRead") !== "off"
    );
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
    (pageNumber: number, canvas: HTMLCanvasElement) => {
      pageCanvas.current = canvas;
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
          `Placed ${result.placed} ${result.placed === 1 ? "stamp" : "stamps"}.`
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
      const snapshot = snapshotPage(pageCanvas.current, RENDER_SCALE);
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
    [activeSheet?.id, canRead, bidId, page, readSheet]
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
   * Queue a click and flush shortly after.
   *
   * Queued rather than sent per click: an estimator drops markers faster than a
   * round trip, and a request per click would put the drawing behind the
   * network. The local mirror covers the window where the clicks exist only
   * here.
   */
  const flushTimer = useRef<number | null>(null);
  const queueStamp = useCallback(
    (at: { x: number; y: number }) => {
      if (!activeSheet || !stampAssembly) return;
      pendingStamps.current = [
        ...pendingStamps.current,
        {
          assemblyId: stampAssembly.id,
          assemblyName: stampAssembly.name,
          x: at.x,
          y: at.y,
        },
      ];
      saveStampQueue(activeSheet.id, bidId, pendingStamps.current);

      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => {
        const batch = pendingStamps.current;
        if (batch.length === 0 || !activeSheet) return;
        pendingStamps.current = [];
        dropStamps.mutate(
          {
            bidId,
            sheetId: activeSheet.id,
            assemblyId: batch[0].assemblyId,
            assemblyName: batch[0].assemblyName,
            at: batch.map(b => ({ x: b.x, y: b.y })),
          },
          {
            onSuccess: () => clearStampQueue(activeSheet.id),
            // Put the batch back so it is retried and stays mirrored, rather than
            // vanishing because one request failed.
            onError: () => {
              pendingStamps.current = [...batch, ...pendingStamps.current];
              saveStampQueue(activeSheet.id, bidId, pendingStamps.current);
            },
          }
        );
      }, 700);
    },
    [activeSheet?.id, stampAssembly, bidId, dropStamps]
  );

  /** Recover stamps clicked but never sent, after a crash or reload. */
  useEffect(() => {
    if (!activeSheet) return;
    const queued = loadStampQueue(activeSheet.id);
    if (!queued || queued.stamps.length === 0) return;
    dropStamps.mutate(
      {
        bidId: queued.bidId,
        sheetId: activeSheet.id,
        assemblyId: queued.stamps[0].assemblyId,
        assemblyName: queued.stamps[0].assemblyName,
        at: queued.stamps.map(st => ({ x: st.x, y: st.y })),
      },
      {
        onSuccess: () => {
          clearStampQueue(activeSheet.id);
          toast.success(
            `Recovered ${queued.stamps.length} stamp${queued.stamps.length === 1 ? "" : "s"} from your last session.`
          );
        },
      }
    );
  }, [activeSheet?.id]);

  /** Escape puts the stamp tool down. */
  useEffect(() => {
    if (!stampAssembly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setStampAssembly(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stampAssembly]);

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
        systemKey: systemKeyForRun(run.pathType as "conduit" | "cable"),
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
          assemblyId: st.assemblyId,
          assemblyName: st.assemblyName,
          x: st.x,
          y: st.y,
        }))
      ),
    [visibleStamps]
  );

  const saveRun = trpc.takeoffRuns.save.useMutation({
    onError: e => toast.error(e.message),
  });
  const commitRun = trpc.takeoffRuns.commit.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: result =>
      toast.success(`Run finished — ${result.lengthFeet} ft.`),
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
  }, [activeSheet, tracePoints, tracePathType, bidId, saveRun, commitRun]);

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

      <div className="border-b border-border px-6 py-3 shrink-0">
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
            <p className="text-xs text-muted-foreground">
              Set each sheet's scale, then stamp and trace what is on it.
              Everything you place lands on the bid.
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
          {/* Documents, then the sheets within the chosen one. Docked rather
              than a drawer: choosing a sheet is the most frequent action here
              and a drawer would put a click in front of every one. */}
          <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
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
          </aside>

          {/* The split: drawing on the left, work pane on the right. Built now
              so the counted-items list and legend land in a structure that
              exists, rather than as a drawer bolted on later. */}
          <ResizablePanelGroup
            direction="horizontal"
            className="flex-1 min-w-0"
          >
            <ResizablePanel
              defaultSize={68}
              minSize={35}
              className="flex flex-col min-w-0"
            >
              {doc && (
                <>
                  <PlanPane
                    key={doc.id}
                    doc={doc}
                    page={page}
                    onPage={setPage}
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
                            points={tracePoints}
                            onPointsChange={setTracePoints}
                            existingRuns={visibleRuns}
                            onFinish={finishTrace}
                            onCancel={cancelTrace}
                            selectedRunId={selectedRunId}
                            onSelectRun={setSelectedRunId}
                            stamping={Boolean(stampAssembly) && !tracing}
                            stampAssemblyName={stampAssembly?.name ?? null}
                            stamps={visibleStamps.map(st => ({
                              id: st.id,
                              assemblyName: st.assemblyName,
                              x: st.x,
                              y: st.y,
                            }))}
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
                  {/* Rendered under the pager rather than inside PlanPane so
                      the sheet row (and its mutations) stay owned here. */}
                  {activeSheet && (
                    <div className="border-t border-border bg-card px-3 py-1.5 shrink-0 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground truncate max-w-[14rem]">
                        {activeSheet.name}
                      </span>
                      <div className="w-px h-4 bg-border" />
                      {/* Tracing is offered only when the sheet can actually
                          be measured — an enabled tool that produces no number
                          teaches people the app is broken. */}
                      {measurability?.ok && !tracing && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => startTracing("conduit")}
                          >
                            <Zap className="w-3.5 h-3.5 text-[#F5C518]" /> Trace
                            conduit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => startTracing("cable")}
                          >
                            <Cable className="w-3.5 h-3.5 text-emerald-400" />{" "}
                            Trace cable
                          </Button>
                          <div className="w-px h-4 bg-border" />
                        </>
                      )}

                      {/* Outside the measurability gate on purpose. Counting
                          devices needs no scale, so the control that says what
                          is being stamped — and the only way to stop — must not
                          disappear on an unscaled sheet. */}
                      {stampAssembly ? (
                        <>
                          <Button
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setStampAssembly(null)}
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            Stamping {stampAssembly.name}
                            <X className="w-3 h-3" />
                          </Button>
                          <div className="w-px h-4 bg-border" />
                        </>
                      ) : null}

                      <ScaleControl
                        sheet={activeSheet}
                        notToScale={notToScaleBySheet[activeSheet.id] ?? false}
                        onSet={scaleText =>
                          setSheetScale.mutate({
                            id: activeSheet.id,
                            scaleText,
                          })
                        }
                        onClear={() =>
                          clearSheetScale.mutate({ id: activeSheet.id })
                        }
                      />
                    </div>
                  )}
                </>
              )}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={32} minSize={18} className="min-w-0">
              <RunsPanel
                runs={visibleRuns.map(r => ({
                  ...r,
                  firstPoint: r.points[0] ?? null,
                }))}
                stampGroups={stampGroups}
                onJumpTo={at => {
                  setFocusPoint(at);
                  // Clear the highlight after a moment — a marker that stays
                  // ringed forever stops meaning "this is the one".
                  window.setTimeout(() => setFocusPoint(null), 2200);
                }}
                onRemoveStamp={id => removeStamp.mutate({ id })}
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
                            RENDER_SCALE
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
                      activeAssemblyId={stampAssembly?.id ?? null}
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
                        setStampAssembly({
                          id: assembly.id,
                          name: assembly.name,
                        });
                        toast.success(
                          `Stamping ${assembly.name} — click to place.`
                        );
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
                onAddCircuit={(runId, name, conductorCount) =>
                  addCircuit.mutate({ runId, name, conductorCount })
                }
                onUpdateCircuit={(id, conductorCount) =>
                  updateCircuit.mutate({ id, conductorCount })
                }
                onRemoveCircuit={id => removeCircuit.mutate({ id })}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
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
