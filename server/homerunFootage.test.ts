/**
 * The homerun footage calculator (`shared/homerunFootage.ts`) against the
 * owner's rules in `references/homerun-footage-plan.md` § 5, § 6 and § 11.
 * Every rule has a case that goes red if it is broken.
 */
import { describe, expect, it } from "vitest";
import {
  heightAreaAt,
  homerunFootage,
  homerunTotals,
  overlappingHeightAreas,
  resolveHomerunCeiling,
  resolveHomerunMethod,
  unconfirmedNote,
  HOMERUN_CEILING_UNSET_LABEL,
  type HeightArea,
  type HomerunDevice,
  type HomerunFootage,
  type HomerunInput,
  type HomerunMethod,
} from "@shared/homerunFootage";

/** 1/4" = 1'-0": one inch of paper is 48 of building, so 18 pt is a foot. */
const QUARTER_INCH = 48;
const PT_PER_FT = 18;

const receptacle = (id: number, x: number, y: number): HomerunDevice => ({
  id,
  x,
  y,
  kind: "receptacle",
  heightInches: 18,
});

const method = (
  m: HomerunMethod,
  extra: { averageFt?: number; minimumFt?: number } = {}
) =>
  resolveHomerunMethod({
    area: null,
    bid: {
      method: m,
      averageFt: extra.averageFt ?? null,
      minimumFt: extra.minimumFt ?? null,
    },
  });

/** The plan's § 5 example: 40 ft out, 10'-0" ceiling, panel at 6'-0". */
function base(over: Partial<HomerunInput> = {}): HomerunInput {
  return {
    devices: [receptacle(1, 40 * PT_PER_FT, 0)],
    leavingDeviceId: null,
    panelSpot: { x: 0, y: 0 },
    scaleRatio: QUARTER_INCH,
    method: method("measured"),
    ceiling: { inches: 120, source: "sheet" },
    panelHeightInches: 72,
    routingPct: 0.15,
    wireExtraPct: 0.1,
    conduitExtraPct: 0.05,
    makeupPanelInches: 60,
    conductorCount: 2,
    groundCount: 1,
    overrideFt: null,
    confirmed: false,
    traced: false,
    ...over,
  };
}

function computed(h: HomerunFootage) {
  if (h.state !== "computed") throw new Error(`expected computed: ${h.state}`);
  return h;
}

describe("the plan's § 5 worked example, all three methods", () => {
  it("Measured: 40 ft + 12.5 ft drops", () => {
    const h = computed(homerunFootage(base()));
    expect(h.pieces.runFt).toBeCloseTo(40, 3);
    expect(h.pieces.upDrop.counted && h.pieces.upDrop.feet).toBe(8.5);
    expect(h.pieces.downAtPanel.counted && h.pieces.downAtPanel.feet).toBe(4);
    expect(h.pieces.installedFt).toBeCloseTo(52.5, 3);
    expect(h.laborFt).toBeCloseTo(60.375, 3);
    expect(h.wirePerConductorFt).toBeCloseTo(70.625, 3);
    expect(h.wires).toBe(3);
    expect(h.wireFt).toBeCloseTo(211.875, 3);
    expect(h.conduitFt).toBeCloseTo(63, 3); // 52.5 × 1.20
  });

  it("Average 25 ft: L = 25, the rest the same", () => {
    const h = computed(
      homerunFootage(base({ method: method("average", { averageFt: 25 }) }))
    );
    expect(h.pieces.measuredFt).toBeNull();
    expect(h.pieces.installedFt).toBeCloseTo(37.5, 3);
    expect(h.wirePerConductorFt).toBeCloseTo(51.875, 3);
  });

  it("Measured with a minimum of 50 ft: L = 50", () => {
    const h = computed(
      homerunFootage(base({ method: method("measuredMin", { minimumFt: 50 }) }))
    );
    expect(h.pieces.measuredFt).toBeCloseTo(40, 3);
    expect(h.pieces.minimumApplied).toBe(true);
    expect(h.pieces.installedFt).toBeCloseTo(62.5, 3);
  });

  it("a minimum below the measured length changes nothing", () => {
    const h = computed(
      homerunFootage(base({ method: method("measuredMin", { minimumFt: 30 }) }))
    );
    expect(h.pieces.minimumApplied).toBe(false);
    expect(h.pieces.installedFt).toBeCloseTo(52.5, 3);
  });
});

/**
 * UNCC E111 (UNCC.pdf page 5, sheet 234268), circuit 2B-1: seven duplex
 * receptacles, tied by their "2B - 1" tags (`@/lib/circuitGroups`). Marks
 * are the owner's hand marks; the panel spot is a TAP on the sheet's note
 * "EXISTING ELECTRICAL ROOM AND TELECOM ROOM ARE LOCATED IN THIS VICINITY"
 * — E111 draws no panel. Re-measure: `pnpm tsx scripts/codeFirstCeiling.mts
 * homerunexample`. Heights are stated, not read: E111 gives no ceiling.
 *
 * By hand:
 *   leaving device (closest at right angles) 407.6078, 696.8439
 *   |443 − 407.6078| + |186 − 696.8439| = 35.3922 + 510.8439 = 546.2361 pt
 *   546.2361 pt ÷ 18 pt/ft                                   = 30.34645 ft
 *   up-drop  (120 − 18) ÷ 12 = 8.5 ft;  down at panel (120 − 72) ÷ 12 = 4 ft
 *   installed 30.34645 + 8.5 + 4                              = 42.84645 ft
 *   labor     42.84645 × 1.15                                 = 49.2734175
 *   per wire  42.84645 × 1.25 + 5                             = 58.5580625
 *   3 wires   × 3                                             = 175.6741875
 *   conduit   42.84645 × 1.20                                 = 51.41574
 */
const E111_2B_1: HomerunDevice[] = [
  receptacle(231455, 407.6078, 696.8439),
  receptacle(231457, 595.2582, 765.7337),
  receptacle(231458, 724.6949, 765.6976),
  receptacle(231456, 327.3368, 863.0255),
  receptacle(231535, 673.7825, 895.5948),
  receptacle(231534, 487.5687, 899.1397),
  receptacle(231536, 592.625, 967.4167),
];

describe("worked example: UNCC E111, circuit 2B-1", () => {
  const h = computed(
    homerunFootage(base({ devices: E111_2B_1, panelSpot: { x: 443, y: 186 } }))
  );

  it("leaves from the device closest at right angles", () => {
    expect(h.leavingDevice?.id).toBe(231455);
  });

  it("matches the hand working to the thousandth of a foot", () => {
    expect(h.pieces.measuredFt).toBeCloseTo(30.346, 3);
    expect(h.pieces.installedFt).toBeCloseTo(42.846, 3);
    expect(h.pieces.routingFt).toBeCloseTo(6.427, 3);
    expect(h.pieces.wireWasteFt).toBeCloseTo(4.285, 3);
    expect(h.pieces.makeupFt).toBe(5);
    expect(h.laborFt).toBeCloseTo(49.273, 3);
    expect(h.wirePerConductorFt).toBeCloseTo(58.558, 3);
    expect(h.wireFt).toBeCloseTo(175.674, 3);
    expect(h.conduitFt).toBeCloseTo(51.416, 3);
  });
});

describe("routing and waste ADD; waste is material only (owner Q1)", () => {
  it("15% + 10% is 25%, never 26.5%", () => {
    const h = computed(homerunFootage(base()));
    expect(h.wirePerConductorFt - h.pieces.makeupFt).toBeCloseTo(
      52.5 * 1.25,
      6
    );
    expect(h.wirePerConductorFt - h.pieces.makeupFt).not.toBeCloseTo(
      52.5 * 1.15 * 1.1,
      3
    );
  });

  it("labor carries routing and no waste, at any waste", () => {
    const low = computed(homerunFootage(base({ wireExtraPct: 0 })));
    const high = computed(
      homerunFootage(base({ wireExtraPct: 0.5, conduitExtraPct: 0.5 }))
    );
    expect(high.laborFt).toBe(low.laborFt);
    expect(low.laborFt).toBeCloseTo(52.5 * 1.15, 6);
  });

  it("conduit gets routing + conduit waste and no makeup", () => {
    const h = computed(homerunFootage(base({ makeupPanelInches: 600 })));
    expect(h.conduitFt).toBeCloseTo(52.5 * 1.2, 6);
  });

  it("a cable homerun has no conduit", () => {
    const h = computed(homerunFootage(base({ conduitExtraPct: null })));
    expect(h.conduitFt).toBeNull();
    expect(h.pieces.conduitWasteFt).toBe(0);
  });
});

describe("makeup at the panel end only, unscaled (owner Q2)", () => {
  it("is one 5 ft tail per wire, not multiplied by routing or waste", () => {
    const without = computed(homerunFootage(base({ makeupPanelInches: 0 })));
    const withIt = computed(homerunFootage(base()));
    expect(withIt.wirePerConductorFt - without.wirePerConductorFt).toBe(5);
    expect(withIt.wireFt! - without.wireFt!).toBeCloseTo(15, 9);
  });

  it("adds no box-end makeup, and none to labor", () => {
    const h = computed(homerunFootage(base()));
    expect(h.wirePerConductorFt).toBeCloseTo(52.5 * 1.25 + 5, 9);
    expect(h.laborFt).toBeCloseTo(52.5 * 1.15, 9);
  });
});

describe("unconfirmed homeruns count (owner Q3)", () => {
  it("are in the total, with '+ N unconfirmed' beside it", () => {
    const a = homerunFootage(base());
    const b = homerunFootage(base({ confirmed: true }));
    const t = homerunTotals([a, b]);
    expect(t.wireFt).toBeCloseTo(2 * 211.875, 6);
    expect(t.laborFt).toBeCloseTo(2 * 60.375, 6);
    expect(t.unconfirmed).toBe(1);
    expect(unconfirmedNote(t)).toBe("+ 1 unconfirmed");
  });

  it("says nothing when all are confirmed", () => {
    const t = homerunTotals([homerunFootage(base({ confirmed: true }))]);
    expect(unconfirmedNote(t)).toBeNull();
  });

  it("a homerun with no number is tallied, never a silent zero", () => {
    const t = homerunTotals([
      homerunFootage(base({ panelSpot: null })),
      homerunFootage(base({ conductorCount: null })),
    ]);
    expect(t.notCounted).toBe(2);
    // Only the one IN the total is "unconfirmed"; the refused one is not in
    // it. This asserted 2 until 2026-10-07, when the screen read "0
    // homeruns + 38 unconfirmed" on a sheet with no scale.
    expect(t.unconfirmed).toBe(1);
  });
});

describe("starts unconfirmed; any override confirms (plan § 6)", () => {
  it("a computed homerun starts unconfirmed", () => {
    expect(computed(homerunFootage(base())).confirmed).toBe(false);
  });

  it("a typed length replaces run + drops; percentages and makeup stay", () => {
    const h = computed(homerunFootage(base({ overrideFt: 100 })));
    expect(h.overridden).toBe(true);
    expect(h.confirmed).toBe(true);
    expect(h.pieces.installedFt).toBe(100);
    expect(h.wirePerConductorFt).toBeCloseTo(130, 9);
    expect(h.laborFt).toBeCloseTo(115, 9);
  });

  it("a typed length works with no panel spot and no scale", () => {
    const h = homerunFootage(
      base({ overrideFt: 60, panelSpot: null, scaleRatio: null })
    );
    expect(computed(h).pieces.installedFt).toBe(60);
  });

  it("a picked leaving device is used, and confirms", () => {
    const devices = [receptacle(1, 10 * PT_PER_FT, 0), receptacle(2, 90, 300)];
    const auto = computed(homerunFootage(base({ devices })));
    expect(auto.leavingDevice?.id).toBe(1);
    const picked = computed(
      homerunFootage(base({ devices, leavingDeviceId: 2 }))
    );
    expect(picked.leavingDevice?.id).toBe(2);
    expect(picked.confirmed).toBe(true);
    expect(picked.pieces.measuredFt).toBeCloseTo(390 / PT_PER_FT, 9);
  });

  it("a homerun's own ceiling confirms it", () => {
    const h = computed(
      homerunFootage(base({ ceiling: { inches: 216, source: "homerun" } }))
    );
    expect(h.confirmed).toBe(true);
    expect(h.pieces.upDrop.counted && h.pieces.upDrop.feet).toBe(16.5);
  });
});

describe("right angle, not straight line (plan § 3)", () => {
  // Legs that differ: 300 pt across, 100 pt down. A square fixture would
  // hide nothing, but legs this unequal make the two answers far apart.
  it("measures |dx| + |dy|", () => {
    const h = computed(
      homerunFootage(base({ devices: [receptacle(1, 300, 100)] }))
    );
    expect(h.pieces.measuredFt).toBeCloseTo(400 / PT_PER_FT, 9);
    expect(h.pieces.measuredFt).not.toBeCloseTo(
      Math.hypot(300, 100) / PT_PER_FT,
      1
    );
  });

  it("picks the closest device by right angles, not by straight line", () => {
    // A: 0 + 200 = 200 right-angle, 200 straight.
    // B: 150 + 120 = 270 right-angle, 192 straight — nearer in a straight line.
    const devices = [receptacle(1, 0, 200), receptacle(2, 150, 120)];
    const h = computed(homerunFootage(base({ devices })));
    expect(h.leavingDevice?.id).toBe(1);
  });
});

describe("no guessing", () => {
  it("Measured with no panel spot gives no number", () => {
    const h = homerunFootage(base({ panelSpot: null }));
    expect(h).toEqual({
      state: "refused",
      reason: "no-panel-spot",
      confirmed: false,
    });
  });

  it("Measured with no scale gives no number", () => {
    const h = homerunFootage(base({ scaleRatio: null }));
    expect(h.state === "refused" && h.reason).toBe("no-scale");
  });

  it("never falls back to the average when Measured cannot measure", () => {
    const m = resolveHomerunMethod({
      area: null,
      bid: { method: "measured", averageFt: 25, minimumFt: null },
    });
    const h = homerunFootage(base({ method: m, scaleRatio: null }));
    expect(h.state).toBe("refused");
  });

  it("Average needs no panel spot and no scale", () => {
    const h = homerunFootage(
      base({
        method: method("average", { averageFt: 25 }),
        panelSpot: null,
        scaleRatio: null,
      })
    );
    expect(computed(h).pieces.runFt).toBe(25);
    expect(computed(h).pieces.upDrop.counted).toBe(true);
  });

  it("Average with no length is refused, not zero", () => {
    const h = homerunFootage(base({ method: method("average") }));
    expect(h.state === "refused" && h.reason).toBe("no-average");
  });

  it("no ceiling: no vertical at either end, named, never zero", () => {
    const h = computed(
      homerunFootage(base({ ceiling: { inches: null, source: "unset" } }))
    );
    expect(h.pieces.upDrop).toMatchObject({
      counted: false,
      reason: "no-distribution-height",
    });
    expect(h.pieces.downAtPanel).toMatchObject({
      counted: false,
      reason: "no-distribution-height",
    });
    expect(h.pieces.installedFt).toBeCloseTo(40, 6);
  });

  it("no panel height: the panel drop is named as not set", () => {
    const h = computed(homerunFootage(base({ panelHeightInches: null })));
    expect(h.pieces.downAtPanel).toMatchObject({
      counted: false,
      reason: "height-not-set",
    });
    expect(h.pieces.installedFt).toBeCloseTo(48.5, 6);
  });

  it("a floor box adds its drop DOWN from the ceiling, the same rule", () => {
    const floor: HomerunDevice = {
      ...receptacle(1, 720, 0),
      kind: "floor-box",
      heightInches: 0,
    };
    const h = computed(homerunFootage(base({ devices: [floor] })));
    expect(h.pieces.upDrop.counted && h.pieces.upDrop.feet).toBe(10);
  });

  it("no conductor count: no wire, the conduit still counts", () => {
    const h = computed(homerunFootage(base({ conductorCount: null })));
    expect(h.wireFt).toBeNull();
    expect(h.conduitFt).toBeCloseTo(63, 6);
  });
});

describe("a traced homerun suppresses the computed one (plan § 2)", () => {
  it("computes nothing and is tallied apart", () => {
    const h = homerunFootage(base({ traced: true }));
    expect(h).toEqual({ state: "traced" });
    const t = homerunTotals([h, homerunFootage(base())]);
    expect(t.traced).toBe(1);
    expect(t.wireFt).toBeCloseTo(211.875, 6);
  });
});

describe("method resolution: area → bid → Measured", () => {
  it("the area beats the bid", () => {
    const m = resolveHomerunMethod({
      area: { method: "average", averageFt: 30, minimumFt: null },
      bid: { method: "measured", averageFt: 25, minimumFt: 10 },
    });
    expect(m).toEqual({
      method: "average",
      methodFrom: "area",
      averageFt: 30,
      minimumFt: 10,
    });
  });

  it("the bid beats the default", () => {
    const m = resolveHomerunMethod({
      area: { method: null, averageFt: null, minimumFt: null },
      bid: { method: "measuredMin", averageFt: null, minimumFt: 20 },
    });
    expect(m.method).toBe("measuredMin");
    expect(m.methodFrom).toBe("bid");
  });

  it("nothing set is Measured", () => {
    const m = resolveHomerunMethod({ area: null, bid: null });
    expect(m.method).toBe("measured");
    expect(m.methodFrom).toBe("default");
  });
});

describe("ceiling: homerun → area → sheet → job → company", () => {
  it("takes the first that is set, and 0 is a real height", () => {
    expect(
      resolveHomerunCeiling({ homerun: 216, area: 144, sheet: 120, job: 108 })
    ).toEqual({ inches: 216, source: "homerun" });
    expect(resolveHomerunCeiling({ area: 144, sheet: 120 }).source).toBe(
      "area"
    );
    expect(resolveHomerunCeiling({ sheet: 120, job: 108 }).source).toBe(
      "sheet"
    );
    expect(resolveHomerunCeiling({ job: 108, company: 96 }).source).toBe("job");
    expect(resolveHomerunCeiling({ company: 96 }).source).toBe("company");
    expect(resolveHomerunCeiling({ homerun: 0, sheet: 120 }).inches).toBe(0);
  });

  it("nothing set stays unset", () => {
    expect(resolveHomerunCeiling({})).toEqual({
      inches: null,
      source: "unset",
    });
  });

  it("an empty homerun height reads 'follows the sheet', never 'not set'", () => {
    expect(HOMERUN_CEILING_UNSET_LABEL).toBe("follows the sheet");
    expect(HOMERUN_CEILING_UNSET_LABEL).not.toMatch(/not set|^0/);
  });
});

describe("height areas inside a sheet", () => {
  const box = (
    id: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ceilingInches: number
  ): HeightArea => ({
    id,
    ceilingInches,
    outline: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  });
  // A 10' sales floor with an 18' stockroom drawn inside it.
  const salesFloor = box(1, 0, 0, 1000, 600, 120);
  const stockroom = box(2, 600, 300, 900, 550, 216);

  it("the smaller outline wins even when its height is HIGHER", () => {
    expect(heightAreaAt({ x: 700, y: 400 }, [salesFloor, stockroom])?.id).toBe(
      2
    );
    expect(heightAreaAt({ x: 700, y: 400 }, [stockroom, salesFloor])?.id).toBe(
      2
    );
  });

  it("outside the inner area, the outer one", () => {
    expect(heightAreaAt({ x: 100, y: 100 }, [salesFloor, stockroom])?.id).toBe(
      1
    );
  });

  it("in no area, null — the sheet's height applies", () => {
    expect(heightAreaAt({ x: 2000, y: 100 }, [salesFloor, stockroom])).toBe(
      null
    );
  });

  it("flags overlap: nested, and crossing", () => {
    expect(overlappingHeightAreas([salesFloor, stockroom])).toEqual([[1, 2]]);
    const crossing = box(3, 900, 500, 1200, 800, 144);
    expect(overlappingHeightAreas([salesFloor, crossing])).toEqual([[1, 3]]);
  });

  it("two areas sharing only a wall do not warn", () => {
    const beside = box(4, 1000, 0, 1400, 600, 216);
    expect(overlappingHeightAreas([salesFloor, beside])).toEqual([]);
  });

  it("feeds the ceiling chain", () => {
    const area = heightAreaAt({ x: 700, y: 400 }, [salesFloor, stockroom]);
    const ceiling = resolveHomerunCeiling({
      area: area?.ceilingInches,
      sheet: 120,
    });
    const h = computed(homerunFootage(base({ ceiling })));
    expect(h.pieces.upDrop.counted && h.pieces.upDrop.feet).toBe(16.5);
    expect(h.confirmed).toBe(false);
  });
});
