/**
 * When the "Most used" row shows in an assembly picker — the bid screen's
 * "Add an assembly" and Quick bid's "Count an assembly" read this one rule
 * (`MostUsedRow`, references/top-assemblies-draft.md § 4).
 *
 * - Hidden while the person is TYPING: typing means they know what they
 *   want, and the search results take that space.
 * - Hidden when there is nothing to show — which is also the whole of the
 *   "fewer than 3 bids" rule: the server returns [] then
 *   (`shared/mostUsed.ts`), so a new company sees no empty row.
 */
export function showMostUsed(
  query: string,
  items: readonly unknown[]
): boolean {
  return query.trim() === "" && items.length > 0;
}
