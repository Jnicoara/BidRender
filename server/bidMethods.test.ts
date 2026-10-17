/**
 * Bid methods (references/bid-methods-plan.md § 1, § 4, § 7): each bid prices
 * ONE way, and the engine — not the screen — keeps the other method's
 * settings out of it. Pure: no database.
 *
 * The owner's test is the first block: a Cost + O&P bid at material markup
 * 0% and 50%, and quoted-gear markup 0% and 50%, is one total to the cent;
 * the mirror is a Markup + charge rate bid at overhead and profit 0% and 50%.
 * Every number in the hand-checked blocks is worked in its comment.
 */
import { describe, expect, it } from "vitest";
import {
  bottomOfBidRatio,
  calculateBidPrice,
  calculateLineItem,
  sumLineCosts,
  type OverheadSetting,
  type ProfitSetting,
} from "../shared/pricing";
import {
  effectiveMargin,
  effectiveMarginLine,
  howBidLine,
  lineMethodTerms,
  methodForNewBid,
  methodInputs,
  priceBid,
  type PricingMethod,
} from "../shared/bidMethods";
import {
  priceExpenses,
  sumMarkedUpExpenses,
  type ExpenseLine,
} from "../shared/bidExtras";

type FixtureLine = {
  material: number;
  hours: number;
  costRate: number;
  qty: number;
  /** Frozen material markup — a rule's, or a quoted line's own. */
  markupPct: number;
  chargeRate: number | null;
};

function price(
  method: PricingMethod | null,
  lines: FixtureLine[],
  settings: {
    overhead: OverheadSetting;
    profit: ProfitSetting;
    companyMaterialMarkupPct: number;
  },
  expenses: ExpenseLine[] = []
) {
  const breakdowns = lines.map(l =>
    calculateLineItem({
      materials: [{ costPerUnit: l.material, qty: 1 }],
      baseLaborHours: l.hours,
      laborRate: l.costRate,
      quantity: l.qty,
      ...lineMethodTerms(method, {
        materialMarkupPct: l.markupPct,
        chargeRate: l.chargeRate,
      }),
    })
  );
  const sums = sumLineCosts(breakdowns);
  const directCost = sums.directCost + sumMarkedUpExpenses(expenses);
  const bid = priceBid(
    methodInputs(
      method,
      {
        directCost,
        materialMarkup: sums.materialMarkup,
        laborMarkup: sums.laborMarkup,
      },
      settings,
      expenses
    )
  );
  const billed = priceExpenses(expenses, bid.expenseUplift);
  return { bid, sums, breakdowns, billed };
}

const OH = (value: number): OverheadSetting => ({
  enabled: true,
  mode: "percentage",
  value,
});
const PROFIT = (value: number): ProfitSetting => ({ method: "markup", value });

const devices: FixtureLine = {
  material: 12.37,
  hours: 0.55,
  costRate: 62.4,
  qty: 14,
  markupPct: 0,
  chargeRate: 95,
};
const quotedPanel: FixtureLine = {
  material: 2840.5,
  hours: 6,
  costRate: 62.4,
  qty: 1,
  markupPct: 0,
  chargeRate: 95,
};
const permit: ExpenseLine = { name: "Permit", amount: 310, markedUp: true };

describe("no stacking — the owner's four-way test", () => {
  it("Cost + O&P: material markup 0%/50% and quoted markup 0%/50% give ONE total", () => {
    const totals = new Set<number>();
    for (const materialPct of [0, 0.5])
      for (const quotedPct of [0, 0.5]) {
        const { bid, sums, breakdowns } = price(
          "cost_op",
          [
            { ...devices, markupPct: materialPct },
            { ...quotedPanel, markupPct: quotedPct },
          ],
          {
            overhead: OH(0.12),
            profit: PROFIT(0.1),
            companyMaterialMarkupPct: materialPct,
          },
          [permit]
        );
        expect(bid.materialMarkup).toBe(0);
        // Per LINE too: a unit on the proposal is priced from its lines'
        // cost-with-markup, so a markup left on a line leaks into it.
        expect(sums.materialMarkup).toBe(0);
        for (const line of breakdowns)
          expect(line.costWithMarkup).toBe(line.directCost);
        totals.add(bid.finalPrice);
      }
    expect(totals.size).toBe(1);
  });

  it("the old math DOES move with markup — the test above can go red", () => {
    const at = (p: number) =>
      price(null, [{ ...devices, markupPct: p }], {
        overhead: OH(0.12),
        profit: PROFIT(0.1),
        companyMaterialMarkupPct: p,
      }).bid.finalPrice;
    expect(at(0.5)).toBeGreaterThan(at(0));
  });

  it("Markup + charge rate: overhead 0%/50% and profit 0%/50% give ONE total", () => {
    const totals = new Set<number>();
    for (const oh of [0, 0.5])
      for (const profit of [0, 0.5]) {
        const { bid } = price(
          "markup_rate",
          [
            { ...devices, markupPct: 0.4 },
            { ...quotedPanel, markupPct: 0.15 },
          ],
          {
            overhead: OH(oh),
            profit: { method: "margin", value: profit },
            companyMaterialMarkupPct: 0.25,
          },
          [permit]
        );
        expect(bid.overheadAmount).toBe(0);
        expect(bid.profitAmount).toBe(0);
        totals.add(bid.finalPrice);
      }
    expect(totals.size).toBe(1);
  });
});

describe("Markup + charge rate — hand-checked", () => {
  /*
    Material $100.00 at 25% markup        = $125.00
    2 h labor, cost $50/h, charge $80/h   = $100.00 cost, $160.00 billed
    Permit $50.00 marked up, company 10%  = $55.00
    Cost   100 + 100 + 50                 = $250.00
    Price  125 + 160 + 55                 = $340.00
  */
  const run = () =>
    price(
      "markup_rate",
      [
        {
          material: 100,
          hours: 2,
          costRate: 50,
          qty: 1,
          markupPct: 0.25,
          chargeRate: 80,
        },
      ],
      { overhead: OH(0.3), profit: PROFIT(0.3), companyMaterialMarkupPct: 0.1 },
      [{ name: "Permit", amount: 50, markedUp: true }]
    );

  it("prices material + markup, labor at charge, the charge at the company %", () => {
    const { bid, sums } = run();
    expect(sums.laborMarkup).toBe(60);
    expect(bid.directCost).toBe(250);
    expect(bid.materialMarkup).toBe(25);
    expect(bid.laborMarkup).toBe(60);
    expect(bid.expenseMarkup).toBe(5);
    expect(bid.finalPrice).toBe(340);
  });

  it("bills the permit at $55.00, so the work alone is $285.00", () => {
    const { bid, billed } = run();
    expect(billed.lines[0].charged).toBe(55);
    expect(bid.finalPrice - billed.markedUpCharged).toBe(285);
  });

  it("a role with no charge rate is Not priced, never billed at cost", () => {
    const [line] = price(
      "markup_rate",
      [
        {
          material: 0,
          hours: 2,
          costRate: 50,
          qty: 1,
          markupPct: 0,
          chargeRate: null,
        },
      ],
      { overhead: OH(0), profit: PROFIT(0), companyMaterialMarkupPct: 0 }
    ).breakdowns;
    expect(line.laborNotPriced).toBe(true);
    expect(line.laborCost).toBe(0);
    expect(line.costWithMarkup).toBe(0);
  });

  it("a charge rate below cost is a negative labor markup, not hidden", () => {
    const [line] = price(
      "markup_rate",
      [
        {
          material: 0,
          hours: 2,
          costRate: 78.15,
          qty: 1,
          markupPct: 0,
          chargeRate: 70,
        },
      ],
      { overhead: OH(0), profit: PROFIT(0), companyMaterialMarkupPct: 0 }
    ).breakdowns;
    expect(line.laborCost).toBe(156.3);
    expect(line.laborMarkup).toBe(-16.3);
    expect(line.costWithMarkup).toBe(140);
  });
});

describe("Cost + O&P — hand-checked", () => {
  it("$100 material + $100 labor, overhead 10%, profit 10% markup = $242.00", () => {
    // 200 → +10% = 220 → +10% = 242. The frozen 50% markup is not read.
    const { bid } = price(
      "cost_op",
      [
        {
          material: 100,
          hours: 2,
          costRate: 50,
          qty: 1,
          markupPct: 0.5,
          chargeRate: 999,
        },
      ],
      { overhead: OH(0.1), profit: PROFIT(0.1), companyMaterialMarkupPct: 0.5 }
    );
    expect(bid.finalPrice).toBe(242);
    expect(bid.laborMarkup).toBe(0);
  });
});

describe("the old math is untouched", () => {
  it("prices exactly as calculateBidPrice across a grid of bids", () => {
    let checked = 0;
    for (const direct of [0, 0.01, 19.99, 1234.56, 98765.43])
      for (const markup of [0, 0.03, 410.11])
        for (const oh of [
          { enabled: false } as const,
          OH(0.125),
          { enabled: true, mode: "flat", value: 250 } as const,
        ])
          for (const profit of [
            PROFIT(0),
            PROFIT(0.18),
            { method: "margin", value: 0.2 } as const,
          ]) {
            const expected = calculateBidPrice({
              directCost: direct,
              materialMarkup: markup,
              overhead: oh,
              profit,
            });
            const got = priceBid({
              method: null,
              directCost: direct,
              materialMarkup: markup,
              overhead: oh,
              profit,
            });
            expect(got).toEqual({
              ...expected,
              method: null,
              laborMarkup: 0,
              expenseMarkup: 0,
              expenseUplift: bottomOfBidRatio(expected),
            });
            checked += 1;
          }
    expect(checked).toBe(135);
  });

  it("a line priced without a charge rate has no labor markup", () => {
    const line = calculateLineItem({
      materials: [{ costPerUnit: 10, qty: 1 }],
      baseLaborHours: 1,
      laborRate: 50,
    });
    expect(line.laborMarkup).toBe(0);
    expect(line.laborNotPriced).toBe(false);
    expect(line.costWithMarkup).toBe(60);
  });
});

describe("effective margin", () => {
  it("cost $18,420.00 → price $25,380.00 is 27.42% margin, 37.79% markup", () => {
    const m = effectiveMargin({ cost: 18420, price: 25380 });
    expect(m.margin).toBeCloseTo(6960 / 25380, 10);
    expect(m.markup).toBeCloseTo(6960 / 18420, 10);
  });

  it("reads as one line with both numbers named", () => {
    const usd = (n: number) =>
      `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    expect(
      effectiveMarginLine(effectiveMargin({ cost: 18420, price: 25380 }), usd)
    ).toBe(
      "Effective margin 27.4% (markup 37.8%) · cost $18,420.00 → price $25,380.00"
    );
    expect(
      effectiveMarginLine(effectiveMargin({ cost: 0, price: 0 }), usd)
    ).toBeNull();
  });

  it("says nothing it cannot divide by", () => {
    expect(effectiveMargin({ cost: 0, price: 0 })).toMatchObject({
      margin: null,
      markup: null,
    });
    expect(effectiveMargin({ cost: 0, price: 10 }).markup).toBeNull();
  });
});

describe("what each bid says it used", () => {
  it("names each method and the old way", () => {
    expect(
      howBidLine({
        method: "cost_op",
        overhead: OH(0.12),
        profit: PROFIT(0.1),
        materialMarkup: 0,
      })
    ).toBe("Priced by Cost + O&P: overhead 12%, profit 10% markup.");
    expect(
      howBidLine({
        method: "markup_rate",
        overhead: OH(0.12),
        profit: PROFIT(0.1),
        materialMarkup: 40,
        markupWords: "by rule (brackets)",
        chargeRates: [
          { role: "Journeyman", rate: 95 },
          { role: "Helper", rate: null },
        ],
      })
    ).toBe(
      "Priced by Markup + charge rate: material markup by rule (brackets), Journeyman $95.00/h charge, Helper has no charge rate (not priced)."
    );
    expect(
      howBidLine({
        method: null,
        overhead: OH(0.12),
        profit: { method: "margin", value: 0.15 },
        materialMarkup: 3.2,
      })
    ).toBe(
      "Priced the old way, all together: material markup + overhead 12% + profit 15% margin."
    );
    expect(
      howBidLine({
        method: null,
        overhead: { enabled: false },
        profit: PROFIT(0),
        materialMarkup: 51.17,
      })
    ).toBe("Priced the old way: material markup only.");
    expect(
      howBidLine({
        method: null,
        overhead: { enabled: false },
        profit: PROFIT(0),
        materialMarkup: 0,
      })
    ).toBe("Priced the old way: at cost, with no markup, overhead or profit.");
  });

  it("a company that never chose bids new work by Cost + O&P", () => {
    expect(methodForNewBid(null)).toBe("cost_op");
    expect(methodForNewBid(undefined)).toBe("cost_op");
    expect(methodForNewBid("markup_rate")).toBe("markup_rate");
  });
});
