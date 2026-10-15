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
 * - "Tap note tags and detail links" (5c, 5d): ON unless turned off,
 *   because the taps draw nothing. With no tool in hand, a tap on a boxed
 *   number opens that note's text in a card beside it; a tap on a detail
 *   reference ("2/E004") offers Go, and Back returns (`DrawingTaps`,
 *   `NoteTagCard`, `DetailLinkCard`, `DetailBack`).
 *
 * Read on every sheet open in the worker, $0, nothing saved.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
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

/**
 * The switch for the rings, with how many there would be on this sheet:
 * note tags and, since 5d, detail links (`links`).
 */
export function NoteOutlinesSwitch({
  read,
  links = 0,
}: {
  read: SheetNotesRead | null;
  links?: number;
}) {
  const [on, setOn] = useNoteTagOutlines();
  const n = (read?.tags.length ?? 0) + links;
  return (
    <label className="flex items-center gap-2 rounded px-1 min-h-9 text-xs cursor-pointer">
      <span className="flex-1">
        Outline note tags and detail links on the drawing
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
        aria-label="Outline note tags and detail links on the drawing"
      />
    </label>
  );
}

/**
 * The switch for tapping (5c, 5d) — on unless somebody turned it off. One
 * switch for both: they are one habit, "tap what is printed to read it".
 */
export function NoteTapsSwitch() {
  const [on, setOn] = useNoteTagTaps();
  return (
    <label className="flex items-center gap-2 rounded px-1 min-h-9 text-xs cursor-pointer">
      <span className="flex-1">
        Tap note tags and detail links
        <span className="block text-[11px] text-muted-foreground">
          Only with no tool picked up
        </span>
      </span>
      <Switch
        checked={on}
        onCheckedChange={setOn}
        aria-label="Tap note tags and detail links"
      />
    </label>
  );
}

const RING_GAP = TAG_RING_GAP;

/** Something printed on the drawing that a tap explains, page points. */
export type TapSpot = {
  x: number;
  y: number;
  /** The printed shape's half-size; the target is never under 32 px. */
  r: number;
  kind: "note" | "detail";
  /** What a screen reader says: "Note 7: read it". */
  aria: string;
};

const RING_COLOUR: Record<TapSpot["kind"], string> = {
  note: "#D97706",
  detail: "#2563EB",
};

/** The rings — More options, off unless turned on (owner, Q8). */
export function NoteTagLayer({
  width,
  height,
  renderScale,
  spots,
}: {
  width: number;
  height: number;
  renderScale: number;
  spots: readonly TapSpot[];
}) {
  const k = renderScale;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full z-10 pointer-events-none"
      aria-label="Note tags and detail links"
    >
      {spots.map((t, i) => (
        <circle
          key={i}
          cx={t.x * k}
          cy={t.y * k}
          r={(t.r + RING_GAP) * k}
          fill="none"
          stroke={RING_COLOUR[t.kind]}
          strokeWidth={1.6 * k}
        />
      ))}
    </svg>
  );
}

/**
 * The tap targets (5c, 5d) — invisible circles, one per note tag or detail
 * link, at least TAG_TAP_MIN_SCREEN_PX across on screen at any zoom
 * (@/lib/noteTagTap). Mounted ONLY with no tool in hand (TakeoffPage), and
 * placed BEFORE the marks layer, so a mark that sits on one is still the
 * mark's to click.
 *
 * A press is not stopped here: a drag that starts on a target pans the sheet
 * like anywhere else, and the click after a real pan is swallowed
 * (@/lib/dragThreshold `swallowNextClick`), so a pan never opens anything.
 * Only a press that did not move reaches `onClick`.
 */
export function DrawingTaps({
  width,
  height,
  renderScale,
  zoom,
  spots,
  open,
  onOpen,
}: {
  width: number;
  height: number;
  renderScale: number;
  zoom: number;
  spots: readonly TapSpot[];
  /** The spot whose card is open, ringed so the card says which one. */
  open: number | null;
  onOpen: (index: number) => void;
}) {
  const k = renderScale;
  const shown = open !== null ? spots[open] : undefined;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-label="Note tags and detail links you can tap"
    >
      {spots.map((t, i) => (
        <circle
          key={i}
          data-drawing-tap={i}
          role="button"
          aria-label={t.aria}
          cx={t.x * k}
          cy={t.y * k}
          r={tagTapRadius(t, k, zoom)}
          fill="transparent"
          className="cursor-pointer"
          style={{ pointerEvents: "all" }}
          onClick={e => {
            // Overlapping targets (zoomed out): the nearest wins, not the
            // circle drawn last (@/lib/noteTagTap `nearestTag`).
            const svg = e.currentTarget.ownerSVGElement;
            const box = svg?.getBoundingClientRect();
            if (!box || box.width === 0 || box.height === 0) return onOpen(i);
            const at = {
              x: (((e.clientX - box.left) / box.width) * width) / k,
              y: (((e.clientY - box.top) / box.height) * height) / k,
            };
            const near = nearestTag(spots, at);
            onOpen(near >= 0 ? near : i);
          }}
        />
      ))}
      {shown && (
        <circle
          cx={shown.x * k}
          cy={shown.y * k}
          r={(shown.r + RING_GAP) * k}
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
 * The card a tap opens. Placed beside its spot inside the drawing's box,
 * never on the spot and never over a toolbar or the side panel
 * (`placeNoteCard`); it follows the spot while the sheet moves, and closes
 * when the spot leaves the drawing.
 *
 * Away from it, a press closes it (capture phase, so nothing below can
 * swallow it), and the press still does what it was for. Escape and the ×
 * close it too. Its own presses stop at the card, so a tap on it can never
 * pan or mark the drawing behind. One shell for notes and detail links, so
 * the two cannot drift apart (CLAUDE.md, "share the component").
 */
function TapCard({
  index,
  label,
  badge,
  title,
  subtitle,
  phone,
  touch,
  onClose,
  children,
}: {
  /** The spot's index, to find its target on screen (`data-drawing-tap`). */
  index: number;
  label: string;
  badge: string;
  title: string;
  subtitle: string;
  phone: boolean;
  touch: boolean;
  onClose: () => void;
  children: React.ReactNode;
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
      const spot = rectOf(`[data-drawing-tap="${index}"]`);
      const drawing = rectOf('[data-plan-tip="drawing"]');
      if (!card || !spot) return onCloseRef.current();
      // The spot has left the drawing (a pan, a zoom): the card goes too.
      const cx = spot.left + spot.width / 2;
      const cy = spot.top + spot.height / 2;
      if (
        drawing &&
        (cx < drawing.left ||
          cx > drawing.left + drawing.width ||
          cy < drawing.top ||
          cy > drawing.top + drawing.height)
      )
        return onCloseRef.current();
      const next = placeNoteCard(
        spot,
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
      aria-label={label}
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
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {subtitle}
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
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

/** A note tag's card (5c): the note's text as printed. */
export function NoteTagCard({
  index,
  list,
  note,
  phone,
  touch,
  onShow,
  onClose,
}: {
  index: number;
  list: NoteList;
  note: SheetNote;
  phone: boolean;
  touch: boolean;
  /** Take the drawing to the note in its printed list. */
  onShow: () => void;
  onClose: () => void;
}) {
  return (
    <TapCard
      index={index}
      label={`Note ${note.label}`}
      badge={note.label}
      title={`Note ${note.label}`}
      subtitle={`${list.heading} · on this sheet`}
      phone={phone}
      touch={touch}
      onClose={onClose}
    >
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
    </TapCard>
  );
}

/**
 * A detail link's card (5d): where it goes, and Go. A popover rather than a
 * jump on the tap itself (owner, Q2): a jump on touch would fire on every
 * stray tap while panning.
 */
export function DetailLinkCard({
  index,
  label,
  sheetNumber,
  sheetTitle,
  phone,
  touch,
  onGo,
  onClose,
}: {
  index: number;
  label: string;
  sheetNumber: string;
  sheetTitle: string | null;
  phone: boolean;
  touch: boolean;
  onGo: () => void;
  onClose: () => void;
}) {
  return (
    <TapCard
      index={index}
      label={`Detail ${label} on ${sheetNumber}`}
      badge={label}
      title={`Detail ${label} on ${sheetNumber}`}
      subtitle={sheetTitle ?? "Another sheet in this set"}
      phone={phone}
      touch={touch}
      onClose={onClose}
    >
      <p className="mt-2 text-sm text-muted-foreground">
        Opens {sheetNumber} at detail {label}. Back brings you here.
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" className={touch ? "h-11" : "h-8"} onClick={onGo}>
          Go to detail {label}
        </Button>
      </div>
    </TapCard>
  );
}

/**
 * "Back to E121" — after a detail jump, on the drawing's bottom-left. Not
 * the top (plan § 6 said top): the top of the drawing already holds the
 * tool pills, the Find / Check panels and the panel fold buttons, and a
 * control over a control is one nobody can use. One level only: a second
 * jump replaces it. Presses stop here, so it can never pan the sheet.
 */
export function DetailBack({
  sheetLabel,
  note,
  touch,
  onBack,
  onDismiss,
}: {
  sheetLabel: string;
  /** "Detail 3 is on this sheet — not located", when Go could not zoom. */
  note: string | null;
  touch: boolean;
  onBack: () => void;
  onDismiss: () => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onWheel={stop}
      className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] flex flex-col items-start gap-1.5"
    >
      {note && (
        <p
          role="status"
          className="rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-xs shadow"
        >
          {note}
        </p>
      )}
      <div className="flex items-center rounded-full border border-[#F5C518]/60 bg-card/95 shadow-lg">
        <button
          type="button"
          onClick={onBack}
          className={
            touch
              ? "flex h-11 items-center gap-1.5 pl-3 pr-2 text-sm font-medium"
              : "flex h-8 items-center gap-1.5 pl-3 pr-2 text-sm font-medium"
          }
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {sheetLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Stay here"
          className={
            touch
              ? "flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              : "flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
          }
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
