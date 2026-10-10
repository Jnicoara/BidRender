/**
 * Search a list of assemblies by name with the app's shared ranking —
 * `smartSearch`, the same trade-slang search the bid screen, the counting
 * screen and the plan viewer's pickers use, so "recep" finds "Duplex
 * receptacle standard" wherever an assembly is picked.
 *
 * Written for the hand-priced line's "Link to … assembly" search
 * (2026-10-09), which was a bare `includes` on the name: there "recep" found
 * nothing, so a miss logged from it (shared/searchMiss.ts) could be something
 * the library has. todo.md § "When the picker finds nothing".
 */
import { smartSearch, type SearchableItem } from "@/lib/smartSearch";

export interface NamedAssembly {
  id: number;
  name: string;
  category?: string | null;
}

/*
  smartSearch caches its index by array IDENTITY, so the searchable copy has
  to be the same array for the same list. Keyed on the list itself, so a new
  list from the server gets a new index and an unchanged one reuses it.
*/
const searchableFor = new WeakMap<readonly NamedAssembly[], SearchableItem[]>();

/** The best `max` matches, best first. An empty query lists the first `max`. */
export function searchAssemblies<A extends NamedAssembly>(
  assemblies: readonly A[],
  query: string,
  max: number
): A[] {
  if (!query.trim()) return assemblies.slice(0, max);
  let searchable = searchableFor.get(assemblies);
  if (!searchable) {
    searchable = assemblies.map(a => ({
      id: String(a.id),
      description: a.name,
      category: a.category ?? "",
    }));
    searchableFor.set(assemblies, searchable);
  }
  const byId = new Map(assemblies.map(a => [a.id, a]));
  return smartSearch(searchable, query, max)
    .map(hit => byId.get(Number(hit.id)))
    .filter((a): a is A => a !== undefined);
}
