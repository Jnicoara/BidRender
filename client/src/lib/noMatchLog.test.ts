import { describe, it, expect } from "vitest";
import { missToRecord } from "./noMatchLog";

const none = new Set<string>();

describe("when a picker search is recorded as a miss", () => {
  it("records words that found nothing, normalised", () => {
    expect(
      missToRecord({
        query: " Sealtite 90 ",
        resultCount: 0,
        ready: true,
        alreadySent: none,
      })
    ).toBe("sealtite 90");
  });
  it("not while the list it searches is still loading", () => {
    expect(
      missToRecord({
        query: "romex",
        resultCount: 0,
        ready: false,
        alreadySent: none,
      })
    ).toBe(null);
  });
  it("not when something was found", () => {
    expect(
      missToRecord({
        query: "romex",
        resultCount: 3,
        ready: true,
        alreadySent: none,
      })
    ).toBe(null);
  });
  it("not for an empty box or one letter", () => {
    for (const query of ["", "  ", "x"])
      expect(
        missToRecord({ query, resultCount: 0, ready: true, alreadySent: none })
      ).toBe(null);
  });
  it("once per picker opening, however it was typed", () => {
    expect(
      missToRecord({
        query: "SEALTITE  90",
        resultCount: 0,
        ready: true,
        alreadySent: new Set(["sealtite 90"]),
      })
    ).toBe(null);
  });
});
