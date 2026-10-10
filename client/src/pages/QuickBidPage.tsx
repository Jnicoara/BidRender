/**
 * QuickBidPage — build a bid by counting, with no plan and no takeoff.
 *
 * For jobs where the counts are already known: a small commercial fit-out, a
 * house. The whole screen is one loop — type, pick, Enter — and it never leaves
 * the keyboard. Everything else (rollup, snapshot, overhead and profit) is the
 * Bid layer already built; this is an entry point on top of it, not a second
 * pricing model.
 *
 * ── What makes it fast ───────────────────────────────────────────────────────
 *  • The search box holds focus permanently and re-focuses after every add.
 *  • Arrow keys move the highlight, Enter adds — no mouse, no confirm step.
 *  • The quantity persists between adds, because counting runs in batches
 *    ("six of these, three of those") rather than resetting to 1 each time.
 *  • Counting the same assembly again ADDS to its existing line rather than
 *    stacking duplicate rows (the `merge` flag on bids.addAssembly). That line
 *    keeps its original snapshot: you are counting more of something already
 *    priced on this bid, not re-pricing it.
 *
 * ── Standing rules ───────────────────────────────────────────────────────────
 * Quantities use InlineNumberField, so they carry select-on-focus, Enter/blur
 * save, Escape revert and the save flash for free (CLAUDE.md § Editing fields).
 * The total updates optimistically with no spinner (§ Responsiveness).
 */
import { pointerMovedHighlight } from "@/lib/pointerHighlight";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRemoveBidLine } from "@/hooks/useRemoveBidLine";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Plus,
  Receipt,
  Search,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InlineNumberField } from "@/components/InlineNumberField";
import { DuplicateUnitPanel } from "@/components/DuplicateUnitPanel";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { smartSearch } from "@/lib/smartSearch";
import { snapshotHoursFor } from "@shared/assemblyHours";
import { money } from "@/lib/money";
import { LineCost } from "@/components/LineCost";
import { NotPricedTotal } from "@/components/NotPricedTotal";
import { MostUsedRow } from "@/components/MostUsedRow";
import { BuildFromPartsPanel } from "@/components/BuildFromPartsPanel";
import { useNoMatchLog } from "@/hooks/useNoMatchLog";
import { bidNotPricedCount } from "@/lib/notPricedTotal";
import { IncompletePriceTag } from "@/components/IncompletePriceTag";
import { otherPercentCaption } from "@/lib/percentKind";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { BidExpensesSection } from "@/components/BidExpensesSection";
import { matchJobCostTiles, type JobCostTileKey } from "@/lib/jobCostTiles";

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** How many results the arrow keys move through. Enough to choose, few enough to scan. */
const MAX_RESULTS = 7;

// ─── The counting screen ──────────────────────────────────────────────────────

/**
 * Counting, on a bid that already exists.
 *
 * This file used to export a CHOOSER above this screen: a name field, and
 * beneath it every bid the user had ever written, from an unpaginated
 * `bids.list`. It was the last query in the app that fetched the whole table,
 * and it sat in front of the one thing Quick bid exists to remove — friction
 * before you can start counting.
 *
 * So the entry point moved to where the context already is. The Dashboard's
 * Quick bid card creates the bid and opens this screen with it, exactly as the
 * Upload-a-plan card beside it already did; an existing bid reaches it from its
 * own header, next to Plans. Both give this screen a bid, so it never has to
 * ask which one.
 */
export default function QuickBidPage({
  bidId,
  onBack,
}: {
  bidId: number;
  onBack: () => void;
}) {
  const coarse = useCoarsePointer();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [qty, setQty] = useState("1");
  const [unitLabel, setUnitLabel] = useState("");
  const [showDuplicate, setShowDuplicate] = useState(false);
  /**
   * "More options" — everything beyond type, quantity, Enter. Closed by
   * default so the counting loop is the whole screen (quick-bid-plan § 0).
   */
  const [showMore, setShowMore] = useState(false);
  /** A job cost tile to open, set when Enter lands on one in the search. */
  const [openTile, setOpenTile] = useState<{
    key: JobCostTileKey;
    nonce: number;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const detailQuery = trpc.bids.get.useQuery({ id: bidId });
  const { data: assemblies = [], isSuccess: assembliesReady } =
    trpc.assemblies.list.useQuery();
  /** "Most used" — [] until the company has 3 bids (shared/mostUsed.ts). */
  const { data: mostUsed = [] } = trpc.assemblies.mostUsed.useQuery();
  const { data: kits = [] } = trpc.kits.list.useQuery();
  const { data: units = [] } = trpc.bids.units.useQuery({ bidId });
  /** For the "More options" summary — the same query the section reads. */
  const { data: jobCosts = [] } = trpc.bidExtras.expenses.onBid.useQuery({
    bidId,
  });

  const refresh = useCallback(() => {
    void utils.bids.get.invalidate({ id: bidId });
    // Adding here moves the bid screen's "Most used" row too.
    void utils.assemblies.mostUsed.invalidate();
    void utils.bids.units.invalidate({ bidId });
    void utils.bids.list.invalidate();
  }, [utils, bidId]);

  const addAssembly = trpc.bids.addAssembly.useMutation({
    onError: error => toast.error(error.message),
    onSettled: refresh,
  });

  const addKit = trpc.bids.addKit.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      toast.success(
        `Added ${result.kitName} — ${result.lineIds.length} line${result.lineIds.length === 1 ? "" : "s"}` +
          (result.skipped.length ? `, skipped ${result.skipped.length}` : "")
      );
    },
    onSettled: refresh,
  });

  const updateLine = trpc.bids.updateLine.useMutation({
    onMutate: async vars => {
      await utils.bids.get.cancel({ id: bidId });
      const previous = utils.bids.get.getData({ id: bidId });
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

  // Undo puts back the exact line, frozen prices included.
  const removeLine = useRemoveBidLine(bidId, refresh);

  // smartSearch caches its index by array identity, so this must stay memoised.
  // Assemblies get the same trade-slang matching as materials, so "recep" finds
  // "Duplex receptacle standard" without typing it out.
  const searchable = useMemo(
    () =>
      assemblies.map(a => ({
        id: String(a.id),
        description: a.name,
        category: a.category,
      })),
    [assemblies]
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const hits = smartSearch(searchable, query, MAX_RESULTS);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
  }, [query, searchable, assemblies]);

  /**
   * Job costs the query names ("permit", "dump", "drive"), listed under the
   * assemblies so the type → Enter loop reaches them too. Enter on one opens
   * its tile under More options rather than adding — it needs an amount.
   */
  const costHits = useMemo(() => matchJobCostTiles(query), [query]);
  const resultCount = results.length + costHits.length;

  const recordMiss = useNoMatchLog(
    "assembly",
    query,
    resultCount,
    assembliesReady
  );
  /** "Build it from parts here" — open, and the search it was opened from. */
  const [buildingFrom, setBuildingFrom] = useState<string | null>(null);

  // Keep the highlight inside the result list as it shrinks under typing.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const focusSearch = useCallback(() => {
    // rAF so focus lands after React has committed the re-render.
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const add = useCallback(
    (assemblyId: number) => {
      const amount = Number(qty);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a quantity greater than zero.");
        return;
      }
      addAssembly.mutate({
        bidId,
        assemblyId,
        qty: amount,
        unitLabel: unitLabel.trim() || null,
        // Count more of the same thing onto one line instead of stacking rows.
        merge: true,
      });
      setQuery("");
      focusSearch();
    },
    [addAssembly, bidId, qty, unitLabel, focusSearch]
  );

  /** Open a job cost tile under More options, its first box focused. */
  const openJobCost = useCallback((key: JobCostTileKey) => {
    setShowMore(true);
    setOpenTile({ key, nonce: Date.now() });
    setQuery("");
  }, []);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(h => Math.min(h + 1, resultCount - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[highlight];
      const chosenCost = costHits[highlight - results.length];
      if (chosen) add(chosen.id);
      else if (chosenCost) openJobCost(chosenCost.key);
      // Enter on nothing found is a finished search: logged now, not after
      // a settle time a fast typist never waits for.
      else recordMiss();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
    }
  };

  const detail = detailQuery.data;
  const lines = detail?.lines ?? [];
  /** Lines the totals leave out — the rule the line cells use. */
  const notPriced = bidNotPricedCount(lines, detail?.dropsNotPriced ?? 0);
  // Newest first: what you just counted is what you want to check.
  const recent = [...lines].reverse();

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="page-header border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs"
            onClick={onBack}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Bid
          </Button>
          <Zap className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {detail?.bid.name ?? "Quick bid"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"} · counting mode
            </p>
          </div>
          {/* On a phone .page-header drops this block to its own line, flush
              left, so its label aligns left with the figure under it. */}
          <div className="text-left md:text-right shrink-0">
            <div className="text-xs text-muted-foreground">
              Bid price{" "}
              <IncompletePriceTag show={detail?.incomplete ?? false} />
            </div>
            <div>
              {detail ? (
                // workPrice, the bid screen's "Bid price" — the work alone.
                // finalPrice until 2026-09-27, which on a bid with a
                // marked-up charge is a different number under the same name.
                <NotPricedTotal
                  amount={money(detail.totals.workPrice)}
                  notPriced={notPriced}
                  className="font-mono text-base text-[#F5C518]"
                />
              ) : (
                <span className="font-mono text-base text-[#F5C518]">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl space-y-4">
          {/* The loop: type, arrow, Enter */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[16rem]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Count an assembly — type, then Enter"
                  className="h-10 pl-9 text-sm"
                  autoFocus
                  aria-label="Search assemblies to count"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Qty</span>
                <Input
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="h-10 w-20 text-sm text-right"
                  inputMode="decimal"
                  onFocus={selectOnFocus}
                  aria-label="Quantity to add"
                />
              </div>
              <Input
                value={unitLabel}
                onChange={e => setUnitLabel(e.target.value)}
                className="h-10 w-36 text-sm"
                placeholder="Unit (optional)"
                aria-label="Unit label"
              />
            </div>

            {/* The same "Most used" row as the bid screen — one component,
                same rules: hidden while typing, nothing before 3 bids. A
                click counts it onto the bid like Enter does (merge). */}
            <MostUsedRow items={mostUsed} query={query} onAdd={add} />

            {buildingFrom !== null ? (
              <BuildFromPartsPanel
                bidId={bidId}
                query={buildingFrom}
                target={{
                  kind: "line",
                  qty: Number(qty),
                  unitLabel: unitLabel.trim() || null,
                  merge: true,
                }}
                onCancel={() => {
                  setBuildingFrom(null);
                  focusSearch();
                }}
                onBuilt={({ name, savedToLibrary }) => {
                  toast.success(
                    savedToLibrary
                      ? `Counted "${name}" and saved it to your library.`
                      : `Counted "${name}".`
                  );
                  setBuildingFrom(null);
                  setQuery("");
                  void utils.assemblies.list.invalidate();
                  refresh();
                  focusSearch();
                }}
              />
            ) : resultCount > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {results.map((assembly, index) => (
                  <button
                    key={assembly.id}
                    onMouseMove={e => {
                      // Only a pointer that MOVED — see @/lib/pointerHighlight.
                      if (pointerMovedHighlight(e)) setHighlight(index);
                    }}
                    onClick={() => add(assembly.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-border last:border-0",
                      index === highlight
                        ? "bg-[#F5C518]/10 text-foreground"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <Plus
                      className={cn(
                        "w-3.5 h-3.5 shrink-0",
                        index === highlight
                          ? "text-[#F5C518]"
                          : "text-muted-foreground"
                      )}
                    />
                    <span className="flex-1 truncate">{assembly.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {assembly.category}
                    </span>
                    {/* Work hours plus the assembly's own overhead — the same
                        figure that gets snapshotted when this is added
                        (`snapshotHoursFor`), so not set reads "hours not
                        set" here exactly as it will on the bid (D1). */}
                    {(() => {
                      const hours = snapshotHoursFor(
                        assembly.baseLaborHours,
                        assembly.overheadLaborHours
                      );
                      return hours === null ? (
                        <span className="text-xs text-[#F5C518]">
                          hours not set
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {round(Number(hours), 2)} h
                        </span>
                      );
                    })()}
                    {index === highlight && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        Enter
                      </Badge>
                    )}
                  </button>
                ))}
                {costHits.map((tile, offset) => {
                  const index = results.length + offset;
                  return (
                    <button
                      key={`cost-${tile.key}`}
                      onMouseMove={e => {
                        if (pointerMovedHighlight(e)) setHighlight(index);
                      }}
                      onClick={() => openJobCost(tile.key)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-border last:border-0",
                        index === highlight
                          ? "bg-[#F5C518]/10 text-foreground"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <Receipt
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          index === highlight
                            ? "text-[#F5C518]"
                            : "text-muted-foreground"
                        )}
                      />
                      <span className="flex-1 truncate">{tile.label}</span>
                      <span className="text-xs text-muted-foreground">
                        job cost
                      </span>
                      {index === highlight && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          Enter
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {query.trim() ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>Nothing matches “{query}”.</span>
                    {assembliesReady ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          recordMiss();
                          setBuildingFrom(query);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Build it from parts here
                      </Button>
                    ) : null}
                  </span>
                ) : (
                  <>
                    {/* The keys mean nothing to a finger (device audit). */}
                    {coarse ? (
                      <>Type to search, then tap one to add it.</>
                    ) : (
                      <>
                        Type to search.{" "}
                        <span className="text-foreground">↑↓</span> to choose,{" "}
                        <span className="text-foreground">Enter</span> to add,{" "}
                        <span className="text-foreground">Esc</span> to clear.
                      </>
                    )}{" "}
                    The quantity sticks between adds, and counting the same
                    assembly again adds to its line.
                  </>
                )}
              </p>
            )}
          </div>

          {/* More options — ONE fold for everything past type, qty, Enter
              (CLAUDE.md § "Customization available, but never in the way").
              It holds job costs today and is where rooms, typed footage and
              checklists go next (quick-bid-plan § 10). The summary names
              what is inside, so a closed fold still says there are charges. */}
          <div className="rounded-xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setShowMore(v => !v)}
              aria-expanded={showMore}
              className={cn(
                "w-full flex items-center gap-2 px-4 text-left",
                coarse ? "min-h-12 py-2" : "py-2.5"
              )}
            >
              <ChevronDown
                className={cn(
                  "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
                  showMore ? "" : "-rotate-90"
                )}
              />
              <span className="text-sm font-medium">More options</span>
              <span className="text-xs text-muted-foreground truncate">
                {jobCosts.length === 0
                  ? "Job costs — permit, lift, dumpster, drive time"
                  : `Job costs: ${jobCosts.length} · ${money(
                      jobCosts.reduce((sum, c) => sum + c.amount, 0)
                    )}`}
              </span>
            </button>
            {showMore && (
              <div className="border-t border-border px-4 py-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Job costs
                </div>
                <BidExpensesSection
                  bidId={bidId}
                  openTile={openTile}
                  onTileClosed={focusSearch}
                />
              </div>
            )}
          </div>

          {/* Whole rooms in one go */}
          {kits.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Or drop in a kit
              </div>
              <div className="flex flex-wrap gap-1.5">
                {kits.map(kit => (
                  <button
                    key={kit.id}
                    onClick={() => {
                      const amount = Number(qty);
                      addKit.mutate({
                        bidId,
                        kitId: kit.id,
                        qty: Number.isFinite(amount) && amount > 0 ? amount : 1,
                        unitLabel: unitLabel.trim() || null,
                      });
                      focusSearch();
                    }}
                    className="px-2.5 py-1 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    {kit.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A kit lands as separate line items, each frozen and each
                editable — so one room being different is just an edit to that
                line.
              </p>
            </div>
          )}

          {/* Repeating units — the same generator the Bids screen uses */}
          <div className="space-y-2">
            <button
              onClick={() => setShowDuplicate(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {showDuplicate ? "Hide" : "Repeat a unit"}
              {units.length > 0 && (
                <span className="text-muted-foreground/70">
                  ({units.length} on this bid)
                </span>
              )}
            </button>
            {showDuplicate && (
              <DuplicateUnitPanel
                bidId={bidId}
                units={units}
                onDone={refresh}
              />
            )}
          </div>

          {/* What has been counted, newest first.

              Below md each line is a CARD rather than a table row: the name
              on its own full-width line, then quantity, cost and remove on
              the line under it. On a phone a table row left the name about
              90px, and it ran on under the quantity box and the cost instead
              of stopping (device audit, 2026-10-01). So the column heads are
              hidden there too — with no columns they label nothing. From md
              up every class below resolves to the row it always was. */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <span className="flex-1">Counted</span>
              <span className="w-16 text-right shrink-0">Qty</span>
              <span className="w-24 text-right shrink-0">Cost</span>
              <span className="w-8 shrink-0" />
            </div>

            {!detail ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : recent.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing counted yet. Search above and press Enter.
              </div>
            ) : (
              recent.map(line => (
                <div
                  key={line.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                >
                  {/* basis-full puts the name on a line of its own on a
                      phone, where it wraps; md:truncate keeps the laptop's
                      single line. */}
                  <div className="basis-full md:flex-1 min-w-0">
                    <span className="text-sm break-words md:truncate">
                      {line.name}
                    </span>
                    {line.unitLabel && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {line.unitLabel}
                      </span>
                    )}
                  </div>
                  <InlineNumberField
                    value={Number(line.qty)}
                    onSave={next =>
                      updateLine.mutate({ bidId, id: line.id, qty: next })
                    }
                    rules={{ min: 0, max: 999999 }}
                    className="h-7 w-16 text-sm"
                    ariaLabel={`Quantity of ${line.name}`}
                  />
                  {/* Never $0 for a line that could not be priced, or that
                      nobody priced — the same cell as BidsPage. */}
                  <LineCost line={line} className="w-24 text-right shrink-0" />
                  {/* ml-auto pushes remove to the card's right edge on a
                      phone; on a row the cost's fixed width already places it. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 shrink-0 ml-auto md:ml-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine.mutate({ bidId, id: line.id })}
                    aria-label={`Remove ${line.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {detail && (lines.length > 0 || detail.totals.expensesTotal > 0) && (
            <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              {/* Materials, direct cost and bid price each say how many lines
                  they leave out, as on the bid screen (owner, 2026-09-26).
                  Materials is here for that reason: it is the total an
                  unpriced part is missing from first. */}
              <div>
                <div className="text-xs text-muted-foreground">Materials</div>
                <NotPricedTotal
                  amount={money(detail.totals.materialCost)}
                  notPriced={notPriced}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Direct cost</div>
                <NotPricedTotal
                  amount={money(detail.totals.directCost)}
                  notPriced={notPriced}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Labor
                  {/* Same rule as the Bids rollup: shown only when the factor
                      is actually moving the number, and phrased so the hours
                      an estimator recognises from their assemblies are still
                      visible next to the adjusted total. */}
                  {detail.settings.productivityPct !== 0 && (
                    <span className="ml-1 text-muted-foreground/70">
                      ({round(detail.totals.laborHoursBeforeProductivity, 2)} h
                      {detail.settings.productivityPct > 0 ? " +" : " "}
                      {round(detail.settings.productivityPct * 100, 2)}%
                      productivity)
                    </span>
                  )}
                </div>
                <div className="font-mono text-sm">
                  {round(detail.totals.totalLaborHours, 2)} h
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {/* Both numbers, as on the bid screen (Part 4). */}
                  Profit {round(detail.settings.profit.value * 100, 2)}%{" "}
                  {detail.settings.profit.method}{" "}
                  {otherPercentCaption(
                    detail.settings.profit.method,
                    String(detail.settings.profit.value * 100)
                  )}
                  <span className="ml-1 text-muted-foreground/70">
                    (
                    {detail.settings.profitSource === "bid"
                      ? "this bid"
                      : "company"}
                    )
                  </span>
                </div>
                <div className="font-mono text-sm">
                  {money(detail.totals.profitAmount)}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-xs text-muted-foreground">
                  Bid price <IncompletePriceTag show={detail.incomplete} />
                </div>
                {/* The bid screen's "Bid price": workPrice. See the header. */}
                <NotPricedTotal
                  amount={money(detail.totals.workPrice)}
                  notPriced={notPriced}
                  className="font-mono text-lg text-[#F5C518]"
                />
              </div>
              {/* Job costs are billed on their own line, beside the work and
                  never inside "Bid price" — as on the bid screen, where a
                  marked-up charge inside it would be counted twice. So once
                  there are any, the all-in figure says so, under the name
                  the bid lists use for it. */}
              {detail.totals.expensesTotal > 0 && (
                <div className="basis-full flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 border-t border-border pt-2">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Job costs
                    </div>
                    <div className="font-mono text-sm">
                      {money(detail.totals.expensesTotal)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">
                      Total due <IncompletePriceTag show={detail.incomplete} />
                    </div>
                    <NotPricedTotal
                      amount={money(detail.totals.totalDue)}
                      notPriced={notPriced}
                      className="font-mono text-lg text-[#F5C518]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
