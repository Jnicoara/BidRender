/**
 * SheetIndex — every sheet in the set, by name, one click from the drawing.
 *
 * ── Why names and not page numbers ───────────────────────────────────────────
 * An estimator thinks "the panel schedule", not "page 23". Where the PDF
 * carries bookmarks — architectural sets very often do — those are the sheet's
 * real names and they go straight in. Where it does not, every sheet still gets
 * a label ("Sheet 3") that can be renamed, because a column of bare numbers is
 * the thing this panel exists to replace, and an unnamed row would send the
 * user back to clicking through pages to find out what each one is.
 *
 * The page number stays visible beside the name regardless, since it is how
 * people cross-reference against a printed set.
 *
 * ── Renaming ─────────────────────────────────────────────────────────────────
 * In place, following CLAUDE.md § Editing fields: the text selects on focus,
 * commits on Enter and on blur, Escape abandons back to the stored name, and a
 * real write flashes green. A rename is sticky — reopening the document never
 * overwrites it from the bookmarks again.
 *
 * ── Names or pictures ────────────────────────────────────────────────────────
 * A toggle at the top. Pictures mode shows one FULL-WIDTH thumbnail per row,
 * with the number and name under it — deliberately not a small icon beside
 * each name. references/plan-viewer-overhaul.md § 4a: a thumbnail has to be
 * big enough to recognise a sheet by its shape, and a 48px picture in a 240px
 * list is the postage stamp that rule exists to prevent. Pictures are drawn
 * only for the rows on screen, through the same visible-first queue as the
 * grid (lib/thumbnailQueue.ts). The choice is remembered per browser, like the
 * panel fold.
 *
 * ── Only the rows on screen are in the DOM ───────────────────────────────────
 * 500 sheets rendered every row: about 4,500 elements (measured 2026-09-25).
 * The rows are one small query per plan, so the fetch stays whole and only
 * the DOM is windowed.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  FileText,
  Image as ImageIcon,
  List,
  Pencil,
  Ruler,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { VisibleRange } from "@/lib/thumbnailQueue";

const FLASH_MS = 1100;

type ListMode = "names" | "pictures";
const LIST_MODE_KEY = "bidrender.takeoff.sheetListMode";

function readListMode(): ListMode {
  try {
    return window.localStorage.getItem(LIST_MODE_KEY) === "pictures"
      ? "pictures"
      : "names";
  } catch {
    return "names";
  }
}

function writeListMode(mode: ListMode) {
  try {
    window.localStorage.setItem(LIST_MODE_KEY, mode);
  } catch {
    // A private window or blocked storage: the toggle still works for this
    // visit, it is just not remembered.
  }
}

export type IndexSheet = {
  id: number;
  pageNumber: number;
  name: string;
  nameSource: "bookmark" | "default" | "user";
  scaleRatio: number | null;
  scaleText: string | null;
};

function SheetRow({
  sheet,
  isActive,
  pictures,
  thumbnail,
  onOpen,
  onRename,
}: {
  sheet: IndexSheet;
  isActive: boolean;
  /** Pictures mode: a full-width thumbnail above the name. */
  pictures: boolean;
  thumbnail: string | undefined;
  onOpen: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sheet.name);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) setDraft(sheet.name);
  }, [sheet.name, editing]);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // Blank or unchanged writes nothing — and must not flash, because a
    // confirmation for a save that did not happen is worse than none.
    if (!next || next === sheet.name) {
      setDraft(sheet.name);
      return;
    }
    onRename(next);
    setFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), FLASH_MS);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !editing && onOpen()}
      onKeyDown={e => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group cursor-pointer border-l-2 transition-colors",
        isActive
          ? "border-l-[#F5C518] bg-[#F5C518]/5"
          : "border-l-transparent hover:bg-muted/50",
        flash && "bg-emerald-500/10"
      )}
    >
      {pictures && (
        // Same 4:3, contained, as the grid: a cropped drawing is a picture of
        // its middle, which is the part that looks the same on every sheet.
        <div className="px-3 pt-2">
          <div
            className={cn(
              "aspect-[4/3] bg-white/95 flex items-center justify-center overflow-hidden rounded border",
              isActive ? "border-[#F5C518]" : "border-border"
            )}
          >
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
        </div>
      )}
      <div className="flex items-start gap-2 px-3 py-2">
        <span
          className={cn(
            "font-mono text-[0.7rem] tabular-nums mt-0.5 w-6 shrink-0 text-right",
            isActive ? "text-[#F5C518]" : "text-muted-foreground/60"
          )}
        >
          {sheet.pageNumber}
        </span>

        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={draft}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onFocus={selectOnFocus}
              onBlur={commit}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(sheet.name);
                  setEditing(false);
                }
              }}
              className="h-6 text-xs px-1.5"
              aria-label={`Name of sheet ${sheet.pageNumber}`}
            />
          ) : (
            <p
              className={cn(
                "text-sm truncate transition-colors",
                flash && "text-emerald-300",
                // A default label is visibly provisional, so it reads as
                // something to fix rather than as the sheet's actual name.
                sheet.nameSource === "default" &&
                  !flash &&
                  "text-muted-foreground italic"
              )}
              title={sheet.name}
            >
              {sheet.name}
            </p>
          )}

          {sheet.scaleText && (
            <span className="flex items-center gap-1 text-[0.7rem] text-muted-foreground/70 mt-0.5">
              <Ruler className="w-2.5 h-2.5" />
              <span className="font-mono">{sheet.scaleText}</span>
            </span>
          )}
        </div>

        {!editing && (
          <button
            onClick={e => {
              e.stopPropagation();
              setDraft(sheet.name);
              setEditing(true);
            }}
            className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-all"
            aria-label={`Rename sheet ${sheet.pageNumber}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `Sheet ${sheet.pageNumber} renamed` : ""}
      </span>
    </div>
  );
}

export function SheetIndex({
  sheets,
  activePage,
  thumbnails,
  onVisibleRange,
  onOpenPage,
  onRename,
  loading,
}: {
  sheets: IndexSheet[];
  activePage: number;
  /** Page number to a data URL, as each one finishes drawing. */
  thumbnails: Record<number, string>;
  /**
   * The pages on screen in pictures mode, so their pictures are drawn first;
   * null in names mode and when the list is gone, so nothing is drawn for it.
   */
  onVisibleRange: (range: VisibleRange | null) => void;
  onOpenPage: (pageNumber: number) => void;
  onRename: (sheetId: number, name: string) => void;
  loading?: boolean;
}) {
  const scaled = sheets.filter(s => s.scaleRatio !== null).length;
  const [mode, setMode] = useState<ListMode>(readListMode);
  const pictures = mode === "pictures";
  /**
   * The row at the top of the list, kept across a mode switch. A picture row
   * is five times the height of a name row, so the pixel scroll position means
   * a different sheet in each mode. Switching must keep you on the sheet you
   * were looking at.
   *
   * Each mode gets a FRESH list (keyed by mode) that opens at this row. Reusing
   * one virtualiser across the switch carried the old row heights over: names
   * mode landed on sheet 490 whatever you had been looking at, and switching
   * back could leave the list blank (both measured 2026-09-25).
   */
  const topRow = useRef<number | null>(null);
  const chooseMode = (next: ListMode) => {
    if (next === mode) return;
    setMode(next);
    writeListMode(next);
  };
  const activeIndex = sheets.findIndex(s => s.pageNumber === activePage);
  // First open: a couple of rows above the sheet you are on, so it is not
  // pinned to the top edge. After that: wherever you were.
  const startRow = topRow.current ?? Math.max(0, activeIndex - 2);

  useEffect(() => () => onVisibleRange(null), [onVisibleRange]);
  useEffect(() => {
    if (!pictures) onVisibleRange(null);
  }, [pictures, onVisibleRange]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <FileText className="w-3 h-3" /> Sheets
          <span className="ml-auto normal-case tracking-normal">
            {sheets.length === 0 ? "" : `${scaled}/${sheets.length} scaled`}
          </span>
          <div
            className="flex items-center rounded border border-border ml-1"
            role="group"
            aria-label="Show sheets as"
          >
            <button
              type="button"
              onClick={() => chooseMode("names")}
              aria-pressed={!pictures}
              aria-label="Show sheets as names"
              title="Names"
              className={cn(
                "p-1 rounded-l transition-colors",
                !pictures
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => chooseMode("pictures")}
              aria-pressed={pictures}
              aria-label="Show sheets as pictures"
              title="Pictures"
              className={cn(
                "p-1 rounded-r transition-colors",
                pictures
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ImageIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 min-h-0 p-3 space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : sheets.length === 0 ? (
        <p className="flex-1 min-h-0 px-3 py-4 text-xs text-muted-foreground">
          Sheets appear here once the document opens.
        </p>
      ) : (
        <SheetRows
          key={mode}
          sheets={sheets}
          activePage={activePage}
          pictures={pictures}
          startRow={startRow}
          thumbnails={thumbnails}
          onTopRow={row => {
            topRow.current = row;
          }}
          onVisibleRange={onVisibleRange}
          onOpenPage={onOpenPage}
          onRename={onRename}
        />
      )}
    </div>
  );
}

/**
 * The scrolling, windowed rows for ONE mode. Remounted when the mode changes,
 * so no row height from the other mode survives into it.
 */
function SheetRows({
  sheets,
  activePage,
  pictures,
  startRow,
  thumbnails,
  onTopRow,
  onVisibleRange,
  onOpenPage,
  onRename,
}: {
  sheets: IndexSheet[];
  activePage: number;
  pictures: boolean;
  /** The row to open at. */
  startRow: number;
  thumbnails: Record<number, string>;
  onTopRow: (row: number) => void;
  onVisibleRange: (range: VisibleRange | null) => void;
  onOpenPage: (pageNumber: number) => void;
  onRename: (sheetId: number, name: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Only sizes the scrollbar and the opening offset before rows are measured.
  // A picture row is a 4:3 picture the width of the default 240px panel plus
  // its caption.
  const estimate = pictures ? 228 : 40;
  /*
    Open at the row asked for. Nothing above it has been measured, so its
    offset is exactly rows x estimate. The virtualiser is TOLD the offset as
    well as the element being scrolled to it: scrolled alone, the scroll
    happened before the virtualiser was listening, and it drew rows 0-25 at
    offset 12,000 — an empty list (measured). scrollToIndex is not used
    because it settles over animation frames, which a background tab never
    runs.
  */
  const [openingOffset] = useState(
    () => Math.max(0, Math.min(startRow, sheets.length - 1)) * estimate
  );
  const virtualizer = useVirtualizer({
    count: sheets.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimate,
    overscan: pictures ? 2 : 10,
    initialOffset: openingOffset,
  });
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && openingOffset > 0) element.scrollTop = openingOffset;
  }, [openingOffset]);

  const first = virtualizer.range?.startIndex ?? null;
  const last = virtualizer.range?.endIndex ?? null;
  useEffect(() => {
    if (first !== null) onTopRow(first);
  }, [first, onTopRow]);

  const firstPage = first === null ? null : (sheets[first]?.pageNumber ?? null);
  const lastPage = last === null ? null : (sheets[last]?.pageNumber ?? null);
  useEffect(() => {
    if (!pictures || firstPage === null || lastPage === null) return;
    onVisibleRange({ first: firstPage, last: lastPage });
  }, [pictures, firstPage, lastPage, onVisibleRange]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map(item => {
          const sheet = sheets[item.index];
          return (
            <div
              key={sheet.id}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <SheetRow
                sheet={sheet}
                isActive={sheet.pageNumber === activePage}
                pictures={pictures}
                thumbnail={thumbnails[sheet.pageNumber]}
                onOpen={() => onOpenPage(sheet.pageNumber)}
                onRename={name => onRename(sheet.id, name)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
