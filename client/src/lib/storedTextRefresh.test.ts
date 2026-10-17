import { describe, expect, it } from "vitest";
import { refreshUneditedText } from "./storedTextRefresh";

describe("refreshUneditedText — a refetch never rewrites a box being typed in", () => {
  const shown = { profit: "0", overhead: "10" };

  it("first arrival shows everything stored", () => {
    expect(
      refreshUneditedText({ profit: "0", overhead: "0" }, null, shown)
    ).toEqual(shown);
  });

  it("a box the person changed keeps what they typed (the journey's 20 → 0)", () => {
    expect(
      refreshUneditedText({ profit: "20", overhead: "10" }, shown, {
        profit: "0",
        overhead: "10",
      })
    ).toEqual({ profit: "20", overhead: "10" });
  });

  it("an untouched box takes the new stored value", () => {
    expect(
      refreshUneditedText({ profit: "20", overhead: "10" }, shown, {
        profit: "0",
        overhead: "12.5",
      })
    ).toEqual({ profit: "20", overhead: "12.5" });
  });

  it("after the person's own save lands, the box shows the stored value", () => {
    // They typed 20 and it saved: the box reads 20, storage now says 20.
    expect(
      refreshUneditedText(
        { profit: "20", overhead: "10" },
        { profit: "20", overhead: "10" },
        { profit: "20", overhead: "10" }
      )
    ).toEqual({ profit: "20", overhead: "10" });
  });
});
