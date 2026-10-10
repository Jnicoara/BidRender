/**
 * EXISTING TO REMAIN, as a count NAME — the no-migration stand-in, 2026-10-01.
 *
 * Many devices on the reader-accuracy test sheets are drawn as existing to
 * remain, and a mark has no status column yet (that is a migration, handed to
 * Track A in todo.md: new / existing to remain / remove / relocate). Until it
 * lands, an existing device is counted under a second count whose name is the
 * legend name plus " - EXISTING TO REMAIN", e.g.
 *
 *   DUPLEX RECEPTACLE                      new work, priced
 *   DUPLEX RECEPTACLE - EXISTING TO REMAIN already there, kept apart
 *
 * Everything that has to recognise that pairing reads it HERE — the script
 * that makes the twin assemblies, the accuracy scorer (which folds the two
 * back together, because the AI reader cannot tell them apart and is not
 * asked to), and the fold (shared/twinFold.ts). One rule, so a spelling the
 * scorer accepts is one the script makes.
 *
 * **Superseded 2026-10-10 by `takeoff_stamps.status`.** Find all matching's
 * "Count as existing" used to put marks on the twin, which priced them as
 * NEW once the twin was sent; it now sets `existing` on the same count. A
 * twin already made is folded (the bid flags it; Track A's step-3 migration
 * does the rest). Only the reader-test script still makes twins.
 *
 * Read tolerantly — case, spacing, and a hyphen, en dash or em dash — because
 * these names are typed by a person; WRITTEN one way only.
 */
import { symbolLookupKey } from "./takeoffCounts";

export const EXISTING_TO_REMAIN_SUFFIX = " - EXISTING TO REMAIN";

const EXISTING_TAIL = /\s*[-–—]\s*existing\s+to\s+remain\s*$/i;

/** The existing-to-remain twin of a legend name. Idempotent. */
export function existingToRemainName(name: string): string {
  const { base } = splitExistingToRemain(name);
  return `${base}${EXISTING_TO_REMAIN_SUFFIX}`;
}

/** "X - EXISTING TO REMAIN" -> { base: "X", existing: true }. */
export function splitExistingToRemain(label: string): {
  base: string;
  existing: boolean;
} {
  const trimmed = label.trim();
  const base = trimmed.replace(EXISTING_TAIL, "");
  return base !== trimmed && base.length > 0
    ? { base, existing: true }
    : { base: trimmed, existing: false };
}

/**
 * The key two counts are compared on when new and existing should be the
 * SAME symbol — the accuracy scorer's question. Same normalising as the
 * legend's own key (symbolLookupKey), after the suffix is taken off.
 */
export function symbolKeyIgnoringExisting(label: string): string {
  return symbolLookupKey(splitExistingToRemain(label).base);
}
