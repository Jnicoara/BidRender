/**
 * Verticals: the drops and rises a traced line cannot see.
 *
 * ── Why this suite is as large as it is ──────────────────────────────────────
 * Every number here becomes conduit and wire on a real bid, and the failures
 * are all invisible on screen. A missing vertical makes a total quietly low; a
 * doubled one makes it quietly high; and "quietly high" is the one nobody
 * questions, because verticals are expected to make the number bigger. There
 * is no user who will notice either. So the refusal paths are checked as
 * carefully as the arithmetic, and each refusal is checked BY NAME — "no
 * height is set for a panel" and "nobody said what is at this end" have
 * different fixes, and a caller that cannot tell them apart can only print a
 * zero.
 *
 * Worked reference used throughout:
 *   Distribution height 10'-0" = 120". A receptacle at 1'-6" = 18".
 *   120 - 18 = 102 inches = 8.5 ft of drop.
 *   Thirty of them is 255 ft — the headline number in § 2.4, and the whole
 *   reason this phase exists.
 */
import { describe, it, expect } from "vitest";
import {
  DISTRIBUTION_KIND,
  DISTRIBUTION_LABEL,
  SHIPPED_HEIGHT_TYPES,
  heightList,
  heightTypeLabel,
  slugForHeightType,
  shouldSuggestStampLink,
  SUGGEST_WITHIN_INCHES,
  resolveDistributionHeight,
  resolveMountingHeight,
  shippedHeightType,
  stampsClaimedByRuns,
  totalVerticalFeet,
  verticalAtEnd,
  verticalsForRun,
  type HeightLayers,
} from "../shared/takeoffHeights";
import {
  NO_VERTICALS,
  quantitiesForRun,
  totalQuantities,
  verticalWireFeetByCircuit,
  type RunCircuit,
} from "../shared/takeoffQuantities";
import type { PagePoint } from "../shared/takeoffGeometry";
import { runDisplayName, runNameParts } from "../shared/takeoffCounts";
import {
  EMPTY_HEIGHT_CONTEXT,
  verticalsForRunRow,
  type HeightContext,
} from "./runVerticals";

const QUARTER_INCH = 48; // 1/4" = 1'-0"

/** 100 ft of traced pipe at 1/4" scale — 25 inches of paper, 1800 points. */
const RUN_100FT = {
  pathType: "conduit" as const,
  points: [
    { x: 0, y: 0 },
    { x: 1800, y: 0 },
  ] as PagePoint[],
};

const DISTRIBUTION_10FT = 120;
const RECEPTACLE = 18;

const noLayers: HeightLayers = { company: new Map(), job: new Map() };
const layers = (
  company: Record<string, number> = {},
  job: Record<string, number> = {}
): HeightLayers => ({
  company: new Map(Object.entries(company)),
  job: new Map(Object.entries(job)),
});

// ── What ships, and what deliberately does not ───────────────────────────────

describe("the shipped height types", () => {
  it("ships a panel with NO height, because a panel cannot be guessed", () => {
    // The correction that matters most: a panel is fed top, bottom or back
    // depending on how the can is set. A shipped value would have added
    // invented footage to the end of every homerun on every job.
    expect(shippedHeightType("panel")?.startingInches).toBeNull();
    expect(shippedHeightType("ceiling-box")?.startingInches).toBeNull();
  });

  it("ships the two conventions everyone agrees on", () => {
    expect(shippedHeightType("receptacle")?.startingInches).toBe(18);
    expect(shippedHeightType("switch")?.startingInches).toBe(48);
  });

  it("puts the disconnect at a reachable handle, not at 4 feet", () => {
    expect(shippedHeightType("disconnect")?.startingInches).toBe(60);
  });

  it("says out loud which starter is a guess rather than a convention", () => {
    // 8 feet for a wall junction box is plausible and is not a convention the
    // way 18 inches is, and the screen has to make that difference visible.
    expect(shippedHeightType("junction-box-wall")?.note).toMatch(/guess/i);
    expect(shippedHeightType("receptacle")?.note).not.toMatch(/guess/i);
  });

  it("stores a below-floor type as a negative elevation", () => {
    const underground = shippedHeightType("underground");
    expect(underground?.startingInches).toBe(-18);
    // Flagged so the UI can ask for a positive DEPTH and apply the sign
    // itself. `18` typed for a stub-up below slab is an 11.5 ft error.
    expect(underground?.belowFloor).toBe(true);
  });

  it("keeps a floor box at a real zero, which is not the same as unset", () => {
    expect(shippedHeightType("floor-box")?.startingInches).toBe(0);
  });

  it("holds every common type above the fold and the rare ones below", () => {
    const common = SHIPPED_HEIGHT_TYPES.filter(t => t.common).map(t => t.key);
    expect(common).toEqual([
      "receptacle",
      "switch",
      "panel",
      "ceiling-box",
      "junction-box-wall",
      "disconnect",
    ]);
  });

  it("has no duplicate keys — a run points at one of these forever", () => {
    const keys = SHIPPED_HEIGHT_TYPES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ── Inheritance: run → job → company → shipped ───────────────────────────────

describe("which height is in effect", () => {
  it("falls back to the shipped value when nobody has set one", () => {
    expect(resolveMountingHeight("receptacle", noLayers, null)).toEqual({
      inches: 18,
      source: "shipped",
    });
  });

  it("lets the company override the shipped value", () => {
    expect(
      resolveMountingHeight("receptacle", layers({ receptacle: 16 }), null)
    ).toEqual({ inches: 16, source: "company" });
  });

  it("lets the job override the company", () => {
    expect(
      resolveMountingHeight(
        "receptacle",
        layers({ receptacle: 16 }, { receptacle: 24 }),
        null
      )
    ).toEqual({ inches: 24, source: "job" });
  });

  it("lets one run override everything", () => {
    expect(
      resolveMountingHeight(
        "receptacle",
        layers({ receptacle: 16 }, { receptacle: 24 }),
        42
      )
    ).toEqual({ inches: 42, source: "run" });
  });

  it("treats zero as a real height, not as unset", () => {
    // A floor box is at zero. If zero read as "not set", every floor box on
    // every job would quietly stop counting its rise.
    expect(resolveMountingHeight("floor-box", noLayers, null)).toEqual({
      inches: 0,
      source: "shipped",
    });
    expect(resolveMountingHeight("receptacle", layers({}, {}), 0)).toEqual({
      inches: 0,
      source: "run",
    });
  });

  it("reports a type nobody has set as unset, with no borrowed number", () => {
    expect(resolveMountingHeight("panel", noLayers, null)).toEqual({
      inches: null,
      source: "unset",
    });
  });

  it("survives a key that no longer names a type", () => {
    // A retired type outlives the runs pointing at it. Those runs have to read
    // as "not set" — not crash, and not silently borrow another type's height.
    expect(resolveMountingHeight("gone-from-the-list", noLayers, null)).toEqual(
      {
        inches: null,
        source: "unset",
      }
    );
  });

  it("never disagrees with itself about whether something is set", () => {
    for (const key of [...SHIPPED_HEIGHT_TYPES.map(t => t.key), "unknown"]) {
      const resolved = resolveMountingHeight(key, noLayers, null);
      expect(resolved.inches === null).toBe(resolved.source === "unset");
    }
  });
});

describe("the distribution height is the gate", () => {
  it("is unset until somebody enters it — there is no shipped fallback", () => {
    expect(resolveDistributionHeight({})).toEqual({
      inches: null,
      source: "unset",
    });
  });

  it("inherits company → job → run in that order", () => {
    expect(resolveDistributionHeight({ company: 120 }).source).toBe("company");
    expect(resolveDistributionHeight({ company: 120, job: 144 })).toEqual({
      inches: 144,
      source: "job",
    });
    expect(
      resolveDistributionHeight({ company: 120, job: 144, run: 96 })
    ).toEqual({ inches: 96, source: "run" });
  });
});

// ── The arithmetic at one end ────────────────────────────────────────────────

describe("the vertical at one end of a run", () => {
  it("drops from the run height to a receptacle — the headline 8.5 ft", () => {
    const vertical = verticalAtEnd({
      kind: "receptacle",
      endInches: RECEPTACLE,
      distributionInches: DISTRIBUTION_10FT,
    });
    expect(vertical).toEqual({
      counted: true,
      kind: "receptacle",
      direction: "drop",
      distributionInches: 120,
      endInches: 18,
      feet: 8.5,
    });
  });

  it("rises to something mounted above the run height", () => {
    // Pipe at the slab, a disconnect at 5 ft. The footage is the same distance
    // whichever way the pipe runs; only the word changes.
    const vertical = verticalAtEnd({
      kind: "disconnect",
      endInches: 60,
      distributionInches: 0,
    });
    expect(vertical.counted && vertical.direction).toBe("rise");
    expect(vertical.counted && vertical.feet).toBe(5);
  });

  it("counts a below-floor stub-up as the full distance", () => {
    // 10 ft run height down to 18 inches below the floor is 11.5 ft, not 8.5.
    const vertical = verticalAtEnd({
      kind: "underground",
      endInches: -18,
      distributionInches: DISTRIBUTION_10FT,
    });
    expect(vertical.counted && vertical.feet).toBe(11.5);
  });

  it("refuses when nobody has said what is at this end", () => {
    const vertical = verticalAtEnd({
      kind: null,
      endInches: 18,
      distributionInches: DISTRIBUTION_10FT,
    });
    expect(vertical).toEqual({ counted: false, kind: null, reason: "no-kind" });
  });

  it("refuses everything while the gate is shut", () => {
    const vertical = verticalAtEnd({
      kind: "receptacle",
      endInches: 18,
      distributionInches: null,
    });
    expect(vertical.counted).toBe(false);
    expect(!vertical.counted && vertical.reason).toBe("no-distribution-height");
  });

  it("refuses a type whose height nobody has set, and says which problem it is", () => {
    const vertical = verticalAtEnd({
      kind: "panel",
      endInches: null,
      distributionInches: DISTRIBUTION_10FT,
    });
    // Not "no-kind": the estimator DID say it is a panel. The missing piece is
    // the height, and the fix is a different screen.
    expect(!vertical.counted && vertical.reason).toBe("height-not-set");
  });

  it("adds nothing for a run that carries straight on at run height", () => {
    const vertical = verticalAtEnd({
      kind: DISTRIBUTION_KIND,
      endInches: null,
      distributionInches: DISTRIBUTION_10FT,
    });
    expect(!vertical.counted && vertical.reason).toBe("level");
  });

  it("says 'level' rather than counting a zero", () => {
    // A ceiling box set at exactly the run height. A counted 0.00 ft would
    // read on screen as a considered answer and put a noise row under every
    // run that has nothing to add.
    const vertical = verticalAtEnd({
      kind: "ceiling-box",
      endInches: DISTRIBUTION_10FT,
      distributionInches: DISTRIBUTION_10FT,
    });
    expect(!vertical.counted && vertical.reason).toBe("level");
  });
});

describe("both ends of a run", () => {
  it("counts a panel-to-receptacle run at each end separately", () => {
    // Panel landing at 6 ft, receptacle at 18 inches, pipe at 10 ft.
    const verticals = verticalsForRun(
      { kind: "panel", endInches: 72, distributionInches: DISTRIBUTION_10FT },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    expect(verticals.start.counted && verticals.start.feet).toBe(4);
    expect(verticals.end.counted && verticals.end.feet).toBe(8.5);
    expect(verticals.feet).toBe(12.5);
  });

  it("adds nothing at a junction box a run passes straight through", () => {
    // Trap 2 in § 5d, and the reason `distribution` is the START default: a
    // run continuing at ceiling height must not collect a phantom rise out of
    // the box the previous run dropped into. Four feet per box, twenty boxes.
    const verticals = verticalsForRun(
      {
        kind: DISTRIBUTION_KIND,
        endInches: null,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    expect(verticals.feet).toBe(8.5);
  });

  it("is zero on a run whose ends nobody has answered", () => {
    const verticals = verticalsForRun(
      { kind: null, endInches: null, distributionInches: DISTRIBUTION_10FT },
      { kind: null, endInches: null, distributionInches: DISTRIBUTION_10FT }
    );
    expect(verticals.feet).toBe(0);
  });
});

// ── Through the per-conductor maths ──────────────────────────────────────────

describe("vertical footage reaches the wire, once per conductor", () => {
  const circuits: RunCircuit[] = [{ name: "Ckt 1", conductorCount: 3 }];

  it("adds the drop to conduit ONCE and to wire per conductor", () => {
    const verticals = verticalsForRun(
      {
        kind: DISTRIBUTION_KIND,
        endInches: null,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    const quantities = quantitiesForRun(
      RUN_100FT,
      circuits,
      QUARTER_INCH,
      verticals
    )!;

    expect(quantities.runFeet).toBe(100); // flat, untouched
    expect(quantities.verticalFeet).toBe(8.5);
    expect(quantities.conduitFeet).toBe(108.5); // one pipe down the drop
    expect(quantities.totalWireFeet).toBe(325.5); // 3 conductors down it too
    expect(quantities.wireByCircuit[0]).toMatchObject({
      flatFeet: 300,
      verticalFeet: 25.5,
      feet: 325.5,
    });
  });

  it("keeps the flat length readable next to the total", () => {
    // § 5a: nothing on screen may be a single figure the estimator has to
    // trust. The breakdown has to be able to show 100 + 8.5 = 108.5.
    const verticals = verticalsForRun(
      {
        kind: DISTRIBUTION_KIND,
        endInches: null,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    const quantities = quantitiesForRun(
      RUN_100FT,
      [],
      QUARTER_INCH,
      verticals
    )!;
    expect(quantities.runFeet + quantities.verticalFeet).toBe(
      quantities.conduitFeet
    );
  });

  it("gives a cable run its verticals too — an MC whip drops as well", () => {
    const verticals = verticalsForRun(
      {
        kind: DISTRIBUTION_KIND,
        endInches: null,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    const quantities = quantitiesForRun(
      { pathType: "cable", points: RUN_100FT.points },
      [],
      QUARTER_INCH,
      verticals
    )!;
    expect(quantities.cableFeet).toBe(108.5);
    expect(quantities.conduitFeet).toBeNull();
  });

  it("ignores a nonsense conductor count instead of producing NaN", () => {
    const result = verticalWireFeetByCircuit(8.5, [
      { name: "Good", conductorCount: 3 },
      { name: "Bad", conductorCount: Number.NaN },
      { name: "Negative", conductorCount: -2 },
    ]);
    expect(result.totalFeet).toBe(25.5);
    expect(Number.isNaN(result.totalFeet)).toBe(false);
  });

  it("still refuses a run whose sheet has no scale, verticals or not", () => {
    // The verticals ARE known here — they need no scale. Showing them alone
    // would put a partial figure on screen, and a partial total reads as a
    // complete one. The run says so on its own row instead.
    const verticals = verticalsForRun(
      {
        kind: "panel",
        endInches: 72,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    expect(verticals.feet).toBe(12.5);
    expect(quantitiesForRun(RUN_100FT, [], null, verticals)).toBeNull();
  });
});

describe("the headline number from the brief", () => {
  it("counts 255 ft of vertical across thirty receptacle drops", () => {
    const verticals = verticalsForRun(
      {
        kind: DISTRIBUTION_KIND,
        endInches: null,
        distributionInches: DISTRIBUTION_10FT,
      },
      {
        kind: "receptacle",
        endInches: RECEPTACLE,
        distributionInches: DISTRIBUTION_10FT,
      }
    );
    const totals = totalQuantities(
      Array.from({ length: 30 }, () => ({
        run: RUN_100FT,
        circuits: [],
        ratio: QUARTER_INCH,
        verticals,
      }))
    );
    expect(totals.conduitVerticalFeet).toBe(255);
    expect(totals.conduitFeet).toBe(3255); // 3,000 traced + 255 nobody could see
    expect(totals.flatOnlyCount).toBe(0);
  });
});

// ── The double-count rule ────────────────────────────────────────────────────

describe("a vertical belongs to the run or the stamp, never both", () => {
  /**
   * The stamp in these tests carries REAL footage, which is the point.
   *
   * Stamps do not carry verticals until Phase 8, so a test written against
   * today's zero would pass without ever being able to fail — worse than no
   * test, because it reads as protection. Feeding a non-zero stamp vertical is
   * what makes this suite fail the day the rule goes missing.
   */
  const RUN_WITH_DROP = {
    verticalFeet: 8.5,
    startStampId: null,
    endStampId: 41,
  };
  const STAMPED_RECEPTACLE = { stampId: 41, verticalFeet: 8.5 };

  it("drops the stamp's vertical when a run already carries it", () => {
    const totals = totalVerticalFeet({
      runs: [RUN_WITH_DROP],
      stamps: [STAMPED_RECEPTACLE],
    });
    expect(totals.runFeet).toBe(8.5);
    expect(totals.stampFeet).toBe(0);
    expect(totals.totalFeet).toBe(8.5); // NOT 17 — that is the bug
    expect(totals.ownedByRuns).toEqual([41]);
  });

  it("counts a stamp that no run claims", () => {
    // A fixture whip, or a device dropped off a homerun nobody traced. This is
    // the other half of the rule: suppressing these would lose real footage.
    const totals = totalVerticalFeet({
      runs: [RUN_WITH_DROP],
      stamps: [STAMPED_RECEPTACLE, { stampId: 99, verticalFeet: 6 }],
    });
    expect(totals.stampFeet).toBe(6);
    expect(totals.totalFeet).toBe(14.5);
  });

  it("claims a stamp at either end of a run", () => {
    const claimed = stampsClaimedByRuns([
      { startStampId: 7, endStampId: null },
      { startStampId: null, endStampId: 8 },
      { startStampId: null, endStampId: null },
    ]);
    expect([...claimed].sort()).toEqual([7, 8]);
  });

  it("does not double-suppress a stamp two runs both claim", () => {
    // A junction box where one run ends and the next begins. The stamp is
    // dropped once, not subtracted twice.
    const totals = totalVerticalFeet({
      runs: [
        { verticalFeet: 2, startStampId: null, endStampId: 5 },
        { verticalFeet: 2, startStampId: 5, endStampId: null },
      ],
      stamps: [{ stampId: 5, verticalFeet: 2 }],
    });
    expect(totals.runFeet).toBe(4);
    expect(totals.stampFeet).toBe(0);
    expect(totals.totalFeet).toBe(4);
  });

  it("counts every stamp when no run links to anything", () => {
    const totals = totalVerticalFeet({
      runs: [{ verticalFeet: 0, startStampId: null, endStampId: null }],
      stamps: [
        { stampId: 1, verticalFeet: 3 },
        { stampId: 2, verticalFeet: 3 },
      ],
    });
    expect(totals.stampFeet).toBe(6);
    expect(totals.ownedByRuns).toEqual([]);
  });
});

// ── The promise made to every bid that already exists ────────────────────────

describe("a bid with no heights set reads exactly as it did before", () => {
  const circuits: RunCircuit[] = [
    { name: "Ckt 1", conductorCount: 3 },
    { name: "Ckt 2", conductorCount: 2 },
  ];

  it("produces the same quantities with verticals omitted", () => {
    const quantities = quantitiesForRun(
      RUN_100FT,
      circuits,
      QUARTER_INCH,
      NO_VERTICALS
    )!;
    expect(quantities.runFeet).toBe(100);
    expect(quantities.conduitFeet).toBe(100);
    expect(quantities.totalWireFeet).toBe(500); // 300 + 200, exactly as before
    expect(quantities.verticalFeet).toBe(0);
    expect(quantities.verticals).toBeNull();
  });

  it("produces the same quantities when the gate is shut but ends are picked", () => {
    // Every run on the job says panel → receptacle, and no distribution height
    // has been entered. Nothing is counted, and nothing is invented.
    const verticals = verticalsForRun(
      { kind: "panel", endInches: 72, distributionInches: null },
      { kind: "receptacle", endInches: 18, distributionInches: null }
    );
    const quantities = quantitiesForRun(
      RUN_100FT,
      circuits,
      QUARTER_INCH,
      verticals
    )!;
    expect(quantities.verticalFeet).toBe(0);
    expect(quantities.conduitFeet).toBe(100);
    expect(quantities.totalWireFeet).toBe(500);
  });

  it("totals a whole bid unchanged, and says how many runs are flat only", () => {
    const totals = totalQuantities([
      {
        run: RUN_100FT,
        circuits,
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
      {
        run: RUN_100FT,
        circuits: [],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.conduitFeet).toBe(200);
    expect(totals.wireFeet).toBe(500);
    expect(totals.conduitVerticalFeet).toBe(0);
    expect(totals.wireVerticalFeet).toBe(0);
    // The zero has to shout: the panel can say "2 runs are counted flat only"
    // rather than leaving a quietly low total to be noticed.
    expect(totals.flatOnlyCount).toBe(2);
    expect(totals.unmeasurableCount).toBe(0);
  });

  it("does not count an unmeasurable run as flat-only", () => {
    // Two different problems. One needs a scale, the other needs a height, and
    // reporting them as one number would send the estimator to the wrong screen.
    const totals = totalQuantities([
      { run: RUN_100FT, circuits: [], ratio: null, verticals: NO_VERTICALS },
      {
        run: RUN_100FT,
        circuits: [],
        ratio: QUARTER_INCH,
        verticals: NO_VERTICALS,
      },
    ]);
    expect(totals.unmeasurableCount).toBe(1);
    expect(totals.flatOnlyCount).toBe(1);
  });
});

// ── The list both the settings screen and the pickers read ───────────────────

describe("the merged heights list", () => {
  it("is the shipped list when a company has decided nothing", () => {
    const rows = heightList({ company: [] });
    expect(rows).toHaveLength(SHIPPED_HEIGHT_TYPES.length);
    expect(rows.every(r => r.isShipped)).toBe(true);
    const receptacle = rows.find(r => r.typeKey === "receptacle")!;
    expect(receptacle).toMatchObject({ heightInches: 18, source: "shipped" });
  });

  it("shows a panel as not set rather than as zero", () => {
    // Zero is a real height — a floor box is at zero — so an unset type cannot
    // be reported as one. The screen says "not set, no vertical counted".
    const rows = heightList({ company: [] });
    expect(rows.find(r => r.typeKey === "panel")).toMatchObject({
      heightInches: null,
      source: "unset",
    });
    expect(rows.find(r => r.typeKey === "floor-box")).toMatchObject({
      heightInches: 0,
      source: "shipped",
    });
  });

  it("says which level the number in effect came from", () => {
    const company = [
      { typeKey: "receptacle", label: "", heightInches: 16, isActive: true },
    ];
    expect(
      heightList({ company }).find(r => r.typeKey === "receptacle")
    ).toMatchObject({ heightInches: 16, source: "company" });

    expect(
      heightList({
        company,
        job: [{ typeKey: "receptacle", heightInches: 24 }],
      }).find(r => r.typeKey === "receptacle")
    ).toMatchObject({ heightInches: 24, source: "job" });
  });

  it("keeps what resetting would give back, for a shipped type", () => {
    const rows = heightList({
      company: [
        { typeKey: "receptacle", label: "", heightInches: 16, isActive: true },
      ],
    });
    // The screen offers "reset to 1'-6"" by reading this, rather than by
    // remembering a number that could drift from what the app ships.
    expect(rows.find(r => r.typeKey === "receptacle")!.shippedInches).toBe(18);
  });

  it("puts a company's OWN type above the fold, always", () => {
    // The fold hides ours, never theirs — CLAUDE.md § Customization available,
    // but never in the way. They added it because they use it.
    const rows = heightList({
      company: [
        {
          typeKey: "exit-sign",
          label: "Exit sign",
          heightInches: 90,
          isActive: true,
        },
      ],
    });
    const exit = rows.find(r => r.typeKey === "exit-sign")!;
    expect(exit).toMatchObject({
      label: "Exit sign",
      heightInches: 90,
      source: "company",
      isShipped: false,
      common: true,
      shippedInches: null,
    });
    // ...and behind the shipped ones in the list, sorted by name among its own.
    const own = rows.filter(r => !r.isShipped).map(r => r.typeKey);
    expect(own).toEqual(["exit-sign"]);
  });

  it("sorts a company's own types by name, not by when they were added", () => {
    const rows = heightList({
      company: [
        {
          typeKey: "thermostat",
          label: "Thermostat",
          heightInches: 56,
          isActive: true,
        },
        {
          typeKey: "exit-sign",
          label: "Exit sign",
          heightInches: 90,
          isActive: true,
        },
      ],
    });
    expect(rows.filter(r => !r.isShipped).map(r => r.label)).toEqual([
      "Exit sign",
      "Thermostat",
    ]);
  });

  it("carries the retired flag through, for both kinds of type", () => {
    const rows = heightList({
      company: [
        {
          typeKey: "floor-box",
          label: "",
          heightInches: null,
          isActive: false,
        },
        {
          typeKey: "exit-sign",
          label: "Exit sign",
          heightInches: 90,
          isActive: false,
        },
      ],
    });
    expect(rows.find(r => r.typeKey === "floor-box")!.isActive).toBe(false);
    expect(rows.find(r => r.typeKey === "exit-sign")!.isActive).toBe(false);
    // Retired, not gone: a run pointing at it still resolves its height.
    expect(rows.find(r => r.typeKey === "exit-sign")!.heightInches).toBe(90);
  });
});

describe("what one end of a run is CALLED", () => {
  it("reads a shipped key as its label, never as the key", () => {
    // The fault this exists for: a run row that read
    // "junction-box-wall → ceiling-box, 12-2 MC cable".
    expect(heightTypeLabel("junction-box-wall")).toBe("Junction box, wall");
    expect(heightTypeLabel("ceiling-box")).toBe("Ceiling box / fixture");
    expect(heightTypeLabel("panel")).toBe("Panel");
  });

  it("names a company's OWN type from the row, like a shipped one", () => {
    // The rule this is defending is CLAUDE.md § Customization: their entry
    // behaves exactly like ours. Read from the shipped list alone, this key is
    // unknown and would come back slugged while every shipped type read fine —
    // a parallel path that is worse for the estimator's own work.
    const types = heightList({
      company: [
        {
          typeKey: "strut-mounted-jbox",
          label: 'J-box on strut, 10" off deck',
          heightInches: 112,
          isActive: true,
        },
      ],
    });
    expect(heightTypeLabel("strut-mounted-jbox", types)).toBe(
      'J-box on strut, 10" off deck'
    );
    // And humanising cannot stand in for it: the label has punctuation and a
    // measurement in it, so the slug does not round-trip.
    expect(heightTypeLabel("strut-mounted-jbox")).toBe("Strut mounted jbox");
  });

  it("calls a pass-through exactly what the PICKER calls it", () => {
    // Two names for one choice is how a screen stops agreeing with itself, so
    // the closed picker and a run's name read the same constant. This is the
    // test that goes red if somebody types the words out in one of them again.
    expect(heightTypeLabel(DISTRIBUTION_KIND)).toBe(DISTRIBUTION_LABEL);
    expect(DISTRIBUTION_LABEL).not.toBe(DISTRIBUTION_KIND);
  });

  it("is null when nobody has said, rather than a stand-in", () => {
    // A name built from this must be able to leave the ends out entirely.
    expect(heightTypeLabel(null)).toBe(null);
    expect(heightTypeLabel("   ")).toBe(null);
  });

  it("humanises an unknown key rather than hiding it", () => {
    // A retired type, or one from a row that has gone. Half a sentence beats a
    // run that looks unnamed.
    expect(heightTypeLabel("attic-junction")).toBe("Attic junction");
  });
});

describe("what a run is called, ends and all", () => {
  const conduit = { runTypeLiveLabel: '1/2" EMT, 2 #12 + ground' };

  it("reads as a sentence about the work, from stored keys", () => {
    expect(
      runDisplayName({ ...conduit, startKind: "panel", endKind: "receptacle" })
    ).toBe('Panel → Receptacle, 1/2" EMT, 2 #12 + ground');
  });

  it("names a company's own end type when the list is passed", () => {
    const types = heightList({
      company: [
        {
          typeKey: "pull-can",
          label: "Pull can, high bay",
          heightInches: 240,
          isActive: true,
        },
      ],
    });
    expect(
      runDisplayName(
        { ...conduit, startKind: "panel", endKind: "pull-can" },
        types
      )
    ).toBe('Panel → Pull can, high bay, 1/2" EMT, 2 #12 + ground');
  });

  it("says the pipe carries on, rather than showing the slug", () => {
    expect(
      runDisplayName({
        ...conduit,
        startKind: DISTRIBUTION_KIND,
        endKind: "switch",
      })
    ).toBe('Run height → Switch, 1/2" EMT, 2 #12 + ground');
  });

  it("drops BOTH ends when only one is answered", () => {
    // "Panel → …" reads like a bug. The type alone is a complete answer.
    expect(
      runDisplayName({ ...conduit, startKind: "panel", endKind: null })
    ).toBe('1/2" EMT, 2 #12 + ground');
  });

  it("tells two runs of the same type apart by their ends", () => {
    // The whole complaint: several runs on one sheet reading identically. Two
    // runs of ONE type going to different places must not produce one string.
    const a = runDisplayName({
      ...conduit,
      startKind: "panel",
      endKind: "receptacle",
    });
    const b = runDisplayName({
      ...conduit,
      startKind: "panel",
      endKind: "switch",
    });
    expect(a).not.toBe(b);
  });
});

describe("the two halves the run row shows on separate lines", () => {
  const conduit = { runTypeLiveLabel: '1/2" EMT, 2 #12 + ground' };

  it("keeps the type whole, commas and all", () => {
    // The reason the row cannot just split runDisplayName at a comma: every
    // type name has commas in it, so the first one is inside the TYPE on a run
    // with no ends and after the ENDS on a run with them.
    expect(runNameParts(conduit).type).toBe('1/2" EMT, 2 #12 + ground');
    expect(
      runNameParts({ ...conduit, startKind: "panel", endKind: "switch" }).type
    ).toBe('1/2" EMT, 2 #12 + ground');
  });

  it("gives the ends on their own, with no type in them", () => {
    expect(
      runNameParts({ ...conduit, startKind: "panel", endKind: "switch" }).ends
    ).toBe("Panel → Switch");
  });

  it("has no ends line at all when only one end is answered", () => {
    // Null rather than "Panel → ", so the row renders one line instead of a
    // second one that trails off.
    expect(
      runNameParts({ ...conduit, startKind: "panel", endKind: null }).ends
    ).toBe(null);
    expect(runNameParts(conduit).ends).toBe(null);
  });

  it("is what the one-line name is BUILT from, so they cannot disagree", () => {
    // The joined sentence reads the halves rather than the halves re-deriving
    // the sentence. This is the assertion that goes red if someone reorders one
    // of them and not the other.
    for (const run of [
      conduit,
      { ...conduit, startKind: "panel", endKind: "receptacle" },
      { ...conduit, startKind: DISTRIBUTION_KIND, endKind: "ceiling-box" },
      { runTypeLiveLabel: null, runTypeLabel: null, name: "Run on Sheet 3" },
    ]) {
      const { type, ends } = runNameParts(run);
      expect(runDisplayName(run)).toBe(ends ? `${ends}, ${type}` : type);
    }
  });
});

describe("naming a new height type", () => {
  it("makes a readable key from the label", () => {
    expect(slugForHeightType("Exit sign", new Set())).toBe("exit-sign");
    expect(slugForHeightType('Stub-up @ 6"', new Set())).toBe("stub-up-6");
  });

  it("never lands on a shipped key", () => {
    // Otherwise "Panel" typed as a new type would silently become an override
    // of the shipped panel, and every run pointing at one would move.
    expect(slugForHeightType("Panel", new Set())).toBe("panel-2");
  });

  it("never lands on one this company already has", () => {
    expect(slugForHeightType("Exit sign", new Set(["exit-sign"]))).toBe(
      "exit-sign-2"
    );
  });

  it("still produces a key for a label with nothing usable in it", () => {
    expect(slugForHeightType("!!!", new Set())).toBe("type");
  });
});

// ── When the app asks about a nearby stamp ───────────────────────────────────

describe("suggesting that a stamp is this run's own device", () => {
  const NEARBY = {
    endVerticalCounted: true,
    endStampId: null,
    distanceInches: 6,
  };

  it("asks when a run counts a drop and a stamp sits on that end", () => {
    expect(shouldSuggestStampLink(NEARBY)).toBe(true);
  });

  it("stays quiet when the run counts nothing at that end", () => {
    // No drop, no possible double count, nothing to decide. A chip here would
    // be asking about a problem that does not exist.
    expect(
      shouldSuggestStampLink({ ...NEARBY, endVerticalCounted: false })
    ).toBe(false);
  });

  it("stays quiet once a stamp is already linked", () => {
    // The question is answered. Re-asking is how a confirmed answer gets
    // un-confirmed — see § 5c on not re-opening what somebody has said yes to.
    expect(shouldSuggestStampLink({ ...NEARBY, endStampId: 41 })).toBe(false);
  });

  it("stays quiet when the nearest stamp is not near", () => {
    expect(shouldSuggestStampLink({ ...NEARBY, distanceInches: 25 })).toBe(
      false
    );
    expect(shouldSuggestStampLink({ ...NEARBY, distanceInches: 24 })).toBe(
      true
    );
  });

  it("stays quiet when the distance cannot be known", () => {
    // No scale on the sheet. A run can still carry a vertical — that is pure
    // arithmetic — but nothing can say what is NEAR it.
    expect(shouldSuggestStampLink({ ...NEARBY, distanceInches: null })).toBe(
      false
    );
  });

  it("measures in real inches, so the range means the same on every sheet", () => {
    // Two feet is two feet whether the sheet is 1/4" = 1'-0" or 1" = 100'.
    expect(SUGGEST_WITHIN_INCHES).toBe(24);
  });
});

// ── The four levels, as the routers actually resolve them ────────────────────

describe("resolving a stored run's verticals", () => {
  /** Company runs at 10 ft; receptacles at the shipped 18". */
  const COMPANY: HeightContext = {
    companyInches: 120,
    jobInches: null,
    layers: { company: new Map(), job: new Map() },
  };

  const PANEL_TO_RECEPTACLE = {
    startKind: DISTRIBUTION_KIND,
    endKind: "receptacle",
    startHeightInches: null,
    endHeightInches: null,
    distributionHeightInches: null,
  };

  it("drops to a receptacle from the company's run height", () => {
    const verticals = verticalsForRunRow(PANEL_TO_RECEPTACLE, COMPANY);
    expect(verticals.feet).toBe(8.5);
  });

  it("counts nothing at all while the gate is shut", () => {
    // Every run on the job says panel → receptacle and no height is set
    // anywhere. This is what every existing bid looks like.
    expect(
      verticalsForRunRow(PANEL_TO_RECEPTACLE, EMPTY_HEIGHT_CONTEXT).feet
    ).toBe(0);
  });

  it("lets the job's run height beat the company's", () => {
    // 12 ft ceilings on this job: the drop grows by the difference, on every
    // run, without anybody editing a run.
    const verticals = verticalsForRunRow(PANEL_TO_RECEPTACLE, {
      ...COMPANY,
      jobInches: 144,
    });
    expect(verticals.feet).toBe(10.5);
  });

  it("lets one run sit at its own elevation", () => {
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, distributionHeightInches: 96 },
      { ...COMPANY, jobInches: 144 }
    );
    expect(verticals.feet).toBe(6.5);
  });

  it("lets the job override one device height", () => {
    // Receptacles at 2 ft on this job. 10 ft down to 2 ft is 8 ft, not 8.5.
    const verticals = verticalsForRunRow(PANEL_TO_RECEPTACLE, {
      ...COMPANY,
      layers: { company: new Map(), job: new Map([["receptacle", 24]]) },
    });
    expect(verticals.feet).toBe(8);
  });

  it("lets ONE run override the height without touching the settings", () => {
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, endHeightInches: 48 },
      COMPANY
    );
    expect(verticals.feet).toBe(6);
  });

  it("adds nothing at an end nobody has answered", () => {
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, endKind: null },
      COMPANY
    );
    expect(verticals.feet).toBe(0);
    expect(verticals.end.counted).toBe(false);
  });

  it("adds nothing at a junction box the run passes through", () => {
    // Trap 2: a continuing run must not collect a phantom rise out of the box
    // the previous run dropped into.
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, endKind: DISTRIBUTION_KIND },
      COMPANY
    );
    expect(verticals.feet).toBe(0);
  });

  it("says which problem a panel with no height is", () => {
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, endKind: "panel" },
      COMPANY
    );
    expect(verticals.end.counted).toBe(false);
    expect(!verticals.end.counted && verticals.end.reason).toBe(
      "height-not-set"
    );
  });

  it("counts both ends of a panel-to-receptacle run", () => {
    const verticals = verticalsForRunRow(
      { ...PANEL_TO_RECEPTACLE, startKind: "panel" },
      {
        ...COMPANY,
        layers: { company: new Map([["panel", 72]]), job: new Map() },
      }
    );
    expect(verticals.start.counted && verticals.start.feet).toBe(4);
    expect(verticals.end.counted && verticals.end.feet).toBe(8.5);
    expect(verticals.feet).toBe(12.5);
  });
});
