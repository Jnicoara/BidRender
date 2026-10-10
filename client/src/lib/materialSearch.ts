/**
 * The material search pipeline every search box runs — moved out of the
 * `useMaterialSearch` hook on 2026-10-09 so the suite can run the SAME steps
 * the screen runs (client/src/lib/everydaySearches.test.ts). A test that
 * assembled its own copy of the pipeline would be measuring a search nobody
 * sees; CLAUDE.md: a rule with no red to go to is an instruction.
 *
 *   1. smartSearchCorrected — match and score, correcting a typo;
 *   2. rankMaterialHits     — phrase, tier, specialty, role, family, score,
 *                             then commonness (starter rank + this company's
 *                             usage) to settle ties.
 */
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
  isSpecialty?: boolean | null;
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

/** The per-catalog work, done once per list of rows. */
export type MaterialSearchIndex<T extends SearchableCatalogRow> = {
  searchable: {
    id: string;
    description: string;
    searchAliases: string | null;
  }[];
  byId: Map<string, T>;
  families: Map<string, number>;
};

/**
 * Build the index for one list of rows. smartSearch caches its own index by
 * the IDENTITY of `searchable`, so keep the result for as long as the rows
 * are unchanged (the hook memoises it).
 */
export function materialSearchIndex<T extends SearchableCatalogRow>(
  rows: readonly T[]
): MaterialSearchIndex<T> {
  return {
    searchable: rows.map(r => ({
      id: String(r.id),
      description: r.name,
      searchAliases: r.searchAliases ?? null,
    })),
    byId: new Map(rows.map(r => [String(r.id), r])),
    families: familySizes(rows),
  };
}

/** The rows matching `query`, best first, `depth` of them ranked. */
export function searchMaterials<T extends SearchableCatalogRow>(
  index: MaterialSearchIndex<T>,
  query: string,
  depth: number,
  usage: ReadonlyMap<number, MaterialUsage>,
  now: Date
): MaterialSearchResult<T> {
  if (!query.trim()) return { rows: [], correctedQuery: null };
  const { results, correctedQuery, searchedQuery } = smartSearchCorrected(
    index.searchable,
    query,
    depth
  );
  const hits = results
    .map(hit => ({ row: index.byId.get(hit.item.id), score: hit.score }))
    .filter((h): h is { row: T; score: number } => Boolean(h.row));
  return {
    rows: rankMaterialHits(hits, searchedQuery, {
      families: index.families,
      commonness: row => commonnessPoints(row.name, usage.get(row.id), now),
    }),
    correctedQuery,
  };
}
