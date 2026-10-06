/**
 * Job close-out: the comparison, and the suggestion that must never fire itself.
 *
 * ── Four things this has to get right ────────────────────────────────────────
 *   1. The comparison is arithmetic a contractor will check by hand, so the
 *      fixtures are round numbers and the expected figures are written out
 *      rather than computed by the same code under test.
 *
 *   2. A suggestion NEVER applies itself. That is the whole design, so it is
 *      tested as an invariant rather than as a behaviour: after every path
 *      through the router that is not an explicit accept, the assembly's base
 *      hours are asserted unchanged.
 *
 *   3. Suggestion history is per company, even for a SHARED assembly. Starter
 *      assemblies have `userId = NULL` and appear in every company's library,
 *      so two contractors' close-outs can both reference assembly 412. This is
 *      the cross-company leak with the most surface, and it gets its own block.
 *
 *   4. A bid that is never closed out is untouched. Closing out is optional and
 *      has to STAY optional — a bid with no close-out must price, roll up and
 *      read exactly as it did before this feature existed.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyHourSuggestions,
  bidCloseouts,
  bids,
  users,
} from "../drizzle/schema";
import {
  MIN_SAMPLES_FOR_SUGGESTION,
  ON_TARGET_BAND,
  SUGGESTION_THRESHOLD,
  closeoutActualHours,
  compareHours,
  describeSuggestion,
  impliedProductivity,
  suggestHours,
} from "../shared/closeout";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { assemblyHours } from "../shared/assemblyHours";

const USER = 9701;
const OTHER = 9702;
const ALL = [USER, OTHER];
dropFixtureUsersAfterAll(ALL);

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-closeout-${userId}`,
      role: "user",
      accessTier: "standard",
    },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);
const uniq = () => `${Date.now()}${Math.random()}`;

// ── The arithmetic ───────────────────────────────────────────────────────────

describe("estimate against actual", () => {
  it("reports a job that ran long", () => {
    const v = compareHours(100, 115);
    expect(v.deltaHours).toBe(15);
    expect(v.deltaPct).toBe(0.15);
    expect(v.direction).toBe("over");
  });

  it("reports a job that came in under", () => {
    const v = compareHours(100, 80);
    expect(v.deltaHours).toBe(-20);
    expect(v.deltaPct).toBe(-0.2);
    expect(v.direction).toBe("under");
  });

  it("calls a small difference on target rather than crying wolf", () => {
    // Nobody estimates hours to better than a few percent, so flagging 2%
    // would flag nearly every job and teach people to ignore the indicator.
    expect(compareHours(100, 102).direction).toBe("onTarget");
    expect(compareHours(100, 98).direction).toBe("onTarget");
    expect(ON_TARGET_BAND).toBe(0.05);
    // Just outside the band is a real reading again.
    expect(compareHours(100, 106).direction).toBe("over");
  });

  it("refuses a percentage of nothing rather than returning Infinity", () => {
    const v = compareHours(0, 12);
    expect(v.deltaPct).toBeNull();
    expect(v.deltaHours).toBe(12);
    expect(v.direction).toBe("over");
  });

  it("is not upset by a job with no hours at either end", () => {
    const v = compareHours(0, 0);
    expect(v.deltaPct).toBeNull();
    expect(v.direction).toBe("onTarget");
  });

  it("reads the productivity factor the estimate would have needed", () => {
    // The same number the pricing engine multiplies by:
    // hours × (1 + modifiers) × (1 + productivity).
    expect(impliedProductivity(100, 115)).toBe(0.15);
    expect(impliedProductivity(100, 90)).toBe(-0.1);
    expect(impliedProductivity(0, 40)).toBeNull();
  });
});

describe("which number is the actual", () => {
  const lines = [
    {
      assemblyId: 1,
      assemblyName: "A",
      estimatedHours: 10,
      actualHours: 12,
    },
    {
      assemblyId: 2,
      assemblyName: "B",
      estimatedHours: 20,
      actualHours: 18,
    },
  ];

  it("takes the typed figure in total mode", () => {
    expect(closeoutActualHours("total", 42, [])).toBe(42);
  });

  it("sums the lines in by-assembly mode, ignoring any typed total", () => {
    // There is deliberately no path where a typed total sits beside lines that
    // disagree with it.
    expect(closeoutActualHours("byAssembly", 999, lines)).toBe(30);
  });

  it("treats a missing total as zero rather than as NaN", () => {
    expect(closeoutActualHours("total", null, [])).toBe(0);
  });
});

// ── When a suggestion is warranted ───────────────────────────────────────────

describe("suggesting a change to base hours", () => {
  const over = (n: number) =>
    Array.from({ length: n }, () => ({ estimatedHours: 10, actualHours: 12 }));

  it("says nothing until there is enough evidence", () => {
    expect(suggestHours(2, over(MIN_SAMPLES_FOR_SUGGESTION - 1))).toBeNull();
    expect(suggestHours(2, over(MIN_SAMPLES_FOR_SUGGESTION))).not.toBeNull();
  });

  it("scales the CURRENT library hours by the observed ratio", () => {
    // Not the mean of the actuals: those differ once the library has been
    // edited since the jobs closed, and scaling is the one that still means
    // "whatever you have it at, it runs 20% long".
    const s = suggestHours(2, over(4))!;
    expect(s.ratio).toBe(1.2);
    expect(s.currentHours).toBe(2);
    expect(s.suggestedHours).toBe(2.4);
    expect(s.direction).toBe("over");
    expect(s.sampleSize).toBe(4);
  });

  it("says nothing about a difference inside the noise", () => {
    const slight = Array.from({ length: 5 }, () => ({
      estimatedHours: 100,
      actualHours: 105,
    }));
    expect(Math.abs(105 / 100 - 1)).toBeLessThan(SUGGESTION_THRESHOLD);
    expect(suggestHours(4, slight)).toBeNull();
  });

  it("refuses to call variance a trend", () => {
    // Two jobs 40% over and two 40% under is an assembly used on jobs that
    // differ, not an assembly whose base hours are wrong. A mean alone would
    // report a confident nothing — or worse, a small trend.
    const mixed = [
      { estimatedHours: 10, actualHours: 14 },
      { estimatedHours: 10, actualHours: 14 },
      { estimatedHours: 10, actualHours: 6 },
      { estimatedHours: 10, actualHours: 6 },
    ];
    expect(suggestHours(2, mixed)).toBeNull();
  });

  it("suggests when most of the evidence agrees, not all of it", () => {
    const mostly = [
      { estimatedHours: 10, actualHours: 13 },
      { estimatedHours: 10, actualHours: 14 },
      { estimatedHours: 10, actualHours: 13 },
      { estimatedHours: 10, actualHours: 9 },
    ];
    const s = suggestHours(2, mostly)!;
    expect(s).not.toBeNull();
    expect(s.consistency).toBe(0.75);
  });

  it("ignores a sample with no estimate to compare against", () => {
    const withJunk = [...over(3), { estimatedHours: 0, actualHours: 50 }];
    const s = suggestHours(2, withJunk)!;
    expect(s.sampleSize).toBe(3); // the junk one is not counted
    expect(s.ratio).toBe(1.2);
  });

  it("says nothing when the suggestion rounds to what is already there", () => {
    // On small hour counts a 10% change can be less than a rounding step, and
    // a card proposing 0.5 → 0.5 is noise.
    const s = suggestHours(0.02, over(4));
    expect(s).toBeNull();
  });

  it("says nothing when the library has no hours to scale", () => {
    expect(suggestHours(0, over(5))).toBeNull();
  });

  it("describes itself in a sentence someone can act on", () => {
    const s = suggestHours(2, over(4))!;
    const text = describeSuggestion("Duplex receptacle", s);
    expect(text).toContain("Duplex receptacle");
    expect(text).toContain("20% over");
    expect(text).toContain("4 closed-out jobs");
    expect(text).toContain("2 → 2.4");
  });
});

// ── Against the real stack ───────────────────────────────────────────────────

describeDb("closing a job out", () => {
  async function pricedAssembly(hours: number, name = `Asm ${uniq()}`) {
    const rates = await caller().laborRates.list();
    const rate = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 50,
      })
    ).laborRate!;
    const created = await caller().assemblies.create({
      name,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: hours,
      laborRateId: rate.id,
      materials: [],
      modifierIds: [],
    });
    return created!.id;
  }

  async function bidWith(assemblyId: number, qty: number, userId = USER) {
    const bid = await callerFor(userId).bids.create({
      name: `Closeout bid ${uniq()}`,
      trades: ["electrical"],
    });
    await callerFor(userId).bids.addAssembly({
      bidId: bid!.id,
      assemblyId,
      qty,
    });
    return bid!.id;
  }

  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of ALL) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database.insert(users).values({
          id,
          openId: `test-closeout-${id}`,
          name: `Closeout user ${id}`,
        });
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(bids).where(inArray(bids.userId, ALL));
    await database
      .delete(assemblyHourSuggestions)
      .where(inArray(assemblyHourSuggestions.userId, ALL));
    await database.delete(assemblies).where(inArray(assemblies.userId, ALL));
  });

  it("has nothing to show for a bid nobody closed out", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    const state = await caller().closeout.get({ bidId });
    expect(state.closeout).toBeNull();
    expect(state.variance).toBeNull();
    // …but hands back the estimate so the form can be filled against it.
    expect(state.estimate!.totalHours).toBe(20);
    expect(state.estimate!.lines).toHaveLength(1);
  });

  /**
   * A close-out has to stay EDITABLE, and this is what stopped it being so.
   *
   * `get` used to return `estimate: null` the moment anything was recorded, and
   * the panel builds its per-assembly form from those lines. So a bid with two
   * dozen assemblies answered "This bid has no assemblies to break down" as
   * soon as a total was saved: a total-mode close-out could never be switched
   * to per-assembly, and a per-assembly one could not be corrected without
   * deleting the whole record and re-keying every line.
   *
   * Per-assembly is the mode that feeds the suggestion engine, so this was the
   * shortest path to nobody logging actuals at all.
   */
  it("still offers the estimate after a total has been recorded", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 23,
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.closeout).not.toBeNull();
    // The whole point: the form can still be built, so the mode can change.
    expect(state.estimate).not.toBeNull();
    expect(state.estimate!.lines).toHaveLength(1);
    expect(state.estimate!.totalHours).toBe(20);
  });

  it("still offers the estimate after a per-assembly close-out", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    await caller().closeout.save({
      bidId,
      mode: "byAssembly",
      lines: [
        {
          assemblyId: asm,
          assemblyName: "Asm",
          qty: 10,
          estimatedHours: 20,
          actualHours: 26,
        },
      ],
    });

    const state = await caller().closeout.get({ bidId });
    // Recorded lines are what WAS written down, and carry their own ids so the
    // form can key on them without colliding when a bid repeats an assembly.
    expect(state.lines).toHaveLength(1);
    expect(Number(state.lines[0].actualHours)).toBe(26);
    expect(state.lines[0].id).toBeGreaterThan(0);
    // And the estimate is still there to record against.
    expect(state.estimate!.lines).toHaveLength(1);
  });

  it("lets a recorded per-assembly close-out be corrected", async () => {
    // The end-to-end version: record, then change one figure, and the record
    // moves rather than being refused for having nothing to save.
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);
    const line = {
      assemblyId: asm,
      assemblyName: "Asm",
      qty: 10,
      estimatedHours: 20,
    };

    await caller().closeout.save({
      bidId,
      mode: "byAssembly",
      lines: [{ ...line, actualHours: 26 }],
    });
    await caller().closeout.save({
      bidId,
      mode: "byAssembly",
      lines: [{ ...line, actualHours: 22 }],
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.lines).toHaveLength(1);
    expect(Number(state.lines[0].actualHours)).toBe(22);
    expect(state.variance!.actualHours).toBe(22);
  });

  it("records a total and compares it to the estimate", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10); // 20 estimated hours

    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 23,
      notes: "Rain held us up on the Tuesday.",
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.closeout!.mode).toBe("total");
    expect(state.variance!.estimatedHours).toBe(20);
    expect(state.variance!.actualHours).toBe(23);
    expect(state.variance!.deltaHours).toBe(3);
    expect(state.variance!.deltaPct).toBe(0.15);
    expect(state.variance!.direction).toBe("over");
    expect(state.impliedProductivity).toBe(0.15);
    expect(state.closeout!.notes).toContain("Rain");
  });

  it("records a breakdown by assembly and sums it", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    await caller().closeout.save({
      bidId,
      mode: "byAssembly",
      lines: [
        {
          assemblyId: asm,
          assemblyName: "Part one",
          qty: 6,
          estimatedHours: 12,
          actualHours: 15,
        },
        {
          assemblyId: asm,
          assemblyName: "Part two",
          qty: 4,
          estimatedHours: 8,
          actualHours: 7,
        },
      ],
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.variance!.actualHours).toBe(22);
    expect(state.lines).toHaveLength(2);
    expect(state.lines[0].variance.direction).toBe("over");
    expect(state.lines[1].variance.direction).toBe("under");
  });

  it("freezes the estimate, so editing the library later cannot rewrite history", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);
    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 22,
    });

    // Double the assembly's hours after the fact.
    await caller().assemblies.update({ id: asm, baseLaborHours: 4 });

    const state = await caller().closeout.get({ bidId });
    // Still 20. A measurement that changes when you adjust the instrument is
    // not a measurement.
    expect(state.variance!.estimatedHours).toBe(20);
  });

  it("restates a close-out rather than stacking a second one", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 30,
    });
    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 25,
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.variance!.actualHours).toBe(25);

    const database = await getDb();
    const rows = await database!
      .select()
      .from(bidCloseouts)
      .where(eq(bidCloseouts.bidId, bidId));
    expect(rows).toHaveLength(1);
  });

  it("drops the lines when a by-assembly close-out becomes a total", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);

    await caller().closeout.save({
      bidId,
      mode: "byAssembly",
      lines: [
        {
          assemblyId: asm,
          assemblyName: "Only",
          qty: 10,
          estimatedHours: 20,
          actualHours: 26,
        },
      ],
    });
    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 21,
    });

    const state = await caller().closeout.get({ bidId });
    expect(state.lines).toHaveLength(0);
    expect(state.variance!.actualHours).toBe(21);
  });

  it("can be undone", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);
    await caller().closeout.save({
      bidId,
      mode: "total",
      totalActualHours: 25,
    });
    await caller().closeout.remove({ bidId });
    expect((await caller().closeout.get({ bidId })).closeout).toBeNull();
  });

  it("refuses a mode with nothing in it", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);
    await expect(
      caller().closeout.save({ bidId, mode: "total" })
    ).rejects.toThrow(/hours the job took/i);
    await expect(
      caller().closeout.save({ bidId, mode: "byAssembly", lines: [] })
    ).rejects.toThrow(/at least one assembly/i);
  });

  it("refuses to close out another company's bid", async () => {
    const asm = await pricedAssembly(2);
    const bidId = await bidWith(asm, 10);
    await expect(
      callerFor(OTHER).closeout.save({
        bidId,
        mode: "total",
        totalActualHours: 5,
      })
    ).rejects.toThrow(/not found/i);
  });
});

// ── The invariant: nothing applies itself ────────────────────────────────────

describeDb("a suggestion never applies itself", () => {
  async function assemblyRunningLong(hours = 2) {
    const rates = await caller().laborRates.list();
    const rate = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 50,
      })
    ).laborRate!;
    const asm = await caller().assemblies.create({
      name: `Overrunning ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: hours,
      laborRateId: rate.id,
      materials: [],
      modifierIds: [],
    });

    // Four closed-out jobs, each 20% over. Enough evidence to suggest.
    for (let i = 0; i < 4; i++) {
      const bid = await caller().bids.create({
        name: `Overrun job ${i} ${uniq()}`,
        trades: ["electrical"],
      });
      await caller().bids.addAssembly({
        bidId: bid!.id,
        assemblyId: asm!.id,
        qty: 5,
      });
      await caller().closeout.save({
        bidId: bid!.id,
        mode: "byAssembly",
        lines: [
          {
            assemblyId: asm!.id,
            assemblyName: asm!.name,
            qty: 5,
            estimatedHours: 10,
            actualHours: 12,
          },
        ],
      });
    }
    return asm!.id;
  }

  const baseHours = async (id: number) => {
    const database = await getDb();
    const [row] = await database!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, id));
    return Number(row.baseLaborHours);
  };

  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of ALL) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database
          .insert(users)
          .values({ id, openId: `test-closeout-${id}`, name: `User ${id}` });
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(bids).where(inArray(bids.userId, ALL));
    await database
      .delete(assemblyHourSuggestions)
      .where(inArray(assemblyHourSuggestions.userId, ALL));
    await database.delete(assemblies).where(inArray(assemblies.userId, ALL));
  });

  it("raises a suggestion once the evidence is there", async () => {
    const asm = await assemblyRunningLong(2);
    const pending = await caller().closeout.suggestions();
    const mine = pending.find(s => s.assemblyId === asm)!;
    expect(mine).toBeDefined();
    expect(Number(mine.suggestedHours)).toBe(2.4);
    expect(mine.sampleSize).toBe(4);
    expect(mine.status).toBe("pending");
  });

  it("leaves the assembly ALONE while the suggestion is pending", async () => {
    // The invariant. Four overrunning jobs have been recorded and a suggestion
    // is on screen; the library must be exactly where the user left it.
    const asm = await assemblyRunningLong(2);
    expect(await baseHours(asm)).toBe(2);
  });

  it("changes the assembly only when a person accepts", async () => {
    const asm = await assemblyRunningLong(2);
    expect(await baseHours(asm)).toBe(2);

    const pending = await caller().closeout.suggestions();
    const mine = pending.find(s => s.assemblyId === asm)!;
    await caller().closeout.respond({ id: mine.id, action: "accept" });

    expect(await baseHours(asm)).toBe(2.4);
  });

  it("leaves the assembly alone when a person dismisses", async () => {
    const asm = await assemblyRunningLong(2);
    const pending = await caller().closeout.suggestions();
    const mine = pending.find(s => s.assemblyId === asm)!;
    await caller().closeout.respond({ id: mine.id, action: "dismiss" });

    expect(await baseHours(asm)).toBe(2);
    expect(await caller().closeout.suggestions()).toHaveLength(0);
  });

  it("does not ask again after a dismissal, however much evidence arrives", async () => {
    const asm = await assemblyRunningLong(2);
    const pending = await caller().closeout.suggestions();
    await caller().closeout.respond({
      id: pending.find(s => s.assemblyId === asm)!.id,
      action: "dismiss",
    });

    // Two more overrunning jobs.
    for (let i = 0; i < 2; i++) {
      const bid = await caller().bids.create({
        name: `More overrun ${i} ${uniq()}`,
        trades: ["electrical"],
      });
      await caller().bids.addAssembly({
        bidId: bid!.id,
        assemblyId: asm,
        qty: 5,
      });
      await caller().closeout.save({
        bidId: bid!.id,
        mode: "byAssembly",
        lines: [
          {
            assemblyId: asm,
            assemblyName: "Overrunning",
            qty: 5,
            estimatedHours: 10,
            actualHours: 12,
          },
        ],
      });
    }

    // A user who has said "I know why those ran long" is not asked again.
    expect(await caller().closeout.suggestions()).toHaveLength(0);
    expect(await baseHours(asm)).toBe(2);
  });

  it("withdraws a suggestion whose evidence stops supporting it", async () => {
    const asm = await assemblyRunningLong(2);
    expect(await caller().closeout.suggestions()).toHaveLength(1);

    // Four jobs that come in well under drag the ratio back inside the band.
    for (let i = 0; i < 4; i++) {
      const bid = await caller().bids.create({
        name: `Recovered ${i} ${uniq()}`,
        trades: ["electrical"],
      });
      await caller().bids.addAssembly({
        bidId: bid!.id,
        assemblyId: asm,
        qty: 5,
      });
      await caller().closeout.save({
        bidId: bid!.id,
        mode: "byAssembly",
        lines: [
          {
            assemblyId: asm,
            assemblyName: "Overrunning",
            qty: 5,
            estimatedHours: 10,
            actualHours: 8,
          },
        ],
      });
    }

    expect(await caller().closeout.suggestions()).toHaveLength(0);
  });

  it("refuses to answer a suggestion twice", async () => {
    const asm = await assemblyRunningLong(2);
    const mine = (await caller().closeout.suggestions()).find(
      s => s.assemblyId === asm
    )!;
    await caller().closeout.respond({ id: mine.id, action: "accept" });
    await expect(
      caller().closeout.respond({ id: mine.id, action: "accept" })
    ).rejects.toThrow(/already been answered/i);
  });

  it("does not disturb bids already priced from the old hours", async () => {
    const asm = await assemblyRunningLong(2);
    const bid = await caller().bids.create({
      name: `Untouched ${uniq()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId: asm,
      qty: 3,
    });
    const before = await caller().bids.get({ id: bid!.id });

    const mine = (await caller().closeout.suggestions()).find(
      s => s.assemblyId === asm
    )!;
    await caller().closeout.respond({ id: mine.id, action: "accept" });

    const after = await caller().bids.get({ id: bid!.id });
    // The line's snapshot is frozen — that is what the snapshot is for.
    expect(after.totals.totalLaborHours).toBe(before.totals.totalLaborHours);
    expect(after.totals.finalPrice).toBe(before.totals.finalPrice);
  });
});

// ── Cross-company ────────────────────────────────────────────────────────────

describeDb("one company's field data never reaches another", () => {
  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of ALL) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database
          .insert(users)
          .values({ id, openId: `test-closeout-${id}`, name: `User ${id}` });
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(bids).where(inArray(bids.userId, ALL));
    await database
      .delete(assemblyHourSuggestions)
      .where(inArray(assemblyHourSuggestions.userId, ALL));
    await database.delete(assemblies).where(inArray(assemblies.userId, ALL));
  });

  /**
   * A STARTER assembly, which both companies share.
   *
   * This is the case with the leak in it: `userId = NULL`, one row, visible to
   * everybody. Company A closing jobs out against it must not produce a
   * suggestion in company B's account, and accepting must not move the shared
   * row.
   */
  async function sharedStarter() {
    const list = await caller().assemblies.list();
    // One WITH hours: since 0123 the shipped starters include 159 whose hours
    // are not set, and those get no suggestion by design (nothing to scale —
    // closeoutRouter `recomputeSuggestions`). "The first starter" became one
    // of them, and every case here failed for a reason no company can meet.
    const starter = list.find(
      a => a.userId === null && assemblyHours(a.baseLaborHours) !== null
    );
    expect(starter, "expected a shipped starter assembly").toBeDefined();
    return starter!;
  }

  async function closeOutAgainst(
    userId: number,
    assemblyId: number,
    times: number,
    actualHours: number
  ) {
    for (let i = 0; i < times; i++) {
      const bid = await callerFor(userId).bids.create({
        name: `Shared job ${i} ${uniq()}`,
        trades: ["electrical"],
      });
      await callerFor(userId).bids.addAssembly({
        bidId: bid!.id,
        assemblyId,
        qty: 5,
      });
      await callerFor(userId).closeout.save({
        bidId: bid!.id,
        mode: "byAssembly",
        lines: [
          {
            assemblyId,
            assemblyName: "Shared starter",
            qty: 5,
            estimatedHours: 10,
            actualHours,
          },
        ],
      });
    }
  }

  it("keeps suggestions for a SHARED assembly in the company that earned them", async () => {
    const starter = await sharedStarter();

    // Company A's crews run 30% long on it. Company B does nothing.
    await closeOutAgainst(USER, starter.id, 4, 13);

    const mine = await caller().closeout.suggestions();
    const theirs = await callerFor(OTHER).closeout.suggestions();

    expect(mine.some(s => s.assemblyId === starter.id)).toBe(true);
    expect(theirs).toHaveLength(0);
  });

  it("does not let one company's close-outs count toward another's evidence", async () => {
    const starter = await sharedStarter();

    // Two jobs each — neither company alone reaches the sample floor, and the
    // two must not be pooled into one that does.
    await closeOutAgainst(USER, starter.id, 2, 13);
    await closeOutAgainst(OTHER, starter.id, 2, 13);

    expect(await caller().closeout.suggestions()).toHaveLength(0);
    expect(await callerFor(OTHER).closeout.suggestions()).toHaveLength(0);
  });

  it("forks on accept, so the shared starter is never moved", async () => {
    const starter = await sharedStarter();
    const originalHours = Number(starter.baseLaborHours);
    await closeOutAgainst(USER, starter.id, 4, 13);

    const mine = (await caller().closeout.suggestions()).find(
      s => s.assemblyId === starter.id
    )!;
    await caller().closeout.respond({ id: mine.id, action: "accept" });

    // The shipped row is untouched…
    const database = await getDb();
    const [shared] = await database!
      .select()
      .from(assemblies)
      .where(eq(assemblies.id, starter.id));
    expect(Number(shared.baseLaborHours)).toBe(originalHours);

    // …and company B still sees the original.
    const theirList = await callerFor(OTHER).assemblies.list();
    const theirCopy = theirList.find(
      a => a.id === starter.id || a.baselineId === starter.id
    )!;
    expect(Number(theirCopy.baseLaborHours)).toBe(originalHours);
  });

  it("cannot answer another company's suggestion", async () => {
    const starter = await sharedStarter();
    await closeOutAgainst(USER, starter.id, 4, 13);
    const mine = (await caller().closeout.suggestions()).find(
      s => s.assemblyId === starter.id
    )!;

    await expect(
      callerFor(OTHER).closeout.respond({ id: mine.id, action: "accept" })
    ).rejects.toThrow(/no longer there/i);
  });

  it("cannot read another company's close-out", async () => {
    const starter = await sharedStarter();
    const bid = await caller().bids.create({
      name: `Private closeout ${uniq()}`,
      trades: ["electrical"],
    });
    await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId: starter.id,
      qty: 2,
    });
    await caller().closeout.save({
      bidId: bid!.id,
      mode: "total",
      totalActualHours: 40,
    });

    await expect(
      callerFor(OTHER).closeout.get({ bidId: bid!.id })
    ).rejects.toThrow(/not found/i);
  });
});
