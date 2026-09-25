/**
 * Search the material catalog the one way every material search box does it.
 *
 * ── Why a hook, when the three screens each had their own few lines ─────────
 * The Materials screen, the supplier-pricing view and the material picker each
 * assembled the search themselves, and they disagreed: two ranked by role, one
 * by relevance alone, and ties fell to whatever order each happened to hold its
 * rows in. CLAUDE.md is explicit that one catalog listed two ways is a bug, so
 * the fetching, the index and the ranking live here, and each screen only
 * decides what to do with the result.
 *
 * Ranking itself is shared/materialSearchRank.ts (rankMaterialHits), which is
 * also what scripts/searchSpotCheck.mts calls — so the sweep measures what the
 * screen shows.
 *
 * ── Usage is this company's, and it is only a tiebreak ──────────────────────
 * materials.usage counts how many of THIS company's bids each material is on.
 * It feeds commonnessPoints, which only settles rows that already match the
 * query equally well. A query that names a rare part still finds it first.
 */
import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { smartSearchCorrected } from "@/lib/smartSearch";
import { familySizes, rankMaterialHits } from "@shared/materialSearchRank";
import {
  commonnessPoints,
  type MaterialUsage,
} from "@shared/materialCommonness";

export type SearchableCatalogRow = {
  id: number;
  name: string;
  category?: string | null;
  searchAliases?: string | null;
};

/** What a search found, and what it searched for if it corrected a typo. */
export type MaterialSearchResult<T> = {
  rows: T[];
  /**
   * The corrected query ("receptacle" for "recepticle") when these rows came
   * from a typo correction, else null. Every screen that shows results says
   * so with <SearchCorrectionNote> — a search that quietly answers a
   * different question from the one typed is how a wrong part gets picked.
   */
  correctedQuery: string | null;
};

/**
 * Returns `search(query, depth)`, which gives the rows matching `query`, best
 * first. `depth` is how many scored hits to rank before the caller trims; see
 * MaterialPicker for why it has to be generous.
 *
 * Typo-tolerant, through smartSearchCorrected: a word that matches nothing is
 * corrected against the catalog's own words, including this company's own
 * rows, and the corrected query is what gets RANKED — so "recepticle" orders
 * its results exactly as "receptacle" would.
 *
 * `rows` must be memoised by the caller: the search index is rebuilt whenever
 * its identity changes.
 */
export function useMaterialSearch<T extends SearchableCatalogRow>(
  rows: T[]
): (query: string, depth: number) => MaterialSearchResult<T> {
  const { data: usageRows } = trpc.materials.usage.useQuery(undefined, {
    // Usage moves when bids change, on other screens; a minute of staleness
    // in a tiebreak is invisible, and refetching on every mount is not free.
    staleTime: 60_000,
  });

  const usage = useMemo(() => {
    const map = new Map<number, MaterialUsage>();
    for (const u of usageRows ?? []) {
      map.set(u.materialId, { bids: u.bids, lastUsedAt: u.lastUsedAt });
    }
    return map;
  }, [usageRows]);

  // One clock reading per usage fetch: "used in the last 30 days" does not
  // need to be re-decided on every keystroke.
  const now = useMemo(() => new Date(), [usageRows]);

  const searchable = useMemo(
    () =>
      rows.map(r => ({
        id: String(r.id),
        description: r.name,
        searchAliases: r.searchAliases ?? null,
      })),
    [rows]
  );
  const byId = useMemo(() => new Map(rows.map(r => [String(r.id), r])), [rows]);
  const families = useMemo(() => familySizes(rows), [rows]);

  return useCallback(
    (query: string, depth: number): MaterialSearchResult<T> => {
      if (!query.trim()) return { rows: [], correctedQuery: null };
      const { results, correctedQuery } = smartSearchCorrected(
        searchable,
        query,
        depth
      );
      const hits = results
        .map(hit => ({ row: byId.get(hit.item.id), score: hit.score }))
        .filter((h): h is { row: T; score: number } => Boolean(h.row));
      return {
        rows: rankMaterialHits(hits, correctedQuery ?? query, {
          families,
          commonness: row => commonnessPoints(row.name, usage.get(row.id), now),
        }),
        correctedQuery,
      };
    },
    [searchable, byId, families, usage, now]
  );
}
