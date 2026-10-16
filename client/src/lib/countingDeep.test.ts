/**
 * COUNTING DEEP TEST — Find all matching on plan PDFs whose true answer is
 * known (owner, 2026-10-15 night; results in references/stress-results.md
 * "Counting deep test").
 *
 * The PDFs are WRITTEN here (@/lib/testPlanPdf.testHelper) and read by the
 * same pdf.js path the plans screen uses, then searched by the same
 * `findMatching` / `searchSymbol`. Every symbol placed is recorded, so each
 * search is scored:
 *
 *   found     — a true copy offered
 *   missed    — a true copy not offered
 *   wrong     — something else offered
 *   confirmAll — what "Confirm all" would put on the bid (`clearOpen`)
 *
 * The rule the app is built on: a wrong number is worse than a flagged one.
 * So a look-alike may be OFFERED with a flag (it costs one look), but it must
 * never reach Confirm all, and every true copy should. Every offer starts
 * unconfirmed (`matchItems` state "open") and counts on nothing.
 *
 * GOLDEN COUNTS: `EXPECTED` below is the per-symbol answer this sheet set must
 * keep giving. A change to the matcher that moves any number fails here,
 * naming the symbol. Where 100% is not the answer, the row says why and
 * what the person sees.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildPlanPdf,
  type PageSpec,
  type SheetLine,
  type Placed,
  type SymbolDef,
} from "./testPlanPdf.testHelper";
import { extractVectorGeometry, type VectorGeometry } from "./vectorGeometry";
import { wordBoxes, type WordBox } from "./textSelection";
import {
  findMatching,
  prepareSheet,
  searchSymbol,
  symbolFromBox,
  type Match,
  TOUCHING_SYMBOLS_MESSAGE,
} from "./findMatching";
import { clearOpen, matchItems, summary } from "./findMatchingSession";

// ─── The symbols ──────────────────────────────────────────────────────────────

const line = (x1: number, y1: number, x2: number, y2: number) =>
  ({ kind: "line", x1, y1, x2, y2 }) as const;

const SYMBOLS: SymbolDef[] = [
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

const W = 1224; // 17 x 11, NOT the symbol's shape (CLAUDE.md fixtures)
const H = 792;

const P = (
  symbol: string,
  x: number,
  y: number,
  extra: Partial<Placed> = {}
): Placed => ({ symbol, x, y, ...extra });

const SHEET_1: PageSpec = {
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
const SHEET_2: PageSpec = {
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
const grid: Placed[] = [];
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 4; c++)
    grid.push(P("troffer", 600 + c * 24, 120 + r * 12));
const hatch: SheetLine[] = [];
for (let i = 0; i < 14; i++)
  hatch.push({
    x1: 880 + i * 6,
    y1: 520,
    x2: 880 + i * 6 + 40,
    y2: 600,
    gray: true,
  });

const SHEET_3: PageSpec = {
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

type Read = { geo: VectorGeometry; words: WordBox[] };

async function readPages(pdf: Uint8Array): Promise<Read[]> {
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

type Score = {
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
type Truth = (p: Placed) => boolean;

function score(
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
function boxRound(p: Placed, halfW: number, halfH: number) {
  return {
    x: p.x - halfW - 2,
    y: p.y - halfH - 2,
    width: 2 * halfW + 4,
    height: 2 * halfH + 4,
  };
}

// ─── The golden counts ────────────────────────────────────────────────────────

const sym = (name: string) => (p: Placed) =>
  p.symbol === name && !p.scale && !p.gray && (p.rotation ?? 0) % 90 === 0;

type Case = {
  name: string;
  sheet: 0 | 2;
  boxed: Placed;
  half: [number, number];
  truth: (p: Placed) => boolean;
  expected: Score;
  /** Why it is not a clean 100%, and what the person sees. */
  note: string;
};

const S = (
  found: number,
  missed: number,
  confirmAllRight: number,
  wrongAs: string[] = []
): Score => ({
  found,
  missed,
  wrong: wrongAs.length,
  confirmAllRight,
  confirmAllWrong: 0,
  wrongAs,
});

const at1 = (i: number) => SHEET_1.placed[i];
const GF3 = ["gfci", "gfci", "gfci"];
const GRAY2 = ["duplex gray", "duplex gray"];

/**
 * Measured 2026-10-15 night, before any change to the matcher, and the
 * answer the Gate now holds. Every row: Confirm all takes every true copy
 * and NO look-alike (`confirmAllWrong` 0 everywhere).
 */
const CASES: Case[] = [
  {
    name: "duplex (4 turns, crowded, beside text, wire through, by a wall)",
    sheet: 0,
    boxed: at1(0),
    half: [6, 6],
    truth: sym("duplex"),
    expected: S(10, 0, 10, [...GRAY2, ...GF3]),
    note: "GF copies and lighter copies are OFFERED with a flag (needs a look / maybe existing) and left out of Confirm all. The 1.5x copies are not offered: a different size is a different symbol here — box one of them, or tap them.",
  },
  {
    name: "GFCI (duplex shape + GF)",
    sheet: 0,
    boxed: at1(10),
    half: [16, 6],
    truth: sym("gfci"),
    expected: S(3, 0, 3),
    note: "Plain duplexes are not offered: the GF beside the boxed one is part of it.",
  },
  {
    name: "bare circle (look-alike inside every duplex)",
    sheet: 0,
    boxed: at1(13),
    half: [6, 6],
    truth: sym("circle"),
    expected: S(3, 0, 3, [...Array(10).fill("duplex"), ...GRAY2, ...GF3]),
    note: "Every duplex holds the circle, so each is offered flagged 'more lines inside'; none reaches Confirm all.",
  },
  {
    name: "junction box (circle + J)",
    sheet: 0,
    boxed: at1(20),
    half: [7, 7],
    truth: sym("jbox"),
    expected: S(4, 0, 4),
    note: "Smoke detectors (same circle, SD) are not offered.",
  },
  {
    name: "smoke detector (circle + SD)",
    sheet: 0,
    boxed: at1(24),
    half: [7, 7],
    truth: sym("smoke"),
    expected: S(4, 0, 4),
    note: "",
  },
  {
    name: "2x4 troffer (two turns)",
    sheet: 0,
    boxed: at1(28),
    half: [12, 6],
    truth: sym("troffer"),
    expected: S(6, 0, 6),
    note: "",
  },
  {
    name: "bare rectangle (look-alike inside every troffer)",
    sheet: 0,
    boxed: at1(34),
    half: [12, 6],
    truth: sym("panelBox"),
    expected: S(3, 0, 3, Array(6).fill("troffer")),
    note: "Troffers offered flagged, never in Confirm all.",
  },
  {
    name: "switch (S + tail, one turned)",
    sheet: 0,
    boxed: at1(37),
    half: [5, 11],
    truth: sym("switch"),
    expected: S(5, 0, 5),
    note: "",
  },
  {
    name: "hard sheet duplex (wire ending on it, circuit numbers, hatching, 45°)",
    sheet: 2,
    boxed: SHEET_3.placed[0],
    half: [6, 6],
    truth: p => p.symbol === "duplex",
    expected: S(9, 2, 9),
    note: "The two turned 45° are missed ON PURPOSE: plans draw devices square, and every extra angle tried is a chance to match a non-device. The person sees 9 offered and taps the 2.",
  },
];

let sheets: Read[] = [];

beforeAll(async () => {
  sheets = await readPages(buildPlanPdf([SHEET_1, SHEET_2, SHEET_3], SYMBOLS));
}, 60_000);

describe("counting deep test — golden counts", () => {
  it("reads the generated set as three vector sheets", () => {
    expect(sheets).toHaveLength(3);
    expect(sheets[0].geo.segs.length).toBeGreaterThan(400);
    expect(sheets[0].words.map(w => w.text)).toContain("OFFICE");
  });

  it.each(CASES)("$name", c => {
    const read = sheets[c.sheet];
    const placed = c.sheet === 0 ? SHEET_1.placed : SHEET_3.placed;
    const r = findMatching(read.geo, read.words, boxRound(c.boxed, ...c.half));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(score(r.matches, placed, c.truth)).toEqual(c.expected);
  });

  it("every offer starts unconfirmed, and Confirm all takes no flagged copy", () => {
    const r = findMatching(
      sheets[0].geo,
      sheets[0].words,
      boxRound(at1(0), 6, 6)
    );
    if (r.kind !== "ok") throw new Error(r.kind);
    const items = matchItems(r.matches, [], new Set());
    expect(items.every(i => i.state === "open")).toBe(true);
    const s = summary(items);
    expect(s.confirmed).toBe(0);
    expect(s.clear).toBe(10);
    expect(s.needsLook + s.maybeExisting).toBe(5);
  });

  it("a symbol boxed on sheet 1 finds its copies on sheet 2", () => {
    const sheet1 = prepareSheet(sheets[0].geo, sheets[0].words);
    const sheet2 = prepareSheet(sheets[1].geo, sheets[1].words);
    const run = (i: number, half: [number, number], name: string) => {
      const t = symbolFromBox(sheet1, boxRound(at1(i), ...half));
      if (t.kind !== "ok") throw new Error(t.kind);
      const found = searchSymbol(t.symbol, sheet2);
      if (found.kind !== "ok") throw new Error(found.kind);
      return score(found.matches, SHEET_2.placed, sym(name));
    };
    expect(run(0, [6, 6], "duplex")).toEqual(S(3, 0, 3, ["gfci"]));
    expect(run(28, [12, 6], "troffer")).toEqual(S(2, 0, 2));
    expect(run(10, [16, 6], "gfci")).toEqual(S(1, 0, 1));
  });

  it("fixtures drawn touching in a grid: says so honestly, never a wrong count", () => {
    // Every edge (and diagonal) continues into the next fixture, so each is
    // taken as a line running through — right for a wire through a device.
    // 100% is not possible here from line work alone; the person is told
    // why and what to do instead of "nothing is drawn".
    const r = findMatching(
      sheets[2].geo,
      sheets[2].words,
      boxRound(grid[5], 12, 6)
    );
    expect(r).toEqual({ kind: "empty", message: TOUCHING_SYMBOLS_MESSAGE });
  });
});
