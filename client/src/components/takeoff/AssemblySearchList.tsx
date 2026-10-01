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
 */
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { smartSearch } from "@/lib/smartSearch";

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
}: {
  assemblies: SearchableAssembly[];
  onPick: (assembly: SearchableAssembly) => void;
  /** Escape in the box. */
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");

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
            if (e.key === "Enter" && results[0]) onPick(results[0]);
          }}
          placeholder="Search assemblies…"
          className="h-7 pl-7 text-xs"
          autoFocus
        />
      </div>
      <div className="max-h-40 overflow-y-auto">
        {results.map(assembly => (
          <button
            key={assembly.id}
            type="button"
            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2"
            onClick={() => onPick(assembly)}
          >
            <Check className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="flex-1 min-w-0 truncate">{assembly.name}</span>
            <span className="text-[0.7rem] text-muted-foreground">
              {assembly.category}
            </span>
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
    </div>
  );
}
