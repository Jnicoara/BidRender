/**
 * Business performance — the screen a contractor opens to ask "how are we
 * actually doing?"
 *
 * ── It formats; it never computes ────────────────────────────────────────────
 * Every figure on this page comes from `analytics.outcomes` and
 * `analytics.profitability`, which aggregate in SQL and interpret in
 * shared/analytics.ts. Nothing here divides one number by another. That is the
 * same rule the Dashboard follows, and the reason is the same: a screen that
 * does its own arithmetic is a second implementation that will eventually
 * disagree with the first, and the disagreement will be a money figure.
 *
 * ── Two questions, deliberately kept apart ───────────────────────────────────
 * Win rate is about bids: which of the jobs quoted came back yes. Profitability
 * is about finished work: what the jobs that were actually done earned. They sit
 * on different date axes — one groups by when a bid was written, the other by
 * when a job was closed out — and blending them into one timeline would produce
 * a chart nobody could read a true statement off.
 *
 * ── The gate here is honesty, not security ───────────────────────────────────
 * `analytics.view` is enforced on the server. The check below exists so an
 * estimator who reaches this address gets a sentence explaining their access
 * rather than a screen of errors. See useCompany.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { BarChart3, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { OutcomesPanel } from "@/components/analytics/OutcomesPanel";
import { ProfitabilityPanel } from "@/components/analytics/ProfitabilityPanel";
import {
  RANGE_LABELS,
  rangeForPreset,
  type RangePreset,
} from "@/lib/analyticsChart";

const PRESETS: RangePreset[] = ["12m", "24m", "ytd", "all"];

export default function AnalyticsPage({
  onOpenBid,
}: {
  onOpenBid: (bidId: number) => void;
}) {
  const access = useCompany();
  const [preset, setPreset] = useState<RangePreset>("12m");

  const canView = access.can("analytics.view");
  const [earliestBid, setEarliestBid] = useState<string | null>(null);

  /**
   * The window both panels read, so they can never cover different dates.
   *
   * Only "All time" needs `earliestBid` — the company's oldest bid, which the
   * server returns precisely so this does not have to be guessed at. Until the
   * first response arrives it falls back to the start of the year, then settles
   * once. Every other preset ignores it and resolves in one pass.
   */
  const range = useMemo(
    () => rangeForPreset(preset, new Date(), earliestBid),
    [preset, earliestBid]
  );

  const { data: outcomes, isLoading: loadingOutcomes } =
    trpc.analytics.outcomes.useQuery(range, {
      enabled: canView,
      staleTime: 60_000,
      // Keeping the previous window on screen while a new one loads stops the
      // whole page collapsing to skeletons every time a preset is clicked.
      placeholderData: previous => previous,
    });

  if (outcomes && outcomes.earliestBid !== earliestBid) {
    setEarliestBid(outcomes.earliestBid);
  }

  const { data: profitability, isLoading: loadingProfit } =
    trpc.analytics.profitability.useQuery(range, {
      enabled: canView,
      staleTime: 60_000,
      placeholderData: previous => previous,
    });

  if (!access.loading && !canView) {
    return (
      <div className="flex h-full flex-col bg-background">
        <PageHeader />
        <div className="flex flex-1 items-start justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-card px-6 py-8 text-center">
            <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">
              This one is for owners and admins
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Company win rate and margins are held tighter than the bids
              themselves — you can open and price any bid here, but the figures
              for the business as a whole are the owner's to share. Ask whoever
              runs this company if you need them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const loading = loadingOutcomes || loadingProfit;

  return (
    <div className="flex h-full flex-col bg-background">
      <PageHeader companyName={access.companyName} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        {PRESETS.map(option => (
          <Button
            key={option}
            size="sm"
            variant={preset === option ? "secondary" : "ghost"}
            className={cn(
              "h-7 text-xs",
              preset === option && "border border-border"
            )}
            onClick={() => setPreset(option)}
            aria-pressed={preset === option}
          >
            {RANGE_LABELS[option]}
          </Button>
        ))}
        {outcomes && (
          <span className="ml-auto text-xs text-muted-foreground">
            {outcomes.range.from} to {outcomes.range.to} · by{" "}
            {outcomes.range.granularity}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && !outcomes ? (
          <LoadingSkeleton />
        ) : (
          <div className="mx-auto max-w-6xl space-y-8">
            {outcomes && outcomes.totals.total === 0 ? (
              <section className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
                <h2 className="text-sm font-semibold">
                  No bids in this period
                </h2>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                  This screen is built entirely from bids and their outcomes.
                  Write a bid, mark it won or lost when you hear back, and the
                  figures fill in on their own — there is nothing here to set
                  up.
                </p>
              </section>
            ) : (
              outcomes && (
                <section>
                  <SectionHeading
                    title="Winning work"
                    note="Which of the bids you wrote came back yes."
                  />
                  <OutcomesPanel report={outcomes} />
                </section>
              )
            )}

            {profitability && (
              <section>
                <SectionHeading
                  title="What the work earned"
                  note="Finished jobs, from the hours recorded at close-out."
                />
                <ProfitabilityPanel
                  report={profitability}
                  onOpenBid={onOpenBid}
                />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PageHeader({ companyName }: { companyName?: string }) {
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">
            Performance{companyName ? ` — ${companyName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground">
            Win rate, and what your finished jobs actually earned.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * A skeleton rather than a spinner.
 *
 * These are two aggregate queries over a whole bid history — genuinely slow
 * enough to need an indicator, and a shape that hints at what is arriving beats
 * a rotating circle that says only "wait".
 */
function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(index => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-lg border border-border bg-card"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
      <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
