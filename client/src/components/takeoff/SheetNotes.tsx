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
 * Read on every sheet open in the worker, $0, nothing saved. Tapping a tag
 * on the drawing to read its note is the next step (5c), not this one.
 */
import type { SheetNotesRead } from "@/lib/keyedNotes";
import { useNoteTagOutlines } from "@/lib/planHelpPrefs";
import { Switch } from "@/components/ui/switch";

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

/** Page points between the tag's own shape and the ring drawn round it. */
const RING_GAP = 2.5;

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
