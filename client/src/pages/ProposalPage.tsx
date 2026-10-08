/**
 * The proposal composer — a finished bid, on its way to a client.
 *
 * ── Preview on the right, controls on the left ───────────────────────────────
 * The document is the biggest thing on screen because it is the thing being
 * made. Every control is beside it and takes effect on it, so nobody has to
 * imagine what "Modern" or "hide the labor summary" will do — the standing
 * responsiveness rule (CLAUDE.md § Responsiveness) applied to a document rather
 * than a list.
 *
 * ── The numbers are the bid's, not this screen's ─────────────────────────────
 * Everything priced comes from `proposals.document`, which rolls the bid up
 * through the same engine the Bids screen uses, from the same frozen snapshots.
 * This page cannot compute a price and does not try. The internal totals panel
 * shows the estimator their own figures next to the client-facing one so the
 * two can be seen to agree before anything is sent.
 *
 * ── Printing is the export ───────────────────────────────────────────────────
 * "Save as PDF" is the browser's own print dialog, deliberately. The preview is
 * a real US-Letter page rendered by the same code that prints, so what is on
 * screen is what comes out — no second rendering path built on a PDF library
 * that would have to be kept in step with three layouts. `bp-print-area` in
 * index.css is what hides the app around it.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Printer,
  Settings2,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProposalSheet } from "@/components/proposal/ProposalSheet";
import { clientFigure } from "@shared/proposal";
import { ProposalDesignControls } from "@/components/proposal/ProposalDesignControls";
import { money } from "@/lib/money";
import { NotPricedTotal } from "@/components/NotPricedTotal";
import {
  anyNotPriced,
  laborShare,
  materialsShare,
  notPricedHeadline,
} from "@/lib/notPricedTotal";
import { NOTHING_NOT_PRICED } from "@shared/lineNotPriced";
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

/** A per-bid text field for the proposal: client, site address, opening note. */
function BidField({
  label,
  hint,
  value,
  placeholder,
  multiline,
  onSave,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft.trim() === value.trim()) return;
    onSave(draft.trim());
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1100);
  };

  const className = cn(
    "text-sm transition-colors duration-200",
    flash && "border-emerald-500 bg-emerald-500/10 text-emerald-300"
  );

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <textarea
          value={draft}
          rows={3}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
          aria-label={label}
          className={cn(
            "flex w-full rounded-md border border-input bg-transparent px-3 py-2 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none",
            className
          )}
        />
      ) : (
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(value);
              e.currentTarget.blur();
            }
          }}
          aria-label={label}
          className={cn("h-9", className)}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `${label} saved` : ""}
      </span>
    </div>
  );
}

export default function ProposalPage({
  bidId,
  onBack,
}: {
  bidId: number;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  /**
   * Which document is on screen.
   *
   * Local state, not stored: a persisted preference is one that can be left on
   * scope-only and then printed as though it were the priced proposal. Every
   * visit starts on the real document, and switching is one click.
   */
  const [mode, setMode] = useState<"full" | "scope-only">("full");
  const { data, isLoading, error } = trpc.proposals.document.useQuery(
    { bidId, mode },
    // A refusal (an incomplete bid) will refuse again; retrying only delays
    // the sentence that says why.
    { retry: false }
  );
  const [showDesign, setShowDesign] = useState(false);
  /** Screen zoom only — the printed page is always full size. */
  /*
    On a phone the page opens FITTED to the width (8.5 in is 816 CSS px), so
    the whole proposal is readable without zooming out first; the − / +
    buttons still work from there (device audit, 2026-10-01).
  */
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 0.8;
    const w = window.innerWidth;
    if (w < 768) return Math.max(0.3, (w - 24) / 816);
    // Beside the 320 px form and the 64 px app rail, an upright tablet has
    // about 390 px for the page: 80% overflowed it sideways. A laptop still
    // opens at 80% — there is room for that and more.
    return Math.min(0.8, Math.max(0.4, (w - 64 - 320 - 48) / 816));
  });

  const updateBid = trpc.bids.update.useMutation({
    onError: e => toast.error(e.message),
    onSettled: () => {
      void utils.proposals.document.invalidate({ bidId });
      void utils.bids.get.invalidate({ id: bidId });
    },
  });

  /**
   * Print just the sheet.
   *
   * The class goes on <body> rather than being a prop, because @media print
   * rules have to reach past every wrapper the app puts between the sheet and
   * the page root. Removed in a `finally` so a cancelled print cannot leave the
   * app in a state where the next Ctrl+P prints only the proposal.
   */
  const print = () => {
    document.body.classList.add("bp-printing");
    try {
      window.print();
    } finally {
      document.body.classList.remove("bp-printing");
    }
  };

  /**
   * Unpriced lines BLOCK printing a priced proposal (owner, 2026-09-29).
   *
   * Until then they did not (owner, 2026-09-26): this asked "Print anyway?"
   * and the client's copy printed a short total — $0.00 on staging's bid 2,
   * which had one line and it unpriced. Now the document shows "Price
   * pending" in place of each figure (`clientFigure`, shared/proposal.ts) and
   * Print / Save PDF / Ctrl+P say which lines to price, with no way past.
   * Scope-only prints no money and is never blocked.
   */
  const notPriced =
    mode === "full" && data ? data.notPriced : NOTHING_NOT_PRICED;
  const unpricedList = mode === "full" && data ? data.notPricedLines : [];
  const headline = notPricedHeadline(notPriced);
  const [confirmPrint, setConfirmPrint] = useState(false);
  // A bid with no lines is blocked the same way (owner, 2026-09-30): its
  // total is $0.00 and there is nothing to price, so the list is empty and
  // the dialog says to add work instead.
  const noWork = mode === "full" && !!data?.document.investment.noWork;
  const requestPrint = () => {
    if (noWork || anyNotPriced(notPriced)) setConfirmPrint(true);
    else print();
  };
  // Ctrl+P goes through the same question as the button. A ref, so the
  // listener registered once still reads this render's count and mode.
  const requestPrintRef = useRef(requestPrint);
  requestPrintRef.current = requestPrint;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        requestPrintRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /*
    The server refuses a priced proposal for a bid whose total leaves a line
    out, naming the ERR- references. Without this branch that refusal fell
    through to "Building the proposal…" and sat there forever — a refusal that
    reads as a hang. Scope-only is still offered, since it prints no money.
  */
  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onBack}>
            Back to the bid
          </Button>
          {mode === "full" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode("scope-only")}
            >
              Scope-only instead
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Building the proposal…
      </div>
    );
  }

  const {
    document: doc,
    bid,
    client,
    salesTax,
    taxNote,
    internalTotals,
    lineCount,
  } = data;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      {/* Wraps on a phone: "← Bid" and the title on the first line, the
          controls below — on one line the explanation was squeezed to a
          word per line (device audit, 2026-10-01). */}
      <div className="border-b border-border px-4 md:px-6 py-3 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2 bp-no-print">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={onBack}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Bid
        </Button>
        <div className="flex-1 min-w-0 basis-[calc(100%-6rem)] md:basis-0">
          <h1 className="text-base font-semibold truncate">
            Proposal — {bid.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "scope-only"
              ? "Scope only — no prices anywhere on this version"
              : `${lineCount} line${lineCount === 1 ? "" : "s"} · priced from the snapshot taken when each was added`}
          </p>
        </div>

        {/* Scope only / priced. Beside the zoom because it changes what the
            page IS rather than how it is dressed, and it has to be visible at
            a glance — printing the wrong one is the failure to avoid. */}
        <div className="inline-flex rounded-lg border border-border p-0.5 mr-2 bp-no-print">
          {(["full", "scope-only"] as const).map(value => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs transition-colors",
                mode === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "full" ? "Priced" : "Scope only"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 mr-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>

        <Button
          size="sm"
          variant={showDesign ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => setShowDesign(v => !v)}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Design
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs bg-[#F5C518] text-black hover:bg-[#e0b315]"
          onClick={requestPrint}
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Save PDF
        </Button>
      </div>

      {/*
        ON A PHONE: one column that scrolls as a whole — the page first, since
        reviewing it is what a phone is for here, then what goes on it, then
        the design controls if open. Side by side from md up, as before.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
        {/* ── Left: what goes on this proposal ───────────────────────────────── */}
        <aside className="md:w-80 shrink-0 border-t md:border-t-0 md:border-r border-border md:overflow-y-auto p-4 space-y-5 bp-no-print order-2 md:order-none">
          {doc.letterhead.needsSetup && (
            /*
              The same prompt as Settings, repeated here because this is where
              somebody notices — they are looking at the document with brackets
              on it. It links rather than duplicating the fields: one place to
              edit branding, and it is the company settings screen.
            */
            <div className="rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/10 p-3 text-xs text-[#F5C518] space-y-2">
              <div className="flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden />
                <div>
                  <div className="font-medium">Add your company details</div>
                  <div className="mt-0.5 text-[#F5C518]/85">
                    Still needed: {doc.letterhead.missing.join(", ")}. They show
                    as prompts on the page until you do.
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs border-[#F5C518]/40 text-[#F5C518] hover:bg-[#F5C518]/15"
                onClick={() => {
                  window.location.hash = "/settings/branding";
                }}
              >
                Open branding settings
              </Button>
            </div>
          )}

          {/*
            Tax that cannot be worked out is a composer problem, not a document
            problem. The document prints without a tax line because it cannot
            invent one; this is the only place the person about to SEND it will
            see that something is missing, so it is loud and it links to the fix.
          */}
          {salesTax?.status === "no-rate" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <div className="flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden />
                <div>
                  <div className="font-medium">
                    Sales tax is on, but this bid has no rate
                  </div>
                  <div className="mt-0.5 text-destructive/85">
                    {taxNote} This proposal will go out with no tax on it.
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs border-destructive/40 text-destructive hover:bg-destructive/15"
                onClick={() => {
                  window.location.hash = "/settings/tax";
                }}
              >
                Open tax settings
              </Button>
            </div>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">This proposal</h2>
            <BidField
              label="Client"
              value={bid.clientName ?? ""}
              placeholder={
                // With a record attached, the placeholder shows the name the
                // document is actually using rather than a generic example —
                // an empty box beside a filled document otherwise reads as a
                // field nobody has got to yet.
                client ? client.name : "e.g. Harbour Construction Group"
              }
              hint={
                client
                  ? bid.clientName
                    ? `Overrides ${client.name}, the attached client. Clear this to use the record.`
                    : `Filled from ${client.name}, the attached client. Type here only to address this one proposal differently.`
                  : undefined
              }
              onSave={clientName =>
                updateBid.mutate({ id: bidId, clientName: clientName || null })
              }
            />
            <BidField
              label="Job address"
              value={bid.siteAddress ?? ""}
              placeholder={"88 Water St\nUnit 4"}
              multiline
              onSave={siteAddress =>
                updateBid.mutate({
                  id: bidId,
                  siteAddress: siteAddress || null,
                })
              }
            />
            <BidField
              label="Opening note"
              hint="A sentence or two on what this covers. Optional."
              value={bid.proposalNote ?? ""}
              placeholder="Complete electrical rough-in and trim for the second-floor fit-out, per drawings E1–E4."
              multiline
              onSave={proposalNote =>
                updateBid.mutate({
                  id: bidId,
                  proposalNote: proposalNote || null,
                })
              }
            />
          </section>

          {/* ── The estimator's own numbers ─────────────────────────────────── */}
          <section className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Your figures
            </div>
            <p className="text-[11px] text-muted-foreground">
              Not on the document — here so you can see the client-facing total
              is the total due you approved.
            </p>
            {(
              [
                ["Materials", internalTotals.materialCost],
                ["Labor", internalTotals.laborCost],
                // At cost, so Materials + Labor + this = Direct cost, as on
                // the bid screen. Only when there is one.
                ...(internalTotals.markedUpCharges > 0
                  ? [
                      [
                        "Marked-up charges (at cost)",
                        internalTotals.markedUpCharges,
                      ],
                    ]
                  : []),
                ["Direct cost", internalTotals.directCost],
                // Between direct cost and overhead, where it is applied —
                // without it these rows would not add up to the bid price.
                // Only when there is some, as on the bid screen.
                ...(internalTotals.materialMarkup > 0
                  ? [["Material markup", internalTotals.materialMarkup]]
                  : []),
                ["Overhead", internalTotals.overheadAmount],
                ["Profit", internalTotals.profitAmount],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div
                key={label as string}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {label}
                </span>
                {/* Materials, Labor and Direct cost say what they leave out,
                    as on the bid screen — hours on Labor only, never on
                    Materials (2026-10-07). The client's copy never does. */}
                {label === "Materials" ||
                label === "Labor" ||
                label === "Direct cost" ? (
                  <NotPricedTotal
                    amount={money(value as number)}
                    notPriced={
                      label === "Materials"
                        ? materialsShare(notPriced)
                        : label === "Labor"
                          ? laborShare(notPriced)
                          : notPriced
                    }
                    className="font-mono text-xs"
                  />
                ) : (
                  <span className="font-mono text-xs">
                    {money(value as number)}
                  </span>
                )}
              </div>
            ))}
            <div className="border-t border-border my-1.5" />
            {/* The bid screen's own words for its own numbers: "Bid price"
                is the work alone, "Total due" is what the client owes, and
                the proposal's total is checked against Total due. This read
                `finalPrice` as "Bid price" until 2026-09-27 — on a bid with a
                marked-up charge, not the number the bid screen gives that
                name. */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium shrink-0 whitespace-nowrap">
                Bid price
              </span>
              <NotPricedTotal
                amount={money(internalTotals.workPrice)}
                notPriced={notPriced}
                className="font-mono text-sm"
              />
            </div>
            {internalTotals.expensesTotal > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  Additional expenses
                </span>
                <span className="font-mono text-xs">
                  {money(internalTotals.expensesTotal)}
                </span>
              </div>
            )}
            {internalTotals.salesTaxAmount > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-muted-foreground">Sales tax</span>
                <span className="font-mono text-xs">
                  {money(internalTotals.salesTaxAmount)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium shrink-0 whitespace-nowrap">
                Total due
              </span>
              <NotPricedTotal
                amount={money(internalTotals.totalDue)}
                notPriced={notPriced}
                className="font-mono text-sm text-[#F5C518]"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium shrink-0 whitespace-nowrap">
                On the proposal
              </span>
              <span className="font-mono text-sm">
                {clientFigure(doc.investment, doc.investment.total, money)}
              </span>
            </div>
          </section>
        </aside>

        {/* ── Middle: the page ───────────────────────────────────────────────── */}
        <div className="md:flex-1 shrink-0 md:shrink overflow-auto bg-neutral-800/40 p-3 md:p-6 flex justify-center items-start bp-print-area order-1 md:order-none">
          <div
            style={{
              // `zoom` rather than `transform: scale()` on purpose: a transform
              // is painted, so the sheet would still occupy its full 8.5in of
              // layout and leave a horizontal scrollbar under a page that
              // visibly fits. Zoom scales the box as well, so the pane only
              // scrolls when the page really is wider than it.
              //
              // Screen only — `bp-printing` resets it in index.css.
              zoom,
            }}
            className="bp-sheet-wrap shadow-2xl"
          >
            <ProposalSheet doc={doc} />
          </div>
        </div>

        {/* ── Right: design, on demand ───────────────────────────────────────── */}
        {showDesign && (
          <aside className="md:w-96 shrink-0 border-t md:border-t-0 md:border-l border-border md:overflow-y-auto p-4 bp-no-print order-3 md:order-none">
            <ProposalDesignControls compact />
          </aside>
        )}
      </div>

      {/* A block, not a question (owner, 2026-09-29). It said "Print
          anyway" until then, and the client got a short total. There is
          deliberately no button here that prints. */}
      <AlertDialog open={confirmPrint} onOpenChange={setConfirmPrint}>
        <AlertDialogContent className="bp-no-print">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {noWork
                ? "Add work before sending"
                : `Price ${headline.one ? "this" : "these"} before sending`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {noWork ? (
                <>
                  This bid has no lines yet, so the total would be $0.00. The
                  proposal can't be printed or saved until work is added to the
                  bid.
                </>
              ) : (
                <>
                  {headline.text}, so the total would be short. The proposal
                  can't be printed or saved until{" "}
                  {headline.one ? "it is" : "they are"} priced
                  {/*
                    Drops are priced on the PLANS screen, not the bid (owner,
                    2026-10-07): "on the bid" sent the estimator to the wrong
                    screen when drops were the only gap.
                  */}
                  {(notPriced.drops ?? 0) > 0
                    ? notPriced.lines + notPriced.parts > 0
                      ? " — lines on the bid, drops on the Plans screen (pick each count's drop material)."
                      : " on the Plans screen — pick each count's drop material."
                    : " on the bid."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!noWork && unpricedList.length > 0 && (
            <ul className="text-sm list-disc pl-5 space-y-0.5 max-h-48 overflow-y-auto">
              {unpricedList.map((item, i) => (
                <li key={i}>
                  {item.name}
                  <span className="text-muted-foreground">
                    {item.wholeLine
                      ? " — not priced"
                      : ` — ${[
                          item.parts > 0
                            ? `${item.parts} part${item.parts === 1 ? "" : "s"} not priced`
                            : "",
                          item.hoursNotSet ? "hours not set" : "",
                        ]
                          .filter(Boolean)
                          .join(", ")}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={onBack}>
              Back to the bid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
