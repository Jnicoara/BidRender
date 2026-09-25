/**
 * PDF Renderer Web Worker
 *
 * Runs pdfjs page rendering on a dedicated thread so the main thread stays
 * completely responsive during PDF rasterization (which can take 2-13 seconds
 * on complex electrical drawings).
 *
 * Protocol:
 *   Main → Worker:  { type: 'load', pdfData: ArrayBuffer, hash: string }
 *   Main → Worker:  { type: 'loadUrl', url: string, hash: string, byteSize?: number }
 *   Main → Worker:  { type: 'render', pageNum: number, scale: number, hash: string, reqId: string, rect?: PageRect }
 *   Main → Worker:  { type: 'outline', hash: string, reqId: string }
 *   Main → Worker:  { type: 'text', pageNum: number, hash: string, reqId: string }
 *   Worker → Main:  { type: 'rendered', reqId: string, bitmap: ImageBitmap, pageNum: number, hash: string,
 *                     scale: number, rect: PageRect, pageWidth: number, pageHeight: number }
 *   Worker → Main:  { type: 'outline', reqId: string, entries: {pageNumber,title}[] }
 *   Worker → Main:  { type: 'text', reqId: string, pageNum: number, text: string }
 *   Worker → Main:  { type: 'error', reqId: string, message: string }
 *
 * Callers must IGNORE messages they do not recognise. pdfjs runs its own
 * worker entry inside this one and posts a `{sourceName,targetName,action}`
 * handshake that reaches the parent — harmless, but it arrives before the
 * first real reply.
 *
 * ── `render` takes a REGION, and knows nothing about a viewport ──────────────
 * `rect` is a rectangle of the page in page points (see `@shared/planRegion`),
 * and omitting it means the whole sheet. The viewer asks for the part someone
 * is looking at; the plan reader's tiler asks for a grid of rectangles on the
 * same page. Neither is special here, deliberately: a worker taught about "the
 * current view" would be useless to the tiler, and the work would be written
 * twice.
 *
 * The reply carries the scale and the rect that were ACTUALLY used, which may
 * not be what was asked for — the region is trimmed to the page, and the scale
 * is reduced if the bitmap would be too large. Read them from the reply. Do not
 * assume, and do not keep a constant in step by hand.
 */

import * as pdfjs from "pdfjs-dist";
import { pdfRangeLoadOptions } from "@shared/pdfRangeLoading";
import {
  clampRegion,
  fitScaleToBudget,
  regionPixelSize,
  wholePage,
  type PageRect,
} from "@shared/planRegion";

// pdfjs needs a real worker entry, even from inside a worker.
//
// This was `= ""`, which older pdfjs read as "do the work in this thread".
// pdfjs 5 rejects an empty value outright — `getDocument` throws
// `No "GlobalWorkerOptions.workerSrc" specified` — so every load through here
// failed and callers fell back to rendering on the main thread, which is the
// one thing this worker exists to prevent.
//
// Pointing at the real module spawns a nested worker, which Chrome supports,
// and matches what PlanPanel and PlanViewer already set on the main thread.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Everything pdfjs would otherwise borrow from `document`, which a worker
 * does not have.
 *
 * pdfjs defaults to DOM implementations: a canvas factory that calls
 * `document.createElement("canvas")` for scratch canvases (masks, patterns,
 * transparency groups), an SVG filter factory, and a font loader that injects
 * @font-face rules into the page. In here each of those throws "Cannot read
 * properties of undefined (reading 'createElement')" — but only for a PDF that
 * needs them, which is every real drawing and no blank test page. Loading and
 * page counts still worked, so nothing looked wrong until a sheet was drawn.
 *
 *   - Scratch canvases are OffscreenCanvas, which workers do have.
 *   - Filters (transfer functions, luminosity masks) are skipped, as pdfjs
 *     does itself outside a browser. Drawings rarely use them.
 *   - Text is drawn as outlines from the font data rather than loaded as a web
 *     font — again how pdfjs renders without a DOM, and it looks the same.
 */
class OffscreenCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = new OffscreenCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext("2d", { willReadFrequently: true }),
    };
  }
  reset(
    canvasAndContext: { canvas: OffscreenCanvas | null },
    width: number,
    height: number
  ) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: {
    canvas: OffscreenCanvas | null;
    context: unknown;
  }) {
    if (!canvasAndContext.canvas) throw new Error("Canvas is not specified");
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

class NoFilterFactory {
  addFilter() {
    return "none";
  }
  addHCMFilter() {
    return "none";
  }
  addAlphaFilter() {
    return "none";
  }
  addLuminosityFilter() {
    return "none";
  }
  addHighlightHCMFilter() {
    return "none";
  }
  destroy() {}
}

const WORKER_SAFE_OPTIONS = {
  CanvasFactory: OffscreenCanvasFactory,
  FilterFactory: NoFilterFactory,
  disableFontFace: true,
};

let pdfDoc: import("pdfjs-dist").PDFDocumentProxy | null = null;
let loadedHash: string | null = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === "load" || msg.type === "loadUrl") {
    // Prefer pdf.js's URL transport. It uses HTTP Range requests when the
    // storage response supports them, so a 500MB set does not need to be held
    // in tab memory before the first sheet can render. ArrayBuffer remains the
    // deliberate fallback for storage endpoints that do not support ranges.
    try {
      const t0 = performance.now();
      const loadingTask =
        msg.type === "loadUrl"
          ? pdfjs.getDocument({
              ...pdfRangeLoadOptions(
                msg.url,
                msg.byteSize ?? null,
                self.location.href
              ),
              ...WORKER_SAFE_OPTIONS,
            })
          : pdfjs.getDocument({
              data: new Uint8Array(msg.pdfData),
              ...WORKER_SAFE_OPTIONS,
            });
      pdfDoc = await loadingTask.promise;
      loadedHash = msg.hash;
      const elapsed = (performance.now() - t0).toFixed(0);
      self.postMessage({
        type: "loaded",
        hash: msg.hash,
        numPages: pdfDoc.numPages,
        elapsed,
      });
    } catch (err) {
      self.postMessage({
        type: "error",
        reqId: msg.reqId,
        message: String(err),
      });
    }
    return;
  }

  if (msg.type === "render") {
    const { pageNum, scale, hash, reqId, rect } = msg;
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const t0 = performance.now();
      const page = await pdfDoc.getPage(pageNum);

      // The page's own size in points, rotation already applied. Everything
      // below is expressed against this, never against the screen.
      const base = page.getViewport({ scale: 1 });

      // No rect means the whole sheet, so the old single-argument callers keep
      // working unchanged.
      const asked: PageRect = rect ?? wholePage(base.width, base.height);
      const region = clampRegion(asked, base.width, base.height);
      if (!region) {
        self.postMessage({
          type: "error",
          reqId,
          message: "That part of the sheet is off the page.",
        });
        return;
      }

      // Degrade rather than refuse: a slightly softer drawing beats an error
      // where a drawing should be. The scale actually used travels back with
      // the bitmap, so nobody has to assume they got what they asked for.
      const usedScale = fitScaleToBudget(region, scale);
      if (usedScale <= 0) {
        self.postMessage({
          type: "error",
          reqId,
          message: `Cannot draw at scale ${scale}.`,
        });
        return;
      }

      // Draw the page at full resolution but shifted, so only the wanted
      // rectangle lands on a canvas the size of that rectangle. offsetX/offsetY
      // are in device pixels and are added to the viewport's transform, so the
      // shift is the region's origin scaled up, negated.
      const viewport = page.getViewport({
        scale: usedScale,
        offsetX: -region.x * usedScale,
        offsetY: -region.y * usedScale,
      });
      const size = regionPixelSize(region, usedScale);

      const offscreen = new OffscreenCanvas(size.width, size.height);
      const ctx = offscreen.getContext("2d")!;
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        canvas: null as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const bitmap = await createImageBitmap(offscreen);
      const elapsed = (performance.now() - t0).toFixed(0);
      // Transfer the bitmap to the main thread (zero-copy).
      //
      // `scale` and `rect` ride along deliberately. A caller that has to
      // remember what it asked for — or worse, read a shared constant — is one
      // refactor away from telling the plan reader the wrong page size and
      // putting every proposed stamp in the wrong place.
      (self as unknown as Worker).postMessage(
        {
          type: "rendered",
          reqId,
          pageNum,
          hash,
          bitmap,
          scale: usedScale,
          rect: region,
          pageWidth: base.width,
          pageHeight: base.height,
          elapsed,
        },
        { transfer: [bitmap] }
      );
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  /**
   * The document's bookmark tree, flattened to one title per page.
   *
   * Architectural sets very often carry this, and it holds the sheet's REAL
   * name ("E1 - Power Plan") rather than a page number. Resolving an outline
   * destination to a page index is async per entry and needs the parsed
   * document, so it belongs in here beside pdfjs rather than on the main
   * thread.
   *
   * Best-effort throughout: a set with no outline, or with destinations that
   * do not resolve, returns an empty list rather than failing the open. The
   * sheet index falls back to "Sheet N" and the user renames from there.
   */
  if (msg.type === "outline") {
    const { hash, reqId } = msg;
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({ type: "outline", reqId, entries: [] });
      return;
    }
    try {
      const outline = await pdfDoc.getOutline();
      const entries: { pageNumber: number; title: string }[] = [];

      const walk = async (items: any[] | null) => {
        if (!items) return;
        for (const item of items) {
          try {
            const dest =
              typeof item.dest === "string"
                ? await pdfDoc!.getDestination(item.dest)
                : item.dest;
            if (Array.isArray(dest) && dest[0]) {
              const pageIndex = await pdfDoc!.getPageIndex(dest[0]);
              const title = String(item.title ?? "").trim();
              if (title) entries.push({ pageNumber: pageIndex + 1, title });
            }
          } catch {
            // One unresolvable bookmark must not cost the whole outline.
          }
          await walk(item.items ?? null);
        }
      };

      await walk(outline);
      self.postMessage({ type: "outline", reqId, entries });
    } catch {
      self.postMessage({ type: "outline", reqId, entries: [] });
    }
    return;
  }

  /**
   * The text on one page, for scale detection.
   *
   * Joined with spaces in the order pdfjs returns items, which is the order
   * they were drawn rather than reading order — good enough for finding a
   * scale note, and the reason detection treats what it finds with suspicion
   * (see shared/planScale.ts).
   */
  if (msg.type === "text") {
    const { pageNum, hash, reqId } = msg;
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map(item => ("str" in item ? item.str : ""))
        .join(" ");
      self.postMessage({ type: "text", reqId, pageNum, text });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  /**
   * A message this worker does not understand.
   *
   * Unreachable today — every type the page sends has a branch above. It exists
   * because of what happens WITHOUT it: `e.data` is untyped, so there is no
   * compile-time check that a new message type got a handler here, and a
   * message that falls off the end of this chain posts nothing at all. The
   * page's `pending` map has no timeout, so its promise never settles: the
   * sheet simply never draws, with no error, no log, and nothing on screen
   * saying what is being waited for.
   *
   * Same failure this whole change is about — something accepted, silently
   * dropped, no symptom at the point of the mistake. Rejecting instead costs
   * nothing and the page already knows how to surface an `error`.
   */
  self.postMessage({
    type: "error",
    reqId: msg?.reqId,
    message: `pdfRenderer.worker has no handler for message type "${msg?.type}"`,
  });
};
