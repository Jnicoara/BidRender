/**
 * When a batch of marks cannot be SENT — the connection dropped, the server
 * is down — they stay drawn and stay in the crash mirror, and are retried on
 * their own (Track B failure drill, 2026-10-15).
 *
 * Before this, a failed batch only went out again on the NEXT click: an
 * estimator who placed ten marks while the connection was down, then stopped,
 * saw ten marks on the drawing, a toast that said "Failed to fetch" for four
 * seconds, and nothing saved until they happened to reload. Measured: 15 s
 * after the connection came back, all ten still unsent.
 *
 * A REFUSAL is different — the server answered and said no (a locked bid, a
 * count deleted elsewhere). Retrying that forever would be a loop; it keeps
 * the message the server gave.
 */

/** No answer from the server at all, so sending again may work. */
export function isNetworkFailure(err: unknown): boolean {
  const e = err as {
    data?: unknown;
    message?: unknown;
    shape?: unknown;
  } | null;
  if (!e) return false;
  // A tRPC error the server sent carries `data` (its code); a dropped
  // connection never reached it.
  if (e.data !== undefined && e.data !== null) return false;
  const message = typeof e.message === "string" ? e.message : "";
  return /failed to fetch|networkerror|network request failed|load failed|internet|disconnected|timed? ?out|ECONNREFUSED|fetch failed/i.test(
    message
  );
}

/** 2 s, 4 s, 8 s, 16 s, then every 30 s — never a tight loop. */
export function markRetryDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
}

/** The message that stays up while marks are waiting to be sent. */
export function unsavedMarksMessage(count: number): string {
  const marks = count === 1 ? "1 mark is" : `${count} marks are`;
  return `${marks} not saved yet — no connection to the server. They are kept on this device and will be sent when the connection is back. Don't clear this browser's data.`;
}
