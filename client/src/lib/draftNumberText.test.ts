import { describe, expect, it } from "vitest";
import {
  draftNumberFrom,
  typeDraftNumber,
  type DraftNumber,
} from "./draftNumberText";

/** Type one key at a time, the way the field receives it. */
function typeKeys(start: DraftNumber, keys: string, max = 100): DraftNumber {
  let state = start;
  for (const key of keys) state = typeDraftNumber(state, state.text + key, max);
  return state;
}

describe("a draft number field keeps what was typed", () => {
  it('"2.5" typed key by key is 2.5, not 25', () => {
    const done = typeKeys(draftNumberFrom(null), "2.5");
    expect(done.value).toBe(2.5);
    expect(done.text).toBe("2.5");
  });

  it('"0.75" keeps its leading zero and point', () => {
    expect(typeKeys(draftNumberFrom(null), "0.75").value).toBe(0.75);
  });

  it("a lone point is not a zero — the last value stands", () => {
    const done = typeKeys(draftNumberFrom(null), ".");
    expect(done.text).toBe(".");
    expect(done.value).toBeNull();
    expect(typeKeys(draftNumberFrom(null), ".5").value).toBe(0.5);
  });

  it("blank is null (follow the company), never 0", () => {
    expect(typeDraftNumber(draftNumberFrom(4), "", 100)).toEqual({
      text: "",
      value: null,
    });
  });

  it("clamps to the field's range", () => {
    expect(typeKeys(draftNumberFrom(null), "250").value).toBe(100);
    expect(typeDraftNumber(draftNumberFrom(3), "-2", 100).value).toBe(0);
  });

  it("reads the number a person meant, and nothing else", () => {
    // Plain Number() took "0x10" as 16 and refused "1,500" (track-c's copy
    // of this box read through parseTypedNumber; the merged one does too).
    const from3 = draftNumberFrom(3);
    expect(typeDraftNumber(from3, "0x10", 1e6)).toEqual({
      text: "0x10",
      value: 3,
    });
    expect(typeDraftNumber(from3, "1,5", 1e6).value).toBe(3);
    expect(typeDraftNumber(from3, "1,500", 1e6).value).toBe(1500);
    expect(typeDraftNumber(from3, "$2.50", 1e6).value).toBe(2.5);
  });

  it("an opened stored value shows as typed", () => {
    expect(draftNumberFrom(2.5).text).toBe("2.5");
  });
});
