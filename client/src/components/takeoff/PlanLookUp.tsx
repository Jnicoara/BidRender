/**
 * "Look up a word or symbol" — the box at the top of the Legend tab, and the
 * "More options" fold at its bottom (references/plan-reading-help-plan.md
 * § 1, § 2; step 1 of § 7).
 *
 * Type `WP`, `AFF`, `hr`, `gfi`, `homerun`: the answer comes from THIS SET'S
 * legend first ("This set's legend"), then the built-in guide ("Usually
 * means"). Drawings disagree with each other, and the one in front of the
 * person is the one that is right for this job.
 *
 * No model, no server call, nothing saved — the list is shipped content
 * (shared/planHelp/abbreviations.ts, a DRAFT until the owner has reviewed
 * it) and the search is a pure function (shared/planHelp/lookUp.ts).
 */
import { useMemo, useState } from "react";
import { BookA, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  ABBREVIATIONS,
  type Abbreviation,
} from "@shared/planHelp/abbreviations";
import { legendMatches, lookUpAbbreviations } from "@shared/planHelp/lookUp";
import type { SymbolEntry } from "./LegendPanel";

/** How many guide answers show before "Show N more". */
const SHOWN = 4;

export function PlanLookUp({
  symbols,
}: {
  /** This set's legend, as the Legend tab lists it. */
  symbols: SymbolEntry[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const q = query.trim();
  const legend = useMemo(() => legendMatches(q, symbols), [q, symbols]);
  const guide = useMemo(() => lookUpAbbreviations(q), [q]);
  const shown = showAll ? guide : guide.slice(0, SHOWN);

  return (
    <div className="px-3 pt-2 pb-2 space-y-2">
      <label className="relative block">
        <span className="sr-only">Look up a word or symbol</span>
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          placeholder="Look up a word or symbol (WP, AFF, HR…)"
          className="h-9 pl-7 pr-8 text-sm"
          onChange={e => {
            setQuery(e.target.value);
            setShowAll(false);
          }}
          onKeyDown={e => {
            // The page's own keys (letters arm tools, Escape puts one down)
            // must not see typing here.
            e.stopPropagation();
            if (e.key === "Escape") setQuery("");
          }}
        />
        {q && (
          <button
            type="button"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded text-muted-foreground hover:text-foreground"
            onClick={() => setQuery("")}
            aria-label="Clear the look-up"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>

      {q && (
        <div className="space-y-2" aria-live="polite">
          {legend.length > 0 && (
            <section aria-label="This set's legend">
              <h4 className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
                This set&rsquo;s legend
              </h4>
              {/* Shown, not clickable: help explains and never counts
                  (plan § 0). The row in the legend list below counts. */}
              <ul className="space-y-0.5">
                {legend.map(symbol => (
                  <li
                    key={symbol.id}
                    className="flex items-center gap-2 px-1 py-0.5"
                  >
                    {symbol.thumbnail ? (
                      <img
                        src={symbol.thumbnail}
                        alt=""
                        className="w-7 h-7 object-contain rounded bg-white shrink-0"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded bg-muted shrink-0" />
                    )}
                    <span className="text-xs truncate">{symbol.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {guide.length > 0 && (
            <section aria-label="Usually means">
              <h4 className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
                Usually means
              </h4>
              <ul className="space-y-1.5">
                {shown.map(({ entry }) => (
                  <li key={entry.abbr}>
                    <AbbreviationCard entry={entry} />
                  </li>
                ))}
              </ul>
              {guide.length > shown.length && (
                <button
                  type="button"
                  className="mt-1 min-h-8 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setShowAll(true)}
                >
                  Show {guide.length - shown.length} more
                </button>
              )}
            </section>
          )}

          {legend.length === 0 && guide.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nothing found for &ldquo;{q}&rdquo;. Check this set&rsquo;s legend
              and general notes sheet — abbreviations change from one set to the
              next.
            </p>
          )}

          {guide.length > 0 && legend.length === 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              This set&rsquo;s own legend wins if it says something different.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One abbreviation, every meaning with its clue, plain words, for the bid. */
function AbbreviationCard({
  entry,
  compact = false,
}: {
  entry: Abbreviation;
  compact?: boolean;
}) {
  const others = entry.spellings.filter(s => s !== entry.abbr);
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs space-y-0.5",
        compact && "border-0 bg-transparent px-0 py-1"
      )}
    >
      <p>
        <span className="font-semibold">{entry.abbr}</span>
        {others.length > 0 && (
          <span className="text-muted-foreground"> · {others.join(", ")}</span>
        )}
      </p>
      {entry.means.length === 1 ? (
        <p className="font-medium">{entry.means[0].meaning}</p>
      ) : (
        <ul className="list-disc pl-4">
          {entry.means.map(m => (
            <li key={m.meaning}>
              <span className="font-medium">{m.meaning}</span>
              {m.when && (
                <span className="text-muted-foreground"> — {m.when}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!compact && <p className="text-muted-foreground">{entry.plain}</p>}
      {!compact && entry.forTheBid && (
        <p>
          <span className="text-muted-foreground">For the bid: </span>
          {entry.forTheBid}
        </p>
      )}
    </div>
  );
}

/**
 * The Legend tab's ONE fold (plan § 1): everything past the basic path.
 * Today it holds the whole abbreviation list; the symbol guide, tips and
 * outlines land here as they are built (§ 7). Closed by default.
 */
export function LegendMoreOptions() {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const sorted = useMemo(
    () =>
      [...ABBREVIATIONS]
        .filter(e => e.trade === "electrical")
        .sort((a, b) =>
          a.abbr.replace(/[()]/g, "").localeCompare(b.abbr.replace(/[()]/g, ""))
        ),
    []
  );

  return (
    <div className="border-t border-border shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-10 text-left"
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90"
          )}
        />
        <span className="text-sm font-medium">More options</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <button
            type="button"
            onClick={() => setBrowsing(v => !v)}
            aria-expanded={browsing}
            className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
          >
            <BookA className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">All abbreviations</span>
            <span className="text-muted-foreground">{sorted.length}</span>
          </button>
          {browsing && (
            <ul
              className="divide-y divide-border/50"
              aria-label="All abbreviations"
            >
              {sorted.map(entry => (
                <li key={entry.abbr}>
                  <AbbreviationCard entry={entry} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
