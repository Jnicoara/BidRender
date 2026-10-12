import { describe, expect, it } from "vitest";
import {
  effectiveScopeFilter,
  filterByScope,
  scopeCounts,
  scopeSummaryWords,
  showScopeCounts,
} from "./scopeSummary";

const line = (
  id: number,
  scopeTag: null | "install" | "ofci" | "by_others" | "excluded"
) => ({
  id,
  scopeTag,
});

describe("the who-does-what strip", () => {
  it("is hidden on the basic path: nothing tagged, or only We install", () => {
    expect(showScopeCounts([line(1, null), line(2, null)])).toBe(false);
    expect(showScopeCounts([line(1, null), line(2, "install")])).toBe(false);
    expect(showScopeCounts([line(1, null), line(2, "excluded")])).toBe(true);
  });

  it("counts not-said lines as We install, and says only what is there", () => {
    const lines = [
      line(1, null),
      line(2, "install"),
      line(3, "ofci"),
      line(4, "by_others"),
      line(5, "by_others"),
    ];
    expect(scopeSummaryWords(scopeCounts(lines)).map(w => w.text)).toEqual([
      "2 we install",
      "1 owner furnishes",
      "2 by others",
    ]);
  });

  it("a filter keeps its lines, and one whose lines are gone is no filter", () => {
    const lines = [line(1, null), line(2, "by_others"), line(3, "by_others")];
    expect(filterByScope(lines, "by_others").map(l => l.id)).toEqual([2, 3]);
    expect(filterByScope(lines, "install").map(l => l.id)).toEqual([1]);
    expect(filterByScope(lines, null).map(l => l.id)).toEqual([1, 2, 3]);
    expect(effectiveScopeFilter("by_others", lines)).toBe("by_others");
    expect(effectiveScopeFilter("excluded", lines)).toBe(null);
  });
});
