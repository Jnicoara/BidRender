/**
 * Find all matching, on drawings built by hand here so every rule can be
 * made to fail on purpose. Real-sheet numbers (Weld 1 E-200 against the
 * owner's hand count) come from scripts/findMatchingCheck.mts.
 *
 * The page is deliberately NOT the symbol's shape or square: a fixture that
 * shares its container's proportions hides the in-between cases (CLAUDE.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMatching, type MatchBox } from "./findMatching";
import {
  DRAW_OPS,
  extractVectorGeometry,
  lightnessOf,
  type VectorGeometry,
} from "./vectorGeometry";
import type { WordBox } from "./textSelection";

type Seg = [number, number, number, number];
type Drawn = { segs: Seg[]; light?: number; filled?: number };

function geometry(parts: Drawn[], imageCoverage = 0): VectorGeometry {
  const flat: number[] = [];
  const light: number[] = [];
  const filled: number[] = [];
  for (const p of parts)
    for (const s of p.segs) {
      flat.push(...s);
      light.push(p.light ?? 0);
      filled.push(p.filled ?? 0);
    }
  return {
    segs: Float32Array.from(flat),
    lightness: Uint8Array.from(light),
    filled: Uint8Array.from(filled),
    imageCoverage,
    imagePixelsPerPoint: 0,
  };
}

/** A word centred at (cx, cy). */
function word(text: string, cx: number, cy: number, height = 3): WordBox {
  return {
    text,
    item: 0,
    x0: cx - text.length,
    x1: cx + text.length,
    y0: cy - height / 2,
    y1: cy + height / 2,
    cx,
    cy,
    dx: 1,
    dy: 0,
    height,
  };
}

/**
 * A "duplex" drawn at (x, y): a square body and two lines out to the right,
 * then turned by `turn` quarter turns and optionally mirrored.
 */
function duplex(
  x: number,
  y: number,
  turn = 0,
  mirror = false,
  extraPair = false
): Seg[] {
  const local: Seg[] = [
    [-4, -4, 4, -4],
    [4, -4, 4, 4],
    [4, 4, -4, 4],
    [-4, 4, -4, -4],
    [-4, -1.5, 9, -1.5],
    [-4, 1.5, 9, 1.5],
  ];
  // The double duplex: a second pair across the first, past the outline.
  if (extraPair) local.push([-1.5, -9, -1.5, 4], [1.5, -9, 1.5, 4]);
  const place = (px: number, py: number): [number, number] => {
    let qx = mirror ? -px : px;
    let qy = py;
    for (let k = 0; k < turn; k++) [qx, qy] = [-qy, qx];
    return [x + qx, y + qy];
  };
  return local.map(([a, b, c, d]) => [...place(a, b), ...place(c, d)] as Seg);
}

const boxAround = (x: number, y: number, r = 10): MatchBox => ({
  x: x - r,
  y: y - r,
  width: 2 * r,
  height: 2 * r,
});

const okMatches = (r: ReturnType<typeof findMatching>) => {
  if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
  return r.matches;
};

describe("finding copies of a boxed symbol", () => {
  it("finds every copy, turned and mirrored, and marks the boxed one", () => {
    const geo = geometry([
      {
        segs: [
          ...duplex(100, 100),
          ...duplex(300, 120, 1),
          ...duplex(500, 140, 2),
          ...duplex(700, 160, 3),
          ...duplex(900, 180, 0, true),
          ...duplex(1100, 200, 1, true),
        ],
      },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(102, 100, 9)));
    // The symbol's centre is 2.5 right of its body (the lines reach to 9),
    // turned and mirrored with it.
    const expected = [
      [102.5, 100],
      [300, 122.5],
      [497.5, 140],
      [700, 157.5],
      [897.5, 180],
      [1100, 197.5],
    ];
    expect(matches).toHaveLength(6);
    for (const [x, y] of expected)
      expect(
        matches.some(m => Math.hypot(m.x - x, m.y - y) < 0.6),
        `a copy at ${x}, ${y}`
      ).toBe(true);
    expect(matches.filter(m => m.isBoxed)).toHaveLength(1);
    expect(matches.every(m => m.needsLook.length === 0)).toBe(true);
  });

  it("does not find a different symbol that only shares part of it", () => {
    // The body alone, no lines: 32 of the duplex's 58 length — under 80%.
    const body = duplex(400, 400).slice(0, 4);
    const geo = geometry([{ segs: [...duplex(100, 100), ...body] }]);
    expect(
      okMatches(findMatching(geo, [], boxAround(102, 100, 9)))
    ).toHaveLength(1);
  });

  it("flags the duplex inside a double duplex instead of counting it silently", () => {
    const geo = geometry([
      { segs: [...duplex(100, 100), ...duplex(400, 400, 0, false, true)] },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(102, 100, 9)));
    const inDouble = matches.find(m => Math.abs(m.x - 402) < 2);
    expect(inDouble?.needsLook.join()).toMatch(/more lines run through it/);
  });

  it("flags line work joined on that the boxed one does not have", () => {
    // A bow-tie: the copy has a second shape joined at its tip.
    const tri = (x: number, y: number): Seg[] => [
      [x - 4, y - 3, x + 4, y - 3],
      [x + 4, y - 3, x, y + 4],
      [x, y + 4, x - 4, y - 3],
    ];
    const geo = geometry([
      {
        segs: [
          ...tri(100, 100),
          ...tri(400, 400),
          [396, 411, 404, 411],
          [404, 411, 400, 404],
          [400, 404, 396, 411],
        ],
      },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(100, 100.5, 5)));
    // Both halves of the bow-tie ARE triangles (one turned over), so both are
    // found — and both said to be joined to more, never counted silently.
    const bowTie = matches.filter(m => m.x > 300);
    expect(bowTie).toHaveLength(2);
    for (const half of bowTie)
      expect(half.needsLook.join()).toMatch(/joined onto it/);
    expect(matches.find(m => m.isBoxed)?.needsLook).toEqual([]);
  });
});

describe("the same symbol drawn in different pieces", () => {
  /** A circle as `n` chords, centred at (x, y). */
  const circle = (x: number, y: number, r: number, n: number): Seg[] =>
    Array.from({ length: n }, (_, k) => {
      const a = (2 * Math.PI * k) / n;
      const b = (2 * Math.PI * (k + 1)) / n;
      return [
        x + r * Math.cos(a),
        y + r * Math.sin(a),
        x + r * Math.cos(b),
        y + r * Math.sin(b),
      ] as Seg;
    });

  it("finds a junction box drawn as 8 chords from one drawn as 16, because its J confirms it", () => {
    // UNCC: the legend's J circle is 14 segments, E111's is 7 — two CAD blocks.
    const geo = geometry([
      { segs: [...circle(100, 100, 5, 16), ...circle(400, 100, 5, 8)] },
    ]);
    const words = [word("J", 100, 100), word("J", 400, 100)];
    const matches = okMatches(findMatching(geo, words, boxAround(100, 100, 6)));
    expect(matches.map(m => Math.round(m.x))).toEqual([100, 400]);
  });

  it("never matches by shape alone — a wordless circle cut differently is not found", () => {
    // Shape alone ignores filled-or-not and finds a duplex inside a double
    // duplex; tried without the word rule, Weld 1 gained 12 false copies.
    const geo = geometry([
      { segs: [...circle(100, 100, 5, 16), ...circle(400, 100, 5, 8)] },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(100, 100, 6)));
    expect(matches.map(m => Math.round(m.x))).toEqual([100]);
  });
});

describe("words", () => {
  it("requires a word drawn inside the box: a circle with J is not a plain circle", () => {
    const sq = (x: number, y: number) => duplex(x, y).slice(0, 4);
    const geo = geometry([
      { segs: [...sq(100, 100), ...sq(300, 100), ...sq(500, 100)] },
    ]);
    const words = [word("J", 100, 100), word("J", 500, 100)];
    const matches = okMatches(findMatching(geo, words, boxAround(100, 100, 5)));
    expect(matches.map(m => Math.round(m.x))).toEqual([100, 500]);
  });

  it("finds a symbol that is only a word, like a switch's S", () => {
    const words = [
      word("S", 100, 100),
      word("S", 250, 300),
      word("SS", 400, 100),
    ];
    const matches = okMatches(
      findMatching(geometry([]), words, boxAround(100, 100, 3))
    );
    expect(matches.map(m => Math.round(m.x))).toEqual([100, 250]);
  });

  it("flags GF beside a copy when the boxed one has none — the GFCI look-alike", () => {
    const geo = geometry([
      { segs: [...duplex(100, 100), ...duplex(400, 100)] },
    ]);
    const words = [word("GF", 388, 100), word("21", 112, 108)];
    const matches = okMatches(findMatching(geo, words, boxAround(102, 100, 9)));
    expect(matches.find(m => m.x > 300)?.needsLook.join()).toMatch(/"GF"/);
    // A circuit number beside the boxed one is not a device word.
    expect(matches.find(m => m.isBoxed)?.needsLook).toEqual([]);
  });

  it("calls (E) beside a copy maybe existing, and (X) needs a look", () => {
    const geo = geometry([
      {
        segs: [...duplex(100, 100), ...duplex(400, 100), ...duplex(700, 100)],
      },
    ]);
    const words = [word("(E)", 402, 112), word("(X)", 702, 112)];
    const matches = okMatches(findMatching(geo, words, boxAround(102, 100, 9)));
    expect(
      matches.find(m => Math.abs(m.x - 402) < 2)?.maybeExisting.join()
    ).toMatch(/\(E\)/);
    expect(
      matches.find(m => Math.abs(m.x - 702) < 2)?.needsLook.join()
    ).toMatch(/\(X\)/);
  });
});

describe("shade", () => {
  it("leaves the background behind a symbol out of it", () => {
    const geo = geometry([
      { segs: [...duplex(100, 100), ...duplex(400, 100)] },
      // A gray outline behind the boxed one only.
      {
        segs: [
          [95, 95, 108, 95],
          [108, 95, 108, 105],
        ],
        light: 128,
      },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(102, 100, 9)));
    expect(matches).toHaveLength(2);
  });

  it("calls a lighter copy maybe existing rather than deciding", () => {
    const geo = geometry([
      { segs: duplex(100, 100) },
      { segs: duplex(400, 100), light: 128 },
    ]);
    const matches = okMatches(findMatching(geo, [], boxAround(102, 100, 9)));
    expect(matches.find(m => m.x > 300)?.maybeExisting.join()).toMatch(
      /lighter/
    );
  });
});

describe("what it refuses", () => {
  it("says a scan cannot be matched, and guesses nothing", () => {
    const r = findMatching(geometry([], 0.95), [], boxAround(100, 100));
    expect(r.kind).toBe("scan");
    expect(r.kind !== "ok" && r.message).toMatch(/scanned picture/);
  });

  it("refuses a scan even where its OCR text layer has a word in the box", () => {
    // Old Blueridge: one picture, 0 segments, an OCR layer of ~190 words.
    const r = findMatching(
      geometry([], 1),
      [word("S", 100, 100), word("S", 300, 100)],
      boxAround(100, 100, 3)
    );
    expect(r.kind).toBe("scan");
  });

  it("says an empty box is empty on a drawing", () => {
    const r = findMatching(
      geometry([{ segs: duplex(500, 500) }]),
      [],
      boxAround(100, 100)
    );
    expect(r.kind).toBe("empty");
  });

  it("refuses a box holding far more than one symbol", () => {
    const many: Seg[] = Array.from(
      { length: 700 },
      (_, i) => [i % 50, i % 30, (i % 50) + 1, i % 30] as Seg
    );
    const r = findMatching(geometry([{ segs: many }]), [], {
      x: -5,
      y: -5,
      width: 70,
      height: 50,
    });
    expect(r.kind).toBe("tooBig");
  });
});

describe("reading the line work from pdf.js", () => {
  it("pins pdf.js's path opcodes, which it does not export", () => {
    const source = readFileSync(
      "node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      "utf8"
    );
    const block = source.match(/const DrawOPS = \{([^}]*)\}/)?.[1] ?? "";
    for (const [name, value] of Object.entries(DRAW_OPS))
      expect(block).toMatch(new RegExp(`${name}: ${value}\\b`));
  });

  it("applies the transforms, splits curves, closes paths and skips clips", () => {
    const ops = {
      save: 10,
      restore: 11,
      transform: 12,
      constructPath: 91,
      stroke: 20,
      endPath: 28,
      setStrokeRGBColor: 58,
      paintImageXObject: 85,
    };
    const path = (paint: number, data: number[]) => [
      paint,
      [Float32Array.from(data)],
      null,
    ];
    const geo = extractVectorGeometry(
      [
        ops.save,
        ops.transform,
        ops.setStrokeRGBColor,
        ops.constructPath,
        ops.restore,
        ops.constructPath,
        ops.constructPath,
      ],
      [
        null,
        [2, 0, 0, 2, 10, 0],
        ["#808080"],
        path(ops.stroke, [
          DRAW_OPS.moveTo,
          0,
          0,
          DRAW_OPS.lineTo,
          5,
          0,
          DRAW_OPS.lineTo,
          5,
          5,
          DRAW_OPS.closePath,
        ]),
        null,
        path(ops.stroke, [
          DRAW_OPS.moveTo,
          0,
          0,
          DRAW_OPS.curveTo,
          0,
          1,
          1,
          1,
          1,
          0,
        ]),
        path(ops.endPath, [DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 100, 100]),
      ],
      ops,
      [1, 0, 0, 1, 0, 0],
      200,
      100
    );
    // Square in the scaled frame: 3 sides (closePath makes the third), gray.
    expect(Array.from(geo.segs.slice(0, 12))).toEqual([
      10, 0, 20, 0, 20, 0, 20, 10, 20, 10, 10, 0,
    ]);
    expect(Array.from(geo.lightness.slice(0, 3))).toEqual([128, 128, 128]);
    // After restore: unscaled, black again; the curve in 4 pieces; no clip.
    expect(geo.segs.length / 4).toBe(3 + 4);
    expect(geo.lightness[3]).toBe(0);
  });

  it("reads colours the ways pdf.js hands them over", () => {
    expect(lightnessOf(["#000000"])).toBe(0);
    expect(lightnessOf(["#ffffff"])).toBe(255);
    expect(lightnessOf([0.5])).toBe(128);
    expect(lightnessOf([0, 0, 0, 0])).toBe(255);
  });
});
