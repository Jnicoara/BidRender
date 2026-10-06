/**
 * FIND ALL MATCHING ON A SCAN — picture matching, no AI. 2026-10-01.
 *
 * A scanned sheet has no line work for @/lib/findMatching to compare, only a
 * picture. Measured on Old Blueridge E1.01 and E1.02 (300 dpi scans,
 * references/scanned-plans-plan.md § 2): matching the picked symbol's
 * PICTURE against the same sheet found 85 of the owner's 86 hand marks with
 * nothing false inside the plan he counted. That works here, where
 * plan-viewer-overhaul.md § 9.3 rejects pixel matching, because the picked
 * symbol is cut from the SAME sheet at the SAME resolution — none of the
 * size, line-weight and thumbnail differences between jobs exist.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *  1. "Too poor to match" (`scanQuality`): the picked symbol's short side in
 *     the scan's OWN pixels, known before anything runs. Under
 *     SCAN_MIN_PIXELS it refuses, saying the number; under
 *     SCAN_COARSE_PIXELS it matches but flags every find. Measured: the
 *     switch broke at ~10 px (33 false finds in the plan) and held at 19.
 *  2. Which plan (`planTitles`, `planRegions`): the OCR text layer a scan
 *     carries reads plan titles right ("MAIN FLOOR - DEMOLITION POWER PLAN")
 *     even where it reads nothing inside the drawing. Each title owns the
 *     drawing above it. ONLY the plan the box is on is searched, and when
 *     that plan is a demolition plan every find says so and is not counted
 *     by "Confirm all" — a removed receptacle priced as a new one is the
 *     fault this exists to prevent (37 of them on E1.02).
 *  3. The search (`searchScanImage`, opencv.js, loaded only here): the plan
 *     at 150 dpi, black-and-white, straightened, specks removed; the picked
 *     symbol at 3 sizes x 4 quarter turns, normalised correlation, one find
 *     per spot.
 *
 * Every find comes back UNCONFIRMED, like the vector matcher's. What a
 * picture cannot settle — the tag beside a fixture, an "E" — is left to the
 * person, or to the AI tie-break BUTTON (server/tieBreak.ts), never decided.
 *
 * Everything but `searchScanImage` is pure and tested
 * (scanMatching.test.ts); `scripts/scanMatchingCheck.mts` runs the whole
 * thing against the hand marks.
 */
import type { WordBox } from "./textSelection";
import type { Match, MatchBox } from "./findMatching";
import {
  mergeLookResults,
  type LookResult,
  type LookSource,
  type MergedMatch,
} from "./lookMatching";

/** Work resolution: 150 dpi, in pixels per page point. Measured at this. */
export const SCAN_WORK_SCALE = 150 / 72;
/** Under this many scan pixels on its short side, a symbol is refused. */
export const SCAN_MIN_PIXELS = 16;
/** Under this many, it is matched but every find needs a look. */
export const SCAN_COARSE_PIXELS = 24;
/** Normalised correlation a find must reach. 0.7 measured: 0 false in plan. */
export const SCAN_MATCH_SCORE = 0.7;
/** The picked symbol is tried at these sizes (scan wobble, not other sizes). */
export const SCAN_SIZES = [0.9, 1, 1.1] as const;
/**
 * An empty strip at least this wide (points) ends a plan sideways — the
 * white between a plan and the notes column. 1 inch: E1.01's is ~135 pt.
 */
export const PLAN_GAP_POINTS = 72;

// ── 1. Too poor to match ────────────────────────────────────────────────────

export type ScanQuality =
  | { kind: "tooPoor"; pixels: number; message: string }
  | { kind: "coarse"; pixels: number; reason: string }
  | { kind: "ok"; pixels: number };

/**
 * Whether a symbol boxed on a scan can be matched, from its size in the
 * scan's own pixels. `pixelsPerPoint` is the scan's resolution
 * (`VectorGeometry.imagePixelsPerPoint`: 4.17 at 300 dpi).
 */
export function scanQuality(
  box: MatchBox,
  pixelsPerPoint: number
): ScanQuality {
  const shortSide = Math.min(Math.abs(box.width), Math.abs(box.height));
  if (!(pixelsPerPoint > 0))
    // Unknown resolution: match, but nothing it finds is offered as clear.
    return {
      kind: "coarse",
      pixels: 0,
      reason:
        "The scan's resolution could not be read, so check each one by eye.",
    };
  const pixels = Math.round(shortSide * pixelsPerPoint);
  if (pixels < SCAN_MIN_PIXELS)
    return {
      kind: "tooPoor",
      pixels,
      message: `This symbol is ${pixels} pixels across on this scan — too coarse to match. Count it by hand.`,
    };
  if (pixels < SCAN_COARSE_PIXELS)
    return {
      kind: "coarse",
      pixels,
      reason: `The scan is coarse here (the symbol is ${pixels} pixels across), so check this one by eye.`,
    };
  return { kind: "ok", pixels };
}

// ── 2. Which plan ───────────────────────────────────────────────────────────

export type PlanTitle = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  height: number;
  demolition: boolean;
};

export type PlanRegion = {
  title: string;
  demolition: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const token = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
const PLAN_WORDS = new Set(["PLAN", "PLANS"]);
const DEMOLITION_WORDS = new Set(["DEMOLITION", "DEMO"]);
/** A title is short: "MAIN FLOOR - DEMOLITION LIGHTING PLAN" is 6 words. */
const TITLE_MAX_WORDS = 10;
/**
 * And drawn larger than the sheet's ordinary text: the MEDIAN height of the
 * line's words (a "-" is 6 pt tall and must not drag it down) against the
 * page's median. Measured on Old Blueridge: titles 15 and 16.2 pt against
 * page medians of 12.5 and 11.2 — 1.20 and 1.44 — so 1.15 holds both with
 * a little to spare; the notes' "DEMOLISH" line is 12.5 and 10 pt.
 */
const TITLE_MIN_HEIGHT_RATIO = 1.15;

/**
 * The plan titles on a sheet, read from its text layer: a line of words,
 * drawn larger than the sheet's usual text, holding the word PLAN. "SEE
 * DEMOLISH PLAN" in a note is ordinary-sized and is not one; the title
 * block's sideways "MAIN FLOOR PLANS" is not horizontal and is not one.
 */
export function planTitles(words: readonly WordBox[]): PlanTitle[] {
  const flat = words.filter(w => Math.abs(w.dx) > 0.9 && w.text.trim());
  if (flat.length === 0) return [];
  const heights = flat.map(w => w.height).sort((a, b) => a - b);
  const median = heights[heights.length >> 1];

  type Line = { words: WordBox[]; cy: number; h: number; x1: number };
  const lines: Line[] = [];
  for (const w of [...flat].sort((a, b) => a.x0 - b.x0)) {
    const line = lines.find(l => {
      const h = Math.max(l.h, w.height);
      const gap = w.x0 - l.x1;
      return (
        Math.abs(l.cy - w.cy) <= 0.5 * h && gap >= -0.5 * h && gap <= 1.5 * h
      );
    });
    if (line) {
      line.words.push(w);
      line.x1 = Math.max(line.x1, w.x1);
      line.h = Math.max(line.h, w.height);
    } else lines.push({ words: [w], cy: w.cy, h: w.height, x1: w.x1 });
  }

  const titles: PlanTitle[] = [];
  for (const l of lines) {
    const tokens = l.words.map(w => token(w.text)).filter(Boolean);
    if (!tokens.some(t => PLAN_WORDS.has(t))) continue;
    if (tokens.length > TITLE_MAX_WORDS) continue;
    const lineHeights = l.words
      .filter(w => token(w.text))
      .map(w => w.height)
      .sort((a, b) => a - b);
    const lineHeight = lineHeights[lineHeights.length >> 1];
    if (lineHeight < TITLE_MIN_HEIGHT_RATIO * median) continue;
    titles.push({
      text: l.words
        .map(w => w.text.trim())
        .join(" ")
        .replace(/\s+/g, " "),
      x0: Math.min(...l.words.map(w => w.x0)),
      y0: Math.min(...l.words.map(w => w.y0)),
      x1: Math.max(...l.words.map(w => w.x1)),
      y1: Math.max(...l.words.map(w => w.y1)),
      height: lineHeight,
      demolition: tokens.some(t => DEMOLITION_WORDS.has(t)),
    });
  }
  return titles.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
}

/**
 * Coarse ink of the whole sheet, for finding where a plan ends sideways:
 * `data[row * cols + col]` is 1 when that `cell` x `cell` point square holds
 * drawing.
 */
export type InkMap = {
  cell: number;
  cols: number;
  rows: number;
  data: Uint8Array;
};

/**
 * The drawing each title names: the area ABOVE it, from just left of it (a
 * title sits under its plan's left edge, after a north arrow) to the next
 * title along the same row or the page edge, and up to the title above it
 * in the same column. With an ink map, a plan also ends at the first strip
 * of white at least PLAN_GAP_POINTS wide — the gap before a notes column.
 *
 * A title drawn ABOVE its plan is not read right by this. None of the sets
 * measured does that; a find then lands outside every region and is flagged
 * rather than silently counted.
 */
export function planRegions(
  titles: readonly PlanTitle[],
  pageWidth: number,
  pageHeight: number,
  ink?: InkMap
): PlanRegion[] {
  return titles.map(t => {
    const x0 = Math.max(0, t.x0 - 4 * t.height);
    let x1 = pageWidth;
    for (const v of titles)
      if (
        v !== t &&
        v.x0 > t.x1 &&
        Math.abs((v.y0 + v.y1) / 2 - (t.y0 + t.y1) / 2) < 0.1 * pageHeight
      )
        x1 = Math.min(x1, v.x0 - 4 * v.height);
    let y0 = 0;
    for (const u of titles)
      if (u !== t && u.y1 < t.y0 && u.x0 < x1 && u.x1 > x0)
        // Below the title above, and below its scale line.
        y0 = Math.max(y0, u.y1 + 2 * u.height);
    const region: PlanRegion = {
      title: t.text,
      demolition: t.demolition,
      x0,
      y0,
      x1,
      y1: t.y0,
    };
    return ink ? trimToInk(region, ink, t.x1) : region;
  });
}

/** End a region sideways at the first wide white strip right of `fromX`. */
function trimToInk(r: PlanRegion, ink: InkMap, fromX: number): PlanRegion {
  const c0 = Math.max(0, Math.floor(fromX / ink.cell));
  const c1 = Math.min(ink.cols, Math.ceil(r.x1 / ink.cell));
  const r0 = Math.max(0, Math.floor(r.y0 / ink.cell));
  const r1 = Math.min(ink.rows, Math.ceil(r.y1 / ink.cell));
  const rows = Math.max(1, r1 - r0);
  const gapCells = Math.ceil(PLAN_GAP_POINTS / ink.cell);
  let run = 0;
  for (let c = c0; c < c1; c++) {
    let count = 0;
    for (let row = r0; row < r1; row++) count += ink.data[row * ink.cols + c];
    run = count <= 0.01 * rows ? run + 1 : 0;
    if (run >= gapCells)
      return { ...r, x1: Math.min(r.x1, (c - run + 2) * ink.cell) };
  }
  return r;
}

/** The plan a point is on: the smallest region holding it, or null. */
export function regionAt(
  regions: readonly PlanRegion[],
  x: number,
  y: number
): PlanRegion | null {
  let best: PlanRegion | null = null;
  for (const r of regions)
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
      if (
        !best ||
        (r.x1 - r.x0) * (r.y1 - r.y0) <
          (best.x1 - best.x0) * (best.y1 - best.y0)
      )
        best = r;
  return best;
}

/**
 * Where to search, in page points: the plan the box is on, padded by a
 * symbol so one drawn on the plan's edge is still whole; the whole sheet
 * when the box is on no titled plan (a legend, a detail, or a sheet with no
 * titles in its text layer).
 */
export function searchArea(
  regions: readonly PlanRegion[],
  box: MatchBox,
  pageWidth: number,
  pageHeight: number
): {
  x: number;
  y: number;
  width: number;
  height: number;
  plan: PlanRegion | null;
} {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const plan = regionAt(regions, cx, cy);
  if (!plan) return { x: 0, y: 0, width: pageWidth, height: pageHeight, plan };
  const pad = Math.max(Math.abs(box.width), Math.abs(box.height));
  const x0 = Math.max(0, plan.x0 - pad);
  const y0 = Math.max(0, plan.y0 - pad);
  const x1 = Math.min(pageWidth, plan.x1 + pad);
  const y1 = Math.min(pageHeight, plan.y1 + pad);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, plan };
}

// ── 3. Peaks to finds ───────────────────────────────────────────────────────

export type ScanPeak = {
  /** Centre, page points. */
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  score: number;
  size: number;
  rotation: Match["rotation"];
};

/** One find per spot: the best-scoring peak wins, closer ones are dropped. */
export function onePerSpot(peaks: readonly ScanPeak[]): ScanPeak[] {
  const kept: ScanPeak[] = [];
  for (const p of [...peaks].sort((a, b) => b.score - a.score)) {
    const sep = Math.max(p.halfWidth, p.halfHeight);
    if (!kept.some(q => Math.hypot(q.x - p.x, q.y - p.y) < sep)) kept.push(p);
  }
  return kept;
}

export const DEMOLITION_REASON = (title: string) =>
  `On the demolition plan (${title}) — not counted unless you count it.`;
/**
 * Every scan find carries this until something has read the words beside
 * it. A picture cannot: on E1.02 the 11 receptacles he counted and the 18
 * with an "E" beside them (existing) are the same drawing. Without this,
 * "Confirm all" would count all 29 as new. The AI button's "same" answer
 * takes it off (findMatchingSession `applyAiAnswers`); otherwise each is
 * confirmed by a person who has looked.
 */
export const SCAN_UNREAD_REASON =
  "On a scan the tag or an E beside it is not read — check it by eye.";
/**
 * Below this score a find is a weaker likeness. Measured on E1.01 for the
 * 2x2 square: his 13 scored 0.87–1.00, and the 81 halves of 2x4 fixtures it
 * also matched scored 0.71–0.80. (A first try measured the ink joined on
 * round each find instead; it flagged 6 of his own and 2 of the 81.)
 */
export const WEAK_SCORE = 0.85;
export const WEAK_REASON = (score: number) =>
  `A weaker likeness (${score.toFixed(2)}) than an exact copy — it may be part of a bigger symbol, or a different one.`;
export const OFF_PLAN_REASON =
  "Not inside the plan you boxed on — it may be in a legend, a schedule or a detail.";

/**
 * The finds, as the panel's matches. Only finds inside the searched plan are
 * offered: the padding round it can reach into the next plan, and a find
 * there belongs to that plan's count, not this one.
 */
export function scanMatches(
  peaks: readonly ScanPeak[],
  opts: {
    /** The box drawn on THIS sheet; null for a saved look from another. */
    box: MatchBox | null;
    quality: ScanQuality;
    plan: PlanRegion | null;
    regions: readonly PlanRegion[];
  }
): Match[] {
  const { box, quality, plan, regions } = opts;
  const out: Match[] = [];
  for (const p of onePerSpot(peaks)) {
    const at = regionAt(regions, p.x, p.y);
    if (plan && at !== plan) continue;
    const needsLook: string[] = [SCAN_UNREAD_REASON];
    if (quality.kind === "coarse") needsLook.push(quality.reason);
    if (p.score < WEAK_SCORE) needsLook.push(WEAK_REASON(p.score));
    if (!plan && regions.length > 0 && !at) needsLook.push(OFF_PLAN_REASON);
    const on = plan ?? at;
    const demolition = on?.demolition ? on.title : null;
    out.push({
      x: p.x,
      y: p.y,
      halfWidth: p.halfWidth,
      halfHeight: p.halfHeight,
      rotation: p.rotation,
      mirrored: false,
      coverage: p.score,
      needsLook,
      maybeExisting: [],
      isBoxed:
        box !== null &&
        Math.abs(p.x - (box.x + box.width / 2)) <= Math.abs(box.width) / 2 &&
        Math.abs(p.y - (box.y + box.height / 2)) <= Math.abs(box.height) / 2,
      onDemolitionPlan: demolition,
    });
  }
  return out;
}

// ── 4. The search itself (opencv.js) ────────────────────────────────────────

/** The few opencv.js calls used, typed here rather than through its d.ts. */
export interface CvMat {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  data32S: Int32Array;
  data64F: Float64Array;
  roi(rect: unknown): CvMat;
  clone(): CvMat;
  intAt(row: number, col: number): number;
  delete(): void;
}
export interface OpenCv {
  Mat: new (...args: unknown[]) => CvMat;
  Size: new (w: number, h: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Rect: new (x: number, y: number, w: number, h: number) => unknown;
  Scalar: new (v: number) => unknown;
  CV_8UC1: number;
  CV_32S: number;
  THRESH_BINARY: number;
  THRESH_BINARY_INV: number;
  THRESH_OTSU: number;
  INTER_AREA: number;
  INTER_LINEAR: number;
  INTER_NEAREST: number;
  BORDER_CONSTANT: number;
  TM_CCOEFF_NORMED: number;
  ROTATE_90_CLOCKWISE: number;
  ROTATE_180: number;
  ROTATE_90_COUNTERCLOCKWISE: number;
  CC_STAT_AREA: number;
  matFromArray(
    rows: number,
    cols: number,
    type: number,
    data: ArrayLike<number>
  ): CvMat;
  threshold(
    src: CvMat,
    dst: CvMat,
    t: number,
    max: number,
    type: number
  ): number;
  resize(
    src: CvMat,
    dst: CvMat,
    size: unknown,
    fx: number,
    fy: number,
    interp: number
  ): void;
  rotate(src: CvMat, dst: CvMat, code: number): void;
  HoughLinesP(
    src: CvMat,
    lines: CvMat,
    rho: number,
    theta: number,
    threshold: number,
    minLength: number,
    maxGap: number
  ): void;
  getRotationMatrix2D(centre: unknown, angle: number, scale: number): CvMat;
  warpAffine(
    src: CvMat,
    dst: CvMat,
    m: CvMat,
    size: unknown,
    flags: number,
    border: number,
    value: unknown
  ): void;
  connectedComponentsWithStats(
    src: CvMat,
    labels: CvMat,
    stats: CvMat,
    centroids: CvMat,
    connectivity: number,
    ltype: number
  ): number;
  GaussianBlur(src: CvMat, dst: CvMat, size: unknown, sigma: number): void;
  matchTemplate(src: CvMat, templ: CvMat, result: CvMat, method: number): void;
}

/** The plan as rendered for searching: grey, `scale` pixels per point. */
export type ScanImage = {
  gray: Uint8Array;
  width: number;
  height: number;
  /** Page point of pixel (0, 0). */
  x0: number;
  y0: number;
  scale: number;
};

const TURNS: Match["rotation"][] = [0, 90, 180, 270];

/**
 * The searched picture, cleaned once: black-and-white (ink white),
 * straightened, specks removed, softened — plus an integral of its ink, and
 * the maps between page points and its pixels. One per search, whatever
 * number of looks is then run against it. `free()` releases its opencv Mats:
 * they live outside the JS heap, and a leaked one is a plan-sized block.
 */
type PreparedScan = {
  img: ScanImage;
  soft: CvMat;
  skew: number;
  /** Ink pixels in a window of the cleaned picture. */
  inkIn: (x: number, y: number, w: number, h: number) => number;
  /** Page point → cleaned-picture pixel, and back. */
  toPx: (x: number, y: number) => [number, number];
  toPage: (px: number, py: number) => [number, number];
  free: () => void;
};

function prepareScan(cv: OpenCv, img: ScanImage): PreparedScan {
  const { width: W, height: H, scale: K } = img;
  const made: CvMat[] = [];
  const keep = <T extends CvMat>(m: T) => (made.push(m), m);
  try {
    const src = keep(cv.matFromArray(H, W, cv.CV_8UC1, img.gray));
    // Black-and-white, ink white (Otsu picks the cut per sheet).
    const bw = keep(new cv.Mat());
    cv.threshold(src, bw, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);

    // Straighten: the median angle of long near-level lines, read on a
    // quarter-size copy (fast).
    const q = keep(new cv.Mat());
    cv.resize(
      bw,
      q,
      new cv.Size(Math.max(1, W >> 2), Math.max(1, H >> 2)),
      0,
      0,
      cv.INTER_AREA
    );
    cv.threshold(q, q, 60, 255, cv.THRESH_BINARY);
    const lines = keep(new cv.Mat());
    cv.HoughLinesP(q, lines, 1, Math.PI / 3600, 120, Math.min(300, W >> 3), 2);
    const angles: number[] = [];
    for (let i = 0; i < lines.rows; i++) {
      const d = lines.data32S;
      const [x1, y1, x2, y2] = [
        d[i * 4],
        d[i * 4 + 1],
        d[i * 4 + 2],
        d[i * 4 + 3],
      ];
      const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      if (Math.abs(a) < 3) angles.push(a);
    }
    angles.sort((a, b) => a - b);
    const skew = angles.length ? angles[angles.length >> 1] : 0;
    // Forward map (original px -> straightened px) and back.
    let fwd = (x: number, y: number): [number, number] => [x, y];
    let back = fwd;
    if (Math.abs(skew) > 0.05) {
      const M = keep(
        cv.getRotationMatrix2D(new cv.Point(W / 2, H / 2), skew, 1)
      );
      cv.warpAffine(
        bw,
        bw,
        M,
        new cv.Size(W, H),
        cv.INTER_NEAREST,
        cv.BORDER_CONSTANT,
        new cv.Scalar(0)
      );
      const m = Array.from(M.data64F);
      fwd = (x, y) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
      // The inverse of a rotation about a point: transpose the 2x2.
      back = (x, y) => {
        const dx = x - m[2];
        const dy = y - m[5];
        return [m[0] * dx + m[3] * dy, m[1] * dx + m[4] * dy];
      };
    }

    // Specks: pieces under 5 px at 150 dpi.
    const labels = keep(new cv.Mat());
    const stats = keep(new cv.Mat());
    const cents = keep(new cv.Mat());
    const n = cv.connectedComponentsWithStats(
      bw,
      labels,
      stats,
      cents,
      8,
      cv.CV_32S
    );
    const speck = new Uint8Array(n);
    for (let i = 1; i < n; i++)
      if (stats.intAt(i, cv.CC_STAT_AREA) < 5) speck[i] = 1;
    const lab = labels.data32S;
    const px = bw.data;
    for (let i = 0; i < px.length; i++) if (speck[lab[i]]) px[i] = 0;

    const soft = keep(new cv.Mat());
    cv.GaussianBlur(bw, soft, new cv.Size(3, 3), 0);

    /*
      Ink per window, from an integral of the cleaned picture. Normalised
      correlation is 0 / 0 on blank paper, and opencv answers +1 there — so
      without this every white pixel is a "find", and one-per-spot over
      millions of them never finishes (seen on E1.01, 2026-10-01). A copy
      holds about as much ink as the picked one; a window with under half or
      over twice as much is not one.
    */
    const sum = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += px[y * W + x] ? 1 : 0;
        sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + row;
      }
    }
    const inkIn = (x: number, y: number, w: number, h: number) =>
      sum[(y + h) * (W + 1) + x + w] -
      sum[y * (W + 1) + x + w] -
      sum[(y + h) * (W + 1) + x] +
      sum[y * (W + 1) + x];

    // Everything but the softened picture can go now.
    const kept = soft;
    made.filter(m => m !== kept).forEach(m => m.delete());
    made.length = 0;
    return {
      img,
      soft: kept,
      skew,
      inkIn,
      toPx: (x, y) => fwd((x - img.x0) * K, (y - img.y0) * K),
      toPage: (px2, py) => {
        const [ox, oy] = back(px2, py);
        return [img.x0 + ox / K, img.y0 + oy / K];
      },
      free: () => kept.delete(),
    };
  } catch (error) {
    made.forEach(m => m.delete());
    throw error;
  }
}

/** A template ready to search for: softened picture, size, ink. */
type ScanTemplate = { base: CvMat; tw: number; th: number; ink: number };

/** The picture inside `box` (page points) on the prepared picture itself. */
function templateHere(
  cv: OpenCv,
  p: PreparedScan,
  box: MatchBox
): ScanTemplate | null {
  const K = p.img.scale;
  const [bcx, bcy] = p.toPx(box.x + box.width / 2, box.y + box.height / 2);
  const tw = Math.max(3, Math.round(Math.abs(box.width) * K));
  const th = Math.max(3, Math.round(Math.abs(box.height) * K));
  const tx = Math.round(bcx - tw / 2);
  const ty = Math.round(bcy - th / 2);
  if (tx < 0 || ty < 0 || tx + tw > p.img.width || ty + th > p.img.height)
    return null;
  const roi = p.soft.roi(new cv.Rect(tx, ty, tw, th));
  const base = roi.clone();
  roi.delete();
  let inked = 0;
  for (let i = 0; i < base.data.length; i++) if (base.data[i] > 127) inked++;
  if (inked < 4) {
    base.delete();
    return null;
  }
  return { base, tw, th, ink: Math.max(1, p.inkIn(tx, ty, tw, th)) };
}

/**
 * The picture inside `box` on ANOTHER sheet of the same scanned set — a
 * saved look (multiple-looks-plan.md § 3). `from` is that sheet's region
 * round the box, rendered at the same scale; it is cleaned the same way
 * (black-and-white, softened) so the template compares like for like.
 */
function templateFrom(
  cv: OpenCv,
  from: ScanImage,
  box: MatchBox
): ScanTemplate | null {
  const made: CvMat[] = [];
  const keep = <T extends CvMat>(m: T) => (made.push(m), m);
  try {
    const K = from.scale;
    const src = keep(
      cv.matFromArray(from.height, from.width, cv.CV_8UC1, from.gray)
    );
    const bw = keep(new cv.Mat());
    cv.threshold(src, bw, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const soft = keep(new cv.Mat());
    cv.GaussianBlur(bw, soft, new cv.Size(3, 3), 0);
    const tw = Math.max(3, Math.round(Math.abs(box.width) * K));
    const th = Math.max(3, Math.round(Math.abs(box.height) * K));
    const tx = Math.round((box.x - from.x0) * K);
    const ty = Math.round((box.y - from.y0) * K);
    if (tx < 0 || ty < 0 || tx + tw > from.width || ty + th > from.height)
      return null;
    let ink = 0;
    for (let y = ty; y < ty + th; y++)
      for (let x = tx; x < tx + tw; x++) if (bw.data[y * from.width + x]) ink++;
    if (ink < 4) return null;
    const roi = keep(soft.roi(new cv.Rect(tx, ty, tw, th)));
    return { base: roi.clone(), tw, th, ink };
  } finally {
    made.forEach(m => m.delete());
  }
}

/** Every place on the prepared picture that looks like `t`, as peaks. */
function searchTemplate(
  cv: OpenCv,
  p: PreparedScan,
  t: ScanTemplate,
  threshold: number
): ScanPeak[] {
  const { width: W, height: H, scale: K } = p.img;
  const peaks: ScanPeak[] = [];
  const rotateCodes = [
    cv.ROTATE_90_CLOCKWISE,
    cv.ROTATE_180,
    cv.ROTATE_90_COUNTERCLOCKWISE,
  ];
  for (const size of SCAN_SIZES)
    for (const rotation of TURNS) {
      const sized = new cv.Mat();
      const turned = new cv.Mat();
      const res = new cv.Mat();
      try {
        cv.resize(
          t.base,
          sized,
          new cv.Size(
            Math.max(3, Math.round(t.tw * size)),
            Math.max(3, Math.round(t.th * size))
          ),
          0,
          0,
          cv.INTER_LINEAR
        );
        if (rotation) cv.rotate(sized, turned, rotateCodes[rotation / 90 - 1]);
        const m = rotation ? turned : sized;
        if (m.cols >= W || m.rows >= H) continue;
        cv.matchTemplate(p.soft, m, res, cv.TM_CCOEFF_NORMED);
        const rw = res.cols;
        const rh = res.rows;
        const f = res.data32F;
        for (let y = 1; y < rh - 1; y++)
          for (let x = 1; x < rw - 1; x++) {
            const v = f[y * rw + x];
            if (!(v >= threshold)) continue;
            // Strictly above the left and upper neighbours, so a plateau
            // gives one peak, not one per pixel.
            if (
              v <= f[y * rw + x - 1] ||
              v < f[y * rw + x + 1] ||
              v <= f[(y - 1) * rw + x] ||
              v < f[(y + 1) * rw + x]
            )
              continue;
            const ink = p.inkIn(x, y, m.cols, m.rows) / (size * size);
            if (ink < 0.5 * t.ink || ink > 2 * t.ink) continue;
            const [px2, py] = p.toPage(x + m.cols / 2, y + m.rows / 2);
            peaks.push({
              x: px2,
              y: py,
              halfWidth: m.cols / K / 2,
              halfHeight: m.rows / K / 2,
              score: v,
              size,
              rotation,
            });
          }
      } finally {
        sized.delete();
        turned.delete();
        res.delete();
      }
    }
  return peaks;
}

/**
 * Every place on `img` that looks like the picture inside `box` (page
 * points), at SCAN_SIZES x four quarter turns, as raw peaks in page points.
 */
export function searchScanImage(
  cv: OpenCv,
  img: ScanImage,
  box: MatchBox,
  opts: { score?: number } = {}
): { peaks: ScanPeak[]; skew: number; empty: boolean } {
  const p = prepareScan(cv, img);
  try {
    const t = templateHere(cv, p, box);
    if (!t) return { peaks: [], skew: p.skew, empty: true };
    try {
      return {
        peaks: searchTemplate(cv, p, t, opts.score ?? SCAN_MATCH_SCORE),
        skew: p.skew,
        empty: false,
      };
    } finally {
      t.base.delete();
    }
  } finally {
    p.free();
  }
}

// ── 5. The whole scan branch, as the worker and the check script run it ─────

/** Ink-map resolution: one cell is this many points (a 36 dpi render). */
const INK_CELL_POINTS = 2;
/**
 * A pixel this dark or darker is ink, on the ink-map render. Lenient on
 * purpose: shrunk this far, a one-pixel scanned line is a faint grey, and at
 * the first try (18 dpi, 160) E1.01's lighting plan was cut off at x 1380 of
 * its 1965 because its walls read as white. A speck read as ink only makes
 * a plan wider, which is the safe direction.
 */
const INK_DARK = 240;

/**
 * A saved look of the item, for a scan search (multiple-looks-plan.md § 3):
 * its box on another sheet of THIS plan set, and how to render round it.
 * Looks from other plan sets never come here — a picture from another set's
 * scan is a different resolution and line weight, the comparison
 * plan-viewer-overhaul.md § 9.3 rejects — and the worker says so.
 */
export type ScanLook = {
  source: Extract<LookSource, { kind: "look" }>;
  box: MatchBox;
  render: (
    rect: { x: number; y: number; width: number; height: number },
    scale: number
  ) => Promise<ScanImage>;
};

/**
 * Find all matching on a SCANNED page: refuse a symbol too coarse to
 * match, find the plans by their titles, search only the plan the box is
 * on, and hand back unconfirmed matches. With saved looks, each is searched
 * too and the results merged (@/lib/lookMatching); with no box, the looks
 * alone are searched, across the whole sheet. `render` draws a part of the
 * page grey at a scale; `loadCv` is called only once something has passed
 * the size check, so a refusal never downloads opencv.js (10 MB).
 */
export async function findOnScan(opts: {
  box: MatchBox | null;
  looks?: readonly ScanLook[];
  pixelsPerPoint: number;
  words: readonly WordBox[];
  pageWidth: number;
  pageHeight: number;
  render: (
    rect: { x: number; y: number; width: number; height: number },
    scale: number
  ) => Promise<ScanImage>;
  loadCv: () => Promise<OpenCv>;
}): Promise<
  | {
      kind: "ok";
      matches: MergedMatch[];
      plan: PlanRegion | null;
      regions: PlanRegion[];
      pixels: number;
      skew: number;
      /** What could not be used, said plainly for the panel. */
      notes: string[];
    }
  | { kind: "tooPoor" | "empty"; message: string }
> {
  const { box, pageWidth, pageHeight } = opts;
  const notes: string[] = [];
  const quality = box ? scanQuality(box, opts.pixelsPerPoint) : null;
  if (quality?.kind === "tooPoor")
    return { kind: "tooPoor", message: quality.message };
  const looks = (opts.looks ?? []).flatMap(look => {
    const q = scanQuality(look.box, opts.pixelsPerPoint);
    if (q.kind === "tooPoor") {
      notes.push(
        `A saved look is ${q.pixels} pixels across on this scan — too coarse to search, so it was left out.`
      );
      return [];
    }
    return [{ ...look, quality: q }];
  });
  if (!box && looks.length === 0)
    return {
      kind: "empty",
      message:
        notes[0] ??
        "This item has no saved look from this plan set to search with. Box one on the drawing.",
    };

  const overview = await opts.render(
    { x: 0, y: 0, width: pageWidth, height: pageHeight },
    1 / INK_CELL_POINTS
  );
  const ink: InkMap = {
    cell: INK_CELL_POINTS,
    cols: overview.width,
    rows: overview.height,
    data: Uint8Array.from(overview.gray, v => (v <= INK_DARK ? 1 : 0)),
  };
  const regions = planRegions(
    planTitles(opts.words),
    pageWidth,
    pageHeight,
    ink
  );
  // With a box, the plan it is on; with only saved looks, the whole sheet
  // (each find still says which plan it is on, demolition included).
  const area = box
    ? searchArea(regions, box, pageWidth, pageHeight)
    : { x: 0, y: 0, width: pageWidth, height: pageHeight, plan: null };

  const cv = await opts.loadCv();
  const img = await opts.render(area, SCAN_WORK_SCALE);
  const prepared = prepareScan(cv, img);
  const results: LookResult[] = [];
  try {
    if (box && quality) {
      const t = templateHere(cv, prepared, box);
      if (!t && looks.length === 0)
        return {
          kind: "empty",
          message:
            "There is no drawing inside that box on this scan. Box the symbol itself.",
        };
      if (t)
        try {
          results.push({
            source: { kind: "box" },
            matches: scanMatches(
              searchTemplate(cv, prepared, t, SCAN_MATCH_SCORE),
              { box, quality, plan: area.plan, regions }
            ),
          });
        } finally {
          t.base.delete();
        }
    }
    for (const look of looks) {
      const pad = 4;
      const from = await look.render(
        {
          x: look.box.x - pad,
          y: look.box.y - pad,
          width: look.box.width + 2 * pad,
          height: look.box.height + 2 * pad,
        },
        SCAN_WORK_SCALE
      );
      const t = templateFrom(cv, from, look.box);
      if (!t) {
        notes.push("A saved look has no drawing in its box and was left out.");
        continue;
      }
      try {
        results.push({
          source: look.source,
          matches: scanMatches(
            searchTemplate(cv, prepared, t, SCAN_MATCH_SCORE),
            { box: null, quality: look.quality, plan: area.plan, regions }
          ),
        });
      } finally {
        t.base.delete();
      }
    }
  } finally {
    prepared.free();
  }
  return {
    kind: "ok",
    matches: mergeLookResults(results),
    plan: area.plan,
    regions,
    pixels: quality?.pixels ?? looks[0]?.quality.pixels ?? 0,
    skew: prepared.skew,
    notes,
  };
}
