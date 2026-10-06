import { describe, expect, it } from "vitest";
import { detectScaleFromText } from "@shared/planScale";
import { checkScale, doorsAt, quarterArcRadii } from "./scaleCheck";

/**
 * Line work as the worker hands it over: x1,y1,x2,y2 per segment. An arc is
 * a run of segments joined end to start, as a flattened path curve is.
 */
function arc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
  pieces = 4
): number[] {
  const out: number[] = [];
  for (let k = 0; k < pieces; k++) {
    const a = ((startDeg + (sweepDeg * k) / pieces) * Math.PI) / 180;
    const b = ((startDeg + (sweepDeg * (k + 1)) / pieces) * Math.PI) / 180;
    out.push(
      cx + r * Math.cos(a),
      cy + r * Math.sin(a),
      cx + r * Math.cos(b),
      cy + r * Math.sin(b)
    );
  }
  return out;
}

/** `n` quarter-circle swings of radius `r` points, spread over a sheet. */
function radii(n: number, r: number): number[] {
  return Array.from({ length: n }, () => r);
}

const title = (text: string) => detectScaleFromText(text).candidates;
const EIGHTH = 96; // 1/8" = 1'-0"
const QUARTER = 48; // 1/4" = 1'-0"

describe("quarterArcRadii", () => {
  it("reads a door swing's radius off joined segments", () => {
    const segs = new Float32Array([
      ...arc(100, 100, 27, 0, 90),
      // A gap, then a second swing the other way round.
      ...arc(300, 200, 27, 180, -90),
    ]);
    const got = quarterArcRadii(segs);
    expect(got).toHaveLength(2);
    for (const r of got) expect(r).toBeCloseTo(27, 1);
  });

  it("ignores a straight run, a half circle and a tiny arc", () => {
    const segs = new Float32Array([
      0,
      0,
      10,
      0,
      10,
      0,
      20,
      0,
      20,
      0,
      30,
      0,
      30,
      0,
      40,
      0,
      ...arc(200, 200, 27, 0, 180, 8),
      ...arc(400, 400, 3, 0, 90),
    ]);
    expect(quarterArcRadii(segs)).toEqual([]);
  });

  it("27 pt reads 36 in. at 1/8 and 18 in. at 1/4", () => {
    expect(doorsAt([27], EIGHTH)).toBe(1);
    expect(doorsAt([27], QUARTER)).toBe(0);
  });
});

describe("checkScale", () => {
  // Weld 1 E-200's shape: about a hundred 27 pt swings, true at 1/8".
  const weld = radii(100, 27);

  it("agrees when the set scale is the title's and the doors read right", () => {
    expect(
      checkScale({
        ratio: EIGHTH,
        text: `1/8" = 1'-0"`,
        arcRadii: weld,
        titleScales: title(`SCALE: 1/8" = 1'-0"`),
      })
    ).toEqual({ kind: "agrees" });
  });

  it("set to 1/4 on a 1/8 sheet: amber, names the title, offers 1/8", () => {
    const doubt = checkScale({
      ratio: QUARTER,
      text: `1/4" = 1'-0"`,
      arcRadii: weld,
      titleScales: title(`SCALE: 1/8" = 1'-0"`),
    });
    expect(doubt.kind).toBe("mayBeWrong");
    if (doubt.kind !== "mayBeWrong") return;
    expect(doubt.suggest.ratio).toBe(EIGHTH);
    expect(doubt.message).toContain(`Scale may be wrong: set to 1/4"`);
    expect(doubt.message).toContain(`the title says 1/8"`);
    expect(doubt.message).toContain(`read 18" wide`);
  });

  it("the doors alone argue when the sheet states no scale", () => {
    const doubt = checkScale({
      ratio: QUARTER,
      text: `1/4" = 1'-0"`,
      arcRadii: weld,
      titleScales: [],
    });
    expect(doubt.kind).toBe("mayBeWrong");
    if (doubt.kind === "mayBeWrong") expect(doubt.suggest.ratio).toBe(EIGHTH);
  });

  /*
    UNCC E111's shape: 9 real doors at 1/4" (54 pt) and 30 casework arcs that
    happen to read as doors at 1/8". The title is the tie-breaker: with it the
    true scale is left alone; without it the casework would outvote.
  */
  const uncc = [...radii(9, 54), ...radii(30, 27)];
  it("a title that agrees with real doors is not argued with by casework", () => {
    expect(
      checkScale({
        ratio: QUARTER,
        text: `1/4" = 1'-0"`,
        arcRadii: uncc,
        titleScales: title(`SCALE: 1/4" = 1'-0"`),
      })
    ).toEqual({ kind: "agrees" });
    expect(
      checkScale({
        ratio: QUARTER,
        text: `1/4" = 1'-0"`,
        arcRadii: uncc,
        titleScales: [],
      }).kind
    ).toBe("mayBeWrong");
  });

  it("the title argues when doors read a normal width at both", () => {
    // 24 pt: 40" at 1" = 10', 32" at 1/8". Set to the first, titled the second.
    const doubt = checkScale({
      ratio: 120,
      text: `1" = 10'`,
      arcRadii: radii(12, 24),
      titleScales: title(`SCALE: 1/8" = 1'-0"`),
    });
    expect(doubt.kind).toBe("mayBeWrong");
    if (doubt.kind !== "mayBeWrong") return;
    expect(doubt.suggest.ratio).toBe(EIGHTH);
    expect(doubt.message).toContain(`but the title says 1/8"`);
  });

  it("a scan says plainly it cannot check", () => {
    const doubt = checkScale({
      ratio: EIGHTH,
      text: `1/8" = 1'-0"`,
      arcRadii: null,
      titleScales: [],
    });
    expect(doubt.kind).toBe("cannotCheck");
    if (doubt.kind === "cannotCheck")
      expect(doubt.message).toMatch(/scan.*cannot be checked/);
  });

  it("no scale set, nothing to check", () => {
    expect(
      checkScale({
        ratio: null,
        text: null,
        arcRadii: weld,
        titleScales: [],
      })
    ).toEqual({ kind: "agrees" });
  });
});
