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
  surfaceRacewayFittingRows,
  surfaceRacewayPartName,
  surfaceRacewaySeries,
  type SurfaceRacewaySeries,
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
import { fittingRowSpeaks } from "../shared/runFittingMaterials";

const R700: SurfaceRacewaySpec = {
  name: "Surface raceway, 700 series",
  series: "700",
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

describe("the 700 parts as bid ROWS (wired 2026-10-08)", () => {
  // BOTH series' rows in the catalog, so a count that ignored its series
  // would find the other one's part rather than nothing.
  const names = new Map(
    (["500", "700"] as const).flatMap((series, s) =>
      SURFACE_RACEWAY_PARTS.map((part, i) => [
        surfaceRacewayPartName(part, series),
        {
          id: 900 + s * 100 + i,
          name: surfaceRacewayPartName(part, series),
          costPerUnit: 0,
        },
      ])
    )
  );
  const found = (name: string) => names.get(name);
  const counts = countSurfaceRacewayFittings(
    [
      leg("1", 40, {
        turn: 90,
        startDrop: { state: "counted", feet: 3 },
        endDrop: { state: "counted", feet: 3.5 },
      }),
    ],
    R700,
    []
  );

  it("go out under six DIFFERENT roles — the inside and flat elbows apart", () => {
    const rows = surfaceRacewayFittingRows("700", counts, {}, found);
    expect(rows.map(r => r.role)).toEqual([
      "coupling",
      "connector",
      "strap",
      "elbow90",
      "elbowFlat",
      "teeBox",
    ]);
    expect(new Set(rows.map(r => r.role)).size).toBe(rows.length);
    const by = (role: string) => rows.find(r => r.role === role)!;
    expect(by("elbow90").qty).toBe(1);
    expect(by("elbowFlat").qty).toBe(2);
    expect(by("connector").qty).toBe(1);
    expect(by("elbowFlat").pick).toMatchObject({
      ok: true,
      name: "Surface raceway flat elbow, 700 series",
    });
    expect(by("connector").pick).toMatchObject({
      ok: true,
      name: "Surface raceway entrance end fitting, 700 series",
    });
  });

  it("the type's own choice of part wins, and a missing part says so by name", () => {
    const own = { id: 5, name: "Shop's own 700 coupling", costPerUnit: 1.5 };
    const rows = surfaceRacewayFittingRows(
      "700",
      counts,
      { coupling: own },
      name => (name.includes("tee") ? undefined : found(name))
    );
    expect(rows.find(r => r.role === "coupling")!.pick).toMatchObject({
      ok: true,
      materialId: 5,
      override: true,
    });
    expect(rows.find(r => r.role === "teeBox")!.pick).toEqual({
      ok: false,
      // One tee for 500 and 700 since 2026-10-09 (V5715).
      why: "No catalog match for Surface raceway tee, 500/700 series",
    });
  });

  it("knows 500 and 700 by their SHIPPED names, as two series — 1500 and 2400 are neither", () => {
    // sch80-and-500-plan.md § 2d. Before 2026-10-09 the 500 row was "not a
    // family" here; 1500 contains "500", which is why the list is closed.
    expect(surfaceRacewaySeries("Surface raceway, 500 series")).toBe("500");
    expect(surfaceRacewaySeries("Surface raceway, 700 series")).toBe("700");
    expect(surfaceRacewaySeries("Surface raceway, 1500 series")).toBeNull();
    expect(
      surfaceRacewaySeries("Surface raceway, 2400 series two-channel")
    ).toBeNull();
    // The 500 row's name before A's rename, and a shop's own raceway.
    expect(surfaceRacewaySeries("Surface raceway base, 500 series")).toBeNull();
    expect(surfaceRacewaySeries("Shop's own raceway")).toBeNull();
    expect(surfaceRacewaySeries(null)).toBeNull();
  });

  it("a 500 run names 500 parts only — never a 700 one", () => {
    const counts500 = countSurfaceRacewayFittings(
      [
        leg("1", 40, {
          turn: 90,
          startDrop: { state: "none" },
          endDrop: { state: "counted", feet: 3.5 },
        }),
      ],
      { ...R700, name: "Surface raceway, 500 series", series: "500" },
      []
    );
    const rows = surfaceRacewayFittingRows("500", counts500, {}, found);
    const by = (role: string) => rows.find(r => r.role === role)!;
    expect(by("elbow90")).toMatchObject({
      qty: 1,
      pick: { ok: true, name: "Surface raceway inside elbow, 500 series" },
    });
    expect(by("elbowFlat")).toMatchObject({
      qty: 1,
      pick: { ok: true, name: "Surface raceway flat elbow, 500 series" },
    });
    // The clip and tee are ONE part for 500 and 700 since 2026-10-09
    // (V5703, V5715): "500/700" is a 500 part too. Never a 700-only one.
    for (const row of rows)
      if (row.pick.ok)
        expect(row.pick.name, row.role).toMatch(/, (500|500\/700) series$/);
    // And the sentences say 500 where they name a part.
    expect(counts500.entranceEnd).toMatchObject({
      why: expect.stringContaining("goes into the 500 box"),
    });
  });

  it("a missing 500 part says so by its 500 name, and does not borrow the 700 one", () => {
    const only700 = (name: string) =>
      name.endsWith(", 700 series") ? found(name) : undefined;
    const rows = surfaceRacewayFittingRows("500", counts, {}, only700);
    for (const row of rows)
      expect(row.pick, row.role).toEqual({
        ok: false,
        why: expect.stringMatching(
          /^No catalog match for .*, (500|500\/700) series$/
        ),
      });
  });

  it("700 sentences are unchanged by the series argument", () => {
    const series: SurfaceRacewaySeries = "700";
    expect(counts.entranceEnd).toMatchObject({
      why: "1 entrance end: one at the start of each run — the far end goes into the 700 box",
    });
    expect(surfaceRacewayPartName("tee", series)).toBe(
      "Surface raceway tee, 500/700 series"
    );
    expect(surfaceRacewayPartName("coupling", series)).toBe(
      "Surface raceway coupling, 700 series"
    );
  });

  it("a PIPE never buys a flat elbow, and that 0 stays quiet", () => {
    const pipe = asPipe([leg("1", 40, { turn: 90 })]);
    expect(pipe.elbowFlat).toMatchObject({ status: "counted", qty: 0 });
    expect(
      fittingRowSpeaks({
        role: "elbowFlat",
        status: "counted",
        qty: 0,
        onBid: false,
      })
    ).toBe(false);
    expect(
      fittingRowSpeaks({
        role: "elbowFlat",
        status: "counted",
        qty: 2,
        onBid: false,
      })
    ).toBe(true);
  });
});
