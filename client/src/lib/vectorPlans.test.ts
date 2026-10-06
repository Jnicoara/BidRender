/**
 * Demolition plans on VECTOR sheets, by their printed title
 * (@/lib/vectorPlans). Known answer on Weld 1 E-200, measured with
 * scripts/codeFirstCeiling.mts `demotitles`: all 21 finds in "B DEMOLITION
 * POWER PLAN" demolition, 0 clear, 0 of plan A's 53 touched — with or
 * without CAD layers. These fixtures make the same layout happen on purpose:
 * the demolition title sits well right of its drawing's left edge, as on
 * E-200, so a device near that edge is in no plan unless the region grows
 * left to the white gap.
 */
import { describe, expect, it } from "vitest";
import {
  demolitionPlanAt,
  growLeftToInk,
  inkFromSegments,
  vectorPlanRegions,
} from "./vectorPlans";
import { findMatching } from "./findMatching";
import type { VectorGeometry } from "./vectorGeometry";
import type { WordBox } from "./textSelection";

/** A word whose left edge is at x0, baseline row at cy, `height` tall. */
function word(text: string, x0: number, cy: number, height: number): WordBox {
  const width = 0.6 * height * text.length;
  return {
    text,
    item: 0,
    x0,
    x1: x0 + width,
    y0: cy - height / 2,
    y1: cy + height / 2,
    cx: x0 + width / 2,
    cy,
    dx: 1,
    dy: 0,
    height,
  };
}

/** A line of words, left to right with a space between. */
function line(text: string, x0: number, cy: number, height: number) {
  const out: WordBox[] = [];
  let x = x0;
  for (const t of text.split(" ")) {
    const w = word(t, x, cy, height);
    out.push(w);
    x = w.x1 + 0.4 * height;
  }
  return out;
}

const PAGE = { width: 1000, height: 600 };
// Small note text everywhere sets the sheet's ordinary height.
const notes = Array.from({ length: 24 }, (_, i) =>
  word("NOTE", 20 + i * 40, 580, 3)
);
const titles = [
  ...line("A POWER PLAN", 60, 500, 8),
  // Its drawing starts at x 520; the title sits at 640 — 4 heights is 32.
  ...line("B DEMOLITION POWER PLAN", 640, 500, 8),
];
const words = [...notes, ...titles];

/** A rectangle outline: the "drawing" of a plan. */
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  x0,
  y0,
  x1,
  y0,
  x1,
  y0,
  x1,
  y1,
  x1,
  y1,
  x0,
  y1,
  x0,
  y1,
  x0,
  y0,
];
/** Plan A drawn 50–400, plan B 520–950: a 120 pt white gap between. */
const background = [
  ...rect(50, 100, 400, 450),
  ...rect(520, 100, 950, 450),
  ...Array.from({ length: 40 }, (_, i) => [
    60 + i * 8,
    110,
    64 + i * 8,
    110,
  ]).flat(),
  ...Array.from({ length: 50 }, (_, i) => [
    530 + i * 8,
    110,
    534 + i * 8,
    110,
  ]).flat(),
];

describe("plans on a vector sheet, by title", () => {
  it("finds both plans, the demolition one marked, and grows it left to its own drawing", () => {
    const regions = vectorPlanRegions(
      words,
      Float32Array.from(background),
      PAGE.width,
      PAGE.height
    );
    expect(regions.map(r => [r.title, r.demolition])).toEqual([
      ["A POWER PLAN", false],
      ["B DEMOLITION POWER PLAN", true],
    ]);
    const b = regions[1];
    // Without growing it would start at 640 - 32 = 608, past its drawing.
    expect(b.x0).toBeLessThanOrEqual(520);
    expect(b.x0).toBeGreaterThan(400);
    expect(demolitionPlanAt(regions, 540, 300)).toBe("B DEMOLITION POWER PLAN");
    expect(demolitionPlanAt(regions, 200, 300)).toBeNull();
  });

  it("never grows into the plan beside it", () => {
    const ink = inkFromSegments(
      Float32Array.from(background),
      PAGE.width,
      PAGE.height
    );
    const grown = growLeftToInk(
      { title: "B", demolition: true, x0: 608, y0: 0, x1: 1000, y1: 495 },
      ink,
      450
    );
    expect(grown.x0).toBeGreaterThanOrEqual(450);
  });

  it("reads nothing when the text names no plan", () => {
    expect(
      vectorPlanRegions(
        notes,
        Float32Array.from(background),
        PAGE.width,
        PAGE.height
      )
    ).toEqual([]);
  });
});

describe("Find all matching on a sheet with a demolition plan", () => {
  /** A small square-and-tail symbol at (x, y). */
  const symbol = (x: number, y: number) => [
    x - 4,
    y - 4,
    x + 4,
    y - 4,
    x + 4,
    y - 4,
    x + 4,
    y + 4,
    x + 4,
    y + 4,
    x - 4,
    y + 4,
    x - 4,
    y + 4,
    x - 4,
    y - 4,
    x - 4,
    y,
    x + 9,
    y,
  ];
  const segs = [
    ...background,
    ...symbol(200, 300), // plan A
    ...symbol(300, 300), // plan A
    ...symbol(540, 300), // plan B, left of its title — only growing finds it
    ...symbol(800, 300), // plan B
  ];
  const geo: VectorGeometry = {
    segs: Float32Array.from(segs),
    lightness: new Uint8Array(segs.length / 4),
    filled: new Uint8Array(segs.length / 4),
    imageCoverage: 0,
    imagePixelsPerPoint: 0,
    page: PAGE,
  };

  it("every find on the demolition plan is demolition — never a clear, new device", () => {
    const r = findMatching(geo, words, {
      x: 190,
      y: 290,
      width: 25,
      height: 20,
    });
    if (r.kind !== "ok") throw new Error(r.kind);
    const at = (x: number) => r.matches.find(m => Math.abs(m.x - x) < 6)!;
    expect(at(202.5).onDemolitionPlan).toBeNull();
    expect(at(302.5).onDemolitionPlan).toBeNull();
    expect(at(542.5).onDemolitionPlan).toBe("B DEMOLITION POWER PLAN");
    expect(at(802.5).onDemolitionPlan).toBe("B DEMOLITION POWER PLAN");
  });
});
