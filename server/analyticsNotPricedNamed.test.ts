/**
 * Which bids the analytics "not priced — N bids" note NAMES (never-stuck
 * plan, gap 7). Pure: `notPricedNamed` over rows, no database.
 *
 * The names must come from the SAME rule as the count beside them
 * (`tallyLeavesOut`), so a note can never say "3 bids" and list two others —
 * and that rule includes drops (server/dropsNotPriced.test.ts).
 */
import { describe, expect, it } from "vitest";
import { NOT_PRICED_NAMED, notPricedNamed } from "./analytics";
import type { NotPricedTally } from "../shared/lineNotPriced";

const NONE: NotPricedTally = { lines: 0, parts: 0, hours: 0, drops: 0 };
const row = (id: number, notPriced: Partial<NotPricedTally> = {}) => ({
  id,
  name: `Bid ${id}`,
  notPriced: { ...NONE, ...notPriced },
});

describe("notPricedNamed", () => {
  it("names exactly the bids the count counts", () => {
    const rows = [
      row(1),
      row(2, { lines: 1 }),
      row(3, { parts: 2 }),
      row(4, { hours: 1 }),
      row(5, { drops: 3 }),
    ];
    expect(notPricedNamed(rows)).toEqual([
      { bidId: 2, name: "Bid 2" },
      { bidId: 3, name: "Bid 3" },
      { bidId: 4, name: "Bid 4" },
      { bidId: 5, name: "Bid 5" },
    ]);
  });

  it("stays a note: at most NOT_PRICED_NAMED, in the order given", () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1, { lines: 1 }));
    const named = notPricedNamed(rows);
    expect(named).toHaveLength(NOT_PRICED_NAMED);
    expect(named[0].bidId).toBe(1);
  });

  it("names nothing when nothing is unpriced", () => {
    expect(notPricedNamed([row(1), row(2)])).toEqual([]);
  });
});
