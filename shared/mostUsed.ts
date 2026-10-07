/**
 * "MOST USED" — this company's most-used assemblies, for the row at the top
 * of the assembly picker (references/top-assemblies-draft.md § 4; owner,
 * 2026-10-07).
 *
 * Pure, so the rule is held by the suite rather than by a component:
 *
 * - **Weight = distinct BIDS**, not line quantity. 40 receptacles on one bid
 *   is one use; a breaker added on 30 bids is thirty.
 * - **Forks resolve first.** A line points at the assembly id it was added
 *   from; a starter the company later edited is a fork with a new id. Both
 *   count under the one the library now shows, or a forked favourite would
 *   split its count and fall off the list.
 * - **Last 12 months only** — a shop's mix changes.
 * - **Nothing at all below 3 bids.** No row, not an empty one: a brand-new
 *   company sees the picker exactly as before.
 * - Ties broken by most recent use, then by id so the order is stable.
 *
 * A count, never AI, and never a gate — it is a shortcut over the same list.
 */

export const MOST_USED_LIMIT = 8;
export const MOST_USED_MIN_BIDS = 3;
export const MOST_USED_WINDOW_DAYS = 365;

/** One assembly used on one bid: the raw fact, as the database gives it. */
export type AssemblyUse = {
  assemblyId: number;
  bidId: number;
  /** The most recent time that assembly was added to that bid. */
  usedAt: Date;
};

export type MostUsedEntry = {
  /** The assembly the library SHOWS (a fork, when the company has one). */
  assemblyId: number;
  /** How many distinct bids it was used on, in the window. */
  bids: number;
  lastUsedAt: Date;
};

export function rankMostUsed(
  uses: readonly AssemblyUse[],
  options: {
    /** The company's bids in the window — the 3-bid threshold. */
    bidCount: number;
    now: Date;
    /**
     * The id the library shows for a stored one (follows forks), or
     * undefined when it is gone — then that use is dropped, never shown.
     */
    resolve: (assemblyId: number) => number | undefined;
    limit?: number;
  }
): MostUsedEntry[] {
  if (options.bidCount < MOST_USED_MIN_BIDS) return [];
  const since =
    options.now.getTime() - MOST_USED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const byAssembly = new Map<number, { bids: Set<number>; last: number }>();
  for (const use of uses) {
    const at = use.usedAt.getTime();
    if (at < since || at > options.now.getTime()) continue;
    const id = options.resolve(use.assemblyId);
    if (id === undefined) continue;
    const entry = byAssembly.get(id) ?? { bids: new Set<number>(), last: 0 };
    entry.bids.add(use.bidId);
    entry.last = Math.max(entry.last, at);
    byAssembly.set(id, entry);
  }
  return Array.from(byAssembly.entries())
    .map(([assemblyId, e]) => ({
      assemblyId,
      bids: e.bids.size,
      lastUsedAt: new Date(e.last),
    }))
    .sort(
      (a, b) =>
        b.bids - a.bids ||
        b.lastUsedAt.getTime() - a.lastUsedAt.getTime() ||
        a.assemblyId - b.assemblyId
    )
    .slice(0, options.limit ?? MOST_USED_LIMIT);
}
