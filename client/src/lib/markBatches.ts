/**
 * WHICH QUEUED MARKS MAY GO OVER TOGETHER — never two counts in one batch.
 *
 * A batch of marks is sent under ONE count id and ONE sheet id
 * (`takeoffStamps.drop`). The Plans screen used to send every unsent mark
 * under the FIRST one's ids. That is right while the queue only ever holds one
 * count, which is what flushing on every tool change was meant to guarantee —
 * and wrong the moment a send FAILS: the failed marks go back to unsent, the
 * estimator picks up another count and keeps clicking, and the next flush
 * sends count A's leftovers and count B's new marks together, all as A. Two
 * wrong quantities, with nothing on screen to say so (audit #4, owner's
 * piece 4, 2026-09-29). The crash-recovery path did the same with the stored
 * queue's first entry.
 *
 * So a batch is decided HERE, by the only rule that cannot be wrong: every
 * mark in it shares its sheet and its count. Anything else waits for the next
 * batch. Pure, so the suite can reach it (CLAUDE.md: a rule with no red to go
 * to is an instruction).
 */

export type QueuedMark = {
  sheetId: number;
  groupId: number;
  /** In flight already; not part of the next batch. */
  sent: boolean;
};

/**
 * The next batch: the unsent marks sharing the sheet and count of the OLDEST
 * unsent mark, in queue order. Empty when nothing is waiting.
 */
export function nextMarkBatch<T extends QueuedMark>(queue: readonly T[]): T[] {
  const first = queue.find(m => !m.sent);
  if (!first) return [];
  return queue.filter(
    m => !m.sent && m.sheetId === first.sheetId && m.groupId === first.groupId
  );
}

/** Is anything still waiting after this batch goes? */
export function hasMoreBatches<T extends QueuedMark>(
  queue: readonly T[],
  batch: readonly T[]
): boolean {
  const going = new Set(batch);
  return queue.some(m => !m.sent && !going.has(m));
}

/**
 * A recovered queue (from the crash mirror), split so each part goes over
 * under the count its marks were placed with.
 *
 * `key` is how a stored entry says what it counted: its group id in the
 * current shape, or, in the older shape with no group, its assembly or its
 * typed name. Entries with the same key go together, in first-seen order.
 */
export function splitRecoveredMarks<T>(
  stamps: readonly T[],
  key: (stamp: T) => string
): T[][] {
  const groups = new Map<string, T[]>();
  for (const stamp of stamps) {
    const k = key(stamp);
    const list = groups.get(k) ?? [];
    list.push(stamp);
    groups.set(k, list);
  }
  return Array.from(groups.values());
}
