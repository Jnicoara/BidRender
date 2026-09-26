/**
 * Pricing problems — the ERR- references, for whoever runs BidRidge.
 *
 * A bid line the engine cannot price is left out of the bid's totals and filed
 * as a report with a reference (shared/linePricingProblems.ts). A contractor
 * sees the reference on the line and in any refusal; this is where somebody
 * who is told "it says ERR-1042" can find it, and where anyone can see what is
 * still outstanding across every company.
 *
 * ── Gated the way the rest of the Admin screen is ────────────────────────────
 * It lives on AdminSettingsPage, which the nav offers only to `role ===
 * "admin"` and which refuses anyone else. The data behind it is
 * `adminProcedure` (server/routers/pricingProblemsRouter.ts), and THAT is the
 * lock; the two client checks only keep the screen from being offered.
 *
 * ── Ids, not names ───────────────────────────────────────────────────────────
 * A row names the company, bid and line by id and shows the stored value. The
 * report table holds nothing else, on purpose: an admin screen that printed
 * bid names would be reading contractors' jobs to diagnose a number.
 */
import { useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status = "open" | "resolved" | "all";
type Order = "newest" | "oldest";

/** One report as the router presents it — `list` items and `find` alike. */
type Report = {
  ref: string;
  status: "open" | "resolved";
  userId: number;
  bidId: number;
  lineId: number | null;
  message: string;
  detail: string;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

function when(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Report["status"] }) {
  // Red for open, the same red the bid screen uses for "can't price": an open
  // report IS a bid somewhere whose total is short right now.
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide",
        status === "open"
          ? "border-red-500/40 text-red-500"
          : "border-border text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}

function ReportRow({ report }: { report: Report }) {
  return (
    <div className="space-y-1 px-5 py-3">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm">{report.ref}</span>
        <StatusBadge status={report.status} />
        <span className="ml-auto shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
          seen {report.occurrences}×
        </span>
      </div>
      <p className="text-xs">
        {report.message}{" "}
        <span className="font-mono text-muted-foreground">{report.detail}</span>
      </p>
      <p className="text-[0.7rem] text-muted-foreground">
        Company {report.userId} · bid {report.bidId} ·{" "}
        {report.lineId === null
          ? "the bid's settings"
          : `line ${report.lineId}`}
      </p>
      <p className="text-[0.7rem] tabular-nums text-muted-foreground">
        Raised {when(report.firstSeenAt)} · last seen {when(report.lastSeenAt)}{" "}
        · resolved{" "}
        {report.resolvedAt ? (
          when(report.resolvedAt)
        ) : (
          <span className="text-red-500">not yet</span>
        )}
      </p>
    </div>
  );
}

/** Look one reference up, in any company. */
function Lookup() {
  const [typed, setTyped] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const found = trpc.pricingProblems.find.useQuery(
    { ref: asked ?? "" },
    // A reference that does not exist will not exist on a retry either.
    { enabled: asked !== null, retry: false }
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ref = typed.trim();
    if (ref) setAsked(ref);
  };

  return (
    <div className="border-b border-border px-5 py-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder="ERR-1042"
          aria-label="Reference to look up"
          className="h-8 max-w-48 font-mono text-sm"
        />
        <Button type="submit" size="sm" variant="outline" className="h-8">
          Look up
        </Button>
      </form>
      {asked !== null && (
        <div className="-mx-5 mt-2">
          {found.isLoading ? (
            <p className="px-5 text-xs text-muted-foreground">Looking…</p>
          ) : found.error ? (
            <p className="px-5 text-xs text-red-500">{found.error.message}</p>
          ) : found.data ? (
            <div className="rounded-md bg-muted/30">
              <ReportRow report={found.data} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function PricingProblemsPanel() {
  const [status, setStatus] = useState<Status>("open");
  const [order, setOrder] = useState<Order>("newest");

  const counts = trpc.pricingProblems.counts.useQuery(undefined, {
    retry: false,
  });
  const list = trpc.pricingProblems.list.useInfiniteQuery(
    { status, order },
    {
      getNextPageParam: page => page.nextCursor,
      // Keep the old rows on screen while a new filter loads, rather than
      // flashing an empty list (CLAUDE.md § Responsiveness rule 3).
      placeholderData: previous => previous,
      retry: false,
    }
  );
  const rows = list.data?.pages.flatMap(page => page.items) ?? [];

  /*
    A count still loading reads "—", never 0. "0 open" is the good news this
    section exists to deliver, so it must not appear before it is true.
  */
  const countOf = (key: "open" | "resolved") =>
    counts.data ? String(counts.data[key]) : "—";
  const tabs: { key: Status; label: string }[] = [
    { key: "open", label: `Open ${countOf("open")}` },
    { key: "resolved", label: `Resolved ${countOf("resolved")}` },
    { key: "all", label: "All" },
  ];

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Pricing problems</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Lookup />

        <div className="flex flex-wrap items-center gap-1 border-b border-border px-5 py-2">
          {tabs.map(tab => (
            <Button
              key={tab.key}
              size="sm"
              variant={status === tab.key ? "secondary" : "ghost"}
              className="h-7 text-xs tabular-nums"
              aria-pressed={status === tab.key}
              onClick={() => setStatus(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}
            title="Order by when each problem was first raised"
          >
            {order === "newest" ? "Newest first" : "Oldest first"}
          </Button>
        </div>

        {list.isError ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            Could not read the reports. Bids are unaffected — this is only the
            list.
          </p>
        ) : list.isLoading ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            {status === "open"
              ? "No open reports."
              : status === "resolved"
                ? "No resolved reports yet."
                : "No reports yet."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map(report => (
              <ReportRow key={report.ref} report={report} />
            ))}
          </div>
        )}

        {list.hasNextPage && (
          <div className="border-t border-border px-5 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A line that can't be priced is left out of its bid's totals and filed
        here when that bid is next opened, so a broken bid nobody has opened
        since is not listed yet. A report resolves itself the next time its bid
        is opened and the line prices. Companies, bids and lines are shown by id
        only.
      </p>
    </div>
  );
}
