/**
 * A bid's homeruns (`server/homerunsCore.ts`) and how they land on the bid's
 * run-type lines (`groupRunFootage`). Each owner rule in
 * references/homerun-footage-plan.md § 11 has a case here that goes red
 * without it; the calculator's own rules are in homerunFootage.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  bidHomeruns,
  type HomerunBidSettings,
  type HomerunCircuit,
  type HomerunMark,
  type HomerunPanel,
  type HomerunSheet,
} from "./homerunsCore";
import { EMPTY_HEIGHT_CONTEXT, type HeightContext } from "./runVerticals";
import { NO_CEILINGS } from "../shared/ceilingHeights";
import { groupRunFootage } from "./runTypeFootageCore";
import type { DropTypeSpec } from "../shared/groupDrops";
import { wireCircuitsFor } from "../shared/traceMode";
import {
  countFittings,
  type FittingLeg,
  type RacewayFittingSpec,
} from "../shared/runFittings";
import { ELBOW_WORDS } from "../shared/runBends";

const TYPE_ID = 40;
/** 1/4" = 1'-0": 18 page points to the foot. */
const PT_PER_FT = 18;

const conduitType: DropTypeSpec = {
  pathType: "conduit",
  conductorCount: 2,
  groundCount: 1,
  extras: {
    conduitExtraPct: 0.05,
    wireExtraPct: 0.1,
    // Device makeup set on purpose: a homerun must never add it.
    makeupDeviceInches: 18,
    makeupPanelInches: 60,
    makeupByKindInches: null,
  },
};

function heights(over: Partial<HeightContext> = {}): HeightContext {
  return {
    ...EMPTY_HEIGHT_CONTEXT,
    ceilings: { ...NO_CEILINGS, job: 120 },
    layers: {
      company: new Map([["panel", 72]]),
      job: new Map(),
    },
    dropTypeFor: id => (id === TYPE_ID ? conduitType : null),
    ...over,
  };
}

const bid = (over: Partial<HomerunBidSettings> = {}): HomerunBidSettings => ({
  homerunMethod: null,
  homerunAverageFt: null,
  homerunMinimumFt: null,
  homerunRoutingPct: 0.15,
  homerunRunTypeId: TYPE_ID,
  homerunExtraBends: null,
  ...over,
});

const sheet = (over: Partial<HomerunSheet> = {}): HomerunSheet => ({
  id: 1,
  scaleRatio: 48,
  measurable: true,
  homerunMethod: null,
  homerunAverageFt: null,
  homerunMinimumFt: null,
  ...over,
});

/** Panel 2B at the origin of sheet 1. */
const panel = (over: Partial<HomerunPanel> = {}): HomerunPanel => ({
  id: 5,
  name: "2B",
  planSheetId: 1,
  planX: 0,
  planY: 0,
  ...over,
});

/** A receptacle 40 ft along x from the panel. */
const mark = (over: Partial<HomerunMark> = {}): HomerunMark => ({
  id: 900,
  sheetId: 1,
  x: 40 * PT_PER_FT,
  y: 0,
  height: { inches: null, source: null },
  countKind: "receptacle",
  countInches: null,
  ...over,
});

const circuit = (over: Partial<HomerunCircuit> = {}): HomerunCircuit => ({
  id: 70,
  panelId: 5,
  circuitNumber: 1,
  poles: 1,
  homerunOverrideFt: null,
  homerunFromStampId: 900,
  homerunConfirmedAt: null,
  homerunCeilingInches: null,
  ...over,
});

function run(
  over: {
    bid?: Partial<HomerunBidSettings>;
    sheet?: Partial<HomerunSheet>;
    panel?: Partial<HomerunPanel>;
    mark?: Partial<HomerunMark>;
    circuits?: HomerunCircuit[];
    traced?: number[];
    heights?: Partial<HeightContext>;
  } = {}
) {
  const m = mark(over.mark);
  return bidHomeruns({
    bid: bid(over.bid),
    sheets: new Map([[1, sheet(over.sheet)]]),
    panels: [panel(over.panel)],
    circuits: over.circuits ?? [circuit()],
    marks: new Map([[m.id, m]]),
    tracedCircuitIds: new Set(over.traced ?? []),
    heights: heights(over.heights),
  });
}

function computed(result: ReturnType<typeof run>) {
  const f = result.rows[0].footage;
  if (f.state !== "computed") throw new Error(`expected computed: ${f.state}`);
  return f;
}

/** The plan's § 5 example: 40 ft out, 10'-0" ceiling, receptacle 18", panel 6'-0". */
describe("the known answer on the bid line", () => {
  it("40 + 8.5 + 4 = 52.5 ft; wire 52.5 × 1.25 + 5 per wire, × 3", () => {
    const r = run();
    expect(computed(r).pieces.installedFt).toBeCloseTo(52.5, 6);
    const line = r.entries[0].line;
    expect(line.homerunFeet).toBeCloseTo(52.5, 6);
    expect(line.wireBoughtFeet).toBeCloseTo(3 * (52.5 * 1.25 + 5), 6);
    expect(line.conduitBoughtFeet).toBeCloseTo(52.5 * 1.2, 6);
  });
});

describe("method per bid, Measured by default (plan § 3)", () => {
  it("nothing set is Measured", () => {
    expect(run().rows[0].method.method).toBe("measured");
  });

  it("the bid's Average is used — and needs no panel spot", () => {
    const r = run({
      bid: { homerunMethod: "average", homerunAverageFt: 25 },
      panel: { planSheetId: null, planX: null, planY: null },
    });
    expect(computed(r).pieces.runFt).toBe(25);
  });

  it("a sheet's own method beats the bid's", () => {
    const r = run({
      bid: { homerunMethod: "average", homerunAverageFt: 25 },
      sheet: { homerunMethod: "measuredMin", homerunMinimumFt: 60 },
    });
    expect(r.rows[0].method.methodFrom).toBe("area");
    expect(computed(r).pieces.runFt).toBe(60);
  });

  it("an unknown stored method reads as not set, never as a guess", () => {
    expect(run({ bid: { homerunMethod: "bogus" } }).rows[0].method.method).toBe(
      "measured"
    );
  });
});

describe("no number without a panel spot or a scale", () => {
  it("panel not placed: refused, and nothing on the bid line", () => {
    const r = run({ panel: { planSheetId: null, planX: null, planY: null } });
    expect(r.rows[0].footage).toMatchObject({
      state: "refused",
      reason: "no-panel-spot",
    });
    expect(r.entries).toEqual([]);
  });

  it("panel placed on ANOTHER sheet does not measure this one", () => {
    const r = run({ panel: { planSheetId: 2 } });
    expect(r.rows[0].footage).toMatchObject({ reason: "no-panel-spot" });
  });

  it("no scale: refused", () => {
    const r = run({ sheet: { scaleRatio: null } });
    expect(r.rows[0].footage).toMatchObject({ reason: "no-scale" });
    expect(r.entries).toEqual([]);
  });

  it("a NOT TO SCALE sheet measures nothing", () => {
    const r = run({ sheet: { measurable: false } });
    expect(r.rows[0].footage).toMatchObject({ reason: "no-scale" });
  });

  it("a deleted leaving device: no homerun, under Average too", () => {
    const r = run({
      bid: { homerunMethod: "average", homerunAverageFt: 25 },
      circuits: [circuit({ homerunFromStampId: null })],
    });
    expect(r.rows[0].footage).toMatchObject({ reason: "no-devices" });
    expect(r.entries).toEqual([]);
  });
});

describe("routing and waste ADD; waste is material only (owner Q1)", () => {
  it("bought wire is (L+V) × (1 + 15% + 10%) + makeup, not × 1.15 × 1.10", () => {
    const line = run().entries[0].line;
    expect(line.wireBoughtFeet / 3).toBeCloseTo(52.5 * 1.25 + 5, 6);
    expect(line.wireBoughtFeet / 3).not.toBeCloseTo(52.5 * 1.15 * 1.1 + 5, 2);
  });

  it("installed footage carries routing and NO waste, at any waste", () => {
    const low = run().entries[0].line;
    const high = run({
      heights: {
        dropTypeFor: () => ({
          ...conduitType,
          extras: {
            ...conduitType.extras,
            wireExtraPct: 0.5,
            conduitExtraPct: 0.5,
          },
        }),
      },
    }).entries[0].line;
    expect(high.wireInstalledFeet).toBeCloseTo(low.wireInstalledFeet, 9);
    expect(high.conduitInstalledFeet).toBeCloseTo(52.5 * 1.15, 6);
  });

  it("routing NULL on the bid applies nothing — the starter is not used", () => {
    const r = run({ bid: { homerunRoutingPct: null } });
    expect(r.routing).toEqual({ pct: 0, applied: false });
    expect(r.entries[0].line.conduitInstalledFeet).toBeCloseTo(52.5, 6);
  });
});

describe("makeup at the PANEL end only (owner Q2)", () => {
  it("one 5 ft tail per wire, never the 18 in device makeup", () => {
    const line = run().entries[0].line;
    expect(line.makeupFeet).toBeCloseTo(3 * 5, 9);
  });

  it("no makeup on the conduit", () => {
    const line = run().entries[0].line;
    expect(line.conduitBoughtFeet).toBeCloseTo(52.5 * 1.2, 9);
  });
});

describe("unconfirmed homeruns COUNT (owner Q3)", () => {
  it("land on the bid line and are tallied as unconfirmed", () => {
    const r = run({
      circuits: [
        circuit(),
        circuit({ id: 71, circuitNumber: 3, homerunConfirmedAt: new Date() }),
      ],
    });
    expect(r.entries.map(e => e.confirmed)).toEqual([false, true]);
    const row = footageRow(r.entries);
    expect(row.homerunCount).toBe(2);
    expect(row.homerunUnconfirmedCount).toBe(1);
    expect(row.homerunFeet).toBeCloseTo(105, 6);
    expect(row.insulatedBoughtFeet + row.groundBoughtFeet).toBeCloseTo(
      2 * 3 * (52.5 * 1.25 + 5),
      1
    );
  });
});

describe("what keeps a homerun off the bid", () => {
  it("a traced homerun replaces the computed one (plan § 2)", () => {
    const r = run({ traced: [70] });
    expect(r.rows[0].footage).toEqual({ state: "traced" });
    expect(r.entries).toEqual([]);
  });

  it("no homerun run type: computed on screen, nothing on a line", () => {
    const r = run({ bid: { homerunRunTypeId: null } });
    expect(r.rows[0].footage.state).toBe("computed");
    expect(r.entries).toEqual([]);
    expect(r.type).toBeNull();
  });

  it("a type with no conductor count: conduit counts, wire does not", () => {
    const r = run({
      heights: {
        dropTypeFor: () => ({ ...conduitType, conductorCount: null }),
      },
    });
    const line = r.entries[0].line;
    expect(line.wireNotCounted).toBe(true);
    expect(line.wireBoughtFeet).toBe(0);
    expect(line.conduitBoughtFeet).toBeGreaterThan(0);
  });
});

describe("ceiling: homerun → sheet → job", () => {
  it("a homerun's own ceiling beats the sheet's", () => {
    const r = run({
      heights: {
        ceilings: { ...NO_CEILINGS, job: 120, sheets: new Map([[1, 144]]) },
      },
      circuits: [circuit({ homerunCeilingInches: 216 })],
    });
    expect(r.rows[0].ceiling).toEqual({ inches: 216, source: "homerun" });
  });

  it("the sheet's beats the job's", () => {
    const r = run({
      heights: {
        ceilings: { ...NO_CEILINGS, job: 120, sheets: new Map([[1, 144]]) },
      },
    });
    expect(r.rows[0].ceiling).toEqual({ inches: 144, source: "sheet" });
  });

  it("no ceiling anywhere: no drops, named — never a zero drop", () => {
    const r = run({ heights: { ceilings: NO_CEILINGS } });
    const f = computed(r);
    expect(f.pieces.upDrop).toMatchObject({
      counted: false,
      reason: "no-distribution-height",
    });
    expect(f.pieces.installedFt).toBeCloseTo(40, 6);
  });
});

/**
 * COUPLINGS, CONNECTORS AND STRAPS (owner, 2026-10-07): a homerun adds what
 * a run of its type adds, by the same rules and the same raceway settings
 * — never a rate of its own. So each case compares against a TRACED leg of
 * the same length counted by the same `countFittings`.
 */
describe("homerun fittings: the same as a run of that type", () => {
  const EMT: RacewayFittingSpec = {
    name: '1/2" EMT',
    stickLengthFeet: 10,
    stickJoint: "coupling",
    strapSpacingFeet: 10,
    strapFromBoxFeet: 3,
    lbHubsTakeConnectors: true,
    teeCoverIncluded: false,
  };
  const BENDS = {
    method: { method: "factory" as const, why: "factory elbows" },
    limit: 360,
    mergeWithinFeet: 3,
    words: ELBOW_WORDS,
  };
  const traced = (feet: number, feetIsFloor = false): FittingLeg => ({
    id: "run:1",
    runId: "run:1",
    from: "a",
    to: "b",
    feet,
    feetIsFloor,
    points: [],
    feetPerPoint: null,
    startDrop: { state: "none" },
    endDrop: { state: "none" },
    answers: [],
  });
  const qty = (c: { status: string; qty?: number }) =>
    c.status === "counted" ? c.qty : null;

  it("one leg per homerun, on its run + drops with routing, no waste", () => {
    const row = footageRow(run().entries);
    expect(row.legs).toHaveLength(1);
    // (40 + 8.5 + 4) × 1.15 = 60.375 — the routed pipe actually installed.
    expect(row.legs[0].feet).toBeCloseTo(60.375, 1);
  });

  it("couplings, connectors and straps equal a traced 60.38 ft run's", () => {
    const row = footageRow(run().entries);
    const fromHomerun = countFittings(row.legs, EMT, BENDS, []);
    const fromRun = countFittings([traced(60.38)], EMT, BENDS, []);
    expect(qty(fromHomerun.coupling)).toBe(qty(fromRun.coupling));
    expect(qty(fromHomerun.connector)).toBe(qty(fromRun.connector));
    expect(qty(fromHomerun.strap)).toBe(qty(fromRun.strap));
    // 7 sticks → 6 couplings; 2 ends → 2 connectors; 2 + 5 straps.
    expect(qty(fromHomerun.coupling)).toBe(6);
    expect(qty(fromHomerun.connector)).toBe(2);
    expect(qty(fromHomerun.strap)).toBe(7);
  });

  it("two homeruns are two legs: their ends never merge into one box", () => {
    const row = footageRow(
      run({
        circuits: [circuit(), circuit({ id: 71, circuitNumber: 3 })],
      }).entries
    );
    expect(row.legs).toHaveLength(2);
    expect(qty(countFittings(row.legs, EMT, BENDS, []).connector)).toBe(4);
  });

  /*
    BENDS (owner, 2026-10-07). This said "no elbows are counted for a
    homerun" until then; the owner approved: a 90 at each counted drop, and
    the bid's "extra bends per homerun" for its corners, starter 1.
  */
  it("bends: a 90 at each counted drop + 1 unconfirmed corner = 3", () => {
    const row = footageRow(run().entries);
    const elbows = countFittings(row.legs, EMT, BENDS, []).elbow90;
    expect(qty(elbows)).toBe(3);
    expect(elbows.why).toMatch(
      /2 drops \+ 1 homerun corner set on the bid \(not confirmed\)/
    );
  });

  it("no drop bend where the drop is not counted", () => {
    const row = footageRow(
      run({ heights: { layers: { company: new Map(), job: new Map() } } })
        .entries
    );
    // No panel height: the panel drop is not counted, so no bend there.
    expect(qty(countFittings(row.legs, EMT, BENDS, []).elbow90)).toBe(2);
  });

  it("a SET number of corners is used and said as set", () => {
    const row = footageRow(run({ bid: { homerunExtraBends: 2 } }).entries);
    const elbows = countFittings(row.legs, EMT, BENDS, []).elbow90;
    expect(qty(elbows)).toBe(4);
    expect(elbows.why).not.toMatch(/not confirmed/);
  });

  it("field bends on a small raceway: the same rule a traced run uses", () => {
    const row = footageRow(run().entries);
    const counts = countFittings(
      row.legs,
      EMT,
      {
        ...BENDS,
        method: {
          method: "field" as const,
          why: 'bent in the field below 1-1/4"',
        },
      },
      []
    );
    expect(qty(counts.fieldBend)).toBe(3);
    expect(counts.elbow90.status).toBe("included");
  });

  it("an uncounted drop makes every count 'at least'", () => {
    const row = footageRow(run({ heights: { ceilings: NO_CEILINGS } }).entries);
    expect(row.legs[0].feetIsFloor).toBe(true);
    const strap = countFittings(row.legs, EMT, BENDS, []).strap;
    expect(strap.status === "counted" && strap.atLeast).toBe(true);
  });

  it("a cable homerun is a cable leg: connectors and straps, no couplings", () => {
    const row = footageRow(
      run({
        heights: {
          dropTypeFor: () => ({ ...conduitType, pathType: "cable" }),
        },
      }).entries
    );
    expect(row.legs).toHaveLength(0);
    expect(row.cableLegs).toHaveLength(1);
  });

  it("a refused homerun adds no fittings", () => {
    const row = footageRow(
      run({
        circuits: [circuit(), circuit({ id: 71, circuitNumber: 3 })],
        panel: { planSheetId: null, planX: null, planY: null },
      }).entries
    );
    expect(row).toBeUndefined();
  });
});

function footageRow(entries: ReturnType<typeof run>["entries"]) {
  return groupRunFootage({
    runs: [],
    circuitsByRun: wireCircuitsFor({
      runs: [],
      stored: [],
      typeFor: () => null,
    }),
    scales: new Map(),
    heights: EMPTY_HEIGHT_CONTEXT,
    pullPointAnswersByRun: new Map(),
    teesById: new Map(),
    markDrops: [],
    homeruns: entries,
  }).get(TYPE_ID)!;
}
