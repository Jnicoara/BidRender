import { describe, expect, it } from "vitest";
import { heightSourceWords } from "./heightSourceWords";

describe("where a drop's device height came from, in words", () => {
  it("a TYPE's height — job, shop or shipped — says 'default height'", () => {
    // Red before 2026-10-07: these said nothing, so a receptacle dropping to
    // the shop's 18" read the same as one somebody measured.
    expect(heightSourceWords("shipped")).toBe("default height");
    expect(heightSourceWords("company")).toBe("default height");
    expect(heightSourceWords("job")).toBe("default height");
  });

  it("a device's own height is never called a default", () => {
    expect(heightSourceWords("mark-typed")).toBe("this mark's height");
    expect(heightSourceWords("mark-read")).toBe("read from the plan");
    expect(heightSourceWords("count")).toBe("the count's height");
    // The run end's own height shows in its own field beside the drop.
    expect(heightSourceWords("run")).toBeNull();
  });
});
