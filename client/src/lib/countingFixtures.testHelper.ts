/**
 * The counting deep test's plan set, read the way the screen reads it, and
 * the scoring — shared by client/src/lib/countingDeep.test.ts (line work)
 * and client/src/lib/countingScan.test.ts (the same sheet as a scan).
 * Not a test file; nothing in the app imports it.
 */
import {
  type PageSpec,
  type Placed,
  type SheetLine,
  type SymbolDef,
} from "./testPlanPdf.testHelper";
import { extractVectorGeometry, type VectorGeometry } from "./vectorGeometry";
import { wordBoxes, type WordBox } from "./textSelection";
import type { Match } from "./findMatching";
import { clearOpen, matchItems } from "./findMatchingSession";

// ─── The symbols ──────────────────────────────────────────────────────────────

const line = (x1: number, y1: number, x2: number, y2: number) =>
  ({ kind: "line", x1, y1, x2, y2 }) as const;

export const SYMBOLS: SymbolDef[] = [
  // Duplex receptacle: a circle with two short bars.
  {
    name: "duplex",
    ops: [
      { kind: "circle", r: 6 },
      line(-2.5, -4, -2.5, 4),
      line(2.5, -4, 2.5, 4),
    ],
  },
  // GFCI: the SAME shape, plus "GF" beside it — the classic look-alike.
  {
    name: "gfci",
    ops: [
      { kind: "circle", r: 6 },
      line(-2.5, -4, -2.5, 4),
      line(2.5, -4, 2.5, 4),
      { kind: "text", text: "GF", size: 6, x: 8, y: -2 },
    ],
  },
  // A bare circle: must NOT be a duplex.
  { name: "circle", ops: [{ kind: "circle", r: 6 }] },
  // Junction box: circle + J. Smoke detector: circle + SD. Same shape,
  // different word — neither may count as the other.
  {
    name: "jbox",
    ops: [
      { kind: "circle", r: 7 },
      { kind: "text", text: "J", size: 7, x: -1.9, y: -2.5 },
    ],
  },
  {
    name: "smoke",
    ops: [
      { kind: "circle", r: 7 },
      { kind: "text", text: "SD", size: 6, x: -3.9, y: -2.1 },
    ],
  },
  // 2x4 troffer: a rectangle with an X. A rectangle with no X must not count.
  {
    name: "troffer",
    ops: [
      { kind: "rect", w: 24, h: 12 },
      line(-12, -6, 12, 6),
      line(-12, 6, 12, -6),
    ],
  },
  { name: "panelBox", ops: [{ kind: "rect", w: 24, h: 12 }] },
  // Single-pole switch: an S with a short tail.
  {
    name: "switch",
    ops: [
      { kind: "text", text: "S", size: 9, x: -2.7, y: -3.2 },
      line(0, -6, 0, -10),
    ],
  },
];

// ─── The sheets (page points, top-left origin) ───────────────────────────────

export const W = 1224; // 17 x 11, NOT the symbol's shape (CLAUDE.md fixtures)
export const H = 792;

export const P = (
  symbol: string,
  x: number,
  y: number,
  extra: Partial<Placed> = {}
): Placed => ({ symbol, x, y, ...extra });

export const SHEET_1: PageSpec = {
  width: W,
  height: H,
  placed: [
    // 10 duplexes: four turns, crowded, near text, on a wire, near a wall.
    P("duplex", 100, 100),
    P("duplex", 160, 100, { rotation: 90 }),
    P("duplex", 220, 100, { rotation: 180 }),
    P("duplex", 280, 100, { rotation: 270 }),
    P("duplex", 400, 100), // crowded row: 16 pt apart
    P("duplex", 416, 100),
    P("duplex", 432, 100),
    P("duplex", 120, 220), // beside a room name
    P("duplex", 300, 220), // a wire runs through it
    P("duplex", 520, 104), // 4 pt off a wall
    // Look-alikes for the duplex.
    P("gfci", 160, 300),
    P("gfci", 260, 300, { rotation: 90 }),
    P("gfci", 360, 300),
    P("circle", 460, 300),
    P("circle", 520, 300),
    P("circle", 580, 300),
    P("duplex", 680, 300, { scale: 1.5 }), // drawn bigger: another symbol
    P("duplex", 760, 300, { scale: 1.5 }),
    P("duplex", 860, 300, { gray: true }), // drawn lighter: maybe existing
    P("duplex", 920, 300, { gray: true }),
    // Junction boxes and smoke detectors.
    P("jbox", 100, 420),
    P("jbox", 180, 420),
    P("jbox", 260, 420, { rotation: 90 }),
    P("jbox", 340, 420),
    P("smoke", 460, 420),
    P("smoke", 540, 420),
    P("smoke", 620, 420),
    P("smoke", 700, 420),
    // Troffers and bare rectangles.
    P("troffer", 100, 540),
    P("troffer", 160, 540),
    P("troffer", 220, 540, { rotation: 90 }),
    P("troffer", 280, 540),
    P("troffer", 340, 540, { rotation: 90 }),
    P("troffer", 400, 540),
    P("panelBox", 520, 540),
    P("panelBox", 580, 540),
    P("panelBox", 640, 540),
    // Switches.
    P("switch", 100, 660),
    P("switch", 160, 660),
    P("switch", 220, 660, { rotation: 90 }),
    P("switch", 280, 660),
    P("switch", 340, 660),
  ],
  lines: [
    { x1: 260, y1: 220, x2: 340, y2: 220 }, // the wire through (300, 220)
    { x1: 470, y1: 95, x2: 600, y2: 95, gray: true }, // the wall
    { x1: 40, y1: 760, x2: 1180, y2: 760, gray: true },
  ],
  notes: [
    { text: "OFFICE 101", x: 132, y: 224, size: 7 },
    { text: "GENERAL NOTES: ALL DEVICES 18 IN AFF", x: 700, y: 650, size: 8 },
  ],
};

/** Sheet 2: the same symbols, other places and other counts. */
export const SHEET_2: PageSpec = {
  width: W,
  height: H,
  placed: [
    P("duplex", 900, 120),
    P("duplex", 960, 120, { rotation: 90 }),
    P("duplex", 1020, 120),
    P("gfci", 900, 220),
    P("troffer", 900, 400),
    P("troffer", 960, 400),
    P("panelBox", 1040, 400),
    P("jbox", 900, 560),
    P("smoke", 980, 560),
  ],
  lines: [{ x1: 860, y1: 300, x2: 1100, y2: 300 }],
};

/** Sheet 3: the hard cases. */
export const grid: Placed[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 4; c++)
    grid.push(P("troffer", 600 + c * 24, 120 + r * 12));
export const hatch: SheetLine[] = [];
for (let i = 0; i < 14; i++)
  hatch.push({
    x1: 880 + i * 6,
    y1: 520,
    x2: 880 + i * 6 + 40,
    y2: 600,
    gray: true,
  });

export const SHEET_3: PageSpec = {
  width: W,
  height: H,
  placed: [
    P("duplex", 100, 120), // 0: the plain one that is boxed
    // A wire ENDING on the circle (homerun arrow side), three times.
    P("duplex", 100, 240),
    P("duplex", 200, 240),
    P("duplex", 300, 240),
    // A circuit number beside it — not a device word, so not a flag.
    P("duplex", 100, 360),
    P("duplex", 200, 360),
    P("duplex", 300, 360),
    // Inside a hatched area (gray diagonal lines through it).
    P("duplex", 900, 560),
    P("duplex", 940, 560),
    // Turned 45 degrees: plans draw devices square, so not tried.
    P("duplex", 100, 480, { rotation: 45 }),
    P("duplex", 200, 480, { rotation: 45 }),
    ...grid,
  ],
  lines: [
    { x1: 100, y1: 290, x2: 100, y2: 246 },
    { x1: 250, y1: 240, x2: 206, y2: 240 },
    { x1: 300, y1: 190, x2: 300, y2: 234 },
    ...hatch,
  ],
  notes: [
    { text: "12", x: 110, y: 352, size: 6 },
    { text: "14", x: 210, y: 352, size: 6 },
    { text: "16", x: 310, y: 352, size: 6 },
  ],
};

// ─── Reading a sheet the way the screen does ──────────────────────────────────

export type Read = { geo: VectorGeometry; words: WordBox[] };

export async function readPages(pdf: Uint8Array): Promise<Read[]> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: pdf, verbosity: 0 }).promise;
  const out: Read[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const list = await page.getOperatorList();
    const geo = extractVectorGeometry(
      list.fnArray,
      list.argsArray,
      OPS as unknown as Record<string, number>,
      vp.transform,
      vp.width,
      vp.height
    );
    const text = await page.getTextContent();
    const words = wordBoxes({
      items: text.items,
      viewportTransform: vp.transform,
    } as unknown as Parameters<typeof wordBoxes>[0]);
    out.push({ geo, words });
  }
  return out;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** A match within this of a placed symbol's centre is that symbol. */
const SAME_SPOT = 4;

export type Score = {
  found: number;
  missed: number;
  wrong: number;
  /** True copies Confirm all takes. */
  confirmAllRight: number;
  /** Look-alikes Confirm all takes — the number that must be 0. */
  confirmAllWrong: number;
  /** What the wrong ones were, by symbol. */
  wrongAs: string[];
};

/** Which placed instances count as the target (the true answer). */
export type Truth = (p: Placed) => boolean;

export function score(
  matches: readonly Match[],
  placed: readonly Placed[],
  isTarget: Truth
): Score {
  const items = matchItems(matches, [], new Set());
  const clear = new Set(clearOpen(items).map(i => i.id));
  // The match's centre is its whole symbol's centre — words beside it
  // included (the GF of a GFCI) — so a placed symbol is the nearest one
  // whose centre lies inside the match's own box.
  const at = (m: Match) => {
    const inside = placed.filter(
      p =>
        Math.abs(p.x - m.x) <= Math.max(SAME_SPOT, m.halfWidth) &&
        Math.abs(p.y - m.y) <= Math.max(SAME_SPOT, m.halfHeight)
    );
    inside.sort(
      (a, b) =>
        Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)
    );
    return inside[0] ?? null;
  };
  const targets = placed.filter(isTarget);
  const hit = new Set<Placed>();
  const s: Score = {
    found: 0,
    missed: 0,
    wrong: 0,
    confirmAllRight: 0,
    confirmAllWrong: 0,
    wrongAs: [],
  };
  for (const item of items) {
    const p = at(item);
    const right = p !== null && isTarget(p);
    if (right) {
      hit.add(p);
      s.found++;
      if (clear.has(item.id)) s.confirmAllRight++;
    } else {
      s.wrong++;
      s.wrongAs.push(
        p ? label(p) : `nothing at ${Math.round(item.x)},${Math.round(item.y)}`
      );
      if (clear.has(item.id)) s.confirmAllWrong++;
    }
  }
  s.missed = targets.filter(t => !hit.has(t)).length;
  s.wrongAs.sort();
  return s;
}

function label(p: Placed): string {
  return [p.symbol, p.scale ? `x${p.scale}` : "", p.gray ? "gray" : ""]
    .filter(Boolean)
    .join(" ");
}

/** A snug box round a placed symbol, the way a person boxes one. */
export function boxRound(p: Placed, halfW: number, halfH: number) {
  return {
    x: p.x - halfW - 2,
    y: p.y - halfH - 2,
    width: 2 * halfW + 4,
    height: 2 * halfH + 4,
  };
}
