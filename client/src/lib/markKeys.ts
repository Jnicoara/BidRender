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
