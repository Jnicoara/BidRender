import { describe, expect, it } from "vitest";
import { sumBidTotals, type SummableBid } from "@shared/bidTotals";
import { notPricedSuffix } from "../client/src/lib/notPricedTotal";

type Row = SummableBid & { totalDue: number };

const bid = (over: Partial<Row> = {}): Row => ({
  totalDue: 100,
  isSample: false,
  notPriced: { lines: 0, parts: 0 },
  incomplete: false,
  ...over,
});

const due = (b: Row) => b.totalDue;

describe("sumBidTotals — a total built from cards says what the cards leave out", () => {
  it("adds up the unpriced lines and parts of every bid it sums", () => {
    const sum = sumBidTotals(
      [
        bid({ notPriced: { lines: 3, parts: 0 } }),
        bid({ notPriced: { lines: 1, parts: 2 } }),
        bid(),
      ],
      due
    );
    expect(sum.total).toBe(300);
    expect(sum.notPriced).toEqual({ lines: 4, parts: 2 });
    // The words the headline shows — the fault was showing none.
    expect(notPricedSuffix(sum.notPriced)).toBe(
      "+ 4 lines, 2 parts not priced"
    );
  });

  it("keeps 'not priced' and 'can't be priced' apart", () => {
    const onlyUnpriced = sumBidTotals(
      [bid({ notPriced: { lines: 2, parts: 0 } })],
      due
    );
    expect(onlyUnpriced.incomplete).toBe(false);
    expect(onlyUnpriced.notPriced.lines).toBe(2);

    const onlyBroken = sumBidTotals([bid({ incomplete: true })], due);
    expect(onlyBroken.incomplete).toBe(true);
    expect(notPricedSuffix(onlyBroken.notPriced)).toBe("");
  });

  it("says nothing when nothing is left out", () => {
    const sum = sumBidTotals([bid(), bid()], due);
    expect(notPricedSuffix(sum.notPriced)).toBe("");
    expect(sum.incomplete).toBe(false);
  });

  it("leaves the sample out of the figure AND out of what it leaves out", () => {
    const sum = sumBidTotals(
      [
        bid({
          totalDue: 15000,
          isSample: true,
          notPriced: { lines: 9, parts: 9 },
          incomplete: true,
        }),
        bid({ totalDue: 250 }),
      ],
      due
    );
    expect(sum).toEqual({
      total: 250,
      count: 1,
      sampleExcluded: 1,
      notPriced: { lines: 0, parts: 0 },
      incomplete: false,
    });
  });

  it("equals the sum of the cards it is built from", () => {
    // Forcing: the headline cannot count something the cards do not.
    const cards = [
      bid({ notPriced: { lines: 2, parts: 1 } }),
      bid({ notPriced: { lines: 0, parts: 4 }, incomplete: true }),
      bid({ notPriced: { lines: 5, parts: 0 } }),
    ];
    const sum = sumBidTotals(cards, due);
    expect(sum.notPriced.lines).toBe(
      cards.reduce((n, c) => n + c.notPriced.lines, 0)
    );
    expect(sum.notPriced.parts).toBe(
      cards.reduce((n, c) => n + c.notPriced.parts, 0)
    );
  });

  it("is empty for no bids", () => {
    expect(sumBidTotals([], due)).toEqual({
      total: 0,
      count: 0,
      sampleExcluded: 0,
      notPriced: { lines: 0, parts: 0 },
      incomplete: false,
    });
  });
});
