/** server/planKeys.ts — the one check every key the browser hands back passes. */
import { describe, expect, it } from "vitest";
import { ownsPlanKey } from "./planKeys";

describe("ownsPlanKey", () => {
  it("accepts a key this server would mint for the bid", () => {
    expect(ownsPlanKey("bid-plans/5/7/E1_ab12cd34.pdf", 5, 7)).toBe(true);
    expect(ownsPlanKey("bid-plans/5/7/Set 2 (rev).pdf", 5, 7)).toBe(true);
  });

  it("refuses another company's or another bid's prefix", () => {
    expect(ownsPlanKey("bid-plans/9/7/E1.pdf", 5, 7)).toBe(false);
    expect(ownsPlanKey("bid-plans/5/8/E1.pdf", 5, 7)).toBe(false);
    // 55 is not 5: the slash after the id is part of the prefix.
    expect(ownsPlanKey("bid-plans/55/7/E1.pdf", 5, 7)).toBe(false);
  });

  it("refuses a key that climbs out of its own folder (passed before 2026-10-14)", () => {
    expect(ownsPlanKey("bid-plans/5/7/../../9/8/theirs.pdf", 5, 7)).toBe(false);
    expect(ownsPlanKey("bid-plans/5/7/./E1.pdf", 5, 7)).toBe(false);
    expect(ownsPlanKey("bid-plans/5/7//E1.pdf", 5, 7)).toBe(false);
    expect(ownsPlanKey("bid-plans/5/7/..\\..\\9\\E1.pdf", 5, 7)).toBe(false);
    expect(ownsPlanKey("bid-plans/5/7/", 5, 7)).toBe(false);
  });
});
