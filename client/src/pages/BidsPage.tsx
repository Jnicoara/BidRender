/**
 * BidsPage — one bid: its line items and the settings that price them.
 *
 * A bid is line items (assemblies frozen at add time) plus the settings that
 * turn their sum into a price.
 *
 * ── Deliberately plain ───────────────────────────────────────────────────────
 * The add-assembly control is a search box and a quantity, nothing more. The
 * Quick-bid flow is the next build step and layers onto this same data, so
 * investing in takeoff-style entry UI here would be work thrown away.
 *
 * ── All math is server-side, through the shared engine ───────────────────────
 * Totals come from bids.get, which runs the snapshot inputs through
 * shared/pricing.ts. This screen formats numbers; it never computes a price.
 *
 * ── Responsiveness (CLAUDE.md § Responsiveness) ──────────────────────────────
 * Quantity edits and line removal are optimistic against the cached detail, so
 * the rollup moves as you type with no spinner. The line list is not paginated:
 * a bid of a few hundred lines renders fine, and the Quick-bid step is where
 * windowing belongs if bids ever get big enough to need it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardList,
  Lock,
  Receipt,
  FileSignature,
  FileText,
  Plus,
  Search,
  Send,
  ChevronDown,
  X,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineNumberField } from "@/components/InlineNumberField";
import { asPercent, fromPercent } from "@/lib/inlineEdit";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { DuplicateUnitPanel } from "@/components/DuplicateUnitPanel";
import { UnitLinkBadge } from "@/components/UnitLinkBadge";
import { UnitTemplateActions } from "@/components/UnitTemplateActions";
import { MaterialsListDialog } from "@/components/MaterialsListDialog";
import { useCompany } from "@/hooks/useCompany";
import { AccountingExportDialog } from "@/components/AccountingExportDialog";
import { ClientLinkField } from "@/components/ClientLinkField";
import { BidTaxControls } from "@/components/BidTaxControls";
import { BidExtrasPanel } from "@/components/BidExtrasPanel";
import { CloseoutPanel } from "@/components/CloseoutPanel";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { SampleBidNotice } from "@/components/SampleBidNotice";
import { QuantityLockPanel } from "@/components/QuantityLockPanel";
import { countUnpricedLaborLines } from "@shared/laborRatePricing";
import { canPriceByHand, missingEntryCounts } from "@shared/handPricedLines";
import {
  HandPricedLineFields,
  handPricedGap,
} from "@/components/HandPricedLineFields";
import { quantitySource } from "@shared/quantityLock";
import { describeLineMarkup } from "@shared/materialMarkup";
import { otherPercentCaption } from "@/lib/percentKind";
import { money } from "@/lib/money";

const STATUSES = ["Draft", "Active", "Won", "Lost"] as const;
type Status = (typeof STATUSES)[number];

const INHERIT = "__inherit__";

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const STATUS_STYLES: Record<Status, string> = {
  Draft: "text-muted-foreground",
  Active: "bg-[#F5C518]/15 text-[#F5C518] border-[#F5C518]/30",
  Won: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Lost: "bg-destructive/15 text-destructive border-destructive/30",
};

// ─── Due date ─────────────────────────────────────────────────────────────────

/**
 * The bid's submission deadline, following CLAUDE.md § Editing fields: commits
 * on Enter and on blur, Escape abandons back to the saved value, and a real
 * save flashes green.
 *
 * Not InlineNumberField — that one parses numbers. A date input needs no
 * select-on-focus either: the browser's picker already selects a segment when
 * it takes focus.
 */
function DueDateField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [flash, setFlash] = useState(false);
  const editing = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (editing.current) return;
    setDraft(value ?? "");
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const commit = () => {
    const saved = value ?? "";
    if (draft === saved) return; // nothing moved: no write, no flash
    onSave(draft === "" ? null : draft); // clearing the box clears the deadline
    setFlash(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(false), 1100);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Input
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          commit();
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(value ?? "");
            editing.current = false;
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Bid due date"
        className={cn(
          "h-8 w-36 text-sm transition-colors duration-200",
          flash && "border-emerald-500 bg-emerald-500/10 text-emerald-300"
        )}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {flash ? "Due date saved" : ""}
      </span>
    </span>
  );
}

// ─── Bid detail ───────────────────────────────────────────────────────────────

/**
 * One bid. This file used to export a list-or-detail switch; the list is gone.
 *
 * It was a header, a New bid button, an archive entry and `BidSearchPanel` —
 * and the Dashboard rendered all four already, so /bids was a second door into
 * a room you were standing in. /bids now redirects there (see RETIRED_PATHS in
 * @/lib/appRoutes) and this screen always has a bid.
 */
export default function BidsPage({
  bidId,
  onBack,
}: {
  bidId: number;
  onBack: () => void;
}) {
  const [assemblyQuery, setAssemblyQuery] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addUnit, setAddUnit] = useState("");
  const [materialsListOpen, setMaterialsListOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const access = useCompany();

  const utils = trpc.useUtils();
  const detailQuery = trpc.bids.get.useQuery({ id: bidId });
  const { data: assemblies = [] } = trpc.assemblies.list.useQuery();
  const { data: units = [] } = trpc.bids.units.useQuery({ bidId });
  const { data: unitStates = [] } = trpc.bids.unitStates.useQuery({ bidId });
  const { data: sheets = [] } = trpc.bidPdfs.list.useQuery({ bidId });
  const sheetCount = sheets.length;
  const markupPreview = trpc.bids.markupReapplyPreview.useQuery({ bidId });

  /**
   * Link state for a unit header. Looked up rather than joined onto the line
   * groups because a unit's role depends on the OTHER units pointing at it,
   * which the per-line data has no way to know.
   */
  const unitStateFor = useCallback(
    (label: string) => unitStates.find(s => s.label === label),
    [unitStates]
  );

  const refresh = useCallback(() => {
    void utils.bids.get.invalidate({ id: bidId });
    void utils.bids.units.invalidate({ bidId });
    // Pushing, forking and archiving all change roles rather than lines, so a
    // refresh that skipped this would leave stale badges beside fresh totals.
    void utils.bids.unitStates.invalidate({ bidId });
    // The lock panel is drawn from its own query, so it goes stale on anything
    // that adds or removes a line that follows the plans — "7 lines follow your
    // plans" has to be the number that will actually freeze. CLAUDE.md § "A test
    // that calls the server cannot see a screen showing yesterday's answer":
    // added to the helper every mutation already invalidates through, not to the
    // one mutation this was noticed on.
    void utils.bids.quantityLock.invalidate({ bidId });
    // What "Re-apply markup rules" would change depends on the lines, the
    // bid's status and its lock — all of which the mutations here move. Added
    // to this helper for the reason the lock query above was: a count of lines
    // that has stopped being true, stated in the confident voice of a fresh one.
    void utils.bids.markupReapplyPreview.invalidate({ bidId });
    void utils.bids.list.invalidate();
  }, [utils, bidId]);

  const reapplyMarkup = trpc.bids.reapplyMarkupRules.useMutation({
    onSuccess: ({ changed }) =>
      toast.success(
        `Markup rules re-applied — ${changed} line${changed === 1 ? "" : "s"} updated.`
      ),
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  const addAssembly = trpc.bids.addAssembly.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  const updateLine = trpc.bids.updateLine.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      // Only the qty is worth predicting — the rollup follows from the refetch.
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            lines: old.lines.map(line =>
              line.id === vars.id && vars.qty !== undefined
                ? { ...line, qty: String(vars.qty) }
                : line
            ),
          }
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSettled: refresh,
  });

  const removeLine = trpc.bids.removeLine.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
      utils.bids.get.setData(
        { id: bidId },
        old =>
          old && {
            ...old,
            lines: old.lines.filter(line => line.id !== vars.id),
          }
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous)
        utils.bids.get.setData({ id: bidId }, context.previous);
      toast.error(error.message);
    },
    onSettled: refresh,
  });

  const updateBid = trpc.bids.update.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  const assemblyResults = useMemo(() => {
    const q = assemblyQuery.trim().toLowerCase();
    if (!q) return [];
    return assemblies.filter(a => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [assemblies, assemblyQuery]);

  /**
   * Highlighted result, so the search box can be driven from the keyboard.
   *
   * Reset whenever the query changes — otherwise the highlight stays on row 4
   * after a narrower search has left three results, and Enter adds nothing.
   */
  const [assemblyHighlight, setAssemblyHighlight] = useState(0);

  /**
   * Add the highlighted assembly, or complain about the quantity.
   *
   * Lifted out of the result button's onClick so the mouse and the keyboard
   * take the SAME path. Two copies of "add a line" is how one of them ends up
   * quietly skipping the quantity check.
   */
  const addHighlighted = useCallback(
    (assemblyId: number) => {
      const qty = Number(addQty);
      if (!(qty > 0)) {
        toast.error("Enter a quantity greater than zero.");
        return;
      }
      addAssembly.mutate({
        bidId,
        assemblyId,
        qty,
        unitLabel: addUnit.trim() || null,
      });
      setAssemblyQuery("");
      setAssemblyHighlight(0);
    },
    [addAssembly, addQty, addUnit, bidId]
  );

  /**
   * Type, arrow, Enter — the same loop Quick bid's counting box has always had.
   *
   * This screen had the identical task and no keyboard path at all: every line
   * meant a mouse trip to a result that was already on screen. A contractor who
   * learns the flow in Quick bid found it dead here, which is the kind of
   * inconsistency that reads as the app being broken rather than different.
   */
  const onAssemblyKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (assemblyResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAssemblyHighlight(h => Math.min(h + 1, assemblyResults.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAssemblyHighlight(h => Math.max(h - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = assemblyResults[assemblyHighlight];
      if (chosen) addHighlighted(chosen.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setAssemblyQuery("");
    }
  };

  /**
   * A bid that cannot be loaded says so, rather than saying "Loading…" forever.
   *
   * This branch used to be a single `!detailQuery.data`, which is true both
   * while the query is in flight AND after it has failed — so a deleted bid, or
   * an id typed wrong in the address bar, sat on a loading message that would
   * never resolve. It matters more now than it did: /bids/:id is the only way
   * into a bid since the list was folded into the Dashboard, so there is no
   * surrounding screen left to notice you are stuck on.
   */
  if (detailQuery.isError) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          That bid could not be opened — it may have been archived or deleted.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={onBack}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to the dashboard
        </Button>
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center text-sm text-muted-foreground">
        Loading bid…
      </div>
    );
  }

  const {
    bid,
    lines,
    totals,
    settings,
    company,
    client,
    salesTax,
    taxRate,
    taxNote,
    fromPlans,
  } = detailQuery.data;

  /**
   * Lines whose hours are being priced at nothing, because the assembly they
   * came from had no labor rate attached. See shared/laborRatePricing.ts.
   */
  const unpricedLaborLines = countUnpricedLaborLines(lines);

  /**
   * Hand-priced lines with a price or hours nobody has typed yet — a free count
   * sent from the plans arrives this way. Blank, not zero: see
   * shared/handPricedLines.ts. Read from the lines themselves so a typed price
   * clears its entry the moment the optimistic update lands.
   */
  const missingEntry = missingEntryCounts(lines);

  /**
   * Which pricing settings this bid has taken off the company default.
   *
   * Read from the SOURCE the server resolved rather than from the bid's own
   * columns, so the summary agrees with the badges inside the panel and with
   * what the bid is actually priced at. Naming them matters: "overridden on
   * this bid" without saying which one sends the estimator opening the panel
   * to find out, which is the click the summary exists to save.
   */
  const overriddenHere = [
    settings.overheadSource === "bid" ? "overhead" : null,
    settings.profitSource === "bid" ? "profit" : null,
    settings.productivitySource === "bid" ? "productivity" : null,
  ].filter((label): label is string => label !== null);

  /** Whether any line carries material markup — see the note on each line. */
  const showMarkupNotes = lines.some(l => l.breakdown.materialMarkupPct > 0);

  /**
   * "Re-apply markup rules", offered only when it would change something, and
   * only on a bid that may move — the server decides both and refuses the
   * mutation on anything else (shared/materialMarkup.ts, markupReapplyRefusal).
   */
  const reapplyChanges = markupPreview.data?.allowed
    ? markupPreview.data.changes
    : [];

  /** Lines grouped by unit, with un-labelled lines last under a null key. */
  const groups: Array<{ label: string | null; lines: typeof lines }> = [];
  for (const line of lines) {
    const key = line.unitLabel ?? null;
    const existing = groups.find(g => g.label === key);
    if (existing) existing.lines.push(line);
    else groups.push({ label: key, lines: [line] });
  }
  groups.sort((a, b) => (a.label === null ? 1 : b.label === null ? -1 : 0));

  return (
    <div className="flex flex-col h-full bg-background">
      <MaterialsListDialog
        bidId={bidId}
        open={materialsListOpen}
        onOpenChange={setMaterialsListOpen}
      />
      <AccountingExportDialog
        bidId={bidId}
        open={accountingOpen}
        onOpenChange={setAccountingOpen}
      />
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate flex items-center gap-2">
              <span className="truncate">{bid.name}</span>
              {bid.isSample && (
                <span className="shrink-0 text-[0.65rem] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[#F5C518]/40 text-[#F5C518] font-normal">
                  sample
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"}
              {bid.trades?.length ? ` · ${bid.trades.join(", ")}` : ""}
            </p>
          </div>
          {/* Plans live on their own screen (the takeoff surface). The count
              sits on the button so an estimator can see whether this job has
              drawings attached without opening anything. */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => {
              window.location.hash = `/bids/${bid.id}/plans`;
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Plans
            {sheetCount > 0 && (
              <span className="text-muted-foreground">{sheetCount}</span>
            )}
          </Button>

          {/* Beside Plans because they are the two ways of putting quantities
              on this bid — off a drawing, or off a count in someone's head.
              Quick bid used to be a top-level nav item that opened a chooser
              asking which bid you meant; from here the bid is already known. */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => {
              window.location.hash = `/bids/${bid.id}/count`;
            }}
            title="Count — add assemblies by typing, without a plan"
          >
            <Zap className="w-3.5 h-3.5" />
            Count
          </Button>

          {/*
            ── The three ways this bid leaves the app ─────────────────────────
            They were three separate outline buttons beside Plans and Count,
            which made five in a row and wrapped the header at laptop width.
            Plans and Count stay out here because they are places you GO and
            work; these three are one idea in three costumes, and they differ
            only in who receives the document and therefore in what it is
            allowed to carry.

            So the menu is labelled by AUDIENCE, which is the thing an estimator
            is actually choosing between — not by format, and not by the name of
            the screen it opens.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Send
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Its own screen rather than a dialog, because it is a full page
                  being composed and it has to be printable. */}
              <DropdownMenuItem
                onSelect={() => {
                  window.location.hash = `/bids/${bid.id}/proposal`;
                }}
              >
                <FileSignature className="w-3.5 h-3.5" />
                <span className="flex-1">
                  Proposal
                  <span className="block text-xs text-muted-foreground">
                    For the client
                  </span>
                </span>
              </DropdownMenuItem>

              {/* Goes the other way — out to a supplier rather than to the
                  customer. Available from the first line, not just a finished
                  bid: a supplier quote is how a contractor finds out what
                  things cost. A dialog, because it is read, exported, closed. */}
              <DropdownMenuItem onSelect={() => setMaterialsListOpen(true)}>
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="flex-1">
                  Materials list
                  <span className="block text-xs text-muted-foreground">
                    For the supplier — quantities, no prices
                  </span>
                </span>
              </DropdownMenuItem>

              {/* Hidden rather than disabled when the feature is not available
                  to this account: the server returns NOT_FOUND, so a visible
                  entry would announce an unreleased feature and then fail on
                  click. Hiding is the UI agreeing with the server. */}
              {access.hasFeature("accounting.quickbooks") && (
                <DropdownMenuItem onSelect={() => setAccountingOpen(true)}>
                  <Receipt className="w-3.5 h-3.5" />
                  <span className="flex-1">
                    Accounting export
                    <span className="block text-xs text-muted-foreground">
                      For the bookkeeper — QuickBooks CSV
                    </span>
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DueDateField
            value={bid.dueDate}
            onSave={dueDate => updateBid.mutate({ id: bid.id, dueDate })}
          />

          <Select
            value={bid.status}
            onValueChange={status =>
              updateBid.mutate({ id: bid.id, status: status as Status })
            }
          >
            <SelectTrigger className="h-8 w-28 text-sm" aria-label="Bid status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {bid.isSample && <SampleBidNotice bidId={bid.id} />}
        {/* Above everything, full width: it changes what every quantity below
            it MEANS, so it cannot sit in a column somebody scrolls past. */}
        <QuantityLockPanel bidId={bidId} />
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4 min-w-0">
            {/* Add an assembly — deliberately minimal */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Add an assembly
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[14rem]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={assemblyQuery}
                    onChange={e => {
                      setAssemblyQuery(e.target.value);
                      setAssemblyHighlight(0);
                    }}
                    onKeyDown={onAssemblyKeyDown}
                    placeholder="Search the assembly library — type, then Enter"
                    className="h-8 pl-9 text-sm"
                    aria-label="Search assemblies to add"
                  />
                </div>
                <Input
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  className="h-8 w-16 text-sm text-right"
                  inputMode="decimal"
                  onFocus={selectOnFocus}
                  aria-label="Quantity"
                />
                <Input
                  value={addUnit}
                  onChange={e => setAddUnit(e.target.value)}
                  className="h-8 w-32 text-sm"
                  placeholder="Unit (optional)"
                  aria-label="Unit label"
                />
              </div>

              {assemblyResults.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  {assemblyResults.map((assembly, index) => (
                    <button
                      key={assembly.id}
                      onMouseEnter={() => setAssemblyHighlight(index)}
                      onClick={() => addHighlighted(assembly.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-border last:border-0",
                        index === assemblyHighlight
                          ? "bg-[#F5C518]/10 text-foreground"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{assembly.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {assembly.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Adding freezes that assembly’s costs onto the bid. Later library
                edits will not change what is already here.
              </p>
            </div>

            <DuplicateUnitPanel bidId={bidId} units={units} onDone={refresh} />

            {/* Line items */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Line item</span>
                <span className="w-16 text-right shrink-0">Qty</span>
                <span className="w-24 text-right shrink-0">Hours</span>
                <span className="w-24 text-right shrink-0">Cost</span>
                <span className="w-8 shrink-0" />
              </div>

              {lines.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No line items yet. Search the assembly library above to add
                  the first one.
                </div>
              ) : (
                groups.map(group => (
                  <div key={group.label ?? "__loose__"}>
                    {group.label && (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/40 border-b border-border">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </span>
                        {unitStateFor(group.label) && (
                          <>
                            <UnitLinkBadge state={unitStateFor(group.label)!} />
                            <UnitTemplateActions
                              bidId={bidId}
                              state={unitStateFor(group.label)!}
                              onDone={refresh}
                            />
                          </>
                        )}
                        <span className="text-xs text-muted-foreground/70 ml-auto font-mono">
                          {money(
                            group.lines.reduce(
                              (sum, l) => sum + l.breakdown.directCost,
                              0
                            )
                          )}
                        </span>
                      </div>
                    )}
                    {group.lines.map(line => {
                      /*
                        Where this line's quantity comes from, asked ONCE.

                        "typed" is a hand-added line, "drawing" follows the
                        plans, "locked" is frozen. Both the note under the name
                        and the quantity itself read it, and they must never
                        disagree — a row saying "counts your marks" beside a
                        number that has stopped counting them is exactly the
                        confidently-wrong screen this feature is against. The
                        decision is @shared/quantityLock, which the server reads
                        too.
                      */
                      const source = quantitySource(
                        line,
                        bid.quantitiesLockedAt
                      );
                      return (
                        <div
                          key={line.id}
                          className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate">
                              {line.name}
                            </span>
                            {/*
                            Where this line came from, and whether it is still
                            listening.

                            GREY, not yellow, in all three states. Yellow is
                            spent twice already — conduit runs on the drawing,
                            and every warning in the app — and none of these is
                            a warning: a following line and a frozen one are
                            both a line behaving exactly as intended, saying so.

                            Traced footage says so too, which it did not until
                            the lock landed. It follows the drawing just as a
                            count does, so a row with no note at all was the one
                            place on this screen where a live number looked like
                            a typed one.

                            The LOCK marker says "frozen from your plans" rather
                            than just "locked", because the estimator has two
                            freezes to keep apart and only one of them is this:
                            prices froze per line at add time (R4) and are not
                            what this is about.
                          */}
                            {source !== "typed" ? (
                              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                {source === "locked" ? (
                                  <>
                                    <Lock className="w-3 h-3 shrink-0" />
                                    Locked — frozen from your plans
                                  </>
                                ) : line.takeoffGroupId !== null ? (
                                  "From plans — counts your marks"
                                ) : (
                                  "From plans — follows what you traced"
                                )}
                              </div>
                            ) : null}
                            {/*
                              Where this line's MATERIAL MARKUP came from — "35%
                              markup from Wire & Cable category · +$12.97".

                              Shown on every line once the bid carries markup
                              anywhere, including the lines at 0%, because then
                              the contrast is the information: an estimator
                              reading down the list needs to see which lines
                              were NOT marked up as much as which were. On a bid
                              with no markup at all it would be one grey
                              sentence saying nothing on every line, forever.
                            */}
                            {showMarkupNotes ? (
                              <div className="text-xs text-muted-foreground truncate">
                                {describeLineMarkup(line)}
                                {line.breakdown.materialMarkup > 0
                                  ? ` · +${money(line.breakdown.materialMarkup)}`
                                  : ""}
                              </div>
                            ) : null}
                            {line.snapshotModifierNames?.length ? (
                              <div className="text-xs text-muted-foreground truncate">
                                {line.snapshotModifierNames.join(", ")} · frozen{" "}
                                {new Date(line.snapshotAt).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                  }
                                )}
                              </div>
                            ) : null}
                            {/*
                              A line priced BY HAND carries its own price and
                              hours fields — a free count sent from the plans,
                              or any line with no library source. What is blank
                              is said in amber on the line itself as well as on
                              the strip, because the strip says HOW MANY and
                              only the line can say WHICH.
                            */}
                            {canPriceByHand(line) ? (
                              <>
                                {handPricedGap(line) ? (
                                  <div className="text-xs text-[#F5C518]">
                                    {handPricedGap(line)}
                                  </div>
                                ) : null}
                                <HandPricedLineFields
                                  bidId={bidId}
                                  line={line}
                                  onChanged={refresh}
                                />
                              </>
                            ) : null}
                          </div>
                          {/*
                          A from-plans line's quantity is not typeable, because
                          it is not a number anybody typed — it is how many
                          marks are on the drawing, or how far the runs go.
                          D2(a): changed by marking, not by typing, one source of
                          truth.

                          It reads as a plain number rather than a disabled
                          field: a control that looks editable and refuses is
                          worse than one that never invited the click.

                          ── A LOCKED line is not typeable either ─────────────
                          The column now holds the drawing's answer, and a typed
                          number over the top of it would be lost the moment
                          somebody unlocks — an edit accepted and then dropped,
                          which is worse than one refused. The tooltip says
                          which of the two situations this is;
                          `bidsRouter.updateLine` refuses with the same
                          sentence, from the same module.
                        */}
                          {source !== "typed" ? (
                            <span
                              className="font-mono text-sm w-16 text-center shrink-0 tabular-nums"
                              title={
                                source === "locked"
                                  ? "Frozen when you locked this bid's quantities. Unlock it to follow your plans again."
                                  : line.takeoffGroupId !== null
                                    ? "Counted from the marks on your plans. Change it on the Plans screen."
                                    : "Measured from the runs you traced. Change it on the Plans screen."
                              }
                            >
                              {Number(line.qty)}
                            </span>
                          ) : (
                            <InlineNumberField
                              value={Number(line.qty)}
                              onSave={qty =>
                                updateLine.mutate({ bidId, id: line.id, qty })
                              }
                              rules={{ min: 0, max: 999999 }}
                              className="h-7 w-16 text-sm"
                              ariaLabel={`Quantity of ${line.name}`}
                            />
                          )}
                          <span className="font-mono text-xs w-24 text-right shrink-0 text-muted-foreground">
                            {round(line.breakdown.totalLaborHours, 2)} h
                          </span>
                          <span className="font-mono text-sm w-24 text-right shrink-0">
                            {money(line.breakdown.directCost)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              removeLine.mutate({ bidId, id: line.id })
                            }
                            aria-label={`Remove ${line.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rollup */}
          <div className="lg:sticky lg:top-0 h-fit space-y-4">
            {/* Who the work is for. Above the total because it is part of what
                the bid IS rather than part of what it costs, and because the
                proposal reads it. Entirely optional — see ClientLinkField. */}
            <div className="rounded-xl border border-border bg-card p-4">
              <ClientLinkField
                bid={{
                  id: bid.id,
                  clientId: bid.clientId,
                  clientName: bid.clientName,
                  siteAddress: bid.siteAddress,
                }}
                client={client}
                onLink={clientId => updateBid.mutate({ id: bid.id, clientId })}
              />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Bid total
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-xs text-muted-foreground">Materials</span>
                <span className="font-mono text-sm">
                  {money(totals.materialCost)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-xs text-muted-foreground">
                  Labor ({round(totals.totalLaborHours, 2)} h)
                </span>
                <span className="font-mono text-sm">
                  {money(totals.laborCost)}
                </span>
              </div>

              {/*
                Lines with a price or hours NOBODY HAS TYPED — a free count sent
                from the plans arrives this way.

                Blank, not zero (shared/handPricedLines.ts). Each blank totals
                as $0 above, which is the money convention, and this is where it
                shouts: fourteen fixtures at nothing would otherwise total, tax
                and print with nothing on the screen looking unfinished. A typed
                0 is an answer and is never listed here.

                Two entries rather than one, because they are missing from two
                different numbers above and want two different things typed.
              */}
              {missingEntry.noPrice > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {missingEntry.noPrice} line
                      {missingEntry.noPrice === 1 ? " has" : "s have"} no price
                    </span>{" "}
                    — {missingEntry.noPrice === 1 ? "it is" : "they are"} in the
                    Materials total above at $0. Type a price on the line (0 is
                    fine if it really costs nothing).
                  </p>
                </div>
              )}

              {missingEntry.noHours > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {missingEntry.noHours} line
                      {missingEntry.noHours === 1 ? " has" : "s have"} no labor
                      hours
                    </span>{" "}
                    — no labor for {missingEntry.noHours === 1 ? "it" : "them"}{" "}
                    is in the total above. Type hours on the line (0 if someone
                    else installs it).
                  </p>
                </div>
              )}

              {/*
                Hours that are being priced at nothing.

                Sits directly under the labor line because that is the number it
                contradicts: a bid can show real hours and no labor cost when an
                assembly was added with no role attached, and every other part
                of the screen looks finished. The $0 convention flags an
                unpriced material and an unpriced rate; this is the same $0
                arriving by a route neither of those screens can see.
              */}
              {unpricedLaborLines > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {unpricedLaborLines} line
                      {unpricedLaborLines === 1 ? "" : "s"}{" "}
                      {unpricedLaborLines === 1 ? "has" : "have"} hours but no
                      labor rate
                    </span>{" "}
                    — their hours are in the total above and their labor is
                    priced at $0. On a line priced by hand, pick who does the
                    hours beside them. On an assembly line, give the assembly a
                    role in the Library, then re-add the line to pick the rate
                    up.
                  </p>
                </div>
              )}

              {/*
                What the takeoff says that this total does not.

                Same strip, same rule as the labor entry above it: each one sits
                directly under the number it contradicts. All three are counts
                of things on the Plans screen that have not become money here,
                which is exactly the relationship the material total has with
                them — and none of them appears on the drawing itself.
              */}
              {fromPlans.waitingToSend > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {fromPlans.waitingToSend} count
                      {fromPlans.waitingToSend === 1 ? " is" : "s are"} not on
                      this bid yet
                    </span>{" "}
                    — they are marked on your plans, and none of them is in the
                    total above. Send them from the Plans screen.
                  </p>
                </div>
              )}

              {fromPlans.countedWithNoPrice > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {fromPlans.countedWithNoPrice} count
                      {fromPlans.countedWithNoPrice === 1
                        ? " has"
                        : "s have"}{" "}
                      no price
                    </span>{" "}
                    — they were counted against an assembly that is no longer in
                    your library, so there is nothing to price them from. Count
                    them again on the Plans screen, from the library or as a
                    free count.
                  </p>
                </div>
              )}

              {fromPlans.doubleCounted.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-2.5 py-2 my-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F5C518] shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {fromPlans.doubleCounted.join(", ")}{" "}
                      {fromPlans.doubleCounted.length === 1 ? "is" : "are"} on
                      this bid twice
                    </span>{" "}
                    — once counted from the plans and once added by hand. Both
                    lines are in the total above. Check the two and remove
                    whichever is the duplicate.
                  </p>
                </div>
              )}

              {/*
                The productivity step, shown only when it is doing something.
                At 0% there is nothing to explain and a row saying so would be
                noise on every bid forever.

                It shows the arithmetic rather than the result: the hours an
                estimator would recognise from their assemblies, the adjustment,
                and what it came to. Without this the total silently disagrees
                with the hours on the recipes and the only way to find out why
                is to go looking in Settings.
              */}
              {settings.productivityPct !== 0 && (
                <div className="flex items-baseline justify-between gap-3 pl-3 pb-1">
                  <span className="text-[11px] text-muted-foreground/80">
                    {round(totals.laborHoursBeforeProductivity, 2)} h after
                    modifiers, {settings.productivityPct > 0 ? "+" : ""}
                    {round(settings.productivityPct * 100, 2)}% productivity
                  </span>
                  <span
                    className="font-mono text-[11px] text-muted-foreground/80"
                    title={
                      settings.productivitySource === "bid"
                        ? "Set on this bid"
                        : "Your company default"
                    }
                  >
                    {settings.productivitySource === "bid"
                      ? "this bid"
                      : "company"}
                  </span>
                </div>
              )}
              <div className="border-t border-border my-2" />
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-xs font-medium">Direct cost</span>
                <span className="font-mono text-sm">
                  {money(totals.directCost)}
                </span>
              </div>
              {/*
                MATERIAL MARKUP, as its own step between direct cost and
                overhead — which is where it is applied (D1): overhead and
                profit below are added on top of it. Only when there is some;
                a $0.00 row on every bid would be noise.
              */}
              {totals.materialMarkup > 0 && (
                <div className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-xs text-muted-foreground">
                    Material markup
                  </span>
                  <span className="font-mono text-sm">
                    {money(totals.materialMarkup)}
                  </span>
                </div>
              )}
              {/*
                The offer to re-apply, beside the number it would move. Only
                when the server says the bid may move AND something would; the
                sentence names how many lines, measured, not "may change".
              */}
              {reapplyChanges.length > 0 && (
                // Stacked, not side by side: this rail is narrow, and beside a
                // button the sentence wrapped to a word or two a line.
                <div className="flex flex-col items-start gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 my-1">
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="text-foreground font-medium">
                      Your markup rules have changed since{" "}
                      {reapplyChanges.length} line
                      {reapplyChanges.length === 1 ? " was" : "s were"} added
                    </span>{" "}
                    —{" "}
                    {reapplyChanges.length === 1
                      ? "it keeps the markup it was added with"
                      : "they keep the markup they were added with"}{" "}
                    until you re-apply.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    disabled={reapplyMarkup.isPending}
                    onClick={() => reapplyMarkup.mutate({ bidId })}
                  >
                    Re-apply markup rules
                  </Button>
                </div>
              )}
              {settings.overhead.enabled && (
                <div className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-xs text-muted-foreground">
                    Overhead
                  </span>
                  <span className="font-mono text-sm">
                    {money(totals.overheadAmount)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3 py-1">
                {/* Both numbers, always — "15% markup = 13% margin". A bare
                    "Markup 15%" is the sentence Part 4 says gets misread. */}
                <span className="text-xs text-muted-foreground">
                  Profit {round(settings.profit.value * 100, 2)}%{" "}
                  {settings.profit.method}{" "}
                  {otherPercentCaption(
                    settings.profit.method,
                    String(settings.profit.value * 100)
                  )}
                </span>
                <span className="font-mono text-sm">
                  {money(totals.profitAmount)}
                </span>
              </div>
              <div className="border-t border-border my-2" />
              <div className="flex items-baseline justify-between gap-3 py-1">
                <span className="text-sm font-medium">Bid price</span>
                <span className="font-mono text-base text-[#F5C518]">
                  {/* The work alone. A marked-up charge is inside finalPrice
                      but is billed on its own line below, so showing
                      finalPrice here would count it twice. */}
                  {money(totals.workPrice)}
                </span>
              </div>

              {totals.expensesTotal > 0 && (
                <div className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-xs text-muted-foreground">
                    Additional expenses
                  </span>
                  <span className="font-mono text-sm">
                    {money(totals.expensesTotal)}
                  </span>
                </div>
              )}

              {/* With tax switched off, the tax block below never renders — so
                  a bid carrying expenses would show a Bid price and a charge
                  with nothing tying them together. This is that total. */}
              {totals.expensesTotal > 0 && salesTax.status === "disabled" && (
                <div className="flex items-baseline justify-between gap-3 py-1">
                  <span className="text-sm font-medium">Total due</span>
                  <span className="font-mono text-base text-[#F5C518]">
                    {money(totals.totalDue)}
                  </span>
                </div>
              )}

              {/*
                Sales tax, BELOW the bid price and never inside it.

                A tax line folded into the total is one the estimator cannot
                check against the rate they believe applies — and the reason
                there is no tax is as important as the amount when there is,
                which is why `taxNote` gets a line of its own rather than
                leaving an unexplained absence.
              */}
              {salesTax.status !== "disabled" && (
                <>
                  <div className="border-t border-border my-2" />
                  <div className="flex items-baseline justify-between gap-3 py-1">
                    <span className="text-xs text-muted-foreground">
                      Sales tax
                      {salesTax.status === "ok" && salesTax.ratePct !== null
                        ? ` (${salesTax.ratePct}%)`
                        : ""}
                      {salesTax.status === "exempt" ? " — exempt" : ""}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm",
                        salesTax.status === "no-rate" && "text-destructive"
                      )}
                    >
                      {salesTax.status === "no-rate"
                        ? "not set"
                        : money(salesTax.amount)}
                    </span>
                  </div>

                  {taxNote && (
                    <p
                      className={cn(
                        "text-xs",
                        salesTax.status === "no-rate"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {taxNote}
                    </p>
                  )}

                  {/* Where the rate came from — a tax figure nobody can trace
                      is a tax figure nobody can defend in an audit. */}
                  {salesTax.status === "ok" && taxRate.source !== "none" && (
                    <p className="text-xs text-muted-foreground">
                      {taxRate.source === "bid-override"
                        ? "Rate entered on this bid."
                        : taxRate.source === "bid-jurisdiction"
                          ? `${taxRate.jurisdictionName} — chosen on this bid.`
                          : `${taxRate.jurisdictionName} — matched on ${taxRate.matchedOn.join(", ")}.`}
                    </p>
                  )}

                  {salesTax.status !== "no-rate" && (
                    <div className="flex items-baseline justify-between gap-3 py-1">
                      <span className="text-sm font-medium">Total due</span>
                      <span className="font-mono text-base text-[#F5C518]">
                        {money(totals.totalDue)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* After the bid is built, not before: closing out is something
                that happens when the job is finished, and it sits shut until
                somebody opens it. */}
            <CloseoutPanel bidId={bid.id} />

            <BidExtrasPanel bidId={bid.id} />

            {salesTax.status !== "disabled" && (
              <BidTaxControls
                bidId={bid.id}
                exempt={bid.taxExempt}
                exemptReason={bid.taxExemptReason}
                jurisdictionId={bid.taxJurisdictionId}
                rateOverridePct={
                  bid.taxRateOverridePct === null
                    ? null
                    : Number(bid.taxRateOverridePct)
                }
                onChange={patch => updateBid.mutate({ id: bid.id, ...patch })}
              />
            )}

            {/* Settings, with their source stated. Shut by default: three
                inherit-or-override selects open on every bid implies choices
                that are expected, when most bids follow the company defaults
                and never touch these. The summary says which case you are in,
                so a shut panel still answers the only question worth asking
                from outside it. */}
            <CollapsiblePanel
              id="bid-pricing"
              title="Pricing settings"
              summary={
                overriddenHere.length > 0
                  ? `Overridden on this bid — ${overriddenHere.join(", ")}`
                  : "Following your company defaults"
              }
              badge={
                overriddenHere.length > 0 ? (
                  <Badge variant="outline" className="text-[10px]">
                    this bid
                  </Badge>
                ) : undefined
              }
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Overhead
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {settings.overheadSource === "bid"
                      ? "This bid"
                      : "Company default"}
                  </Badge>
                </div>
                <Select
                  value={
                    bid.overheadEnabled === null
                      ? INHERIT
                      : bid.overheadEnabled
                        ? "on"
                        : "off"
                  }
                  onValueChange={value =>
                    updateBid.mutate({
                      id: bid.id,
                      overheadEnabled:
                        value === INHERIT ? null : value === "on",
                      ...(value === "on" && bid.overheadValue === null
                        ? {
                            overheadMode: company.overheadMode,
                            overheadValue: company.overheadValue,
                          }
                        : {}),
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    aria-label="Overhead setting"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      Use company default (
                      {company.overheadEnabled ? "on" : "off"})
                    </SelectItem>
                    <SelectItem value="on">On for this bid</SelectItem>
                    <SelectItem value="off">Off for this bid</SelectItem>
                  </SelectContent>
                </Select>
                {bid.overheadEnabled === true && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={bid.overheadMode ?? "percentage"}
                      onValueChange={mode =>
                        updateBid.mutate({
                          id: bid.id,
                          overheadMode: mode as "percentage" | "flat",
                        })
                      }
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="flat">Flat $</SelectItem>
                      </SelectContent>
                    </Select>
                    {/*
                      The fifth of this family, and the one that hid: the
                      fallback sat inside a ternary, so an audit that looked
                      for `?? 0` beside a `value` prop walked straight past it.

                      Overhead is switched on for this bid here, and the value
                      is seeded from the company at that moment — but if it
                      ever were not, "0%" would read as a decision rather than
                      as a blank.
                    */}
                    <InlineNumberField
                      value={
                        bid.overheadValue === null
                          ? null
                          : bid.overheadMode === "flat"
                            ? Number(bid.overheadValue)
                            : asPercent(Number(bid.overheadValue))
                      }
                      whenUnset={{ placeholder: "company default" }}
                      onSave={raw =>
                        updateBid.mutate({
                          id: bid.id,
                          overheadValue:
                            bid.overheadMode === "flat"
                              ? raw
                              : fromPercent(raw),
                        })
                      }
                      rules={{ min: 0 }}
                      className="h-7 w-20 text-xs"
                      ariaLabel="Overhead value"
                      suffix={
                        bid.overheadMode === "flat" ? undefined : "% of cost"
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Profit</span>
                  <Badge variant="outline" className="text-xs">
                    {settings.profitSource === "bid"
                      ? "This bid"
                      : "Company default"}
                  </Badge>
                </div>
                <Select
                  value={bid.profitMethod ?? INHERIT}
                  onValueChange={value =>
                    updateBid.mutate({
                      id: bid.id,
                      profitMethod:
                        value === INHERIT
                          ? null
                          : (value as "markup" | "margin"),
                      profitValue:
                        value === INHERIT ? null : company.profitValue,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    aria-label="Profit method"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      Use company default ({company.profitMethod})
                    </SelectItem>
                    <SelectItem value="markup">
                      Markup % for this bid
                    </SelectItem>
                    <SelectItem value="margin">
                      Target margin % for this bid
                    </SelectItem>
                  </SelectContent>
                </Select>
                {bid.profitMethod && (
                  /*
                    NULL here means "follow the company default", never zero.

                    It was `?? 0`, which was safe only because this field is
                    gated on `profitMethod` — a claim about a sibling
                    expression, and one refactor away from printing "0% profit"
                    on a bid that is inheriting 15%. Now the fallback says what
                    it means and cannot lie about money.
                  */
                  <InlineNumberField
                    value={
                      bid.profitValue === null
                        ? null
                        : asPercent(Number(bid.profitValue))
                    }
                    whenUnset={{ placeholder: "company default" }}
                    onSave={raw =>
                      updateBid.mutate({
                        id: bid.id,
                        profitValue: fromPercent(raw),
                      })
                    }
                    // Below 99%: at 100% the target-margin formula divides by zero.
                    rules={{ min: 0, max: 98.99 }}
                    className="h-7 w-32 text-xs"
                    ariaLabel="Profit value"
                    percentKind={bid.profitMethod}
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Markup and target margin are different numbers on the same
                  cost — the method is always an explicit choice.
                </p>
              </div>

              {/*
                ── Productivity, for THIS bid ────────────────────────────────
                Deliberately carries no company-wide warning. Overriding a
                setting on one bid is an ordinary local edit and has to keep
                feeling like one; the broad notice lives only on the company
                control in Settings, and putting it here as well would train
                people to read past it in the one place it matters.
              */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Productivity</span>
                  <Badge variant="outline" className="text-[10px]">
                    {settings.productivitySource === "bid"
                      ? "This bid"
                      : "Company"}
                  </Badge>
                </div>
                <Select
                  value={bid.productivityPct === null ? INHERIT : "custom"}
                  onValueChange={value =>
                    updateBid.mutate({
                      id: bid.id,
                      productivityPct:
                        value === INHERIT ? null : company.productivityPct,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    aria-label="Productivity setting"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      Use company default ({asPercent(company.productivityPct)}
                      %)
                    </SelectItem>
                    <SelectItem value="custom">Set for this bid</SelectItem>
                  </SelectContent>
                </Select>
                {bid.productivityPct !== null && (
                  <InlineNumberField
                    value={
                      bid.productivityPct === null
                        ? null
                        : asPercent(Number(bid.productivityPct))
                    }
                    whenUnset={{ placeholder: "company default" }}
                    onSave={raw =>
                      updateBid.mutate({
                        id: bid.id,
                        productivityPct: fromPercent(raw),
                      })
                    }
                    // Signed: a crew that beats book hours is as real as one
                    // that does not. Floored above −100%, where every job would
                    // price at no labor at all.
                    rules={{ min: -90, max: 200 }}
                    className="h-7 w-20 text-xs"
                    ariaLabel="Productivity factor for this bid"
                    suffix="%"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Adjusts every labor hour on this bid, applied after
                  job-condition modifiers rather than added to them.
                </p>
              </div>

              {/*
                THE WHIP DIAL (D18). Next to the other per-bid settings, because
                it describes THIS BUILDING rather than the company.

                ── No "use company default" row, unlike productivity above ────
                That one overrides a company trait, so inheriting is a real
                third choice. How tightly one building is laid out has no
                company-wide answer above it, so offering an inherit option
                would point at nothing. It ships at 0 and is simply a number.

                ── What it says it does, in the units it does it in ───────────
                A dial nobody can see is a dial nobody trusts, so the line below
                states which quantity moves and which does not. It is the only
                honest way to describe it: the wire your devices carry between
                each other is an ESTIMATE that scales with the building, while
                traced footage is measured and is never padded (§ 5a).
              */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">Branch wire</span>
                  <Badge variant="outline" className="text-[10px]">
                    This bid
                  </Badge>
                </div>
                <InlineNumberField
                  value={asPercent(Number(bid.whipAdjustPct))}
                  whenUnset="zero"
                  onSave={raw =>
                    updateBid.mutate({
                      id: bid.id,
                      whipAdjustPct: fromPercent(raw),
                    })
                  }
                  // Signed: a tight commercial fit-out is as real as a
                  // sprawling house. Floored above −100%, where the wire
                  // between devices would come to nothing.
                  rules={{ min: -90, max: 300 }}
                  className="h-7 w-20 text-xs"
                  ariaLabel="Branch wire adjustment for this bid"
                  suffix="%"
                />
                <p className="text-xs text-muted-foreground">
                  {Number(bid.whipAdjustPct) === 0
                    ? "Your devices carry the wire between each other. Raise this for a building laid out loosely, lower it for a tight one."
                    : `Every device's branch wire counted as ${(
                        1 + Number(bid.whipAdjustPct)
                      ).toFixed(2)}x — 20 ft becomes ${round(
                        20 * (1 + Number(bid.whipAdjustPct)),
                        1
                      )} ft.`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Traced runs are not adjusted — measured footage is what you
                  measured.
                </p>
              </div>
            </CollapsiblePanel>
          </div>
        </div>
      </div>
    </div>
  );
}
