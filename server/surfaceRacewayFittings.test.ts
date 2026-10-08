/**
 * The 700 family's three rules (per-foot-items-plan.md § 3c, § 8).
 *
 * Each rule is checked against the PIPE count on the same legs, so a test
 * here fails if the 700 count quietly falls back to what `countFittings`
 * does — two connectors a run, a 90 for every turn, a box at every tee.
 *
 * Lengths are not multiples of the 10 ft length and legs differ, so a
 * per-network rule cannot pass where a per-leg one is needed (CLAUDE.md § "a
 * fixture shaped like its container").
 */
import { describe, expect, it } from "vitest";
import {
  SURFACE_RACEWAY_PARTS,
  countSurfaceRacewayFittings,
  type SurfaceRacewayCount,
  type SurfaceRacewaySpec,
} from "../shared/surfaceRacewayFittings";
import {
  OPEN_NODE,
  countFittings,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import { ELBOW_WORDS, type EndDrop } from "../shared/runBends";
import type { TeeRef } from "../shared/runNetwork";

const R700: SurfaceRacewaySpec = {
  name: "Surface raceway, 700 series",
  stickLengthFeet: 10,
  strapSpacingFeet: 5,
  strapFromBoxFeet: 1,
};

/** The same raceway as a PIPE would be counted — the contrast. */
const AS_PIPE: RacewayFittingSpec = {
  ...R700,
  stickJoint: "coupling",
  lbHubsTakeConnectors: true,
  teeCoverIncluded: false,
};

const LEVEL: EndDrop = { state: "none" };

/**
 * A leg traced at 1 page point = 1 ft. `turnAt` adds a corner of that many
 * degrees halfway along; no turn is a straight line.
 */
function leg(
  id: string,
  feet: number | null,
  opts: {
    runId?: string;
    from?: string;
    to?: string;
    turn?: number;
    startDrop?: EndDrop;
    endDrop?: EndDrop;
  } = {}
): FittingLeg {
  const length = feet ?? 40;
  const half = length / 2;
  const points =
    opts.turn === undefined
      ? [
          { x: 0, y: 0 },
          { x: length, y: 0 },
        ]
      : [
          { x: 0, y: 0 },
          { x: half, y: 0 },
          {
            x: half + half * Math.cos((opts.turn * Math.PI) / 180),
            y: half * Math.sin((opts.turn * Math.PI) / 180),
          },
        ];
  const startDrop = opts.startDrop ?? LEVEL;
  const endDrop = opts.endDrop ?? LEVEL;
  return {
    id,
    runId: opts.runId ?? id,
    from: opts.from ?? `run:${id}:start`,
    to: opts.to ?? `run:${id}:end`,
    feet,
    feetIsFloor: startDrop.state === "unknown" || endDrop.state === "unknown",
    points,
    feetPerPoint: feet === null ? null : 1,
    startDrop,
    endDrop,
    answers: [],
  };
}

function qty(count: SurfaceRacewayCount): number | null {
  return count.status === "counted" ? count.qty : null;
}

function asPipe(legs: FittingLeg[]) {
  return countFittings(
    legs,
    AS_PIPE,
    {
      method: { method: "factory", why: "factory" },
      limit: 360,
      mergeWithinFeet: 3,
      words: ELBOW_WORDS,
    },
    []
  );
}

describe("couplings off 10 ft lengths", () => {
  it("counts lengths minus one per leg", () => {
    // 47 ft = 5 lengths, 4 couplings; 23 ft = 3 lengths, 2 couplings.
    const got = countSurfaceRacewayFittings(
      [leg("1", 47), leg("2", 23)],
      R700,
      []
    );
    expect(qty(got.coupling)).toBe(6);
    expect(got.coupling.why).toContain("8 lengths of 10 ft over 70 ft");
  });

  it("says not set rather than 0 when the length has no stick length", () => {
    const got = countSurfaceRacewayFittings(
      [leg("1", 47)],
      { ...R700, stickLengthFeet: null },
      []
    );
    expect(got.coupling.status).toBe("unknown");
  });
});

describe("rule 1: ONE entrance end per run, at its start", () => {
  it("buys one per run where a pipe buys a connector at each end", () => {
    const legs = [leg("1", 47), leg("2", 23)];
    const got = countSurfaceRacewayFittings(legs, R700, []);
    expect(qty(got.entranceEnd)).toBe(2);
    // The contrast: the same two runs as pipe are four conduit ends.
    expect(asPipe(legs).connector).toMatchObject({ qty: 4 });
  });

  it("buys none on a branch leg — the tee is the branch's fitting", () => {
    const root = leg("10", 30, { to: "tee:5" });
    const after = leg("11", 12, { runId: "10", from: "tee:5" });
    const branch = leg("12", 9, { runId: "10", from: "tee:5" });
    const got = countSurfaceRacewayFittings([root, after, branch], R700, []);
    expect(qty(got.entranceEnd)).toBe(1);
  });

  it("buys none at a quantity trace's start with no drop approved", () => {
    const open = leg("20", 30, { from: `${OPEN_NODE}20:start` });
    const got = countSurfaceRacewayFittings([open, leg("21", 15)], R700, []);
    expect(qty(got.entranceEnd)).toBe(1);
    expect(got.entranceEnd.why).toContain("1 quantity-trace start");
  });

  it("still counts a run on a sheet with no scale — it has a start", () => {
    const got = countSurfaceRacewayFittings([leg("1", null)], R700, []);
    expect(qty(got.entranceEnd)).toBe(1);
    expect(got.coupling.status).toBe("unknown");
  });
});

describe("rule 2: a corner is an inside elbow, an end drop a flat elbow", () => {
  it("splits what a pipe would call 90s into the two parts", () => {
    const legs = [
      leg("1", 40, {
        turn: 90,
        startDrop: { state: "counted", feet: 3 },
        endDrop: { state: "counted", feet: 3.5 },
      }),
    ];
    const got = countSurfaceRacewayFittings(legs, R700, []);
    expect(qty(got.insideElbow)).toBe(1);
    expect(qty(got.flatElbow)).toBe(2);
    // The contrast: as pipe, all three are one kind.
    expect(asPipe(legs).elbow90).toMatchObject({ qty: 3 });
  });

  it("does not count a 45 it has no part for, and says so", () => {
    const got = countSurfaceRacewayFittings(
      [leg("1", 40, { turn: 45 })],
      R700,
      []
    );
    expect(qty(got.insideElbow)).toBe(0);
    expect(got.insideElbow).toMatchObject({ atLeast: true });
    expect(got.insideElbow.why).toContain(
      "1 corner not square (45°) — no 700 elbow makes the 45° part"
    );
  });

  it("buys the 90 of a 135° corner and names the 45 it cannot", () => {
    // The shape found on the Bar layout check bid's 2" PVC run, 2026-10-08.
    const got = countSurfaceRacewayFittings(
      [leg("1", 40, { turn: 135 })],
      R700,
      []
    );
    expect(got.insideElbow).toMatchObject({ qty: 1, atLeast: true });
    expect(got.insideElbow.why).toContain("1 corner not square (135°)");
  });

  it("says a drop with no height leaves the flat elbows short", () => {
    const got = countSurfaceRacewayFittings(
      [leg("1", 40, { endDrop: { state: "unknown" } })],
      R700,
      []
    );
    expect(got.flatElbow).toMatchObject({ qty: 0, atLeast: true });
  });

  it("counts a homerun's corners nobody drew as inside elbows", () => {
    const homerun: FittingLeg = {
      ...leg("1", 40),
      extraCorners: { count: 2, confirmed: false },
    };
    const got = countSurfaceRacewayFittings([homerun], R700, []);
    expect(qty(got.insideElbow)).toBe(2);
  });
});

describe("rule 3: a tee is a fitting, not a box", () => {
  const tees: TeeRef[] = [
    { id: 1, fitting: "box", stampId: null },
    { id: 2, fitting: null, stampId: null },
    { id: 3, fitting: "mark", stampId: 77 },
  ];

  it("buys a 700 tee at every owned tee except one on a counted box", () => {
    const got = countSurfaceRacewayFittings([leg("1", 30)], R700, tees);
    expect(qty(got.tee)).toBe(2);
    expect(got.tee.why).toContain("not a box");
  });

  it("buys nothing at a tee another type owns", () => {
    const got = countSurfaceRacewayFittings([leg("1", 30)], R700, []);
    expect(qty(got.tee)).toBe(0);
  });
});

describe("support clips", () => {
  it("ships not set: no spacing says so and counts nothing", () => {
    const got = countSurfaceRacewayFittings(
      [leg("1", 47)],
      { ...R700, strapSpacingFeet: null, strapFromBoxFeet: null },
      []
    );
    expect(got.clip.status).toBe("unknown");
    expect(got.clip.why).toContain("No clip spacing set");
  });

  it("counts by the strap rule once a spacing is set", () => {
    // 47 ft, 1 ft from each end, 5 ft apart: 2 + ceil(45/5) - 1 = 10.
    const got = countSurfaceRacewayFittings([leg("1", 47)], R700, []);
    expect(qty(got.clip)).toBe(10);
  });
});

describe("factory 700 parts only", () => {
  it("counts exactly the six 700 parts — no field bend, 45, LB or pull box", () => {
    const got = countSurfaceRacewayFittings(
      [leg("1", 40, { turn: 90 })],
      R700,
      []
    );
    expect(Object.keys(got).sort()).toEqual([...SURFACE_RACEWAY_PARTS].sort());
  });

  it("ignores a pull point answer on the leg — 700 has none", () => {
    const withAnswer: FittingLeg = {
      ...leg("1", 47),
      answers: [
        {
          id: 1,
          place: "corner",
          x: 23.5,
          y: 0,
          kind: "pullBox",
          status: "accepted",
        },
      ],
    };
    const got = countSurfaceRacewayFittings([withAnswer], R700, []);
    expect(qty(got.coupling)).toBe(4);
    expect(qty(got.entranceEnd)).toBe(1);
  });

  it("says nothing traced on an empty type", () => {
    const got = countSurfaceRacewayFittings([], R700, []);
    for (const part of SURFACE_RACEWAY_PARTS) {
      if (part === "tee") continue;
      expect(got[part]).toMatchObject({ qty: 0, why: "Nothing traced" });
    }
  });
});
