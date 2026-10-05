import { describe, expect, it } from "vitest";
import {
  hasMoreBatches,
  nextMarkBatch,
  recoveredMarkKey,
  splitRecoveredMarks,
} from "./markBatches";
import type { UserMarkStatus } from "@shared/markStatus";

const mark = (
  key: number,
  groupId: number,
  sheetId = 1,
  sent = false,
  status: UserMarkStatus = "new"
) => ({
  key,
  groupId,
  sheetId,
  status,
  sent,
});

describe("the next batch of marks", () => {
  it("never mixes two counts — the failed-send case", () => {
    // Count A's two marks failed and went back to unsent; the estimator then
    // picked up count B and clicked twice more.
    const queue = [mark(1, 10), mark(2, 10), mark(3, 20), mark(4, 20)];
    expect(nextMarkBatch(queue).map(m => m.key)).toEqual([1, 2]);
    expect(nextMarkBatch(queue).every(m => m.groupId === 10)).toBe(true);
    expect(hasMoreBatches(queue, nextMarkBatch(queue))).toBe(true);
  });

  it("never mixes two sheets of the same count", () => {
    const queue = [mark(1, 10, 1), mark(2, 10, 2), mark(3, 10, 1)];
    expect(nextMarkBatch(queue).map(m => m.key)).toEqual([1, 3]);
  });

  it("skips marks already in flight", () => {
    const queue = [mark(1, 10, 1, true), mark(2, 20), mark(3, 10)];
    expect(nextMarkBatch(queue).map(m => m.key)).toEqual([2]);
  });

  it("takes everything when the queue holds one count", () => {
    const queue = [mark(1, 10), mark(2, 10), mark(3, 10)];
    expect(nextMarkBatch(queue)).toHaveLength(3);
    expect(hasMoreBatches(queue, nextMarkBatch(queue))).toBe(false);
  });

  it("never mixes NEW and EXISTING marks of one count — placing as", () => {
    // Three new, then "placing as" switched to existing for two, then back.
    // One request carries one status, so the existing pair must go alone:
    // sent with the new ones they would be priced as new devices.
    const queue = [
      mark(1, 10),
      mark(2, 10),
      mark(3, 10, 1, false, "existing"),
      mark(4, 10, 1, false, "existing"),
      mark(5, 10),
    ];
    const first = nextMarkBatch(queue);
    expect(first.map(m => m.key)).toEqual([1, 2, 5]);
    expect(hasMoreBatches(queue, first)).toBe(true);

    const rest = queue.map(m => (first.includes(m) ? { ...m, sent: true } : m));
    const second = nextMarkBatch(rest);
    expect(second.map(m => m.key)).toEqual([3, 4]);
    expect(second.every(m => m.status === "existing")).toBe(true);
  });

  it("is empty when nothing waits", () => {
    expect(nextMarkBatch([mark(1, 10, 1, true)])).toEqual([]);
    expect(nextMarkBatch([])).toEqual([]);
  });
});

describe("a recovered queue", () => {
  it("goes over one count at a time, never under the first entry's", () => {
    const stored = [
      { groupId: 10, x: 1 },
      { groupId: 20, x: 2 },
      { groupId: 10, x: 3 },
    ];
    const parts = splitRecoveredMarks(stored, s => `g${s.groupId}`);
    expect(parts.map(p => p.map(s => s.x))).toEqual([[1, 3], [2]]);
  });

  it("keeps clicks placed as existing apart from new ones of the same count", () => {
    const stored = [
      { groupId: 10, x: 1, y: 0 },
      { groupId: 10, x: 2, y: 0, status: "existing" as const },
      { groupId: 10, x: 3, y: 0, status: "new" as const },
    ];
    const parts = splitRecoveredMarks(stored, recoveredMarkKey);
    // Absent is the older shape and means new, so 1 and 3 go together.
    expect(parts.map(p => p.map(s => s.x))).toEqual([[1, 3], [2]]);
  });
});
