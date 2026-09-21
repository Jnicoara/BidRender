/**
 * Turning a stored `materialId` into the material the user actually means.
 *
 * Every consumer must go through here rather than doing
 * `materials.find(m => m.id === materialId)`, or joining on the id in SQL, for
 * the same non-obvious reason `shared/laborRateLookup.ts` exists:
 *
 * ── Forks move the id out from under the reference ───────────────────────────
 * An assembly stores the id of each material it is made of. Editing a SHIPPED
 * material does not change that row — it FORKS, producing a new row with a new
 * id and a `baselineId` pointing back, and the fork then supersedes the starter
 * in the user's library (`mergeLibraryRows`). The assembly is still pointing at
 * the starter's id, which the merged view now hides.
 *
 * So an `innerJoin` on that id fetches the BASELINE: the $0, no-hours row the
 * user has already replaced. **Pricing a starter material did nothing for any
 * assembly built from it**, and the two screens disagreed about the same part —
 * $3.45 on the Materials screen, $0.00 inside the assembly, with nothing saying
 * which was right.
 *
 * ── Measured, 2026-09-20, because it is the kind of claim that needs it ──────
 * `Single-gang box` priced at $3.45 with a 0.15 h labor unit. The
 * `Duplex receptacle standard` assembly's line for it read `cost 0.0000,
 * hours null`, and `assemblies.price` returned a material cost of **0**.
 *
 * It had been true for as long as both forking and assemblies have existed. It
 * surfaced while wiring labor units through, because that put a second number
 * on the same broken path and made the silence audible.
 *
 * ── Why the SAME shape as resolveLaborRate, deliberately ────────────────────
 * Somebody hit this for labor rates, solved it, and wrote down why. Materials
 * had the identical seam and no resolver. One pattern for both is worth more
 * than a cleverer second one: the next person who meets a third forkable thing
 * should recognise it immediately.
 *
 * ── Read time, never a rewrite ──────────────────────────────────────────────
 * This resolves on the way OUT and writes nothing. Re-pointing every stored
 * `materialId` at its fork would also work and is a migration that rewrites
 * references across every assembly, kit and bid — its own careful day, and not
 * reversible the way a read is. Decided 2026-09-20.
 *
 * **A stored id therefore stays exactly as stored**, which matters more than it
 * looks: `copyAssemblyChildren` copies lines to a forked assembly, and if this
 * resolution leaked into what it writes, forking an assembly would quietly
 * re-point it at the user's material forks — the rewrite this design rejected,
 * arriving by accident.
 */

import { resolveForkedRow, type ForkableRow } from "./forkedRows";

/** The subset of a material row needed to follow a fork. */
export type ResolvableMaterial = ForkableRow;

/**
 * The material an assembly means by `materialId`, following a fork if one
 * exists.
 *
 * ── THE LIST MUST BE MERGED FIRST, and this is the sharp edge ──────────────
 * Resolution is DIRECT first, then fork — the same order as `resolveLaborRate`,
 * on purpose. That order is only correct on a list where a fork has already
 * SUPERSEDED its baseline, which is what `mergeLibraryRows` does and what
 * `getLibraryLaborRates` hands its caller.
 *
 * Give it a raw list holding BOTH rows and the direct hit wins, so it returns
 * the very baseline the fork was made to replace — the original bug, restored
 * in full. Caught by a test on 2026-09-20 within minutes of the first query
 * being written that way.
 *
 * The alternative was making this prefer forks, which would have worked here
 * and made the two resolvers disagree about the same shape of data. Merging
 * first keeps one pattern for both.
 *
 * Returns undefined when the material was never set, or has been deleted
 * outright. A caller that gets undefined must say so rather than substituting a
 * zero — a missing material is a missing line, not a free one.
 */
export function resolveMaterial<T extends ResolvableMaterial>(
  materials: readonly T[],
  materialId: number | null | undefined
): T | undefined {
  // Delegates so the three resolvers cannot drift. See shared/forkedRows.ts.
  return resolveForkedRow(materials, materialId);
}

/**
 * Every id worth fetching in order to resolve this set of stored ids.
 *
 * The stored ids themselves, because most of them resolve directly. Callers
 * pair this with a `baselineId IN (...)` clause on the SAME list, so one query
 * brings back both the baselines and any forks of them.
 *
 * Exists so the two halves of that query cannot be built from different lists,
 * which would return a fork whose baseline was not fetched — and then resolve
 * to it inconsistently depending on which row happened to arrive.
 */
export function materialIdsToFetch(storedIds: readonly number[]): number[] {
  return Array.from(new Set(storedIds.filter(id => Number.isFinite(id))));
}
