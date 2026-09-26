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
    ...over,
  };
}

const TEE: TeeRef = { id: 30, fitting: "box", stampId: null };

function group(runs: GroupableRun[], tees: TeeRef[]) {
  return groupRunFootage({
    runs,
    circuitsByRun: new Map(),
    scales,
    heights: EMPTY_HEIGHT_CONTEXT,
    pullPointAnswersByRun: new Map(),
    teesById: new Map(tees.map(t => [t.id, t])),
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
    expect(apart.conduitFeet).toBeCloseTo(44.44, 2);
  });

  it("lists the tee in BOTH groups when the branch is another type", () => {
    const mixed = rows.map(r => (r.id === 102 ? { ...r, runTypeId: 8 } : r));
    const byType = group(mixed, [TEE]);
    expect(byType.get(7)!.tees).toEqual([TEE]);
    expect(byType.get(8)!.tees).toEqual([TEE]);
  });
});
