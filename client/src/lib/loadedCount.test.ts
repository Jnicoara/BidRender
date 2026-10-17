import { describe, expect, it } from "vitest";
import { loadedCountLabel } from "@/lib/loadedCount";

describe("a paged list's count", () => {
  it("is a floor while more pages remain, exact when they are all in", () => {
    expect(loadedCountLabel(50, true)).toBe("50+");
    expect(loadedCountLabel(12, false)).toBe("12");
    expect(loadedCountLabel(0, false)).toBe("0");
  });
});
