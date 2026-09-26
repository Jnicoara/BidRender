/**
 * Bends and pull points counted from the trace.
 *
 * Every fixture is a list of points and two ends — no tool, no drawing —
 * because that is the contract: a run traced by hand and one an AI proposes
 * are the same points and must count the same. The "same points, different
 * origin" and "traced backwards" cases below are that contract written down.
 *
 * Scale is 1/4" = 1'-0" (ratio 48): one page point is 48/72 inch of building,
 * so 3 ft — the merge distance — is 54 points. Segment lengths are deliberately
 * uneven so a rule that only holds on a tidy grid cannot pass by accident
 * (CLAUDE.md § "a fixture shaped like its container").
 */
import { describe, expect, it } from "vitest";
import {
  countBends,
  describeRunBends,
  fittingsForBend,
  legBends,
  placeAnswer,
  resolveBendSettings,
  turnDegrees,
  walkPullPoints,
  type BendLeg,
  type BendMethod,
  type EndDrop,
  type PullPointAnswer,
} from "../shared/runBends";
import {
  countFittings,
  splitAtPullPoints,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import {
  bendMethodFor,
  lbHubsTakeConnectors,
  pullBoxFor,
  pullPointKindFor,
} from "../shared/runFittingMaterials";

type P = { x: number; y: number };

/** Real feet per page point at 1/4" = 1'-0". */
const FT = 48 / 72 / 12;
const NONE: EndDrop = { state: "none" };
const DROP = (feet: number): EndDrop => ({ state: "counted", feet });
const UNKNOWN: EndDrop = { state: "unknown" };

const FACTORY: BendMethod = {
  method: "factory",
  why: 'factory elbows from 1-1/4" up',
};
const FIELD: BendMethod = {
  method: "field",
  why: '1" EMT is bent in the field below 1-1/4"',
};

function bendLeg(
  points: P[],
  opts: Partial<Omit<BendLeg, "points">> = {}
): BendLeg {
  return {
    id: opts.id ?? "1",
    points,
    feetPerPoint: opts.feetPerPoint === undefined ? FT : opts.feetPerPoint,
    startDrop: opts.startDrop ?? NONE,
    endDrop: opts.endDrop ?? NONE,
    answers: opts.answers ?? [],
  };
}

function fittingLeg(
  points: P[],
  feet: number | null,
  opts: Partial<Omit<FittingLeg, "points" | "feet">> = {}
): FittingLeg {
  return {
    ...bendLeg(points, opts),
    runId: opts.runId ?? opts.id ?? "1",
    from: opts.from ?? "run:1:start",
    to: opts.to ?? "run:1:end",
    feet,
    feetIsFloor: opts.feetIsFloor ?? false,
  };
}

/**
 * A staircase of `n` right-angle corners turning the same way each time is a
 * spiral; alternating keeps it on the page. Segment lengths vary, and every
 * one is far longer than the 54-point merge distance.
 */
function zigzag(n: number): P[] {
  const pts: P[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    if (i % 2 === 0) x += 300 + 37 * i;
    else y += 220 + 23 * i;
    pts.push({ x, y });
  }
  return pts;
}

function answer(
  id: number,
  at: P,
  status: "accepted" | "dismissed",
  kind: "lb" | "pullBox" = "lb",
  place: "corner" | "end-drop" = "corner"
): PullPointAnswer {
  return { id, place, x: at.x, y: at.y, kind, status };
}

/** Couplings, connectors and straps, with the bend kinds riding along. */
function fittings(legs: readonly FittingLeg[], spec: RacewayFittingSpec) {
  return countFittings(legs, spec, { method: FACTORY, limit: 360 }, []);
}

const EMT_SPEC: RacewayFittingSpec = {
  name: '1-1/4" EMT',
  stickLengthFeet: 10,
  stickJoint: "coupling",
  strapSpacingFeet: 10,
  strapFromBoxFeet: 3,
  lbHubsTakeConnectors: true,
  teeCoverIncluded: false,
};

describe("the turn at a corner", () => {
  it("is signed, and a doubled click has no direction", () => {
    expect(
      turnDegrees({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })
    ).toBeCloseTo(90);
    expect(
      turnDegrees({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 })
    ).toBeCloseTo(-90);
    expect(
      turnDegrees({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 25, y: 0 })
    ).toBeCloseTo(0);
    expect(
      turnDegrees({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 })
    ).toBeNull();
  });
});

describe("which fittings a bend takes", () => {
  const corner = (degrees: number) => ({
    place: { kind: "corner" as const, vertex: 1 },
    degrees,
  });
  it.each([
    [16, { n90: 0, n45: 1 }],
    [44, { n90: 0, n45: 1 }],
    [66, { n90: 0, n45: 1 }],
    [70, { n90: 1, n45: 0 }],
    [110, { n90: 1, n45: 0 }],
    [135, { n90: 1, n45: 1 }],
    [170, { n90: 2, n45: 0 }],
  ])("%d° takes %o", (degrees, expected) => {
    expect(fittingsForBend(corner(degrees))).toEqual(expected);
  });

  it("a drop is exactly one 90", () => {
    expect(
      fittingsForBend({ place: { kind: "drop", end: "end" }, degrees: 90 })
    ).toEqual({ n90: 1, n45: 0 });
  });
});

describe("wobble and sweeps — merge first, then drop the small ones", () => {
  it("ignores a hand-drawn wobble along a straight wall", () => {
    // Alternating ±4° kinks every 200 pts (~11 ft): never a bend.
    const pts: P[] = [{ x: 0, y: 0 }];
    for (let i = 1; i <= 12; i++) pts.push({ x: 200 * i, y: i % 2 ? 14 : 0 });
    const b = legBends(bendLeg(pts));
    expect(b.bends).toEqual([]);
    expect(b.wobble).toBe(11);
  });

  it("merges three 30° clicks a foot apart into ONE 90", () => {
    // Clicks ~18 pts (1 ft) apart round a corner, then long legs away.
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400 + 18 * Math.cos(Math.PI / 6), y: 18 * Math.sin(Math.PI / 6) },
    ];
    const c = pts[2];
    pts.push({
      x: c.x + 18 * Math.cos(Math.PI / 3),
      y: c.y + 18 * Math.sin(Math.PI / 3),
    });
    const d = pts[3];
    pts.push({ x: d.x, y: d.y + 350 });
    const b = legBends(bendLeg(pts));
    expect(b.bends).toHaveLength(1);
    expect(b.bends[0].degrees).toBeCloseTo(90);
    expect(b.bends[0].vertices).toEqual([1, 2, 3]);
    // Drawn at the middle click.
    expect(b.bends[0].place).toEqual({ kind: "corner", vertex: 2 });
  });

  it("merges small same-way clicks that ALONE would be wobble", () => {
    // Nine 10° clicks, each under the 15° floor, 0.6 ft apart: one 90. This is
    // the case that fails if the floor is applied before merging.
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ];
    let angle = 0;
    for (let i = 0; i < 9; i++) {
      angle += (10 * Math.PI) / 180;
      const last = pts[pts.length - 1];
      pts.push({
        x: last.x + 11 * Math.cos(angle),
        y: last.y + 11 * Math.sin(angle),
      });
    }
    const last = pts[pts.length - 1];
    pts.push({ x: last.x, y: last.y + 400 });
    const b = legBends(bendLeg(pts));
    expect(b.wobble).toBe(0);
    expect(b.bends).toHaveLength(1);
    expect(b.bends[0].degrees).toBeCloseTo(90);
  });

  it("does NOT merge clicks further apart than 3 ft", () => {
    // Three 30° turns 5 ft (90 pts) apart: three separate bends, three 45s.
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ];
    let angle = 0;
    for (let i = 0; i < 3; i++) {
      angle += Math.PI / 6;
      const last = pts[pts.length - 1];
      const len = i === 2 ? 400 : 90;
      pts.push({
        x: last.x + len * Math.cos(angle),
        y: last.y + len * Math.sin(angle),
      });
    }
    const b = legBends(bendLeg(pts));
    expect(b.bends.map(x => Math.round(x.degrees))).toEqual([30, 30, 30]);
  });

  it("does NOT merge an offset — the two turns go opposite ways", () => {
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 320, y: 12 },
      { x: 700, y: 12 },
    ];
    const b = legBends(bendLeg(pts));
    expect(b.bends).toHaveLength(2);
  });

  it("merges nothing on a sheet with no scale — no distance to measure", () => {
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400 + 18 * Math.cos(Math.PI / 6), y: 18 * Math.sin(Math.PI / 6) },
    ];
    const c = pts[2];
    pts.push({
      x: c.x + 18 * Math.cos(Math.PI / 3),
      y: c.y + 18 * Math.sin(Math.PI / 3),
    });
    const d = pts[3];
    pts.push({ x: d.x, y: d.y + 350 });
    const b = legBends(bendLeg(pts, { feetPerPoint: null }));
    expect(b.bends).toHaveLength(3);
  });
});

describe("drops", () => {
  const L: P[] = [
    { x: 0, y: 0 },
    { x: 410, y: 0 },
    { x: 410, y: 270 },
  ];

  it("adds one 90 at each counted drop, in order along the run", () => {
    const b = legBends(bendLeg(L, { startDrop: DROP(8.5), endDrop: DROP(6) }));
    expect(b.bends.map(x => x.place.kind)).toEqual(["drop", "corner", "drop"]);
    expect(b.unknownDrops).toBe(0);
  });

  it("counts a level end as nothing, and an unknown one as a floor", () => {
    const b = legBends(bendLeg(L, { startDrop: NONE, endDrop: UNKNOWN }));
    expect(b.bends).toHaveLength(1);
    expect(b.unknownDrops).toBe(1);
    const r = countBends([bendLeg(L, { endDrop: UNKNOWN })], FACTORY, 360);
    expect(r.counts.elbow90.why).toMatch(/1 end whose drop has no height yet/);
  });
});

describe("the counts, and what they say", () => {
  it("always reads 'at least' — plans do not show kicks at boxes", () => {
    const L: P[] = [
      { x: 0, y: 0 },
      { x: 410, y: 0 },
      { x: 410, y: 270 },
    ];
    const r = countBends(
      [bendLeg(L, { startDrop: DROP(8.5), endDrop: DROP(6) })],
      FACTORY,
      360
    );
    expect(r.counts.elbow90).toMatchObject({
      status: "counted",
      qty: 3,
      atLeast: true,
    });
    expect(r.counts.elbow90.why).toBe(
      "At least 3 90° elbows: 1 corner (90°) + 2 drops (plans do not show the kicks and offsets at boxes)"
    );
    expect(r.counts.elbow45).toMatchObject({ qty: 0 });
    expect(r.counts.fieldBend.status).toBe("included");
  });

  it("splits a 135° corner into a 90 and a 45", () => {
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 150, y: 250 },
    ];
    const r = countBends([bendLeg(pts)], FACTORY, 360);
    expect(r.counts.elbow90).toMatchObject({ qty: 1 });
    expect(r.counts.elbow45).toMatchObject({ qty: 1 });
  });

  it("field-bends below the size, and says a corner past 112° is bent twice", () => {
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 150, y: 250 },
    ];
    const r = countBends([bendLeg(pts, { endDrop: DROP(6) })], FIELD, 360);
    expect(r.counts.elbow90.status).toBe("included");
    expect(r.counts.fieldBend).toMatchObject({
      status: "counted",
      qty: 3,
      atLeast: true,
    });
    expect(r.counts.fieldBend.why).toBe(
      'At least 3 field bends: 1 corner (135°) + 1 drop, 1 corner past 112° bent twice — 1" EMT is bent in the field below 1-1/4" (plans do not show the kicks and offsets at boxes)'
    );
  });

  it("names the wobble it ignored", () => {
    const pts: P[] = [
      { x: 0, y: 0 },
      { x: 400, y: 8 },
      { x: 800, y: 0 },
      { x: 800, y: 300 },
    ];
    const r = countBends([bendLeg(pts)], FACTORY, 360);
    expect(r.counts.elbow90.why).toMatch(
      /1 corner under 15° treated as drawing wobble/
    );
  });

  it("refuses to guess when the size cannot be read", () => {
    const r = countBends(
      [bendLeg(zigzag(2))],
      { method: "unknown", why: "no size" },
      360
    );
    expect(r.counts.elbow90).toEqual({
      kind: "elbow90",
      status: "unknown",
      why: "no size",
    });
    expect(r.counts.fieldBend.status).toBe("unknown");
  });
});

describe("a hand trace and an AI trace count the same", () => {
  const pts = zigzag(6);

  it("gives identical counts for identical points, whoever drew them", () => {
    const hand = countBends([bendLeg(pts, { id: "hand-7" })], FACTORY, 360);
    const ai = countBends(
      [
        bendLeg(
          pts.map(p => ({ ...p })),
          { id: "ai-proposed-3" }
        ),
      ],
      FACTORY,
      360
    );
    expect(ai.counts).toEqual(hand.counts);
    expect(ai.legs[0].pullPoints.proposals.map(p => p.point)).toEqual(
      hand.legs[0].pullPoints.proposals.map(p => p.point)
    );
  });

  it("gives the same bends traced backwards", () => {
    const forward = countBends([bendLeg(pts)], FACTORY, 360).counts;
    const backward = countBends(
      [bendLeg([...pts].reverse())],
      FACTORY,
      360
    ).counts;
    expect(backward.elbow90).toEqual(forward.elbow90);
    expect(backward.elbow45).toEqual(forward.elbow45);
  });
});

describe("where the pull point goes", () => {
  it("allows exactly the limit — four 90s is 360° and needs nothing", () => {
    const leg = bendLeg(zigzag(4));
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.proposals).toEqual([]);
    expect(w.sections).toEqual([360]);
  });

  it("proposes at the bend that tips it over", () => {
    const pts = zigzag(5);
    const leg = bendLeg(pts);
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.proposals).toHaveLength(1);
    expect(w.proposals[0]).toMatchObject({
      place: "corner",
      vertex: 5,
      degrees: 450,
      answer: null,
    });
    expect(w.proposals[0].point).toEqual(pts[5]);
    expect(w.sections).toEqual([360, 0]);
  });

  it("tips over sooner at 270°", () => {
    const leg = bendLeg(zigzag(5));
    const w = walkPullPoints(leg, 270, legBends(leg).bends);
    expect(w.proposals.map(p => p.vertex)).toEqual([4]);
  });

  it("counts the drops, and proposes at the top of the END drop when that tips it", () => {
    // Start drop + three corners = 360; the end drop is the fifth 90.
    const pts = zigzag(3);
    const leg = bendLeg(pts, { startDrop: DROP(9), endDrop: DROP(7) });
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.proposals).toHaveLength(1);
    expect(w.proposals[0]).toMatchObject({
      place: "end-drop",
      vertex: null,
      degrees: 450,
    });
    expect(w.proposals[0].point).toEqual(pts[pts.length - 1]);
  });

  it("walks on as if each proposal were placed", () => {
    const leg = bendLeg(zigzag(10));
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.proposals.map(p => p.vertex)).toEqual([5, 10]);
  });

  it("does not propose along a long wobbly straight run", () => {
    const pts: P[] = [{ x: 0, y: 0 }];
    for (let i = 1; i <= 40; i++)
      pts.push({ x: 150 * i + (i % 3), y: i % 2 ? 10 : 0 });
    const leg = bendLeg(pts);
    expect(walkPullPoints(leg, 270, legBends(leg).bends).proposals).toEqual([]);
  });
});

describe("answers", () => {
  const pts = zigzag(5);

  it("an accepted LB replaces the elbow at its corner and is counted", () => {
    const leg = bendLeg(pts, { answers: [answer(1, pts[5], "accepted")] });
    const r = countBends([leg], FACTORY, 360);
    expect(r.legs[0].pullPoints.proposals).toEqual([]);
    expect(r.counts.elbow90).toMatchObject({ qty: 4 });
    expect(r.counts.elbow90.why).toMatch(/1 bend made by a pull point instead/);
    expect(r.counts.lb).toMatchObject({
      status: "counted",
      qty: 1,
      atLeast: false,
    });
    expect(r.counts.pullBox).toMatchObject({ qty: 0 });
    expect(r.unansweredProposals).toBe(0);
  });

  it("an unanswered proposal still needs its elbow, and says it is waiting", () => {
    const r = countBends([bendLeg(pts)], FACTORY, 360);
    expect(r.counts.elbow90).toMatchObject({ qty: 5 });
    expect(r.unansweredProposals).toBe(1);
    expect(r.counts.lb.why).toBe(
      "No LBs accepted on the drawing — 1 pull point proposed and not answered yet"
    );
  });

  it("a dismissal is remembered, keeps its degrees, and does not nag on the next bend", () => {
    const pts6 = zigzag(6);
    const leg = bendLeg(pts6, { answers: [answer(2, pts6[5], "dismissed")] });
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.proposals).toHaveLength(1);
    expect(w.proposals[0].answer?.status).toBe("dismissed");
    // The over-limit stretch stays visible; the sixth corner starts afresh.
    expect(w.sections).toEqual([450, 90]);
    expect(countBends([leg], FACTORY, 360).unansweredProposals).toBe(0);
  });

  it("keeps an answer when a point is added EARLIER in the run", () => {
    // Inserting a vertex shifts every index after it. The answer is keyed by
    // position, so it still finds its corner.
    const edited = [pts[0], { x: 150, y: 0 }, ...pts.slice(1)];
    const leg = bendLeg(edited, { answers: [answer(1, pts[5], "accepted")] });
    expect(placeAnswer(leg, leg.answers[0])).toEqual({ vertex: 6 });
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.orphaned).toEqual([]);
    expect(w.accepted).toHaveLength(1);
    expect(w.proposals).toEqual([]);
  });

  it("re-proposes a corner that MOVED, and reports the old answer as orphaned", () => {
    const moved = pts.map((p, i) => (i === 5 ? { x: p.x + 40, y: p.y } : p));
    const leg = bendLeg(moved, { answers: [answer(1, pts[5], "dismissed")] });
    const w = walkPullPoints(leg, 360, legBends(leg).bends);
    expect(w.orphaned.map(a => a.id)).toEqual([1]);
    expect(w.proposals).toHaveLength(1);
    expect(w.proposals[0].answer).toBeNull();
  });

  it("an end-drop answer goes when the drop does", () => {
    const leg = bendLeg(pts, {
      endDrop: NONE,
      answers: [answer(3, pts[pts.length - 1], "accepted", "lb", "end-drop")],
    });
    expect(placeAnswer(leg, leg.answers[0])).toBeNull();
  });

  it("never places a corner answer on an END of the run — that is a box already", () => {
    const leg = bendLeg(pts, { answers: [answer(4, pts[0], "accepted")] });
    expect(placeAnswer(leg, leg.answers[0])).toBeNull();
  });
});

describe("an accepted pull point is a box — the other fittings follow", () => {
  // 100 ft traced along an L, drops of 8 ft and 5 ft at the two ends.
  const pts: P[] = [
    { x: 0, y: 0 },
    { x: 1080, y: 0 },
    { x: 1080, y: 720 },
  ];
  const traced = (1080 + 720) * FT; // 100 ft
  const feet = traced + 8 + 5;

  it("splits the feet: drops to their own ends, the traced part by length", () => {
    const leg = fittingLeg(pts, feet, {
      startDrop: DROP(8),
      endDrop: DROP(5),
      answers: [answer(9, pts[1], "accepted")],
    });
    const pieces = splitAtPullPoints(leg);
    expect(pieces.map(p => p.feet)).toEqual([68, 45]);
    expect(pieces.map(p => [p.from, p.to])).toEqual([
      ["run:1:start", "lb:9"],
      ["lb:9", "run:1:end"],
    ]);
  });

  it("makes the end drop its own piece when the LB sits at its top", () => {
    const leg = fittingLeg(pts, feet, {
      startDrop: DROP(8),
      endDrop: DROP(5),
      answers: [answer(9, pts[2], "accepted", "lb", "end-drop")],
    });
    expect(splitAtPullPoints(leg).map(p => p.feet)).toEqual([108, 5]);
  });

  it("leaves an unmeasured leg unmeasured in every piece — never zeros", () => {
    const leg = fittingLeg(pts, null, {
      answers: [answer(9, pts[1], "accepted")],
    });
    expect(splitAtPullPoints(leg).map(p => p.feet)).toEqual([null, null]);
  });

  it("an EMT LB takes a connector at each hub; rigid threads straight in", () => {
    const leg = fittingLeg(pts, feet, {
      startDrop: DROP(8),
      endDrop: DROP(5),
      answers: [answer(9, pts[1], "accepted")],
    });
    const emt = fittings([leg], EMT_SPEC).connector;
    expect(emt).toMatchObject({ qty: 4 });
    expect(emt.why).toBe(
      "4 connectors: one per conduit end — 2 line ends, 1 LB (2 each, into the hubs)"
    );
    const rigid = fittings([leg], {
      ...EMT_SPEC,
      name: '1-1/4" rigid conduit',
      lbHubsTakeConnectors: false,
    }).connector;
    expect(rigid).toMatchObject({ qty: 2 });
    expect(rigid.why).toMatch(
      /1 LB \(none — the pipe goes straight into the hubs\)/
    );
  });

  it("a pull box always takes two, and straps both sides of it", () => {
    const leg = fittingLeg(pts, feet, {
      startDrop: DROP(8),
      endDrop: DROP(5),
      answers: [answer(9, pts[1], "accepted", "pullBox")],
    });
    const f = fittings([leg], EMT_SPEC);
    expect(f.connector.why).toMatch(/1 pull box \(2 each\)/);
    expect(f.connector).toMatchObject({ qty: 4 });
    // Unsplit 113 ft: 2 + ceil(107/10)-1 = 12. Split 68 + 45 ft:
    // (2 + ceil(62/10)-1 = 8) + (2 + ceil(39/10)-1 = 5) = 13.
    expect(fittings([{ ...leg, answers: [] }], EMT_SPEC).strap).toMatchObject({
      qty: 12,
    });
    expect(f.strap).toMatchObject({ qty: 13 });
  });

  it("a DISMISSED answer is not a box and splits nothing", () => {
    const leg = fittingLeg(pts, feet, {
      answers: [answer(9, pts[1], "dismissed")],
    });
    expect(splitAtPullPoints(leg)).toHaveLength(1);
  });

  it("still says ONE run is short when a pull box cuts it in two", () => {
    // Found on screen 2026-09-26: accepting a pull box turned "2 runs have a
    // drop with no height" into "3 runs" with nothing new traced, because the
    // sentence counted the PIECES the box cut the run into.
    const leg = fittingLeg(pts, feet, {
      startDrop: UNKNOWN,
      endDrop: UNKNOWN,
      feetIsFloor: true,
      answers: [answer(9, pts[1], "accepted", "pullBox")],
    });
    const f = fittings([leg], EMT_SPEC);
    expect(f.strap.why).toMatch(/\(1 run has a drop with no height/);
    expect(f.coupling.why).toMatch(/\(1 run has a drop with no height/);
  });

  it("still says ONE run has no scale when a pull box cuts it in two", () => {
    const leg = fittingLeg(pts, null, {
      answers: [answer(9, pts[1], "accepted", "pullBox")],
    });
    const other = { ...fittingLeg(pts, 50), id: "2", from: "x", to: "y" };
    const f = fittings([leg, other], EMT_SPEC);
    expect(f.strap.why).toMatch(/\(1 run on a sheet with no scale/);
  });
});

describe("factory or field, and which pull point to offer", () => {
  it("sorts by the company's size, compared through the size table", () => {
    expect(bendMethodFor('1" EMT', null, '1-1/4"').method).toBe("field");
    expect(bendMethodFor('1-1/4" EMT', null, '1-1/4"').method).toBe("factory");
    expect(bendMethodFor('3/4" rigid conduit', null, '1-1/4"').method).toBe(
      "field"
    );
    // A company that buys elbows from 1" up.
    expect(bendMethodFor('1" EMT', null, '1"').method).toBe("factory");
  });

  it("PVC always takes factory elbows, flex none, a custom pipe says it cannot tell", () => {
    expect(bendMethodFor('1/2" PVC Sch 40', null, '1-1/4"')).toEqual({
      method: "factory",
      why: "PVC always takes factory elbows",
    });
    expect(
      bendMethodFor('3/4" flexible metal conduit', null, '1-1/4"').method
    ).toBe("none");
    expect(bendMethodFor(null, "Our special pipe", '1-1/4"').method).toBe(
      "unknown"
    );
  });

  it("reads a renamed fork by its shipped name", () => {
    expect(
      bendMethodFor('2" EMT', "Two inch EMT (Acme)", '1-1/4"').method
    ).toBe("factory");
  });

  it('offers an LB below 2" and a pull box from 2" up; flex always a box', () => {
    expect(pullPointKindFor('1-1/2" EMT', null, '2"')).toBe("lb");
    expect(pullPointKindFor('2" EMT', null, '2"')).toBe("pullBox");
    expect(
      pullPointKindFor('1" liquidtight flexible conduit', null, '2"')
    ).toBe("pullBox");
    expect(pullPointKindFor('1-1/2" EMT', null, '1-1/2"')).toBe("pullBox");
  });

  it("sizes a pull box by NEC 314.28's angle pull, to a box the catalog ships", () => {
    expect(pullBoxFor('1/2" EMT', null).name).toBe("4x4 pull box");
    expect(pullBoxFor('2" EMT', null)).toEqual({
      name: "12x12 pull box",
      why: 'angle pull: at least 6 × 2" = 12" (NEC 314.28), more if other conduits enter the box',
    });
    expect(pullBoxFor('3-1/2" rigid conduit', null).name).toBe(
      "24x24 pull box"
    );
    expect(pullBoxFor(null, "Custom").name).toBeNull();
  });

  it("gives an EMT LB connectors and a rigid or PVC one none; unknown counts them", () => {
    expect(lbHubsTakeConnectors('1" EMT', null)).toBe(true);
    expect(lbHubsTakeConnectors('1" IMC', null)).toBe(false);
    expect(lbHubsTakeConnectors('1" PVC Sch 80', null)).toBe(false);
    expect(lbHubsTakeConnectors(null, "Mystery pipe")).toBe(true);
  });
});

describe("what one run says under its row", () => {
  it("adds up the degrees and says it is a floor", () => {
    const leg = bendLeg(zigzag(3), { endDrop: DROP(6), startDrop: UNKNOWN });
    const b = legBends(leg);
    const { summary, overLimit } = describeRunBends(
      b,
      walkPullPoints(leg, 360, b.bends),
      360
    );
    expect(summary).toBe(
      "360° of bend on the drawing (3 corners, 1 drop) — 1 drop not counted yet. At least that: kicks and offsets at boxes are not drawn."
    );
    expect(overLimit).toEqual([]);
  });

  it("says nothing about a straight, level run", () => {
    const leg = bendLeg([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ]);
    const b = legBends(leg);
    expect(
      describeRunBends(b, walkPullPoints(leg, 360, b.bends), 360).summary
    ).toBeNull();
  });

  it("keeps a dismissed over-limit stretch on screen, as the person's choice", () => {
    const pts6 = zigzag(6);
    const leg = bendLeg(pts6, { answers: [answer(2, pts6[5], "dismissed")] });
    const b = legBends(leg);
    expect(
      describeRunBends(b, walkPullPoints(leg, 360, b.bends), 360).overLimit
    ).toEqual([
      "450° pulled through with no pull point — past the 360° limit, by your choice",
    ]);
  });
});

describe("company settings", () => {
  it("fills each unset one with the shipped default", () => {
    expect(resolveBendSettings(null)).toEqual({
      factoryElbowFrom: '1-1/4"',
      pullPointLimit: 360,
      pullBoxFrom: '2"',
    });
    expect(
      resolveBendSettings({
        factoryElbowFromSize: '1"',
        pullPointLimitDegrees: 270,
        pullBoxFromSize: null,
      })
    ).toEqual({
      factoryElbowFrom: '1"',
      pullPointLimit: 270,
      pullBoxFrom: '2"',
    });
  });

  it("reads a limit that is not offered as the default, not as itself", () => {
    expect(
      resolveBendSettings({
        factoryElbowFromSize: null,
        pullPointLimitDegrees: 999,
        pullBoxFromSize: null,
      }).pullPointLimit
    ).toBe(360);
  });
});
