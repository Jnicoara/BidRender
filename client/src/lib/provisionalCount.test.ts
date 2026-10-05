import { describe, expect, it } from "vitest";
import {
  adoptRealGroup,
  dropProvisional,
  isProvisionalGroup,
  lostMarksMessage,
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
