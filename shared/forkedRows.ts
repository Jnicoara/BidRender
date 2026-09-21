/**
 * Following a fork: the one rule, for every library thing that has one.
 *
 * ── The seam this exists for ─────────────────────────────────────────────────
 * Six tables in this app are forkable — they carry a `baselineId` and a NULL
 * `userId` means the app owns the row. Editing a shipped one does not change
 * it. It FORKS: a new row, a new id, a `baselineId` pointing back, and
 * `mergeLibraryRows` then hides the baseline from that user's library.
 *
 * Anything that STORED the old id is now pointing at a row the user can no
 * longer see. A plain `find` by id returns nothing, or — worse — returns the
 * superseded baseline, and the number it carries is the shipped one the user
 * has already replaced.
 *
 * **Every instance of this has been a silent money bug.** Not a crash, not a
 * blank: a smaller number, on a bid, with nothing on screen to say which of
 * two disagreeing screens was right.
 *
 * ── Three found, in this order, and the third is the sharpest ────────────────
 *
 *   labor rates   an assembly's role priced at $0 the moment the rate was
 *                 edited. Solved first, in `laborRateLookup.ts`.
 *   materials     pricing a starter material did nothing for any assembly
 *                 built from it. $3.45 on one screen, $0.00 on another.
 *   modifiers     a forked modifier STOPS APPLYING. Measured 2026-09-20:
 *                 `modifierPct 0.12 -> 0`, hours `1.68 -> 1.50`.
 *
 * **The modifier one is the worst and the reason this file exists.** Editing a
 * modifier to the SAME VALUE kills it — 12% saved as 12% and the adjustment
 * silently stops. There is nothing about that edit for anyone to notice, which
 * makes it undiscoverable from the outside. It was found by auditing the seam
 * after the second instance, not by anybody hitting it.
 *
 * ── Why a generic, when two hand-written copies already worked ───────────────
 * Because there were about to be three, and a fourth forkable thing is one
 * feature away. Three copies of six lines is three chances for one of them to
 * answer the question differently, and the symptom of that is a number that is
 * right on one screen and wrong on another — which is the exact failure the
 * copies were written to fix.
 *
 * The named wrappers stay (`resolveLaborRate`, `resolveMaterial`,
 * `resolveModifier`) because a call site reads better saying what it resolves.
 * They delegate here so they cannot drift.
 */

/** Anything the app ships and a user can fork. */
export type ForkableRow = {
  id: number;
  /** The shipped row this is a fork OF; null for a baseline or an own row. */
  baselineId: number | null;
};

/**
 * The row a stored id MEANS, following a fork if one exists.
 *
 * ── THE LIST MUST BE MERGED FIRST. This is the sharp edge ───────────────────
 * Resolution is DIRECT first, then fork. That order is only correct on a list
 * where a fork has already superseded its baseline — what `mergeLibraryRows`
 * does, and what every `getLibrary*` function hands back.
 *
 * Hand it a raw list holding BOTH rows and the direct hit wins, so it returns
 * the very baseline the fork was made to replace: the original bug, restored in
 * full. That mistake was made and caught by a test within minutes of the
 * material resolver being written, and is pinned in `materialLookup.test.ts`.
 *
 * The alternative — preferring forks — would work on an unmerged list and make
 * the resolvers disagree with each other on a merged one. One rule is worth
 * more than a forgiving one.
 *
 * Returns undefined when the id was never set, or the row is gone outright. A
 * caller that gets undefined must SAY so rather than substituting a zero: a
 * missing material is a missing line, not a free one, and a missing modifier is
 * an adjustment nobody removed.
 */
export function resolveForkedRow<T extends ForkableRow>(
  rows: readonly T[],
  id: number | null | undefined
): T | undefined {
  if (id == null) return undefined;

  const direct = rows.find(row => row.id === id);
  if (direct) return direct;

  // The id points at a shipped row the user has since forked; the fork is what
  // they now mean by it.
  return rows.find(row => row.baselineId === id);
}

/**
 * Resolve a whole SET of stored ids, dropping the ones nothing answers to.
 *
 * ── Why the drop is silent here and must not be silent above it ─────────────
 * A row that resolves to nothing has been deleted outright, and there is no
 * sensible stand-in — a modifier that no longer exists cannot be applied, and
 * inventing a 0% one would be the same lie as pricing a missing material at
 * zero. So it is dropped.
 *
 * What must NOT happen is the caller reporting the survivors as though they
 * were the whole set. `resolveForkedRows` returns `missing` alongside them for
 * exactly that reason, and it is not optional: a list of two applied modifiers
 * where three were stored looks identical to a correct list of two.
 */
export function resolveForkedRows<T extends ForkableRow>(
  rows: readonly T[],
  ids: readonly number[]
): { resolved: T[]; missing: number[] } {
  const resolved: T[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const row = resolveForkedRow(rows, id);
    if (row) resolved.push(row);
    else missing.push(id);
  }
  return { resolved, missing };
}
