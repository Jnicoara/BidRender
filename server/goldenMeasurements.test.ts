/**
 * GOLDEN MEASUREMENTS — drawings with a known true length that every change
 * must reproduce (owner, 2026-10-15 night brief, item 3).
 *
 * Each case is a PDF built here in code, the way `e2e/smoke/fixturePlan.ts`
 * builds the smoke plan, with a run drawn at an exact real length for its
 * printed scale. It then goes the whole way a contractor's run goes:
 *
 *   1. pdf.js opens it (the same library and the same `getViewport({scale:1})`
 *      the viewer renders with — rotation and UserUnit applied there) and
 *      reads its text;
 *   2. the server's own `detectSheetScale` reads the scale from that text and
 *      the one-tap accept (`setSheetScale`) applies it — or, for a scan or a
 *      not-to-scale sheet, a person types it;
 *   3. a click at each corner is converted back to page points at several
 *      zooms, both pixel densities and the render scale the viewer uses —
 *      with the arithmetic of `clientToPage` (TraceLayer.tsx ~687) around the
 *      shared `screenToPagePoints`;
 *   4. the run is SAVED through `takeoffRuns.save`, which re-measures from
 *      the points on the server, and the stored `lengthInches` and the
 *      billable feet are compared with the truth.
 *
 * TOLERANCE: 0.01 real inch on the stored length, and the billable feet
 * EXACTLY equal. Why that number:
 * - the noise floor is far below it — floating point is ~1e-9 in, and the
 *   column stores 4 decimals (±0.00005 in);
 * - every fault worth catching is far above it — a scale 0.5 % off moves the
 *   SHORTEST case here (6 in at 1/4") by 0.03 in, a page rotated the wrong
 *   way or a device pixel ratio not divided out moves it by inches or feet;
 * - and it is 1/1200 of the foot the estimator actually buys, so nothing a
 *   tolerance this tight lets through can reach a bid.
 * The billable feet must match to the cent-of-a-foot, because that IS the
 * number on the bid.
 *
 * MOUSE vs TOUCH: both reach this same conversion — a touch tap is replayed by
 * TakeoffPage's touch router to the same pointerdown at the same clientX/Y —
 * so the click step runs once per input kind with each kind's own pointer
 * shape (a mouse lands on whole CSS pixels at density 1, a finger reports
 * fractions), at the corner itself. That a real tap and a real click land on
 * the same point on screen was looked at in the browser
 * (`references/golden-measurements.md`), because a component's event path is
 * not something vitest here can reach (vitest covers server/, client/src/lib,
 * scripts/).
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffRuns, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  pathRealInches,
  screenToPagePoints,
  toBillableFeet,
  type PagePoint,
} from "../shared/takeoffGeometry";
import { detectScaleFromText } from "../shared/planScale";

const USER = 9877;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

/** Stored length must be within this many REAL inches of the truth. */
const TOLERANCE_IN = 0.01;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-golden-${USER}`, role: "user" },
  } as unknown as TrpcContext);

// ── The drawings ────────────────────────────────────────────────────────────

type Golden = {
  name: string;
  /** Paper size in inches, as printed (before /Rotate). */
  paper: [number, number];
  rotate?: 0 | 90 | 180 | 270;
  /** PDF UserUnit: 1 user-space unit = this many 1/72 in. */
  userUnit?: number;
  /** What the title block prints, or null for none (a scan). */
  printed: string | null;
  /** Real-world inches per paper inch for this scale — the truth. */
  ratio: number;
  /** Typed by a person when nothing on the sheet can be read. */
  typedScale?: string;
  /** The run, in REAL feet from the drawing's bottom-left corner. */
  runFeet: [number, number][];
  /** Draw it as an image only, with no text and no vector lines. */
  scan?: boolean;
};

const M = 39.37007874015748; // inches in a metre

const CASES: Golden[] = [
  {
    name: '1/8" = 1\'-0" on ARCH D, straight 100 ft',
    paper: [36, 24],
    printed: `SCALE: 1/8" = 1'-0"`,
    ratio: 96,
    runFeet: [
      [20, 20],
      [120, 20],
    ],
  },
  {
    name: '3/16" = 1\'-0" on ANSI D, L-shaped 30 + 40 ft',
    paper: [34, 22],
    printed: `SCALE: 3/16" = 1'-0"`,
    ratio: 64,
    runFeet: [
      [10, 10],
      [40, 10],
      [40, 50],
    ],
  },
  {
    name: '1/4" = 1\'-0" on ARCH D, multi-point 3-4-5 zigzag (60 ft)',
    paper: [36, 24],
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    // Four 3-4-5 legs of 15 ft each: 60 ft exactly, no leg axis-aligned.
    runFeet: [
      [10, 10],
      [19, 22],
      [28, 10],
      [37, 22],
      [46, 10],
    ],
  },
  {
    name: '1/4" = 1\'-0", SHORT run of 6 inches',
    paper: [36, 24],
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    runFeet: [
      [10, 10],
      [10.5, 10],
    ],
  },
  {
    name: '1/8" = 1\'-0" on ARCH E1, LONG 320 ft perimeter',
    paper: [42, 30],
    printed: `SCALE: 1/8" = 1'-0"`,
    ratio: 96,
    runFeet: [
      [20, 20],
      [120, 20],
      [120, 80],
      [20, 80],
      [20, 20],
    ],
  },
  {
    name: "engineering 1\" = 20', 300 ft straight",
    paper: [36, 24],
    printed: `SCALE: 1" = 20'-0"`,
    ratio: 240,
    runFeet: [
      [40, 40],
      [340, 40],
    ],
  },
  {
    name: "metric 1:100 on A1 (841 x 594 mm), 25 m straight",
    paper: [841 / 25.4, 594 / 25.4],
    printed: "SCALE 1:100",
    ratio: 100,
    runFeet: [
      [(5 * M) / 12, (5 * M) / 12],
      [(30 * M) / 12, (5 * M) / 12],
    ],
  },
  {
    name: '1/4" = 1\'-0" on a page turned 90 degrees, L-shape',
    paper: [36, 24],
    rotate: 90,
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    runFeet: [
      [10, 10],
      [50, 10],
      [50, 30],
    ],
  },
  {
    name: '1/4" = 1\'-0" on a page turned 180 degrees',
    paper: [36, 24],
    rotate: 180,
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    runFeet: [
      [10, 10],
      [34, 28],
    ],
  },
  {
    name: '1/8" = 1\'-0" on a page turned 270 degrees, zigzag',
    paper: [36, 24],
    rotate: 270,
    printed: `SCALE: 1/8" = 1'-0"`,
    ratio: 96,
    runFeet: [
      [20, 20],
      [56, 68],
      [92, 20],
    ],
  },
  {
    name: '1/4" = 1\'-0" reduced to 11 x 17 — measured at the PRINTED scale',
    // A half-size print measures at its printed scale; sheetSize warns about
    // it (sheetSizeWarns) rather than the arithmetic guessing. The golden
    // is that the arithmetic does exactly what the scale says.
    paper: [17, 11],
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    runFeet: [
      [5, 5],
      [45, 5],
    ],
  },
  {
    name: "PDF with UserUnit 2 (a big sheet stored at half size)",
    paper: [36, 24],
    userUnit: 2,
    printed: `SCALE: 1/4" = 1'-0"`,
    ratio: 48,
    runFeet: [
      [10, 10],
      [70, 10],
    ],
  },
  {
    name: "a scan — no text layer, scale typed by a person",
    paper: [36, 24],
    printed: null,
    scan: true,
    ratio: 48,
    typedScale: `1/4" = 1'-0"`,
    runFeet: [
      [10, 10],
      [55, 10],
      [55, 30],
    ],
  },
];

/** Real feet → PDF user-space units on this sheet (origin bottom-left). */
function toUserSpace(g: Golden, [fx, fy]: [number, number]): [number, number] {
  const unit = g.userUnit ?? 1;
  const toUnits = (feet: number) => ((feet * 12) / g.ratio) * (72 / unit);
  return [toUnits(fx), toUnits(fy)];
}

/** The true length of the run, in real inches. */
function trueInches(g: Golden): number {
  let sum = 0;
  for (let i = 1; i < g.runFeet.length; i++) {
    const [ax, ay] = g.runFeet[i - 1];
    const [bx, by] = g.runFeet[i];
    sum += Math.hypot(bx - ax, by - ay) * 12;
  }
  return sum;
}

/** A tiny greyscale image with the run drawn into it — the "scan". */
function scanImage(): { stream: string; w: number; h: number } {
  // 64 x 64 noise-ish grey; the run is drawn as an image only, so the page
  // has no vector path and no text — what a scanned sheet gives pdf.js.
  const w = 64;
  const h = 64;
  let hex = "";
  for (let i = 0; i < w * h; i++)
    hex += ((200 + ((i * 37) % 50)) & 0xff).toString(16).padStart(2, "0");
  return { stream: hex + ">", w, h };
}

function buildPdf(g: Golden): Buffer {
  const unit = g.userUnit ?? 1;
  const W = (g.paper[0] * 72) / unit;
  const H = (g.paper[1] * 72) / unit;
  const run = g.runFeet.map(p => toUserSpace(g, p));
  const ops: string[] = [];
  let resources =
    "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";
  let extra: string | null = null;
  if (g.scan) {
    const img = scanImage();
    ops.push(`q ${W} 0 0 ${H} 0 0 cm /Im1 Do Q`);
    resources = "/Resources << /XObject << /Im1 6 0 R >> >>";
    extra = `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${img.stream.length} >>\nstream\n${img.stream}\nendstream`;
  } else {
    ops.push(
      `BT /F1 ${24 / unit} Tf ${72 / unit} ${H - 72 / unit} Td (E-1 GOLDEN) Tj ET`
    );
    if (g.printed)
      ops.push(
        `BT /F1 ${18 / unit} Tf ${72 / unit} ${H - 110 / unit} Td (${g.printed}) Tj ET`
      );
    ops.push(
      `2 w ${run.map(([x, y], i) => `${x} ${y} ${i === 0 ? "m" : "l"}`).join(" ")} S`
    );
  }
  const stream = ops.join("\n");
  const pageExtras =
    (g.rotate ? ` /Rotate ${g.rotate}` : "") +
    (g.userUnit ? ` /UserUnit ${g.userUnit}` : "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}]${pageExtras} /Contents 4 0 R ${resources} >>`,
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< >>", // 5: unused, keeps the image at 6
  ];
  if (extra) objects.push(extra);
  let pdf = "%PDF-1.6\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** What the viewer has for this sheet: its text, and the run in page points. */
async function openInPdfJs(g: Golden) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buildPdf(g)),
    isEvalSupported: false,
    verbosity: 0, // no standard-font warnings: the text is read, not drawn
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const text = (await page.getTextContent()).items
    .map(item => ("str" in item ? item.str : ""))
    .join(" ");
  const corners: PagePoint[] = g.runFeet.map(p => {
    const [x, y] = viewport.convertToViewportPoint(...toUserSpace(g, p));
    return { x, y };
  });
  await doc.destroy();
  return { text, corners, width: viewport.width, height: viewport.height };
}

// ── The click ───────────────────────────────────────────────────────────────

/** The viewer's own render scale (TakeoffPage RENDER_SCALE). */
const RENDER_SCALE = 1.5;
const ZOOMS = [0.19, 0.5, 1, 2.5, 6];
const DENSITIES = [1, 2];
type Input = "mouse" | "touch";

/**
 * A press on a page point at this zoom and pixel density, read back the way
 * TraceLayer's `clientToPage` reads it: the overlay is `width` device pixels
 * wide and drawn `rect.width` CSS pixels wide, inside the zoom transform.
 */
function clickAt(
  p: PagePoint,
  sheet: { width: number; height: number },
  zoom: number,
  dpr: number,
  input: Input
): PagePoint {
  const width = sheet.width * RENDER_SCALE; // overlay, device px
  const height = sheet.height * RENDER_SCALE;
  const rect = {
    left: 137.25, // anywhere on screen — the pan
    top: 64.5,
    width: (width / dpr) * zoom,
    height: (height / dpr) * zoom,
  };
  // Where on the screen that point is drawn.
  let clientX = rect.left + (p.x * RENDER_SCALE * rect.width) / width;
  let clientY = rect.top + (p.y * RENDER_SCALE * rect.height) / height;
  // A mouse at density 1 reports whole CSS pixels; a finger and a
  // high-density mouse report fractions. Aim at the corner the way each
  // would: snapped to the nearest pixel the device can report.
  if (input === "mouse") {
    clientX = Math.round(clientX * dpr) / dpr;
    clientY = Math.round(clientY * dpr) / dpr;
  }
  const scaleX = width / rect.width;
  const scaleY = height / rect.height;
  return screenToPagePoints(
    { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY },
    RENDER_SCALE
  )!;
}

/**
 * How far a click can land from the corner purely because a screen pixel is
 * a screen pixel — not the app's arithmetic. Half a device pixel per axis per
 * corner, in real inches.
 */
function pixelSlackInches(
  g: Golden,
  zoom: number,
  dpr: number,
  input: Input
): number {
  if (input === "touch") return 0;
  // A step of 1/dpr CSS px is dpr/(zoom × render scale) overlay px... which
  // is 1/(zoom × RENDER_SCALE) page points whatever the density.
  void dpr;
  const step = 1 / (zoom * RENDER_SCALE);
  const halfStepDiag = Math.SQRT1_2 * step;
  // Each segment's two ends can each be off by that much.
  const segments = g.runFeet.length - 1;
  return ((2 * segments * halfStepDiag) / 72) * g.ratio;
}

// ── The tests ───────────────────────────────────────────────────────────────

describe("golden drawings — the arithmetic, without a database", () => {
  for (const g of CASES) {
    it(`${g.name}: the scale reads and every click reproduces the length`, async () => {
      const truth = trueInches(g);
      const sheet = await openInPdfJs(g);
      const detection = detectScaleFromText(sheet.text);
      if (g.printed) {
        expect(detection.best?.ratio, "scale read from the sheet").toBeCloseTo(
          g.ratio,
          9
        );
      } else {
        // A scan offers nothing; a person types the scale.
        expect(detection.best, "a scan offers no scale").toBe(null);
      }
      // Exactly at the corners (what the server gets from a snapped point).
      expect(
        Math.abs(pathRealInches(sheet.corners, g.ratio)! - truth)
      ).toBeLessThan(TOLERANCE_IN);

      for (const zoom of ZOOMS)
        for (const dpr of DENSITIES)
          for (const input of ["mouse", "touch"] as const) {
            const clicked = sheet.corners.map(c =>
              clickAt(c, sheet, zoom, dpr, input)
            );
            const got = pathRealInches(clicked, g.ratio)!;
            const allowed =
              TOLERANCE_IN + pixelSlackInches(g, zoom, dpr, input);
            expect(
              Math.abs(got - truth),
              `${input} at zoom ${zoom}, density ${dpr}`
            ).toBeLessThanOrEqual(allowed);
          }
    });
  }

  it("a not-to-scale sheet says so and offers no scale", async () => {
    const g: Golden = {
      name: "NTS",
      paper: [36, 24],
      printed: "SCALE: NTS",
      ratio: 48,
      runFeet: [
        [10, 10],
        [20, 10],
      ],
    };
    const detection = detectScaleFromText((await openInPdfJs(g)).text);
    expect(detection.notToScale).toBe(true);
    expect(detection.best).toBe(null);
  });
});

async function aSheet() {
  const bid = (await caller().bids.create({
    name: `Golden ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "golden.pdf",
    storageKey: `test/${bid.id}/golden.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function storedInches(runId: number): Promise<number | null> {
  const database = (await getDb())!;
  const [row] = await database
    .select({ lengthInches: takeoffRuns.lengthInches })
    .from(takeoffRuns)
    .where(eq(takeoffRuns.id, runId));
  return row.lengthInches === null ? null : Number(row.lengthInches);
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-golden-${USER}`,
      name: "Golden measurements fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

withDb("golden drawings — through the server, as saved on a bid", () => {
  for (const g of CASES) {
    it(`${g.name}: stored length and billable feet match the truth`, async () => {
      const truth = trueInches(g);
      const sheet = await openInPdfJs(g);
      const { bidId, sheetId } = await aSheet();

      // The scale, the way the screen sets it: the offer read from the
      // sheet's text, accepted with one tap — or typed by a person.
      const read = await caller().bidPdfs.detectSheetScale({
        id: sheetId,
        sheetText: sheet.text,
      });
      const scaleText = g.typedScale ?? read.sheet.detectedScaleText;
      expect(scaleText, "a scale to set").toBeTruthy();
      await caller().bidPdfs.setSheetScale({
        id: sheetId,
        scaleText: scaleText!,
      });

      // A click at density 2, zoom 1 — then the server measures it again.
      const points = sheet.corners.map(c => clickAt(c, sheet, 1, 2, "touch"));
      const saved = await caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Golden run",
        pathType: "conduit",
        status: "committed",
        points,
      });
      const inches = await storedInches(saved.id);
      expect(inches, "stored length").not.toBe(null);
      expect(Math.abs(inches! - truth)).toBeLessThan(TOLERANCE_IN);
      expect(saved.lengthFeet, "billable feet on the bid").toBe(
        toBillableFeet(truth)
      );
    });
  }

  it("a sheet with no scale stores NO length — never a guess", async () => {
    const g = CASES.find(c => c.scan)!;
    const sheet = await openInPdfJs(g);
    const { bidId, sheetId } = await aSheet();
    await caller().bidPdfs.detectSheetScale({
      id: sheetId,
      sheetText: sheet.text,
    });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Unscaled run",
      pathType: "conduit",
      status: "committed",
      points: sheet.corners,
    });
    expect(saved.measured).toBe(false);
    expect(saved.lengthFeet).toBe(null);
    expect(await storedInches(saved.id)).toBe(null);
  });
});
