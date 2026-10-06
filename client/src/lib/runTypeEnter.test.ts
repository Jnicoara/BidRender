import { describe, expect, it } from "vitest";
import { runTypeEnterAction, sameRunTypeName } from "./runTypeEnter";

const types = [
  { id: 1, label: '1/2" EMT, 2 #12 + ground' },
  { id: 2, label: '3/4" EMT, 3 #10 + ground' },
];

describe("Enter in the run-type search (audit #16)", () => {
  it("does NOT arm the top fuzzy match for a typo — it makes a new type", () => {
    // The fault: "1/2 emt pvc" fuzzy-matched the first EMT type and armed it.
    expect(runTypeEnterAction("1/2 emt pvc", types)).toEqual({
      kind: "create",
      label: "1/2 emt pvc",
    });
  });

  it("picks a type when the typed text is its name", () => {
    expect(runTypeEnterAction('3/4" emt, 3 #10 + GROUND ', types)).toEqual({
      kind: "pick",
      type: types[1],
    });
  });

  it("treats curly inch marks and extra spaces as the same name", () => {
    expect(sameRunTypeName("1/2” EMT,  2 #12 + ground", types[0].label)).toBe(
      true
    );
  });

  it("does nothing on an empty box", () => {
    expect(runTypeEnterAction("   ", types)).toEqual({ kind: "none" });
  });
});
