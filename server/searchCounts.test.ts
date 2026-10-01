import { describe, it, expect } from "vitest";
import {
  countNounAfter,
  phraseHoldsCount,
  wordIsCount,
} from "../shared/searchCounts";

describe("a count in a search", () => {
  it("is a number followed by a count noun, and nothing else", () => {
    expect(countNounAfter("2", "gang")).toBe("gang");
    expect(countNounAfter("30", "space")).toBe("space");
    expect(countNounAfter("2", "emt")).toBeNull();
    expect(countNounAfter("gang", "box")).toBeNull();
  });

  it.each([
    ["2-gang", "2", "gang"],
    ["2g", "2", "gang"],
    ["double-gang", "2", "gang"],
    ["single-pole", "1", "pole"],
    ["2p", "2", "pole"],
    ["30-space,", "30", "space"],
    ["one-hole", "1", "hole"],
  ])("%s is the count %s of %s", (word, n, noun) => {
    expect(wordIsCount(word, n, noun)).toBe(true);
  });

  it.each([
    ['1/2"', "2", "gang"],
    ['3/4"', "3", "hole"],
    ["20a", "2", "pole"],
    ["200a", "2", "pole"],
    ['2-1/2"', "2", "hole"],
    ["3-gang", "3", "hole"],
  ])(
    "%s is NOT the count %s of %s — a size, or another noun",
    (word, n, noun) => {
      expect(wordIsCount(word, n, noun)).toBe(false);
    }
  );

  it("counts a bare number only when its noun follows", () => {
    expect(phraseHoldsCount("3 hole 5 hub", "3", "hole")).toBe(true);
    expect(phraseHoldsCount("3 hole 5 hub", "5", "hole")).toBe(false);
    expect(phraseHoldsCount("2 two inch", "2", "hole")).toBe(false);
    expect(phraseHoldsCount("three quarter", "3", "gang")).toBe(false);
  });
});
