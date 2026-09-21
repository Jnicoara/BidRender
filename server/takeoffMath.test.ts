/**
 * The measuring math. Pure functions, no database, no DOM.
 *
 * ── Why this suite is larger than it looks like it needs to be ───────────────
 * Every number these functions produce becomes conduit and wire on a real bid,
 * and a systematic error here is invisible on screen: a run measured 15% long
 * looks exactly like one measured correctly. There is no user who will notice.
 * So the arithmetic is checked against hand-computed values at known scales,
 * from both ends of the plausible range, and the refusal paths are checked as
 * carefully as the success paths — because "returns 0" and "returns null" are
 * the difference between a bid that is wrong and a bid that says it cannot
 * answer yet.
 *
 * Worked reference used throughout:
 *   At 1/4" = 1'-0" (ratio 48), one inch of paper is 4 feet of building.
 *   One inch of paper is 72 page points.
 *   So 72 points → 48 real inches → 4 feet. Everything below is that, scaled.
 */
import { describe, it, expect } from "vitest";
import {
  POINTS_PER_INCH,
  formatFeetInches,
  inchesToFeet,
  isUsableScaleRatio,
  pathLengthInPoints,
  pathRealInches,
  pointsToRealInches,
  screenToPagePoints,
  segmentLength,
  toBillableFeet,
  type PagePoint,
} from "../shared/takeoffGeometry";
import {
  NO_VERTICALS,
  circuitWire,
  cableFeet,
  conduitFeet,
  measurabilityOf,
  quantitiesForRun,
  runFeet,
  totalQuantities,
  wireFeetByCircuit,
} from "../shared/takeoffQuantities";

/** Scale ratios by their drawing notation, for readable tests. */
const QUARTER_INCH = 48; // 1/4" = 1'-0"
const EIGHTH_INCH = 96; // 1/8" = 1'-0"
const HALF_INCH = 24; // 1/2" = 1'-0"
const ENG_20 = 240; // 1"  = 20'
const ENG_100 = 1200; // 1"  = 100'

const p = (x: number, y: number): PagePoint => ({ x, y });

// ── The unit chain ───────────────────────────────────────────────────────────

describe("units", () => {
  it("uses the PDF specification's 72 points per inch", () => {
    expect(POINTS_PER_INCH).toBe(72);
  });

  it("converts a rendered click back to page points", () => {
    // The viewer rasterises at 1.5, so 150 device pixels is 100 page points.
    expect(screenToPagePoints({ x: 150, y: 300 }, 1.5)).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("makes a measurement independent of zoom", () => {
    // The same physical line traced at two zoom levels must measure the same.
    // If this fails, footage depends on how far the user happened to be zoomed
    // in, which nothing on screen would reveal.
    const atOne = screenToPagePoints({ x: 720, y: 0 }, 1)!;
    const atThree = screenToPagePoints({ x: 2160, y: 0 }, 3)!;
    expect(atOne).toEqual(atThree);
  });

  it("refuses a nonsense render scale rather than dividing by it", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(screenToPagePoints({ x: 10, y: 10 }, bad)).toBeNull();
    }
  });
});

// ── Path length ──────────────────────────────────────────────────────────────

describe("path length in page points", () => {
  it("measures a single horizontal segment", () => {
    expect(pathLengthInPoints([p(0, 0), p(72, 0)])).toBe(72);
  });

  it("measures a single vertical segment", () => {
    expect(pathLengthInPoints([p(10, 10), p(10, 82)])).toBe(72);
  });

  it("measures a diagonal by Pythagoras", () => {
    // 3-4-5 triangle: the classic, so the expected value needs no arithmetic.
    expect(pathLengthInPoints([p(0, 0), p(30, 40)])).toBe(50);
  });

  it("sums a multi-segment path", () => {
    // An L: 100 across, then 50 down.
    expect(pathLengthInPoints([p(0, 0), p(100, 0), p(100, 50)])).toBe(150);
  });

  it("sums a long many-segment path", () => {
    // A staircase of 20 segments of 10 each — the shape a real conduit route
    // traced around obstructions actually takes.
    const points: PagePoint[] = [p(0, 0)];
    for (let i = 1; i <= 20; i++) {
      points.push(
        i % 2 === 1
          ? p(points[i - 1].x + 10, points[i - 1].y)
          : p(points[i - 1].x, points[i - 1].y + 10)
      );
    }
    expect(pathLengthInPoints(points)).toBe(200);
  });

  it("counts a doubled-back path at its full travelled length", () => {
    // Out 100 and back 100 is 200 of pipe, not 0. Straight-line distance
    // between the endpoints would be zero and would be catastrophically wrong.
    expect(pathLengthInPoints([p(0, 0), p(100, 0), p(0, 0)])).toBe(200);
  });

  it("is zero for a path with nothing drawn yet", () => {
    expect(pathLengthInPoints([])).toBe(0);
    expect(pathLengthInPoints([p(5, 5)])).toBe(0);
  });

  it("is zero for a path whose points coincide", () => {
    expect(pathLengthInPoints([p(5, 5), p(5, 5)])).toBe(0);
  });

  it("refuses a path containing an unusable point rather than skipping it", () => {
    // Skipping would silently shorten the run, and nothing would say so.
    expect(pathLengthInPoints([p(0, 0), p(Number.NaN, 10)])).toBeNull();
    expect(
      pathLengthInPoints([p(0, 0), p(10, Number.POSITIVE_INFINITY)])
    ).toBeNull();
  });

  it("agrees with segmentLength on a two-point path", () => {
    expect(pathLengthInPoints([p(1, 2), p(4, 6)])).toBe(
      segmentLength(p(1, 2), p(4, 6))
    );
  });
});

// ── Scale conversion ─────────────────────────────────────────────────────────

describe("converting paper to real world", () => {
  it("turns one paper inch into the scale's real distance", () => {
    // 72 points = 1 paper inch. At 1/4" = 1'-0", that is 48 real inches.
    expect(pointsToRealInches(72, QUARTER_INCH)).toBe(48);
  });

  it("scales linearly with distance", () => {
    expect(pointsToRealInches(144, QUARTER_INCH)).toBe(96);
    expect(pointsToRealInches(36, QUARTER_INCH)).toBe(24);
  });

  it("gives half the length at twice the scale denominator", () => {
    // 1/8" = 1'-0" fits twice as much building on the same paper, so the same
    // traced line is twice as long in the real world.
    expect(pointsToRealInches(72, EIGHTH_INCH)).toBe(96);
    expect(pointsToRealInches(72, HALF_INCH)).toBe(24);
  });

  it("handles engineering scales", () => {
    expect(pointsToRealInches(72, ENG_20)).toBe(240); // 1" = 20' → 20 feet
    expect(pointsToRealInches(72, ENG_100)).toBe(1200); // 1" = 100' → 100 feet
  });

  it("returns null for every unusable ratio, never zero", () => {
    // Zero would flow into a total as a considered measurement of nothing.
    for (const bad of [
      null,
      undefined,
      0,
      -48,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(pointsToRealInches(72, bad as number)).toBeNull();
    }
  });

  it("refuses a negative paper length", () => {
    expect(pointsToRealInches(-72, QUARTER_INCH)).toBeNull();
  });

  it("recognises which ratios are usable", () => {
    expect(isUsableScaleRatio(48)).toBe(true);
    expect(isUsableScaleRatio(0.5)).toBe(true);
    for (const bad of [null, undefined, 0, -1, Number.NaN]) {
      expect(isUsableScaleRatio(bad as number)).toBe(false);
    }
  });
});

// ── End to end ───────────────────────────────────────────────────────────────

describe("traced path to real length", () => {
  it("measures a short run", () => {
    // 18 points = quarter of a paper inch = 1 foot at 1/4" = 1'-0".
    const inches = pathRealInches([p(0, 0), p(18, 0)], QUARTER_INCH);
    expect(inches).toBe(12);
    expect(toBillableFeet(inches!)).toBe(1);
  });

  it("measures a very short run without collapsing it to zero", () => {
    // A one-point stub — a few inches of pipe. Must not round away.
    const inches = pathRealInches([p(0, 0), p(1.5, 0)], QUARTER_INCH);
    expect(inches).toBeCloseTo(1, 6);
    expect(inches).toBeGreaterThan(0);
  });

  it("measures a very long run", () => {
    // 30 paper inches at 1" = 100' — a site plan feeder, 3000 feet.
    const inches = pathRealInches([p(0, 0), p(30 * 72, 0)], ENG_100);
    expect(toBillableFeet(inches!)).toBe(3000);
  });

  it("measures a realistic multi-segment conduit route", () => {
    // Across 4 paper inches, down 2, across 3 — at 1/4" = 1'-0".
    // 9 paper inches × 4 feet per paper inch = 36 feet.
    const route = [p(0, 0), p(288, 0), p(288, 144), p(504, 144)];
    expect(toBillableFeet(pathRealInches(route, QUARTER_INCH)!)).toBe(36);
  });

  it("gives the same answer regardless of where the path sits on the page", () => {
    const atOrigin = pathRealInches([p(0, 0), p(100, 0)], QUARTER_INCH);
    const offset = pathRealInches([p(500, 300), p(600, 300)], QUARTER_INCH);
    expect(offset).toBe(atOrigin);
  });

  it("returns null when the scale is missing, for any path", () => {
    expect(pathRealInches([p(0, 0), p(100, 100)], null)).toBeNull();
    expect(pathRealInches([p(0, 0), p(100, 100)], undefined)).toBeNull();
  });

  it("returns null when the path is unusable, for any scale", () => {
    expect(
      pathRealInches([p(0, 0), p(Number.NaN, 0)], QUARTER_INCH)
    ).toBeNull();
  });

  it("is zero — not null — for a path not yet drawn on a scaled sheet", () => {
    // Nothing measured yet is a normal state and is distinct from "cannot
    // measure": one resolves by clicking, the other by setting a scale.
    expect(pathRealInches([p(1, 1)], QUARTER_INCH)).toBe(0);
  });
});

describe("presenting a measurement", () => {
  it("reads as feet and inches", () => {
    expect(formatFeetInches(0)).toBe(`0'-0"`);
    expect(formatFeetInches(12)).toBe(`1'-0"`);
    expect(formatFeetInches(18)).toBe(`1'-6"`);
    expect(formatFeetInches(1711)).toBe(`142'-7"`);
  });

  it("rounds to the nearest inch rather than implying false precision", () => {
    expect(formatFeetInches(12.4)).toBe(`1'-0"`);
    expect(formatFeetInches(12.6)).toBe(`1'-1"`);
  });

  it("converts to decimal feet for pricing", () => {
    expect(inchesToFeet(12)).toBe(1);
    expect(toBillableFeet(18)).toBe(1.5);
    expect(toBillableFeet(1711)).toBe(142.58);
  });

  it("does not round footage up to a whole foot", () => {
    // Waste and rounding are a pricing decision. Baking them in here would
    // make the same run price differently depending on where it was rounded.
    expect(toBillableFeet(13)).toBe(1.08);
  });
});

// ── The scale gate ───────────────────────────────────────────────────────────

describe("blocking measurement when the scale is not trustworthy", () => {
  it("allows a sheet with a scale set", () => {
    const result = measurabilityOf({
      scaleRatio: 48,
      scaleSource: "manual",
      notToScale: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ratio).toBe(48);
  });

  it("allows a detected scale on an ordinary sheet", () => {
    expect(
      measurabilityOf({
        scaleRatio: 96,
        scaleSource: "detected",
        notToScale: false,
      }).ok
    ).toBe(true);
  });

  it("blocks a sheet with no scale at all", () => {
    const result = measurabilityOf({
      scaleRatio: null,
      scaleSource: "none",
      notToScale: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-scale");
      expect(result.message).toMatch(/set/i);
    }
  });

  it("blocks a NOT-TO-SCALE sheet even when a scale was detected on it", () => {
    // The drawing is saying its geometry is not trustworthy. A number read off
    // it is not evidence — only a person can decide to measure anyway.
    const result = measurabilityOf({
      scaleRatio: 48,
      scaleSource: "detected",
      notToScale: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-to-scale");
  });

  it("blocks a NOT-TO-SCALE sheet with no scale", () => {
    const result = measurabilityOf({
      scaleRatio: null,
      scaleSource: "none",
      notToScale: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-to-scale");
  });

  it("allows a NOT-TO-SCALE sheet ONLY once a human overrides it by hand", () => {
    const result = measurabilityOf({
      scaleRatio: 48,
      scaleSource: "manual",
      notToScale: true,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a sheet whose stored ratio is unusable, whatever the source says", () => {
    // A corrupt or zero ratio must not measure just because someone set it by
    // hand — "manual" says who chose it, not that it is arithmetically sound.
    for (const scaleRatio of [0, -48, Number.NaN]) {
      const result = measurabilityOf({
        scaleRatio,
        scaleSource: "manual",
        notToScale: false,
      });
      expect(result.ok, `ratio ${scaleRatio} should block`).toBe(false);
      if (!result.ok) expect(result.reason).toBe("no-scale");
    }
  });

  it("explains itself differently for the two blocks", () => {
    const noScale = measurabilityOf({
      scaleRatio: null,
      scaleSource: "none",
      notToScale: false,
    });
    const nts = measurabilityOf({
      scaleRatio: null,
      scaleSource: "none",
      notToScale: true,
    });
    if (noScale.ok || nts.ok) throw new Error("expected both to block");
    expect(noScale.message).not.toBe(nts.message);
    expect(nts.message).toMatch(/not to scale/i);
  });
});

// ── Conduit vs wire ──────────────────────────────────────────────────────────

const RUN_100FT = {
  pathType: "conduit" as const,
  // 25 paper inches at 1/4" = 1'-0" → 100 feet.
  points: [p(0, 0), p(25 * 72, 0)],
};

describe("conduit footage is counted once", () => {
  it("equals the traced length", () => {
    expect(conduitFeet(RUN_100FT, QUARTER_INCH)).toBe(100);
  });

  it("does not change with the number of circuits", () => {
    // The safeguard is structural — conduitFeet takes no circuits argument at
    // all, so there is nothing to multiply by. This pins that it stays so.
    expect(conduitFeet(RUN_100FT, QUARTER_INCH)).toBe(100);
    expect(conduitFeet.length).toBe(2);
  });

  it("refuses a cable run rather than returning zero", () => {
    // Zero would reach a bid as a considered "no pipe needed" line.
    expect(
      conduitFeet({ pathType: "cable", points: RUN_100FT.points }, QUARTER_INCH)
    ).toBeNull();
  });

  it("returns null with no scale", () => {
    expect(conduitFeet(RUN_100FT, null)).toBeNull();
  });
});

describe("wire footage is counted per circuit, per conductor", () => {
  it("gives one circuit its conductors' worth", () => {
    const result = wireFeetByCircuit(
      RUN_100FT,
      [{ name: "Ckt 1", conductorCount: 3, groundCount: 0 }],
      QUARTER_INCH
    );
    expect(result!.perCircuit[0].feet).toBe(300);
    expect(result!.totalFeet).toBe(300);
  });

  it("gives THREE circuits of 3 conductors 900 feet, not 100 and not 300", () => {
    // The headline case from the brief. Undercounting here is money the
    // contractor spends and never quoted for.
    const circuits = [
      { name: "Ckt 1", conductorCount: 3, groundCount: 0 },
      { name: "Ckt 2", conductorCount: 3, groundCount: 0 },
      { name: "Ckt 3", conductorCount: 3, groundCount: 0 },
    ];
    const result = wireFeetByCircuit(RUN_100FT, circuits, QUARTER_INCH);
    expect(result!.totalFeet).toBe(900);
    expect(result!.perCircuit.map(c => c.feet)).toEqual([300, 300, 300]);
  });

  it("handles circuits with different conductor counts on one run", () => {
    const circuits = [
      { name: "Lighting", conductorCount: 2, groundCount: 0 },
      { name: "Recep", conductorCount: 3, groundCount: 0 },
      { name: "3-phase", conductorCount: 4, groundCount: 0 },
    ];
    const result = wireFeetByCircuit(RUN_100FT, circuits, QUARTER_INCH);
    expect(result!.perCircuit.map(c => c.feet)).toEqual([200, 300, 400]);
    expect(result!.totalFeet).toBe(900);
  });

  it("is zero-total with no circuits assigned yet — but not null", () => {
    // No circuits is a real state (the run is traced, nothing pulled yet) and
    // is different from "cannot measure".
    const result = wireFeetByCircuit(RUN_100FT, [], QUARTER_INCH);
    expect(result).not.toBeNull();
    expect(result!.totalFeet).toBe(0);
  });

  it("ignores a nonsense conductor count instead of producing NaN", () => {
    const circuits = [
      { name: "Good", conductorCount: 3, groundCount: 0 },
      { name: "Bad", conductorCount: Number.NaN, groundCount: 0 },
      { name: "Negative", conductorCount: -2, groundCount: 0 },
      { name: "Zero", conductorCount: 0, groundCount: 0 },
    ];
    const result = wireFeetByCircuit(RUN_100FT, circuits, QUARTER_INCH);
    expect(result!.totalFeet).toBe(300);
    expect(Number.isNaN(result!.totalFeet)).toBe(false);
  });

  it("refuses a cable run — a cable has no separate pulled wire", () => {
    expect(
      wireFeetByCircuit(
        { pathType: "cable", points: RUN_100FT.points },
        [{ name: "x", conductorCount: 2, groundCount: 0 }],
        QUARTER_INCH
      )
    ).toBeNull();
  });

  it("returns null with no scale", () => {
    expect(
      wireFeetByCircuit(
        RUN_100FT,
        [{ name: "Ckt 1", conductorCount: 3, groundCount: 0 }],
        null
      )
    ).toBeNull();
  });
});

describe("cable runs", () => {
  const CABLE_100FT = { pathType: "cable" as const, points: RUN_100FT.points };

  it("count the traced length as cable, once", () => {
    expect(cableFeet(CABLE_100FT, QUARTER_INCH)).toBe(100);
  });

  it("produce no conduit line at all", () => {
    const quantities = quantitiesForRun(
      CABLE_100FT,
      [],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.conduitFeet).toBeNull();
    expect(quantities.cableFeet).toBe(100);
  });

  it("produce no separate wire footage", () => {
    const quantities = quantitiesForRun(
      CABLE_100FT,
      [{ name: "Ckt 1", conductorCount: 3, groundCount: 0 }],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.totalWireFeet).toBe(0);
    expect(quantities.wireByCircuit).toEqual([]);
  });

  it("refuse to be measured as conduit", () => {
    expect(conduitFeet(CABLE_100FT, QUARTER_INCH)).toBeNull();
  });
});

// ── Shared runs ──────────────────────────────────────────────────────────────

describe("a shared run across a whole takeoff", () => {
  it("counts the pipe once and the wire per circuit", () => {
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits: [
          { name: "Ckt 1", conductorCount: 3, groundCount: 0 },
          { name: "Ckt 2", conductorCount: 3, groundCount: 0 },
        ],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.conduitFeet).toBe(100);
    expect(totals.wireFeet).toBe(600);
  });

  it("keeps two separate runs separate", () => {
    const shortRun = {
      pathType: "conduit" as const,
      points: [p(0, 0), p(12.5 * 72, 0)],
    }; // 50ft
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits: [{ name: "A", conductorCount: 2, groundCount: 0 }],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: shortRun,
        circuits: [{ name: "B", conductorCount: 3, groundCount: 0 }],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.conduitFeet).toBe(150);
    expect(totals.wireFeet).toBe(200 + 150);
  });

  it("keeps conduit and cable in separate totals", () => {
    const cableRun = { pathType: "cable" as const, points: RUN_100FT.points };
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits: [{ name: "A", conductorCount: 3, groundCount: 0 }],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: cableRun,
        circuits: [],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.conduitFeet).toBe(100);
    expect(totals.cableFeet).toBe(100);
    expect(totals.wireFeet).toBe(300);
  });

  it("reports unmeasurable runs rather than counting them as zero", () => {
    // A total that silently drops a run reads as complete when it is not.
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits: [{ name: "A", conductorCount: 2, groundCount: 0 }],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: RUN_100FT,
        circuits: [{ name: "B", conductorCount: 2, groundCount: 0 }],
        ratio: null,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.conduitFeet).toBe(100);
    expect(totals.wireFeet).toBe(200);
    expect(totals.unmeasurableCount).toBe(1);
  });

  it("totals nothing, and flags nothing, for an empty takeoff", () => {
    expect(totalQuantities([])).toEqual({
      conduitFeet: 0,
      cableFeet: 0,
      wireFeet: 0,
      wireGroundFeet: 0,
      conduitVerticalFeet: 0,
      cableVerticalFeet: 0,
      wireVerticalFeet: 0,
      unmeasurableCount: 0,
      flatOnlyCount: 0,
      partialVerticalCount: 0,
    });
  });

  it("handles runs traced on sheets at DIFFERENT scales", () => {
    // A site plan at 1" = 100' and a floor plan at 1/4" = 1'-0" in one bid.
    // The same traced geometry means very different footages, and each run
    // must use its own sheet's ratio.
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits: [],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: { ...RUN_100FT },
        circuits: [],
        ratio: ENG_100,
        verticals: NO_VERTICALS,
      },
    ]);
    // 25 paper inches: 100ft at quarter-inch, 2500ft at 1"=100'.
    expect(totals.conduitFeet).toBe(2600);
  });
});

describe("the full breakdown for one run", () => {
  it("returns null when the run cannot be measured", () => {
    // Not a partial answer a caller could show as a total.
    expect(
      quantitiesForRun(
        RUN_100FT,
        [{ name: "A", conductorCount: 3, groundCount: 0 }],
        null,
        NO_VERTICALS
      )
    ).toBeNull();
  });

  it("reports conduit and wire as distinct numbers", () => {
    const quantities = quantitiesForRun(
      RUN_100FT,
      [
        { name: "A", conductorCount: 3, groundCount: 0 },
        { name: "B", conductorCount: 3, groundCount: 0 },
      ],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.runFeet).toBe(100);
    expect(quantities.conduitFeet).toBe(100);
    expect(quantities.totalWireFeet).toBe(600);
    // The two must never be the same number by construction.
    expect(quantities.conduitFeet).not.toBe(quantities.totalWireFeet);
  });

  it("names each circuit in the breakdown, and splits the ground out of it", () => {
    // 3 #12 and a ground, which is what "conductorCount: 4" used to mean and, groundCount: 0
    // what this now says out loud.
    const quantities = quantitiesForRun(
      RUN_100FT,
      [{ name: "Panel A-12", conductorCount: 3, groundCount: 1 }],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.wireByCircuit[0]).toEqual({
      name: "Panel A-12",
      conductorCount: 3,
      groundCount: 1,
      // The two purchases, apart: 300 ft of THHN and 100 ft of bare copper.
      insulatedFeet: 300,
      groundFeet: 100,
      // Flat and vertical stay apart all the way to the bid — see § 7.1, which
      // gives the two allowances different reach over them. No verticals were
      // supplied here, so the traced length is the whole of it. And 400 is the
      // number this produced before the split, which is the point.
      flatFeet: 400,
      verticalFeet: 0,
      feet: 400,
    });
  });
});

// ── A worked example, end to end ─────────────────────────────────────────────

describe("a realistic takeoff, checked by hand", () => {
  it("produces the numbers an estimator would arrive at with a scale rule", () => {
    // Sheet at 1/8" = 1'-0" (ratio 96), so one paper inch is 8 feet.
    //
    // Feeder:  traced 10 paper inches  → 80 ft of 2" EMT
    //          3 circuits × 4 conductors → 12 × 80 = 960 ft of wire
    // Branch:  traced 5 paper inches   → 40 ft of MC cable, no conduit
    const feeder = {
      pathType: "conduit" as const,
      points: [p(0, 0), p(10 * 72, 0)],
    };
    const branch = {
      pathType: "cable" as const,
      points: [p(0, 0), p(5 * 72, 0)],
    };

    const feederQuantities = quantitiesForRun(
      feeder,
      [
        { name: "Ckt 1", conductorCount: 4, groundCount: 0 },
        { name: "Ckt 2", conductorCount: 4, groundCount: 0 },
        { name: "Ckt 3", conductorCount: 4, groundCount: 0 },
      ],
      EIGHTH_INCH,
      NO_VERTICALS
    )!;

    expect(feederQuantities.conduitFeet).toBe(80);
    expect(feederQuantities.totalWireFeet).toBe(960);

    const branchQuantities = quantitiesForRun(
      branch,
      [],
      EIGHTH_INCH,
      NO_VERTICALS
    )!;
    expect(branchQuantities.cableFeet).toBe(40);
    expect(branchQuantities.conduitFeet).toBeNull();

    const totals = totalQuantities([
      {
        run: feeder,
        circuits: [
          { name: "Ckt 1", conductorCount: 4, groundCount: 0 },
          { name: "Ckt 2", conductorCount: 4, groundCount: 0 },
          { name: "Ckt 3", conductorCount: 4, groundCount: 0 },
        ],
        ratio: EIGHTH_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: branch,
        circuits: [],
        ratio: EIGHTH_INCH,
        verticals: NO_VERTICALS,
      },
    ]);

    expect(totals).toEqual({
      conduitFeet: 80,
      cableFeet: 40,
      wireFeet: 960,
      // Every circuit in this hand-checked example predates the ground split
      // and states no ground, so none of the 960 ft is bare — and the 960 is
      // the number it has always been.
      wireGroundFeet: 0,
      // No heights set anywhere, so this hand-checked takeoff comes to exactly
      // what it came to before verticals existed. Both runs are flat-only, and
      // the panel says so rather than leaving a low total to be noticed.
      conduitVerticalFeet: 0,
      cableVerticalFeet: 0,
      wireVerticalFeet: 0,
      flatOnlyCount: 2,
      // Neither run has ONE end answered — they have none — so nothing is
      // half-counted. This is the pair that must not be confused: flat-only
      // and partial are different faults with different fixes.
      partialVerticalCount: 0,
      unmeasurableCount: 0,
    });
  });

  it("gives runFeet consistently whichever function asks for it", () => {
    expect(runFeet(RUN_100FT, QUARTER_INCH)).toBe(
      conduitFeet(RUN_100FT, QUARTER_INCH)
    );
  });
});

// ── The ground, split out ────────────────────────────────────────────────────

describe("counting the ground separately", () => {
  /**
   * ── What these are defending ───────────────────────────────────────────────
   * One property, and the whole migration rests on it: **a circuit written as
   * 2 + 1 comes to exactly what one written as 3 came to.** If that is not
   * true, the backfill that turns every stored 3 into 2 + 1 changes the wire on
   * every run of every bid — silently, in the direction nobody queries.
   *
   * The estimator asked for these first, before any of the code, for that
   * reason: they are the check on the migration rather than on the maths.
   */
  const PAIRS: {
    what: string;
    before: { name: string; conductorCount: number; groundCount: 0 };
    after: { name: string; conductorCount: number; groundCount: number };
  }[] = [
    {
      what: "2 #12 and a ground",
      before: { name: "Ckt 1", conductorCount: 3, groundCount: 0 },
      after: { name: "Ckt 1", conductorCount: 2, groundCount: 1 },
    },
    {
      what: "3 #12 and a ground",
      before: { name: "Ckt 1", conductorCount: 4, groundCount: 0 },
      after: { name: "Ckt 1", conductorCount: 3, groundCount: 1 },
    },
    {
      what: "an isolated-ground circuit, two grounds",
      before: { name: "IG", conductorCount: 4, groundCount: 0 },
      after: { name: "IG", conductorCount: 2, groundCount: 2 },
    },
  ];

  for (const pair of PAIRS) {
    it(`${pair.what} pulls the same wire either way`, () => {
      const before = quantitiesForRun(
        RUN_100FT,
        [pair.before],
        QUARTER_INCH,
        NO_VERTICALS
      )!;
      const after = quantitiesForRun(
        RUN_100FT,
        [pair.after],
        QUARTER_INCH,
        NO_VERTICALS
      )!;
      expect(after.totalWireFeet).toBe(before.totalWireFeet);
      expect(after.wireByCircuit[0].feet).toBe(before.wireByCircuit[0].feet);
      expect(after.conduitFeet).toBe(before.conduitFeet);
    });
  }

  it("splits the footage without changing it", () => {
    const [circuit] = quantitiesForRun(
      RUN_100FT,
      [{ name: "Ckt 1", conductorCount: 2, groundCount: 1 }],
      QUARTER_INCH,
      NO_VERTICALS
    )!.wireByCircuit;
    expect(circuit.insulatedFeet).toBe(200);
    expect(circuit.groundFeet).toBe(100);
    expect(circuit.insulatedFeet + circuit.groundFeet).toBe(circuit.flatFeet);
    expect(circuit.flatFeet).toBe(300);
  });

  it("reads a row the backfill has not reached as it always read", () => {
    /*
      The boundary this property lives on MOVED, and this test moved with it.

      It used to omit `groundCount` from the fixture, because the field was
      optional and "undefined is zero" was the guarantee. Making the field
      REQUIRED closed the hole that had let three routers drop it — and took
      the old test with it, since the state it described can no longer be
      constructed.

      So the guarantee is asserted where it now lives: `circuitWire`, the one
      function that turns a stored row into the shape the arithmetic takes. A
      stored NULL is a circuit 0063 has not split, which still has its ground
      inside `conductorCount`, and it must come to exactly what it came to
      before the column existed.
    */
    const unsplit = circuitWire({
      name: "Ckt 1",
      conductorCount: 3,
      groundCount: null,
    });
    expect(unsplit.groundCount).toBe(0);

    const quantities = quantitiesForRun(
      RUN_100FT,
      [unsplit],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.totalWireFeet).toBe(300);
    expect(quantities.wireByCircuit[0].groundFeet).toBe(0);
  });

  it("never guesses a ground onto an un-split row", () => {
    // One, not zero, would add a conductor's worth of wire to every run in the
    // app on the day the column shipped. The migration moves 3 into 2 + 1;
    // this mapper must never do it by inference.
    expect(
      circuitWire({ name: "x", conductorCount: 2, groundCount: null })
        .groundCount
    ).toBe(0);
  });

  it("counts a ground down a drop, once per ground", () => {
    // A vertical adds to conduit ONCE and to wire once per conductor — and a
    // ground is a conductor for that purpose, because it goes down the pipe
    // with the rest of them.
    const flat = quantitiesForRun(
      RUN_100FT,
      [{ name: "Ckt 1", conductorCount: 2, groundCount: 1 }],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    const dropped = quantitiesForRun(
      RUN_100FT,
      [{ name: "Ckt 1", conductorCount: 2, groundCount: 1 }],
      QUARTER_INCH,
      {
        start: {
          counted: true,
          kind: "receptacle",
          direction: "drop",
          distributionInches: 120,
          endInches: 0,
          feet: 10,
        },
        end: { counted: false, kind: null, reason: "height-not-set" },
        feet: 10,
      }
    )!;
    // Three conductors down a 10 ft drop is 30 ft of wire, ground included.
    expect(dropped.totalWireFeet - flat.totalWireFeet).toBe(30);
  });

  it("refuses to count a ground that is not a number", () => {
    const quantities = quantitiesForRun(
      RUN_100FT,
      [
        { name: "Bad", conductorCount: 2, groundCount: Number.NaN },
        { name: "Negative", conductorCount: 2, groundCount: -1 },
      ],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    // One bad row must not poison a total — the same rule the conductor count
    // already follows.
    expect(quantities.totalWireFeet).toBe(400);
  });
});

describe("the two purchases a conduit run makes", () => {
  /**
   * ── What this defends ──────────────────────────────────────────────────────
   * Bare copper cannot be ordered as THHN. A single wire figure answers "how
   * much" and cannot answer "how much of WHICH", which is the entire reason the
   * ground got its own column — and the reason the run panel shows the bare
   * share on its own line.
   */
  it("reports the bare share separately from the total", () => {
    const quantities = quantitiesForRun(
      RUN_100FT,
      [
        { name: "Ckt 1", conductorCount: 2, groundCount: 1 },
        { name: "Ckt 2", conductorCount: 3, groundCount: 1 },
      ],
      QUARTER_INCH,
      NO_VERTICALS
    )!;

    const insulated = quantities.wireByCircuit.reduce(
      (sum, c) => sum + c.insulatedFeet,
      0
    );
    const bare = quantities.wireByCircuit.reduce(
      (sum, c) => sum + c.groundFeet,
      0
    );

    expect(insulated).toBe(500); // (2 + 3) conductors x 100 ft
    expect(bare).toBe(200); //     (1 + 1) grounds    x 100 ft
    // And the two still come to what the run has always reported.
    expect(insulated + bare).toBe(quantities.totalWireFeet);
    expect(quantities.totalWireFeet).toBe(700);
  });

  it("reports no bare share when no circuit carries a ground", () => {
    // The panel hides the line entirely in this case: "0.00 ft" of bare copper
    // is noise standing where a number goes.
    const quantities = quantitiesForRun(
      RUN_100FT,
      [{ name: "Ckt 1", conductorCount: 3, groundCount: 0 }],
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(
      quantities.wireByCircuit.reduce((sum, c) => sum + c.groundFeet, 0)
    ).toBe(0);
    expect(quantities.totalWireFeet).toBe(300);
  });
});
