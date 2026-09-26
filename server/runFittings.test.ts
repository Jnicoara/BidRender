/**
 * Couplings, connectors and straps counted from the trace.
 *
 * Every fixture here is a length and a set of meeting ends — no tool, no
 * drawing — because that is the whole contract: a run traced by hand and one
 * the AI proposes must count the same. Branch shapes are built by hand below
 * even though branches are not in the app yet, so the day they land the rule
 * is already pinned.
 *
 * Lengths are deliberately NOT round multiples of a stick, and legs differ from
 * each other, so a rule that works per network but not per leg cannot pass by
 * accident (CLAUDE.md § "a fixture shaped like its container").
 */
import { describe, expect, it } from "vitest";
import {
  countFittings,
  fittingQtyText,
  legFromRun,
  nodeDegrees,
  sticksFor,
  strapsFor,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import type { EndVertical } from "../shared/takeoffHeights";

const EMT: RacewayFittingSpec = {
  name: '1/2" EMT',
  stickLengthFeet: 10,
  stickJoint: "coupling",
  strapSpacingFeet: 10,
  strapFromBoxFeet: 3,
  lbHubsTakeConnectors: true,
  teeCoverIncluded: false,
};

function leg(
  id: string,
  from: string,
  to: string,
  feet: number | null,
  feetIsFloor = false
): FittingLeg {
  return {
    id,
    runId: id,
    from,
    to,
    feet,
    feetIsFloor,
    points: [],
    feetPerPoint: null,
    startDrop: { state: "none" },
    endDrop: { state: "none" },
    answers: [],
  };
}

/**
 * These tests are about couplings, connectors and straps; the bend kinds that
 * ride along are covered in runBends.test.ts. Every call goes through here so
 * the bend settings are one decision, not twenty.
 */
const BENDS = {
  method: { method: "factory" as const, why: 'factory elbows from 1-1/4" up' },
  limit: 360,
};
function count(legs: readonly FittingLeg[], spec: RacewayFittingSpec) {
  return countFittings(legs, spec, BENDS, []);
}

/** Both ends level: the verticals a run gets when it carries straight on. */
const LEVEL: EndVertical = {
  counted: false,
  kind: "distribution",
  reason: "level",
};

describe("sticks and couplings", () => {
  it("rounds sticks up and does not add one for a float tail", () => {
    expect(sticksFor(94.2, 10)).toBe(10);
    expect(sticksFor(20, 10)).toBe(2);
    expect(sticksFor(20.0000000001, 10)).toBe(2);
    expect(sticksFor(0, 10)).toBe(0);
  });

  it("is sticks minus one, and says how", () => {
    const c = count([leg("1", "a", "b", 94.2)], EMT).coupling;
    expect(c).toMatchObject({ status: "counted", qty: 9, atLeast: false });
    if (c.status !== "counted") throw new Error();
    expect(c.why).toBe("9 couplings: 10 sticks of 10 ft over 94.2 ft");
  });

  it("counts PER LEG — each leg starts a fresh stick at its box", () => {
    // 15 + 15 as one length would be 3 sticks, 2 couplings. As two legs it is
    // 2 sticks each, 1 coupling each — the box between them is a joint.
    const legs = [leg("1", "a", "b", 15), leg("2", "b", "c", 15)];
    const c = count(legs, EMT).coupling;
    expect(c).toMatchObject({ status: "counted", qty: 2 });
    if (c.status !== "counted") throw new Error();
    expect(c.why).toMatch(/4 sticks of 10 ft over 30 ft, counted per leg/);
  });

  it("belled PVC needs no couplings and still says why", () => {
    const pvc = {
      ...EMT,
      name: '1" PVC Sch 40',
      stickJoint: "belled" as const,
    };
    const c = count([leg("1", "a", "b", 94.2)], pvc).coupling;
    expect(c.status).toBe("included");
    expect(c.why).toBe(
      "10 sticks of 10 ft, belled end — sticks join without couplings"
    );
  });

  it("rigid brings its coupling on the stick", () => {
    const rmc = {
      ...EMT,
      name: '1" rigid conduit',
      stickJoint: "coupling_on_stick" as const,
    };
    const c = count([leg("1", "a", "b", 31)], rmc).coupling;
    expect(c.status).toBe("included");
    expect(c.why).toMatch(/4 sticks of 10 ft — a coupling comes on each stick/);
  });

  it("flex is a coil", () => {
    const fmc = {
      ...EMT,
      stickLengthFeet: null,
      stickJoint: "continuous" as const,
    };
    expect(count([leg("1", "a", "b", 31)], fmc).coupling.status).toBe(
      "included"
    );
  });

  it("refuses to guess without a stick length — never a quiet zero", () => {
    const c = count([leg("1", "a", "b", 31)], {
      ...EMT,
      stickLengthFeet: null,
    }).coupling;
    expect(c.status).toBe("unknown");
    expect(c.why).toMatch(/No stick length set on 1\/2" EMT/);
  });

  it("an unset stick joint reads as plain ends", () => {
    const c = count([leg("1", "a", "b", 31)], {
      ...EMT,
      stickJoint: null,
    }).coupling;
    expect(c).toMatchObject({ status: "counted", qty: 3 });
  });
});

describe("connectors — one per conduit end, explained by what meets where", () => {
  it("is one at each end of a lone run", () => {
    const c = count([leg("1", "run:1:start", "run:1:end", 40)], EMT).connector;
    expect(c).toMatchObject({ status: "counted", qty: 2 });
    expect(c.why).toBe("2 connectors: one per conduit end — 2 line ends");
  });

  it("is two at an in-and-out box", () => {
    const legs = [leg("1", "panel", "box", 40), leg("2", "box", "recep", 12)];
    const c = count(legs, EMT).connector;
    expect(c).toMatchObject({ qty: 4 });
    expect(c.why).toBe(
      "4 connectors: one per conduit end — 2 line ends, 1 in-and-out box (2 each)"
    );
  });

  it("is three where a branch leaves a box — the tee splits its parent", () => {
    // Parent panel → far end, with a branch leaving at a box part-way. The
    // parent is two legs meeting at the tee, and the branch starts there.
    const legs = [
      leg("parent-a", "panel", "tee", 22),
      leg("parent-b", "tee", "far", 37),
      leg("branch", "tee", "recep", 14),
    ];
    expect(nodeDegrees(legs).get("tee")).toBe(3);
    const c = count(legs, EMT).connector;
    expect(c).toMatchObject({ qty: 6 });
    expect(c.why).toMatch(/3 line ends, 1 box where 3 conduits meet/);
  });

  it("needs no scale — an unmeasurable run still has two ends", () => {
    const f = count([leg("1", "a", "b", null)], EMT);
    expect(f.connector).toMatchObject({ status: "counted", qty: 2 });
    expect(f.coupling.status).toBe("unknown");
    expect(f.strap.status).toBe("unknown");
    expect(f.strap.why).toMatch(/no scale/);
  });
});

describe("straps", () => {
  it("puts one near each box and spaces the rest", () => {
    // 25 ft: straps at 3 and 22 near the boxes, 19 ft between → one more.
    expect(strapsFor(25, 10, 3)).toEqual({ nearBox: 2, between: 1 });
    expect(strapsFor(10, 10, 3)).toEqual({ nearBox: 2, between: 0 });
    // 56 ft: 3, 13, 23, 33, 43, 53 — two near the boxes, four between.
    expect(strapsFor(56, 10, 3)).toEqual({ nearBox: 2, between: 4 });
  });

  it("straps a short nipple once, not twice", () => {
    expect(strapsFor(4, 10, 3)).toEqual({ nearBox: 1, between: 0 });
  });

  it("says where each strap came from, drops included", () => {
    const s = count([leg("1", "a", "b", 25)], EMT).strap;
    expect(s).toMatchObject({ status: "counted", qty: 3 });
    expect(s.why).toBe(
      "3 straps: 2 within 3 ft of a box + 1 at 10 ft spacing over 25 ft, drops included"
    );
  });

  it("refuses without a spacing", () => {
    const s = count([leg("1", "a", "b", 25)], {
      ...EMT,
      strapSpacingFeet: null,
    }).strap;
    expect(s.status).toBe("unknown");
    expect(s.why).toMatch(/No strap spacing set/);
  });
});

describe("a partial answer says it is partial", () => {
  it("reads 'at least' when a drop has no height", () => {
    const f = count([leg("1", "a", "b", 31, true)], EMT);
    expect(f.coupling).toMatchObject({
      status: "counted",
      qty: 3,
      atLeast: true,
    });
    expect(fittingQtyText(f.coupling)).toBe("at least 3");
    expect(f.coupling.why).toMatch(/^At least 3 couplings/);
    expect(f.coupling.why).toMatch(/a drop with no height/);
    expect(f.strap.why).toMatch(/^At least/);
  });

  it("counts what it can and names what it could not", () => {
    const f = count([leg("1", "a", "b", 31), leg("2", "c", "d", null)], EMT);
    expect(f.coupling).toMatchObject({
      status: "counted",
      qty: 3,
      atLeast: true,
    });
    expect(f.coupling.why).toMatch(/1 run on a sheet with no scale/);
  });
});

describe("legs from today's runs", () => {
  const base = {
    points: [],
    conduitFeet: 40,
    verticals: { start: LEVEL, end: LEVEL },
    feetPerPoint: null,
    answers: [],
    parentRunId: null,
    startTee: null,
    endTee: null,
  };

  it("gives an unlinked end a node of its own", () => {
    const l = legFromRun({
      ...base,
      id: 7,
      startStampId: null,
      endStampId: null,
    });
    expect(l.from).toBe("run:7:start");
    expect(l.to).toBe("run:7:end");
  });

  it("joins two runs only where they are linked to the SAME stamp", () => {
    const a = legFromRun({
      ...base,
      id: 1,
      startStampId: null,
      endStampId: 50,
    });
    const b = legFromRun({
      ...base,
      id: 2,
      startStampId: 50,
      endStampId: null,
    });
    expect(nodeDegrees([a, b]).get("stamp:50")).toBe(2);
  });

  it("marks the length a floor when an end could not be counted", () => {
    expect(
      legFromRun({
        ...base,
        id: 3,
        startStampId: null,
        endStampId: null,
        verticals: {
          start: LEVEL,
          end: { counted: false, kind: "receptacle", reason: "height-not-set" },
        },
      }).feetIsFloor
    ).toBe(true);
  });

  it("does NOT mark it a floor when both ends are level", () => {
    expect(
      legFromRun({ ...base, id: 4, startStampId: null, endStampId: null })
        .feetIsFloor
    ).toBe(false);
  });
});
