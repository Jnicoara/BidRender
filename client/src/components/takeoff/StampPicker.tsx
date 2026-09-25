/**
 * StampPicker — arm the stamp tool by choosing an assembly.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The stamp tool could only be armed from a captured legend symbol that had
 * already been linked to an assembly. On a set whose legend has not been
 * captured — which is every set, the first time — there was no way to stamp
 * anything at all. Combined with tracing being hidden on an unscaled sheet, the
 * screen offered the user nothing to do.
 *
 * Legend capture stays, and stays the fast path: a symbol you counted last job
 * is one click this job, on this job and every job after it. It just stops
 * being the only door.
 *
 * ── Level 1 lives here too, from phase 6 ─────────────────────────────────────
 * Type something your library does not have and the list offers to count it
 * anyway: a tally with a name and no price. That is deliberately the SAME
 * control rather than a second button beside it, because the question a person
 * arrives with is "what am I counting?", not "is this thing in my library?" —
 * and the answer to the second one is the app's problem, not theirs.
 *
 * It is offered whenever the box has text in it, not only when nothing matches.
 * A query that matches something similar is exactly when a person needs to say
 * "no, not that, the other one" — hiding the escape at that moment would make
 * the feature findable only by typing a word with no neighbours in the library.
 *
 * What lands is a `takeoff_groups` row of kind `plain` — a free count. Since
 * 2026-09-25 it can be sent to the bid like any count, arriving with NO price
 * and NO hours, which are typed on the bid line (shared/handPricedLines.ts).
 * Until it is sent it is a tally, and nothing about the bid moves.
 *
 * Ranking is `smartSearch`, the same as the Assembly Builder and the legend, so
 * the same query finds the same assembly wherever it is typed.
 */
import { useMemo, useState } from "react";
import { Hash, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { smartSearch } from "@/lib/smartSearch";

export type PickableAssembly = {
  id: number;
  name: string;
  category: string | null;
};

/** How many to show before asking for a narrower query. */
const MAX_RESULTS = 8;

export function StampPicker({
  assemblies,
  onPick,
  onCountPlain,
  disabled,
}: {
  assemblies: PickableAssembly[];
  onPick: (assembly: PickableAssembly) => void;
  /** Count something the library does not have — level 1. See the header. */
  onCountPlain: (label: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const searchable = useMemo(
    () =>
      assemblies.map(a => ({
        id: String(a.id),
        description: a.name,
        category: a.category,
      })),
    [assemblies]
  );

  const results = useMemo(() => {
    if (!query.trim()) return assemblies.slice(0, MAX_RESULTS);
    const hits = smartSearch(searchable, query, MAX_RESULTS);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((a): a is PickableAssembly => Boolean(a));
  }, [query, searchable, assemblies]);

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        // Cleared on close so reopening does not present a stale query as if it
        // were the current filter.
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled}
          title="Count things by clicking them on the drawing"
        >
          {/*
            "Count", not "Mark". Renamed 2026-09-24: an estimator counts
            devices; "mark" is what the app calls the dot it leaves behind,
            which is our word for our artefact rather than theirs for the job.
            The popover has always asked "What are you counting?", so the
            button was the odd one out.
          */}
          <MapPin className="w-3.5 h-3.5" /> Count
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="text-xs font-medium mb-1">What are you counting?</p>
        <p className="text-[0.7rem] text-muted-foreground mb-2">
          Every click drops one. No scale needed — counting is not measuring.
        </p>
        <div className="relative mb-1.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") setOpen(false);
              /*
                Enter takes the top hit, which is the whole point of ranking
                them — and when there is no hit it counts what was typed, so a
                name the library has never heard of is still one keystroke from
                being counted.
              */
              if (e.key === "Enter") {
                if (results[0]) {
                  onPick(results[0]);
                  setOpen(false);
                } else if (query.trim()) {
                  onCountPlain(query.trim());
                  setOpen(false);
                }
              }
            }}
            placeholder="Search, or type anything to count it…"
            className="h-7 pl-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {results.map(assembly => (
            <button
              key={assembly.id}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2"
              onClick={() => {
                onPick(assembly);
                setOpen(false);
              }}
            >
              <span className="flex-1 min-w-0 truncate">{assembly.name}</span>
              {assembly.category && (
                <span className="text-[0.7rem] text-muted-foreground shrink-0">
                  {assembly.category}
                </span>
              )}
            </button>
          ))}
          {results.length === 0 && !query.trim() && (
            <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
              Your library has no assemblies yet — type a name to count
              something anyway.
            </p>
          )}
        </div>

        {/*
          The escape hatch, below a divider and worded as what it does rather
          than as what it lacks. Where the price comes from is said while the
          count is being made, because it is different from every row above:
          those bring a price with them, and this one gets it typed on the bid.
          (Until 2026-09-25 this read "not on the bid", which stopped being
          true when free counts became sendable.)
        */}
        {query.trim() && (
          <>
            <div className="h-px bg-border my-1.5" />
            <button
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted"
              onClick={() => {
                onCountPlain(query.trim());
                setOpen(false);
              }}
            >
              <span className="flex items-center gap-1.5">
                <Hash className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">
                  Count “<span className="font-medium">{query.trim()}</span>”
                </span>
              </span>
              <span className="block text-[0.7rem] text-muted-foreground mt-0.5 pl-[1.125rem]">
                No library item needed — price it on the bid
              </span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
