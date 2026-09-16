/**
 * What the AI features cost today, and so far this month.
 *
 * ── Why today AND the month ──────────────────────────────────────────────────
 * The question is never "what did today cost" on its own. It is "is today
 * unusual", and one number cannot answer that. A month beside it turns a
 * figure into a comparison, which is the thing that makes a runaway obvious on
 * the day rather than on the invoice.
 *
 * ── Honest about being approximate ───────────────────────────────────────────
 * These are computed from a local copy of Anthropic's published rates, which
 * goes stale the moment those change. The panel says so, because a number on
 * an admin screen looks authoritative in a way a number in a log file does
 * not, and someone reconciling this against a real bill should know which one
 * is the bill.
 */
import { trpc } from "@/lib/trpc";
import { formatMicros } from "@shared/aiPricing";

/** `plan-read` → `Plan reading`. */
function featureLabel(feature: string): string {
  switch (feature) {
    case "plan-read":
      return "Plan reading";
    case "plan-ask":
      return "Plan questions";
    case "navigation":
      return "Help assistant";
    case "material-aliases":
      return "Material aliases";
    default:
      return feature;
  }
}

export function AiSpendPanel() {
  const spend = trpc.aiUsage.spend.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (spend.isError) {
    return (
      <div>
        <h2 className="mb-3 text-sm font-semibold">AI spend</h2>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Could not read the usage figures. The AI features themselves are
            unaffected — this is only the report.
          </p>
        </div>
      </div>
    );
  }

  const data = spend.data;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">AI spend</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="mt-1 font-mono text-xl tabular-nums">
              {data ? data.todayFormatted : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data ? `${data.todayTotal.calls} calls` : ""}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-muted-foreground">This month</p>
            <p className="mt-1 font-mono text-xl tabular-nums">
              {data ? data.monthFormatted : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data ? `${data.monthTotal.calls} calls` : ""}
            </p>
          </div>
        </div>

        {data && data.monthByFeature.length > 0 ? (
          <div className="divide-y divide-border">
            {data.monthByFeature.map(row => (
              <div
                key={`${row.feature}:${row.model}`}
                className="flex items-baseline justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {featureLabel(row.feature)}
                  </p>
                  <p className="truncate text-[0.65rem] text-muted-foreground">
                    {row.model}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-xs tabular-nums">
                    {formatMicros(row.costMicros)}
                  </p>
                  <p className="text-[0.65rem] tabular-nums text-muted-foreground">
                    {row.calls} calls · {(row.inputTokens / 1000).toFixed(0)}k
                    in · {(row.outputTokens / 1000).toFixed(0)}k out
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {data ? "No AI calls this month." : "Loading…"}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Worked out from this app's copy of Anthropic's published prices, so
        treat it as indicative — the Anthropic console has the real bill. Per
        call it is also written to the server log as{" "}
        <code className="text-[0.7rem]">[llm-cost]</code>, without any prompt or
        reply.
      </p>
    </div>
  );
}
