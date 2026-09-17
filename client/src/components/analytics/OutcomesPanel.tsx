/**
 * Win rate, and what a company has been quoting.
 *
 * ── The pending count is on screen everywhere the rate is ────────────────────
 * The win rate counts decided bids only (shared/analytics.ts explains why), and
 * that is only honest if the reader can see what was left out. So every place
 * the rate appears — the headline tile, each point's tooltip, the table — says
 * how many bids are still out alongside it. A rate with a hidden denominator is
 * the thing this feature is most able to mislead somebody with.
 *
 * ── Two charts rather than one with two axes ─────────────────────────────────
 * A rate and a count share no scale, and putting them on one plot with a second
 * y-axis lets the reader invent a relationship out of where the two lines
 * happen to cross. They are stacked instead, over a shared x-axis.
 */
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatTile } from "./StatTile";
import {
  AXIS_TEXT,
  GRID_COLOR,
  MEASURE_COLOR,
  OUTCOME_COLORS,
  compactMoney,
  percent,
} from "@/lib/analyticsChart";
import { moneyWhole } from "@/lib/money";

type Period = {
  bucket: string;
  label: string;
  counts: { won: number; lost: number; draft: number; active: number };
  decided: number;
  pending: number;
  total: number;
  winRate: number | null;
  wonValue: number;
  lostValue: number;
  totalValue: number;
};

type Report = {
  totals: {
    counts: { won: number; lost: number; draft: number; active: number };
    decided: number;
    pending: number;
    total: number;
    winRate: number | null;
    wonValue: number;
    lostValue: number;
    pendingValue: number;
    totalValue: number;
  };
  timeline: Period[];
};

/** A chart's frame: a title, an explanation, and the switch to a table. */
function ChartCard({
  title,
  note,
  showTable,
  onToggleTable,
  children,
  table,
}: {
  title: string;
  note: string;
  showTable: boolean;
  onToggleTable: () => void;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
        {/*
          Not decoration. A chart that can only be read as a picture is a chart
          somebody using a screen reader, or printing it, cannot read at all.
        */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={onToggleTable}
          aria-pressed={showTable}
        >
          {showTable ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <Table2 className="h-3.5 w-3.5" />
          )}
          {showTable ? "Chart" : "Table"}
        </Button>
      </header>
      <div className="p-4">{showTable ? table : children}</div>
    </section>
  );
}

/** The shared tooltip shell, so both charts read identically. */
function TooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; color?: string }>;
}) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map(row => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            {row.color && (
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: row.color }}
                aria-hidden
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OutcomesPanel({ report }: { report: Report }) {
  const [rateTable, setRateTable] = useState(false);
  const [volumeTable, setVolumeTable] = useState(false);
  const { totals, timeline } = report;

  const decidedPeriods = timeline.filter(p => p.winRate !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          hero
          label="Win rate"
          value={percent(totals.winRate)}
          hint={
            totals.decided > 0
              ? `of ${totals.decided} bid${totals.decided === 1 ? "" : "s"} answered`
              : "nothing answered yet"
          }
        />
        <StatTile
          label="Won"
          value={String(totals.counts.won)}
          delta={moneyWhole(totals.wonValue)}
          tone="good"
          hint="bids that came back yes"
        />
        <StatTile
          label="Lost"
          value={String(totals.counts.lost)}
          delta={moneyWhole(totals.lostValue)}
          tone="bad"
          hint="bids that came back no"
        />
        {/*
          Shown beside the rate rather than folded into it. These are the bids
          the win rate deliberately does not count, and a reader has to be able
          to see how much is still in the air.
        */}
        <StatTile
          label="Still out"
          value={String(totals.pending)}
          delta={moneyWhole(totals.pendingValue)}
          hint="drafted or active — not in the rate"
        />
      </div>

      <ChartCard
        title="Win rate over time"
        note="Bids grouped by when they were quoted, then how they turned out. A recent period can look weak simply because its bids have not been answered yet."
        showTable={rateTable}
        onToggleTable={() => setRateTable(v => !v)}
        table={
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-3 font-medium">Period</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Won</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Lost</th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Still out
                  </th>
                  <th className="py-1.5 text-right font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {timeline.map(period => (
                  <tr key={period.bucket} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">{period.label}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {period.counts.won}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {period.counts.lost}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{period.pending}</td>
                    <td className="py-1.5 text-right">
                      {percent(period.winRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      >
        {decidedPeriods.length === 0 ? (
          <EmptyPlot message="No bid in this period has been marked won or lost yet." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={timeline}
              margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid
                stroke={GRID_COLOR}
                strokeWidth={1}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: GRID_COLOR }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={value => percent(Number(value))}
                tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const period = payload[0].payload as Period;
                  return (
                    <TooltipCard
                      title={period.label}
                      rows={[
                        {
                          label: "Win rate",
                          value: percent(period.winRate),
                          color: MEASURE_COLOR,
                        },
                        { label: "Won", value: String(period.counts.won) },
                        { label: "Lost", value: String(period.counts.lost) },
                        // Always alongside, never omitted — see the header.
                        { label: "Still out", value: String(period.pending) },
                      ]}
                    />
                  );
                }}
              />
              {/*
                connectNulls, deliberately. A period with nothing decided has no
                rate, and dropping the line to zero there would draw a crash
                that did not happen. The gap is bridged and the tooltip says the
                period was empty.
              */}
              <Line
                type="monotone"
                dataKey="winRate"
                stroke={MEASURE_COLOR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                connectNulls
                // Same reasoning as the bars above: a re-render mid-animation
                // can leave the line part-drawn, and the draw-on adds nothing
                // to a chart somebody is reading rather than watching.
                isAnimationActive={false}
                dot={{
                  r: 4,
                  fill: MEASURE_COLOR,
                  // A 2px ring in the surface colour, so a dot stays legible
                  // where it sits on the line or against a gridline.
                  stroke: "var(--card)",
                  strokeWidth: 2,
                }}
                activeDot={{ r: 6, stroke: "var(--card)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="What was quoted, and how it went"
        note="Every bid written in the period, by outcome. Still out is the work that has not come back yet."
        showTable={volumeTable}
        onToggleTable={() => setVolumeTable(v => !v)}
        table={
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-3 font-medium">Period</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Bids</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Quoted</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Won</th>
                  <th className="py-1.5 text-right font-medium">Lost</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {timeline.map(period => (
                  <tr key={period.bucket} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">{period.label}</td>
                    <td className="py-1.5 pr-3 text-right">{period.total}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {moneyWhole(period.totalValue)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      {moneyWhole(period.wonValue)}
                    </td>
                    <td className="py-1.5 text-right">
                      {moneyWhole(period.lostValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      >
        {totals.total === 0 ? (
          <EmptyPlot message="No bids were written in this period." />
        ) : (
          <>
            <Legend
              items={[
                { label: "Won", color: OUTCOME_COLORS.won },
                { label: "Lost", color: OUTCOME_COLORS.lost },
                { label: "Still out", color: OUTCOME_COLORS.pending },
              ]}
            />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={timeline}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke={GRID_COLOR}
                  strokeWidth={1}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID_COLOR }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS_TEXT, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const period = payload[0].payload as Period;
                    return (
                      <TooltipCard
                        title={period.label}
                        rows={[
                          {
                            label: "Won",
                            value: `${period.counts.won} · ${moneyWhole(period.wonValue)}`,
                            color: OUTCOME_COLORS.won,
                          },
                          {
                            label: "Lost",
                            value: `${period.counts.lost} · ${moneyWhole(period.lostValue)}`,
                            color: OUTCOME_COLORS.lost,
                          },
                          {
                            label: "Still out",
                            value: String(period.pending),
                            color: OUTCOME_COLORS.pending,
                          },
                          {
                            label: "Quoted",
                            value: moneyWhole(period.totalValue),
                          },
                        ]}
                      />
                    );
                  }}
                />
                {/*
                  stackId shared, and each segment capped at 24px with a 2px
                  surface-coloured gap between them — the separation is the gap,
                  never a stroke drawn around the mark.
                */}
                <Bar
                  dataKey="counts.won"
                  stackId="outcome"
                  fill={OUTCOME_COLORS.won}
                  maxBarSize={24}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  shape={WON_SEGMENT}
                />
                <Bar
                  dataKey="counts.lost"
                  stackId="outcome"
                  fill={OUTCOME_COLORS.lost}
                  maxBarSize={24}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  shape={LOST_SEGMENT}
                />
                <Bar
                  dataKey="pending"
                  stackId="outcome"
                  fill={OUTCOME_COLORS.pending}
                  maxBarSize={24}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  shape={PENDING_SEGMENT}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </ChartCard>
    </div>
  );
}

/**
 * Round the top of a stack, and only the top of it.
 *
 * A stacked bar has one data-end — the very top — and rounding a segment that
 * has another sitting on it puts a curve in the middle of a column. Recharts
 * cannot know which segment that is, because "still out" is often zero and then
 * the lost segment is the cap. So each segment is told how to recognise being
 * on top, from the row it was drawn from.
 */
type SegmentShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  payload?: Period;
};

function segmentShape(isTop: (period: Period) => boolean) {
  return function Segment(props: SegmentShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    // A zero-height segment still gets drawn by recharts as a hairline, which
    // reads as a bar of one on a chart counting bids.
    if (!(height > 0)) return <g />;
    const radius = payload && isTop(payload) ? 4 : 0;
    return (
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={props.fill}
        stroke={props.stroke}
        strokeWidth={props.strokeWidth}
        radius={[radius, radius, 0, 0]}
      />
    );
  };
}

/**
 * Hoisted out of the render, and the bars draw unanimated.
 *
 * Both are about the same failure. A `shape` function created inside JSX is a
 * new prop on every render, which restarts recharts' grow-from-the-baseline
 * animation — and a couple of restarts in quick succession (this page has two
 * queries settling) leaves every column frozen a frame or two in, so the chart
 * renders as a row of slivers. Stable identities fix the restart; switching the
 * animation off removes the failure mode entirely, and a bar chart that simply
 * appears is no worse to read than one that grows.
 */
const WON_SEGMENT = segmentShape(
  period => period.counts.lost === 0 && period.pending === 0
);
const LOST_SEGMENT = segmentShape(period => period.pending === 0);
const PENDING_SEGMENT = segmentShape(() => true);

/** Identity that does not depend on telling two colours apart. */
export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map(item => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EmptyPlot({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed border-border">
      <p className="px-6 text-center text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
