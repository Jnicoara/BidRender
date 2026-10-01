/**
 * "Count again" — one click back to the last count, per bid
 * (references/track-b-count-pin-styles-plan.md § 11.6).
 *
 * Since 2026-10-01 a sheet change puts the count down (@/lib/toolOnSheet).
 * Right for safety, and it costs a re-pick on every sheet. So the page
 * remembers the last count it ARMED on each bid and offers it back as one
 * chip — never re-arming by itself, which is the fault that change fixed.
 *
 * It re-arms the COUNT, not the symbol: since a linked symbol has its own
 * count (shared/assemblyCounts.ts), the two are the same thing. And it is
 * offered only while that count still exists on the bid, read from the same
 * list every count change already refreshes — so a deleted count cannot be
 * offered back.
 *
 * Kept in sessionStorage so a reload keeps it. Every read and write is
 * guarded: storage can be missing or refuse, and nothing depends on it.
 */

export type LastCount = { groupId: number; label: string };

const KEY_PREFIX = "bidridge:last-count:";

export const lastCountKey = (bidId: number) => `${KEY_PREFIX}${bidId}`;

/** What was stored, if it is the shape this module writes. */
export function parseLastCount(raw: string | null): LastCount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value &&
      typeof value === "object" &&
      typeof (value as LastCount).groupId === "number" &&
      (value as LastCount).groupId > 0 &&
      typeof (value as LastCount).label === "string"
    )
      return {
        groupId: (value as LastCount).groupId,
        label: (value as LastCount).label,
      };
  } catch {
    /* not ours, or damaged — nothing to offer */
  }
  return null;
}

export function loadLastCount(bidId: number): LastCount | null {
  try {
    return parseLastCount(window.sessionStorage.getItem(lastCountKey(bidId)));
  } catch {
    return null;
  }
}

export function saveLastCount(bidId: number, last: LastCount): void {
  try {
    window.sessionStorage.setItem(lastCountKey(bidId), JSON.stringify(last));
  } catch {
    /* a private window or full storage — the chip just lasts this page */
  }
}

/**
 * The count to offer back, or null. Only when nothing is in hand, and only a
 * count the bid still has — under its CURRENT name, since a rename since it
 * was armed is the name the card now shows.
 */
export function countAgainOffer<
  G extends { id: number; label: string; assemblyId: number | null },
>(
  last: LastCount | null,
  groups: readonly G[] | undefined,
  somethingInHand: boolean
): G | null {
  if (!last || somethingInHand || !groups) return null;
  return groups.find(g => g.id === last.groupId) ?? null;
}
