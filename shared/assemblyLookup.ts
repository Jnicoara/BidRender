/**
 * Turning a stored `assemblyId` into the assembly the user actually means.
 *
 * ── The FIFTH instance, and the first one found on purpose ──────────────────
 * Labour rates, materials, modifiers and run types all had this bug and all
 * four were found by accident, after a wrong number had been on screen for a
 * while. This one was found by `server/forkableReferences.test.ts`, which lists
 * every stored id pointing at a forkable row and demands an answer for each —
 * written on 2026-09-21 precisely because four meant there would be a fifth.
 *
 * ── What it was ─────────────────────────────────────────────────────────────
 * A counted group stores the id of the assembly it counts. Editing a shipped
 * assembly FORKS it, and `mergeLibraryRows` then hides the baseline — but the
 * group still points at the baseline's id. `addCountToBid` reached it through
 * `getAssemblyById`, a direct lookup, so **sending that count to a bid froze
 * the SHIPPED row's $0 and shipped hours onto the line** rather than the
 * numbers the estimator had just typed.
 *
 * That is the worst place in the app for this to happen. A bid line's snapshot
 * is frozen on purpose and never re-priced, so the wrong numbers do not correct
 * themselves later — the bid is simply wrong, quietly, for ever.
 *
 * ── Read time, never a rewrite ──────────────────────────────────────────────
 * A stored id stays exactly as stored, like every other resolver here. See
 * `shared/materialLookup.ts` for why re-pointing stored ids was rejected.
 *
 * ── Merge first, then resolve ───────────────────────────────────────────────
 * Resolution is DIRECT first, then fork, which is only correct on a list where
 * a fork has already superseded its baseline. Hand it a raw list holding both
 * and the direct hit wins, returning the very row the fork replaced.
 */

import { resolveForkedRow, type ForkableRow } from "./forkedRows";

/** The subset of an assembly row needed to follow a fork. */
export type ResolvableAssembly = ForkableRow;

/**
 * The assembly a stored id means, following a fork if one exists.
 *
 * Returns undefined when the assembly was deleted outright. A caller that gets
 * undefined must say so rather than pricing at zero — a missing assembly is a
 * missing line, not a free one.
 */
export function resolveAssembly<T extends ResolvableAssembly>(
  assemblies: readonly T[],
  assemblyId: number | null | undefined
): T | undefined {
  // Delegates so the five resolvers cannot drift. See shared/forkedRows.ts.
  return resolveForkedRow(assemblies, assemblyId);
}
