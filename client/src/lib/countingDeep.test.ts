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
import { buildPlanPdf, type Placed } from "./testPlanPdf.testHelper";
import {
  findMatching,
  prepareSheet,
  searchSymbol,
  symbolFromBox,
  TOUCHING_SYMBOLS_MESSAGE,
} from "./findMatching";
import { matchItems, summary } from "./findMatchingSession";
import {
  SHEET_1,
  SHEET_2,
  SHEET_3,
  SYMBOLS,
  boxRound,
  grid,
  readPages,
  score,
  type Read,
  type Score,
} from "./countingFixtures.testHelper";

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
