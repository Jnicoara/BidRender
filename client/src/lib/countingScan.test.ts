/**
 * COUNTING DEEP TEST, SCANNED — the same sheet 1 as countingDeep.test.ts,
 * drawn to a 150 dpi picture with noise and saved as a "scanned" page, then
 * searched the way the browser worker searches a scan
 * (pdfRenderer.worker.ts `findOnScanPage`): pdf.js renders the region grey,
 * opencv.js matches the picture. No AI.
 *
 * A scan has no line work and no words, so a GFCI's "GF" is pixels beside
 * the symbol, not a word the matcher can read. The question this answers is
 * whether that turns into a wrong count — whether a look-alike gets into
 * Confirm all — and what the person is shown.
 *
 * Heavier than the line-work test (opencv.js is ~10 MB of wasm, loaded once).
 */
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPlanPdf } from "./testPlanPdf.testHelper";
import { findMatching } from "./findMatching";
import { findOnScan, type OpenCv, type ScanImage } from "./scanMatching";
import { extractVectorGeometry } from "./vectorGeometry";
import {
  applyAiAnswers,
  clearOpen,
  matchItems,
  summary,
  type ScanFindAnswer,
} from "./findMatchingSession";
import {
  H,
  SHEET_1,
  SYMBOLS,
  W,
  boxRound,
  score,
} from "./countingFixtures.testHelper";

const DPI = 150;
const SCALE = DPI / 72;

type Factory = {
  create(
    w: number,
    h: number
  ): {
    canvas: unknown;
    context: {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
      getImageData(
        x: number,
        y: number,
        w: number,
        h: number
      ): { data: Uint8ClampedArray };
    };
  };
};

type PdfPage = {
  getViewport(o: { scale: number; offsetX?: number; offsetY?: number }): {
    width: number;
    height: number;
    transform: number[];
  };
  render(o: unknown): { promise: Promise<void> };
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
};

async function renderGray(
  page: PdfPage,
  factory: Factory,
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
  const { canvas, context } = factory.create(width, height);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  await page.render({ canvasContext: context, canvas, viewport }).promise;
  const rgba = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let k = 0; k < gray.length; k++)
    gray[k] =
      (rgba[4 * k] * 0.299 +
        rgba[4 * k + 1] * 0.587 +
        rgba[4 * k + 2] * 0.114) |
      0;
  return { gray, width, height, x0: rect.x, y0: rect.y, scale };
}

/** Deterministic noise, so the scan is the same on every run. */
function scanNoise(gray: Uint8Array) {
  let seed = 12345;
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0; k < gray.length; k++) {
    const v = gray[k] + (rand() - 0.5) * 50;
    // A scanner's paper is never white, and its ink never black.
    gray[k] = Math.max(20, Math.min(235, Math.round(v * 0.85 + 20)));
  }
}

const require = createRequire(import.meta.url);
async function loadCv(): Promise<OpenCv> {
  let cv = require("@techstark/opencv-js");
  if (cv instanceof Promise) cv = await cv;
  else if (!cv.Mat)
    await new Promise<void>(r => (cv.onRuntimeInitialized = () => r()));
  // A thenable never finishes an await; the worker drops it the same way.
  delete cv.then;
  return cv as OpenCv;
}

let scanPage: PdfPage;
let factory: Factory;
let pixelsPerPoint = 0;
let scanGeo: ReturnType<typeof extractVectorGeometry>;

beforeAll(async () => {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // 1. The clean sheet, drawn to a picture.
  const clean = await getDocument({
    data: buildPlanPdf([SHEET_1], SYMBOLS),
    verbosity: 0,
  }).promise;
  factory = (clean as unknown as { canvasFactory: Factory }).canvasFactory;
  const cleanPage = (await clean.getPage(1)) as unknown as PdfPage;
  const picture = await renderGray(
    cleanPage,
    factory,
    { x: 0, y: 0, width: W, height: H },
    SCALE
  );
  scanNoise(picture.gray);
  // 2. That picture as the whole page of a new PDF — a scan.
  const scanned = await getDocument({
    data: buildPlanPdf(
      [
        {
          width: W,
          height: H,
          placed: [],
          image: {
            width: picture.width,
            height: picture.height,
            gray: picture.gray,
          },
        },
      ],
      SYMBOLS
    ),
    verbosity: 0,
  }).promise;
  scanPage = (await scanned.getPage(1)) as unknown as PdfPage;
  const vp = scanPage.getViewport({ scale: 1 });
  const list = await scanPage.getOperatorList();
  scanGeo = extractVectorGeometry(
    list.fnArray,
    list.argsArray,
    OPS as unknown as Record<string, number>,
    vp.transform,
    vp.width,
    vp.height
  );
  pixelsPerPoint = scanGeo.imagePixelsPerPoint;
}, 120_000);

async function searchScan(boxed: number, half: [number, number]) {
  const r = await findOnScan({
    box: boxRound(SHEET_1.placed[boxed], ...half),
    pixelsPerPoint,
    words: [],
    pageWidth: W,
    pageHeight: H,
    render: (rect, scale) => renderGray(scanPage, factory, rect, scale),
    loadCv,
  });
  if (r.kind !== "ok")
    throw new Error(`${r.kind}: ${"message" in r ? r.message : ""}`);
  return r;
}

const sym = (name: string) => (p: (typeof SHEET_1.placed)[number]) =>
  p.symbol === name && !p.scale && !p.gray;

describe("counting deep test — the same sheet as a scan", () => {
  it("is read as a scan: no line work to match, about 150 dpi", () => {
    expect(scanGeo.imageCoverage).toBeGreaterThan(0.9);
    expect(pixelsPerPoint).toBeCloseTo(SCALE, 1);
    const vector = findMatching(scanGeo, [], boxRound(SHEET_1.placed[0], 6, 6));
    expect(vector.kind).toBe("scan");
  });

  /*
    GOLDEN COUNTS ON A SCAN, measured 2026-10-15 night. Every true copy is
    found (0 missed) and EVERY find needs a look — `SCAN_UNREAD_REASON`, "the
    tag or an E beside it is not read" — so Confirm all takes none: a scan
    can never put a look-alike on the bid by itself. The cost is that the
    person confirms each one; the look-alikes offered beside them (bare
    circles and GFCIs for a duplex, J-boxes for a smoke detector) are shown
    for that look. 100% hands-off is not possible on a scan: the words that
    tell a GFCI from a duplex are pixels here, and reading them is the AI
    button's job (a button, never automatic).
  */
  const C3 = ["circle", "circle", "circle"];
  it.each([
    {
      name: "duplex",
      i: 0,
      half: [6, 6],
      found: 10,
      wrong: [...C3, "gfci", "gfci", "gfci"],
    },
    {
      name: "gfci",
      i: 10,
      half: [16, 6],
      found: 3,
      wrong: [...C3, ...Array(9).fill("duplex")],
    },
    {
      name: "jbox",
      i: 20,
      half: [7, 7],
      found: 4,
      wrong: [...C3, "smoke", "smoke", "smoke", "smoke"],
    },
    {
      name: "smoke",
      i: 24,
      half: [7, 7],
      found: 4,
      wrong: [...C3, "gfci", "jbox", "jbox", "jbox", "jbox"],
    },
    { name: "troffer", i: 28, half: [12, 6], found: 6, wrong: [] },
    { name: "switch", i: 37, half: [5, 11], found: 5, wrong: [] },
  ] as const)(
    "$name: every copy found, every find needs a look",
    async c => {
      const r = await searchScan(c.i, [c.half[0], c.half[1]]);
      const s0 = score(r.matches, SHEET_1.placed, sym(c.name));
      // EXACT everywhere it matters: every true copy found, none missed,
      // nothing in Confirm all.
      expect(s0).toMatchObject({
        found: c.found,
        missed: 0,
        confirmAllRight: 0,
        confirmAllWrong: 0,
      });
      /*
        WHICH look-alikes are offered depends on how the text beside them
        rasterises, and that differs by platform: on the Linux CI runner the
        GFCI and smoke-detector searches offered a different set than this
        laptop does (Gate 38865031567, 2026-10-16). So the list is held to
        its FAMILY — only circle-shaped symbols, never a troffer or a switch
        — and the laptop's exact list is kept above as the measurement.
      */
      const family =
        c.wrong.length === 0
          ? []
          : ["circle", "duplex", "gfci", "jbox", "smoke"];
      expect(s0.wrongAs.filter(w => !family.includes(w))).toEqual([]);
      if (c.wrong.length === 0) expect(s0.wrong).toBe(0);
      const s = summary(matchItems(r.matches, [], new Set()));
      expect(s.clear).toBe(0);
      expect(s.confirmed).toBe(0);
    },
    120_000
  );
  /*
    AI READING, with SAVED FAKE answers (no model called, nothing spent). The
    answers are what a right reader would say for each find — "same" on a
    duplex, "otherLabel" on a GFCI, "notThis" on a bare circle. They are
    applied exactly as the screen applies the router's answers.
  */
  const fakeAnswer = (symbol: string): ScanFindAnswer =>
    symbol === "duplex" ? "same" : symbol === "gfci" ? "otherLabel" : "notThis";
  const placedAt = (m: { x: number; y: number }) =>
    [...SHEET_1.placed].sort(
      (a, b) =>
        Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)
    )[0];

  it("AI answers never confirm a find; right answers make Confirm all exact", async () => {
    const r = await searchScan(0, [6, 6]);
    const items = matchItems(r.matches, [], new Set());
    const answers = new Map(
      items.map(i => [i.id, fakeAnswer(placedAt(i).symbol)])
    );
    const after = applyAiAnswers(items, answers);
    expect(after.every(i => i.state === "open")).toBe(true);
    expect(summary(after).confirmed).toBe(0);
    const take = clearOpen(after).map(i => placedAt(i));
    // 9 of the 10: the duplex with a wire through it (300, 220) scores a
    // weaker likeness on the scan (0.81) and keeps that flag after the AI
    // says "same" — the person looks at it. No look-alike gets in.
    expect(take).toHaveLength(9);
    expect(take.every(p => p.symbol === "duplex" && !p.gray)).toBe(true);
    expect(take.some(p => p.x === 300 && p.y === 220)).toBe(false);
  }, 120_000);

  it("a WRONG 'same' makes that copy clear — the person's Confirm all is the decision", async () => {
    // Recorded, not endorsed: references/morning-questions-a.md asks whether
    // an AI-cleared scan find should stay out of Confirm all.
    const r = await searchScan(0, [6, 6]);
    const items = matchItems(r.matches, [], new Set());
    const answers = new Map(
      items.map(i => {
        const sym = placedAt(i).symbol;
        return [i.id, sym === "gfci" ? ("same" as const) : fakeAnswer(sym)];
      })
    );
    const take = clearOpen(applyAiAnswers(items, answers)).map(
      i => placedAt(i).symbol
    );
    expect(take.filter(s => s === "gfci")).toHaveLength(3);
    expect(summary(applyAiAnswers(items, answers)).confirmed).toBe(0);
  }, 120_000);
});
