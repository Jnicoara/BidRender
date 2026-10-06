/**
 * CAD layers (@/lib/cadLayers, references/code-first-ceiling.md § c).
 *
 * What would go red without it:
 *   • Find all matching searching the architect's background on a file that
 *     draws by layer (92% of Weld 1 E-200's line work);
 *   • a find on a DEMOLITION layer coming back as a new device;
 *   • a file whose layers are declared but unused (UNCC) losing line work —
 *     it must be searched exactly as before.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_ELECTRICAL_SEGMENTS,
  drawnOn,
  electricalView,
  layerIdsFrom,
  layerRole,
} from "./cadLayers";
import { extractVectorGeometry, type VectorGeometry } from "./vectorGeometry";
import { findMatching } from "./findMatching";

describe("what a layer holds, from its name", () => {
  it("knows electrical, demolition and existing, and guesses nothing else", () => {
    expect(layerRole("E-POWR")).toBe("new");
    expect(layerRole("E-LITE")).toBe("new");
    expect(layerRole("E-POWR-D")).toBe("demolition");
    expect(layerRole("E-POWER-DEMO")).toBe("demolition");
    expect(layerRole("E-POWR-E")).toBe("existing");
    expect(layerRole("E-PWR-EXST")).toBe("existing");
    expect(layerRole("Base|E-POWR-D")).toBe("demolition");
    expect(layerRole("E-ANNO-TXT")).toBe("other");
    expect(layerRole("ES")).toBe("other");
    expect(layerRole("A-WALL")).toBe("other");
    expect(layerRole("Weld County|A-BLOCK")).toBe("other");
  });

  it("reads pdf.js's optional-content config as id -> name", () => {
    expect(
      layerIdsFrom([
        ["12R", { name: "E-POWR" }],
        ["13R", { name: "A-WALL" }],
      ] as [string, unknown][])
    ).toEqual(
      new Map([
        ["12R", "E-POWR"],
        ["13R", "A-WALL"],
      ])
    );
  });
});

/** n horizontal segments at y, all on one layer index. */
function on(layer: number, n: number, y: number): [number[], number[]] {
  const segs: number[] = [];
  for (let i = 0; i < n; i++) segs.push(i * 3, y, i * 3 + 2, y);
  return [segs, Array(n).fill(layer)];
}

function geometry(
  parts: [number[], number[]][],
  layerNames?: string[]
): VectorGeometry {
  const segs = parts.flatMap(p => p[0]);
  const layer = parts.flatMap(p => p[1]);
  return {
    segs: Float32Array.from(segs),
    lightness: new Uint8Array(layer.length),
    filled: new Uint8Array(layer.length),
    imageCoverage: 0,
    imagePixelsPerPoint: 0,
    ...(layerNames ? { layer: Int16Array.from(layer), layerNames } : {}),
  };
}

describe("the electrical view", () => {
  it("keeps only the electrical layers when the file draws by layer", () => {
    const geo = geometry(
      [on(0, 200, 10), on(1, 60, 20), on(2, 30, 30)],
      ["A-WALL", "E-POWR", "E-POWR-D"]
    );
    const v = electricalView(geo);
    expect(v.segs.length / 4).toBe(90);
    expect(Array.from(new Set(v.layer))).toEqual([1, 2]);
  });

  it("falls back to everything when layers are missing or barely used (UNCC)", () => {
    const none = geometry([on(0, 200, 10)]);
    expect(electricalView(none)).toBe(none);
    const few = geometry(
      [on(0, 200, 10), on(1, MIN_ELECTRICAL_SEGMENTS - 1, 20)],
      ["A-WALL", "E-POWR"]
    );
    expect(electricalView(few)).toBe(few);
    const untagged = geometry([on(-1, 300, 10)], ["E-POWR"]);
    expect(electricalView(untagged)).toBe(untagged);
  });

  it("says which layer a find is drawn on, by line length", () => {
    const geo = geometry([on(0, 2, 10), on(1, 5, 20)], ["E-POWR", "E-POWR-D"]);
    // 2 segments on E-POWR, 3 on E-POWR-D, all 2 pt long: the longer wins.
    expect(drawnOn(geo, new Set([0, 1, 2, 3, 4]))).toEqual({
      name: "E-POWR-D",
      role: "demolition",
    });
    expect(drawnOn(geometry([on(0, 2, 10)]), new Set([0]))).toBeNull();
  });
});

describe("reading layers from pdf.js's operator list", () => {
  const ops = {
    constructPath: 91,
    stroke: 20,
    beginMarkedContent: 69,
    beginMarkedContentProps: 70,
    endMarkedContent: 71,
  };
  const path = (y: number) => [
    ops.stroke,
    [Float32Array.from([0, 0, y, 1, 50, y])],
    null,
  ];

  it("tags each segment with the innermost layer around it, -1 outside any", () => {
    const geo = extractVectorGeometry(
      [
        ops.constructPath,
        ops.beginMarkedContentProps,
        ops.constructPath,
        ops.beginMarkedContent,
        ops.constructPath,
        ops.endMarkedContent,
        ops.endMarkedContent,
        ops.constructPath,
      ],
      [
        path(1),
        ["OC", { type: "OCG", id: "7R" }],
        path(2),
        ["Span"],
        path(3),
        null,
        null,
        path(4),
      ],
      ops,
      [1, 0, 0, 1, 0, 0],
      100,
      100,
      new Map([["7R", "E-POWR-D"]])
    );
    expect(geo.layerNames).toEqual(["E-POWR-D"]);
    expect(Array.from(geo.layer ?? [])).toEqual([-1, 0, 0, -1]);
  });

  it("reads no layers when not asked, exactly as before", () => {
    const geo = extractVectorGeometry(
      [ops.constructPath],
      [path(1)],
      ops,
      [1, 0, 0, 1, 0, 0],
      100,
      100
    );
    expect(geo.layer).toBeUndefined();
  });
});

describe("Find all matching on a file drawn by layer", () => {
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
  const build = (copies: [number, number, number][], background: number) => {
    const parts: [number[], number[]][] = copies.map(([x, y, l]) => [
      symbol(x, y),
      Array(5).fill(l),
    ]);
    // Enough electrical line work elsewhere for the layers to count as used.
    parts.push(on(0, MIN_ELECTRICAL_SEGMENTS, 900));
    parts.push(on(2, background, 950));
    return geometry(parts, ["E-POWR", "E-POWR-D", "A-WALL"]);
  };
  const box = { x: 90, y: 90, width: 25, height: 20 };

  it("marks a find on a demolition layer as demolition — never a new device", () => {
    const geo = build(
      [
        [100, 100, 0],
        [300, 100, 0],
        [500, 100, 1],
      ],
      100
    );
    const r = findMatching(geo, [], box);
    if (r.kind !== "ok") throw new Error(r.kind);
    const at = (x: number) => r.matches.find(m => Math.abs(m.x - x) < 6)!;
    expect(at(300).onDemolitionPlan).toBeNull();
    expect(at(500).onDemolitionPlan).toBe("CAD layer E-POWR-D");
  });

  it("does not search the background: a symbol drawn on A-WALL is not offered", () => {
    const geo = build([[100, 100, 0]], 100);
    const parts = Array.from(geo.segs);
    parts.push(...symbol(700, 100));
    const layer = [...Array.from(geo.layer ?? []), ...Array(5).fill(2)];
    const withWall: VectorGeometry = {
      ...geo,
      segs: Float32Array.from(parts),
      lightness: new Uint8Array(layer.length),
      filled: new Uint8Array(layer.length),
      layer: Int16Array.from(layer),
    };
    const r = findMatching(withWall, [], box);
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r.matches.some(m => Math.abs(m.x - 702.5) < 6)).toBe(false);
    // The same drawing with no layer information: found, as before.
    const { layer: _l, layerNames: _n, ...plain } = withWall;
    const r2 = findMatching(plain, [], box);
    if (r2.kind !== "ok") throw new Error(r2.kind);
    expect(r2.matches.some(m => Math.abs(m.x - 702.5) < 6)).toBe(true);
  });
});
