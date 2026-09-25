/**
 * Turning a company's bid history into the two figures it can act on.
 *
 * ── What lives here, and what deliberately does not ──────────────────────────
 * This file is the join between three things that are each owned elsewhere:
 *
 *   server/db.ts          does the aggregation, in SQL, over rows that never
 *                         leave the database.
 *   shared/pricing.ts     prices a bid. Nothing here computes a percentage or
 *                         a markup; the per-bid step calls the real engine.
 *   shared/analytics.ts   decides what the sums MEAN — what counts toward a win
 *                         rate, how a margin is formed, what a partial measure
 *                         is allowed to claim.
 *
 * It exists as its own module rather than inside the router for the reason
 * `server/bidPricing.ts` does: the moment a second caller wants these figures —
 * an export, a weekly email, an AI answer about how the quarter went — the
 * alternative is calling one router from another, which is the shape that ends
 * with two versions of the same number.
 *
 * ── The clock is a parameter ─────────────────────────────────────────────────
 * `now` is passed in, never read. "The last twelve months" cannot be tested by
 * waiting a year, and the same rule already governs the retention purge and the
 * invitation expiry — see shared/retention.ts.
 */
import {
  ANALYTICS_MAX_BIDS,
  countClosedJobs,
  getBidCosts,
  getClosedJobCosts,
  getEarliestBidDate,
  getOutcomeBuckets,
  type BidCostRow,
  type ClosedJobRow,
} from "./db";
import { companyDefaultsFor } from "./bidPricing";
import {
  calculateBidPrice,
  resolveBidPricingSettings,
  roundMoney,
  type CompanyPricingDefaults,
} from "../shared/pricing";
import { closeoutActualHours } from "../shared/closeout";
import {
  DEFAULT_RANGE_MONTHS,
  EMPTY_OUTCOMES,
  addOutcomes,
  buildTimeline,
  bucketKeyFor,
  bucketLabel,
  enumerateBuckets,
  groupByTrade,
  jobProfitability,
  summariseJobs,
  totalBids,
  winRate,
  type AnalyticsGranularity,
  type BucketTotals,
  type JobProfit,
  type OutcomeCounts,
  type OutcomePeriod,
  type ProfitGroup,
} from "../shared/analytics";

// ─── The range ────────────────────────────────────────────────────────────────

export type RangeInput = {
  /** Inclusive, `YYYY-MM-DD`. Omitted means DEFAULT_RANGE_MONTHS back. */
  from?: string;
  /** Inclusive, `YYYY-MM-DD`. Omitted means now. */
  to?: string;
  granularity?: AnalyticsGranularity;
};

export type ResolvedRange = {
  start: Date;
  /** EXCLUSIVE upper bound — see the comment in resolveRange. */
  end: Date;
  granularity: AnalyticsGranularity;
  /** Every period in the range, including the empty ones. */
  buckets: string[];
  from: string;
  to: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: string | undefined): Date | null {
  if (!value || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Work out which window the screen is asking about.
 *
 * ── The upper bound is exclusive, and that is the bug this prevents ──────────
 * A range of 1 March to 31 March compared as `<= 2026-03-31` means
 * `<= 2026-03-31 00:00:00`, which silently drops everything that happened on
 * the last day. It is the most common off-by-one in date filtering and it looks
 * like missing data rather than like a bug, so the end is moved to the start of
 * the following day exactly as shared/bidSearch.ts does it.
 *
 * ── A backwards range returns nothing, rather than being quietly corrected ───
 * Swapping the two would answer a question the user did not ask. An empty
 * result with the dates echoed back is something they can see and fix.
 */
export function resolveRange(input: RangeInput, now: Date): ResolvedRange {
  const granularity: AnalyticsGranularity = input.granularity ?? "month";

  const to =
    asDate(input.to) ??
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  const from =
    asDate(input.from) ??
    new Date(
      Date.UTC(
        to.getUTCFullYear(),
        to.getUTCMonth() - (DEFAULT_RANGE_MONTHS - 1),
        1
      )
    );

  // Exclusive upper bound: the day after the last day the user named.
  const end = new Date(to.getTime());
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    start: from,
    end,
    granularity,
    buckets: enumerateBuckets(from, to, granularity),
    from: asDateString(from),
    to: asDateString(to),
  };
}

// ─── Pricing a row the database summed ────────────────────────────────────────

/**
 * What one bid was quoted at.
 *
 * The direct cost already carries materials, labor and the productivity factor
 * — SQL applied those, because they are per-LINE and summing them there is the
 * whole point. What is left is per-BID and cannot be summed first: overhead may
 * be a flat amount, profit may be a target margin that divides, and either may
 * be overridden on the bid. So the resolution and the final arithmetic run
 * through the same two functions the bid screen uses.
 *
 * A bid whose stored settings the engine refuses — a margin at or above 100%
 * has no finite price — falls back to its direct cost and is counted as
 * unpriced, rather than throwing and taking the whole dashboard down with it.
 * One unquotable bid should cost the contractor one row, not the screen.
 */
function priceBid(
  row: BidCostRow,
  company: CompanyPricingDefaults
): { price: number; priced: boolean } {
  const settings = resolveBidPricingSettings(company, {
    overheadEnabled: row.overheadEnabled,
    overheadMode: row.overheadMode,
    overheadValue: row.overheadValue,
    profitMethod: row.profitMethod,
    profitValue: row.profitValue,
    productivityPct: row.productivityPct,
  });
  try {
    // The same inputs rollUpBid gives the engine: the lines' direct cost plus
    // any marked-up charge, and the lines' material markup on its own.
    const price = calculateBidPrice({
      directCost: roundMoney(row.directCost + row.markedUpExpenses),
      materialMarkup: row.materialMarkup,
      overhead: settings.overhead,
      profit: settings.profit,
    });
    return { price: price.finalPrice, priced: true };
  } catch {
    return {
      price: roundMoney(
        row.directCost + row.markedUpExpenses + row.materialMarkup
      ),
      priced: false,
    };
  }
}

// ─── Outcomes: win rate and volume over time ──────────────────────────────────

export type OutcomesReport = {
  range: { from: string; to: string; granularity: AnalyticsGranularity };
  /** The whole range as one figure. */
  totals: {
    counts: OutcomeCounts;
    decided: number;
    pending: number;
    total: number;
    winRate: number | null;
    wonValue: number;
    lostValue: number;
    pendingValue: number;
    totalValue: number;
  };
  timeline: OutcomePeriod[];
  /**
   * The oldest bid this company has, so the screen can offer "all time" without
   * guessing a start date. Null when they have none.
   */
  earliestBid: string | null;
  /** True when more bids fell in the range than one call will value. */
  truncated: boolean;
};

/**
 * Win rate and volume, by period and in total.
 *
 * ── Two queries, and why the counts do not come from the valued one ──────────
 * The counts come from a query that touches `bids` alone; the values come from
 * a second that joins the line items. They could have been one query, and
 * separating them is deliberate: the count is the headline figure and it must
 * stay correct and cheap however large the history gets, including in the case
 * where the value query hits its ceiling. A win rate computed from a truncated
 * set would be wrong with no way to tell.
 *
 * ── Bids are bucketed by when they were QUOTED ───────────────────────────────
 * Not by when they were won — there is no column recording that. So a period
 * reads as "of the bids written in August, this is how they turned out", which
 * is the right framing for a hit rate anyway: it follows a cohort rather than
 * mixing this month's wins with last quarter's quotes. The cost is that recent
 * periods look weak while their bids are still out, which is why `pending` is
 * returned per period and the screen says so rather than leaving someone to
 * conclude their August was a disaster.
 */
export async function outcomesReport(
  userId: number,
  input: RangeInput,
  now: Date
): Promise<OutcomesReport> {
  const range = resolveRange(input, now);
  const company = await companyDefaultsFor(userId);

  const [buckets, costs, earliest] = await Promise.all([
    getOutcomeBuckets(userId, {
      start: range.start,
      end: range.end,
      granularity: range.granularity,
    }),
    getBidCosts(userId, {
      start: range.start,
      end: range.end,
      granularity: range.granularity,
      companyProductivityPct: company.productivityPct,
    }),
    getEarliestBidDate(userId),
  ]);

  // Counts first, from the cheap query.
  const countsByBucket = new Map<string, OutcomeCounts>();
  for (const row of buckets) {
    const current = countsByBucket.get(row.bucket) ?? { ...EMPTY_OUTCOMES };
    if (row.status === "Won") current.won += row.bids;
    else if (row.status === "Lost") current.lost += row.bids;
    else if (row.status === "Active") current.active += row.bids;
    else current.draft += row.bids;
    countsByBucket.set(row.bucket, current);
  }

  // Then values, from the costed rows.
  const valuesByBucket = new Map<
    string,
    { won: number; lost: number; pending: number; total: number }
  >();
  for (const row of costs) {
    const { price } = priceBid(row, company);
    const current = valuesByBucket.get(row.bucket) ?? {
      won: 0,
      lost: 0,
      pending: 0,
      total: 0,
    };
    if (row.status === "Won") current.won += price;
    else if (row.status === "Lost") current.lost += price;
    else current.pending += price;
    current.total += price;
    valuesByBucket.set(row.bucket, current);
  }

  const rows: BucketTotals[] = range.buckets.map(bucket => {
    const values = valuesByBucket.get(bucket);
    return {
      bucket,
      counts: countsByBucket.get(bucket) ?? EMPTY_OUTCOMES,
      wonValue: values?.won ?? 0,
      lostValue: values?.lost ?? 0,
      totalValue: values?.total ?? 0,
    };
  });

  const timeline = buildTimeline(range.buckets, rows);
  const counts = timeline.reduce(
    (sum, period) => addOutcomes(sum, period.counts),
    EMPTY_OUTCOMES
  );
  const pendingValue = Array.from(valuesByBucket.values()).reduce(
    (sum, value) => sum + value.pending,
    0
  );

  return {
    range: {
      from: range.from,
      to: range.to,
      granularity: range.granularity,
    },
    totals: {
      counts,
      decided: counts.won + counts.lost,
      pending: counts.draft + counts.active,
      total: totalBids(counts),
      winRate: winRate(counts),
      wonValue: roundMoney(timeline.reduce((s, p) => s + p.wonValue, 0)),
      lostValue: roundMoney(timeline.reduce((s, p) => s + p.lostValue, 0)),
      pendingValue: roundMoney(pendingValue),
      totalValue: roundMoney(timeline.reduce((s, p) => s + p.totalValue, 0)),
    },
    timeline,
    earliestBid: earliest ? asDateString(earliest) : null,
    truncated: costs.length >= ANALYTICS_MAX_BIDS,
  };
}

// ─── Profitability: what the finished work actually earned ────────────────────

export type ProfitabilityReport = {
  range: { from: string; to: string; granularity: AnalyticsGranularity };
  /** Every closed-out job in the range, as one line. */
  overall: ProfitGroup;
  /** One line per trade. These do NOT sum to `overall` — see groupByTrade. */
  byTrade: ProfitGroup[];
  /** Jobs counted under more than one trade, so the screen can say so. */
  multiTradeJobs: number;
  /** Closed-out jobs in the range, per period. */
  timeline: Array<{
    bucket: string;
    label: string;
    jobs: number;
    revenue: number;
    estimatedMargin: number | null;
    actualMargin: number | null;
  }>;
  /**
   * The jobs that moved furthest from their estimate, worst first. Capped —
   * this is a "look at these" list, not a report.
   */
  worstJobs: JobProfit[];
  /** True when more jobs closed in the range than one call will value. */
  truncated: boolean;
  /** How many jobs there really are, when truncated. */
  jobsInRange: number;
};

/** How many jobs the "worth a look" list shows. */
const WORST_JOBS_SHOWN = 10;

/**
 * One closed-out job, priced and compared.
 *
 * ── Which "estimated hours" this uses, and why it is the frozen one ──────────
 * Two are available and they are normally identical: the figure frozen onto the
 * close-out when the job was finished, and the figure the bid's lines roll up to
 * right now. This uses the FROZEN one, because that is the number the close-out
 * panel shows the contractor, and a dashboard that reports a different variance
 * for the same job than the screen they entered it on is the app contradicting
 * itself.
 *
 * The money side then follows the hours rather than the other way around: the
 * estimated labor COST is the frozen hours at the bid's own blended rate, so the
 * whole difference between estimated and actual cost is exactly the hours
 * difference priced at one rate. Deriving the two independently would let a
 * job report "10% over on hours" beside a cost variance that could not be got to
 * from it.
 *
 * The rate itself comes from the bid — its labor cost over its hours, both from
 * the line snapshots — because a rate is stable even when hours are not, and
 * because it is the rate the job was actually quoted at rather than today's.
 */
function toClosedJob(
  row: ClosedJobRow,
  company: CompanyPricingDefaults
): JobProfit {
  const actualHours = closeoutActualHours(
    row.mode,
    row.totalActualHours,
    // The per-assembly lines are already summed in SQL, so they arrive as one
    // figure. Wrapped as a single line because that is the shape the shared
    // function takes, and it sums them either way.
    [
      {
        assemblyId: null,
        assemblyName: "",
        estimatedHours: row.closeoutEstimatedHours,
        actualHours: row.lineActualHours,
      },
    ]
  );
  const { price } = priceBid(row, company);
  // The bid's own blended rate. Null when it carried no hours at all, which
  // jobProfitability reports rather than papering over.
  const rate = row.totalHours > 0 ? row.laborCost / row.totalHours : null;
  const estimatedHours = row.closeoutEstimatedHours;

  return jobProfitability({
    bidId: row.id,
    name: row.name,
    trades: row.trades ?? [],
    closedAt: row.closedAt,
    revenue: price,
    estimatedMaterialCost: row.materialCost,
    // Frozen hours at the bid's rate — see the header. With no rate there is no
    // labor cost to attribute, and jobProfitability flags the job instead.
    estimatedLaborCost: rate === null ? 0 : estimatedHours * rate,
    estimatedHours,
    actualHours,
  });
}

/**
 * What the finished work earned, overall and by trade.
 *
 * Reads only jobs that have been closed out — a bid nobody recorded actual
 * hours for has nothing to say here, and is absent rather than being counted at
 * its estimate, which would dilute every figure toward "we hit our numbers
 * exactly".
 */
export async function profitabilityReport(
  userId: number,
  input: RangeInput,
  now: Date
): Promise<ProfitabilityReport> {
  const range = resolveRange(input, now);
  const company = await companyDefaultsFor(userId);

  const [rows, jobsInRange] = await Promise.all([
    getClosedJobCosts(userId, {
      start: range.start,
      end: range.end,
      granularity: range.granularity,
      companyProductivityPct: company.productivityPct,
    }),
    countClosedJobs(userId, { start: range.start, end: range.end }),
  ]);

  const jobs = rows.map(row => toClosedJob(row, company));
  const { groups, multiTradeJobs } = groupByTrade(jobs);

  // Closed-out jobs sit on the timeline by when they FINISHED, not by when they
  // were quoted — unlike the outcomes report, which follows a cohort of bids.
  // The two axes answer different questions and are deliberately different.
  const byBucket = new Map<string, JobProfit[]>();
  for (const job of jobs) {
    const bucket = bucketKeyFor(job.closedAt, range.granularity);
    const list = byBucket.get(bucket);
    if (list) list.push(job);
    else byBucket.set(bucket, [job]);
  }

  const timeline = range.buckets.map(bucket => {
    const group = summariseJobs(bucket, byBucket.get(bucket) ?? []);
    return {
      bucket,
      label: bucketLabel(bucket),
      jobs: group.jobs,
      revenue: group.revenue,
      estimatedMargin: group.estimatedMargin,
      actualMargin: group.actualMargin,
    };
  });

  // Worst first, by how much money the job lost against its own estimate. By
  // DOLLARS rather than by percentage: a 40% overrun on a $900 service call is
  // a bad afternoon, and a 6% overrun on a $400,000 fit-out is the one that
  // needs looking at.
  const missedBy = (job: JobProfit) => job.actualProfit - job.estimatedProfit;
  const worstJobs = jobs
    .filter(job => job.hasLaborBasis)
    .slice()
    .sort((a, b) => missedBy(a) - missedBy(b))
    .slice(0, WORST_JOBS_SHOWN);

  return {
    range: {
      from: range.from,
      to: range.to,
      granularity: range.granularity,
    },
    overall: summariseJobs("all", jobs),
    byTrade: groups,
    multiTradeJobs,
    timeline,
    worstJobs,
    truncated: jobsInRange > rows.length,
    jobsInRange,
  };
}
