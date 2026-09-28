/**
 * How a bid's plans are counted in words (shared/planCounts.ts). The point
 * worth pinning: a page count that is only partly known must not be shown as
 * the bid's sheet count.
 */
import { describe, expect, it } from "vitest";
import {
  planCountLabel,
  recentPlanBids,
  type PlanCounts,
} from "../shared/planCounts";

const counts = (over: Partial<PlanCounts>): PlanCounts => ({
  sets: 1,
  pages: 5,
  setsUncounted: 0,
  lastUploadedAt: new Date("2026-09-20T12:00:00Z"),
  ...over,
});

describe("planCountLabel", () => {
  it("says nothing for a bid with no plans", () => {
    expect(planCountLabel(counts({ sets: 0, pages: 0 }))).toBeNull();
  });

  it("counts sheets when every set's pages are known", () => {
    expect(planCountLabel(counts({ sets: 2, pages: 42 }))).toBe("42 sheets");
    expect(planCountLabel(counts({ pages: 1 }))).toBe("1 sheet");
  });

  it("counts sets when any set has not been opened yet — never a short sheet count", () => {
    expect(
      planCountLabel(counts({ sets: 3, pages: 20, setsUncounted: 1 }))
    ).toBe("3 plan sets");
    expect(
      planCountLabel(counts({ sets: 1, pages: 0, setsUncounted: 1 }))
    ).toBe("1 plan set");
  });
});

describe("recentPlanBids", () => {
  const bid = (id: number, day: number | null, sets = 1) => ({
    id,
    plans: counts({
      sets,
      lastUploadedAt:
        day === null ? null : new Date(`2026-09-${10 + day}T12:00:00Z`),
    }),
  });

  it("lists bids with plans, newest upload first, and stops at the limit", () => {
    const list = recentPlanBids(
      [bid(1, 1), bid(2, 5), bid(3, null, 0), bid(4, 3), bid(5, 4), bid(6, 2)],
      4
    );
    expect(list.map(b => b.id)).toEqual([2, 5, 4, 6]);
  });
});
