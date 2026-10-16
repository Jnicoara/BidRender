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

  it("an opened stored value shows as typed", () => {
    expect(draftNumberFrom(2.5).text).toBe("2.5");
  });
});
