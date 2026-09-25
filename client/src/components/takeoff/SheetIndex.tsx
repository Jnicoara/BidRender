/**
 * SheetIndex — every sheet in the set, by number and title, one click from the
 * drawing.
 *
 * ── Why names and not page numbers ───────────────────────────────────────────
 * An estimator thinks "the panel schedule", not "page 23". Each row shows the
 * sheet's NUMBER and TITLE — `E-101  Lighting Plan` — read once at upload from
 * the PDF's page labels, its bookmarks, or its title block, in that order
 * (shared/sheetIdentity.ts, references/plan-viewer-overhaul.md § 17.4). Where
 * nothing could be read, the row keeps its bookmark name or a `Sheet 3` label,
 * shown as provisional, because a column of bare numbers is the thing this
 * panel exists to replace.
 *
 * The page number stays visible beside it regardless, since it is how people
 * cross-reference against a printed set.
 *
 * ── Fixing a wrong one, by hand ──────────────────────────────────────────────
 * The pencil opens BOTH fields, number and title, in place. Following
 * CLAUDE.md § Editing fields: the text selects on focus, Enter commits, Escape
 * abandons back to what is stored, and a real write flashes green. Leaving the
 * row commits too — but moving between its two fields does not, so a number
 * and a title can be typed in one go. Only a field that CHANGED is written:
 * editing the number never touches the title (§ Editing fields rule 7).
 *
 * **A hand edit is sticky.** A typed title is the sheet's `name`
 * (`nameSource: 'user'`), and a typed number is stored as `user`, which no
 * later read overwrites (server/db.ts `recordSheetReads`). Clearing a number
 * leaves it blank on purpose — it does not bring the reader's guess back.
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
  RotateCw,
  Ruler,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { VisibleRange } from "@/lib/thumbnailQueue";
import type { SheetReadProgress } from "@/lib/sheetReadJob";
import { sheetDisplay, type StoredSheetIdentity } from "@shared/sheetIdentity";

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

export type SheetIdentities = Map<number, StoredSheetIdentity>;

/** Where the reading of this plan's sheet numbers stands. */
export type SheetReadStatus = {
  /** The run in progress or just finished, if there is one this visit. */
  progress: SheetReadProgress | undefined;
  /** Pages the server holds a reading for. */
  pagesRead: number;
  pageCount: number;
  byteSize: number | null;
};

function SheetRow({
  sheet,
  identity,
  isActive,
  pictures,
  thumbnail,
  onOpen,
  onRename,
  onSetNumber,
}: {
  sheet: IndexSheet;
  identity: StoredSheetIdentity | undefined;
  isActive: boolean;
  /** Pictures mode: a full-width thumbnail above the name. */
  pictures: boolean;
  thumbnail: string | undefined;
  onOpen: () => void;
  onRename: (name: string) => void;
  onSetNumber: (sheetNumber: string | null) => void;
}) {
  const display = sheetDisplay(sheet, identity);
  const [editing, setEditing] = useState(false);
  const [draftNumber, setDraftNumber] = useState(display.number ?? "");
  const [draftTitle, setDraftTitle] = useState(display.title);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const editor = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const startEditing = () => {
    setDraftNumber(display.number ?? "");
    setDraftTitle(display.title);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const number = draftNumber.trim().slice(0, 32);
    const title = draftTitle.trim().slice(0, 255);
    let wrote = false;
    // Only a field that changed is written. A blank title is refused — every
    // sheet keeps a name — while a blank number is a real answer: none.
    if ((number || null) !== display.number) {
      onSetNumber(number || null);
      wrote = true;
    }
    if (title && title !== display.title) {
      onRename(title);
      wrote = true;
    }
    // No flash for a save that did not happen — see CLAUDE.md § Editing
    // fields rule 4.
    if (!wrote) return;
    setFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), FLASH_MS);
  };

  const fieldKeys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
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
          title={`Page ${sheet.pageNumber} of the PDF`}
        >
          {sheet.pageNumber}
        </span>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div
              ref={editor}
              className="flex gap-1"
              onClick={e => e.stopPropagation()}
              // Leaving the row commits; moving between its fields does not.
              onBlur={e => {
                if (!editor.current?.contains(e.relatedTarget as Node | null))
                  commit();
              }}
            >
              <Input
                value={draftNumber}
                autoFocus
                onChange={e => setDraftNumber(e.target.value)}
                onFocus={selectOnFocus}
                onKeyDown={fieldKeys}
                placeholder="No."
                className="h-6 w-16 shrink-0 text-xs px-1.5 font-mono"
                aria-label={`Sheet number of page ${sheet.pageNumber}`}
              />
              <Input
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                onFocus={selectOnFocus}
                onKeyDown={fieldKeys}
                className="h-6 flex-1 min-w-0 text-xs px-1.5"
                aria-label={`Title of page ${sheet.pageNumber}`}
              />
            </div>
          ) : (
            <p
              className={cn(
                "text-sm truncate transition-colors",
                flash && "text-emerald-300"
              )}
              title={
                display.number
                  ? `${display.number} ${display.title}`
                  : display.title
              }
            >
              {display.number && (
                <span className="font-mono font-medium mr-1.5">
                  {display.number}
                </span>
              )}
              <span
                className={cn(
                  // A default label is visibly provisional, so it reads as
                  // something to fix rather than as the sheet's actual name.
                  display.provisional &&
                    !flash &&
                    "text-muted-foreground italic"
                )}
              >
                {display.title}
              </span>
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
              startEditing();
            }}
            className="shrink-0 p-1 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-all"
            aria-label={`Edit the number and title of page ${sheet.pageNumber}`}
            title="Edit number and title"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `Sheet ${sheet.pageNumber} saved` : ""}
      </span>
    </div>
  );
}

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * One line under the header: reading in progress, stopped, or never done.
 * Nothing at all once a plan is fully read — the numbers are the news.
 */
function ReadStatusLine({
  status,
  onRead,
}: {
  status: SheetReadStatus;
  onRead: () => void;
}) {
  const { progress, pagesRead, pageCount, byteSize } = status;
  // Reading the text of every page downloads nearly the whole file, so a
  // read started from here says what it costs. From an upload it is free.
  const cost = byteSize ? ` (reads the whole ${formatMb(byteSize)} file)` : "";
  const action = (label: string) => (
    <button
      type="button"
      onClick={onRead}
      className="text-[#F5C518] hover:underline"
      title={`Read sheet numbers and titles off this plan${cost}`}
    >
      {label}
    </button>
  );

  let body: React.ReactNode = null;
  if (progress?.state === "reading") {
    body = (
      <span role="status" aria-live="polite">
        Reading sheet numbers…{" "}
        {progress.total ? `${progress.read} of ${progress.total}` : ""}
      </span>
    );
  } else if (progress?.state === "failed") {
    body = <>Reading sheet numbers stopped. {action("Try again")}</>;
  } else if (pageCount > 0 && pagesRead === 0) {
    body = <>Sheet numbers not read yet. {action("Read")}</>;
  } else if (pageCount > 0 && pagesRead < pageCount) {
    body = (
      <>
        Sheet numbers read for {pagesRead} of {pageCount}. {action("Read all")}
      </>
    );
  }
  if (!body) return null;
  return (
    <p className="px-3 py-1.5 border-b border-border text-[0.7rem] text-muted-foreground shrink-0">
      {body}
    </p>
  );
}

export function SheetIndex({
  sheets,
  identities,
  readStatus,
  activePage,
  thumbnails,
  onVisibleRange,
  onOpenPage,
  onRename,
  onSetNumber,
  onReadNumbers,
  loading,
}: {
  sheets: IndexSheet[];
  /** Numbers and titles read off the plan, by page. */
  identities: SheetIdentities;
  readStatus: SheetReadStatus;
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
  onSetNumber: (pageNumber: number, sheetNumber: string | null) => void;
  /** Read (or re-read) this plan's numbers from storage. */
  onReadNumbers: () => void;
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

  const reading = readStatus.progress?.state === "reading";
  const fullyRead =
    readStatus.pageCount > 0 && readStatus.pagesRead >= readStatus.pageCount;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          <FileText className="w-3 h-3" /> Sheets
          <span className="ml-auto normal-case tracking-normal">
            {sheets.length === 0 ? "" : `${scaled}/${sheets.length} scaled`}
          </span>
          {/*
            Reading again is rare — after a set is re-issued, or to pick up a
            better reader — so once a plan is read it is one quiet icon, not a
            line of text. Hand-typed numbers survive it.
          */}
          {fullyRead && !reading && (
            <button
              type="button"
              onClick={onReadNumbers}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label="Read sheet numbers again"
              title={`Read sheet numbers and titles again${
                readStatus.byteSize
                  ? ` (reads the whole ${formatMb(readStatus.byteSize)} file)`
                  : ""
              }. Numbers you typed are kept.`}
            >
              <RotateCw className="w-3 h-3" />
            </button>
          )}
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

      {!loading && (
        <ReadStatusLine status={readStatus} onRead={onReadNumbers} />
      )}

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
          identities={identities}
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
          onSetNumber={onSetNumber}
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
  identities,
  activePage,
  pictures,
  startRow,
  thumbnails,
  onTopRow,
  onVisibleRange,
  onOpenPage,
  onRename,
  onSetNumber,
}: {
  sheets: IndexSheet[];
  identities: SheetIdentities;
  activePage: number;
  pictures: boolean;
  /** The row to open at. */
  startRow: number;
  thumbnails: Record<number, string>;
  onTopRow: (row: number) => void;
  onVisibleRange: (range: VisibleRange | null) => void;
  onOpenPage: (pageNumber: number) => void;
  onRename: (sheetId: number, name: string) => void;
  onSetNumber: (pageNumber: number, sheetNumber: string | null) => void;
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
                identity={identities.get(sheet.pageNumber)}
                isActive={sheet.pageNumber === activePage}
                pictures={pictures}
                thumbnail={thumbnails[sheet.pageNumber]}
                onOpen={() => onOpenPage(sheet.pageNumber)}
                onRename={name => onRename(sheet.id, name)}
                onSetNumber={number => onSetNumber(sheet.pageNumber, number)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
