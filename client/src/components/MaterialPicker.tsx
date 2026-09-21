/**
 * MaterialPicker — search the catalog and choose one part.
 *
 * ── Why this is a component rather than the code it was copied from ─────────
 * The Assembly Builder had the only real material picker in the app: recents
 * when the box is empty, `smartSearch` ranking once it is not, arrow keys and
 * Enter, the highlighted row. The run-type editor needs exactly that, and a
 * second copy is a second set of ranking rules, a second keyboard convention
 * and a second answer to "what does an unpriced material look like" — which
 * drift apart in small ways nobody lists until two screens disagree about the
 * same catalog.
 *
 * So the search, the ranking and the keyboard live here. **What is done with
 * the chosen material stays with the caller**, because that is the part that is
 * genuinely different: the Assembly Builder adds a line and hands focus to its
 * quantity field; the run-type editor fills one slot and closes.
 *
 * ── It owns its own queries, and that costs nothing ─────────────────────────
 * `materials.list` and `materials.recent` are fetched here rather than passed
 * in. React Query dedupes by key, so a screen that already holds the catalog
 * pays nothing for asking again — and a screen that does not (the takeoff) gets
 * it without having to know that a picker needs one.
 *
 * ── Recents are not a shortcut bolted on ────────────────────────────────────
 * With nothing typed, the same dozen parts go into most of what a contractor
 * builds, and one click beats a search. The moment anything is typed, ranking
 * takes over completely — recents never dilute a search result.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { money } from "@/lib/money";
import { smartSearch } from "@/lib/smartSearch";
import { compareByRole } from "@shared/materialSearchRank";
import { compareBySize } from "@shared/materialSizeOrder";
import { trpc } from "@/lib/trpc";

export type PickableMaterial = {
  id: number;
  name: string;
  unitOfSale: string;
  costPerUnit: string;
  /**
   * The material's labor unit, carried so a recipe can start from it.
   *
   * Optional because a caller that only needs to NAME a material should not
   * have to supply it; nullable because a material nobody has costed the hours
   * for is the normal state of all 629 shipped rows.
   */
  laborHours?: string | null;
  category: string | null;
  defaultQty: string | null;
  searchAliases?: string | null;
};

/** Enough to choose from without the list becoming the screen. */
const MAX_RESULTS = 8;
/** Fewer when nothing is typed: a shortlist, not a second catalog. */
const MAX_RECENT = 6;

export function MaterialPicker({
  onChoose,
  exclude,
  placeholder = "Search materials — try “1900”, “romex”, “gem box”…",
  ariaLabel = "Search materials",
  autoFocus = false,
  inputRef,
  compact = false,
  showQty = false,
}: {
  onChoose: (material: PickableMaterial) => void;
  /** Already chosen elsewhere — kept out of the recents shortlist. */
  exclude?: readonly number[];
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** Given so a caller can put focus back after acting on a choice. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Tighter type and padding, for a picker living inside a popover. */
  compact?: boolean;
  /** Show a material's default quantity. Only the Assembly Builder uses it. */
  showQty?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ownRef = useRef<HTMLInputElement | null>(null);
  const searchRef = inputRef ?? ownRef;

  const { data: catalog = [] } = trpc.materials.list.useQuery();
  const { data: recent = [] } = trpc.materials.recent.useQuery({
    limit: MAX_RECENT + (exclude?.length ?? 0),
  });

  const searchable = useMemo(
    () =>
      (catalog as PickableMaterial[]).map(m => ({
        id: String(m.id),
        description: m.name,
        searchAliases: m.searchAliases ?? null,
      })),
    [catalog]
  );

  const results = useMemo<PickableMaterial[]>(() => {
    const all = catalog as PickableMaterial[];
    if (!query.trim()) {
      const chosen = new Set(exclude ?? []);
      return (recent as PickableMaterial[])
        .filter(m => !chosen.has(m.id))
        .slice(0, MAX_RECENT);
    }
    /*
      Ask for more than will be shown, then group by ROLE before trimming.

      Ranking after the cut would be cosmetic: if the product itself fell
      outside the first MAX_RESULTS on score, no reordering could bring it back.
      Searching "emt" matches 202 rows, and the strap used to outscore the pipe.

      smartSearch returns items in score order and does not expose the score, so
      position stands in for it — which is all the role comparison needs, since
      it only ever uses the score to break a tie inside one role.
    */
    const hits = smartSearch(searchable, query, MAX_RESULTS * 6);
    const byId = new Map(all.map(m => [m.id, m]));
    return hits
      .map((hit, index) => ({ hit, index }))
      .sort((a, b) =>
        compareByRole(
          {
            name: a.hit.description,
            score: -a.index,
            aliases: a.hit.searchAliases,
          },
          {
            name: b.hit.description,
            score: -b.index,
            aliases: b.hit.searchAliases,
          },
          query,
          compareBySize
        )
      )
      .map(({ hit }) => byId.get(Number(hit.id)))
      .filter((m): m is PickableMaterial => Boolean(m))
      .slice(0, MAX_RESULTS);
  }, [query, searchable, catalog, recent, exclude]);

  const showingRecent = !query.trim() && results.length > 0;

  // The highlight is an index into a list that changes under it. Reset rather
  // than clamp: after a new search, "the first result" is the only position
  // that means anything, and a preserved index points at something else.
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight(h => Math.min(h + 1, results.length - 1));
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
      if (chosen) {
        setQuery("");
        onChoose(chosen);
      }
      return;
    }
    if (event.key === "Escape") {
      // Clears the search rather than closing whatever is around it — the
      // smallest thing first, the same as Escape everywhere else here.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }
  };

  return (
    <div>
      <div className="relative">
        <Search
          className={cn(
            "absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none",
            compact ? "left-2.5 w-3 h-3" : "left-3 w-3.5 h-3.5"
          )}
        />
        <Input
          ref={searchRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className={cn(compact ? "h-7 pl-7 text-xs" : "h-8 pl-9 text-sm")}
        />
      </div>

      {results.length > 0 && (
        <>
          {showingRecent && (
            <div
              className={cn(
                "mt-2 text-muted-foreground",
                compact ? "text-[0.7rem]" : "text-xs"
              )}
            >
              Recently used — <span className="text-foreground">↑↓</span> then{" "}
              <span className="text-foreground">Enter</span>, or start typing to
              search.
            </div>
          )}
          <div className="mt-2 rounded-lg border border-border overflow-hidden">
            {results.map((m, index) => (
              <button
                key={m.id}
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  setQuery("");
                  onChoose(m);
                }}
                className={cn(
                  "w-full flex items-center gap-2 text-left transition-colors border-b border-border last:border-0",
                  compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                  index === highlight
                    ? "bg-[#F5C518]/10 text-foreground"
                    : "hover:bg-muted/40"
                )}
              >
                <Plus
                  className={cn(
                    "shrink-0",
                    compact ? "w-3 h-3" : "w-3.5 h-3.5",
                    index === highlight
                      ? "text-[#F5C518]"
                      : "text-muted-foreground"
                  )}
                />
                <span className="flex-1 truncate">{m.name}</span>
                {showQty && m.defaultQty != null && (
                  <span className="text-xs text-muted-foreground">
                    ×{Number(m.defaultQty)}
                  </span>
                )}
                <span
                  className={cn(
                    "text-muted-foreground",
                    compact ? "text-[0.7rem]" : "text-xs"
                  )}
                >
                  {m.category ?? "—"}
                </span>
                {/*
                  The price is shown even when it is $0, and especially then:
                  an unpriced material is the one the Materials screen filters
                  down to, and seeing the zero here is how somebody notices
                  before it is built into something.
                */}
                <span className="font-mono text-xs">
                  {money(Number(m.costPerUnit))}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
