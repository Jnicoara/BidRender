/**
 * RunTypePicker — arm the trace tool with a kind of run.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Tracing used to ask only "conduit or cable", so every run on a sheet was
 * named "Run on Sheet 3", drawn in the same colour as its neighbour, and had
 * its settings entered again one run at a time. D3(a) in
 * references/takeoff-spec.md chose the answer on 2026-09-14 and rejected the
 * alternative by name: choose before tracing, and remember it for the next run
 * — exactly how the mark tool holds a counted group.
 *
 * So a run says what it is by being traced under a TYPE. The type carries the
 * name, the specification and later the colour; the run carries where it is and
 * how long.
 *
 * ── Sticky, because that is the whole point ──────────────────────────────────
 * Arming is a decision made once and spent many times: six identical homeruns
 * is one choice and six traces, not six choices. The caller keeps the armed
 * type per path type, so switching between conduit and cable does not lose
 * either. This component only opens when somebody wants to CHANGE it.
 *
 * ── A type that cannot price yet is offered anyway, and says so ──────────────
 * `needsSpecification` marks a type with no material behind it — the four rows
 * the backfill made from runs that predate the palette, and anything created
 * in a hurry. It is still perfectly good for naming and telling runs apart, so
 * hiding it would remove the thing somebody is mid-way through using. It is
 * labelled instead, the same way an unpriced material shows its $0 rather than
 * being filtered out of the library.
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { smartSearch } from "@/lib/smartSearch";
import { cn } from "@/lib/utils";

export type PickableRunType = {
  id: number;
  label: string;
  pathType: "conduit" | "cable";
  needsSpecification: boolean;
  isShipped: boolean;
  runCount: number;
};

/** Enough to choose from without the list becoming the screen. */
const MAX_RESULTS = 8;

export function RunTypePicker({
  pathType,
  types,
  armedId,
  onPick,
  onCreate,
  disabled,
  children,
}: {
  pathType: "conduit" | "cable";
  types: PickableRunType[];
  armedId: number | null;
  onPick: (type: PickableRunType) => void;
  /** Define one that does not exist yet, from whatever was typed. */
  onCreate: (label: string) => void;
  disabled?: boolean;
  /** The trigger. Given so the caller decides what the button looks like. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const mine = useMemo(
    () => types.filter(t => t.pathType === pathType),
    [types, pathType]
  );

  const searchable = useMemo(
    () => mine.map(t => ({ id: String(t.id), description: t.label })),
    [mine]
  );

  const results = useMemo(() => {
    if (!query.trim()) return mine.slice(0, MAX_RESULTS);
    const hits = smartSearch(searchable, query, MAX_RESULTS);
    const byId = new Map(mine.map(t => [t.id, t]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((t): t is PickableRunType => Boolean(t));
  }, [query, searchable, mine]);

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        // Cleared on close so reopening does not present a stale query as the
        // current filter — same as the mark picker.
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {children ?? (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <ChevronDown className="w-3 h-3" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="text-xs font-medium mb-1">What kind of {pathType} run?</p>
        <p className="text-[0.7rem] text-muted-foreground mb-2">
          Every run you trace takes this until you change it.
        </p>

        <div className="relative mb-1.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                if (results[0]) {
                  onPick(results[0]);
                  setOpen(false);
                } else if (query.trim()) {
                  onCreate(query.trim());
                  setOpen(false);
                }
              }
            }}
            placeholder="Search, or type a new one…"
            className="h-7 pl-7 text-xs"
            autoFocus
          />
        </div>

        <div className="max-h-56 overflow-y-auto">
          {results.map(type => (
            <button
              key={type.id}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-start gap-2"
              onClick={() => {
                onPick(type);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  "w-3 h-3 mt-0.5 shrink-0",
                  type.id === armedId ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{type.label}</span>
                {/*
                  Said where it is chosen, not hidden behind a hover. A type
                  with nothing behind it still counts and still names its runs;
                  what it cannot do is price them, and that is worth knowing
                  before six runs are traced under it.
                */}
                {type.needsSpecification && (
                  <span className="block text-[0.7rem] text-muted-foreground">
                    No materials yet — cannot be priced
                  </span>
                )}
              </span>
              {type.runCount > 0 && (
                <span className="text-[0.7rem] text-muted-foreground shrink-0 tabular-nums">
                  {type.runCount}
                </span>
              )}
            </button>
          ))}

          {results.length === 0 && !query.trim() && (
            <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
              No {pathType} types yet — type a name to make one.
            </p>
          )}
        </div>

        {/*
          Defining one from what was typed, in the same place and the same
          shape as the mark picker's escape hatch. Counting first and pricing
          later is the natural order of the job, and so is tracing first and
          specifying later.
        */}
        {query.trim() && (
          <>
            <div className="h-px bg-border my-1.5" />
            <button
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted"
              onClick={() => {
                onCreate(query.trim());
                setOpen(false);
              }}
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">
                  New {pathType} type “
                  <span className="font-medium">{query.trim()}</span>”
                </span>
              </span>
              <span className="block text-[0.7rem] text-muted-foreground mt-0.5 pl-[1.125rem]">
                Add the materials to it whenever you like
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
