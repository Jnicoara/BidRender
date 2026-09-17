/**
 * What the finished work earned, against what it was quoted to earn.
 *
 * ── The basis is stated on the screen, not just in the code ──────────────────
 * A close-out records HOURS. There is no actual material cost anywhere in this
 * app, so materials are carried at their estimate and the whole difference
 * between quoted and delivered is labor. That makes this a real but PARTIAL
 * measure, and the note at the top of the panel says so in as many words.
 *
 * Hiding that would be the worst thing this feature could do. A contractor who
 * reads "delivered margin 14%" as a full profit-and-loss figure, and finds out
 * later it never included a material overrun, will not trust any number on this
 * screen again — and they would be right not to.
 *
 * ── A dumbbell, because the story is the gap ─────────────────────────────────
 * Two bars per trade would ask the reader to compare two lengths; a dumbbell
 * draws the distance between them directly, which is the quantity that matters.
 * Both ends are labelled, so the colour of the connector is a second channel and
 * never the only one.
 */
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatTile } from "./StatTile";
import { Legend } from "./OutcomesPanel";
import {
  OUTCOME_COLORS,
  hours,
  percent,
  signedPercent,
  varianceTone,
} from "@/lib/analyticsChart";
import { moneyWhole } from "@/lib/money";

type Group = {
  key: string;
  jobs: number;
  revenue: number;
  estimatedCost: number;
  actualCost: number;
  estimatedProfit: number;
  actualProfit: number;
  estimatedMargin: number | null;
  actualMargin: number | null;
  marginDelta: number | null;
  estimatedHours: number;
  actualHours: number;
  hoursVariance: number | null;
  jobsWithoutLaborBasis: number;
};

type Job = {
  bidId: number;
  name: string;
  trades: string[];
  revenue: number;
  estimatedProfit: number;
  actualProfit: number;
  estimatedMargin: number | null;
  actualMargin: number | null;
  estimatedHours: number;
  actualHours: number;
};

type Report = {
  overall: Group;
  byTrade: Group[];
  multiTradeJobs: number;
  worstJobs: Job[];
  truncated: boolean;
  jobsInRange: number;
};

/** Quoted is the muted end; delivered carries the direction. */
const QUOTED_COLOR = "#64748B";

export function ProfitabilityPanel({
  report,
  onOpenBid,
}: {
  report: Report;
  onOpenBid: (bidId: number) => void;
}) {
  const { overall, byTrade, multiTradeJobs, worstJobs } = report;

  if (overall.jobs === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
        <h3 className="text-sm font-semibold">
          No finished jobs recorded in this period
        </h3>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          This panel is built from job close-outs — the hours a job actually
          took, entered on the bid when the work is done. Close one out and its
          real margin appears here. Nothing else on this screen needs it.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <BasisNote overall={overall} report={report} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Jobs closed out"
          value={String(overall.jobs)}
          hint={`${moneyWhole(overall.revenue)} of work`}
        />
        <StatTile
          label="Quoted margin"
          value={percent(overall.estimatedMargin, 1)}
          hint={`${moneyWhole(overall.estimatedProfit)} expected`}
        />
        <StatTile
          label="Delivered margin"
          value={percent(overall.actualMargin, 1)}
          delta={
            overall.marginDelta === null
              ? undefined
              : `${signedPercent(overall.marginDelta)} against quoted`
          }
          tone={varianceTone(overall.marginDelta, true)}
          hint={`${moneyWhole(overall.actualProfit)} once labor is re-costed`}
        />
        <StatTile
          label="Hours against estimate"
          value={signedPercent(overall.hoursVariance)}
          delta={`${hours(overall.actualHours)} of ${hours(overall.estimatedHours)}`}
          tone={varianceTone(overall.hoursVariance, false)}
          hint="what the crews took, against book"
        />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">
            Quoted against delivered margin, by trade
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {multiTradeJobs > 0
              ? `A bid can carry more than one trade, and ${multiTradeJobs} here ${
                  multiTradeJobs === 1 ? "does" : "do"
                } — those jobs are counted under each of theirs, so these rows add up to more than the total above.`
              : "Each row is every closed-out job carrying that trade."}
          </p>
        </header>
        <div className="p-4">
          <Legend
            items={[
              { label: "Quoted", color: QUOTED_COLOR },
              { label: "Delivered — better", color: OUTCOME_COLORS.won },
              { label: "Delivered — worse", color: OUTCOME_COLORS.lost },
            ]}
          />
          <MarginDumbbells groups={byTrade} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">The figures behind it</h3>
        </header>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[46rem] text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="py-1.5 pr-3 font-medium">Trade</th>
                <th className="py-1.5 pr-3 text-right font-medium">Jobs</th>
                <th className="py-1.5 pr-3 text-right font-medium">Revenue</th>
                <th className="py-1.5 pr-3 text-right font-medium">Quoted</th>
                <th className="py-1.5 pr-3 text-right font-medium">
                  Delivered
                </th>
                <th className="py-1.5 pr-3 text-right font-medium">Change</th>
                <th className="py-1.5 text-right font-medium">Hours</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {byTrade.map(group => (
                <TradeRow key={group.key} group={group} />
              ))}
              <tr className="border-t border-border font-medium">
                <td className="py-2 pr-3">All jobs</td>
                <td className="py-2 pr-3 text-right">{overall.jobs}</td>
                <td className="py-2 pr-3 text-right">
                  {moneyWhole(overall.revenue)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {percent(overall.estimatedMargin, 1)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {percent(overall.actualMargin, 1)}
                </td>
                <td
                  className={cn(
                    "py-2 pr-3 text-right",
                    toneClass(varianceTone(overall.marginDelta, true))
                  )}
                >
                  {signedPercent(overall.marginDelta)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right",
                    toneClass(varianceTone(overall.hoursVariance, false))
                  )}
                >
                  {signedPercent(overall.hoursVariance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {worstJobs.length > 0 && (
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Worth a look</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The jobs whose margin moved furthest from what was quoted, in
              dollars — a small overrun on a big job costs more than a big one
              on a small job.
            </p>
          </header>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[38rem] text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-3 font-medium">Job</th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Revenue
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Hours — actual / quoted
                  </th>
                  <th className="py-1.5 pr-3 text-right font-medium">Margin</th>
                  <th className="py-1.5 text-right font-medium">
                    Profit moved
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {worstJobs.map(job => {
                  const moved = job.actualProfit - job.estimatedProfit;
                  return (
                    <tr
                      key={job.bidId}
                      className="cursor-pointer border-b border-border/50 hover:bg-accent/50"
                      onClick={() => onOpenBid(job.bidId)}
                    >
                      <td className="py-1.5 pr-3 font-sans">{job.name}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {moneyWhole(job.revenue)}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {job.actualHours} / {job.estimatedHours}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        {percent(job.estimatedMargin, 1)} →{" "}
                        {percent(job.actualMargin, 1)}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 text-right",
                          moved < 0 ? "text-destructive" : "text-emerald-500"
                        )}
                      >
                        {moved < 0 ? "−" : "+"}
                        {moneyWhole(Math.abs(moved))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function TradeRow({ group }: { group: Group }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-1.5 pr-3 font-sans capitalize">
        {group.key.replace(/-/g, " ")}
      </td>
      <td className="py-1.5 pr-3 text-right">{group.jobs}</td>
      <td className="py-1.5 pr-3 text-right">{moneyWhole(group.revenue)}</td>
      <td className="py-1.5 pr-3 text-right">
        {percent(group.estimatedMargin, 1)}
      </td>
      <td className="py-1.5 pr-3 text-right">
        {percent(group.actualMargin, 1)}
      </td>
      <td
        className={cn(
          "py-1.5 pr-3 text-right",
          toneClass(varianceTone(group.marginDelta, true))
        )}
      >
        {signedPercent(group.marginDelta)}
      </td>
      <td
        className={cn(
          "py-1.5 text-right",
          toneClass(varianceTone(group.hoursVariance, false))
        )}
      >
        {signedPercent(group.hoursVariance)}
      </td>
    </tr>
  );
}

function toneClass(tone: "good" | "bad" | "neutral"): string {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "bad") return "text-destructive";
  return "text-muted-foreground";
}

/**
 * One row per trade: quoted margin, delivered margin, and the distance.
 *
 * Hand-drawn rather than fitted to a chart library, because the row IS the
 * chart — two positioned dots and the segment between them — and a generic
 * plot would have to be argued out of drawing axes, a legend box and a grid
 * around something that needs none of them.
 */
function MarginDumbbells({ groups }: { groups: Group[] }) {
  const values = groups.flatMap(group =>
    [group.estimatedMargin, group.actualMargin].filter(
      (value): value is number => value !== null
    )
  );
  if (values.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No trade in this period has both a revenue figure and hours to compare.
      </p>
    );
  }

  /**
   * The scale, and the one place this deliberately differs from a bar chart.
   *
   * A bar has to start at zero, because its LENGTH is the value and a truncated
   * axis exaggerates every difference. A dumbbell encodes POSITION and the
   * distance between two positions, so it is free to zoom — and it has to, or a
   * shop whose margins all sit between 20% and 28% gets every row crushed into
   * the right-hand quarter of the track with the differences invisible, which is
   * the whole thing they came to look at.
   *
   * Zero is still drawn when it falls inside the range, because "we lost money
   * on this trade" is a different statement from "we made less than we hoped"
   * and the reader has to be able to see which side of the line a dot is on.
   */
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.1;
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100;
  const zeroAt = at(0);
  const zeroVisible = zeroAt >= 0 && zeroAt <= 100;

  return (
    <div className="space-y-1">
      {groups.map(group => {
        const quoted = group.estimatedMargin;
        const delivered = group.actualMargin;
        if (quoted === null || delivered === null) {
          return (
            <div
              key={group.key}
              className="flex items-center gap-3 py-2 text-xs text-muted-foreground"
            >
              <span className="w-28 shrink-0 capitalize text-foreground">
                {group.key.replace(/-/g, " ")}
              </span>
              <span>No revenue to take a margin of.</span>
            </div>
          );
        }

        const improved = delivered >= quoted;
        const color = improved ? OUTCOME_COLORS.won : OUTCOME_COLORS.lost;
        const left = Math.min(at(quoted), at(delivered));
        const width = Math.abs(at(delivered) - at(quoted));

        return (
          <div key={group.key} className="flex items-center gap-3 py-2">
            <span className="w-28 shrink-0 truncate text-xs capitalize text-foreground">
              {group.key.replace(/-/g, " ")}
            </span>
            <div className="relative h-6 flex-1">
              {/* The track, and the zero line it is read against. */}
              <span
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
                aria-hidden
              />
              {zeroVisible && (
                <span
                  className="absolute top-0 bottom-0 w-px bg-border"
                  style={{ left: `${zeroAt}%` }}
                  aria-hidden
                />
              )}
              {/* The distance — the quantity the reader is here for. */}
              <span
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: color,
                }}
                aria-hidden
              />
              {/* Quoted: hollow, and recessive. */}
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
                style={{ left: `${at(quoted)}%`, borderColor: QUOTED_COLOR }}
                aria-hidden
              />
              {/* Delivered: filled, with a 2px surface ring so it stays legible
                  where it lands on top of the quoted dot. */}
              <span
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                style={{
                  left: `${at(delivered)}%`,
                  background: color,
                  ["--tw-ring-color" as string]: "var(--card)",
                }}
                aria-hidden
              />
            </div>
            {/* Both ends in words, so the colour is never the only channel. */}
            <span className="w-40 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {percent(quoted, 1)} → {percent(delivered, 1)}
              <span
                className={cn("ml-2", toneClass(improved ? "good" : "bad"))}
              >
                {signedPercent(group.marginDelta)}
              </span>
            </span>
          </div>
        );
      })}

      {/*
        The scale, so the dots are read against something. Endpoints only —
        a dumbbell's own labels carry every value, and a full tick row would
        be a second set of numbers saying what the first set already says.
      */}
      <div className="flex items-center gap-3 pt-1">
        <span className="w-28 shrink-0" aria-hidden />
        <div className="relative h-4 flex-1 text-[0.65rem] text-muted-foreground">
          <span className="absolute left-0">{percent(lo, 0)}</span>
          {zeroVisible && (
            <span
              className="absolute -translate-x-1/2"
              style={{ left: `${zeroAt}%` }}
            >
              0%
            </span>
          )}
          <span className="absolute right-0">{percent(hi, 0)}</span>
        </div>
        <span className="w-40 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

/** What this panel does and does not measure, said before any figure is read. */
function BasisNote({ overall, report }: { overall: Group; report: Report }) {
  const unpriced = overall.jobsWithoutLaborBasis;
  return (
    <div className="space-y-2">
      <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Labor is re-costed; materials are held at estimate.
          </span>{" "}
          A close-out records the hours a job took, which is the only actual
          this app collects — so the difference between quoted and delivered
          margin here is entirely labor, priced at the rate each bid was quoted
          at. It is a real measure of estimating accuracy, not a full
          profit-and-loss.
        </p>
      </div>
      {(unpriced > 0 || report.truncated) && (
        <div className="flex gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F5C518]" />
          <p className="text-xs text-muted-foreground">
            {unpriced > 0 && (
              <>
                {unpriced} job{unpriced === 1 ? "" : "s"} carried no estimated
                hours, so there is no rate to re-cost{" "}
                {unpriced === 1 ? "it" : "them"} at.{" "}
                {unpriced === 1 ? "It stands" : "They stand"} at the quoted
                figure.{" "}
              </>
            )}
            {report.truncated && (
              <>
                Only the first {overall.jobs.toLocaleString()} of{" "}
                {report.jobsInRange.toLocaleString()} closed-out jobs in this
                range are included. Narrow the dates for a complete figure.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
