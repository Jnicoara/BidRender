/**
 * UPDATES FROM BIDRIDGE — the Updates tab on Materials, Assemblies and Labor
 * rates (references/starter-offers-plan.md § 2.3–2.5; owner Q1–Q7).
 *
 * One component on every library screen, showing EVERY kind of update with
 * the screen's own kind first: run types and modifiers have no library screen
 * of their own, and an update nobody can find is an update nobody answers.
 *
 *   - "Accept all (N)" takes only rows still on BidRidge's old value (Q18),
 *     and says first how many draft bids it will re-count (Q6);
 *   - "You changed these" rows are listed apart, one Accept each;
 *   - one row per item and field, yours → BidRidge's latest; the steps
 *     between show on tap (Q4);
 *   - Ignored rows sit in a fold and can be un-ignored;
 *   - estimators and viewers see the list without the buttons (Q1).
 *
 * Every answer refreshes through `useRefreshStarterOffers`, never its own
 * invalidate (plan § 3c).
 */
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useRefreshStarterOffers } from "@/hooks/useRefreshStarterOffers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TABLE_LABEL,
  acceptAllSentence,
  acceptedSentence,
  fieldLabel,
  formatUpdateValue,
  partSentence,
  recountWarning,
  type UpdateTable,
} from "@/lib/starterUpdates";

type Read = inferRouterOutputs<AppRouter>["starterOffers"]["list"];
type Offer = Read["offers"][number];

const ORDER: UpdateTable[] = [
  "materials",
  "assemblies",
  "laborRates",
  "runTypes",
  "modifiers",
];

const pick = (o: Offer) => ({ key: o.key, latestChangeId: o.latestChangeId });

function whenText(at: Date | string): string {
  const d = new Date(at);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function StarterUpdates({ first }: { first: UpdateTable }) {
  const list = trpc.starterOffers.list.useQuery();
  const refresh = useRefreshStarterOffers();
  const [confirm, setConfirm] = useState<
    | { kind: "one"; offer: Offer }
    | { kind: "all"; offers: Offer[]; drafts: number }
    | null
  >(null);
  const [showIgnored, setShowIgnored] = useState(false);

  const onError = (err: { message: string }) => {
    toast.error(err.message);
    void refresh();
  };
  const accept = trpc.starterOffers.accept.useMutation({
    onSuccess: r => {
      toast.success(acceptedSentence(r.draftsRecounted.length));
    },
    onError,
    onSettled: () => void refresh(),
  });
  const acceptAll = trpc.starterOffers.acceptAll.useMutation({
    onSuccess: r => toast.success(`Accepted ${r.accepted}.`),
    onError,
    onSettled: () => void refresh(),
  });
  const ignore = trpc.starterOffers.ignore.useMutation({
    onError,
    onSettled: () => void refresh(),
  });
  const unignore = trpc.starterOffers.unignore.useMutation({
    onError,
    onSettled: () => void refresh(),
  });
  const busy =
    accept.isPending ||
    acceptAll.isPending ||
    ignore.isPending ||
    unignore.isPending;

  const data = list.data;
  const order = useMemo(
    () => [first, ...ORDER.filter(t => t !== first)],
    [first]
  );

  if (list.isLoading)
    return (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-12 rounded bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  if (list.error)
    return (
      <p className="text-sm text-destructive">
        Couldn't load updates from BidRidge: {list.error.message}{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void list.refetch()}
        >
          Try again
        </button>
      </p>
    );
  if (!data) return null;

  const offers = data.offers.filter(o => o.bucket === "offer");
  const own = data.offers.filter(o => o.bucket === "own-value");
  const canAnswer = data.canAnswer;

  const row = (o: Offer, mode: "offer" | "own" | "ignored") => (
    <UpdateRow
      key={o.key}
      offer={o}
      mode={mode}
      canAnswer={canAnswer}
      busy={busy}
      onAccept={() =>
        o.draftBidIds.length > 0
          ? setConfirm({ kind: "one", offer: o })
          : accept.mutate(pick(o))
      }
      onIgnore={() => ignore.mutate({ picks: [pick(o)] })}
      onUnignore={() => unignore.mutate({ picks: [pick(o)] })}
    />
  );

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-base font-semibold">Updates from BidRidge</h2>
          <p className="text-xs text-muted-foreground">
            BidRidge changed these starter items. Nothing in your library
            changes until you accept, and bids already priced keep their prices.
            {!canAnswer &&
              " Only the owner or an admin can accept or ignore them."}
          </p>
        </div>
        {canAnswer && offers.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setConfirm({
                kind: "all",
                offers,
                drafts: data.acceptAllDrafts,
              })
            }
            className="shrink-0 rounded-md bg-[#F5C518] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            Accept all ({offers.length})
          </button>
        )}
      </div>

      {data.offers.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          No updates from BidRidge. When BidRidge changes a starter item you
          use, it shows here before it changes anything of yours.
        </p>
      ) : (
        order.map(table => {
          const mine = offers.filter(o => o.table === table);
          if (mine.length === 0) return null;
          return (
            <section key={table} className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {TABLE_LABEL[table]}
              </h3>
              <ul className="rounded-md border border-border divide-y divide-border">
                {mine.map(o => row(o, "offer"))}
              </ul>
            </section>
          );
        })
      )}

      {own.length > 0 && (
        <section className="mb-4">
          <h3 className="text-sm font-semibold">
            You changed these — BidRidge has a new value
          </h3>
          <p className="text-xs text-muted-foreground mb-1">
            Each one is yours until you take BidRidge's. Accept all leaves them
            alone.
          </p>
          <ul className="rounded-md border border-border divide-y divide-border">
            {own.map(o => row(o, "own"))}
          </ul>
        </section>
      )}

      {data.ignored.length > 0 && (
        <section className="mb-4">
          <button
            type="button"
            onClick={() => setShowIgnored(s => !s)}
            aria-expanded={showIgnored}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {showIgnored ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            Ignored ({data.ignored.length})
          </button>
          {showIgnored && (
            <ul className="mt-1 rounded-md border border-border divide-y divide-border">
              {data.ignored.map(o => row(o, "ignored"))}
            </ul>
          )}
        </section>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "all" ? "Accept all updates" : "Accept update"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "all"
                ? acceptAllSentence(confirm.offers.length, confirm.drafts)
                : confirm?.kind === "one"
                  ? `${recountWarning(confirm.offer.draftBidIds.length)} Sent and locked bids never change.`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.kind === "all")
                  acceptAll.mutate({ picks: confirm.offers.map(pick) });
                else if (confirm?.kind === "one")
                  accept.mutate(pick(confirm.offer));
                setConfirm(null);
              }}
            >
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UpdateRow({
  offer: o,
  mode,
  canAnswer,
  busy,
  onAccept,
  onIgnore,
  onUnignore,
}: {
  offer: Offer;
  mode: "offer" | "own" | "ignored";
  canAnswer: boolean;
  busy: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onUnignore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const table = o.table as UpdateTable;
  const fmt = (v: unknown) =>
    formatUpdateValue(table, o.field, v, o.valueNames);
  const warning = recountWarning(o.draftBidIds.length);
  const what =
    o.kind === "field"
      ? fieldLabel(table, o.field ?? "")
      : partSentence({
          kind: o.kind as "part" | "partField" | "modifier",
          childName: o.childName,
          field: o.field,
          yours: o.yours,
          latest: o.latest,
        });
  const showValues = o.kind === "field" || o.kind === "partField";
  const steps = o.steps.length > 1;

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => steps && setOpen(s => !s)}
          aria-expanded={steps ? open : undefined}
          className={cn(
            "min-w-0 flex-1 basis-60 text-left",
            steps ? "cursor-pointer" : "cursor-default"
          )}
        >
          <span className="block text-sm">
            {o.itemName}
            <span className="text-muted-foreground"> · {what}</span>
          </span>
          {showValues && (
            <span className="block text-sm tabular-nums">
              <span className="text-muted-foreground">
                {mode === "own" ? "Yours " : "Now "}
              </span>
              {fmt(o.yours)}
              <span className="text-muted-foreground"> → BidRidge </span>
              <span className="font-semibold">{fmt(o.latest)}</span>
              {o.latestExample && (
                <span className="ml-1.5 rounded border border-border px-1 text-[10px] text-muted-foreground">
                  Example
                </span>
              )}
            </span>
          )}
          <span className="block text-[11px] text-muted-foreground">
            {whenText(o.changedAt)}
            {steps && (open ? " · hide steps" : ` · ${o.steps.length} changes`)}
          </span>
          {warning && mode !== "ignored" && (
            <span className="block text-xs text-amber-400">{warning}</span>
          )}
        </button>
        {canAnswer && (
          <div className="flex shrink-0 items-center gap-2">
            {mode === "ignored" ? (
              <button
                type="button"
                disabled={busy}
                onClick={onUnignore}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw size={12} /> Un-ignore
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onIgnore}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAccept}
                  className="rounded-md border border-[#F5C518] px-3 py-1.5 text-xs font-semibold hover:bg-[#F5C518]/10 disabled:opacity-50"
                >
                  {mode === "own" ? "Use BidRidge's" : "Accept"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {open && steps && (
        <ol className="mt-1 ml-1 space-y-0.5 text-xs text-muted-foreground tabular-nums">
          {o.steps.map(s => (
            <li key={s.changeId}>
              {whenText(s.at)}: {fmt(s.from)} → {fmt(s.to)}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
