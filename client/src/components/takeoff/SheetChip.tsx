/**
 * SheetChip — which sheet you are on, one click either way, and a page of
 * pictures for "which sheet had the panel schedule on it".
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 * So that collapsing the sheet list costs nothing. The list is the fastest way
 * to move around a 40-sheet set and it is also 240px of the drawing, so it has
 * to be foldable — and folding it is only acceptable if the sheet you are on
 * is still named and the next one is still one click away. That is this chip.
 *
 * ── Why thumbnails, and why BIG ones ─────────────────────────────────────────
 * On a real set the names blur together: `E2.01 POWER PLAN — LEVEL 2` against
 * `E2.02 POWER PLAN — LEVEL 3`. Shape does not. A panel schedule looks nothing
 * like a floor plan and a riser diagram looks like neither, and shape is what
 * people actually navigate by — so a postage-stamp grid would throw away the
 * whole idea. Fewer, larger thumbnails beat more, smaller ones.
 *
 * ── Rendering them is not free ───────────────────────────────────────────────
 * Every thumbnail is a real page render, and the worker draws one thing at a
 * time — so a grid rendered eagerly would sit in front of the sharp patch for
 * the sheet the user is actually reading. `onVisibleRange` is how this
 * component says which sheets are on screen right now, and the page above
 * draws those first and nothing else (lib/thumbnailQueue.ts). Scroll to sheet
 * 400 and sheet 400 is drawn next, rather than after the 399 above it.
 *
 * ── Only the rows on screen are in the DOM ───────────────────────────────────
 * A 500-sheet set rendered every cell: about 4,000 elements for a popover
 * showing twelve (measured 2026-09-25). The grid is virtualised by ROW, three
 * cells to a row.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, ChevronRight, Ruler } from "lucide-react";
import type { VisibleRange } from "@/lib/thumbnailQueue";
import { Input } from "@/components/ui/input";
import {
  enterTarget,
  jumpMatches,
  type JumpEntry,
  type JumpMatch,
} from "@/lib/sheetJump";
import {
  sheetDisplay,
  sheetLabel,
  type StoredSheetIdentity,
} from "@shared/sheetIdentity";

export type ChipSheet = {
  id: number;
  pageNumber: number;
  name: string;
  nameSource: "bookmark" | "default" | "user";
  scaleRatio: number | null;
  scaleText: string | null;
};

/**
 * `E-101  Lighting Plan` — the same words the sheet list shows, from the same
 * rule (shared/sheetIdentity.ts), so the chip, the grid and the list cannot
 * disagree about what a sheet is called.
 */
function labelOf(
  sheet: Pick<ChipSheet, "name" | "nameSource" | "pageNumber">,
  identities: Map<number, StoredSheetIdentity>
) {
  return sheetLabel(sheetDisplay(sheet, identities.get(sheet.pageNumber)));
}

const COLUMNS = 3;

export function SheetChip({
  sheets,
  identities,
  page,
  pageCount,
  thumbnails,
  onOpenPage,
  onVisibleRange,
  jumpList,
  onJump,
  disabled,
}: {
  sheets: ChipSheet[];
  /** Numbers and titles read off the plan, by page. */
  identities: Map<number, StoredSheetIdentity>;
  page: number;
  pageCount: number;
  /** Page number to a data URL, as each one finishes drawing. */
  thumbnails: Record<number, string>;
  onOpenPage: (page: number) => void;
  /** The sheets the grid has on screen, or null when it is closed. */
  onVisibleRange: (range: VisibleRange | null) => void;
  /** Every sheet on the BID, every plan, for "go to sheet". */
  jumpList: (JumpEntry & { filename: string })[];
  /** Go to a page — possibly on another plan of the same bid. */
  onJump: (bidPdfId: number, pageNumber: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const jumpInput = useRef<HTMLInputElement | null>(null);
  /** The results list's key handler, which owns the highlight. */
  const jumpKeys = useRef<((e: React.KeyboardEvent) => void) | null>(null);

  /*
    G opens this with the box ready to type in. Same guard as F (focus mode)
    in TakeoffPage: not while typing somewhere, not with a modifier held.
  */
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled]);

  // A fresh box every time it opens.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const active = sheets.find(s => s.pageNumber === page) ?? null;
  const label = active
    ? labelOf(active, identities)
    : pageCount > 0
      ? `Sheet ${page}`
      : "—";

  /**
   * Every page, whether or not a sheet row exists for it yet.
   *
   * The rows are created from the PDF's outline after the document opens, so
   * for the first moment of a new plan there are pages and no sheets. Driving
   * the grid off the page count means it is never empty when there is
   * something to show.
   */
  const pages = useMemo(() => {
    const byPage = new Map(sheets.map(s => [s.pageNumber, s]));
    return Array.from({ length: Math.max(pageCount, sheets.length) }).map(
      (_, index) => {
        const pageNumber = index + 1;
        const sheet: ChipSheet = byPage.get(pageNumber) ?? {
          id: -pageNumber,
          pageNumber,
          name: `Sheet ${pageNumber}`,
          nameSource: "default",
          scaleRatio: null,
          scaleText: null,
        };
        // The cell shows the label; `name` is not edited from here.
        return { ...sheet, name: labelOf(sheet, identities) };
      }
    );
  }, [sheets, pageCount, identities]);

  return (
    <div className="flex items-center gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onOpenPage(page - 1)}
        disabled={disabled || page <= 1}
        aria-label="Previous sheet"
        title="Previous sheet (left arrow)"
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs max-w-[15rem]"
            disabled={disabled}
            title="Every sheet in this set — or press G and type a sheet number"
          >
            <span className="truncate">{label}</span>
            <span className="font-mono tabular-nums text-muted-foreground shrink-0">
              {pageCount > 0 ? `${page}/${pageCount}` : "—"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[34rem] p-0"
          // The box takes focus, not Radix's first focusable element, so a
          // click on the chip and a press of G both land ready to type.
          onOpenAutoFocus={e => {
            e.preventDefault();
            jumpInput.current?.focus();
          }}
          // Escape clears what was typed first, and closes on the second press
          // — CLAUDE.md § Editing fields: Escape abandons the edit.
          onEscapeKeyDown={e => {
            if (query) {
              e.preventDefault();
              setQuery("");
            }
          }}
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">
                {pages.length} {pages.length === 1 ? "sheet" : "sheets"}
              </p>
              <p className="text-xs text-muted-foreground">
                Pick by shape, or type a sheet number
              </p>
            </div>
            <Input
              ref={jumpInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Go to sheet — E-101, e101, lighting…"
              className="h-8 mt-2 text-sm font-mono"
              aria-label="Go to sheet by number"
              // Enter, arrows and Escape are handled in JumpResults.
              onKeyDown={e => jumpKeys.current?.(e)}
            />
          </div>
          {query.trim() ? (
            <JumpResults
              query={query}
              entries={jumpList}
              showPlan={new Set(jumpList.map(j => j.bidPdfId)).size > 1}
              keys={jumpKeys}
              onClear={() => setQuery("")}
              onPick={match => {
                onJump(match.bidPdfId, match.pageNumber);
                setOpen(false);
              }}
            />
          ) : (
            <SheetGrid
              pages={pages}
              page={page}
              thumbnails={thumbnails}
              onVisibleRange={onVisibleRange}
              onPick={pageNumber => {
                onOpenPage(pageNumber);
                setOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => onOpenPage(page + 1)}
        disabled={disabled || page >= pageCount}
        aria-label="Next sheet"
        title="Next sheet (right arrow)"
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

/**
 * What "go to sheet" found for what was typed, across every plan on the bid.
 *
 * Enter goes straight there when only one sheet can be meant; when two sheets
 * share a number — real sets do this — both are listed and nothing is chosen
 * until the person picks (lib/sheetJump.ts, `enterTarget`). Nothing found is a
 * sentence, not an error.
 */
function JumpResults({
  query,
  entries,
  showPlan,
  keys,
  onClear,
  onPick,
}: {
  query: string;
  entries: (JumpEntry & { filename: string })[];
  /** Say which plan a sheet is in — only when the bid has more than one. */
  showPlan: boolean;
  keys: React.MutableRefObject<((e: React.KeyboardEvent) => void) | null>;
  onClear: () => void;
  onPick: (match: JumpMatch & { filename: string }) => void;
}) {
  const matches = useMemo(
    () => jumpMatches(query, entries) as (JumpMatch & { filename: string })[],
    [query, entries]
  );
  /** The row the person moved to with the arrows — null until they do. */
  const [chosen, setChosen] = useState<number | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    setChosen(null);
    setAsked(false);
  }, [query]);

  keys.current = e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setChosen(current =>
        current === null
          ? step === 1
            ? 0
            : matches.length - 1
          : (current + step + matches.length) % matches.length
      );
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const target = enterTarget(matches, chosen);
      if (target) onPick(target as JumpMatch & { filename: string });
      else setAsked(true);
    }
  };
  useEffect(() => () => void (keys.current = null), [keys]);

  const exactCount = matches.filter(m => m.kind === "exact").length;

  if (matches.length === 0) {
    return (
      <div className="px-3 py-6 text-sm text-muted-foreground" role="status">
        No sheet numbered “{query.trim()}” on this bid.{" "}
        <button
          type="button"
          onClick={onClear}
          className="text-[#F5C518] hover:underline"
        >
          Show all sheets
        </button>
      </div>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
      {exactCount > 1 && (
        <p
          className={cn(
            "px-3 py-1.5 text-xs",
            asked ? "text-amber-400" : "text-muted-foreground"
          )}
          role="status"
        >
          {exactCount} sheets are numbered {matches[0].number} — pick one.
        </p>
      )}
      {matches.map((match, index) => (
        <button
          key={`${match.bidPdfId}:${match.pageNumber}`}
          type="button"
          role="option"
          aria-selected={chosen === index}
          onClick={() => onPick(match)}
          // Hover is only a look, never a choice. Found on screen 2026-09-25: a
          // pointer resting where the list happened to appear set the choice,
          // and Enter then jumped to one of two sheets sharing a number —
          // exactly the guess this list exists to avoid. Arrows or a click.
          className={cn(
            "w-full text-left px-3 py-1.5 flex items-baseline gap-2 text-sm",
            chosen === index ? "bg-muted" : "hover:bg-muted/60"
          )}
        >
          <span className="font-mono font-medium w-20 shrink-0 truncate">
            {match.number ?? "—"}
          </span>
          <span className="flex-1 min-w-0 truncate">{match.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground font-mono">
            {showPlan ? `${match.filename} · ` : ""}p{match.pageNumber}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The grid itself. Mounted only while the popover is open, so its range
 * report — and therefore every thumbnail render — stops the moment it closes
 * or the screen is left.
 */
function SheetGrid({
  pages,
  page,
  thumbnails,
  onVisibleRange,
  onPick,
}: {
  pages: ChipSheet[];
  page: number;
  thumbnails: Record<number, string>;
  onVisibleRange: (range: VisibleRange | null) => void;
  onPick: (pageNumber: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowCount = Math.ceil(pages.length / COLUMNS);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    // A 4:3 picture in a third of 34rem plus its caption and the gap. Rows are
    // measured once drawn; this only sizes the scrollbar before that.
    estimateSize: () => 184,
    overscan: 1,
  });

  /** Bring the sheet you are on into view when the grid opens. */
  // Once, on open — not every time the page changes under an open grid. A
  // tick later, because the popover has not been laid out on its first frame.
  // scrollTop is set directly: scrollToIndex settles over animation frames,
  // which a background tab never runs.
  useEffect(() => {
    const row = Math.floor((page - 1) / COLUMNS);
    if (row < 0 || row >= rowCount) return;
    const timer = window.setTimeout(() => {
      const element = scrollRef.current;
      const offset = virtualizer.getOffsetForIndex(row, "center");
      if (element && offset) element.scrollTop = offset[0];
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const first = virtualizer.range?.startIndex ?? null;
  const last = virtualizer.range?.endIndex ?? null;
  useEffect(() => {
    if (first === null || last === null) return;
    onVisibleRange({
      first: first * COLUMNS + 1,
      last: Math.min(pages.length, (last + 1) * COLUMNS),
    });
  }, [first, last, pages.length, onVisibleRange]);
  useEffect(() => () => onVisibleRange(null), [onVisibleRange]);

  return (
    <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto p-3">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map(row => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full grid grid-cols-3 gap-3 pb-3"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {pages
              .slice(row.index * COLUMNS, row.index * COLUMNS + COLUMNS)
              .map(sheet => (
                <GridCell
                  key={sheet.pageNumber}
                  sheet={sheet}
                  isActive={sheet.pageNumber === page}
                  thumbnail={thumbnails[sheet.pageNumber]}
                  onPick={() => onPick(sheet.pageNumber)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GridCell({
  sheet,
  isActive,
  thumbnail,
  onPick,
}: {
  sheet: ChipSheet;
  isActive: boolean;
  thumbnail: string | undefined;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group text-left rounded-lg border transition-colors overflow-hidden",
        isActive
          ? "border-[#F5C518] bg-[#F5C518]/5"
          : "border-border hover:border-[#F5C518]/50 hover:bg-muted/50"
      )}
      title={sheet.name}
    >
      {/*
        A fixed 4:3 box whatever the sheet's own proportions, so the grid stays
        a grid. The picture is contained rather than cropped: a cropped
        thumbnail of a drawing is a picture of the middle of a drawing, which is
        the part that looks the same on every sheet.
      */}
      <div className="aspect-[4/3] bg-white/95 flex items-center justify-center overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="w-full h-full bg-muted animate-pulse" />
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[0.7rem] text-muted-foreground shrink-0">
            {sheet.pageNumber}
          </span>
          <span
            className={cn("text-xs truncate", isActive && "text-[#F5C518]")}
          >
            {sheet.name}
          </span>
        </div>
        {sheet.scaleRatio ? (
          <p className="text-[0.65rem] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
            <Ruler className="w-2.5 h-2.5" /> {sheet.scaleText}
          </p>
        ) : (
          <p className="text-[0.65rem] text-muted-foreground/60 mt-0.5">
            No scale
          </p>
        )}
      </div>
    </button>
  );
}
