/**
 * EXTRA AND MAKEUP — the resolution chain and the arithmetic, no database.
 * references/track-b-held-migrations-plan.md § 1; plan-viewer-overhaul.md
 * § 2.2, § 5j, § 7.1.
 *
 * Each block is a rule that has a way of being "simplified" away, and each
 * test is written to go red if it is:
 *
 *   - starters apply NOTHING until accepted (Q1);
 *   - run beats type beats company, and a nearer level beats a named height
 *     type further out (Q10);
 *   - conduit extra is on the FLAT length only, wire extra on flat + vertical;
 *   - makeup is per conductor per END, never a percentage, never on conduit,
 *     and once per end in cable feet on a cable (Q3);
 *   - fittings count INSTALLED pipe, so extra adds no couplings;
 *   - labour is on INSTALLED footage: extra is material only (Q5).
 */
import { describe, expect, it } from "vitest";
import {
  extrasForRun,
  NO_EXTRAS_CONTEXT,
  STARTER_EXTRAS,
  type CompanyExtras,
  type ExtrasContext,
  type ExtrasRow,
  type ExtraSettings,
  type RunExtras,
} from "../shared/runExtras";
import {
  carriesNoExtra,
  quantitiesForRun,
  NO_VERTICALS,
  type RunCircuit,
} from "../shared/takeoffQuantities";
import { verticalsForRun } from "../shared/takeoffHeights";
import { calculateLineItem } from "../shared/pricing";
import { laborQtyOf } from "../shared/lineLaborQty";
import { groupRunFootage, type GroupableRun } from "./runTypeFootageCore";
import { buildHeightContext } from "./runVerticals";
import { wireCircuitsFor } from "../shared/traceMode";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const RATIO = 48; // 1/4" = 1'-0"
/** Page points for a flat length in feet at 1/4" scale. */
const pts = (feet: number) => (feet * 12 * 72) / RATIO;
const run = (feet: number) => ({
  pathType: "conduit" as const,
  points: [
    { x: 0, y: 0 },
    { x: pts(feet), y: 0 },
  ],
  typedLengthInches: null,
});
const cable = (feet: number) => ({ ...run(feet), pathType: "cable" as const });

/** 2 insulated + a shared ground: three conductors in the pipe. */
const TWO_AND_GROUND: RunCircuit[] = [
  { name: "C1", conductorCount: 2, groundCount: 1, separateGround: false },
];

/** A drop at one end from 10'-0" to 1'-6": 8.50 ft. */
const DROP_8_5 = verticalsForRun(
  { kind: "distribution", endInches: null, distributionInches: 120 },
  { kind: "receptacle", endInches: 18, distributionInches: 120 }
);

const extras = (over: Partial<RunExtras> = {}): RunExtras => ({
  conduitPct: 0,
  wirePct: 0,
  makeupStartInches: 0,
  makeupEndInches: 0,
  unset: { conduit: false, wire: false, makeup: false },
  ...over,
});

const NONE: ExtraSettings = {
  conduitExtraPct: null,
  wireExtraPct: null,
  makeupDeviceInches: null,
  makeupPanelInches: null,
  makeupByKindInches: null,
};

const row = (over: Partial<ExtrasRow> = {}): ExtrasRow => ({
  runTypeId: 7,
  traceMode: null,
  startKind: "panel",
  endKind: "receptacle",
  startTeeId: null,
  endTeeId: null,
  conduitExtraPct: null,
  wireExtraPct: null,
  makeupDeviceInches: null,
  makeupPanelInches: null,
  makeupByKindInches: null,
  ...over,
});

const company = (over: Partial<CompanyExtras> = {}): CompanyExtras => ({
  conduitExtraPct: null,
  wireExtraPct: null,
  makeupDeviceInches: null,
  makeupPanelInches: null,
  accepted: false,
  ...over,
});

const ctx = (over: Partial<ExtrasContext> = {}): ExtrasContext => ({
  ...NO_EXTRAS_CONTEXT,
  ...over,
});

// ── Resolution ───────────────────────────────────────────────────────────────

describe("starters apply nothing until accepted (Q1)", () => {
  it("resolves an unaccepted company to unset, zero effect, flagged", () => {
    const got = extrasForRun(row(), ctx({ company: company() }));
    expect(got.conduitPct).toBe(0);
    expect(got.wirePct).toBe(0);
    expect(got.makeupStartInches).toBe(0);
    expect(got.unset).toEqual({ conduit: true, wire: true, makeup: true });
  });

  it("applies the dated starters once accepted: 5%, 10%, 18 in, 5 ft", () => {
    const got = extrasForRun(
      row(),
      ctx({ company: company({ accepted: true }) })
    );
    expect(got.conduitPct).toBe(0.05);
    expect(got.wirePct).toBe(0.1);
    // Start at a panel, end at a receptacle (owner's Q2 figures).
    expect(got.makeupStartInches).toBe(60);
    expect(got.makeupEndInches).toBe(18);
    expect(STARTER_EXTRAS.makeupDeviceInches).toBe(18);
    expect(STARTER_EXTRAS.makeupPanelInches).toBe(60);
  });
});

describe("the chain: run → type → company → starter", () => {
  const accepted = company({ accepted: true, wireExtraPct: 0.12 });

  it("uses the company's own figure over the starter", () => {
    expect(extrasForRun(row(), ctx({ company: accepted })).wirePct).toBe(0.12);
  });

  it("uses the run type's figure over the company's", () => {
    const got = extrasForRun(
      row(),
      ctx({
        company: accepted,
        typeFor: () => ({ ...NONE, wireExtraPct: 0.15 }),
      })
    );
    expect(got.wirePct).toBe(0.15);
  });

  it("uses the run's own figure over the type's", () => {
    const got = extrasForRun(
      row({ wireExtraPct: "0.2000" }), // as MySQL returns a DECIMAL
      ctx({
        company: accepted,
        typeFor: () => ({ ...NONE, wireExtraPct: 0.15 }),
      })
    );
    expect(got.wirePct).toBe(0.2);
  });

  it("treats a deliberate 0 as an answer, not as unset", () => {
    const got = extrasForRun(
      row({ conduitExtraPct: 0 }),
      ctx({ company: company() })
    );
    expect(got.conduitPct).toBe(0);
    expect(got.unset.conduit).toBe(false);
  });
});

describe("makeup at a company's own height type (Q4, Q10)", () => {
  const switchboard = new Map([
    ["switchboard", { makeupAt: "panel" as const, makeupInches: 96 }],
  ]);
  const at = (type: ExtraSettings | null) =>
    extrasForRun(
      row({ endKind: "switchboard" }),
      ctx({
        company: company({ accepted: true }),
        kinds: switchboard,
        typeFor: () => type,
      })
    ).makeupEndInches;

  it("uses the company's Switchboard figure when nothing nearer says", () => {
    expect(at(null)).toBe(96);
  });

  it("lets a run type's PANEL makeup beat the company's Switchboard (Q10)", () => {
    expect(at({ ...NONE, makeupPanelInches: 72 })).toBe(72);
  });

  it("lets a run type's own Switchboard figure beat its panel figure", () => {
    expect(
      at({
        ...NONE,
        makeupPanelInches: 72,
        makeupByKindInches: { switchboard: 80 },
      })
    ).toBe(80);
  });

  it("treats a type marked panel as a panel end even with no own figure", () => {
    const got = extrasForRun(
      row({ endKind: "mcc" }),
      ctx({
        company: company({ accepted: true }),
        kinds: new Map([["mcc", { makeupAt: "panel", makeupInches: null }]]),
      })
    );
    expect(got.makeupEndInches).toBe(STARTER_EXTRAS.makeupPanelInches);
  });
});

describe("which ends get makeup", () => {
  it("gives a QUANTITY leg makeup only where a drop was approved (D21)", () => {
    const got = extrasForRun(
      row({ traceMode: "quantity", startKind: null, endKind: "receptacle" }),
      ctx({ company: company({ accepted: true }) })
    );
    expect(got.makeupStartInches).toBe(0); // an open end — no box said
    expect(got.makeupEndInches).toBe(18);
    // An open end is an answer, not a gap: nothing is flagged unset.
    expect(got.unset.makeup).toBe(false);
  });

  it("gives a tee end the device figure", () => {
    const got = extrasForRun(
      row({ startTeeId: 30, startKind: null }),
      ctx({ company: company({ accepted: true }) })
    );
    expect(got.makeupStartInches).toBe(18);
  });
});

// ── Arithmetic ───────────────────────────────────────────────────────────────

describe("the § 5j worked example, every term", () => {
  const q = quantitiesForRun(
    run(112),
    TWO_AND_GROUND,
    RATIO,
    DROP_8_5,
    extras({
      conduitPct: 0.05,
      wirePct: 0.1,
      makeupStartInches: 18,
      makeupEndInches: 18,
    })
  )!;

  it("puts conduit extra on the FLAT length only (§ 7.1)", () => {
    expect(q.conduitInstalledFeet).toBe(120.5);
    expect(q.conduitExtraFeet).toBe(5.6); // 5% of 112, not of 120.50
    expect(q.conduitBoughtFeet).toBe(126.1);
  });

  it("puts wire extra on flat AND vertical, and makeup per conductor per end", () => {
    // 3 conductors × (112 + 8.5) = 361.50
    expect(q.wireFlatFeet + q.wireVerticalFeet).toBe(361.5);
    expect(q.wireExtraFeet).toBe(36.15);
    // 18 in at each of two ends, three conductors: 3 × 3 ft = 9 ft
    expect(q.makeupFeet).toBe(9);
    expect(q.wireInstalledFeet).toBe(370.5);
    expect(q.wireBoughtFeet).toBe(406.65);
    expect(
      q.wireFlatFeet + q.wireVerticalFeet + q.wireExtraFeet + q.makeupFeet
    ).toBeCloseTo(q.wireBoughtFeet, 6);
  });

  it("splits the ground the same way", () => {
    // 120.50 laid + 3 ft makeup = 123.50 installed; + 12.05 extra
    expect(q.groundInstalledFeet).toBe(123.5);
    expect(q.groundBoughtFeet).toBe(135.55);
  });
});

describe("rules a tidy-up would break", () => {
  const withExtras = extras({
    conduitPct: 0.05,
    wirePct: 0.1,
    makeupStartInches: 18,
    makeupEndInches: 18,
  });

  it("gives the same conduit extra with or without a drop", () => {
    const flat = quantitiesForRun(
      run(100),
      [],
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    const dropped = quantitiesForRun(
      run(100),
      [],
      RATIO,
      DROP_8_5,
      withExtras
    )!;
    expect(dropped.conduitExtraFeet).toBe(flat.conduitExtraFeet);
    // ...while the WIRE extra does grow with the drop — checked on wire.
    const flatW = quantitiesForRun(
      run(100),
      TWO_AND_GROUND,
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    const dropW = quantitiesForRun(
      run(100),
      TWO_AND_GROUND,
      RATIO,
      DROP_8_5,
      withExtras
    )!;
    expect(dropW.wireExtraFeet).toBeGreaterThan(flatW.wireExtraFeet);
  });

  it("does not scale makeup with length, and never puts it on conduit", () => {
    const short = quantitiesForRun(
      run(20),
      TWO_AND_GROUND,
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    const long = quantitiesForRun(
      run(200),
      TWO_AND_GROUND,
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    expect(long.makeupFeet).toBe(short.makeupFeet);
    expect(short.conduitBoughtFeet).toBe(
      (short.conduitInstalledFeet ?? 0) + short.conduitExtraFeet
    );
  });

  it("gives an empty pipe no makeup — no conductors, no tails", () => {
    const empty = quantitiesForRun(
      run(100),
      [],
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    expect(empty.makeupFeet).toBe(0);
    expect(empty.wireBoughtFeet).toBe(0);
  });

  it("gives a cable ONE tail per end in cable feet, not one per conductor (Q3)", () => {
    const q = quantitiesForRun(
      cable(100),
      [],
      RATIO,
      NO_VERTICALS,
      withExtras
    )!;
    expect(q.makeupFeet).toBe(3); // 18 in × 2 ends, once
    expect(q.wireExtraFeet).toBe(10); // 10% of 100
    expect(q.cableInstalledFeet).toBe(103);
    expect(q.cableBoughtFeet).toBe(113);
    expect(q.conduitBoughtFeet).toBeNull();
  });

  it("says when nobody set an extra, rather than showing a quiet zero", () => {
    const unset = quantitiesForRun(
      run(100),
      TWO_AND_GROUND,
      RATIO,
      NO_VERTICALS,
      extras({ unset: { conduit: true, wire: true, makeup: true } })
    )!;
    expect(carriesNoExtra(unset)).toBe(true);
    expect(
      carriesNoExtra(
        quantitiesForRun(
          run(100),
          TWO_AND_GROUND,
          RATIO,
          NO_VERTICALS,
          withExtras
        )!
      )
    ).toBe(false);
  });
});

// ── Labour on installed footage (Q5) ─────────────────────────────────────────

describe("extra is material only; labour is on installed footage (Q5)", () => {
  it("keeps the hours when only the extra grows, and moves the material", () => {
    const line = (bought: number, installed: number) =>
      calculateLineItem({
        materials: [{ costPerUnit: 0.5, qty: 1 }],
        baseLaborHours: 0.01,
        laborRate: 80,
        quantity: bought,
        laborQuantity: installed,
      });
    const noExtra = line(370.5, 370.5);
    const withExtra = line(406.65, 370.5);
    expect(withExtra.totalLaborHours).toBe(noExtra.totalLaborHours);
    expect(withExtra.laborCost).toBe(noExtra.laborCost);
    expect(withExtra.materialCost).toBeGreaterThan(noExtra.materialCost);
  });

  it("reads laborQty when a line has one, and qty when it does not", () => {
    expect(laborQtyOf({ qty: "406.6500", laborQty: "370.5000" })).toBe(370.5);
    expect(laborQtyOf({ qty: "12.0000", laborQty: null })).toBe(12);
  });
});

// ── Fittings read installed pipe ─────────────────────────────────────────────

describe("fittings are counted over INSTALLED pipe, not bought", () => {
  it("hands the coupling count the pipe as laid, with no extra in it", () => {
    const groupable: GroupableRun = {
      id: 1,
      sheetId: 1,
      runTypeId: 7,
      pathType: "conduit",
      points: run(100).points,
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
      conduitExtraPct: "0.2000", // a big extra, so a leak would show
      wireExtraPct: null,
      makeupDeviceInches: null,
      makeupPanelInches: null,
      makeupByKindInches: null,
    };
    const footage = groupRunFootage({
      runs: [groupable],
      circuitsByRun: wireCircuitsFor({
        runs: [groupable],
        stored: [],
        typeFor: () => null,
      }),
      scales: new Map([
        [1, { scaleRatio: RATIO, notToScale: false, scaleSource: "manual" }],
      ]),
      heights: buildHeightContext({
        defaults: undefined,
        company: [],
        job: [],
        bidDistributionInches: null,
        extraDefaults: undefined,
        runTypes: [],
      }),
      pullPointAnswersByRun: new Map(),
      teesById: new Map(),
    }).get(7)!;
    expect(footage.conduitBoughtFeet).toBe(120);
    expect(footage.conduitInstalledFeet).toBe(100);
    expect(footage.legs[0].feet).toBe(100);
  });
});
