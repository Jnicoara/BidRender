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
 * ── What this is NOT ─────────────────────────────────────────────────────────
 * This is still a priced assembly on every stamp. It is not level-1 counting —
 * dropping plain points that carry no assembly and no price — which needs
 * `takeoff_stamps.assemblyName` to stop being required AND the group concept,
 * so a count made today can have an assembly attached next week with every
 * click intact. That is Phase 6 in references/plan-viewer-overhaul.md, and it
 * must not be faked early by making a column nullable.
 *
 * Ranking is `smartSearch`, the same as the Assembly Builder and the legend, so
 * the same query finds the same assembly wherever it is typed.
 */
import { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
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
  disabled,
}: {
  assemblies: PickableAssembly[];
  onPick: (assembly: PickableAssembly) => void;
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
          title={
            disabled
              ? "No assemblies in your library yet — build one first"
              : "Count devices by clicking them on the drawing"
          }
        >
          <MapPin className="w-3.5 h-3.5" /> Stamp
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
              // Enter takes the top hit — the whole point of ranking them.
              if (e.key === "Enter" && results[0]) {
                onPick(results[0]);
                setOpen(false);
              }
            }}
            placeholder="Search assemblies…"
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
          {results.length === 0 && (
            <p className="text-[0.7rem] text-muted-foreground px-2 py-2">
              {assemblies.length === 0
                ? "Your library has no assemblies yet."
                : `Nothing matches “${query}”.`}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
