/**
 * Includes and excludes, laid out the way the proposal prints them.
 *
 * ── The editor now matches its own output ────────────────────────────────────
 * This was one flat list in the order lines were typed, every row carrying an
 * `Incl` / `Excl` label so you could tell which kind it was. The document has
 * always done it properly: `ProposalSheet` renders "Included" and "Not
 * included" as two columns, and its own comment says why — stacking them "turns
 * that comparison into scrolling". The editor never followed, so an estimator
 * arranged the scope in one shape and the client read it in another.
 *
 * Two columns is not just shorter. It removes controls, because position now
 * carries the meaning the label used to:
 *
 *   • the per-row Incl/Excl badge is gone — the column it sits in says it;
 *   • the kind dropdown on the add row is gone — you type into the column you
 *     mean, so adding a line went from three controls to one.
 *
 * ── Shut by default ──────────────────────────────────────────────────────────
 * The same treatment `CloseoutPanel` gets, for the reason its comment gives: an
 * open form on every bid implies work that is expected. Scope lines are written
 * once, usually near the end. The header carries the counts, so a shut panel
 * still answers "did I do this?" — the only question worth asking it from the
 * outside.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BookmarkPlus, ChevronDown, ChevronRight, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { partitionScopeNotes } from "@shared/bidExtras";
import { errorText } from "@/lib/errorText";

type ScopeKind = "include" | "exclude";

/** Radix Select cannot hold an empty value, so "pick nothing" needs a token. */
const PICK_NONE = "__none__";

export function ScopeNotesPanel({ bidId }: { bidId: number }) {
  const utils = trpc.useUtils();
  const savedNotes = trpc.bidExtras.scope.list.useQuery();
  const onBidNotes = trpc.bidExtras.scope.onBid.useQuery({ bidId });

  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<ScopeKind, string>>({
    include: "",
    exclude: "",
  });

  const refresh = () => {
    void utils.bidExtras.scope.onBid.invalidate({ bidId });
    void utils.bidExtras.scope.list.invalidate();
    // The document prints these, so it changes when they do.
    void utils.proposals.document.invalidate({ bidId });
  };

  const onError = (e: { message: string }) => toast.error(errorText(e));

  const addNote = trpc.bidExtras.scope.addToBid.useMutation({
    onError,
    onSettled: refresh,
  });
  const removeNote = trpc.bidExtras.scope.removeFromBid.useMutation({
    onError,
    onSettled: refresh,
  });
  const saveNote = trpc.bidExtras.scope.saveToLibrary.useMutation({
    onSuccess: r =>
      toast.success(
        r.alreadySaved ? "Already on your list." : "Saved to your list."
      ),
    onError,
    onSettled: refresh,
  });

  const notes = useMemo(() => onBidNotes.data ?? [], [onBidNotes.data]);
  // The same split the document uses. One rule, so the editor and the printed
  // page cannot disagree about which side a line is on.
  const { includes, excludes } = useMemo(
    () => partitionScopeNotes(notes),
    [notes]
  );

  const submit = (kind: ScopeKind) => {
    const text = drafts[kind].trim();
    if (!text) return;
    addNote.mutate({ bidId, kind, text });
    setDrafts(d => ({ ...d, [kind]: "" }));
  };

  /** Saved lines for this column that are not already on the bid. */
  const savedFor = (kind: ScopeKind) =>
    (savedNotes.data ?? []).filter(
      note =>
        note.kind === kind && !notes.some(row => row.scopeNoteId === note.id)
    );

  /**
   * A column, as a plain function returning JSX — NOT a nested component.
   *
   * Declaring this as `const Column = (...) => ...` and rendering `<Column />`
   * creates a brand-new component TYPE on every render of this panel, so React
   * unmounts and remounts the whole subtree each time state changes. The input
   * below is that subtree: typing one character re-rendered the panel, replaced
   * the input node, and dropped focus — so only the first keystroke ever landed
   * and Enter never reached the field at all.
   *
   * Called as a function, the JSX is inlined into this component's tree and
   * there is no remount. Keep it this way.
   */
  const renderColumn = (kind: ScopeKind, label: string, rows: typeof notes) => {
    const saved = savedFor(kind);
    return (
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              kind === "exclude" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {label}
          </span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {rows.length}
            </span>
          )}
        </div>

        {rows.map(row => (
          <div key={row.id} className="flex items-start gap-1 group text-sm">
            <span className="flex-1 min-w-0 break-words">{row.text}</span>
            {/* Only a one-off can be saved — a line that came FROM the list has
                nowhere to go. */}
            {row.scopeNoteId === null && (
              <button
                className="shrink-0 p-0.5 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                onClick={() => saveNote.mutate({ bidId, id: row.id })}
                aria-label={`Save "${row.text}" to my list`}
                title="Save to my list for next time"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              className="shrink-0 p-0.5 rounded text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive hover:bg-muted transition-all"
              onClick={() => removeNote.mutate({ bidId, id: row.id })}
              aria-label={`Remove "${row.text}"`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* One field, and no kind picker: the column you type in IS the kind.
            Commits on Enter and on blur, so a line typed and clicked away from
            is not silently thrown out. */}
        <Input
          value={drafts[kind]}
          onChange={e => setDrafts(d => ({ ...d, [kind]: e.target.value }))}
          onKeyDown={e => {
            if (e.key === "Enter") submit(kind);
            if (e.key === "Escape") setDrafts(d => ({ ...d, [kind]: "" }));
          }}
          onBlur={() => submit(kind)}
          className="h-8 text-sm"
          placeholder={
            kind === "exclude" ? "Add — e.g. Permits" : "Add — e.g. Rough-in"
          }
          aria-label={`Add a line to ${label}`}
        />

        {saved.length > 0 && (
          <Select
            value={PICK_NONE}
            onValueChange={value => {
              if (value === PICK_NONE) return;
              addNote.mutate({ bidId, noteId: Number(value) });
            }}
          >
            <SelectTrigger
              className="h-7 text-xs text-muted-foreground"
              aria-label={`Add a saved line to ${label}`}
            >
              <SelectValue placeholder="From your list…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PICK_NONE}>From your list…</SelectItem>
              {saved.map(note => (
                <SelectItem key={note.id} value={String(note.id)}>
                  {note.text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">
            Includes &amp; excludes
          </span>
          <span className="block text-xs text-muted-foreground truncate">
            {notes.length === 0
              ? "Printed on the proposal. Excludes are what settle the argument later."
              : `${includes.length} included · ${excludes.length} excluded`}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {/* The two columns the proposal prints, in the same order and under
              the same headings, so what you arrange here is what a client
              reads. */}
          <div className="grid grid-cols-2 gap-4">
            {renderColumn("include", "Included", includes)}
            {renderColumn("exclude", "Not included", excludes)}
          </div>
        </div>
      )}
    </div>
  );
}
