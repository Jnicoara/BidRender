/**
 * A traced SWEEP counts as one bend — on a run type that bends on a sweep.
 *
 * ── The fault this pins (measured 2026-09-29, plan § 8a) ─────────────────────
 * Same-direction turns merge into one bend only when they are closer than
 * `MERGE_WITHIN_FEET` (3 ft) along the path. A sweep drawn on a plan is an
 * arc, and the natural way to trace one is to click where the curve starts
 * and where it ends. Those two clicks sit a 90° CHORD apart — √2 × the
 * radius:
 *
 *   24" radius   2.83 ft   merges (barely)          one 90
 *   36" radius   4.24 ft   does NOT merge           TWO 45s
 *
 * So a 36" sweep traced that way bought two 45s where the job needs one 90 —
 * a wrong count on the screen whose job is counts, and on a type whose 45
 * is still the standard elbow, the wrong PART as well.
 *
 * ── The fix ──────────────────────────────────────────────────────────────────
 * When a run type's 90 or 45 is a sweep, the merge distance for that type
 * reaches the sweep's own 90° chord plus 25% for click slop
 * (`mergeWithinFeetFor`). The radius is read off the chosen row's name
 * (`sweepRadiusInches`, the inverse of `sweepName`). A type with no sweep
 * keeps 3 ft exactly, so no existing count moves.
 *
 * Both production paths are covered, because they are two places that could
 * disagree: the bid's count (`countFittings`, from `server/db.ts`) and the
 * run panel's (`runBendsFor`, `server/runBendDetail.ts`).
 *
 * Coordinates are in page points at 1/4" = 1'-0", like runBends.test.ts; the
 * helpers take FEET so the geometry reads as the building does.
 */
import { describe, expect, it } from "vitest";
import {
  MERGE_WITHIN_FEET,
  countBends,
  legBends,
  mergeWithinFeetFor,
  type BendCount,
  type BendMethod,
} from "../shared/runBends";
import {
  countFittings,
  type FittingCount,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import type { EndVertical, RunVerticals } from "../shared/takeoffHeights";
import {
  bendMergeFeetForOverrides,
  sweepName,
  sweepRadiusInches,
} from "../shared/runFittingMaterials";
import { runBendsFor, type BendContext } from "./runBendDetail";

type P = { x: number; y: number };

/** Real feet per page point at 1/4" = 1'-0". */
const FT = 48 / 72 / 12;
const pt = (xFeet: number, yFeet: number): P => ({
  x: xFeet / FT,
  y: yFeet / FT,
});

const FACTORY: BendMethod = {
  method: "factory",
  why: "PVC always takes factory elbows",
};

const PVC_SPEC: RacewayFittingSpec = {
  name: '2" PVC Sch 40',
  stickLengthFeet: 10,
  stickJoint: "belled",
  strapSpacingFeet: 5,
  strapFromBoxFeet: 3,
  lbHubsTakeConnectors: false,
  teeCoverIncluded: false,
};

/**
 * 12 ft east, a 90° left turn on radius `r` feet, then 9 ft north — two
 * different lengths on purpose. The arc runs from (12, 0) to (12 + r, r).
 */
function onArc(r: number, deg: number): P {
  const a = (deg * Math.PI) / 180;
  return pt(12 + r * Math.sin(a), r - r * Math.cos(a));
}

const STYLES: Record<string, (r: number) => P[]> = {
  "one click at the corner": r => [pt(0, 0), pt(12 + r, 0), pt(12 + r, r + 9)],
  "the arc's two ends": r => [
    pt(0, 0),
    onArc(r, 0),
    onArc(r, 90),
    pt(12 + r, r + 9),
  ],
  "ends and middle": r => [
    pt(0, 0),
    onArc(r, 0),
    onArc(r, 45),
    onArc(r, 90),
    pt(12 + r, r + 9),
  ],
  "ends and two between": r => [
    pt(0, 0),
    ...[0, 30, 60, 90].map(d => onArc(r, d)),
    pt(12 + r, r + 9),
  ],
};

function leg(points: P[]): FittingLeg {
  return {
    id: "1",
    runId: "1",
    points,
    feetPerPoint: FT,
    startDrop: { state: "none" },
    endDrop: { state: "none" },
    answers: [],
    from: "run:1:start",
    to: "run:1:end",
    feet: null,
    feetIsFloor: false,
  };
}

const qty = (c: FittingCount | BendCount): number =>
  c.status === "counted" ? c.qty : 0;

/** The bid's path: what `server/db.ts` calls for one run type. */
function bidCount(points: P[], mergeWithinFeet: number) {
  const counts = countFittings(
    [leg(points)],
    PVC_SPEC,
    { method: FACTORY, limit: 360, mergeWithinFeet },
    []
  );
  return { n90: qty(counts.elbow90), n45: qty(counts.elbow45) };
}

/** Both ends carry straight on at their own height: no drop, no unknown. */
const LEVEL: EndVertical = { counted: false, kind: null, reason: "level" };
const NO_VERTICALS: RunVerticals = { start: LEVEL, end: LEVEL, feet: 0 };

const SWEEP_24 = sweepName('2"', "PVC Sch 40", 90, 24);
const SWEEP_36 = sweepName('2"', "PVC Sch 40", 90, 36);
const ELBOW = '2" PVC Sch 40 90-degree elbow';

describe("reading a sweep's radius off its name", () => {
  it("is the inverse of sweepName", () => {
    expect(sweepRadiusInches(SWEEP_24)).toBe(24);
    expect(sweepRadiusInches(SWEEP_36)).toBe(36);
    expect(sweepRadiusInches(sweepName('4"', "PVC Sch 80", 45, 36))).toBe(36);
  });

  it("finds no radius on anything that is not a sweep", () => {
    expect(sweepRadiusInches(ELBOW)).toBeNull();
    expect(sweepRadiusInches('36" under-cabinet light bar')).toBeNull();
    expect(sweepRadiusInches(null)).toBeNull();
  });
});

describe("the merge distance a run type gets", () => {
  it("is exactly the old 3 ft with no sweep chosen — no existing count moves", () => {
    expect(bendMergeFeetForOverrides(null, null)).toBe(MERGE_WITHIN_FEET);
    expect(bendMergeFeetForOverrides(ELBOW, null)).toBe(MERGE_WITHIN_FEET);
    expect(mergeWithinFeetFor([])).toBe(MERGE_WITHIN_FEET);
  });

  it("reaches past a sweep's own 90° chord when one is chosen", () => {
    // √2 × 3 ft = 4.24 ft is where the two end clicks of a 36" sweep sit.
    expect(bendMergeFeetForOverrides(SWEEP_36, null)).toBeGreaterThan(4.24);
    expect(bendMergeFeetForOverrides(SWEEP_24, null)).toBeGreaterThan(2.83);
    // The wider of the two overrides decides.
    expect(bendMergeFeetForOverrides(SWEEP_24, SWEEP_36)).toBe(
      bendMergeFeetForOverrides(SWEEP_36, null)
    );
  });
});

describe("a traced sweep, as the BID counts it", () => {
  it("counts a 36\" sweep traced by its two ends as TWO 45s when no sweep is chosen — today's rule, measured", () => {
    // Pinned so the fix below is visibly scoped: a type on standard elbows
    // counts exactly as it did.
    expect(
      bidCount(STYLES["the arc's two ends"](3), MERGE_WITHIN_FEET)
    ).toEqual({ n90: 0, n45: 2 });
  });

  for (const [radiusInches, name] of [
    [24, SWEEP_24],
    [36, SWEEP_36],
  ] as const) {
    for (const [style, trace] of Object.entries(STYLES)) {
      it(`counts one 90 for a ${radiusInches}" sweep traced ${style}`, () => {
        const merge = bendMergeFeetForOverrides(name, null);
        expect(bidCount(trace(radiusInches / 12), merge)).toEqual({
          n90: 1,
          n45: 0,
        });
      });
    }
  }

  it("still counts two 45s that are genuinely apart on a sweep type", () => {
    // Two 45s with 6 ft between them are two bends, whatever the type buys.
    const points = [
      pt(0, 0),
      pt(10, 0),
      pt(10 + 6 / Math.SQRT2, 6 / Math.SQRT2),
      pt(10 + 6 / Math.SQRT2, 20),
    ];
    expect(bidCount(points, bendMergeFeetForOverrides(SWEEP_36, null))).toEqual(
      { n90: 0, n45: 2 }
    );
  });
});

describe("a traced sweep, as the RUN PANEL counts it", () => {
  const context = (mergeWithinFeet: number): BendContext => ({
    settings: {
      factoryElbowFrom: '1-1/4"',
      pullPointLimit: 360,
      pullBoxFrom: '2"',
    },
    answers: new Map(),
    byType: new Map([
      [7, { method: FACTORY, suggestedKind: "pullBox", mergeWithinFeet }],
    ]),
  });
  const panel = (points: P[], mergeWithinFeet: number) =>
    runBendsFor(
      { id: 1, runTypeId: 7, points, traceMode: "route" },
      NO_VERTICALS,
      FT,
      context(mergeWithinFeet)
    );

  it('says one 90 for a 36" sweep traced by its two ends, like the bid', () => {
    const points = STYLES["the arc's two ends"](3);
    const merge = bendMergeFeetForOverrides(SWEEP_36, null);
    // The panel and the bid read the same legBends with the same distance.
    const direct = legBends(leg(points), merge).bends.map(b =>
      Math.round(b.degrees)
    );
    expect(direct).toEqual([90]);
    // Without the sweep's distance the same trace is two bends, so the
    // comparison below cannot pass by both sides being wrong together.
    expect(panel(points, MERGE_WITHIN_FEET).summary).not.toBe(
      panel(STYLES["one click at the corner"](3), MERGE_WITHIN_FEET).summary
    );
    expect(panel(points, merge).summary).toBe(
      panel(STYLES["one click at the corner"](3), merge).summary
    );
  });

  it("the bid's countBends and the panel agree on every style", () => {
    const merge = bendMergeFeetForOverrides(SWEEP_36, null);
    for (const trace of Object.values(STYLES)) {
      const points = trace(3);
      const bid = countBends([leg(points)], FACTORY, 360, merge);
      expect(qty(bid.counts.elbow90)).toBe(1);
      expect(qty(bid.counts.elbow45)).toBe(0);
      expect(panel(points, merge).summary).toBe(
        panel(STYLES["one click at the corner"](3), merge).summary
      );
    }
  });
});
