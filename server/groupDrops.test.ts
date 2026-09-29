/**
 * VERTICALS ON MARKS — shared/groupDrops.ts, no database.
 * references/track-b-held-migrations-plan.md § 3.
 *
 * Each rule here is one a tidy-up could remove, and each test goes red if it
 * does:
 *   - nothing is counted until a group asks for a drop;
 *   - a mark a run end CLAIMS carries no drop of its own (the one double-count
 *     rule), while one merely NEAR an unlinked end is flagged, not dropped;
 *   - wire extra applies to a drop, conduit extra never does (§ 7.1), and
 *     makeup is at the device end only — once per wire, or once in cable feet;
 *   - a mark on a sheet with no scale still counts;
 *   - a group's own height beats its type's.
 */
import { describe, expect, it } from "vitest";
import {
  groupDrops,
  markDropEntries,
  type DropGroup,
  type DropMark,
  type DropRunEnd,
  type DropTypeSpec,
} from "../shared/groupDrops";
import { NO_EXTRAS_CONTEXT, type ExtrasContext } from "../shared/runExtras";
import { totalQuantities } from "../shared/takeoffQuantities";

const RATIO = 48; // 1/4" = 1'-0": 1 page point = 48/72 real inches

const EMT_2_AND_GROUND: DropTypeSpec = {
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
};
const MC_CABLE: DropTypeSpec = { ...EMT_2_AND_GROUND, pathType: "cable" };

const group = (over: Partial<DropGroup> = {}): DropGroup => ({
  id: 1,
  dropKind: "receptacle",
  dropHeightInches: null,
  dropRunTypeId: 7,
  ...over,
});

/** `n` marks of group 1 on sheet 1, far apart, far from any run. */
const marks = (n: number, sheetId = 1): DropMark[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    groupId: 1,
    sheetId,
    x: 5000 + i * 1000,
    y: 5000,
  }));

function drops(input: {
  groups?: DropGroup[];
  marks?: DropMark[];
  runs?: DropRunEnd[];
  companyInches?: number | null;
  extras?: ExtrasContext;
  type?: DropTypeSpec | null;
  ratio?: number | null;
}) {
  return groupDrops({
    groups: input.groups ?? [group()],
    marks: input.marks ?? marks(12),
    runs: input.runs ?? [],
    heights: {
      // Receptacle ships at 1'-6"; the run height is set here.
      layers: { company: new Map(), job: new Map() },
      companyInches:
        input.companyInches === undefined ? 120 : input.companyInches,
      jobInches: null,
    },
    extras: input.extras ?? NO_EXTRAS_CONTEXT,
    typeFor: () => (input.type === undefined ? EMT_2_AND_GROUND : input.type),
    ratioFor: () => (input.ratio === undefined ? RATIO : input.ratio),
  });
}

describe("nothing is counted until a group asks for a drop", () => {
  it("counts nothing for a group with no drop kind, and says nothing", () => {
    const [d] = drops({ groups: [group({ dropKind: null })] });
    expect(d.status).toBe("not-answered");
    expect(d.perDrop).toBeNull();
    expect(d.reason).toBeNull();
    expect(markDropEntries([d])).toEqual([]);
  });

  it("treats 'at run height' as an answer with no drop", () => {
    const [d] = drops({ groups: [group({ dropKind: "distribution" })] });
    expect(d.status).toBe("level");
    expect(d.perDrop).toBeNull();
  });
});

describe("thirty receptacles at 18 inches under a 10 ft run height", () => {
  it("drops 8.50 ft each, in pipe and in every wire", () => {
    const [d] = drops({ marks: marks(30) });
    expect(d.status).toBe("counted");
    expect(d.perDropFeet).toBe(8.5);
    const [entry] = markDropEntries([d]);
    expect(entry.count).toBe(30);
    // § 2.4's own example: 255 ft of pipe.
    const totals = totalQuantities([], markDropEntries([d]));
    expect(totals.conduitBoughtFeet).toBe(255);
    // Three wires down each drop (2 + a ground).
    expect(totals.wireBoughtFeet).toBe(765);
    expect(totals.wireGroundBoughtFeet).toBe(255);
    expect(totals.markDropCount).toBe(30);
    expect(totals.markDropFeet).toBe(255);
  });

  it("uses the group's own height over the type's", () => {
    const [d] = drops({ groups: [group({ dropHeightInches: 48 })] });
    expect(d.perDropFeet).toBe(6); // 10'-0" down to 4'-0"
  });
});

describe("the double-count rule: a vertical is the run's OR the mark's", () => {
  it("leaves out a mark a run end has claimed", () => {
    const claimed: DropRunEnd = {
      sheetId: 1,
      points: [
        { x: 0, y: 0 },
        { x: 5000, y: 5000 },
      ],
      startStampId: null,
      endStampId: 100, // the first mark
    };
    const [d] = drops({ marks: marks(3), runs: [claimed] });
    expect(d.claimedCount).toBe(1);
    expect(d.countedMarks.map(m => m.id)).toEqual([101, 102]);
  });

  it("FLAGS a mark near an unlinked run end, and still counts it", () => {
    // 10 points from the mark at 1/4" scale is under 7 real inches.
    const near: DropRunEnd = {
      sheetId: 1,
      points: [
        { x: 0, y: 0 },
        { x: 5010, y: 5000 },
      ],
      startStampId: null,
      endStampId: null,
    };
    const [d] = drops({ marks: marks(3), runs: [near] });
    expect(d.mayDoubleCount).toBe(1);
    expect(d.countedMarks).toHaveLength(3); // flagged, not guessed away
  });

  it("does not flag by distance on a sheet with no scale", () => {
    const near: DropRunEnd = {
      sheetId: 1,
      points: [{ x: 5010, y: 5000 }],
      startStampId: null,
      endStampId: null,
    };
    const [d] = drops({ marks: marks(3), runs: [near], ratio: null });
    expect(d.mayDoubleCount).toBe(0);
    // ...and a mark on a sheet with no scale still COUNTS: its drop is two
    // heights, not a measurement.
    expect(d.status).toBe("counted");
    expect(d.countedMarks).toHaveLength(3);
  });
});

describe("extras on a drop follow § 7.1", () => {
  const accepted: ExtrasContext = {
    ...NO_EXTRAS_CONTEXT,
    company: {
      conduitExtraPct: null,
      wireExtraPct: null,
      makeupDeviceInches: null,
      makeupPanelInches: null,
      accepted: true, // 5% conduit, 10% wire, 18 in makeup at a box
    },
  };

  it("adds wire extra and makeup at the device, never conduit extra", () => {
    const [d] = drops({ marks: marks(10), extras: accepted });
    const per = d.perDrop!;
    expect(per.conduitBoughtFeet).toBe(8.5); // no 5% on a drop
    // Three wires: 3 × 8.5 laid + 3 × 1.5 ft makeup = 30.00 installed.
    expect(per.wireInstalledFeet).toBe(30);
    expect(per.wireExtraFeet).toBe(2.55); // 10% of 25.50
    expect(per.wireBoughtFeet).toBe(32.55);
  });

  it("gives a cable drop one tail of cable, not one per conductor (Q3)", () => {
    const [d] = drops({ marks: marks(1), extras: accepted, type: MC_CABLE });
    const per = d.perDrop!;
    expect(per.makeupFeet).toBe(1.5);
    expect(per.cableInstalledFeet).toBe(10);
    expect(per.cableBoughtFeet).toBe(10.85);
    expect(per.wireBoughtFeet).toBe(0);
  });
});

describe("a drop that is wanted but cannot be counted says why", () => {
  it("names a missing run type", () => {
    const [d] = drops({ type: null });
    expect(d.status).toBe("no-type");
    expect(d.reason).toMatch(/made of/);
    expect(markDropEntries([d])).toEqual([]);
  });

  it("names a missing run height", () => {
    const [d] = drops({ companyInches: null });
    expect(d.status).toBe("no-height");
    expect(d.reason).toMatch(/run height/);
  });
});

describe("the export splits drops by sheet", () => {
  it("gives one entry per sheet with that sheet's marks", () => {
    const [d] = drops({
      marks: [
        ...marks(2, 1),
        ...marks(3, 2).map((m, i) => ({ ...m, id: 200 + i })),
      ],
    });
    const entries = markDropEntries([d]);
    expect(entries.map(e => [e.sheetId, e.count]).sort()).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });
});
