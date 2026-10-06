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
 *   Main → Worker:  { type: 'findMatching', pageNum, hash, reqId, box: {x,y,width,height} }
 *   Worker → Main:  { type: 'matches', reqId, result: FindResult, readMs, findMs }
 *   Main → Worker:  { type: 'sheetCheck', hash, reqId, legendPage, planPage, input: SheetCheckInput }
 *   Worker → Main:  { type: 'sheetChecked', reqId, result: SheetCheckResult | null, scan, ms? }
 *   Main → Worker:  { type: 'connectPoints', pageNum, hash, reqId, marks: {id,x,y,family}[] }
 *   Worker → Main:  { type: 'connectPoints', reqId, points: [id, ConnectPoint][] }
 *   Main → Worker:  { type: 'scaleEvidence', pageNum, hash, reqId }
 *   Worker → Main:  { type: 'scaleEvidence', reqId, arcRadii: number[] | null, titleScales }
 *   Main → Worker:  { type: 'schedules', pageNum, hash, reqId }
 *   Worker → Main:  { type: 'schedules', reqId, schedules: SheetSchedules, scan: boolean }
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
import { connectPointFor, type ConnectMark } from "@shared/connectPoint";
import {
  isScan,
  prepareSheet,
  searchSymbol,
  symbolFromBox,
  type FindResult,
  type MatchBox,
  type SymbolTemplate,
} from "@/lib/findMatching";
import { findOnScan, type OpenCv, type ScanImage } from "@/lib/scanMatching";
import {
  mergeLookResults,
  type LookResult,
  type LookSource,
  type SavedLook,
} from "@/lib/lookMatching";
import { runSheetCheck } from "@/lib/sheetCheck";
import { layerIdsFrom } from "@/lib/cadLayers";
import { quarterArcRadii } from "@/lib/scaleCheck";
import { readSchedules, type PanelSchedule } from "@/lib/panelSchedules";
import { readCircuitTags, readHomeruns } from "@/lib/homeruns";
import { detectScaleFromText } from "@shared/planScale";
import {
  extractVectorGeometry,
  type VectorGeometry,
} from "@/lib/vectorGeometry";
import { wordBoxes, type RawTextItem, type WordBox } from "@/lib/textSelection";
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
type MatchPage = { key: string; geo: VectorGeometry; words: WordBox[] };
/**
 * The line work and words of the last TWO pages searched — a sheet check
 * needs the legend sheet and the plan sheet at once, and each is a few MB, so
 * two and no more. Most recent last.
 */
let matchPages: MatchPage[] = [];

/**
 * The document's CAD layers, optional-content id -> name, read once per
 * document (@/lib/cadLayers). Empty when it has none or they cannot be read
 * — the matcher then searches everything, as before layers.
 */
const layerIdsByDoc = new Map<string, Promise<Map<string, string>>>();

/**
 * Every panel schedule in the open set, read once per document from each
 * page's TEXT only (no line work), for tying homerun tags to circuits.
 * Asked only when a sheet has a homerun, so a set without any never pays.
 */
const panelsByDoc = new Map<string, Promise<PanelSchedule[]>>();
function panelsInDoc(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  hash: string
): Promise<PanelSchedule[]> {
  let read = panelsByDoc.get(hash);
  if (!read) {
    read = (async () => {
      const panels: PanelSchedule[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items: RawTextItem[] = [];
        for (const item of content.items)
          if ("str" in item && item.str)
            items.push({
              str: item.str,
              transform: item.transform,
              width: item.width,
            });
        // A schedule needs its CKT. header; most sheets are skipped here.
        if (!items.some(i => /CKT/i.test(i.str))) continue;
        panels.push(
          ...readSchedules(
            wordBoxes({ items, viewportTransform: viewport.transform })
          ).panels
        );
      }
      return panels;
    })();
    panelsByDoc.set(hash, read);
    if (panelsByDoc.size > 2)
      panelsByDoc.delete(panelsByDoc.keys().next().value!);
  }
  return read;
}
function layerIdsOf(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  hash: string
): Promise<Map<string, string>> {
  let ids = layerIdsByDoc.get(hash);
  if (!ids) {
    ids = doc
      .getOptionalContentConfig()
      .then(config => layerIdsFrom(config))
      .catch(() => new Map<string, string>());
    if (layerIdsByDoc.size >= 8) layerIdsByDoc.clear();
    layerIdsByDoc.set(hash, ids);
  }
  return ids;
}

async function readMatchPage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  hash: string,
  pageNum: number
): Promise<MatchPage> {
  const key = `${hash}#${pageNum}`;
  const cached = matchPages.find(p => p.key === key);
  if (cached) {
    matchPages = [...matchPages.filter(p => p !== cached), cached];
    return cached;
  }
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const [list, content, layerIds] = await Promise.all([
    page.getOperatorList(),
    page.getTextContent(),
    layerIdsOf(doc, hash),
  ]);
  const items: RawTextItem[] = [];
  for (const item of content.items)
    if ("str" in item && item.str)
      items.push({
        str: item.str,
        transform: item.transform,
        width: item.width,
      });
  const read: MatchPage = {
    key,
    geo: extractVectorGeometry(
      list.fnArray,
      list.argsArray,
      pdfjs.OPS as unknown as Record<string, number>,
      viewport.transform,
      viewport.width,
      viewport.height,
      layerIds
    ),
    words: wordBoxes({ items, viewportTransform: viewport.transform }),
  };
  matchPages = [...matchPages.slice(-1), read];
  return read;
}

/**
 * opencv.js (10 MB), fetched the first time a SCAN is searched and never
 * before: its own chunk, behind a dynamic import, so opening a plan, a
 * vector sheet's search and a refused scan symbol never download it.
 */
let openCv: Promise<OpenCv> | null = null;
function loadOpenCv(): Promise<OpenCv> {
  // Through ./openCvModule, never `import("@techstark/opencv-js")` directly:
  // that import never settles (the reason is in that file).
  openCv ??= import("./openCvModule").then(async mod => {
    let cv = mod.openCvModule();
    // The build hands over either a promise of the module or the module
    // with its runtime still starting.
    if (cv instanceof Promise) cv = (await cv) as Record<string, unknown>;
    else if (!cv.Mat) {
      // Started, or starting: any of its three signals will do, since the
      // runtime may already be up before a callback can be set, and then
      // `onRuntimeInitialized` never fires. A limit, so a runtime that never
      // comes up says so instead of leaving "Looking across the sheet…" up.
      const ready = cv;
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          clearInterval(poll);
          clearTimeout(limit);
          resolve();
        };
        const poll = setInterval(() => ready.Mat && done(), 50);
        const limit = setTimeout(() => {
          clearInterval(poll);
          reject(new Error("opencv.js did not start"));
        }, 60_000);
        ready.onRuntimeInitialized = done;
        // Called with no argument: resolving WITH the module would chase its
        // own `then` forever (see below).
        if (typeof ready.then === "function")
          (ready.then as (f: () => void) => void)(() => done());
      });
    }
    // The emscripten module is a THENABLE: returned from a promise as it
    // is, every await resolves it again, forever, and the search never
    // starts (seen in the check script, 2026-10-01). Ready now, so drop it.
    delete cv.then;
    return cv as unknown as OpenCv;
  });
  openCv.catch(() => {
    openCv = null; // a failed download may be retried by the next search
  });
  return openCv;
}

/** Part of a page drawn grey at `scale` pixels a point, for the scan matcher. */
async function renderGray(
  page: import("pdfjs-dist").PDFPageProxy,
  rect: { x: number; y: number; width: number; height: number },
  scale: number
): Promise<ScanImage> {
  const viewport = page.getViewport({
    scale,
    offsetX: -rect.x * scale,
    offsetY: -rect.y * scale,
  });
  const width = Math.max(1, Math.ceil(rect.width * scale));
  const height = Math.max(1, Math.ceil(rect.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: null as unknown as HTMLCanvasElement,
    viewport,
  }).promise;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let k = 0; k < gray.length; k++)
    gray[k] =
      (rgba[4 * k] * 0.299 +
        rgba[4 * k + 1] * 0.587 +
        rgba[4 * k + 2] * 0.114) |
      0;
  return { gray, width, height, x0: rect.x, y0: rect.y, scale };
}

type WorkerLook = SavedLook;

const sourceOf = (look: WorkerLook): LookSource => ({
  kind: "look",
  lookId: look.id,
  setName: look.setName,
  confirmsThisSet: look.confirmsThisSet,
});

/**
 * Templates rebuilt from other plan sets, by look id: opening another set's
 * drawing costs a document load and an operator list, and the next search on
 * the next sheet wants the same looks. A few dozen KB each; capped.
 */
const otherSetTemplates = new Map<number, SymbolTemplate | null>();

/** The look's symbol, rebuilt from the line work of its own sheet. */
async function vectorLookTemplate(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  hash: string,
  look: WorkerLook
): Promise<SymbolTemplate | null> {
  if (look.url === null) {
    const page = await readMatchPage(doc, hash, look.pageNumber);
    const made = symbolFromBox(prepareSheet(page.geo, page.words), look.box);
    return made.kind === "ok" ? made.symbol : null;
  }
  if (otherSetTemplates.has(look.id))
    return otherSetTemplates.get(look.id) ?? null;
  const other = await pdfjs.getDocument({
    ...pdfRangeLoadOptions(look.url, null, self.location.href),
    ...WORKER_SAFE_OPTIONS,
  }).promise;
  try {
    const page = await other.getPage(look.pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const [list, content, layerIds] = await Promise.all([
      page.getOperatorList(),
      page.getTextContent(),
      // That set's own layers, not cached: the document is closed below.
      other
        .getOptionalContentConfig()
        .then(config => layerIdsFrom(config))
        .catch(() => new Map<string, string>()),
    ]);
    const items: RawTextItem[] = [];
    for (const item of content.items)
      if ("str" in item && item.str)
        items.push({
          str: item.str,
          transform: item.transform,
          width: item.width,
        });
    const geo = extractVectorGeometry(
      list.fnArray,
      list.argsArray,
      pdfjs.OPS as unknown as Record<string, number>,
      viewport.transform,
      viewport.width,
      viewport.height,
      layerIds
    );
    const words = wordBoxes({ items, viewportTransform: viewport.transform });
    const made = symbolFromBox(prepareSheet(geo, words), look.box);
    const template = made.kind === "ok" ? made.symbol : null;
    if (otherSetTemplates.size >= 40) otherSetTemplates.clear();
    otherSetTemplates.set(look.id, template);
    return template;
  } finally {
    await other.destroy();
  }
}

const lookNote = (n: number, what: string) =>
  `${n} saved look${n === 1 ? "" : "s"} ${what}`;

/**
 * Find all matching on a VECTOR page: the box drawn now (if any), and every
 * saved look, each matched on the line work and merged so one device is one
 * find (@/lib/lookMatching). A find only another set's look made is flagged
 * there, never clear.
 */
async function findOnVectorPage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  hash: string,
  matchPage: MatchPage,
  box: MatchBox | null,
  looks: readonly WorkerLook[]
): Promise<FindResult> {
  const sheet = prepareSheet(matchPage.geo, matchPage.words);
  const results: LookResult[] = [];
  const notes: string[] = [];
  let symbol: SymbolTemplate | null = null;
  let boxDevice: string[] | undefined;
  if (box) {
    const made = symbolFromBox(sheet, box);
    if (made.kind !== "ok" && looks.length === 0) return made;
    if (made.kind === "ok") {
      symbol = made.symbol;
      boxDevice = Array.from(made.symbol.boxedDevice);
      const found = searchSymbol(made.symbol, sheet, { boxedHere: true });
      if (found.kind !== "ok") return found;
      results.push({ source: { kind: "box" }, matches: found.matches });
    } else notes.push(made.message);
  }
  let unusable = 0;
  const lookDevice: { id: number; device: string[] }[] = [];
  for (const look of looks) {
    let t: SymbolTemplate | null = null;
    try {
      t = await vectorLookTemplate(doc, hash, look);
    } catch {
      t = null; // another set that cannot be opened is a look left out
    }
    // The open sheet back on top of the two-page cache.
    await readMatchPage(doc, hash, Number(matchPage.key.split("#")[1]));
    if (!t) {
      unusable++;
      continue;
    }
    symbol ??= t;
    lookDevice.push({ id: look.id, device: Array.from(t.boxedDevice) });
    const found = searchSymbol(t, sheet);
    if (found.kind === "ok")
      results.push({ source: sourceOf(look), matches: found.matches });
  }
  if (unusable)
    notes.push(
      lookNote(unusable, "could not be rebuilt here and were left out.")
    );
  if (!symbol)
    return {
      kind: "empty",
      message:
        notes[0] ??
        "None of this item's saved looks could be rebuilt. Box one on the drawing.",
    };
  return {
    kind: "ok",
    matches: mergeLookResults(results),
    symbol: {
      segments: symbol.segments,
      words: symbol.words,
      width: symbol.halfW * 2,
      height: symbol.halfH * 2,
      device: boxDevice,
    },
    looks: {
      searched: results.filter(r => r.source.kind === "look").length,
      notes,
      device: lookDevice,
    },
  };
}

/** Find all matching on a scanned page (@/lib/scanMatching), as a FindResult. */
async function findOnScanPage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  pageNum: number,
  matchPage: MatchPage,
  box: MatchBox | null,
  looks: readonly WorkerLook[]
): Promise<FindResult> {
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  // The owner's rule and § 9.3 together: a picture from another set's scan
  // is not compared at all, only this set's own looks.
  const here = looks.filter(l => l.url === null);
  const away = looks.length - here.length;
  const result = await findOnScan({
    box,
    looks: here.map(look => ({
      source: sourceOf(look) as Extract<LookSource, { kind: "look" }>,
      box: look.box,
      render: async (rect, scale) =>
        renderGray(await doc.getPage(look.pageNumber), rect, scale),
    })),
    pixelsPerPoint: matchPage.geo.imagePixelsPerPoint,
    words: matchPage.words,
    pageWidth: base.width,
    pageHeight: base.height,
    loadCv: loadOpenCv,
    render: (rect, scale) => renderGray(page, rect, scale),
  });
  if (result.kind !== "ok") return result;
  const notes = [...result.notes];
  if (away)
    notes.push(
      lookNote(
        away,
        "from other plan sets were not searched: on a scan a picture from another set does not compare."
      )
    );
  return {
    kind: "ok",
    matches: result.matches,
    symbol: {
      segments: 0,
      words: [],
      width: Math.abs(box?.width ?? here[0]?.box.width ?? 0),
      height: Math.abs(box?.height ?? here[0]?.box.height ?? 0),
    },
    scan: { plan: result.plan?.title ?? null, pixels: result.pixels },
    looks: { searched: here.length, notes },
  };
}

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
      matchPages = []; // another document's line work is no use now
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
   * The text on one page WITH where each item is drawn, for "Copy text".
   *
   * Raw items plus the scale-1 viewport's transform; the boxes are worked out
   * in client/src/lib/textSelection.ts, where the tests can reach them. Asked
   * only when the tool is picked up on a sheet — § 17.6's rule: nothing
   * positional is stored, the page is re-read in the worker when it is needed.
   */
  if (msg.type === "textItems") {
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
      const items: { str: string; transform: number[]; width: number }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        items.push({
          str: item.str,
          transform: item.transform,
          width: item.width,
        });
      }
      const viewportTransform = page.getViewport({ scale: 1 }).transform;
      self.postMessage({
        type: "textItems",
        reqId,
        pageNum,
        layer: { items, viewportTransform },
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  /**
   * Find all matching (@/lib/findMatching): every copy on this page of the
   * symbol in `box` (page points). The page's line work and words are read
   * once and kept (`readMatchPage`) — a sheet's are a few MB, and the next
   * search is almost always on the same sheet — so only the first search on a
   * sheet pays pdf.js's operator list (about a second on Weld 1 E-200).
   */
  if (msg.type === "findMatching") {
    const { pageNum, hash, reqId, box } = msg;
    const looks: WorkerLook[] = msg.looks ?? [];
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
      const matchPage = await readMatchPage(pdfDoc, hash, pageNum);
      const t1 = performance.now();
      const result = isScan(matchPage.geo)
        ? await findOnScanPage(pdfDoc, pageNum, matchPage, box, looks)
        : await findOnVectorPage(pdfDoc, hash, matchPage, box, looks);
      self.postMessage({
        type: "matches",
        reqId,
        result,
        readMs: Math.round(t1 - t0),
        findMs: Math.round(performance.now() - t1),
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  /**
   * Where runs meet these marks (shared/connectPoint.ts): for each wall
   * device, the foot on the wall line beside it. Reads the same cached line
   * work as Find all matching, so a sheet already searched pays nothing more.
   * A scan has no line work, and every wall device on it says so.
   */
  if (msg.type === "scaleEvidence") {
    // What the scale check (@/lib/scaleCheck) weighs a set scale against:
    // the page's quarter-circle arcs (door swings), null on a scan, and the
    // scales the page's own text states.
    const { pageNum, hash, reqId } = msg as {
      pageNum: number;
      hash: string;
      reqId: string;
    };
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const matchPage = await readMatchPage(pdfDoc, hash, pageNum);
      self.postMessage({
        type: "scaleEvidence",
        reqId,
        arcRadii: isScan(matchPage.geo)
          ? null
          : quarterArcRadii(matchPage.geo.segs),
        titleScales: detectScaleFromText(
          matchPage.words.map(w => w.text).join(" ")
        ).candidates,
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  if (msg.type === "schedules") {
    // Panel and fixture schedules read from the page's text
    // (@/lib/panelSchedules). Read-only; `scan` so the view can say why a
    // scanned sheet shows none.
    const { pageNum, hash, reqId } = msg as {
      pageNum: number;
      hash: string;
      reqId: string;
    };
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const matchPage = await readMatchPage(pdfDoc, hash, pageNum);
      self.postMessage({
        type: "schedules",
        reqId,
        schedules: readSchedules(matchPage.words),
        scan: isScan(matchPage.geo),
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  if (msg.type === "homeruns") {
    // Homeruns read from the page's line work and text (@/lib/homeruns),
    // with the set's panel schedules to tie them to. Read-only.
    const { pageNum, hash, reqId } = msg as {
      pageNum: number;
      hash: string;
      reqId: string;
    };
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const doc = pdfDoc;
      const matchPage = await readMatchPage(doc, hash, pageNum);
      const homeruns = isScan(matchPage.geo)
        ? []
        : readHomeruns(matchPage.words, matchPage.geo);
      self.postMessage({
        type: "homeruns",
        reqId,
        homeruns,
        panels: homeruns.length ? await panelsInDoc(doc, hash) : [],
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  if (msg.type === "circuits") {
    // The page's words, for grouping its marks by circuit tag in the page
    // (@/lib/circuitGroups — the marks live there), with the set's panel
    // schedules when the page has any tag. Read-only.
    const { pageNum, hash, reqId } = msg as {
      pageNum: number;
      hash: string;
      reqId: string;
    };
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const doc = pdfDoc;
      const matchPage = await readMatchPage(doc, hash, pageNum);
      const words = matchPage.words.map(w => ({
        text: w.text,
        x0: w.x0,
        x1: w.x1,
        cx: w.cx,
        cy: w.cy,
        height: w.height,
      }));
      const tagged = readCircuitTags(words).length > 0;
      self.postMessage({
        type: "circuits",
        reqId,
        words: tagged ? words : [],
        panels: tagged ? await panelsInDoc(doc, hash) : [],
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  if (msg.type === "connectPoints") {
    const { pageNum, hash, reqId, marks } = msg as {
      pageNum: number;
      hash: string;
      reqId: string;
      marks: ConnectMark[];
    };
    if (!pdfDoc || loadedHash !== hash) {
      self.postMessage({
        type: "error",
        reqId,
        message: "PDF not loaded for this hash",
      });
      return;
    }
    try {
      const matchPage = await readMatchPage(pdfDoc, hash, pageNum);
      const lines = isScan(matchPage.geo) ? null : matchPage.geo;
      self.postMessage({
        type: "connectPoints",
        reqId,
        points: marks.map(
          m => [m.id, connectPointFor(m, m.family, lines)] as const
        ),
      });
    } catch (err) {
      self.postMessage({ type: "error", reqId, message: String(err) });
    }
    return;
  }

  /**
   * Check a sheet against its legend (@/lib/sheetCheck): the legend page's
   * rows become looks, the plan page is searched for every one, and the
   * marks are checked. Suggestions only — the reply changes nothing.
   */
  if (msg.type === "sheetCheck") {
    const { hash, reqId, legendPage, planPage, input } = msg;
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
      const legend = await readMatchPage(pdfDoc, hash, legendPage);
      const plan = await readMatchPage(pdfDoc, hash, planPage);
      if (isScan(plan.geo)) {
        self.postMessage({
          type: "sheetChecked",
          reqId,
          result: null,
          scan: true,
        });
        return;
      }
      const result = runSheetCheck(
        prepareSheet(legend.geo, legend.words),
        prepareSheet(plan.geo, plan.words),
        input
      );
      self.postMessage({
        type: "sheetChecked",
        reqId,
        result,
        scan: false,
        ms: Math.round(performance.now() - t0),
      });
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
