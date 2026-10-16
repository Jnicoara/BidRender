/**
 * The key a queued mark is sent with (server/markReplay.ts places each key
 * ONCE per bid, so a batch resent after a lost answer counts once).
 *
 * ── Why not the queue's own key ───────────────────────────────────────────
 * The Plans screen's queue numbers its marks -1, -2, … and the counter starts
 * again on every page load and in every tab. The server remembers a key per
 * BID for a day. Sent bare, the first mark after a reload — or the first mark
 * in a second tab — would arrive as "-1", be taken for a resend, and never be
 * placed: a mark that vanishes, found before it shipped (Track B, 2026-10-16,
 * reading Track A's handoff). So every key carries this page load's own
 * random id, and two loads can never share one.
 */

/** A fresh id for this page load. */
export function newMarkSession(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** One page load's id for all its marks. */
export const MARK_SESSION = newMarkSession();

/** The key sent for a queued mark: unique to this page load, ≤ 64 chars. */
export function markKey(session: string, queueKey: number | string): string {
  return `${session}:${queueKey}`.slice(0, 64);
}

/**
 * The keys to resend a RECOVERED batch with — the ones its marks were first
 * sent with, stored beside them in the crash queue (`QueuedStamp.key`).
 *
 * Found by e2e/smoke/marks.spec.ts (2026-10-16): a mark placed just before a
 * reload was in flight AND in the stored queue; the server saved it, the
 * reload recovered it from storage and sent it again WITHOUT a key, and it
 * was on the bid twice. With its original key the server places it once.
 *
 * All or nothing: a batch with one keyless mark (a queue from an older
 * build) goes without keys, exactly as every recovery did before.
 */
export function recoveredKeys(
  part: readonly { key?: unknown }[]
): string[] | undefined {
  const keys = part.map(m => m.key);
  return keys.every(
    (k): k is string => typeof k === "string" && k.length > 0 && k.length <= 64
  )
    ? (keys as string[])
    : undefined;
}
