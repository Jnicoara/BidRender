/**
 * A MARK IS PLACED ONCE PER KEY — so a batch the Plans screen sends again
 * after a lost answer cannot count its devices twice
 * (server/markReplay.test.ts).
 *
 * ── Why in memory, and what that does not cover ──────────────────────────────
 * The durable answer is a `clientKey` column with a unique index on
 * `takeoff_stamps`, which is a migration, and tonight's rules allow none
 * (todo.md has the entry). This closes the real case — a resend seconds or
 * minutes after the first send, to the same server — without one. It does
 * NOT survive a server restart or reach another instance; a resend that lands
 * there writes the marks again, exactly as every resend did before this.
 *
 * Remembered for a day, at most MAX_KEYS keys (oldest dropped first). A key
 * is per bid, so two bids cannot collide on a client's key.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_KEYS = 200_000;

/** `${bidId}:${key}` → the stamp it placed, and until when it is remembered. */
const placed = new Map<string, { stampId: number; until: number }>();

const slot = (bidId: number, key: string) => `${bidId}:${key}`;

/** The stamp a key already placed on this bid, or null. */
export function placedBefore(
  bidId: number,
  key: string,
  now: number
): number | null {
  const hit = placed.get(slot(bidId, key));
  if (!hit) return null;
  if (hit.until < now) {
    placed.delete(slot(bidId, key));
    return null;
  }
  return hit.stampId;
}

/** Remember which stamp each key placed. */
export function rememberPlaced(
  bidId: number,
  pairs: readonly { key: string; stampId: number }[],
  now: number
): void {
  for (const { key, stampId } of pairs)
    placed.set(slot(bidId, key), { stampId, until: now + TTL_MS });
  // A Map keeps insertion order, so the first keys are the oldest.
  while (placed.size > MAX_KEYS) {
    const oldest = placed.keys().next().value;
    if (oldest === undefined) break;
    placed.delete(oldest);
  }
}

export function forgetMarkKeysForTests(): void {
  placed.clear();
}
