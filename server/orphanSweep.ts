/**
 * Which stored files nothing names, and whether it is safe to delete them.
 *
 * The decision behind `scripts/sweepOrphanPlans.mts`, kept here as pure
 * arithmetic so the refusals can be tested. Deleting by ABSENCE is the most
 * dangerous thing a storage script can do: a database that answers with too
 * little — a wrong `DATABASE_URL`, an empty restore, a table that failed to
 * load — looks exactly like "every file is an orphan". So the refusals are the
 * point of this file, not a detail of it.
 */

export type StoredObject = {
  key: string;
  size: number;
  modified: Date;
  /** Which store it was listed from. A key can be in more than one. */
  store: "r2" | "disk";
};

/**
 * Old enough to be sure it is not an upload still waiting to be attached.
 *
 * The bytes land before `confirmAttach` writes the row, so a file uploaded a
 * minute ago is legitimately named by nothing yet. Seven days matches R2's rule
 * for abandoned multipart uploads.
 */
export const ORPHAN_MIN_AGE_DAYS = 7;

/** More than this share of the files looking orphaned means stop and look. */
export const ORPHAN_MAX_SHARE = 0.5;

export type SweepPlan =
  | {
      ok: true;
      orphans: StoredObject[];
      /** Named by nothing, but too new to be sure. Left alone. */
      tooNew: StoredObject[];
      named: number;
    }
  | { ok: false; reason: string };

export function planOrphanSweep(input: {
  objects: readonly StoredObject[];
  /** Every key any row names (`collectFiles`). */
  namedKeys: ReadonlySet<string>;
  now: Date;
  /**
   * The person running it has READ the list and says a majority of orphans is
   * real — a store that held years of test uploads, say. It lifts only the
   * share refusal. A database that names nothing is never accepted: no amount
   * of reading makes an empty answer trustworthy.
   */
  allowMajority?: boolean;
}): SweepPlan {
  if (input.namedKeys.size === 0 && input.objects.length > 0) {
    return {
      ok: false,
      reason:
        "The database names no stored files at all, while storage holds " +
        `${input.objects.length}. That is what a wrong DATABASE_URL looks like, ` +
        "not a store full of orphans. Nothing was deleted.",
    };
  }

  const cutoff =
    input.now.getTime() - ORPHAN_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const orphans: StoredObject[] = [];
  const tooNew: StoredObject[] = [];
  for (const object of input.objects) {
    if (input.namedKeys.has(object.key)) continue;
    if (object.modified.getTime() > cutoff) tooNew.push(object);
    else orphans.push(object);
  }

  const unnamed = orphans.length + tooNew.length;
  if (
    !input.allowMajority &&
    input.objects.length > 0 &&
    unnamed / input.objects.length > ORPHAN_MAX_SHARE
  ) {
    return {
      ok: false,
      reason:
        `${unnamed} of ${input.objects.length} stored files are named by no row — ` +
        `more than ${ORPHAN_MAX_SHARE * 100}%. Either this database is not the one ` +
        "these files belong to, or something is badly wrong. Nothing was deleted; " +
        "find out which before sweeping. If you have read the list and it is " +
        "right, --allow-majority lifts this one refusal.",
    };
  }

  return { ok: true, orphans, tooNew, named: input.namedKeys.size };
}
