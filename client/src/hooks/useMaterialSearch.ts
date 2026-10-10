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
import {
  materialSearchIndex,
  searchMaterials,
  type MaterialSearchResult,
  type SearchableCatalogRow,
} from "@/lib/materialSearch";
import type { MaterialUsage } from "@shared/materialCommonness";

// The pipeline lives in @/lib/materialSearch so the suite can run it.
export type { MaterialSearchResult, SearchableCatalogRow };

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

  const index = useMemo(() => materialSearchIndex(rows), [rows]);

  return useCallback(
    (query: string, depth: number): MaterialSearchResult<T> =>
      searchMaterials(index, query, depth, usage, now),
    [index, usage, now]
  );
}
