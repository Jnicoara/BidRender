import { useMemo, useRef } from "react";
import { FileText, Map as MapIcon, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { LoadFailed } from "@/components/LoadFailed";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { useStartBid } from "@/hooks/useStartBid";
import { planCountLabel, recentPlanBids } from "@shared/planCounts";

const STATUS_ACCENT: Record<string, string> = {
  Draft: "text-muted-foreground",
  Active: "text-[#F5C518]",
  Won: "text-emerald-400",
  Lost: "text-destructive",
};

/**
 * Plans — every live bid that has drawings, newest upload first (owner,
 * 2026-10-14: "Plans own nav tab"). The design is Phase 2 of
 * `references/track-b-beta-plan.md` § 3, deferred on 2026-09-27 and asked for
 * now: a real screen behind the entry, never a "which one?" chooser.
 *
 * - Each row opens that bid's plans (where you count and trace), with the bid
 *   one tap away beside it.
 * - "Upload a plan" is the first thing on the screen and does what it does on
 *   the Dashboard: starts a bid named from the file and opens its plans.
 * - Read from the Dashboard's own query (`bids.dashboard`) through the same
 *   `recentPlanBids` the Dashboard's "Recent plans" row uses, so the two
 *   lists cannot disagree about which bids have plans. That query already
 *   loads every live bid for the board, so this adds no request.
 *
 * Archived bids are not listed — the Dashboard query leaves them out, and a
 * plan on an archived bid is reached by restoring the bid.
 */
export default function PlansIndexPage({
  onOpenBid,
  onOpenPlans,
  onCount,
}: {
  onOpenBid: (id: number) => void;
  onOpenPlans: (id: number) => void;
  onCount: (id: number) => void;
}) {
  const access = useCompany();
  const start = useStartBid({
    openBid: onOpenBid,
    openPlans: onOpenPlans,
    openCount: onCount,
  });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const {
    data: bids = [],
    isLoading,
    isError,
    refetch,
  } = trpc.bids.dashboard.useQuery();
  const withPlans = useMemo(() => recentPlanBids(bids, Infinity), [bids]);
  const canUpload = access.can("bids.edit");

  const uploadButton = canUpload && (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) start.uploadPlan(file);
        }}
      />
      <Button
        size="sm"
        className="h-8 gap-1.5 text-xs shrink-0"
        disabled={start.busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="w-3.5 h-3.5" />
        Upload a plan
      </Button>
    </>
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="page-header border-b border-border px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <MapIcon className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Plans</h1>
            <p className="text-xs text-muted-foreground">
              Every bid with drawings, newest upload first. Open one to count
              and trace.
            </p>
          </div>
          {uploadButton}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="h-14 rounded-lg border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : isError ? (
          <LoadFailed what="your plans" onRetry={() => void refetch()} />
        ) : withPlans.length === 0 ? (
          <div className="max-w-4xl rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No plans yet.</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Upload a drawing set and it starts a bid named from the file. A
              bid never has to have plans.
            </p>
          </div>
        ) : (
          <ul className="max-w-4xl divide-y divide-border rounded-xl border border-border bg-card">
            {withPlans.map(bid => {
              const uploaded = bid.plans.lastUploadedAt
                ? new Date(bid.plans.lastUploadedAt).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )
                : null;
              return (
                <li
                  key={bid.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <button
                    className="flex-1 min-w-[10rem] text-left"
                    onClick={() => onOpenPlans(bid.id)}
                    title={`Open the plans for ${bid.name}`}
                  >
                    <span className="block text-sm font-medium truncate hover:text-[#F5C518]">
                      {bid.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {planCountLabel(bid.plans)}
                      {uploaded && ` · uploaded ${uploaded}`}
                      {" · "}
                      <span className={cn(STATUS_ACCENT[bid.status] ?? "")}>
                        {bid.status}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => onOpenBid(bid.id)}
                    >
                      Bid
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => onOpenPlans(bid.id)}
                    >
                      Open plans
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
