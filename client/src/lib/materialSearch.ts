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
import { renamedTo } from "@shared/renamedMaterials";
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
  /** Lower-cased name → row, for an old name's rescue (see searchMaterials). */
  byName: Map<string, T>;
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
    byName: new Map(rows.map(r => [r.name.toLowerCase(), r])),
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
  /*
    AN OLD NAME FINDS ITS ROW even when the matcher cannot (todo.md, "5/6"
    wafer LED downlight (the old spelling) reads as a fraction"; plan
    track-c-next-batch § S2). The matcher needs every term to match, and
    `5/6"` reads as a size no row has, so the renamed row never reached the
    ranker — which already ranks a former name first (`phraseTier`). Here it
    is let in, at the best score present, and the ranker does the rest.
  */
  const formerOf = renamedTo(query);
  const rescued = formerOf ? index.byName.get(formerOf.toLowerCase()) : null;
  if (rescued && !hits.some(h => h.row === rescued))
    hits.push({
      row: rescued,
      score: hits.reduce((best, h) => Math.max(best, h.score), 1),
    });
  return {
    rows: rankMaterialHits(hits, searchedQuery, {
      families: index.families,
      commonness: row => commonnessPoints(row.name, usage.get(row.id), now),
    }),
    correctedQuery,
  };
}
