/**
 * "Look up a word or symbol" — the box at the top of the Legend tab, and the
 * "More options" fold at its bottom (references/plan-reading-help-plan.md
 * § 1–3; steps 1 and 2 of § 7).
 *
 * Type `WP`, `AFF`, `hr`, `plug`, `can`, `homerun`: the answer comes from
 * THIS SET'S legend first ("This set's legend"), then the built-in guide —
 * symbols ("What it looks like") and abbreviations ("Usually means"), the
 * one the query spells exactly first. Drawings disagree with each other,
 * and the one in front of the person is the one that is right for this job.
 *
 * A symbol answer has ONE action, "Count these" (§ 9 Q11): an ordinary plain
 * count named for the symbol, exactly as typing the name would make — no
 * library entry, no assembly asked for. It is not there on a locked bid, or
 * for a thing that is traced rather than counted. Help never counts
 * anything by itself.
 *
 * No model, no server call of its own, nothing saved — the lists are
 * shipped content (shared/planHelp/, DRAFTS until the owner has reviewed
 * them) and the search is pure (shared/planHelp/lookUp.ts).
 */
import { useMemo, useState } from "react";
import {
  BookA,
  BookOpen,
  ChevronDown,
  Lightbulb,
  MapPin,
  NotebookText,
  Search,
  Shapes,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePlanTipsSeen, useSheetKindLine } from "@/lib/planHelpPrefs";
import { showTipsAgain, turnTipsOff } from "@/lib/planTips";
import { SHEET_KIND_CARDS, type SheetKind } from "@shared/planHelp/sheetKind";
import { SheetKindCardBody } from "./SheetKindLine";
import {
  NoteOutlinesSwitch,
  NoteTapsSwitch,
  SheetNotesList,
  notesFound,
} from "./SheetNotes";
import type { SheetNotesRead } from "@/lib/keyedNotes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ABBREVIATIONS,
  type Abbreviation,
} from "@shared/planHelp/abbreviations";
import {
  PLAN_SYMBOLS,
  countName,
  type PlanSymbol,
  type SymbolShape,
} from "@shared/planHelp/symbols";
import {
  answerOrder,
  legendMatches,
  libraryMatches,
  lookUpAbbreviations,
  lookUpSymbols,
} from "@shared/planHelp/lookUp";
import type { SymbolEntry } from "./LegendPanel";

/** How many guide answers of each kind show before "Show N more". */
const SHOWN = 4;

/** What a symbol card needs from the page. */
type SymbolActions = {
  /** The company's assemblies, for "Your library has: …". */
  assemblies: { id: number; name: string }[];
  /** Start a plain count. Undefined on a locked bid: no button. */
  onCountThese?: (name: string) => void;
};

export function PlanLookUp({
  symbols,
  ...actions
}: {
  /** This set's legend, as the Legend tab lists it. */
  symbols: SymbolEntry[];
} & SymbolActions) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState({ symbols: false, words: false });
  const q = query.trim();
  const legend = useMemo(() => legendMatches(q, symbols), [q, symbols]);
  const words = useMemo(() => lookUpAbbreviations(q), [q]);
  const drawn = useMemo(() => lookUpSymbols(q), [q]);
  const order = answerOrder(words, drawn);
  const shownWords = showAll.words ? words : words.slice(0, SHOWN);
  const shownDrawn = showAll.symbols ? drawn : drawn.slice(0, SHOWN);

  const sections = {
    symbols: drawn.length > 0 && (
      <section key="symbols" aria-label="What it looks like">
        <h4 className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
          What it looks like
        </h4>
        <ul className="space-y-1.5">
          {shownDrawn.map(({ symbol }) => (
            <li key={symbol.name}>
              <SymbolCard symbol={symbol} {...actions} />
            </li>
          ))}
        </ul>
        {drawn.length > shownDrawn.length && (
          <ShowMore
            n={drawn.length - shownDrawn.length}
            onClick={() => setShowAll(s => ({ ...s, symbols: true }))}
          />
        )}
      </section>
    ),
    abbreviations: words.length > 0 && (
      <section key="abbreviations" aria-label="Usually means">
        <h4 className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
          Usually means
        </h4>
        <ul className="space-y-1.5">
          {shownWords.map(({ entry }) => (
            <li key={entry.abbr}>
              <AbbreviationCard entry={entry} />
            </li>
          ))}
        </ul>
        {words.length > shownWords.length && (
          <ShowMore
            n={words.length - shownWords.length}
            onClick={() => setShowAll(s => ({ ...s, words: true }))}
          />
        )}
      </section>
    ),
  };

  return (
    <div className="px-3 pt-2 pb-2 space-y-2">
      <label className="relative block">
        <span className="sr-only">Look up a word or symbol</span>
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={query}
          placeholder="Look up a word or symbol (WP, AFF, plug…)"
          className="h-9 pl-7 pr-8 text-sm"
          onChange={e => {
            setQuery(e.target.value);
            setShowAll({ symbols: false, words: false });
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

          {order.map(kind => sections[kind])}

          {legend.length === 0 && words.length === 0 && drawn.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nothing found for &ldquo;{q}&rdquo;. Check this set&rsquo;s legend
              and general notes sheet — symbols and abbreviations change from
              one set to the next.
            </p>
          )}

          {(words.length > 0 || drawn.length > 0) && (
            <p className="text-[0.7rem] text-muted-foreground">
              Drawn and written differently on every set — this set&rsquo;s own
              legend wins.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ShowMore({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-1 min-h-8 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      onClick={onClick}
    >
      Show {n} more
    </button>
  );
}

/**
 * The common way a symbol is drawn, black on white like the drawing it
 * stands for, at the 32 px it was drawn to be read at.
 */
export function SymbolPicture({
  shapes,
  className,
}: {
  shapes: SymbolShape[];
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("w-8 h-8 shrink-0 rounded bg-white text-black", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {shapes.map((s, i) => {
        if ("circle" in s)
          return (
            <circle
              key={i}
              cx={s.circle[0]}
              cy={s.circle[1]}
              r={s.circle[2]}
              fill={s.fill ? "currentColor" : "none"}
            />
          );
        if ("line" in s)
          return (
            <line
              key={i}
              x1={s.line[0]}
              y1={s.line[1]}
              x2={s.line[2]}
              y2={s.line[3]}
              strokeDasharray={s.dash ? "3 2.5" : undefined}
            />
          );
        if ("rect" in s)
          return (
            <rect
              key={i}
              x={s.rect[0]}
              y={s.rect[1]}
              width={s.rect[2]}
              height={s.rect[3]}
              fill={s.fill ? "currentColor" : "none"}
            />
          );
        if ("path" in s)
          return (
            <path key={i} d={s.path} fill={s.fill ? "currentColor" : "none"} />
          );
        return (
          <text
            key={i}
            x={s.text[0]}
            y={s.text[1]}
            fontSize={s.size ?? 10}
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontFamily="Arial, sans-serif"
            fontWeight={700}
          >
            {s.text[2]}
          </text>
        );
      })}
    </svg>
  );
}

/** One symbol: what it is, how it's usually bid, what to look out for. */
function SymbolCard({
  symbol,
  assemblies,
  onCountThese,
}: { symbol: PlanSymbol } & SymbolActions) {
  const name = countName(symbol);
  const library = useMemo(
    () => libraryMatches(symbol, assemblies),
    [symbol, assemblies]
  );
  return (
    <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs space-y-1">
      <div className="flex items-start gap-2">
        <SymbolPicture shapes={symbol.picture} />
        <div className="min-w-0">
          <p className="font-semibold">{symbol.name}</p>
          {symbol.aka.length > 0 && (
            <p className="text-muted-foreground">
              Also: {symbol.aka.join(", ")}
            </p>
          )}
        </div>
      </div>
      <p>{symbol.whatItIs}</p>
      <p>
        <span className="text-muted-foreground">
          How it&rsquo;s usually bid:{" "}
        </span>
        {symbol.howBid}
      </p>
      {symbol.lookOutFor.length > 0 && (
        <div>
          <p className="text-muted-foreground">Look out for:</p>
          <ul className="list-disc pl-4">
            {symbol.lookOutFor.map(l => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {library.length > 0 && (
        <p className="text-muted-foreground">
          Your library has: {library.map(a => a.name).join(" · ")}
        </p>
      )}
      {name && onCountThese && (
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 text-xs"
          onClick={() => onCountThese(name)}
          title={`Start a count called “${name}” — no assembly needed`}
        >
          <MapPin className="w-3.5 h-3.5" /> Count these
        </Button>
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
 * The Legend tab's ONE fold (plan § 1): everything past the basic path —
 * this sheet's numbered notes and the switch that rings their tags (off by
 * default), the whole symbol guide, the whole abbreviation list, every sheet kind's
 * card, and the switch for the sheet-kind line (its default depends on the
 * screen — @/lib/planHelpPrefs); tips and
 * outlines land here as they are built (§ 7). Closed by default.
 */
export function LegendMoreOptions({
  notes,
  detailLinks = 0,
  onShowNote,
  ...actions
}: SymbolActions & {
  /** This sheet's numbered notes and tags; null while it is being read. */
  notes: SheetNotesRead | null;
  /** Detail links found on this sheet (5d), for the outlines' count. */
  detailLinks?: number;
  /** Take the drawing to a spot on the sheet, page points. */
  onShowNote: (at: { x: number; y: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<
    "notes" | "symbols" | "words" | "sheets" | null
  >(null);
  /** The sheet kind opened to its card in the browse list. */
  const [openKind, setOpenKind] = useState<SheetKind | null>(null);
  const [sheetKindLine, setSheetKindLine] = useSheetKindLine();
  const [tipsSeen, setTipsSeen] = usePlanTipsSeen();
  const sheetCards = useMemo(
    () => SHEET_KIND_CARDS.filter(c => c.trade === "electrical"),
    []
  );
  /** The symbol opened to its full card in the browse list. */
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const sortedWords = useMemo(
    () =>
      [...ABBREVIATIONS]
        .filter(e => e.trade === "electrical")
        .sort((a, b) =>
          a.abbr.replace(/[()]/g, "").localeCompare(b.abbr.replace(/[()]/g, ""))
        ),
    []
  );
  const allSymbols = useMemo(
    () => PLAN_SYMBOLS.filter(s => s.trade === "electrical"),
    []
  );
  const toggle = (kind: "notes" | "symbols" | "words" | "sheets") =>
    setBrowsing(b => (b === kind ? null : kind));
  const noteCount = notesFound(notes);

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
        <div className="px-3 pb-3 space-y-1">
          {/* This sheet's numbered notes (plan § 7 step 5b) — read by code
              on open, nothing saved (@/lib/keyedNotes). */}
          <button
            type="button"
            onClick={() => toggle("notes")}
            aria-expanded={browsing === "notes"}
            className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
          >
            <NotebookText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">Notes on this sheet</span>
            {noteCount > 0 && (
              <span className="text-muted-foreground">{noteCount}</span>
            )}
          </button>
          {browsing === "notes" && (
            <SheetNotesList read={notes} onShow={onShowNote} />
          )}
          <NoteOutlinesSwitch read={notes} links={detailLinks} />
          <NoteTapsSwitch />
          <button
            type="button"
            onClick={() => toggle("symbols")}
            aria-expanded={browsing === "symbols"}
            className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
          >
            <Shapes className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">All symbols</span>
            <span className="text-muted-foreground">{allSymbols.length}</span>
          </button>
          {browsing === "symbols" && (
            <ul
              className="divide-y divide-border/50 pb-2"
              aria-label="All symbols"
            >
              {allSymbols.map(symbol => (
                <li key={symbol.name} className="py-1">
                  {openSymbol === symbol.name ? (
                    <SymbolCard symbol={symbol} {...actions} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenSymbol(symbol.name)}
                      className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
                    >
                      <SymbolPicture shapes={symbol.picture} />
                      <span className="flex-1 min-w-0 truncate">
                        {symbol.name}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => toggle("words")}
            aria-expanded={browsing === "words"}
            className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
          >
            <BookA className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">All abbreviations</span>
            <span className="text-muted-foreground">{sortedWords.length}</span>
          </button>
          {browsing === "words" && (
            <ul
              className="divide-y divide-border/50"
              aria-label="All abbreviations"
            >
              {sortedWords.map(entry => (
                <li key={entry.abbr}>
                  <AbbreviationCard entry={entry} compact />
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => toggle("sheets")}
            aria-expanded={browsing === "sheets"}
            className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">All sheet kinds</span>
            <span className="text-muted-foreground">{sheetCards.length}</span>
          </button>
          {browsing === "sheets" && (
            <ul
              className="divide-y divide-border/50 pb-2"
              aria-label="All sheet kinds"
            >
              {sheetCards.map(card => (
                <li key={card.kind} className="py-1">
                  {openKind === card.kind ? (
                    <div className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
                      <SheetKindCardBody kinds={[card.kind]} showFrom={false} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenKind(card.kind)}
                      className="w-full flex items-center gap-2 rounded px-1 min-h-9 text-left text-xs hover:bg-muted/50"
                    >
                      <span className="flex-1 min-w-0 truncate">
                        {card.label}
                        <span className="text-muted-foreground">
                          {" "}
                          · {card.hint}
                        </span>
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Off by default on a phone and a sideways iPad, where the line
              costs a toolbar row; on elsewhere (@/lib/planHelpPrefs). */}
          <label className="flex items-center gap-2 rounded px-1 min-h-9 text-xs cursor-pointer">
            <span className="flex-1">
              Say what each sheet is, beside its name
            </span>
            <Switch
              checked={sheetKindLine}
              onCheckedChange={setSheetKindLine}
              aria-label="Say what each sheet is, beside its name"
            />
          </label>
          {/* The first-open tips (plan § 5): back from the start, or never. */}
          <div className="flex items-center gap-2 rounded px-1 min-h-9 text-xs">
            <Lightbulb className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1">Tips</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => setTipsSeen(showTipsAgain())}
            >
              Show tips again
            </Button>
            {!tipsSeen.off && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => setTipsSeen(turnTipsOff(tipsSeen))}
              >
                Turn tips off
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
