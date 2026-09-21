/**
 * Turning a stored `runTypeId` into the run type the user actually means.
 *
 * ── The fourth forkable thing, and it was found the same way as the third ────
 * `shared/forkedRows.ts` predicted this: "a fourth forkable thing is one
 * feature away". It arrived on 2026-09-20, in the bridge that puts traced
 * footage on a bid, and it announced itself the way every one of these does —
 * as a number that was quietly too small.
 *
 * Editing a shipped run type FORKS it: a new row, a new id, a `baselineId`
 * pointing back, and `mergeLibraryRows` then hides the baseline from the
 * palette. A traced run keeps pointing at the BASELINE's id. So a bridge that
 * filtered the merged palette by the ids runs store found nothing for those
 * types — and on the dev fixture that silently dropped two 1/2" EMT homeruns
 * and a 12-2 MC run out of the footage, with the bid simply showing less pipe
 * than the drawing had on it.
 *
 * ── The stored id stays exactly as stored ────────────────────────────────────
 * Resolution happens on the way OUT, like every other resolver here, and a bid
 * line records the id the RUNS use so the two can be matched again. Re-pointing
 * stored ids at forks is a migration across every run and every line, which
 * `shared/materialLookup.ts` weighed and rejected for the same reason.
 *
 * ── Merge first, then resolve ────────────────────────────────────────────────
 * Resolution is DIRECT first, then fork, which is only correct on a list where
 * a fork has already superseded its baseline. Hand it a raw list holding both
 * and the direct hit wins, returning the very row the fork replaced.
 */

import { resolveForkedRow, type ForkableRow } from "./forkedRows";

/** The subset of a run type row needed to follow a fork. */
export type ResolvableRunType = ForkableRow;

/**
 * The run type a stored id means, following a fork if one exists.
 *
 * Returns undefined when the type was deleted outright. A caller that gets
 * undefined must say so rather than dropping the footage silently — the
 * footage is measured work, and losing it is the failure this file documents.
 */
export function resolveRunType<T extends ResolvableRunType>(
  runTypes: readonly T[],
  runTypeId: number | null | undefined
): T | undefined {
  // Delegates so the four resolvers cannot drift. See shared/forkedRows.ts.
  return resolveForkedRow(runTypes, runTypeId);
}
