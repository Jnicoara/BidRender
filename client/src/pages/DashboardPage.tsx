/**
 * DashboardPage — every bid, by status, at a glance.
 *
 * Replaces the old Projects page as the app's landing view.
 *
 * ── Why a four-column board ──────────────────────────────────────────────────
 * Status is the thing an estimator scans by ("what's still in draft, what have
 * I won"), so it is the axis with the most information per glance. Columns keep
 * a stable shape whether or not they hold anything, so the eye learns where to
 * look instead of re-reading headings each time.
 *
 * ── Ordering lives elsewhere ─────────────────────────────────────────────────
 * Grouping and sorting come from @/lib/bidDashboard, which is pure and tested —
 * including the rule that undated bids sort BELOW dated ones, so a bid with no
 * deadline never crowds out one that has a real date.
 *
 * ── No new pricing ───────────────────────────────────────────────────────────
 * Card values come from bids.dashboard, which rolls each bid up through the
 * same code path the detail view uses. This screen formats; it never computes.
 */
import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Archive,
  CalendarDays,
  Search,
  LayoutDashboard,
  Plus,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArchiveBidDialog } from "@/components/ArchiveBidDialog";
import { useCompany } from "@/hooks/useCompany";
import { type PendingArchive } from "@/lib/archiveBid";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { NavigationHelper } from "@/components/NavigationHelper";
import { BidSearchPanel } from "@/components/BidSearchPanel";
import { NewBidMenu, StartBidCards } from "@/components/StartBidCards";
import { SampleBidCard } from "@/components/SampleBidCard";
import { realBidValue } from "@shared/sampleProject";
import { isChecklistComplete } from "@shared/onboarding";
import {
  bidNameFromFilename,
  clearPendingPlan,
  newBidName,
  putPendingPlan,
} from "@/lib/pendingPlanUpload";
import { RETENTION_DAYS } from "@shared/retention";
import {
  BID_STATUS_ORDER,
  calendarDate,
  dueUrgency,
  groupBidsByStatus,
  type DueUrgency,
} from "@/lib/bidDashboard";
import { moneyWhole } from "@/lib/money";

/** Deadlines read as a weekday and date — "Fri 14 Aug" scans faster than a slashed number. */
const formatDue = (value: string | Date | null) => {
  // calendarDate, not `new Date(value)` — a stored "2026-08-14" parses as UTC
  // midnight and would print as the 13th anywhere behind UTC.
  const date = calendarDate(value);
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

/**
 * How many cards a status column shows before it stops.
 *
 * ── Why the board is capped at all ──────────────────────────────────────────
 * It used to render every live bid. At 1,149 bids that was 1,151 cards, ~29,000
 * DOM nodes and forty screens of scrolling on the screen the app opens on — and
 * CLAUDE.md § Responsiveness is explicit that a list which is fine at 28 rows
 * and unusable at 5,000 is a bug rather than a future optimisation.
 *
 * Twelve because the board is a glance, not a list. The column heading already
 * carries the true count and the true value — those come from the whole set and
 * are NOT capped, so the money never lies — and anyone who wants the rest wants
 * to search rather than scroll past four hundred cards.
 */
const CARDS_PER_COLUMN = 12;

const STATUS_ACCENT: Record<string, string> = {
  Draft: "text-muted-foreground",
  Active: "text-[#F5C518]",
  Won: "text-emerald-400",
  Lost: "text-destructive",
};

/** Only a deadline that needs attention gets colour. Everything else stays quiet. */
const URGENCY_STYLE: Record<DueUrgency, string> = {
  none: "text-muted-foreground/60",
  overdue: "text-destructive",
  today: "text-[#F5C518]",
  soon: "text-[#F5C518]/80",
  later: "text-muted-foreground",
};

const URGENCY_LABEL: Partial<Record<DueUrgency, string>> = {
  overdue: "overdue",
  today: "due today",
};

export default function DashboardPage({
  onOpenBid,
  onOpenArchive,
  onOpenPlans,
  onCount,
}: {
  onOpenBid: (id: number) => void;
  onOpenArchive: () => void;
  /** Open a bid's Takeoff screen — where an uploaded plan lands. */
  onOpenPlans: (id: number) => void;
  /** Open a bid's counting screen. */
  onCount: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [confirmArchive, setConfirmArchive] = useState<PendingArchive | null>(
    null
  );

  const utils = trpc.useUtils();
  const { data: bids = [], isLoading } = trpc.bids.dashboard.useQuery();
  const { data: archived = [] } = trpc.bids.archived.useQuery();

  const createBid = trpc.bids.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: bid => {
      if (bid) onOpenBid(bid.id);
    },
    onSettled: () => {
      void utils.bids.dashboard.invalidate();
      void utils.bids.list.invalidate();
    },
  });

  /**
   * "Upload a plan": make the bid the plan needs, then open its Takeoff screen
   * with the file already in hand.
   *
   * The file is validated on the Takeoff screen rather than here, so there is
   * one place that decides what a plan may be — checkPdfUpload, the same
   * function the server runs. Checking it in two places is how the two answers
   * start to differ.
   */
  const startFromPlan = trpc.bids.create.useMutation({
    onError: error => {
      clearPendingPlan();
      toast.error(error.message);
    },
    onSuccess: bid => {
      if (!bid) {
        clearPendingPlan();
        return;
      }
      onOpenPlans(bid.id);
    },
    onSettled: () => {
      void utils.bids.dashboard.invalidate();
      void utils.bids.list.invalidate();
    },
  });

  const handleUploadPlan = (file: File) => {
    putPendingPlan(file);
    startFromPlan.mutate({ name: bidNameFromFilename(file.name) });
  };

  /**
   * "Quick bid": make the bid, then open it in counting mode.
   *
   * Symmetric with the plan upload above, and for the same reason its comment
   * gives — asking for a name first puts a form in front of the single action
   * the button offers. This card used to open a chooser listing every bid the
   * user had ever written, which is the friction Quick bid exists to remove.
   *
   * The bid is named for the day rather than left blank: a nameless bid is
   * indistinguishable from every other nameless bid on the board, and the name
   * is editable the moment the screen opens.
   */
  const startCounting = trpc.bids.create.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: bid => {
      if (bid) onCount(bid.id);
    },
    onSettled: () => {
      void utils.bids.dashboard.invalidate();
      void utils.bids.list.invalidate();
    },
  });

  const handleQuickBid = () => {
    startCounting.mutate({ name: newBidName(new Date()) });
  };

  /**
   * Whether this account has outgrown the explanatory start cards.
   *
   * Tied to the getting-started checklist rather than to a count of bids or a
   * "seen it" flag, because the checklist is already decided from the user's
   * real data — see shared/onboarding.ts, which is explicit that a step must
   * never tick because a screen was opened. Reusing it means the Dashboard
   * graduates on the same evidence the checklist does.
   *
   * While the query is in flight this reads as graduated, NOT as new. Either
   * default shows the wrong thing for a moment, and this is the cheaper wrong:
   * the compact menu carries all three routes, so a new user briefly sees a
   * working control that then expands into the explained version. The other way
   * round, every returning user watches six inches of cards appear and then
   * vanish on every single load.
   */
  const { data: onboarding } = trpc.onboarding.state.useQuery();
  const graduated = onboarding ? isChecklistComplete(onboarding.steps) : true;

  /**
   * Optimistic: the card leaves the board the moment it is archived, per the
   * responsiveness rules. The undo in the toast is the safety net — archiving
   * the wrong bid is a slip, and the fix should not require finding the
   * Archive screen.
   */
  const archiveBid = trpc.bids.archive.useMutation({
    onMutate: async ({ id }) => {
      await utils.bids.dashboard.cancel();
      const snapshot = utils.bids.dashboard.getData();
      // Captured BEFORE the optimistic removal — by the time onSuccess runs the
      // row is out of the cache, and looking it up there names every bid "Bid".
      const name = snapshot?.find(b => b.id === id)?.name;
      utils.bids.dashboard.setData(undefined, old =>
        old?.filter(b => b.id !== id)
      );
      return { snapshot, name };
    },
    onError: (error, _vars, context) => {
      if (context?.snapshot)
        utils.bids.dashboard.setData(undefined, context.snapshot);
      toast.error(error.message);
    },
    onSuccess: (_result, { id }, context) => {
      toast.success(
        `${context?.name ?? "Bid"} archived — ${RETENTION_DAYS} days to change your mind.`,
        { action: { label: "Undo", onClick: () => restoreBid.mutate({ id }) } }
      );
    },
    onSettled: () => {
      void utils.bids.dashboard.invalidate();
      void utils.bids.archived.invalidate();
      void utils.bids.list.invalidate();
    },
  });

  const restoreBid = trpc.bids.restore.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => toast.success("Back on your dashboard."),
    onSettled: () => {
      void utils.bids.dashboard.invalidate();
      void utils.bids.archived.invalidate();
      void utils.bids.list.invalidate();
    },
  });

  /**
   * Which columns the user has asked to see in full.
   *
   * Per column rather than one switch for the board: someone chasing a job
   * expands the one status it is in, and expanding Draft should not also render
   * four hundred Lost cards they did not ask for.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /** The find-a-bid panel, shut until asked for. See where it renders. */
  const [findOpen, setFindOpen] = useState(false);
  const access = useCompany();
  const shownFor = useCallback(
    <T,>(status: string, all: T[]): T[] =>
      expanded[status] ? all : all.slice(0, CARDS_PER_COLUMN),
    [expanded]
  );

  const groups = useMemo(() => groupBidsByStatus(bids), [bids]);

  /** One number per column, plus the headline: what is still in play. */
  const summary = useMemo(() => {
    const perStatus = Object.fromEntries(
      groups.map(g => [
        g.status,
        {
          count: g.bids.length,
          value: g.bids.reduce((sum, b) => sum + b.finalPrice, 0),
        },
      ])
    ) as Record<string, { count: number; value: number }>;

    // The sample is excluded from the headline figure, and that exclusion is
    // the whole "never confusable with a real bid" guarantee. A row on a list
    // gets inspected; a total does not — a fictional $15,000 folded into "Out
    // for bid" is worse than an unlabelled row, because nobody checks it.
    const open = realBidValue(
      bids.filter(b => b.status === "Draft" || b.status === "Active"),
      b => b.finalPrice
    );
    return {
      perStatus,
      openValue: open.total,
      openCount: open.count,
      sampleExcluded: open.sampleExcluded,
    };
  }, [groups]);

  const start = () => {
    if (!name.trim()) {
      toast.error("Give the bid a name.");
      return;
    }
    createBid.mutate({ name: name.trim() });
    setName("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Every bid by stage. Draft and Active sort by deadline; Won and
              Lost by what you touched last.
            </p>
          </div>
          <div className="text-right shrink-0 mr-2">
            <div className="text-xs text-muted-foreground">
              Out for bid ({summary.openCount})
            </div>
            <div className="font-mono text-base text-[#F5C518]">
              {moneyWhole(summary.openValue)}
            </div>
          </div>
          {/* Only offered once there is something in it — an always-visible
              empty Archive is a door to a blank room. */}
          {archived.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={onOpenArchive}
            >
              <Archive className="w-3.5 h-3.5" /> Archive
              <span className="text-muted-foreground">{archived.length}</span>
            </Button>
          )}
          {/*
            While the checklist is unfinished, the two cards below are the ways
            in and this stays a quiet third option — a shell to hold a name, a
            date and a client before any pricing exists. Three loud buttons
            would be no emphasis at all.

            Once the checklist is done the cards go, and this becomes the one
            control that carries all three routes. See NewBidMenu.
          */}
          {graduated ? (
            <NewBidMenu
              onUploadPlan={handleUploadPlan}
              onQuickBid={handleQuickBid}
              onEmptyBid={() => setAdding(v => !v)}
              busy={startFromPlan.isPending || startCounting.isPending}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs shrink-0"
              onClick={() => setAdding(v => !v)}
            >
              <Plus className="w-3.5 h-3.5" /> Empty bid
            </Button>
          )}
        </div>

        {adding && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") start();
                if (e.key === "Escape") {
                  setAdding(false);
                  setName("");
                }
              }}
              placeholder="Bid name — e.g. Maple Street duplex"
              className="h-8 flex-1 min-w-[14rem] text-sm"
              autoFocus
            />
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={start}>
              <Check className="w-3 h-3" /> Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setAdding(false);
                setName("");
              }}
            >
              <X className="w-3 h-3" /> Cancel
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Above the bids, because a new account has no bids and this is the
            only thing on the screen worth reading. Both disappear once they
            have served their purpose — the checklist when every step is done,
            and neither ever blocks what is underneath. */}
        {/* The two ways in, first — the question a new account has is "how do I
            start", and everything below this answers "what have I got". They
            stay for a returning user too, because starting the next job is the
            other thing this screen is for. */}
        <div className="mb-5 space-y-3">
          {!graduated && (
            <StartBidCards
              onUploadPlan={handleUploadPlan}
              onQuickBid={handleQuickBid}
              busy={startFromPlan.isPending || startCounting.isPending}
            />
          )}
          <SampleBidCard onOpenBid={onOpenBid} />
          <GettingStartedChecklist />
          <NavigationHelper className="max-w-xl" />
        </div>

        {/*
          Finding one job, without scrolling the board.

          The board is a glance at what is live; this is how you reach a
          specific bid out of thousands. It is the same BidSearchPanel the Bids
          screen uses — server-side, keyset-paginated, ~30ms whatever the size
          of the history — rather than a second search that would eventually
          disagree with it. Collapsed by default so the board stays the thing
          the Dashboard is.
        */}
        <div className="mb-4">
          {findOpen ? (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Find a bid</span>
                <button
                  onClick={() => setFindOpen(false)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
              <BidSearchPanel
                onOpenBid={onOpenBid}
                onArchive={
                  access.can("bids.edit")
                    ? bid => setConfirmArchive({ id: bid.id, name: bid.name })
                    : undefined
                }
              />
            </div>
          ) : (
            <button
              onClick={() => setFindOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              Find a bid — by job name, client or address
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading bids…
          </div>
        ) : bids.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No bids yet. Create one to start pricing a job.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {groups.map(group => {
              const stats = summary.perStatus[group.status] ?? {
                count: 0,
                value: 0,
              };
              return (
                <div key={group.status} className="min-w-0">
                  <div className="flex items-baseline gap-2 mb-2 px-1">
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        STATUS_ACCENT[group.status]
                      )}
                    >
                      {group.status}
                    </span>
                    <span className="text-xs text-muted-foreground/70">
                      {stats.count}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {moneyWhole(stats.value)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.bids.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground/70">
                        Nothing here
                      </div>
                    ) : (
                      shownFor(group.status, group.bids).map(bid => {
                        const urgency = dueUrgency(bid.dueDate);
                        const due = formatDue(bid.dueDate);
                        return (
                          // A div rather than a button: the card carries its
                          // own Archive control, and a button inside a button
                          // is invalid and swallows the inner click.
                          <div
                            key={bid.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenBid(bid.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenBid(bid.id);
                              }
                            }}
                            className="group w-full text-left rounded-xl border border-border bg-card px-3 py-3 cursor-pointer hover:bg-muted/20 hover:border-border/80 transition-colors focus-visible:outline-none focus-visible:border-[#F5C518]"
                          >
                            <div className="flex items-start gap-2">
                              <span className="flex-1 min-w-0 text-sm font-medium truncate">
                                {bid.name}
                                {/* The dashboard is the surface where a
                                    fictional figure would do the most damage,
                                    so the row says what it is even though its
                                    value is already left out of the total. */}
                                {bid.isSample && (
                                  <span className="ml-2 text-[0.65rem] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[#F5C518]/40 text-[#F5C518]">
                                    sample
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-sm shrink-0">
                                {moneyWhole(bid.finalPrice)}
                              </span>
                              {/* Quiet until the card is hovered or focused —
                                  the dashboard is for reading, and a delete-ish
                                  control on every card competes with that. */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setConfirmArchive({
                                    id: bid.id,
                                    name: bid.name,
                                  });
                                }}
                                className="shrink-0 -mr-1 -mt-0.5 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                                aria-label={`Archive ${bid.name}`}
                                title="Archive — hides it here, recoverable for 30 days"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2 mt-1.5">
                              <span
                                className={cn(
                                  "flex items-center gap-1 text-xs",
                                  URGENCY_STYLE[urgency]
                                )}
                              >
                                <CalendarDays className="w-3 h-3" />
                                {due ?? "No due date"}
                                {URGENCY_LABEL[urgency] && (
                                  <span className="font-medium">
                                    · {URGENCY_LABEL[urgency]}
                                  </span>
                                )}
                              </span>
                              <span className="ml-auto text-xs text-muted-foreground/70">
                                {bid.lineCount} line
                                {bid.lineCount === 1 ? "" : "s"}
                              </span>
                            </div>

                            {bid.trades?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {bid.trades.slice(0, 3).map(trade => (
                                  <Badge
                                    key={trade}
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {trade}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}

                    {/*
                      The rest of the column, on request.

                      The heading above already shows the real count and the
                      real value for the whole status, so nothing here is
                      hidden money — this is only how many cards get drawn.
                    */}
                    {group.bids.length > CARDS_PER_COLUMN && (
                      <button
                        onClick={() =>
                          setExpanded(prev => ({
                            ...prev,
                            [group.status]: !prev[group.status],
                          }))
                        }
                        className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                      >
                        {expanded[group.status]
                          ? "Show fewer"
                          : `Show all ${group.bids.length}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          Bids without a deadline sort to the bottom of Draft and Active, so
          real dates stay on top. Set one from the bid itself.
        </p>
      </div>

      {/* Shared with the Bids list so the two prompts cannot drift — an audit
          found one page asking and the other archiving on a single click. */}
      <ArchiveBidDialog
        pending={confirmArchive}
        onClose={() => setConfirmArchive(null)}
        onArchive={id => archiveBid.mutate({ id })}
      />
    </div>
  );
}
