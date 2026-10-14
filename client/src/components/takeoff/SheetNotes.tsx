/**
 * The sheet's NUMBERED NOTES, read by code (@/lib/keyedNotes) — step 5a/5b of
 * references/plan-reading-help-plan.md § 7. Two pieces, both under the Legend
 * tab's "More options", so the main screen stays the basic path:
 *
 * - "Notes on this sheet": every numbered list the sheet prints (WORK NOTES,
 *   KEYED NOTES, GENERAL NOTES…), each note's lines joined into one text, and
 *   how many times the drawing tags it. Tap a note to go to it on the sheet.
 * - "Outline note tags on the drawing": a ring round every boxed number that
 *   points at a note. OFF unless turned on (owner, Q8) — @/lib/planHelpPrefs.
 *
 * - "Tap a note tag to read it" (5c): ON unless turned off, because the
 *   taps draw nothing. With no tool in hand, a tap on a boxed number opens
 *   that note's text in a card beside it (`NoteTagTaps`, `NoteTagCard`).
 *
 * Read on every sheet open in the worker, $0, nothing saved.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { NoteList, SheetNote, SheetNotesRead } from "@/lib/keyedNotes";
import { useNoteTagOutlines, useNoteTagTaps } from "@/lib/planHelpPrefs";
import {
  TAG_RING_GAP,
  nearestTag,
  placeNoteCard,
  tagTapRadius,
} from "@/lib/noteTagTap";
import type { Rect } from "@/lib/planTips";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/** How a note's tag count reads: words a person would say. */
export function tagCountText(n: number): string {
  if (n === 0) return "not tagged on the drawing";
  return n === 1
    ? "tagged once on the drawing"
    : `tagged ${n} times on the drawing`;
}

/** The row's count: the numbered notes found, across every list. */
export function notesFound(read: SheetNotesRead | null): number {
  return read ? read.lists.reduce((n, l) => n + l.notes.length, 0) : 0;
}

export function SheetNotesList({
  read,
  onShow,
}: {
  /** Null while the sheet is still being read. */
  read: SheetNotesRead | null;
  onShow: (at: { x: number; y: number }) => void;
}) {
  if (!read)
    return (
      <p className="px-1 py-1 text-xs text-muted-foreground">
        Reading the sheet…
      </p>
    );
  if (read.scan)
    return (
      <p className="px-1 py-1 text-xs text-muted-foreground">
        This sheet is a scanned picture, so there is no text to read its notes
        from.
      </p>
    );
  if (!read.lists.length)
    return (
      <p className="px-1 py-1 text-xs text-muted-foreground">
        No numbered notes found on this sheet. Notes are often on the notes
        sheet at the front of the set.
      </p>
    );
  return (
    <div className="space-y-2 pb-2">
      {read.lists.map((list, i) => (
        <section key={`${list.heading}:${i}`} aria-label={list.heading}>
          <h4 className="px-1 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
            {list.heading}
          </h4>
          <ol className="divide-y divide-border/50">
            {list.notes.map(note => {
              const tagged = list.keyed
                ? read.tags.filter(t => t.label === note.label).length
                : null;
              return (
                <li key={note.label}>
                  <button
                    type="button"
                    onClick={() => onShow(note.at)}
                    aria-label={`Note ${note.label}: show it on the sheet`}
                    className="w-full flex items-start gap-2 rounded px-1 py-1.5 min-h-9 text-left text-xs hover:bg-muted/50"
                  >
                    <span className="mt-px shrink-0 min-w-5 h-5 px-1 rounded border border-foreground/60 text-[11px] font-semibold leading-[18px] text-center">
                      {note.label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block break-words">{note.text}</span>
                      {tagged !== null && (
                        <span className="block text-[11px] text-muted-foreground">
                          {tagCountText(tagged)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** The switch for the rings, with how many there would be on this sheet. */
export function NoteOutlinesSwitch({ read }: { read: SheetNotesRead | null }) {
  const [on, setOn] = useNoteTagOutlines();
  const n = read?.tags.length ?? 0;
  return (
    <label className="flex items-center gap-2 rounded px-1 min-h-9 text-xs cursor-pointer">
      <span className="flex-1">
        Outline note tags on the drawing
        {read && !read.scan && (
          <span className="block text-[11px] text-muted-foreground">
            {n === 0
              ? "None found on this sheet"
              : n === 1
                ? "1 found on this sheet"
                : `${n} found on this sheet`}
          </span>
        )}
      </span>
      <Switch
        checked={on}
        onCheckedChange={setOn}
        aria-label="Outline note tags on the drawing"
      />
    </label>
  );
}

/** The switch for tapping a tag (5c) — on unless somebody turned it off. */
export function NoteTapsSwitch() {
  const [on, setOn] = useNoteTagTaps();
  return (
    <label className="flex items-center gap-2 rounded px-1 min-h-9 text-xs cursor-pointer">
      <span className="flex-1">
        Tap a note tag to read it
        <span className="block text-[11px] text-muted-foreground">
          Only with no tool picked up
        </span>
      </span>
      <Switch
        checked={on}
        onCheckedChange={setOn}
        aria-label="Tap a note tag to read it"
      />
    </label>
  );
}

const RING_GAP = TAG_RING_GAP;

export function NoteTagLayer({
  width,
  height,
  renderScale,
  read,
}: {
  width: number;
  height: number;
  renderScale: number;
  read: SheetNotesRead;
}) {
  const k = renderScale;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      aria-label="Note tags"
    >
      {read.tags.map((t, i) => (
        <circle
          key={i}
          cx={t.x * k}
          cy={t.y * k}
          r={(t.r + RING_GAP) * k}
          fill="none"
          stroke="#D97706"
          strokeWidth={1.6 * k}
        />
      ))}
    </svg>
  );
}

/**
 * The tap targets (5c) — invisible circles, one per tag, at least
 * TAG_TAP_MIN_SCREEN_PX across on screen at any zoom (@/lib/noteTagTap).
 * Mounted ONLY with no tool in hand (TakeoffPage), and placed BEFORE the
 * marks layer, so a mark that sits on a tag is still the mark's to click.
 *
 * A press is not stopped here: a drag that starts on a tag pans the sheet
 * like anywhere else, and the click after a real pan is swallowed
 * (@/lib/dragThreshold `swallowNextClick`), so a pan never opens a note.
 * Only a press that did not move reaches `onClick`.
 */
export function NoteTagTaps({
  width,
  height,
  renderScale,
  zoom,
  read,
  open,
  onOpen,
}: {
  width: number;
  height: number;
  renderScale: number;
  zoom: number;
  read: SheetNotesRead;
  /** The tag whose card is open, ringed so the card says which one. */
  open: number | null;
  onOpen: (index: number) => void;
}) {
  const k = renderScale;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-label="Note tags you can tap"
    >
      {read.tags.map((t, i) => (
        <circle
          key={i}
          data-note-tag={i}
          role="button"
          aria-label={`Note ${t.label}: read it`}
          cx={t.x * k}
          cy={t.y * k}
          r={tagTapRadius(t, k, zoom)}
          fill="transparent"
          className="cursor-pointer"
          style={{ pointerEvents: "all" }}
          onClick={e => {
            // Overlapping targets (zoomed out): the nearest tag wins, not
            // the circle drawn last (@/lib/noteTagTap `nearestTag`).
            const svg = e.currentTarget.ownerSVGElement;
            const box = svg?.getBoundingClientRect();
            if (!box || box.width === 0 || box.height === 0) return onOpen(i);
            const at = {
              x: (((e.clientX - box.left) / box.width) * width) / k,
              y: (((e.clientY - box.top) / box.height) * height) / k,
            };
            const near = nearestTag(read.tags, at);
            onOpen(near >= 0 ? near : i);
          }}
        />
      ))}
      {open !== null && read.tags[open] && (
        <circle
          cx={read.tags[open].x * k}
          cy={read.tags[open].y * k}
          r={(read.tags[open].r + RING_GAP) * k}
          fill="none"
          stroke="#F5C518"
          strokeWidth={2.4 / Math.max(zoom, 1e-6)}
          className="pointer-events-none"
        />
      )}
    </svg>
  );
}

/**
 * The card a tapped tag opens: "Note 7", the list it is in, and the note's
 * text as printed. Placed beside the tag inside the drawing's box, never on
 * the tag and never over a toolbar or the side panel (`placeNoteCard`); it
 * follows the tag while the sheet moves, and closes when the tag leaves the
 * drawing.
 *
 * Away from it, a press closes it (capture phase, so nothing below can
 * swallow it), and the press still does what it was for. Escape and the ×
 * close it too. Its own presses stop at the card, so a tap on it can never
 * pan or mark the drawing behind.
 */
export function NoteTagCard({
  index,
  list,
  note,
  phone,
  touch,
  onShow,
  onClose,
}: {
  /** The tag's index, to find its target on screen (`data-note-tag`). */
  index: number;
  list: NoteList;
  note: SheetNote;
  phone: boolean;
  touch: boolean;
  /** Take the drawing to the note in its printed list. */
  onShow: () => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const card = cardRef.current;
      if (card && e.target instanceof Node && card.contains(e.target)) return;
      onCloseRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
    };
  }, []);

  useLayoutEffect(() => {
    const rectOf = (selector: string): Rect | null => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const place = () => {
      const card = cardRef.current;
      const tag = rectOf(`[data-note-tag="${index}"]`);
      const drawing = rectOf('[data-plan-tip="drawing"]');
      if (!card || !tag) return onCloseRef.current();
      // The tag has left the drawing (a pan, a zoom): the card goes too.
      const cx = tag.left + tag.width / 2;
      const cy = tag.top + tag.height / 2;
      if (
        drawing &&
        (cx < drawing.left ||
          cx > drawing.left + drawing.width ||
          cy < drawing.top ||
          cy > drawing.top + drawing.height)
      )
        return onCloseRef.current();
      const next = placeNoteCard(
        tag,
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        drawing
      );
      setAt(prev =>
        prev && prev.left === next.left && prev.top === next.top ? prev : next
      );
    };
    place();
    const timer = window.setInterval(place, 200);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", place);
    };
  }, [index]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`Note ${note.label}`}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onWheel={stop}
      className="fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3"
      style={{
        width: phone ? "min(320px, calc(100vw - 32px))" : 320,
        left: at?.left ?? 0,
        top: at?.top ?? 0,
        // Measured once before it is placed; invisible until then.
        visibility: at ? "visible" : "hidden",
      }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-px shrink-0 min-w-6 h-6 px-1 rounded border border-foreground/60 text-xs font-semibold leading-[22px] text-center">
          {note.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Note {note.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {list.heading} · on this sheet
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={
            touch
              ? "-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              : "-m-1 p-1 rounded text-muted-foreground hover:text-foreground"
          }
          aria-label="Close this note"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="mt-2 max-h-[30vh] overflow-y-auto text-sm break-words">
        {note.text}
      </p>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className={touch ? "h-11" : "h-8"}
          onClick={onShow}
        >
          Show it in the notes list
        </Button>
      </div>
    </div>
  );
}
