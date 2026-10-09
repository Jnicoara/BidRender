/**
 * Grouping a bid's run ROWS into legs per type — the one place a branched run
 * (D20) is turned from stored rows into what the fitting count reads.
 *
 * Pure: rows in, no database. Shaped like `getRunsForBid` returns them, so a
 * column this reads and the loader forgets is a compile error here too.
 */
import { describe, expect, it } from "vitest";
import {
  groupRunFootage,
  type GroupableRun,
  type SheetScale,
} from "./runTypeFootageCore";
import { EMPTY_HEIGHT_CONTEXT } from "./runVerticals";
import { nodeDegrees } from "../shared/runFittings";
import type { TeeRef } from "../shared/runNetwork";
import { wireCircuitsFor } from "../shared/traceMode";

const SHEET = 1;
const scales = new Map<number, SheetScale>([
  [SHEET, { scaleRatio: 48, notToScale: false, scaleSource: "manual" }],
]);

function run(over: Partial<GroupableRun> & { id: number }): GroupableRun {
  return {
    sheetId: SHEET,
    runTypeId: 7,
    pathType: "conduit",
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ],
    typedLengthInches: null,
    isSuggestion: false,
    branchWiring: null,
    startKind: null,
    endKind: null,
    startHeightInches: null,
    endHeightInches: null,
    distributionHeightInches: null,
    startStampId: null,
    endStampId: null,
    parentRunId: null,
    startTeeId: null,
    endTeeId: null,
    traceMode: null,
    runsAt: null,
    conduitExtraPct: null,
    wireExtraPct: null,
    makeupDeviceInches: null,
    makeupPanelInches: null,
    makeupByKindInches: null,
    ...over,
  };
}

const TEE: TeeRef = { id: 30, fitting: "box", stampId: null };

/** A type as the quantity circuit reads it: three #12 and a ground. */
const TYPE_7 = {
  label: '3/4" EMT, 3 #12 + ground',
  pathType: "conduit",
  conductorCount: 3,
  groundCount: 1,
};

function group(
  runs: GroupableRun[],
  tees: TeeRef[],
  stored: Parameters<typeof wireCircuitsFor>[0]["stored"] = []
) {
  return groupRunFootage({
    runs,
    circuitsByRun: wireCircuitsFor({
      runs,
      stored,
      typeFor: id => (id === 7 ? TYPE_7 : null),
    }),
    scales,
    heights: EMPTY_HEIGHT_CONTEXT,
    pullPointAnswersByRun: new Map(),
    teesById: new Map(tees.map(t => [t.id, t])),
    markDrops: [],
    homeruns: [],
  });
}

describe("a branched run as legs", () => {
  const rows = [
    run({ id: 100, endTeeId: 30 }),
    run({
      id: 101,
      parentRunId: 100,
      startTeeId: 30,
      points: [
        { x: 400, y: 0 },
        { x: 700, y: 0 },
      ],
    }),
    run({
      id: 102,
      parentRunId: 100,
      startTeeId: 30,
      points: [
        { x: 400, y: 0 },
        { x: 400, y: 350 },
      ],
    }),
  ];

  it("meets three conduit ends at the tee, all one run", () => {
    const row = group(rows, [TEE]).get(7)!;
    expect(row.legs).toHaveLength(3);
    expect(nodeDegrees(row.legs).get("tee:30")).toBe(3);
    expect(new Set(row.legs.map(l => l.runId))).toEqual(new Set(["100"]));
    expect(row.tees).toEqual([TEE]);
  });

  it("measures each leg's own points — the jump between legs is not pipe", () => {
    // Two legs 50 ft apart with nothing joining them.
    const apart = group(
      [
        run({ id: 200 }),
        run({
          id: 201,
          parentRunId: 200,
          points: [
            { x: 1300, y: 0 },
            { x: 1700, y: 0 },
          ],
        }),
      ],
      []
    ).get(7)!;
    // 400 points at ratio 48 is 22.22 ft, twice.
    expect(apart.conduitBoughtFeet).toBeCloseTo(44.44, 2);
  });

  it("lists the tee in BOTH groups when the branch is another type (route only)", () => {
    const mixed = rows.map(r => (r.id === 102 ? { ...r, runTypeId: 8 } : r));
    const byType = group(mixed, [TEE]);
    expect(byType.get(7)!.tees).toEqual([TEE]);
    expect(byType.get(8)!.tees).toEqual([TEE]);
  });
});

describe("a quantity trace lands in the same bucket (D21)", () => {
  // Two quantity legs 50 ft apart, and a route run of the same type.
  const quantity = [
    run({ id: 300, traceMode: "quantity" }),
    run({
      id: 301,
      parentRunId: 300,
      traceMode: "quantity",
      points: [
        { x: 1300, y: 0 },
        { x: 1700, y: 0 },
      ],
    }),
  ];
  const route = run({ id: 400, traceMode: "route" });

  it("pulls its type's wire with no circuit rows behind it", () => {
    const row = group(quantity, []).get(7)!;
    // 22.22 ft a leg. Three #12 each, one shared ground.
    expect(row.conduitBoughtFeet).toBeCloseTo(44.44, 2);
    expect(row.insulatedBoughtFeet).toBeCloseTo(133.32, 2);
    expect(row.groundBoughtFeet).toBeCloseTo(44.44, 2);
  });

  it("ignores circuit rows stored before it became a quantity trace", () => {
    // A twelve-conductor circuit left over from route mode must not be read.
    const stored = [
      {
        runId: 300,
        name: "old",
        conductorCount: 12,
        groundCount: 0,
        separateGround: null,
      },
    ];
    const row = group(quantity, [], stored).get(7)!;
    expect(row.insulatedBoughtFeet).toBeCloseTo(133.32, 2);
  });

  it("shares one line with a route run of the type, and says how much is quantity", () => {
    const row = group([...quantity, route], []).get(7)!;
    expect(row.conduitBoughtFeet).toBeCloseTo(66.66, 2);
    expect(row.quantityFeet).toBeCloseTo(44.44, 2);
  });

  it("is never asked whose wire it is, so a stored D18 answer cannot drop it", () => {
    const answered = quantity.map(r => ({ ...r, branchWiring: true }));
    const row = group(answered, []).get(7)!;
    expect(row.branchCount).toBe(0);
    expect(row.unansweredCount).toBe(0);
    expect(row.conduitBoughtFeet).toBeCloseTo(44.44, 2);
  });

  it("takes a connector only at an approved drop — none on bare legs", () => {
    const row = group(quantity, []).get(7)!;
    expect(row.legs.every(l => l.from.startsWith("open:"))).toBe(true);
    const approved = group(
      [{ ...quantity[0], endKind: "receptacle" }, quantity[1]],
      []
    ).get(7)!;
    expect(approved.legs.find(l => l.id === "300")!.to).toBe("run:300:end");
  });
});

/*
  D18 moves the WIRE between devices onto the devices' whips. It says nothing
  about the pipe: every whip the starters ship is NM-B cable, and nothing on a
  device prices EMT. So a conduit run answered "branch wiring" keeps its pipe,
  its fittings and its vertical pipe on the bid, and loses only the wire.
  Until 2026-09-27 it lost all of it — found by reading, not reported.
*/
describe("a run answered branch wiring (D18)", () => {
  const stored = [
    {
      runId: 500,
      name: "1",
      conductorCount: 2,
      groundCount: 1,
      separateGround: null,
    },
  ];
  const ends = { startKind: "receptacle", endKind: "receptacle" };

  it("keeps a conduit run's pipe and fittings, and drops only its wire", () => {
    const homerun = group(
      [run({ id: 500, ...ends, branchWiring: false })],
      [],
      stored
    ).get(7)!;
    const branch = group(
      [run({ id: 500, ...ends, branchWiring: true })],
      [],
      stored
    ).get(7)!;

    expect(homerun.conduitBoughtFeet).toBeCloseTo(22.22, 2);
    expect(homerun.insulatedBoughtFeet).toBeGreaterThan(0);

    expect(branch.branchCount).toBe(1);
    expect(branch.conduitBoughtFeet).toBe(homerun.conduitBoughtFeet);
    expect(branch.verticalFeet).toBe(homerun.verticalFeet);
    expect(branch.legs).toEqual(homerun.legs);
    expect(branch.insulatedBoughtFeet).toBe(0);
    expect(branch.groundBoughtFeet).toBe(0);
  });

  it("still leaves a cable run out entirely — the cable IS the whip", () => {
    const cable = group(
      [run({ id: 500, ...ends, pathType: "cable", branchWiring: true })],
      [],
      stored
    ).get(7)!;
    expect(cable.branchCount).toBe(1);
    expect(cable.cableBoughtFeet).toBe(0);
    expect(cable.conduitBoughtFeet).toBe(0);
  });

  it("still says why when the pipe of a branch run cannot be measured", () => {
    const unscaled = group(
      [run({ id: 500, ...ends, sheetId: 99, branchWiring: true })],
      [],
      stored
    ).get(7)!;
    expect(unscaled.unmeasurableCount).toBe(1);
    expect(unscaled.legs).toHaveLength(1);
  });
});

describe("the runs a type's EXTRAS are counted from (per-foot plan § 3a)", () => {
  it("carries each counted run's flat and vertical feet and its raceway waste", () => {
    const row = group(
      [
        run({ id: 600, conduitExtraPct: "0.1000" }),
        // On a sheet with no scale: here, but unmeasured — never 0.
        run({ id: 601, sheetId: 99 }),
        // A suggestion is not on the bid, so not under the tape either.
        run({ id: 602, isSuggestion: true }),
      ],
      []
    ).get(7)!;
    expect(row.extraRuns).toHaveLength(2);
    expect(row.extraRuns[0]).toEqual({
      quantities: { runFeet: row.conduitInstalledFeet, verticalFeet: 0 },
      wastePct: 0.1,
    });
    expect(row.extraRuns[1]).toEqual({ quantities: null, wastePct: 0 });
  });

  it("adds a drop from a counted mark as VERTICAL only, with its own waste", () => {
    const row = groupRunFootage({
      runs: [],
      circuitsByRun: wireCircuitsFor({
        runs: [],
        stored: [],
        typeFor: () => null,
      }),
      scales,
      heights: EMPTY_HEIGHT_CONTEXT,
      pullPointAnswersByRun: new Map(),
      teesById: new Map(),
      markDrops: [
        {
          runTypeId: 7,
          sheetId: SHEET,
          count: 2,
          perDrop: {
            pathType: "conduit",
            dropFeet: 3,
            conduitInstalledFeet: 3,
            conduitBoughtFeet: 3.15,
            cableInstalledFeet: 0,
            cableBoughtFeet: 0,
            wireInstalledFeet: 0,
            wireBoughtFeet: 0,
            groundInstalledFeet: 0,
            groundBoughtFeet: 0,
            conduitExtraFeet: 0.15,
            wireExtraFeet: 0,
            makeupFeet: 0,
          },
        },
      ],
      homeruns: [],
    }).get(7)!;
    expect(row.extraRuns).toHaveLength(1);
    expect(row.extraRuns[0].quantities).toEqual({
      runFeet: 0,
      verticalFeet: 6,
    });
    expect(row.extraRuns[0].wastePct).toBeCloseTo(0.05, 10);
  });
});
