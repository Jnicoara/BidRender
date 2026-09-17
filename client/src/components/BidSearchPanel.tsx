/**
 * Finding a bid from years ago.
 *
 * ── Every filter goes to the server ──────────────────────────────────────────
 * This component holds the filter state and renders the results. It does not
 * filter anything. That is the whole design: the query runs in SQL against
 * indexed columns and returns one page, so the screen costs the same at 20,000
 * bids as at 20 — see `shared/bidSearch.ts`.
 *
 * ── Typing is debounced, paging is not ───────────────────────────────────────
 * A keystroke should not be a query. The text boxes settle for 300ms before
 * anything is sent, which is short enough to feel immediate and long enough
 * that typing a client's name is one request rather than eight. Dropdowns and
 * dates fire straight away — those are single deliberate choices, and waiting
 * after one just feels broken.
 *
 * ── It says what it is showing ───────────────────────────────────────────────
 * "23 bids" with no context is a number a person cannot check. The header
 * repeats the filters back in words, and the count says "23 so far" while more
 * pages exist rather than implying it is the total — the query deliberately
 * never counts the whole result set, so claiming a total would be a lie.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  CalendarDays,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  describeFilters,
  hasAnyFilter,
  type ArchiveScope,
  type BidDateField,
  type BidSort,
} from "@shared/bidSearch";
import { moneyWhole } from "@/lib/money";

const ANY = "__any__";

/** Hold a value still until it stops changing. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function BidSearchPanel({
  onOpenBid,
  onArchive,
}: {
  onOpenBid: (id: number) => void;
  /** Omitted for a viewer, whose role cannot archive anything. */
  onArchive?: (bid: { id: number; name: string }) => void;
}) {
  const [text, setText] = useState("");
  const [client, setClient] = useState("");
  const [address, setAddress] = useState("");
  const [trade, setTrade] = useState(ANY);
  const [status, setStatus] = useState(ANY);
  const [dateField, setDateField] = useState<BidDateField>("created");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [archive, setArchive] = useState<ArchiveScope>("live");
  const [sort, setSort] = useState<BidSort>("recent");
  const [showMore, setShowMore] = useState(false);

  const debouncedText = useDebounced(text, 300);
  const debouncedClient = useDebounced(client, 300);
  const debouncedAddress = useDebounced(address, 300);

  const { data: trades = [] } = trpc.bids.usedTrades.useQuery();

  const filters = useMemo(
    () => ({
      text: debouncedText.trim() || undefined,
      client: debouncedClient.trim() || undefined,
      address: debouncedAddress.trim() || undefined,
      trade: trade === ANY ? undefined : trade,
      status: status === ANY ? undefined : (status as "Draft"),
      dateField,
      from: from || undefined,
      to: to || undefined,
      archive,
      sort,
      pageSize: 25,
    }),
    [
      debouncedText,
      debouncedClient,
      debouncedAddress,
      trade,
      status,
      dateField,
      from,
      to,
      archive,
      sort,
    ]
  );

  const query = trpc.bids.search.useInfiniteQuery(filters, {
    getNextPageParam: page => page.nextCursor,
    // Keeps the previous results on screen while the next term is fetched, so
    // the list does not blink empty between keystrokes.
    placeholderData: previous => previous,
  });

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap(page => page.items),
    [query.data]
  );

  const filtered = hasAnyFilter(filters);
  const summary = describeFilters(filters);

  const clearAll = () => {
    setText("");
    setClient("");
    setAddress("");
    setTrade(ANY);
    setStatus(ANY);
    setFrom("");
    setTo("");
    setArchive("live");
  };

  return (
    <div className="space-y-3">
      {/* ── The one box most searches start in ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Search bids — job name, client, address…"
            className="pl-9 h-9"
            aria-label="Search bids"
          />
          {text && (
            <button
              onClick={() => setText("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={showMore ? "default" : "outline"}
          className="h-9 gap-1.5 text-xs shrink-0"
          onClick={() => setShowMore(v => !v)}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
        </Button>

        <Select value={sort} onValueChange={v => setSort(v as BidSort)}>
          <SelectTrigger className="h-9 w-40 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently touched</SelectItem>
            <SelectItem value="created">Newest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── The rest, folded away until wanted ── */}
      {showMore && (
        <div className="rounded-lg border border-border bg-card p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Client</span>
            <Input
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="Who it was for"
              className="h-8 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Address</span>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Where the job was"
              className="h-8 text-sm"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Trade</span>
            <Select value={trade} onValueChange={setTrade}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any trade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any trade</SelectItem>
                {/* Only the trades this company has actually bid — offering
                    one with no bids behind it is a filter that can only
                    disappoint. */}
                {trades.map(t => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any status</SelectItem>
                {["Draft", "Active", "Won", "Lost"].map(s => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" /> Date range
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={dateField}
                onValueChange={v => setDateField(v as BidDateField)}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-8 w-36 text-sm"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-8 w-36 text-sm"
                aria-label="To date"
              />
            </div>
          </div>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Archived</span>
            <Select
              value={archive}
              onValueChange={v => setArchive(v as ArchiveScope)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Not archived</SelectItem>
                <SelectItem value="all">Include archived</SelectItem>
                <SelectItem value="archived">Archived only</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
      )}

      {/* ── What is being shown, in words ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {rows.length}
          {query.hasNextPage ? "+" : ""} bid{rows.length === 1 ? "" : "s"}
          {summary ? ` ${summary}` : ""}
        </span>
        {filtered && (
          <button
            onClick={clearAll}
            className="underline hover:text-foreground shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Results ── */}
      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(n => (
            <div
              key={n}
              className="h-14 rounded-lg border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center">
          <p className="text-sm font-medium">No bids match</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered
              ? "Try fewer filters, or include archived bids."
              : "Bids you create will show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(bid => (
            <div key={bid.id} className="group relative">
              <button
                onClick={() => onOpenBid(bid.id)}
                className={cn(
                  "w-full text-left rounded-lg border border-border bg-card px-3 py-2.5",
                  "hover:border-border/80 hover:bg-muted/20 transition-colors",
                  "flex flex-wrap items-center gap-x-4 gap-y-1"
                )}
              >
                <span className="flex-1 min-w-[12rem]">
                  <span className="block text-sm font-medium truncate">
                    {bid.name}
                    {/* Coloured rather than grey, unlike the archived tag: a
                        sample must read as a different KIND of row, not as a
                        row in a different state. */}
                    {bid.isSample && (
                      <span className="ml-2 text-[0.65rem] uppercase tracking-wide px-1.5 py-0.5 rounded border border-[#F5C518]/40 text-[#F5C518]">
                        sample
                      </span>
                    )}
                    {bid.archivedAt && (
                      <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                        archived
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {[bid.clientName, bid.siteAddress]
                      .filter(Boolean)
                      .join(" · ") || "No client or address"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {bid.status}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">
                  {new Date(
                    sort === "created" ? bid.createdAt : bid.updatedAt
                  ).toLocaleDateString()}
                </span>
                <span className="font-mono text-sm shrink-0 w-24 text-right">
                  {moneyWhole(bid.finalPrice)}
                </span>
              </button>
              {onArchive && !bid.archivedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => onArchive({ id: bid.id, name: bid.name })}
                  aria-label={`Archive ${bid.name}`}
                  title="Archive"
                >
                  <Archive className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}

          {query.hasNextPage && (
            <div className="pt-2 flex justify-center">
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
