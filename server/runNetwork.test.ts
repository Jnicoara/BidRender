/**
 * Branch legs (D20): a run as a root plus leg rows, joined at tees.
 *
 * Built from ROWS through `legFromRun`, the same door the app uses, so a test
 * here cannot pass on a leg shape the app never makes. Lengths are uneven and
 * no leg is a round number of sticks, so a rule that only holds per network,
 * or only on a tidy fixture, cannot pass by accident.
 *
 * Scale is 1/4" = 1'-0" (ratio 48): one page point is 48/72 inch.
 */
import { describe, expect, it } from "vitest";
import {
  countFittings,
  legFromRun,
  nodeDegrees,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import {
  countTeeBoxes,
  cutPathAt,
  endNodeKey,
  projectOntoPath,
  teeBoxOwners,
  type TeeRef,
} from "../shared/runNetwork";
import { teeBoxFor } from "../shared/runFittingMaterials";
import type { EndVertical } from "../shared/takeoffHeights";

type P = { x: number; y: number };
const FT = 48 / 72 / 12;

const EMT: RacewayFittingSpec = {
  name: '3/4" EMT',
  stickLengthFeet: 10,
  stickJoint: "coupling",
  strapSpacingFeet: 10,
  strapFromBoxFeet: 3,
  lbHubsTakeConnectors: true,
  teeCoverIncluded: false,
};
const BENDS = {
  method: { method: "factory" as const, why: "factory" },
  limit: 360,
};
const LEVEL: EndVertical = {
  counted: false,
  kind: "distribution",
  reason: "level",
};

function feetOf(points: readonly P[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    );
  return Math.round(sum * FT * 100) / 100;
}

/** One stored row, as a leg. */
function row(input: {
  id: number;
  parentRunId?: number | null;
  points: P[];
  startTee?: TeeRef | null;
  endTee?: TeeRef | null;
  startStampId?: number | null;
  endStampId?: number | null;
  measured?: boolean;
}): FittingLeg {
  return legFromRun({
    id: input.id,
    parentRunId: input.parentRunId ?? null,
    startStampId: input.startStampId ?? null,
    endStampId: input.endStampId ?? null,
    startTee: input.startTee ?? null,
    endTee: input.endTee ?? null,
    points: input.points,
    conduitFeet: input.measured === false ? null : feetOf(input.points),
    verticals: { start: LEVEL, end: LEVEL },
    feetPerPoint: FT,
    answers: [],
  });
}

const TEE: TeeRef = { id: 9, fitting: "box", stampId: null };

// A main from the panel east, turning south at x=900, with a branch leaving
// northward at x=520. Traced in page points.
const MAIN: P[] = [
  { x: 0, y: 0 },
  { x: 900, y: 0 },
  { x: 900, y: 610 },
];
const BRANCH_END: P = { x: 520, y: -430 };

/** The run after a tee: the main cut at x=520, plus the branch. */
function teedRun(): FittingLeg[] {
  const cut = cutPathAt(MAIN, { x: 520, y: 3 })!;
  return [
    row({ id: 11, points: cut.before, endTee: TEE }),
    row({ id: 12, parentRunId: 11, points: cut.after, startTee: TEE }),
    row({
      id: 13,
      parentRunId: 11,
      points: [cut.point, BRANCH_END],
      startTee: TEE,
    }),
  ];
}

describe("cutting a leg at a tee", () => {
  it("projects onto the nearest segment", () => {
    const hit = projectOntoPath(MAIN, { x: 520, y: 3 })!;
    expect(hit.segment).toBe(0);
    expect(hit.point).toEqual({ x: 520, y: 0 });
  });

  it("covers the path exactly — nothing added, nothing lost", () => {
    const cut = cutPathAt(MAIN, { x: 520, y: 3 })!;
    expect(feetOf(cut.before) + feetOf(cut.after)).toBeCloseTo(feetOf(MAIN), 6);
    expect(cut.before[cut.before.length - 1]).toEqual(cut.after[0]);
  });

  it("refuses an end — a leg from an end is not a tee", () => {
    expect(cutPathAt(MAIN, { x: 0, y: 1 })).toBeNull();
    expect(cutPathAt(MAIN, { x: 2, y: 1 }, 3)).toBeNull();
    expect(cutPathAt(MAIN, { x: 901, y: 612 }, 3)).toBeNull();
  });

  it("removes the elbow at a corner the tee box turns", () => {
    // Uncut, the corner at (900,0) is a 90. Cut there, it is the box.
    const whole = countFittings([row({ id: 1, points: MAIN })], EMT, BENDS, []);
    expect(whole.elbow90).toMatchObject({ status: "counted", qty: 1 });

    const cut = cutPathAt(MAIN, { x: 899, y: 1 }, 3)!;
    expect(cut.point).toEqual({ x: 900, y: 0 });
    const legs = [
      row({ id: 1, points: cut.before, endTee: TEE }),
      row({ id: 2, parentRunId: 1, points: cut.after, startTee: TEE }),
    ];
    expect(countFittings(legs, EMT, BENDS, []).elbow90).toMatchObject({
      status: "counted",
      qty: 0,
    });
  });
});

describe("fittings at a tee", () => {
  it("counts three connectors where a third conduit leaves", () => {
    const legs = teedRun();
    expect(nodeDegrees(legs).get("tee:9")).toBe(3);
    const f = countFittings(legs, EMT, BENDS, []);
    // 3 at the tee + the panel end + the far end of the main + the branch end.
    expect(f.connector).toMatchObject({ status: "counted", qty: 6 });
    expect(f.connector.why).toMatch(/1 branch tee \(3 of this size\)/);
  });

  it("straps near the box on each of the three legs", () => {
    const f = countFittings(teedRun(), EMT, BENDS, []);
    // Every leg is longer than 6 ft, so each has a strap near both its boxes:
    // 28.89 ft, 55 ft and 23.89 ft give 2+4+1 between them.
    expect(f.strap).toMatchObject({ status: "counted", qty: 13 });
    expect(f.strap.why).toMatch(/: 6 within 3 ft of a box \+ 7 at 10 ft/);
  });

  it("starts a fresh stick on each side of the tee", () => {
    const legs = teedRun();
    const perLeg = legs.reduce(
      (sum, leg) => sum + Math.max(0, Math.ceil(leg.feet! / 10 - 1e-9) - 1),
      0
    );
    expect(countFittings(legs, EMT, BENDS, []).coupling).toMatchObject({
      qty: perLeg,
    });
  });

  it("does not depend on the order the rows arrive in", () => {
    const legs = teedRun();
    const a = countFittings(legs, EMT, BENDS, []);
    const b = countFittings([legs[2], legs[0], legs[1]], EMT, BENDS, []);
    for (const kind of Object.keys(a) as (keyof typeof a)[]) {
      expect(b[kind]).toEqual(a[kind]);
    }
  });
});

describe("a run of several legs is ONE run in every sentence", () => {
  it("says 1 run, not 3, when none of its legs can be measured", () => {
    const legs = teedRun().map(leg => ({ ...leg, feet: null }));
    const f = countFittings(legs, EMT, BENDS, []);
    expect(f.coupling.why).toMatch(/^1 run on a sheet with no scale/);
  });
});

describe("which node an end sits on", () => {
  it("puts a tee before the leg's own stamp link", () => {
    expect(endNodeKey(5, "start", 40, TEE)).toBe("tee:9");
    expect(endNodeKey(5, "start", 40, null)).toBe("stamp:40");
    expect(endNodeKey(5, "end", null, null)).toBe("run:5:end");
  });

  it("joins a tee on a mark to that mark's node", () => {
    expect(
      endNodeKey(5, "start", null, { id: 9, fitting: "mark", stampId: 77 })
    ).toBe("stamp:77");
  });

  it("never joins two ends just because they touch", () => {
    // Same spot, no tee row: two line ends.
    const a = row({
      id: 1,
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    });
    const b = row({
      id: 2,
      points: [
        { x: 300, y: 0 },
        { x: 300, y: 400 },
      ],
    });
    expect(nodeDegrees([a, b]).get("run:1:end")).toBe(1);
    expect(nodeDegrees([a, b]).get("run:2:start")).toBe(1);
  });
});

describe("the box at a tee is bought once", () => {
  const legs = teedRun();
  const sizes: Record<number, string | null> = {
    1: '3/4"',
    2: '1/2"',
    3: null,
  };

  it("belongs to the LARGEST raceway meeting there", () => {
    // Main is 3/4" (type 1), branch is 1/2" (type 2).
    const groups = new Map([
      [2, [legs[2]]],
      [1, [legs[0], legs[1]]],
    ]);
    expect(teeBoxOwners(groups, id => sizes[id]).get(9)).toBe(1);
  });

  it("goes to the lowest leg id on a tie, whatever order the groups come in", () => {
    const one = new Map([
      [1, [legs[1]]],
      [2, [legs[0], legs[2]]],
    ]);
    const same = (id: number) => (id === 3 ? null : '3/4"');
    expect(teeBoxOwners(one, same).get(9)).toBe(2); // leg 11 is in type 2
    const reversed = new Map([
      [2, [legs[2], legs[0]]],
      [1, [legs[1]]],
    ]);
    expect(teeBoxOwners(reversed, same).get(9)).toBe(2);
  });

  it("ranks a size it cannot read below every size it can", () => {
    const groups = new Map([
      [3, [legs[0], legs[1]]],
      [2, [legs[2]]],
    ]);
    expect(teeBoxOwners(groups, id => sizes[id]).get(9)).toBe(2);
  });

  it("counts a box, nothing for a mark, and says what is unanswered", () => {
    expect(
      countTeeBoxes([
        { id: 1, fitting: "box", stampId: null },
        { id: 2, fitting: "mark", stampId: 5 },
        { id: 3, fitting: null, stampId: null },
        { id: 4, fitting: "body", stampId: null },
      ])
    ).toEqual({ boxes: 1, onMarks: 1, unanswered: 2 });
  });
});

describe("tee box and cover lines", () => {
  it("counts a box and a cover per owned tee", () => {
    const f = countFittings(teedRun(), EMT, BENDS, [TEE]);
    expect(f.teeBox).toMatchObject({ status: "counted", qty: 1 });
    expect(f.teeBox.why).toBe("1 tee box: one at each branch tee");
    expect(f.teeCover).toMatchObject({ status: "counted", qty: 1 });
  });

  it("buys nothing for a tee this raceway does not own", () => {
    const f = countFittings(teedRun(), EMT, BENDS, []);
    expect(f.teeBox).toMatchObject({ qty: 0, why: "No branch tees" });
  });

  it("says the cover comes with a pull box", () => {
    const f = countFittings(
      teedRun(),
      { ...EMT, teeCoverIncluded: true },
      BENDS,
      [TEE]
    );
    expect(f.teeCover.status).toBe("included");
  });

  it("reads 'at least' and names an unanswered tee", () => {
    const f = countFittings(teedRun(), EMT, BENDS, [
      TEE,
      { id: 10, fitting: null, stampId: null },
    ]);
    expect(f.teeBox).toMatchObject({ qty: 1, atLeast: true });
    expect(f.teeBox.why).toMatch(/1 tee has no box chosen — not counted/);
  });
});

describe("the tee box's size (D20, answer 3)", () => {
  it("is a 4-inch square box and cover up to 3/4 inch", () => {
    expect(teeBoxFor('3/4" EMT', null)).toMatchObject({
      box: '4" square box',
      cover: '4" square blank cover',
    });
  });
  it("is 4-11/16 inch from 1 to 1-1/4 inch", () => {
    expect(teeBoxFor('1-1/4" EMT', null)).toMatchObject({
      box: '4-11/16" square box',
      cover: '4-11/16" square blank cover',
    });
  });
  it("follows the pull-box rule from 1-1/2 inch up, cover included", () => {
    expect(teeBoxFor('2" EMT', null)).toMatchObject({
      box: "12x12 pull box",
      cover: null,
    });
  });
  it("proposes nothing for a size it cannot read", () => {
    expect(teeBoxFor("Custom pipe", null).box).toBeNull();
  });
});
