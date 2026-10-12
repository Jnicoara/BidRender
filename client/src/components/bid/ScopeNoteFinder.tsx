/**
 * THE NOTE FINDER — "who does this" notes on the drawings, and the lines
 * they are about (scope-tags-plan.md step 7).
 *
 * Plain text, no AI: `bidPdfs.scopePhrases` reads the page text stored at
 * upload. Each note shows its sheet(s), its sentence, "Go to" (the Plans
 * screen at that sheet) and "Tag matching lines": a tick list of the lines
 * sharing a word with the sentence, NOTHING ticked by default, the tag
 * starting on what the phrase suggests. Applying is the line menu's own call
 * (`useSetLineScope`), so it carries the same Undo, the same refusals and
 * the same refresh — one path, not a second one that drifts.
 *
 * A locked bid lists the notes and offers no tagging: its numbers must not
 * move (owner Q1).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { planAddressHash } from "@/lib/planAddress";
import { useSetLineScope } from "@/hooks/useSetLineScope";
import {
  scopeChoicesFor,
  scopeLabel,
  scopeOf,
  LINE_SCOPES,
  type LineScope,
} from "@shared/lineScope";
import { linesSharingAWord } from "@shared/scopePhrases";

export type FinderLine = {
  id: number;
  name: string;
  unitLabel: string | null;
  lineRole: string | null;
  scopeTag: LineScope | null;
};

type Note = {
  phrase: string;
  suggests: LineScope;
  sentence: string;
  sheets: {
    bidPdfId: number;
    pageNumber: number;
    number: string | null;
    title: string;
  }[];
};

export function ScopeNoteFinder({
  bidId,
  lines,
  locked,
  refresh,
}: {
  bidId: number;
  lines: readonly FinderLine[];
  locked: boolean;
  refresh: () => void;
}) {
  const found = trpc.bidPdfs.scopePhrases.useQuery({ bidId });

  if (found.isLoading)
    return (
      <p className="text-sm text-muted-foreground">Reading the drawings…</p>
    );
  if (found.error)
    return <p className="text-sm text-red-500">{found.error.message}</p>;
  const { notes, truncated, notSearched } = found.data!;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {notes.length === 0
          ? "No “by others”, “N.I.C.” or “owner furnished” notes found on the drawings."
          : `${notes.length} note${notes.length === 1 ? "" : "s"} on the drawings say who does something.`}
        {notSearched > 0 &&
          ` ${notSearched} sheet${notSearched === 1 ? " has" : "s have"} no text to read and ${
            notSearched === 1 ? "was" : "were"
          } not searched.`}
        {truncated && " Only the first 300 sheets with a match are listed."}
        {locked &&
          notes.length > 0 &&
          " The bid is locked; unlock it to tag lines from a note."}
      </p>
      {notes.map(note => (
        <NoteRow
          key={`${note.phrase}|${note.sentence}`}
          bidId={bidId}
          note={note}
          lines={lines}
          locked={locked}
          refresh={refresh}
        />
      ))}
    </div>
  );
}

function sheetName(sheet: Note["sheets"][number]): string {
  return sheet.number ? `${sheet.number} ${sheet.title}` : sheet.title;
}

function NoteRow({
  bidId,
  note,
  lines,
  locked,
  refresh,
}: {
  bidId: number;
  note: Note;
  lines: readonly FinderLine[];
  locked: boolean;
  refresh: () => void;
}) {
  const [tagging, setTagging] = useState(false);
  const first = note.sheets[0];
  return (
    <div className="rounded-lg border border-border px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="rounded-full border border-border px-2 py-0.5 text-foreground">
          {note.phrase}
        </span>
        <span className="truncate min-w-0">
          {sheetName(first)}
          {note.sheets.length > 1 &&
            ` and ${note.sheets.length - 1} more sheet${note.sheets.length === 2 ? "" : "s"}`}
        </span>
      </div>
      <p className="text-sm leading-snug break-words">{note.sentence}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="h-8">
          <a href={planAddressHash(bidId, first.bidPdfId, first.pageNumber)}>
            Go to {first.number ?? `sheet ${first.pageNumber}`}
          </a>
        </Button>
        {!locked && (
          <Button
            size="sm"
            variant={tagging ? "secondary" : "outline"}
            className="h-8"
            aria-expanded={tagging}
            onClick={() => setTagging(v => !v)}
          >
            Tag matching lines
          </Button>
        )}
      </div>
      {tagging && !locked && (
        <TagLines
          bidId={bidId}
          note={note}
          lines={lines}
          refresh={refresh}
          onDone={() => setTagging(false)}
        />
      )}
    </div>
  );
}

function TagLines({
  bidId,
  note,
  lines,
  refresh,
  onDone,
}: {
  bidId: number;
  note: Note;
  lines: readonly FinderLine[];
  refresh: () => void;
  onDone: () => void;
}) {
  const [tag, setTag] = useState<LineScope>(note.suggests);
  const [everyLine, setEveryLine] = useState(false);
  // Nothing ticked by default: a suggestion is not an answer.
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const setScope = useSetLineScope(bidId, refresh);

  const suggested = linesSharingAWord(note.sentence, lines);
  const shown = everyLine ? lines : suggested;
  const allowed = (line: FinderLine) => scopeChoicesFor(line).includes(tag);
  const chosen = shown.filter(l => ticked.has(l.id) && allowed(l));

  return (
    <div className="rounded-md bg-muted/30 px-3 py-2.5 space-y-2.5">
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Mark them"
      >
        {LINE_SCOPES.map(scope => (
          <button
            key={scope}
            type="button"
            role="radio"
            aria-checked={tag === scope}
            onClick={() => setTag(scope)}
            className={cn(
              "rounded-full border px-2.5 py-1 min-h-8 text-xs",
              tag === scope
                ? "border-[#F5C518]/60 bg-[#F5C518]/15 text-foreground font-medium"
                : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            {scopeLabel(scope)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No line on the bid shares a word with this note.
        </p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {shown.map(line => {
            const ok = allowed(line);
            return (
              <li key={line.id}>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm min-h-8",
                    !ok && "opacity-50"
                  )}
                >
                  <Checkbox
                    checked={ticked.has(line.id) && ok}
                    disabled={!ok}
                    onCheckedChange={value => {
                      const next = new Set(ticked);
                      if (value === true) next.add(line.id);
                      else next.delete(line.id);
                      setTicked(next);
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {line.name}
                    {line.unitLabel && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {line.unitLabel}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ok
                      ? scopeOf(line) === "install"
                        ? ""
                        : scopeLabel(scopeOf(line))
                      : "not on a remove line"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-8"
          disabled={chosen.length === 0 || setScope.isPending}
          onClick={() =>
            setScope.mutate(
              { bidId, lineIds: chosen.map(l => l.id), scopeTag: tag },
              { onSuccess: onDone }
            )
          }
        >
          {chosen.length === 0
            ? "Tick the lines this note is about"
            : `Mark ${chosen.length} line${chosen.length === 1 ? "" : "s"} ${scopeLabel(tag)}`}
        </Button>
        {!everyLine && lines.length > suggested.length && (
          <button
            type="button"
            className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground min-h-8 px-1"
            onClick={() => setEveryLine(true)}
          >
            Show every line
          </button>
        )}
      </div>
    </div>
  );
}
