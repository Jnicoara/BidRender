/**
 * "FOR YOUR QUOTE APP" — the panel's figures against the bid's own rollup.
 * references/quote-app-panel-plan.md § 8.
 *
 *   T1   every bucket, every Misc charge included, adds up to Total due minus
 *        tax — to the cent, with tax ON and OFF
 *   T1a  the plan's worked example, literally
 *   T2   Material is the work price's material share, the split tax uses
 *   T3   a line with no price blocks every figure; nothing reads $0
 *   T3b  the figures are the customer's price: no cost appears
 *   T4   example-priced lines are said, when there are any
 *   T5   an empty bucket is "None", and the sample is flagged
 *   T6   the builder cannot work tax out
 *
 * The rollups here run on rows built in memory, through the same `bidRollup`
 * every screen uses, so the arithmetic under test is the app's and not a copy.
 * The router is checked against a real bid at the end.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { bidRollup, type RollupLine } from "./bidPricing";
import { getDb } from "./db";
import { bids, users, type Bid } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { apportionWorkPrice, toCents } from "../shared/pricing";
import { INTERNAL_FIELDS } from "../shared/accountingExport";
import {
  buildQuoteAppDoc,
  clipboardAmount,
  displayAmount,
  QUOTE_BUCKETS,
  quoteGaps,
  type QuoteAppDoc,
  type QuoteAppSource,
} from "../shared/quoteAppExport";
import type { TaxRules } from "../shared/salesTax";

// ─── Building a bid in memory ────────────────────────────────────────────────

type BidSettings = {
  overhead: number;
  profit: number;
  taxPct: number | null;
};

const bidRow = (s: BidSettings) =>
  ({
    id: 1,
    name: "Panel change out",
    isSample: false,
    overheadEnabled: true,
    overheadMode: "percentage",
    overheadValue: s.overhead.toFixed(4),
    profitMethod: "markup",
    profitValue: s.profit.toFixed(4),
    productivityPct: null,
    taxRateOverridePct: s.taxPct === null ? null : s.taxPct.toFixed(4),
    taxJurisdictionId: null,
    siteAddress: null,
    taxExempt: false,
  }) as unknown as Bid;

let nextId = 1;
const line = (fields: {
  name: string;
  cost: string | null;
  hours: string | null;
  rate?: string;
  qty?: string;
  markup?: string | null;
  assemblyId?: number | null;
  unpricedParts?: number;
}) =>
  ({
    id: nextId++,
    name: fields.name,
    qty: fields.qty ?? "1.0000",
    unitLabel: null,
    assemblyId: fields.assemblyId === undefined ? 1 : fields.assemblyId,
    takeoffRunTypeId: null,
    runMaterialRole: null,
    snapshotMaterialCost: fields.cost,
    snapshotLaborHours: fields.hours,
    snapshotModifierPct: "0",
    snapshotLaborRate: fields.rate ?? "60.0000",
    snapshotMarkupPct: fields.markup ?? null,
    snapshotMarkupSource: null,
    unpricedParts: fields.unpricedParts ?? 0,
  }) as unknown as RollupLine;

const COMPANY = {
  overheadEnabled: false,
  overheadMode: "percentage" as const,
  overheadValue: 0,
  profitMethod: "markup" as const,
  profitValue: 0,
  productivityPct: 0,
};

const TAX_OFF: TaxRules = {
  enabled: false,
  taxMaterials: true,
  taxLabor: false,
  applyTo: "price",
};
const TAX_ON_MATERIAL: TaxRules = { ...TAX_OFF, enabled: true };
const TAX_ON_BOTH: TaxRules = { ...TAX_ON_MATERIAL, taxLabor: true };

/** The panel for a bid, through the same steps the router takes. */
function panelFor(
  bid: Bid,
  lines: RollupLine[],
  expenses: { name: string; amount: number; markedUp: boolean }[],
  rules: TaxRules
) {
  const rollup = bidRollup(
    bid,
    lines,
    COMPANY,
    { rules, jurisdictions: [] },
    expenses.map(e => ({ ...e, taxable: true }))
  );
  const t = rollup.totals;
  const source: QuoteAppSource = {
    bidName: "Panel change out",
    isSample: false,
    gaps: quoteGaps(rollup.priced, rollup.problems),
    totals: {
      materialCost: t.materialCost,
      materialMarkup: t.materialMarkup,
      laborCost: t.laborCost,
      workPrice: t.workPrice,
      subtotal: t.subtotal,
      salesTaxAmount: t.salesTaxAmount,
      totalDue: t.totalDue,
      expenseLines: t.expenseLines.map(l => ({
        name: l.name,
        charged: l.charged,
      })),
    },
    examplePricedLines: 0,
    planWarnings: [],
  };
  return { doc: buildQuoteAppDoc(source), totals: t, source };
}

function ready(doc: QuoteAppDoc) {
  if (doc.state !== "ready")
    throw new Error(`expected ready, got ${doc.state}`);
  return doc;
}

/** Every figure in a ready doc, Misc by its rows, in cents. */
function bucketCents(doc: QuoteAppDoc) {
  const d = ready(doc);
  const out: Record<string, number | null> = {};
  for (const b of d.scopes[0].buckets) out[b.bucket] = b.cents;
  return out;
}

// ─── The worked example (plan § 5) ───────────────────────────────────────────

/*
  $600 material at 25% markup; 20 h × $60 labor; a $200 lift rental, MARKED
  UP; an $85 permit, FLAT; 10% overhead; 10% profit, markup method.
*/
const EXAMPLE_LINES = () => [
  line({
    name: "Panel change out",
    cost: "600.0000",
    hours: "20.0000",
    markup: "0.250000",
  }),
];
const EXAMPLE_EXPENSES = [
  { name: "Lift rental", amount: 200, markedUp: true },
  { name: "Permit", amount: 85, markedUp: false },
];

describe("the buckets add up to the bid's pre-tax total (T1)", () => {
  const cases: [string, number | null, TaxRules][] = [
    ["tax off", null, TAX_OFF],
    ["tax on material", 8, TAX_ON_MATERIAL],
    ["tax on material and labor", 8.25, TAX_ON_BOTH],
  ];

  it.each(cases)("to the cent, %s", (_label, pct, rules) => {
    // A second line with an awkward split, so the cents have to be exact.
    const lines = [
      ...EXAMPLE_LINES(),
      line({
        name: "Feeder",
        cost: "333.3300",
        hours: "7.3300",
        rate: "71.1700",
        qty: "3.0000",
        markup: "0.120000",
      }),
    ];
    const { doc, totals } = panelFor(
      bidRow({ overhead: 0.137, profit: 0.093, taxPct: pct }),
      lines,
      [
        ...EXAMPLE_EXPENSES,
        { name: "Dump fee", amount: 47.19, markedUp: true },
      ],
      rules
    );
    const d = ready(doc);
    const buckets = d.scopes[0].buckets;
    const everyFigure = buckets.reduce((c, b) => c + (b.cents ?? 0), 0);
    const miscRows = buckets
      .find(b => b.bucket === "Misc")!
      .rows.reduce((c, r) => c + r.cents, 0);

    // Tax is really on (or off) in this case, so "minus tax" means something.
    if (pct === null) expect(totals.salesTaxAmount).toBe(0);
    else expect(totals.salesTaxAmount).toBeGreaterThan(0);

    // Every Misc charge is in the Misc figure …
    expect(buckets.find(b => b.bucket === "Misc")!.cents).toBe(miscRows);
    expect(miscRows).toBe(toCents(totals.expensesTotal));
    // … and every bucket together is Total due minus tax, exactly.
    expect(everyFigure).toBe(
      toCents(totals.totalDue) - toCents(totals.salesTaxAmount)
    );
    expect(everyFigure).toBe(toCents(totals.subtotal));
    expect(d.preTaxCents).toBe(everyFigure);
    // Material and Labor are the work price, split with nothing left over.
    expect(
      (bucketCents(doc).Material ?? 0) + (bucketCents(doc).Labor ?? 0)
    ).toBe(toCents(totals.workPrice));
  });

  it("goes red if a charge were left out of Misc", () => {
    // The guard for T1 itself: drop one charge from the source and the sum
    // must stop matching the bid.
    const { source, totals } = panelFor(
      bidRow({ overhead: 0.1, profit: 0.1, taxPct: null }),
      EXAMPLE_LINES(),
      EXAMPLE_EXPENSES,
      TAX_OFF
    );
    const short = buildQuoteAppDoc({
      ...source,
      totals: {
        ...source.totals,
        expenseLines: source.totals.expenseLines.slice(1),
      },
    });
    expect(ready(short).preTaxCents).not.toBe(toCents(totals.subtotal));
  });
});

describe("the plan's worked example (T1a)", () => {
  const { doc, totals } = panelFor(
    bidRow({ overhead: 0.1, profit: 0.1, taxPct: null }),
    EXAMPLE_LINES(),
    EXAMPLE_EXPENSES,
    TAX_OFF
  );

  it("is Material $907.50, Labor $1,452.00, Misc $327.00, total $2,686.50", () => {
    const d = ready(doc);
    expect(d.scopes).toHaveLength(1);
    expect(d.scopes[0].buckets.map(b => b.bucket)).toEqual([...QUOTE_BUCKETS]);
    expect(bucketCents(doc)).toEqual({
      Tasks: null,
      Material: 90750,
      Equipment: null,
      Labor: 145200,
      Misc: 32700,
    });
    const misc = d.scopes[0].buckets.find(b => b.bucket === "Misc")!;
    expect(misc.rows).toEqual([
      { name: "Lift rental", cents: 24200 },
      { name: "Permit", cents: 8500 },
    ]);
    expect(d.preTaxCents).toBe(268650);
    expect(totals.finalPrice).toBe(2601.5);
    expect(totals.workPrice).toBe(2359.5);
  });

  it("copies exact cents and shows dollars", () => {
    expect(clipboardAmount(90750)).toBe("907.50");
    expect(clipboardAmount(145200)).toBe("1452.00");
    expect(clipboardAmount(8500)).toBe("85.00");
    expect(clipboardAmount(5)).toBe("0.05");
    expect(displayAmount(268650)).toBe("$2,686.50");
  });

  it("uses the split sales tax and QuickBooks use (T2)", () => {
    const split = apportionWorkPrice({
      workPrice: totals.workPrice,
      materialCost: totals.materialCost,
      materialMarkup: totals.materialMarkup,
      laborCost: totals.laborCost,
    })!;
    expect(bucketCents(doc).Material).toBe(split.materialCents);
    expect(bucketCents(doc).Labor).toBe(split.laborCents);
  });

  it("carries the customer's price, never a cost (T3b)", () => {
    const text = JSON.stringify(doc);
    // The example's costs: material, labor, direct cost, the lift at cost.
    for (const cost of ["60000", "120000", "200000", "20000"])
      expect(text).not.toMatch(new RegExp(`"cents":${cost}[,}]`));
    for (const field of INTERNAL_FIELDS)
      expect(text.toLowerCase().includes(field.toLowerCase()), field).toBe(
        false
      );
  });
});

describe("a line with no price blocks every figure (T3)", () => {
  const bid = bidRow({ overhead: 0.1, profit: 0.1, taxPct: null });

  it("lists each line by name and carries no figure at all", () => {
    const lines = [
      ...EXAMPLE_LINES(),
      // A hand-priced line nobody priced.
      line({
        name: "Owner's fixture",
        cost: null,
        hours: "1.0000",
        assemblyId: null,
      }),
      // An assembly line with parts missing a price.
      line({
        name: "Service mast",
        cost: "40.0000",
        hours: "2.0000",
        unpricedParts: 2,
      }),
      // One the engine cannot price.
      line({
        name: "Broken rate",
        cost: "10.0000",
        hours: "1.0000",
        rate: "NaN",
      }),
    ];
    const { doc } = panelFor(bid, lines, EXAMPLE_EXPENSES, TAX_OFF);
    expect(doc.state).toBe("blocked");
    if (doc.state !== "blocked") return;
    expect(doc.gaps.map(g => [g.name, g.status])).toEqual([
      ["Owner's fixture", "Not priced"],
      ["Service mast", "Not priced"],
      ["Broken rate", "Can't price"],
    ]);
    // No bucket, no total, nothing to copy — and no 0 anywhere.
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/cents|preTax|totalDue|scopes/);
    expect(text).not.toMatch(/:0[,}]/);
  });

  it("blocks hours priced at a $0 labor rate, rather than showing Labor as None", () => {
    // Found on screen 2026-09-29: the starter rates ship at $0.
    const { doc } = panelFor(
      bid,
      [
        line({
          name: "Panel swap",
          cost: "600.0000",
          hours: "20.0000",
          rate: "0",
        }),
      ],
      [],
      TAX_OFF
    );
    expect(doc.state).toBe("blocked");
    if (doc.state === "blocked")
      expect(doc.gaps).toEqual([
        {
          lineId: expect.any(Number),
          name: "Panel swap",
          status: "Not priced",
          detail: "labor rate not set",
        },
      ]);
  });

  it("opens with figures once the lines are priced", () => {
    const { doc } = panelFor(bid, EXAMPLE_LINES(), EXAMPLE_EXPENSES, TAX_OFF);
    expect(doc.state).toBe("ready");
  });
});

describe("what the panel says", () => {
  const { source } = panelFor(
    bidRow({ overhead: 0.1, profit: 0.1, taxPct: null }),
    EXAMPLE_LINES(),
    EXAMPLE_EXPENSES,
    TAX_OFF
  );

  it("says how many lines use an example price, when any do (T4)", () => {
    expect(ready(buildQuoteAppDoc(source)).examplePricedLines).toBe(0);
    expect(
      ready(buildQuoteAppDoc({ ...source, examplePricedLines: 2 }))
        .examplePricedLines
    ).toBe(2);
  });

  it("shows an empty bucket as None, and flags the sample (T5)", () => {
    const d = ready(
      buildQuoteAppDoc({
        ...source,
        isSample: true,
        totals: { ...source.totals, expenseLines: [] },
      })
    );
    expect(bucketCents(d).Tasks).toBeNull();
    expect(bucketCents(d).Equipment).toBeNull();
    expect(bucketCents(d).Misc).toBeNull();
    expect(d.isSample).toBe(true);
  });

  it("says subcontract lines go under Misc and attached items are left out", () => {
    const notes = ready(buildQuoteAppDoc(source)).notes.join(" ");
    expect(notes).toMatch(/Subcontract lines.*Misc/);
    expect(notes).toMatch(
      /Alternates, unit prices, allowances, exclusions and addenda are not in these figures/
    );
  });

  it("cannot work tax out: the builder never imports the tax engine (T6)", () => {
    const file = readFileSync("shared/quoteAppExport.ts", "utf8");
    expect(file).not.toMatch(/from\s+"\.\/salesTax"/);
    expect(file).not.toMatch(/calculateSalesTax/);
  });
});

// ─── The router, against a real bid ──────────────────────────────────────────

const USER = 9387;
const OUTSIDER = 9388;
dropFixtureUsersAfterAll([USER, OUTSIDER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (id: number, accessTier: "internal" | "standard") =>
  appRouter.createCaller({
    user: {
      id,
      openId: `test-quote-app-${id}`,
      role: "user",
      accessTier,
    },
  } as unknown as TrpcContext);

describe.skipIf(!hasDb)("quoteApp.get on a real bid", () => {
  beforeAll(async () => {
    const database = await getDb();
    for (const [id, tier] of [
      [USER, "internal"],
      [OUTSIDER, "standard"],
    ] as const) {
      const [existing] = await database!
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing)
        await database!.insert(users).values({
          id,
          openId: `test-quote-app-${id}`,
          name: `Quote app ${id}`,
          accessTier: tier,
        });
    }
  });

  beforeEach(async () => {
    const database = await getDb();
    await database!.delete(bids).where(inArray(bids.userId, [USER, OUTSIDER]));
  });

  const caller = () => callerFor(USER, "internal");

  it("adds up to the bid screen's own Total due minus tax", async () => {
    const material = await caller().materials.create({
      name: `Quote material ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const rate = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 50,
      })
    ).laborRate!;
    const assembly = await caller().assemblies.create({
      name: `Quote assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 1,
      laborRateId: rate.id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    await caller().bids.setPricingDefaults({
      overheadEnabled: true,
      overheadMode: "percentage",
      overheadValue: 0.1,
      profitMethod: "markup",
      profitValue: 0.2,
      productivityPct: 0,
    });
    const bid = (await caller().bids.create({
      name: `Quote bid ${Date.now()}`,
      trades: ["electrical"],
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly!.id,
      qty: 3,
    });
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "City permit",
      amount: 85,
    });

    const detail = await caller().bids.get({ id: bid.id });
    const d = ready(await caller().quoteApp.get({ bidId: bid.id }));
    expect(d.preTaxCents).toBe(
      toCents(detail.totals.totalDue) - toCents(detail.totals.salesTaxAmount)
    );
    const misc = d.scopes[0].buckets.find(b => b.bucket === "Misc")!;
    expect(misc.rows).toEqual([{ name: "City permit", cents: 8500 }]);
  });

  it("opens a bid with an unpriced line, listing it and no figures", async () => {
    // An assembly whose one material nobody priced and with no labor: its
    // whole cost is $0, which the bid shows as "Not priced".
    const material = await caller().materials.create({
      name: `Quote unpriced material ${Date.now()}${Math.random()}`,
      unitOfSale: "each",
      costPerUnit: 0,
      category: "Receptacles",
    });
    const assembly = await caller().assemblies.create({
      name: `Owner-supplied fixture ${Date.now()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 0,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    const bid = (await caller().bids.create({
      name: `Quote unpriced ${Date.now()}`,
      trades: ["electrical"],
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly!.id,
      qty: 2,
    });
    const doc = await caller().quoteApp.get({ bidId: bid.id });
    expect(doc.state).toBe("blocked");
    if (doc.state === "blocked") {
      expect(doc.gaps).toHaveLength(1);
      expect(doc.gaps[0].name).toMatch(/^Owner-supplied fixture/);
      expect(doc.gaps[0].status).toBe("Not priced");
    }
  });

  it("is not there for an account outside the internal tier", async () => {
    const bid = (await callerFor(OUTSIDER, "standard").bids.create({
      name: `Quote outsider ${Date.now()}`,
      trades: ["electrical"],
    }))!;
    await expect(
      callerFor(OUTSIDER, "standard").quoteApp.get({ bidId: bid.id })
    ).rejects.toThrow(/not found/i);
  });
});
