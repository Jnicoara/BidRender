/**
 * AssemblySearchList — a search box and the assemblies it finds, for "which
 * assembly is this?".
 *
 * ONE component for both places that ask it: a legend symbol's one-time link
 * (LegendPanel) and a count's "Link assembly" (RunsPanel, legend plan § 8a).
 * The two were about to be one copy apiece, and two copies of a search rank
 * the same query differently on two screens — CLAUDE.md § "Copying a layout
 * does not copy the behaviour with it".
 *
 * Ranking is `smartSearch`, the same as the Assembly Builder and the stamp
 * picker, so a query finds the same assembly wherever it is typed.
 *
 * A search that finds nothing offers "Build it from parts here" when the
 * host passes `buildBidId` (todo.md § "When the picker finds nothing",
 * 2026-10-09): the built assembly is picked exactly as if it had been found,
 * so linking it is the same path as linking any other.
 */
import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BuildFromPartsPanel } from "@/components/BuildFromPartsPanel";
import { smartSearch } from "@/lib/smartSearch";
import { useNoMatchLog } from "@/hooks/useNoMatchLog";

export type SearchableAssembly = {
  id: number;
  name: string;
  category: string | null;
};

const MAX_RESULTS = 8;

export function AssemblySearchList({
  assemblies,
  onPick,
  onCancel,
  buildBidId,
}: {
  assemblies: SearchableAssembly[];
  onPick: (assembly: SearchableAssembly) => void;
  /** Escape in the box. */
  onCancel: () => void;
  /** The bid, to offer "Build it from parts here" on a miss. */
  buildBidId?: number;
}) {
  const [query, setQuery] = useState("");
  /** The builder, open on the words it was opened from. */
  const [buildingFrom, setBuildingFrom] = useState<string | null>(null);

  const searchable = useMemo(
    () =>
      assemblies.map(a => ({
        id: String(a.id),
        description: a.name,
        category: a.category ?? "",
      })),
    [assemblies]
  );

  const results = useMemo(() => {
    if (!query.trim()) return assemblies.slice(0, MAX_RESULTS);
    const hits = smartSearch(searchable, query, MAX_RESULTS);
    const byId = new Map(assemblies.map(a => [a.id, a]));
    return hits
      .map(hit => byId.get(Number(hit.id)))
      .filter((a): a is SearchableAssembly => Boolean(a));
  }, [query, searchable, assemblies]);

  // A search that settles on nothing goes in the no-match log. An empty list
  // is a library still loading (or none at all), not a miss.
  const recordMiss = useNoMatchLog(
    "assembly",
    query,
    results.length,
    assemblies.length > 0
  );

  if (buildingFrom !== null && buildBidId !== undefined)
    return (
      <BuildFromPartsPanel
        bidId={buildBidId}
        query={buildingFrom}
        target={{ kind: "count", action: "Save and link" }}
        onCancel={() => setBuildingFrom(null)}
        onBuilt={built =>
          onPick({
            id: built.assemblyId,
            name: built.name,
            category: built.category,
          })
        }
      />
    );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Escape") onCancel();
            // Enter takes the top hit, so a typed name is one keystroke away.
            if (e.key === "Enter") {
              if (results[0]) onPick(results[0]);
              // Enter on nothing found is a finished search: logged now.
              else recordMiss();
            }
          }}
          placeholder="Search assemblies…"
          className="h-7 pl-7 text-xs"
          autoFocus
        />
      </div>
      {/* At most MAX_RESULTS rows, so no scroll box of its own — it sits
          inside the panel's one scroll area. */}
      <div>
        {results.map(assembly => (
          <button
            key={assembly.id}
            type="button"
            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2"
            onClick={() => onPick(assembly)}
          >
            <Check className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0 truncate">{assembly.name}</span>
            <span className="text-xs text-muted-foreground">
              {assembly.category}
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-2">
            {assemblies.length === 0 && !query.trim()
              ? "Your library has no assemblies yet."
              : `Nothing matches “${query.trim()}”.`}
          </p>
        )}
        {results.length === 0 && query.trim() && buildBidId !== undefined ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-full text-xs"
            onClick={() => {
              recordMiss();
              setBuildingFrom(query);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Build it from parts here
          </Button>
        ) : null}
      </div>
    </div>
  );
}
