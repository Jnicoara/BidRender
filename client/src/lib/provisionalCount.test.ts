import { describe, expect, it } from "vitest";
import {
  adoptRealGroup,
  dropProvisional,
  isProvisionalGroup,
  lostMarksMessage,
  marksOnlyHere,
  settleLateMarks,
} from "./provisionalCount";
import { nextMarkBatch } from "./markBatches";

type Mark = {
  key: number;
  sheetId: number;
  groupId: number;
  name: string;
  status: "new";
  sent: boolean;
};

const mark = (key: number, groupId: number, name = "count"): Mark => ({
  key,
  sheetId: 7,
  groupId,
  name,
  status: "new",
  sent: false,
});

describe("a count armed before the server has made it", () => {
  it("is provisional while its id is negative, and only then", () => {
    expect(isProvisionalGroup(-1)).toBe(true);
    expect(isProvisionalGroup(-42)).toBe(true);
    expect(isProvisionalGroup(1)).toBe(false);
    expect(isProvisionalGroup(0)).toBe(false);
  });

  it("is never sent: clicks wait in the queue until the count exists", () => {
    // The fault: three clicks made in the gap were lost. Now they queue under
    // the provisional id — and nextMarkBatch must not send them as that id.
    const queue = [
      mark(-1, -1, "ci duplex"),
      mark(-2, -1, "ci duplex"),
      mark(-3, -1, "ci duplex"),
    ];
    expect(nextMarkBatch(queue)).toEqual([]);
  });

  it("does not hold up real marks queued behind it", () => {
    const queue = [mark(-1, -1), mark(-2, 12), mark(-3, 12)];
    expect(nextMarkBatch(queue).map(m => m.key)).toEqual([-2, -3]);
  });

  it("hands every queued click to the count the server made, and then they send", () => {
    const queue = [
      mark(-1, -1, "pending"),
      mark(-2, -1, "pending"),
      mark(-3, 12, "other"),
    ];
    const adopted = adoptRealGroup(queue, -1, { id: 30, label: "ci duplex" });
    expect(adopted.map(m => [m.groupId, m.name])).toEqual([
      [30, "ci duplex"],
      [30, "ci duplex"],
      [12, "other"],
    ]);
    // All three clicks go, under the real id: none lost.
    expect(nextMarkBatch(adopted).map(m => m.key)).toEqual([-1, -2]);
  });

  it("when refused, takes its marks off and says how many", () => {
    const queue = [mark(-1, -1), mark(-2, 12), mark(-3, -1)];
    const { kept, lost } = dropProvisional(queue, -1);
    expect(lost).toBe(2);
    expect(kept.map(m => m.key)).toEqual([-2]);
    expect(
      lostMarksMessage(
        lost,
        "Exit sign",
        "That name is already a count on this bid."
      )
    ).toBe(
      '"Exit sign" could not be started, so 2 marks were not counted. That name is already a count on this bid.'
    );
    expect(lostMarksMessage(1, "Exit sign", null)).toBe(
      '"Exit sign" could not be started, so 1 mark was not counted.'
    );
  });

  it("only ever touches its own provisional id", () => {
    const queue = [mark(-1, -1), mark(-2, -2)];
    expect(
      adoptRealGroup(queue, -1, { id: 5, label: "a" }).map(m => m.groupId)
    ).toEqual([5, -2]);
    expect(dropProvisional(queue, -2).kept.map(m => m.groupId)).toEqual([-1]);
  });
});

describe("marks a reload would lose", () => {
  it("counts a mark under a count the server has not made yet", () => {
    // Smoke flow 10, forced: the count's request held, one click, then a
    // reload. That mark was in no mirror and was lost without a word.
    expect(marksOnlyHere([mark(1, -1)])).toBe(1);
  });

  it("counts a mark on a sheet whose row has not arrived", () => {
    expect(marksOnlyHere([{ ...mark(1, 5), sheetId: -3 }])).toBe(1);
  });

  it("does not count a real mark, sent or not — the mirror keeps those", () => {
    expect(marksOnlyHere([mark(1, 5), { ...mark(2, 5), sent: true }])).toBe(0);
  });

  it("goes to zero the moment the count is made", () => {
    const queue = [mark(1, -1), mark(2, -1)];
    expect(marksOnlyHere(queue)).toBe(2);
    expect(
      marksOnlyHere(adoptRealGroup(queue, -1, { id: 9, label: "a" }))
    ).toBe(0);
  });
});

describe("a click that arrives after the server answered", () => {
  // Flow 5, local smoke: the count was made between the first and second
  // click; a click handled by the previous render still carried the
  // provisional id after the queue had been adopted, and was never sent.
  it("goes to the count the server made, like the clicks that waited", () => {
    const late = [mark(1, 8), mark(2, -1, "provisional")];
    const outcomes = new Map([[-1, { id: 8, label: "CI SWITCH" }]]);
    const { queue, lost, changed } = settleLateMarks(late, outcomes);
    expect(queue.map(m => [m.groupId, m.name])).toEqual([
      [8, "count"],
      [8, "CI SWITCH"],
    ]);
    expect(lost).toBe(0);
    expect(changed).toBe(true);
    // And it is now sendable — the whole point.
    expect(nextMarkBatch(queue).map(m => m.key)).toEqual([1, 2]);
  });

  it("comes off, counted, when that count was refused", () => {
    const { queue, lost } = settleLateMarks(
      [mark(1, -1), mark(2, 5)],
      new Map([[-1, "refused" as const]])
    );
    expect(queue.map(m => m.key)).toEqual([2]);
    expect(lost).toBe(1);
  });

  it("leaves a count still waiting for its answer alone", () => {
    const queue = [mark(1, -2), mark(2, 5)];
    const result = settleLateMarks(
      queue,
      new Map([[-1, { id: 8, label: "x" }]])
    );
    expect(result.queue).toEqual(queue);
    expect(result.changed).toBe(false);
  });
});
