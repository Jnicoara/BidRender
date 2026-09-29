/**
 * The business analytics dashboard — five things it has to get right.
 *
 *   1. THE ARITHMETIC, checked against numbers worked out by hand. Every
 *      fixture below uses round figures and the expected results are written
 *      out as literals rather than computed by the code under test. A test that
 *      re-derives the answer with the same function proves only that the
 *      function is consistent with itself.
 *
 *   2. AGREEMENT WITH THE BID SCREEN. The costs are summed in SQL, which is a
 *      second implementation of shared/pricing.ts and would otherwise be free
 *      to drift. So the same bids are priced both ways — through the real
 *      engine and through the aggregate — and asserted equal to the cent,
 *      across percentage overhead, flat overhead, target margin, modifiers,
 *      fractional quantities and a per-bid productivity override.
 *
 *   3. PERMISSION. This screen is gated tighter than the rest of the bid layer:
 *      an estimator can build bids all day and must not see the company's win
 *      rate or its margins. Tested as a refusal, per role, on both routes.
 *
 *   4. COMPANY ISOLATION. Two contractors, each with their own numbers, and
 *      neither figure moves when the other quotes or wins anything. This is the
 *      one that would be catastrophic and silent.
 *
 *   5. SCALE. The queries aggregate in the database, and the way to prove that
 *      is to give them a bid history far larger than a developer has and check
 *      both the answer and the clock. A regression to a query per bid does not
 *      fail a correctness test — it just gets slower every month somebody uses
 *      the product.
 *
 * ── Fixture ids must be unique across the whole suite, and this one proved it ─
 * This file was first written on 9801–9805, which `sampleProject.test.ts`
 * already uses for its two accounts. Vitest runs files serially, so they did not
 * race — the damage was quieter than that. This suite makes 9802 an ADMIN of
 * 9801's company and does not delete the membership afterwards, so by the time
 * the sample suite ran, its two "separate contractors" both resolved to the same
 * `dataUserId` and its cross-company tests failed: one company really could see
 * and delete the other's sample bid, because the fixtures had quietly merged
 * them into one company.
 *
 * Nothing was wrong with the app. But the failure reads exactly like a data-leak
 * bug in the sample feature, which is the most expensive kind of false alarm —
 * so: 99xx here, and check the range is free before adding a suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, getBidCosts } from "./db";
import {
  bidCloseoutLines,
  bidCloseouts,
  bidLineItems,
  bids,
  companies,
  companyMembers,
  users,
} from "../drizzle/schema";
import {
  EMPTY_OUTCOMES,
  UNTRADED_KEY,
  blendedLaborRate,
  bucketKeyFor,
  bucketLabel,
  buildTimeline,
  decidedBids,
  enumerateBuckets,
  groupByTrade,
  jobProfitability,
  marginPct,
  pendingBids,
  summariseJobs,
  winRate,
  type JobProfit,
} from "../shared/analytics";
import { can } from "../shared/permissions";
import { resolveRange } from "./analytics";
import type { TrpcContext } from "./_core/context";

const OWNER = 9901;
const ADMIN = 9902;
const ESTIMATOR = 9903;
const VIEWER = 9904;
const OUTSIDER = 9905; // owns a wholly separate company
const ALL_USERS = [OWNER, ADMIN, ESTIMATOR, VIEWER, OUTSIDER];

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-analytics-${userId}`,
      role: "user",
      accessTier: "standard",
      name: `Analytics ${userId}`,
    },
  } as unknown as TrpcContext);

const uniq = () => `${Date.now()}${Math.random()}`;

// ═══════════════════════════════════════════════════════════════════════════
// 1. The arithmetic
// ═══════════════════════════════════════════════════════════════════════════

describe("win rate", () => {
  it("is won over the bids that were DECIDED, not over everything quoted", () => {
    // The whole argument, in one assertion. 6 of 10 answered bids came back
    // yes. The 10 still sitting on somebody's desk are not losses.
    const counts = { won: 6, lost: 4, draft: 5, active: 5 };
    expect(winRate(counts)).toBe(0.6);
    // What the naive formula would have said, and why it is wrong: the same
    // business looks 30% successful purely for having work out for bid.
    expect(counts.won / (counts.won + counts.lost + 5 + 5)).toBe(0.3);
  });

  it("does not move when more bids go out", () => {
    // The property that matters: a busy month must not look like a bad one.
    const quiet = { won: 3, lost: 1, draft: 0, active: 0 };
    const busy = { won: 3, lost: 1, draft: 20, active: 20 };
    expect(winRate(quiet)).toBe(0.75);
    expect(winRate(busy)).toBe(0.75);
  });

  it("refuses a rate when nothing has been decided", () => {
    // Not 0. Zero percent means everything came back a loss, which is a real
    // and bleak reading, and a new account has not earned it.
    expect(winRate({ won: 0, lost: 0, draft: 4, active: 2 })).toBeNull();
    expect(winRate(EMPTY_OUTCOMES)).toBeNull();
  });

  it("reports a genuine nil return as zero", () => {
    expect(winRate({ won: 0, lost: 5, draft: 0, active: 0 })).toBe(0);
  });

  it("counts draft and active as still out, and won and lost as answered", () => {
    const counts = { won: 2, lost: 3, draft: 4, active: 1 };
    expect(decidedBids(counts)).toBe(5);
    expect(pendingBids(counts)).toBe(5);
  });

  it("rounds to four places rather than carrying a float tail", () => {
    expect(winRate({ won: 1, lost: 2, draft: 0, active: 0 })).toBe(0.3333);
  });
});

describe("time buckets", () => {
  it("names a month and a quarter the way the database does", () => {
    const date = new Date("2026-08-14T23:30:00Z");
    expect(bucketKeyFor(date, "month")).toBe("2026-08");
    expect(bucketKeyFor(date, "quarter")).toBe("2026-Q3");
    expect(bucketKeyFor(new Date("2026-01-01T00:00:00Z"), "quarter")).toBe(
      "2026-Q1"
    );
    expect(bucketKeyFor(new Date("2026-12-31T00:00:00Z"), "quarter")).toBe(
      "2026-Q4"
    );
  });

  it("emits every period in the range, including the quiet ones", () => {
    // A month with no bids is a fact about the business. Skipping it would
    // draw a straight line through a dip that really happened.
    const keys = enumerateBuckets(
      new Date("2026-01-20T00:00:00Z"),
      new Date("2026-04-05T00:00:00Z"),
      "month"
    );
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });

  it("crosses a year boundary", () => {
    const keys = enumerateBuckets(
      new Date("2025-11-01T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
      "month"
    );
    expect(keys).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("walks quarters three months at a time", () => {
    const keys = enumerateBuckets(
      new Date("2025-02-01T00:00:00Z"),
      new Date("2026-01-15T00:00:00Z"),
      "quarter"
    );
    expect(keys).toEqual([
      "2025-Q1",
      "2025-Q2",
      "2025-Q3",
      "2025-Q4",
      "2026-Q1",
    ]);
  });

  it("returns nothing for a backwards range rather than swapping the ends", () => {
    // Silently correcting it would answer a question nobody asked.
    expect(
      enumerateBuckets(
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-01-01T00:00:00Z"),
        "month"
      )
    ).toEqual([]);
  });

  it("labels a bucket the way a person reads it", () => {
    expect(bucketLabel("2026-08")).toBe("Aug 2026");
    expect(bucketLabel("2026-Q3")).toBe("Q3 2026");
  });

  it("fills a period that has no data with zeroes, not with a gap", () => {
    const timeline = buildTimeline(
      ["2026-01", "2026-02", "2026-03"],
      [
        {
          bucket: "2026-01",
          counts: { won: 2, lost: 1, draft: 0, active: 0 },
          wonValue: 1000,
          lostValue: 500,
          totalValue: 1500,
        },
        {
          bucket: "2026-03",
          counts: { won: 1, lost: 1, draft: 0, active: 0 },
          wonValue: 400,
          lostValue: 400,
          totalValue: 800,
        },
      ]
    );
    expect(timeline).toHaveLength(3);
    expect(timeline[1].bucket).toBe("2026-02");
    expect(timeline[1].total).toBe(0);
    expect(timeline[1].totalValue).toBe(0);
    // A period with no bids has no win rate. Not 0% — nothing was lost.
    expect(timeline[1].winRate).toBeNull();
    expect(timeline[0].winRate).toBeCloseTo(0.6667, 4);
  });
});

describe("margins", () => {
  it("is profit over revenue — margin, not markup", () => {
    // $1,000 sold, $750 spent. Margin is 25%; the markup was 33%. Reporting
    // one and calling it the other is how a 20% target gets compared against a
    // number that was never on the same footing.
    expect(marginPct(1000, 750)).toBe(0.25);
  });

  it("refuses a percentage of nothing", () => {
    expect(marginPct(0, 0)).toBeNull();
    expect(marginPct(0, 500)).toBeNull();
  });

  it("reports a loss as a negative margin", () => {
    expect(marginPct(1000, 1200)).toBe(-0.2);
  });

  it("blends the hourly rate a bid was actually priced at", () => {
    expect(blendedLaborRate(10000, 200)).toBe(50);
    // No hours, no rate. Zero would price the whole job as pure profit.
    expect(blendedLaborRate(0, 0)).toBeNull();
    expect(blendedLaborRate(500, 0)).toBeNull();
  });
});

describe("one finished job", () => {
  /**
   * The worked example, all round numbers:
   *
   *   quoted at            $2,500
   *   materials            $1,000
   *   labor estimated      20 h at $50 = $1,000  → cost $2,000, margin 20%
   *   labor actual         25 h at $50 = $1,250  → cost $2,250, margin 10%
   */
  const job = jobProfitability({
    bidId: 1,
    name: "Retail fit-out",
    trades: ["electrical"],
    closedAt: new Date("2026-05-01T00:00:00Z"),
    revenue: 2500,
    estimatedMaterialCost: 1000,
    estimatedLaborCost: 1000,
    estimatedHours: 20,
    actualHours: 25,
  });

  it("costs the estimate the bid was priced at", () => {
    expect(job.estimatedCost).toBe(2000);
    expect(job.estimatedProfit).toBe(500);
    expect(job.estimatedMargin).toBe(0.2);
  });

  it("re-costs the labor at the bid's own blended rate", () => {
    expect(job.blendedRate).toBe(50);
    expect(job.actualCost).toBe(2250);
    expect(job.actualProfit).toBe(250);
    expect(job.actualMargin).toBe(0.1);
  });

  it("holds materials at estimate, because no actual material cost exists", () => {
    // The entire difference between the two costs is labor: $250, which is
    // exactly the 5 extra hours at $50. Nothing here invents a material
    // overrun, and the screen says so rather than implying a full P&L.
    expect(job.actualCost - job.estimatedCost).toBe(250);
    expect(job.hasLaborBasis).toBe(true);
  });

  it("shows a job that came in under as earning more than quoted", () => {
    const under = jobProfitability({
      bidId: 2,
      name: "Service call",
      trades: ["electrical"],
      closedAt: new Date("2026-05-01T00:00:00Z"),
      revenue: 2500,
      estimatedMaterialCost: 1000,
      estimatedLaborCost: 1000,
      estimatedHours: 20,
      actualHours: 16,
    });
    expect(under.actualCost).toBe(1800);
    expect(under.actualMargin).toBe(0.28);
  });

  it("will not re-cost a job that carried no hours", () => {
    // No hours means no rate, and pricing 40 actual hours at $0 would report a
    // materials-only job as wildly profitable.
    const noBasis = jobProfitability({
      bidId: 3,
      name: "Materials supplied only",
      trades: ["electrical"],
      closedAt: new Date("2026-05-01T00:00:00Z"),
      revenue: 1200,
      estimatedMaterialCost: 1000,
      estimatedLaborCost: 0,
      estimatedHours: 0,
      actualHours: 40,
    });
    expect(noBasis.hasLaborBasis).toBe(false);
    expect(noBasis.blendedRate).toBeNull();
    expect(noBasis.actualCost).toBe(1000);
    expect(noBasis.actualMargin).toBe(noBasis.estimatedMargin);
  });
});

describe("rolling jobs up", () => {
  const big: JobProfit = jobProfitability({
    bidId: 10,
    name: "Big",
    trades: ["electrical"],
    closedAt: new Date("2026-04-01T00:00:00Z"),
    revenue: 100000,
    estimatedMaterialCost: 40000,
    estimatedLaborCost: 40000,
    estimatedHours: 800,
    actualHours: 900,
  });
  const small: JobProfit = jobProfitability({
    bidId: 11,
    name: "Small",
    trades: ["electrical"],
    closedAt: new Date("2026-04-02T00:00:00Z"),
    revenue: 1000,
    estimatedMaterialCost: 100,
    estimatedLaborCost: 100,
    estimatedHours: 2,
    actualHours: 2,
  });

  it("weights by money, never by averaging the per-job margins", () => {
    const group = summariseJobs("all", [big, small]);
    // Totals: revenue 101,000; cost 80,000 + 200 estimated.
    expect(group.revenue).toBe(101000);
    expect(group.estimatedCost).toBe(80200);
    expect(group.estimatedMargin).toBeCloseTo(0.2059, 4);
    // The average of the two jobs' margins is 0.5 — two and a half times the
    // real figure — because a $1,000 service call would count as much as a
    // $100,000 fit-out.
    const naiveAverage = (big.estimatedMargin! + small.estimatedMargin!) / 2;
    expect(naiveAverage).toBeCloseTo(0.5, 4);
  });

  it("reports the gap between what was quoted and what was delivered", () => {
    const group = summariseJobs("all", [big, small]);
    // 100 hours over at $50/h on the big job: $5,000 of margin gone.
    expect(group.actualCost).toBe(85200);
    expect(group.actualProfit).toBe(15800);
    expect(group.marginDelta).toBeLessThan(0);
    expect(group.hoursVariance).toBeCloseTo((902 - 802) / 802, 4);
  });

  it("has nothing to say about no jobs", () => {
    const empty = summariseJobs("all", []);
    expect(empty.jobs).toBe(0);
    expect(empty.estimatedMargin).toBeNull();
    // Null rather than 0 — no jobs is not "came in exactly on estimate".
    expect(empty.hoursVariance).toBeNull();
  });
});

describe("grouping by trade", () => {
  const make = (id: number, trades: string[], revenue: number): JobProfit =>
    jobProfitability({
      bidId: id,
      name: `Job ${id}`,
      trades,
      closedAt: new Date("2026-04-01T00:00:00Z"),
      revenue,
      estimatedMaterialCost: revenue * 0.3,
      estimatedLaborCost: revenue * 0.4,
      estimatedHours: 10,
      actualHours: 10,
    });

  it("counts a multi-trade bid under both of its trades, and says so", () => {
    // There is no field naming a bid's "real" trade, and picking one would be
    // a guess printed as a fact. So the rows deliberately do not sum to the
    // total, and the count of double-counted jobs is returned to say why.
    const { groups, multiTradeJobs } = groupByTrade([
      make(1, ["electrical"], 1000),
      make(2, ["electrical", "plumbing"], 2000),
    ]);
    expect(multiTradeJobs).toBe(1);
    expect(groups.map(g => g.key).sort()).toEqual(["electrical", "plumbing"]);
    expect(groups.find(g => g.key === "electrical")!.jobs).toBe(2);
    expect(groups.find(g => g.key === "plumbing")!.jobs).toBe(1);
  });

  it("files a bid with no trade recorded rather than dropping it", () => {
    const { groups } = groupByTrade([make(3, [], 500)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNTRADED_KEY);
    expect(groups[0].jobs).toBe(1);
  });

  it("puts the biggest book of work first", () => {
    const { groups } = groupByTrade([
      make(1, ["low-voltage"], 1000),
      make(2, ["electrical"], 9000),
    ]);
    expect(groups[0].key).toBe("electrical");
  });
});

describe("the range", () => {
  const now = new Date("2026-08-14T09:00:00Z");

  it("defaults to the last twelve months", () => {
    const range = resolveRange({}, now);
    expect(range.from).toBe("2025-09-01");
    expect(range.to).toBe("2026-08-14");
    expect(range.buckets).toHaveLength(12);
    expect(range.buckets[0]).toBe("2025-09");
    expect(range.buckets[11]).toBe("2026-08");
  });

  it("makes the end of a range inclusive of its last day", () => {
    // The classic off-by-one: `<= 2026-03-31` means midnight, which drops
    // everything that happened on the 31st and looks like missing data.
    const range = resolveRange({ from: "2026-03-01", to: "2026-03-31" }, now);
    expect(range.end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("takes an explicit window as given", () => {
    const range = resolveRange(
      { from: "2026-01-01", to: "2026-06-30", granularity: "quarter" },
      now
    );
    expect(range.buckets).toEqual(["2026-Q1", "2026-Q2"]);
  });
});

describe("the permission itself", () => {
  it("is held by an owner and an admin", () => {
    expect(can("owner", "analytics.view")).toBe(true);
    expect(can("admin", "analytics.view")).toBe(true);
  });

  it("is withheld from an estimator, who can still build bids", () => {
    // The distinction the capability exists for: doing the work does not carry
    // a right to the company's overall performance.
    expect(can("estimator", "analytics.view")).toBe(false);
    expect(can("estimator", "bids.edit")).toBe(true);
    expect(can("estimator", "pricing.view")).toBe(true);
  });

  it("is withheld from a viewer", () => {
    expect(can("viewer", "analytics.view")).toBe(false);
    expect(can("viewer", "bids.view")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Against the real stack
// ═══════════════════════════════════════════════════════════════════════════

describeDb("a company with a bid history", () => {
  let companyId = 0;
  let outsiderCompanyId = 0;

  /** A bid with its line items, inserted directly so the numbers are known. */
  async function seedBid(opts: {
    userId: number;
    name?: string;
    status?: "Draft" | "Active" | "Won" | "Lost";
    trades?: string[] | null;
    createdAt: string;
    isSample?: boolean;
    archivedAt?: Date | null;
    overheadEnabled?: boolean | null;
    overheadMode?: "percentage" | "flat" | null;
    overheadValue?: string | null;
    profitMethod?: "markup" | "margin" | null;
    profitValue?: string | null;
    productivityPct?: string | null;
    lines?: Array<{
      qty: number;
      /** NULL is a hand-priced line nobody priced — "Not priced". */
      materialCost: number | null;
      laborHours: number;
      modifierPct?: number;
      laborRate: number;
    }>;
  }): Promise<number> {
    const database = await getDb();
    const [inserted] = await database!.insert(bids).values({
      userId: opts.userId,
      name: opts.name ?? `Analytics bid ${uniq()}`,
      status: opts.status ?? "Draft",
      trades: opts.trades === undefined ? ["electrical"] : opts.trades,
      createdAt: new Date(`${opts.createdAt}T12:00:00Z`),
      isSample: opts.isSample ?? false,
      archivedAt: opts.archivedAt ?? null,
      overheadEnabled: opts.overheadEnabled ?? null,
      overheadMode: opts.overheadMode ?? null,
      overheadValue: opts.overheadValue ?? null,
      profitMethod: opts.profitMethod ?? null,
      profitValue: opts.profitValue ?? null,
      productivityPct: opts.productivityPct ?? null,
    });
    const bidId = inserted.insertId;

    if (opts.lines?.length) {
      await database!.insert(bidLineItems).values(
        opts.lines.map((line, index) => ({
          bidId,
          name: `Line ${index + 1}`,
          qty: line.qty.toFixed(4),
          snapshotMaterialCost:
            line.materialCost === null ? null : line.materialCost.toFixed(4),
          snapshotLaborHours: line.laborHours.toFixed(4),
          snapshotModifierPct: (line.modifierPct ?? 0).toFixed(4),
          snapshotLaborRate: line.laborRate.toFixed(4),
          sortOrder: index,
        }))
      );
    }
    return bidId;
  }

  async function closeOut(opts: {
    bidId: number;
    userId: number;
    estimatedHours: number;
    actualHours: number;
    closedAt: string;
    byAssembly?: Array<{ estimatedHours: number; actualHours: number }>;
  }) {
    const database = await getDb();
    const [inserted] = await database!.insert(bidCloseouts).values({
      bidId: opts.bidId,
      userId: opts.userId,
      mode: opts.byAssembly ? "byAssembly" : "total",
      totalActualHours: opts.byAssembly ? null : opts.actualHours.toFixed(2),
      estimatedHours: opts.estimatedHours.toFixed(2),
      closedAt: new Date(`${opts.closedAt}T12:00:00Z`),
      enteredByUserId: opts.userId,
    });
    if (opts.byAssembly) {
      await database!.insert(bidCloseoutLines).values(
        opts.byAssembly.map((line, index) => ({
          closeoutId: inserted.insertId,
          userId: opts.userId,
          assemblyId: null,
          assemblyName: `Assembly ${index + 1}`,
          qty: "1.0000",
          estimatedHours: line.estimatedHours.toFixed(2),
          actualHours: line.actualHours.toFixed(2),
        }))
      );
    }
    return inserted.insertId;
  }

  /** The whole of 2026 so far — every fixture below is created inside it. */
  const YEAR = { from: "2026-01-01", to: "2026-06-30" } as const;

  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of ALL_USERS) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database.insert(users).values({
          id,
          openId: `test-analytics-${id}`,
          name: `Analytics user ${id}`,
        });
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    // Bids cascade to line items and close-outs, so this is the whole cleanup.
    await database.delete(bids).where(inArray(bids.userId, ALL_USERS));
    await database
      .delete(companyMembers)
      .where(inArray(companyMembers.userId, ALL_USERS));
    await database
      .delete(companies)
      .where(inArray(companies.ownerUserId, ALL_USERS));

    const [company] = await database.insert(companies).values({
      name: `Analytics Co ${uniq()}`,
      ownerUserId: OWNER,
    });
    companyId = company.insertId;
    for (const [userId, role] of [
      [OWNER, "owner"],
      [ADMIN, "admin"],
      [ESTIMATOR, "estimator"],
      [VIEWER, "viewer"],
    ] as const) {
      await database
        .insert(companyMembers)
        .values({ companyId, userId, role, status: "active" });
    }

    const [other] = await database.insert(companies).values({
      name: `Rival Co ${uniq()}`,
      ownerUserId: OUTSIDER,
    });
    outsiderCompanyId = other.insertId;
    await database.insert(companyMembers).values({
      companyId: outsiderCompanyId,
      userId: OUTSIDER,
      role: "owner",
      status: "active",
    });
  });

  // ── Win rate, end to end ──────────────────────────────────────────────────

  describe("win rate over a real history", () => {
    it("counts the statuses a contractor set on the Dashboard", async () => {
      for (const status of ["Won", "Won", "Won", "Lost", "Lost"] as const) {
        await seedBid({ userId: OWNER, status, createdAt: "2026-03-10" });
      }
      await seedBid({
        userId: OWNER,
        status: "Draft",
        createdAt: "2026-03-11",
      });
      await seedBid({
        userId: OWNER,
        status: "Active",
        createdAt: "2026-03-12",
      });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.counts).toEqual({
        won: 3,
        lost: 2,
        draft: 1,
        active: 1,
      });
      expect(report.totals.decided).toBe(5);
      expect(report.totals.pending).toBe(2);
      expect(report.totals.winRate).toBe(0.6);
    });

    it("puts each bid in the period it was quoted in", async () => {
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-01-15" });
      await seedBid({ userId: OWNER, status: "Lost", createdAt: "2026-01-20" });
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-04-02" });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      const january = report.timeline.find(p => p.bucket === "2026-01")!;
      const april = report.timeline.find(p => p.bucket === "2026-04")!;
      expect(january.winRate).toBe(0.5);
      expect(april.winRate).toBe(1);
      // And the quiet months are present as zeroes rather than missing.
      expect(report.timeline).toHaveLength(6);
      expect(report.timeline.find(p => p.bucket === "2026-02")!.total).toBe(0);
    });

    it("agrees with what the database grouped, month for month", async () => {
      // The SQL bucket expression and bucketKeyFor have to produce the same
      // string, or a month quietly splits in two.
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-05-31" });
      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      const may = report.timeline.find(p => p.bucket === "2026-05")!;
      expect(may.counts.won).toBe(1);
      expect(bucketKeyFor(new Date("2026-05-31T12:00:00Z"), "month")).toBe(
        "2026-05"
      );
    });

    it("groups by quarter when asked", async () => {
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-02-01" });
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-03-01" });
      await seedBid({ userId: OWNER, status: "Lost", createdAt: "2026-05-01" });

      const report = await callerFor(OWNER).analytics.outcomes({
        ...YEAR,
        granularity: "quarter",
      });
      expect(report.timeline.map(p => p.bucket)).toEqual([
        "2026-Q1",
        "2026-Q2",
      ]);
      expect(report.timeline[0].counts.won).toBe(2);
      expect(report.timeline[1].counts.lost).toBe(1);
    });

    it("still counts a bid that was archived after it was won", async () => {
      // Archiving is "get it off my dashboard" and is independent of status.
      // Dropping archived bids would make a win rate follow filing habits.
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-02-02",
        archivedAt: new Date("2026-06-01T00:00:00Z"),
      });
      await seedBid({ userId: OWNER, status: "Lost", createdAt: "2026-02-03" });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.counts.won).toBe(1);
      expect(report.totals.winRate).toBe(0.5);
    });

    it("leaves the shipped sample bid out of every figure", async () => {
      // CLAUDE.md's rule: fictional money never reaches a headline number.
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-02-04" });
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-02-05",
        isSample: true,
        lines: [
          { qty: 1, materialCost: 50000, laborHours: 100, laborRate: 100 },
        ],
      });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.counts.won).toBe(1);
      expect(report.totals.wonValue).toBe(0);
    });

    it("says nothing at all about an account with no bids", async () => {
      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.total).toBe(0);
      expect(report.totals.winRate).toBeNull();
      expect(report.earliestBid).toBeNull();
    });
  });

  // ── Agreement with the bid screen ─────────────────────────────────────────

  describe("the aggregate prices bids exactly as the bid screen does", () => {
    /**
     * Every shape of pricing the engine supports, on one bid each.
     *
     * This is the test that makes the SQL duplication of shared/pricing.ts
     * safe. If somebody changes the engine — a rounding step, the order of
     * overhead and profit, how the productivity factor applies — and does not
     * change the SQL, the two answers separate and this fails.
     */
    const cases = [
      {
        label: "plain markup",
        bid: {
          profitMethod: "markup" as const,
          profitValue: "0.2500",
          lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
        },
      },
      {
        label: "percentage overhead then markup",
        bid: {
          overheadEnabled: true,
          overheadMode: "percentage" as const,
          overheadValue: "0.1200",
          profitMethod: "markup" as const,
          profitValue: "0.1800",
          lines: [
            { qty: 24, materialCost: 18.5, laborHours: 0.75, laborRate: 68 },
            { qty: 4, materialCost: 34, laborHours: 0.9, laborRate: 68 },
          ],
        },
      },
      {
        label: "flat overhead — an amount per bid, not a rate on a sum",
        bid: {
          overheadEnabled: true,
          overheadMode: "flat" as const,
          overheadValue: "1750.0000",
          profitMethod: "markup" as const,
          profitValue: "0.1500",
          lines: [
            { qty: 6, materialCost: 46, laborHours: 1.25, laborRate: 55 },
          ],
        },
      },
      {
        label: "target margin, which divides rather than multiplies",
        bid: {
          profitMethod: "margin" as const,
          profitValue: "0.3000",
          lines: [
            { qty: 32, materialCost: 92, laborHours: 1.1, laborRate: 61.5 },
          ],
        },
      },
      {
        label: "modifiers, which add rather than compound",
        bid: {
          profitMethod: "markup" as const,
          profitValue: "0.2000",
          lines: [
            {
              qty: 32,
              materialCost: 92,
              laborHours: 1.1,
              modifierPct: 0.25,
              laborRate: 68,
            },
            {
              qty: 5,
              materialCost: 12.75,
              laborHours: 0.4,
              modifierPct: 0.32,
              laborRate: 68,
            },
          ],
        },
      },
      {
        label: "a fractional quantity, where the per-line rounding shows",
        bid: {
          profitMethod: "markup" as const,
          profitValue: "0.2200",
          lines: [
            { qty: 137.5, materialCost: 1.37, laborHours: 0.03, laborRate: 63 },
            { qty: 0.25, materialCost: 899.99, laborHours: 7.5, laborRate: 63 },
          ],
        },
      },
      {
        label: "a per-bid productivity override",
        bid: {
          productivityPct: "0.1500",
          profitMethod: "markup" as const,
          profitValue: "0.2000",
          lines: [
            { qty: 12, materialCost: 63.4, laborHours: 1.8, laborRate: 72 },
          ],
        },
      },
      {
        label: "a crew that beats book hours",
        bid: {
          productivityPct: "-0.1000",
          profitMethod: "margin" as const,
          profitValue: "0.2500",
          lines: [
            { qty: 40, materialCost: 22.15, laborHours: 0.65, laborRate: 58 },
          ],
        },
      },
      {
        label: "a bid with no lines at all",
        bid: {
          profitMethod: "markup" as const,
          profitValue: "0.2000",
          lines: [],
        },
      },
    ];

    for (const testCase of cases) {
      it(`matches on ${testCase.label}`, async () => {
        const bidId = await seedBid({
          userId: OWNER,
          status: "Won",
          createdAt: "2026-03-05",
          ...testCase.bid,
        });

        const [fromBidScreen, report] = await Promise.all([
          callerFor(OWNER).bids.get({ id: bidId }),
          callerFor(OWNER).analytics.outcomes(YEAR),
        ]);

        // To the cent. Not `toBeCloseTo` — a dashboard that disagrees with the
        // bid it is summarising is a dashboard nobody will trust twice.
        expect(report.totals.wonValue).toBe(fromBidScreen.totals.finalPrice);
      });
    }

    it("matches across a mixed set of bids in one query", async () => {
      const ids: number[] = [];
      for (const testCase of cases) {
        ids.push(
          await seedBid({
            userId: OWNER,
            status: "Won",
            createdAt: "2026-03-06",
            ...testCase.bid,
          })
        );
      }

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      let expected = 0;
      for (const id of ids) {
        const bid = await callerFor(OWNER).bids.get({ id });
        expected += bid.totals.finalPrice;
      }
      expect(report.totals.wonValue).toBeCloseTo(expected, 2);
    });

    it("splits value by outcome the same way it splits the counts", async () => {
      const won = await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-07",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await seedBid({
        userId: OWNER,
        status: "Lost",
        createdAt: "2026-03-08",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 5, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await seedBid({
        userId: OWNER,
        status: "Active",
        createdAt: "2026-03-09",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 1, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      // 10 × ($100 + 2h × $50) = $2,000 direct, × 1.25 = $2,500.
      expect(report.totals.wonValue).toBe(2500);
      expect(report.totals.lostValue).toBe(1250);
      expect(report.totals.pendingValue).toBe(250);
      expect(report.totals.totalValue).toBe(4000);
      expect(
        (await callerFor(OWNER).bids.get({ id: won })).totals.finalPrice
      ).toBe(2500);
    });
  });

  // ── Profitability ─────────────────────────────────────────────────────────

  describe("what the finished work earned", () => {
    /**
     * The same worked example as the pure test, now through the whole stack:
     * $2,500 quoted, $1,000 materials, 20 h estimated at $50, 25 h actual.
     */
    async function seedWorkedExample(userId = OWNER, trades = ["electrical"]) {
      const bidId = await seedBid({
        userId,
        name: "Retail fit-out",
        status: "Won",
        trades,
        createdAt: "2026-02-01",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await closeOut({
        bidId,
        userId,
        estimatedHours: 20,
        actualHours: 25,
        closedAt: "2026-04-15",
      });
      return bidId;
    }

    it("prices a finished job against what it was quoted at", async () => {
      await seedWorkedExample();
      const report = await callerFor(OWNER).analytics.profitability(YEAR);

      expect(report.overall.jobs).toBe(1);
      expect(report.overall.revenue).toBe(2500);
      expect(report.overall.estimatedCost).toBe(2000);
      expect(report.overall.actualCost).toBe(2250);
      expect(report.overall.estimatedMargin).toBe(0.2);
      expect(report.overall.actualMargin).toBe(0.1);
      expect(report.overall.marginDelta).toBe(-0.1);
      expect(report.overall.estimatedHours).toBe(20);
      expect(report.overall.actualHours).toBe(25);
      expect(report.overall.hoursVariance).toBe(0.25);
    });

    it("reads per-assembly hours as the sum of their lines", async () => {
      const bidId = await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-02-02",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await closeOut({
        bidId,
        userId: OWNER,
        estimatedHours: 20,
        actualHours: 0, // ignored in byAssembly mode
        closedAt: "2026-04-16",
        byAssembly: [
          { estimatedHours: 12, actualHours: 15 },
          { estimatedHours: 8, actualHours: 10 },
        ],
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      // The lines ARE the answer — 15 + 10 — and there is no separately typed
      // total that could disagree with them.
      expect(report.overall.actualHours).toBe(25);
      expect(report.overall.actualCost).toBe(2250);
    });

    it("splits by trade, and counts a multi-trade job under each", async () => {
      await seedWorkedExample(OWNER, ["electrical"]);
      await seedWorkedExample(OWNER, ["electrical", "low-voltage"]);

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.overall.jobs).toBe(2);
      expect(report.multiTradeJobs).toBe(1);
      const electrical = report.byTrade.find(g => g.key === "electrical")!;
      const lowVoltage = report.byTrade.find(g => g.key === "low-voltage")!;
      expect(electrical.jobs).toBe(2);
      expect(lowVoltage.jobs).toBe(1);
      // The rows do not sum to the total, deliberately — see groupByTrade.
      expect(electrical.revenue + lowVoltage.revenue).toBeGreaterThan(
        report.overall.revenue
      );
    });

    it("ignores a bid that was never closed out", async () => {
      await seedWorkedExample();
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-02-03",
        lines: [{ qty: 99, materialCost: 500, laborHours: 9, laborRate: 90 }],
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      // Counting it at its estimate would dilute every figure toward "we hit
      // our numbers exactly", which is the one answer that is never evidence.
      expect(report.overall.jobs).toBe(1);
      expect(report.overall.revenue).toBe(2500);
    });

    it("files a job by when it FINISHED, not by when it was quoted", async () => {
      // Quoted in February, closed in April — the opposite axis from the win
      // rate, on purpose, because they answer different questions.
      await seedWorkedExample();
      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.timeline.find(p => p.bucket === "2026-04")!.jobs).toBe(1);
      expect(report.timeline.find(p => p.bucket === "2026-02")!.jobs).toBe(0);
    });

    it("keeps a job outside the range out of it", async () => {
      await seedWorkedExample();
      const report = await callerFor(OWNER).analytics.profitability({
        from: "2026-05-01",
        to: "2026-06-30",
      });
      expect(report.overall.jobs).toBe(0);
      expect(report.overall.revenue).toBe(0);
    });

    it("leaves the sample out of profitability too", async () => {
      const bidId = await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-02-06",
        isSample: true,
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await closeOut({
        bidId,
        userId: OWNER,
        estimatedHours: 20,
        actualHours: 25,
        closedAt: "2026-04-17",
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.overall.jobs).toBe(0);
    });

    it("lists the jobs that missed by the most money, worst first", async () => {
      // A 40% overrun on a small job matters less than a small one on a big
      // job, so the list is ordered by dollars, not by percentage.
      const small = await seedBid({
        userId: OWNER,
        name: "Small overrun",
        status: "Won",
        createdAt: "2026-02-07",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 1, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await closeOut({
        bidId: small,
        userId: OWNER,
        estimatedHours: 2,
        actualHours: 4, // 100% over, $100 of margin
        closedAt: "2026-04-18",
      });
      const big = await seedBid({
        userId: OWNER,
        name: "Big overrun",
        status: "Won",
        createdAt: "2026-02-08",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 100, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });
      await closeOut({
        bidId: big,
        userId: OWNER,
        estimatedHours: 200,
        actualHours: 220, // 10% over, $1,000 of margin
        closedAt: "2026-04-19",
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.worstJobs[0].name).toBe("Big overrun");
      expect(
        report.worstJobs[0].actualProfit - report.worstJobs[0].estimatedProfit
      ).toBe(-1000);
      expect(report.worstJobs[1].name).toBe("Small overrun");
    });

    it("has an empty, honest answer for a company that has closed nothing out", async () => {
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-02-09" });
      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.overall.jobs).toBe(0);
      expect(report.overall.actualMargin).toBeNull();
      expect(report.byTrade).toEqual([]);
      expect(report.truncated).toBe(false);
    });
  });

  // ── Figures that leave a line out say so ──────────────────────────────────
  // `costSums` counted the lines it left out and `toBidCostRow` dropped the
  // count, so analytics was short with nothing on screen to say it. A
  // negative snapshot is one way a line becomes unpriceable (lineIsPriceable).

  describe("a bid with a line that can't be priced", () => {
    const broken = { qty: 1, materialCost: -5, laborHours: 0, laborRate: 0 };
    const fine = { qty: 2, materialCost: 10, laborHours: 0, laborRate: 0 };

    it("is counted as incomplete in the outcomes report, and a whole one is not", async () => {
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-10",
        lines: [fine, broken],
      });
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-11",
        lines: [fine],
      });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.incompleteBids).toBe(1);
    });

    it("marks the closed job and counts it in the profitability report", async () => {
      const bidId = await seedBid({
        userId: OWNER,
        name: "Short job",
        status: "Won",
        createdAt: "2026-03-10",
        lines: [
          { qty: 1, materialCost: 100, laborHours: 10, laborRate: 50 },
          broken,
        ],
      });
      await closeOut({
        bidId,
        userId: OWNER,
        estimatedHours: 10,
        actualHours: 12,
        closedAt: "2026-04-01",
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.incompleteJobs).toBe(1);
      expect(report.worstJobs.find(j => j.bidId === bidId)?.incomplete).toBe(
        true
      );
    });

    it("reports nothing incomplete when every line prices", async () => {
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-10",
        lines: [fine],
      });
      const outcomes = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(outcomes.totals.incompleteBids).toBe(0);
    });
  });

  // ── Figures that count unpriced lines as $0 say so (2026-09-27) ───────────
  // A different fact from the one above: these lines are IN the figures, at
  // $0, because nobody priced them. Analytics said nothing about them, while
  // the bid and the Dashboard card each said "+ 1 line not priced".

  describe("a bid with a line nobody has priced", () => {
    const unpriced = {
      qty: 1,
      materialCost: null,
      laborHours: 0,
      laborRate: 0,
    };
    const fine = { qty: 2, materialCost: 10, laborHours: 0, laborRate: 0 };

    it("is counted as not priced in the outcomes report, and not as incomplete", async () => {
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-10",
        lines: [fine, unpriced],
      });
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-11",
        lines: [fine],
      });

      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(report.totals.notPricedBids).toBe(1);
      expect(report.totals.incompleteBids).toBe(0);
    });

    it("marks the closed job with its unpriced line", async () => {
      const bidId = await seedBid({
        userId: OWNER,
        name: "Half-priced job",
        status: "Won",
        createdAt: "2026-03-10",
        lines: [
          { qty: 1, materialCost: 100, laborHours: 10, laborRate: 50 },
          unpriced,
        ],
      });
      await closeOut({
        bidId,
        userId: OWNER,
        estimatedHours: 10,
        actualHours: 12,
        closedAt: "2026-04-01",
      });

      const report = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(report.notPricedJobs).toBe(1);
      expect(report.worstJobs.find(j => j.bidId === bidId)?.notPriced).toEqual({
        lines: 1,
        parts: 0,
      });
    });

    it("reports nothing not priced when every line has a price", async () => {
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-10",
        lines: [fine],
      });
      const outcomes = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(outcomes.totals.notPricedBids).toBe(0);
    });
  });

  // ── Permission ────────────────────────────────────────────────────────────

  describe("who may look at this", () => {
    beforeEach(async () => {
      if (!hasDb) return;
      await seedBid({ userId: OWNER, status: "Won", createdAt: "2026-03-01" });
    });

    it("lets the owner read both routes", async () => {
      await expect(
        callerFor(OWNER).analytics.outcomes(YEAR)
      ).resolves.toBeTruthy();
      await expect(
        callerFor(OWNER).analytics.profitability(YEAR)
      ).resolves.toBeTruthy();
    });

    it("lets an admin read both routes", async () => {
      await expect(
        callerFor(ADMIN).analytics.outcomes(YEAR)
      ).resolves.toBeTruthy();
      await expect(
        callerFor(ADMIN).analytics.profitability(YEAR)
      ).resolves.toBeTruthy();
    });

    it("refuses an estimator, who can nonetheless open the bids themselves", async () => {
      // The exact distinction the capability was added for.
      await expect(
        callerFor(ESTIMATOR).analytics.outcomes(YEAR)
      ).rejects.toThrow(/cannot do this/i);
      await expect(
        callerFor(ESTIMATOR).analytics.profitability(YEAR)
      ).rejects.toThrow(/cannot do this/i);
      await expect(callerFor(ESTIMATOR).bids.list()).resolves.toBeTruthy();
    });

    it("refuses a viewer", async () => {
      await expect(callerFor(VIEWER).analytics.outcomes(YEAR)).rejects.toThrow(
        /cannot do this/i
      );
      await expect(
        callerFor(VIEWER).analytics.profitability(YEAR)
      ).rejects.toThrow(/cannot do this/i);
    });

    it("refuses a suspended member on the next request, not the next login", async () => {
      const database = await getDb();
      await database!
        .update(companyMembers)
        .set({ status: "suspended" })
        .where(eq(companyMembers.userId, ADMIN));
      await expect(callerFor(ADMIN).analytics.outcomes(YEAR)).rejects.toThrow();
    });
  });

  // ── Isolation ─────────────────────────────────────────────────────────────

  describe("one contractor's numbers never reach another's", () => {
    it("keeps win rates apart", async () => {
      // The rival wins everything; the owner wins nothing.
      for (let i = 0; i < 5; i++) {
        await seedBid({
          userId: OUTSIDER,
          status: "Won",
          createdAt: "2026-03-01",
        });
      }
      for (let i = 0; i < 4; i++) {
        await seedBid({
          userId: OWNER,
          status: "Lost",
          createdAt: "2026-03-01",
        });
      }

      const mine = await callerFor(OWNER).analytics.outcomes(YEAR);
      const theirs = await callerFor(OUTSIDER).analytics.outcomes(YEAR);
      expect(mine.totals.counts).toEqual({
        won: 0,
        lost: 4,
        draft: 0,
        active: 0,
      });
      expect(mine.totals.winRate).toBe(0);
      expect(theirs.totals.counts.won).toBe(5);
      expect(theirs.totals.winRate).toBe(1);
    });

    it("keeps money apart", async () => {
      await seedBid({
        userId: OUTSIDER,
        status: "Won",
        createdAt: "2026-03-02",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 100, materialCost: 500, laborHours: 8, laborRate: 90 }],
      });
      await seedBid({
        userId: OWNER,
        status: "Won",
        createdAt: "2026-03-02",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 10, materialCost: 100, laborHours: 2, laborRate: 50 }],
      });

      const mine = await callerFor(OWNER).analytics.outcomes(YEAR);
      expect(mine.totals.wonValue).toBe(2500);
    });

    it("keeps closed-out jobs apart, including their hours", async () => {
      const theirBid = await seedBid({
        userId: OUTSIDER,
        status: "Won",
        createdAt: "2026-03-03",
        profitMethod: "markup",
        profitValue: "0.2500",
        lines: [{ qty: 50, materialCost: 200, laborHours: 4, laborRate: 80 }],
      });
      await closeOut({
        bidId: theirBid,
        userId: OUTSIDER,
        estimatedHours: 200,
        actualHours: 400,
        closedAt: "2026-04-01",
      });

      const mine = await callerFor(OWNER).analytics.profitability(YEAR);
      expect(mine.overall.jobs).toBe(0);
      expect(mine.overall.actualHours).toBe(0);

      const theirs = await callerFor(OUTSIDER).analytics.profitability(YEAR);
      expect(theirs.overall.jobs).toBe(1);
      expect(theirs.overall.actualHours).toBe(400);
    });

    it("does not let a member read the other company by belonging to this one", async () => {
      // Every member of the owner's company reads under the OWNER's scope id,
      // so an admin here sees this company's bids and not the rival's — even
      // though both accounts are perfectly valid owners elsewhere.
      await seedBid({
        userId: OUTSIDER,
        status: "Won",
        createdAt: "2026-03-04",
      });
      await seedBid({ userId: OWNER, status: "Lost", createdAt: "2026-03-04" });

      const asAdmin = await callerFor(ADMIN).analytics.outcomes(YEAR);
      expect(asAdmin.totals.counts).toEqual({
        won: 0,
        lost: 1,
        draft: 0,
        active: 0,
      });
    });
  });

  // ── Scale ─────────────────────────────────────────────────────────────────

  describe("a bid history far bigger than a developer has", () => {
    /** Bids, each with line items — the shape that breaks a per-bid loop. */
    const BIDS = 1200;
    const LINES_PER_BID = 8;

    async function seedHistory() {
      const database = await getDb();
      const rows = [];
      for (let i = 0; i < BIDS; i++) {
        // Spread across the six months of the range, and across statuses in a
        // fixed 3 won : 2 lost : 1 pending pattern so the expected win rate is
        // exactly 0.6 and can be asserted rather than approximated.
        const month = (i % 6) + 1;
        const status =
          i % 6 < 3
            ? "Won"
            : i % 6 < 5
              ? ("Lost" as const)
              : ("Active" as const);
        rows.push({
          userId: OWNER,
          name: `Volume bid ${i}`,
          status: status as "Won" | "Lost" | "Active",
          trades: ["electrical"],
          createdAt: new Date(
            `2026-0${month}-${String((i % 27) + 1).padStart(2, "0")}T12:00:00Z`
          ),
          profitMethod: "markup" as const,
          profitValue: "0.2000",
        });
      }
      // Chunked, because a single 1,200-row insert exceeds the packet size on
      // a default MySQL and would fail for reasons unrelated to the test.
      const bidIds: number[] = [];
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const [inserted] = await database!.insert(bids).values(chunk);
        // MySQL hands back the FIRST id of a bulk insert; the rest follow it.
        for (let n = 0; n < chunk.length; n++) {
          bidIds.push(inserted.insertId + n);
        }
      }

      const lines = [];
      for (const bidId of bidIds) {
        for (let n = 0; n < LINES_PER_BID; n++) {
          lines.push({
            bidId,
            name: `Line ${n}`,
            qty: "2.0000",
            snapshotMaterialCost: "25.0000",
            snapshotLaborHours: "1.0000",
            snapshotModifierPct: "0.0000",
            snapshotLaborRate: "50.0000",
            sortOrder: n,
          });
        }
      }
      for (let i = 0; i < lines.length; i += 500) {
        await database!.insert(bidLineItems).values(lines.slice(i, i + 500));
      }
      return bidIds;
    }

    it("aggregates a whole history in the database, correctly and quickly", async () => {
      await seedHistory();

      const started = Date.now();
      const report = await callerFor(OWNER).analytics.outcomes(YEAR);
      const elapsed = Date.now() - started;

      // Correct first. Every bid is identical, so the arithmetic is exact:
      // 8 lines × 2 × ($25 + 1 h × $50) = $1,200 direct, × 1.2 = $1,440.
      expect(report.totals.total).toBe(BIDS);
      expect(report.totals.counts.won).toBe(BIDS / 2);
      expect(report.totals.counts.lost).toBe(BIDS / 3);
      expect(report.totals.winRate).toBe(0.6);
      expect(report.totals.wonValue).toBe(1440 * (BIDS / 2));
      expect(report.totals.totalValue).toBe(1440 * BIDS);

      // Then the clock. Generous on purpose — this is not a benchmark, it is
      // a tripwire. A regression to one query per bid means 1,200 round
      // trips and would take minutes, not seconds.
      expect(elapsed).toBeLessThan(15000);
    }, 120000);

    it("returns one row per bid, not one per line item", async () => {
      const bidIds = await seedHistory();

      // The structural claim behind the performance one: 9,600 line items
      // become 1,200 rows before anything leaves the database.
      const rows = await getBidCosts(OWNER, {
        start: new Date("2026-01-01T00:00:00Z"),
        end: new Date("2026-07-01T00:00:00Z"),
        granularity: "month",
        companyProductivityPct: 0,
      });
      expect(rows).toHaveLength(bidIds.length);
      expect(rows.every(row => row.directCost === 1200)).toBe(true);
      expect(rows.every(row => row.totalHours === 16)).toBe(true);
    }, 120000);

    it("keeps a large history scoped to the company that owns it", async () => {
      await seedHistory();
      // The rival has one bid. Volume must not blur the boundary.
      await seedBid({
        userId: OUTSIDER,
        status: "Won",
        createdAt: "2026-03-01",
      });

      const theirs = await callerFor(OUTSIDER).analytics.outcomes(YEAR);
      expect(theirs.totals.total).toBe(1);
      expect(theirs.totals.wonValue).toBe(0);
    }, 120000);
  });
});
