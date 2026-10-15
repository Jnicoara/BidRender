/**
 * Whether a React Query key is the bid step bar's (`bids.progress`), which
 * main.tsx lets go after every successful mutation. Here rather than inline so
 * the suite can check the key shape tRPC v11 actually produces: a path array
 * first (`["bids", "progress"]`), then the input.
 */
export function isStepBarQuery(queryKey: readonly unknown[]): boolean {
  const path = queryKey[0];
  return Array.isArray(path) && path[0] === "bids" && path[1] === "progress";
}

/**
 * The material price-history panel's query (`materials.priceHistory`), let
 * go after every successful mutation for the same reason: a price saved
 * with the panel open must appear in it without a reload (price-history plan
 * § 3.5, "Staleness"). Only an open panel's query is active, so this costs
 * nothing when it is shut.
 */
export function isPriceHistoryQuery(queryKey: readonly unknown[]): boolean {
  const path = queryKey[0];
  return (
    Array.isArray(path) && path[0] === "materials" && path[1] === "priceHistory"
  );
}
