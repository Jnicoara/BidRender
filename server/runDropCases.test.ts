/**
 * DROPS ON REGULAR RUNS — the owner's four cases, and the ceiling every box
 * reads (2026-10-07). Job ceiling 10'-0"; receptacle 1'-6"; switch 4'-0".
 *
 *   a  through a box (down to it and back up)  TWO drops there
 *   b  ends at a box                            ONE drop
 *   c  a branch to a switch                     its own drop; none at the tee
 *   d  box to box at the same height            NO drops — flat length only
 *
 * And the ceiling at each END: the run's own → the height area the box sits
 * in (smaller outline wins) → the sheet → the job → the company
 * (shared/ceilingHeights.ts). Before 2026-10-07 runs read job → company only.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_HEIGHT_CONTEXT,
  verticalsForRunRow,
  type HeightContext,
  type RunEnds,
} from "./runVerticals";
import { NO_CEILINGS, type CeilingLayers } from "../shared/ceilingHeights";
import { DISTRIBUTION_KIND } from "../shared/takeoffHeights";
import { groupDrops } from "../shared/groupDrops";
import { NO_EXTRAS_CONTEXT } from "../shared/runExtras";

const FT = 18; // page points per foot at 1/4" = 1'-0"

function context(ceilings: Partial<CeilingLayers> = {}): HeightContext {
  return {
    ...EMPTY_HEIGHT_CONTEXT,
    ceilings: { ...NO_CEILINGS, job: 120, ...ceilings },
    layers: { company: new Map(), job: new Map() },
    // Mark 41 is a duplex receptacle, its count dropping to "receptacle".
    markAt: id =>
      id === 41
        ? {
            height: { inches: null, source: null },
            countKind: "receptacle",
            countInches: null,
            status: null,
          }
        : null,
  };
}

/** A run from (0,0) to (40 ft, 0) on sheet 1. */
function run(over: Partial<RunEnds> = {}): RunEnds {
  return {
    sheetId: 1,
    points: [
      { x: 0, y: 0 },
      { x: 40 * FT, y: 0 },
    ],
    startKind: DISTRIBUTION_KIND,
    endKind: "receptacle",
    startHeightInches: null,
    endHeightInches: null,
    distributionHeightInches: null,
    startTeeId: null,
    endTeeId: null,
    traceMode: null,
    startStampId: null,
    endStampId: null,
    ...over,
  };
}

describe("a — through a box is TWO drops there", () => {
  it("the run arriving drops 8.5 ft; the run leaving (linked to the mark) rises 8.5 ft", () => {
    const arriving = verticalsForRunRow(run(), context());
    // The run that leaves started by snapping onto the receptacle's mark
    // (`newRunStart`): its start has no kind and is linked to mark 41.
    const leaving = verticalsForRunRow(
      run({ startKind: null, startStampId: 41 }),
      context()
    );
    expect(arriving.end).toMatchObject({ counted: true, feet: 8.5 });
    expect(leaving.start).toMatchObject({ counted: true, feet: 8.5 });
    // AT THE BOX: before, 8.5 ft (the leaving run's start was "Nothing");
    // after, 8.5 + 8.5 = 17 ft.
    const before = verticalsForRunRow(run(), context()).start;
    expect(before.counted).toBe(false);
  });
});

describe("b — ends at a box is ONE drop", () => {
  it("8.5 ft at the receptacle, nothing at the run-height start", () => {
    const v = verticalsForRunRow(run(), context());
    expect(v.feet).toBe(8.5);
  });
});

describe("c — a switch leg off a tee: its own drop, none at the tee", () => {
  it("6 ft down to the switch; the tee end carries on at run height", () => {
    const v = verticalsForRunRow(
      run({ startKind: null, startTeeId: 9, endKind: "switch" }),
      context()
    );
    expect(v.start.counted).toBe(false);
    // 10'-0" − 4'-0" = 6 ft (the shipped switch height is 48").
    expect(v.end).toMatchObject({ counted: true, feet: 6 });
  });
});

describe("d — box to box at the same height: no drops", () => {
  it("through the ceiling (today, the default): 8.5 + 8.5 = 17 ft", () => {
    const v = verticalsForRunRow(run({ startKind: "receptacle" }), context());
    expect(v.feet).toBe(17);
  });

  it("box to box: 0 ft of drops, and the ends stay receptacles", () => {
    const v = verticalsForRunRow(
      run({ startKind: "receptacle", runsAt: "boxToBox" }),
      context()
    );
    expect(v.feet).toBe(0);
    expect(v.start.kind).toBe("receptacle");
    expect(v.end.kind).toBe("receptacle");
  });

  it("box to box needs no ceiling at all", () => {
    const v = verticalsForRunRow(
      run({ startKind: "receptacle", runsAt: "boxToBox" }),
      context({ job: null })
    );
    expect(v.feet).toBe(0);
    expect(v.end).toMatchObject({ counted: false, reason: "level" });
  });
});

describe("the ceiling at each END of a regular run", () => {
  // An 18'-0" stockroom around the run's END (40 ft, 0); a 9'-0" office
  // drawn around both ends, bigger — the smaller outline must win.
  const stockroom = {
    id: 1,
    sheetId: 1,
    name: "Stockroom",
    ceilingInches: 216,
    outline: [
      { x: 35 * FT, y: -5 * FT },
      { x: 45 * FT, y: -5 * FT },
      { x: 45 * FT, y: 5 * FT },
      { x: 35 * FT, y: 5 * FT },
    ],
  };
  const office = {
    id: 2,
    sheetId: 1,
    name: "Office",
    ceilingInches: 108,
    outline: [
      { x: -10 * FT, y: -10 * FT },
      { x: 60 * FT, y: -10 * FT },
      { x: 60 * FT, y: 10 * FT },
      { x: -10 * FT, y: 10 * FT },
    ],
  };

  it("a box inside an area drops from the area's ceiling: 16.5 ft, not 8.5", () => {
    const v = verticalsForRunRow(run(), context({ areas: [stockroom] }));
    expect(v.end).toMatchObject({ counted: true, feet: 16.5 });
  });

  it("each end reads its own box: the start outside, the end inside", () => {
    const v = verticalsForRunRow(
      run({ startKind: "receptacle" }),
      context({ areas: [stockroom] })
    );
    expect(v.start).toMatchObject({ counted: true, feet: 8.5 });
    expect(v.end).toMatchObject({ counted: true, feet: 16.5 });
  });

  it("two areas: the SMALLER wins even when its ceiling is HIGHER", () => {
    const v = verticalsForRunRow(
      run({ startKind: "receptacle" }),
      context({ areas: [office, stockroom] })
    );
    expect(v.end).toMatchObject({ feet: 16.5 }); // stockroom, 18'-0"
    expect(v.start).toMatchObject({ feet: 7.5 }); // office, 9'-0"
  });

  it("no area: the sheet's ceiling, then the job's", () => {
    expect(
      verticalsForRunRow(run(), context({ sheets: new Map([[1, 144]]) })).end
    ).toMatchObject({ feet: 10.5 });
    expect(verticalsForRunRow(run(), context()).end).toMatchObject({
      feet: 8.5,
    });
  });

  it("the run's own 'This run sits at' beats the area", () => {
    const v = verticalsForRunRow(
      run({ distributionHeightInches: 96 }),
      context({ areas: [stockroom] })
    );
    expect(v.end).toMatchObject({ feet: 6.5 });
  });

  it("count drops read the same rule: a mark in the stockroom drops 16.5 ft", () => {
    const [d] = groupDrops({
      groups: [
        {
          id: 1,
          dropKind: "receptacle",
          dropHeightInches: null,
          dropRunTypeId: 7,
        },
      ],
      marks: [
        {
          id: 1,
          groupId: 1,
          sheetId: 1,
          x: 40 * FT,
          y: 0,
          height: { inches: null, source: null },
          dropExcluded: false,
        },
        {
          id: 2,
          groupId: 1,
          sheetId: 1,
          x: 0,
          y: 0,
          height: { inches: null, source: null },
          dropExcluded: false,
        },
      ],
      runs: [],
      heights: {
        layers: { company: new Map(), job: new Map() },
        ceilings: { ...NO_CEILINGS, job: 120, areas: [stockroom] },
      },
      extras: NO_EXTRAS_CONTEXT,
      typeFor: () => ({
        pathType: "conduit",
        conductorCount: 2,
        groundCount: 1,
        extras: {
          conduitExtraPct: null,
          wireExtraPct: null,
          makeupDeviceInches: null,
          makeupPanelInches: null,
          makeupByKindInches: null,
        },
      }),
      ratioFor: () => 48,
    });
    // Before: two drops of 8.5 = 17 ft. After: 16.5 + 8.5 = 25 ft.
    expect(d.totalDropFeet).toBe(25);
    expect(d.buckets.map(b => b.perDropFeet).sort()).toEqual([16.5, 8.5]);
  });
});
