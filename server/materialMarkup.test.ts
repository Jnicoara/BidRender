/**
 * Material markup — the rule order, what a line stores, and the promise that
 * made the migration additive: a line stored before markup existed prices
 * exactly as it did, to the cent.
 *
 * Design and decisions: references/material-markup.md.
 *
 * Pure: no database. The end-to-end half (rules stored on add, Draft-only
 * re-apply, dashboard agreement) is server/materialMarkupAgreement.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  describeLineMarkup,
  LEGACY_MARKUP_LABEL,
  MARKUP_RULE_ORDER,
  markupDiffers,
  markupReapplyRefusal,
  materialItemKey,
  NO_MARKUP_RULES,
  resolveLineMarkup,
  resolvePartMarkup,
  storedMarkupPct,
  type MarkupPart,
  type MarkupRuleSet,
} from "../shared/materialMarkup";
import { calculateLineItem } from "../shared/pricing";
import { bidRollup } from "./bidPricing";
import { buildAccountingExport } from "../shared/accountingExport";
import type { Bid, BidLineItem } from "../drizzle/schema";

const rules = (over: Partial<MarkupRuleSet> = {}): MarkupRuleSet => ({
  ...NO_MARKUP_RULES,
  ...over,
});

const part = (over: Partial<MarkupPart> = {}): MarkupPart => ({
  materialId: 1,
  itemKey: 1,
  category: "Wire & Cable",
  packPrice: null,
  cost: 10,
  ...over,
});

// ─── The order ────────────────────────────────────────────────────────────────

describe("the rule order", () => {
  it("is exactly the decided order, with the two future slots in place", () => {
    // D4: item override -> quoted line -> category -> price band -> default.
    expect(MARKUP_RULE_ORDER).toEqual([
      "item",
      "quoted",
      "category",
      "band",
      "company",
    ]);
  });

  const full = rules({
    items: new Map([[1, 0.5]]),
    quotedLinePct: 0.07,
    categories: new Map([["Wire & Cable", 0.3]]),
    bands: [{ minPrice: 0, maxPrice: null, pct: 0.2 }],
    companyDefault: 0.1,
  });

  it("takes the item override over everything", () => {
    const r = resolvePartMarkup(part({ packPrice: 5 }), full, {
      quotedLine: true,
    });
    expect(r).toMatchObject({ pct: 0.5, level: "item" });
    expect(r.label).toBe("from item override");
  });

  it("takes the quoted-line markup next, but only on a quoted line", () => {
    const withoutItem = part({ itemKey: 99, packPrice: 5 });
    expect(
      resolvePartMarkup(withoutItem, full, { quotedLine: true }).level
    ).toBe("quoted");
    expect(
      resolvePartMarkup(withoutItem, full, { quotedLine: false }).level
    ).toBe("category");
  });

  it("then the category, then the band, then the company default", () => {
    const noItem = part({ itemKey: 99, packPrice: 5 });
    expect(resolvePartMarkup(noItem, full)).toMatchObject({
      pct: 0.3,
      level: "category",
      label: "from Wire & Cable category",
    });
    const noCategory = { ...noItem, category: "Boxes" };
    expect(resolvePartMarkup(noCategory, full)).toMatchObject({
      pct: 0.2,
      level: "band",
    });
    const noBand = { ...noCategory, packPrice: null };
    expect(resolvePartMarkup(noBand, full)).toMatchObject({
      pct: 0.1,
      level: "company",
      label: "from company default",
    });
  });

  it("says 'no rule' at 0% when nothing matches, rather than guessing", () => {
    expect(resolvePartMarkup(part(), NO_MARKUP_RULES)).toEqual({
      pct: 0,
      level: "none",
      label: "no markup rule set",
    });
  });

  it("treats a company default of 0% as a rule, and no default as none", () => {
    // They read differently on a bid line, and only one is a decision.
    expect(resolvePartMarkup(part(), rules({ companyDefault: 0 })).level).toBe(
      "company"
    );
    expect(
      resolvePartMarkup(part(), rules({ companyDefault: null })).level
    ).toBe("none");
  });

  it("never matches a band while the pack price is unknown (D3, Piece 2)", () => {
    const withBands = rules({
      bands: [{ minPrice: 0, maxPrice: null, pct: 0.75 }],
    });
    expect(resolvePartMarkup(part({ packPrice: null }), withBands).level).toBe(
      "none"
    );
  });

  it("puts a band's lower bound inside and its upper bound outside", () => {
    const bands = rules({
      bands: [
        { minPrice: 0, maxPrice: 1, pct: 0.75 },
        { minPrice: 1, maxPrice: 10, pct: 0.4 },
      ],
    });
    const at = (packPrice: number) =>
      resolvePartMarkup(
        part({ itemKey: null, category: null, packPrice }),
        bands
      ).pct;
    expect(at(0.99)).toBe(0.75);
    expect(at(1)).toBe(0.4);
  });
});

// ─── Forks ────────────────────────────────────────────────────────────────────

describe("an item override survives the company forking the material", () => {
  it("keys a shipped row and its fork the same", () => {
    // Editing a shipped material makes a fork with baselineId -> the shipped
    // id. An override keyed by the raw id would stop matching the moment
    // somebody fixed a price, and the markup would fall to the default.
    expect(materialItemKey({ id: 40, baselineId: null })).toBe(40);
    expect(materialItemKey({ id: 9001, baselineId: 40 })).toBe(40);
  });
});

// ─── A line ───────────────────────────────────────────────────────────────────

describe("one line from its parts", () => {
  it("blends parts that matched different rules by COST, not by count", () => {
    // $30 of wire at 40% and $10 of boxes at 0% is $12 of markup on $40 —
    // 30%, not the 20% an unweighted average would say.
    const set = rules({ categories: new Map([["Wire & Cable", 0.4]]) });
    const { pct, source } = resolveLineMarkup(
      [
        part({ materialId: 1, itemKey: 1, category: "Wire & Cable", cost: 30 }),
        part({ materialId: 2, itemKey: 2, category: "Boxes", cost: 10 }),
      ],
      set
    );
    expect(pct).toBeCloseTo(0.3, 10);
    expect(source.level).toBe("mixed");
    expect(source.label).toBe(
      "Mixed — 1 from Wire & Cable category, 1 no markup rule set"
    );
    // The composition travels with it, for re-apply.
    expect(source.parts).toEqual([
      { materialId: 1, cost: 30 },
      { materialId: 2, cost: 10 },
    ]);
  });

  it("labels a line whose parts all agree with that one source", () => {
    const set = rules({ companyDefault: 0.25 });
    const { pct, source } = resolveLineMarkup(
      [part({ materialId: 1 }), part({ materialId: 2 })],
      set
    );
    expect(pct).toBe(0.25);
    expect(source).toMatchObject({
      level: "company",
      label: "from company default",
    });
  });

  it("resolves a hand-typed price (no parts) at the company default", () => {
    const { pct, source } = resolveLineMarkup(
      [],
      rules({ companyDefault: 0.15, categories: new Map([["Boxes", 0.9]]) })
    );
    expect(pct).toBe(0.15);
    expect(source).toEqual({
      level: "company",
      label: "from company default",
      parts: [],
    });
  });

  it("does not divide by zero when every part is unpriced", () => {
    const set = rules({ categories: new Map([["Wire & Cable", 0.4]]) });
    const { pct } = resolveLineMarkup(
      [part({ cost: 0 }), part({ category: "Boxes", cost: 0 })],
      set
    );
    expect(Number.isFinite(pct)).toBe(true);
  });
});

// ─── What a line prices with ──────────────────────────────────────────────────

describe("a stored line", () => {
  it("reads NULL — a line from before markup rules — as 0%", () => {
    expect(storedMarkupPct(null)).toBe(0);
    expect(storedMarkupPct("0.350000")).toBe(0.35);
  });

  it("says where its markup came from, and says so for an old line", () => {
    expect(
      describeLineMarkup({
        snapshotMarkupPct: null,
        snapshotMarkupSource: null,
      })
    ).toBe(LEGACY_MARKUP_LABEL);
    expect(
      describeLineMarkup({
        snapshotMarkupPct: "0.350000",
        snapshotMarkupSource: {
          level: "category",
          label: "from Wire & Cable category",
          parts: [],
        },
      })
    ).toBe("35% markup from Wire & Cable category");
    expect(
      describeLineMarkup({
        snapshotMarkupPct: "0.000000",
        snapshotMarkupSource: {
          level: "none",
          label: "no markup rule set",
          parts: [],
        },
      })
    ).toBe("no markup rule set");
  });

  it("marks up material only, rounded to the cent at the line", () => {
    // $12.345 a unit rounds to $12.35 first (the price on the recipe), so 3 is
    // $37.05 of material; 35% of that is $12.9675 -> $12.97. Labor is
    // untouched by it.
    const line = calculateLineItem({
      materials: [{ costPerUnit: 12.345, qty: 1 }],
      baseLaborHours: 1,
      laborRate: 50,
      quantity: 3,
      materialMarkupPct: 0.35,
    });
    expect(line.materialCost).toBe(37.05);
    expect(line.materialMarkup).toBe(12.97);
    expect(line.laborCost).toBe(150);
    expect(line.directCost).toBe(187.05);
    expect(line.costWithMarkup).toBe(200.02);
  });

  it("refuses a negative markup rather than discounting material", () => {
    expect(() =>
      calculateLineItem({
        materials: [{ costPerUnit: 10, qty: 1 }],
        baseLaborHours: 0,
        laborRate: 0,
        materialMarkupPct: -0.1,
      })
    ).toThrow(/cannot be negative/);
  });

  it("counts a stored-NULL line as unchanged when today's rules also say 0%", () => {
    expect(markupDiffers(null, 0)).toBe(false);
    expect(markupDiffers(null, 0.1)).toBe(true);
    expect(markupDiffers("0.100000", 0.1)).toBe(false);
  });
});

// ─── Draft only ───────────────────────────────────────────────────────────────

describe("re-applying rules", () => {
  it("is allowed on an unlocked Draft bid", () => {
    expect(
      markupReapplyRefusal({ status: "Draft", quantitiesLockedAt: null })
    ).toBeNull();
  });

  it.each(["Active", "Won", "Lost"])("is refused on a %s bid", status => {
    expect(markupReapplyRefusal({ status, quantitiesLockedAt: null })).toMatch(
      /frozen/
    );
  });

  it("is refused on a locked Draft bid", () => {
    expect(
      markupReapplyRefusal({ status: "Draft", quantitiesLockedAt: new Date() })
    ).toMatch(/locked/);
  });
});

// ─── The additive promise ─────────────────────────────────────────────────────

describe("a bid from before markup rules prices exactly as it did", () => {
  /*
    These numbers were NOT computed by the code under test. They are the
    output of the same fixture run through the tree at commit 096774a — before
    material markup existed — from a separate `git worktree`. A test that
    compared the new code with itself would pass whatever it did.

    The fixture is chosen to touch every place the markup change went near:
    fractional quantities, a blank typed price, a negative modifier,
    percentage overhead, a TARGET MARGIN, productivity, sales tax on the
    billed price with only materials taxable, a marked-up charge and a flat
    one, and two units.

    Every line's snapshotMarkupPct is NULL, as every line in every database
    was before migration 0078.
  */
  const bid = {
    id: 1,
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: "0.1250",
    profitMethod: "margin",
    profitValue: "0.1800",
    productivityPct: "0.0700",
    taxRateOverridePct: "8.3750",
    taxJurisdictionId: null,
    siteAddress: null,
    taxExempt: false,
  } as unknown as Bid;

  const line = (
    id: number,
    cost: string | null,
    hours: string | null,
    qty: string,
    rate: string,
    mod: string,
    unitLabel: string | null
  ) =>
    ({
      id,
      qty,
      unitLabel,
      snapshotMaterialCost: cost,
      snapshotLaborHours: hours,
      snapshotModifierPct: mod,
      snapshotLaborRate: rate,
      snapshotMarkupPct: null,
      snapshotMarkupSource: null,
    }) as unknown as BidLineItem;

  const lines = [
    line(1, "12.3456", "0.4500", "17.0000", "62.5000", "0.1200", "Room A"),
    line(2, "0.4125", "0.0150", "333.3300", "58.0000", "0.0000", "Room A"),
    line(3, "1840.0000", "6.0000", "1.0000", "71.2500", "0.2000", "Room B"),
    line(4, null, null, "14.0000", "0.0000", "0.0000", null),
    line(5, "7.0100", "0.3300", "2.5000", "62.5000", "-0.0500", "Room B"),
  ];

  const company = {
    overheadEnabled: false,
    overheadMode: "percentage" as const,
    overheadValue: 0,
    profitMethod: "markup" as const,
    profitValue: 0,
    productivityPct: 0,
  };

  const out = bidRollup(
    bid,
    lines,
    company,
    {
      rules: {
        enabled: true,
        taxMaterials: true,
        taxLabor: false,
        applyTo: "price",
      },
      jurisdictions: [],
    },
    [
      { name: "Permit", amount: 412.37, taxable: true, markedUp: true },
      { name: "Dump fee", amount: 95, taxable: false, markedUp: false },
    ]
  );

  it("to the cent, on every total", () => {
    expect(out.totals.finalPrice).toBe(5626.55);
    expect(out.totals.workPrice).toBe(5060.8);
    expect(out.totals.directCost).toBe(4101.13);
    expect(out.totals.overheadAmount).toBe(512.64);
    expect(out.totals.profitAmount).toBe(1012.78);
    expect(out.totals.materialCost).toBe(2204.15);
    expect(out.totals.laborCost).toBe(1484.61);
    expect(out.totals.totalDue).toBe(6022.19);
    expect(out.totals.materialMarkup).toBe(0);
  });

  it("to the cent, on tax, charges, units and the accounting split", () => {
    expect(out.salesTax.amount).toBe(300.64);
    expect(out.salesTax.taxableMaterial).toBe(3023.99);
    expect(out.totals.expensesTotal).toBe(660.75);
    expect(out.totals.expenseLines.map(l => l.charged)).toEqual([565.75, 95]);
    expect(out.units.map(u => [u.label, u.directCost])).toEqual([
      ["Room A", 1229.91],
      ["Room B", 2458.85],
    ]);
    const exported = buildAccountingExport(
      {
        bidId: 1,
        bidName: "Golden",
        customerName: null,
        status: "Draft",
        totals: out.totals,
      },
      new Date(0)
    );
    expect(exported.lines.map(l => [l.item, l.amount])).toEqual([
      ["Materials", 3023.99],
      ["Labor", 2036.81],
      ["Other charges", 565.75],
      ["Other charges", 95],
      ["Sales tax", 300.64],
    ]);
  });
});
