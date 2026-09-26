/**
 * The accounting export: the numbers, and only the numbers.
 *
 * ── Three things this has to get right ───────────────────────────────────────
 *
 *   1. The file has to IMPORT. QuickBooks Online rejects a file whose columns
 *      it cannot map, whose dates it cannot read, or whose invoice rows do not
 *      share a reference. Those are structural and are asserted structurally.
 *
 *   2. The numbers have to match the bid EXACTLY. Not to within a cent — a
 *      penny adrift is a reconciliation somebody does by hand every month. The
 *      fixture is priced so every figure below is checkable by hand, and the
 *      totals are asserted against `bidRollup`'s own output rather than against
 *      numbers typed into this file, so the two cannot drift apart.
 *
 *   3. Nothing internal can leak. Overhead, profit and cost basis stay in the
 *      company. `describe("leaks nothing internal")` scans every generated file
 *      for every term in INTERNAL_FIELDS and for the literal cost figures, and
 *      it is written to fail if someone later widens the row builder — which is
 *      how this would actually happen, not by anyone typing "profit" into a
 *      header.
 *
 * The subtle case, and the reason the leak test is not just a string scan: the
 * labor and material figures ON A BID ARE COSTS. An export that passed them
 * through would look perfectly reasonable in review and would publish the
 * margin on every job. `discloses charges rather than costs` is the test that
 * pins that distinction.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bids, users } from "../drizzle/schema";
import {
  INTERNAL_FIELDS,
  NON_TAXABLE_CODE,
  QUICKBOOKS_COLUMNS,
  QUICKBOOKS_ITEMS,
  accountingFilename,
  buildAccountingExport,
  formatQuickBooksDate,
  invoiceReference,
  toQuickBooksCsv,
  type AccountingSource,
} from "../shared/accountingExport";
import { parsePriceList, splitDelimited } from "../shared/priceListParse";
import type { TrpcContext } from "./_core/context";

const USER = 9401;
const OTHER_USER = 9402;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

/**
 * Internal tier, because the QuickBooks export is gated to internal accounts
 * while its column format is confirmed against a real QuickBooks company.
 * See shared/permissions.ts § FEATURES — flipping it to everyone is one word
 * there, and this line then becomes unnecessary rather than wrong.
 */
const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-accounting-${userId}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);
const uniq = () => `${Date.now()}${Math.random()}`;

const NOW = new Date("2026-08-14T12:00:00Z");

/**
 * A source with everything zeroed, so each test states only what it varies.
 *
 * `totals` is partial as well — the defaults below are merged under whatever
 * a case passes. It used to be typed `Partial<AccountingSource>`, which is
 * shallow: it allowed leaving `totals` out but demanded every field once it
 * was given, so the day `materialMarkup` became required, twelve cases that
 * correctly relied on its default 0 stopped compiling (unseen, since pnpm
 * check skips tests). The type now says what the function does.
 */
const source = (
  over: Partial<Omit<AccountingSource, "totals">> & {
    totals?: Partial<AccountingSource["totals"]>;
  } = {}
): AccountingSource => ({
  bidId: 501,
  bidName: "Maple Street duplex",
  customerName: "Northwood Builders",
  status: "Won",
  ...over,
  totals: {
    materialCost: 0,
    // No material markup unless a case says so: every case here predates it,
    // and the split is weighted by cost + markup (apportionWorkPrice).
    materialMarkup: 0,
    laborCost: 0,
    workPrice: 0,
    salesTaxAmount: 0,
    totalDue: 0,
    expenseLines: [],
    ...over.totals,
  },
});

// ── The file QuickBooks reads ────────────────────────────────────────────────

describe("the file QuickBooks reads", () => {
  const doc = buildAccountingExport(
    source({
      totals: {
        materialCost: 1000,
        laborCost: 1000,
        workPrice: 2640,
        salesTaxAmount: 264,
        totalDue: 3004,
        expenseLines: [{ name: "City permit", charged: 100 }],
      },
    }),
    NOW
  );

  it("leads with the columns from the import template, in order", () => {
    const [header] = splitDelimited(toQuickBooksCsv(doc), ",");
    expect(header).toEqual([...QUICKBOOKS_COLUMNS]);
  });

  it("writes one row per line, all under one invoice reference", () => {
    const rows = splitDelimited(toQuickBooksCsv(doc), ",").slice(1);
    expect(rows).toHaveLength(doc.lines.length);
    expect(new Set(rows.map(r => r[0]))).toEqual(new Set(["BR-501"]));
  });

  it("dates in MM/DD/YYYY, which is what the US importer expects", () => {
    expect(formatQuickBooksDate(new Date("2026-01-05T00:00:00"))).toBe(
      "01/05/2026"
    );
    const rows = splitDelimited(toQuickBooksCsv(doc), ",").slice(1);
    for (const row of rows) {
      expect(row[2]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(row[3]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
  });

  it("marks every line non-taxable, because the tax is already a line", () => {
    // QuickBooks recalculates tax from a code rather than accepting an amount.
    // Left taxable, it would add its own tax on top of the tax line here and
    // the invoice would not match the bid.
    const rows = splitDelimited(toQuickBooksCsv(doc), ",").slice(1);
    expect(rows.every(r => r[10] === NON_TAXABLE_CODE)).toBe(true);
    expect(doc.lines.some(l => l.item === QUICKBOOKS_ITEMS.tax)).toBe(true);
  });

  it("quotes every field, so a comma in a customer name cannot split a row", () => {
    const awkward = buildAccountingExport(
      source({
        customerName: 'Northwood Builders, LLC — the "big" one',
        totals: {
          materialCost: 100,
          laborCost: 0,
          workPrice: 100,
          salesTaxAmount: 0,
          totalDue: 100,
          expenseLines: [],
        },
      }),
      NOW
    );
    const rows = splitDelimited(toQuickBooksCsv(awkward), ",");
    expect(rows[1]).toHaveLength(QUICKBOOKS_COLUMNS.length);
    expect(rows[1][1]).toBe('Northwood Builders, LLC — the "big" one');
  });

  it("writes amounts to two decimals, not floating point exhaust", () => {
    const csv = toQuickBooksCsv(doc);
    expect(csv).not.toMatch(/\d\.\d{3,}/);
    for (const row of splitDelimited(csv, ",").slice(1)) {
      expect(row[9]).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("keeps the reference stable across exports of the same bid", () => {
    expect(invoiceReference(501)).toBe("BR-501");
    expect(
      buildAccountingExport(source({ bidId: 501 }), new Date("2027-01-01"))
        .invoiceNo
    ).toBe("BR-501");
  });

  it("names the file after the reference and the date", () => {
    expect(accountingFilename(doc)).toBe("BR-501-quickbooks-2026-08-14.csv");
  });

  it("is readable by a strict CSV reader", () => {
    // Round-tripped through this repo's own RFC 4180 parser: if that can read
    // every row into the right number of fields, so can a spreadsheet.
    const records = splitDelimited(toQuickBooksCsv(doc), ",");
    expect(records.every(r => r.length === QUICKBOOKS_COLUMNS.length)).toBe(
      true
    );
    expect(records.length).toBe(doc.lines.length + 1);
  });
});

// ── The money ────────────────────────────────────────────────────────────────

describe("the numbers", () => {
  it("splits the charge, not the cost, and the two sum to the work price", () => {
    // Cost 1000 material + 1000 labor, charged 2640 — a ×1.32 uplift.
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 1000,
          laborCost: 1000,
          workPrice: 2640,
          salesTaxAmount: 0,
          totalDue: 2640,
          expenseLines: [],
        },
      }),
      NOW
    );
    const materials = doc.lines.find(
      l => l.item === QUICKBOOKS_ITEMS.materials
    )!;
    const labor = doc.lines.find(l => l.item === QUICKBOOKS_ITEMS.labor)!;
    expect(materials.amount).toBe(1320);
    expect(labor.amount).toBe(1320);
    expect(materials.amount + labor.amount).toBe(2640);
    // And emphatically not the costs themselves.
    expect(materials.amount).not.toBe(1000);
  });

  it("apportions an uneven split without losing a cent", () => {
    // 333.33 : 666.67 against a work price that does not divide evenly.
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 333.33,
          laborCost: 666.67,
          workPrice: 1234.57,
          salesTaxAmount: 0,
          totalDue: 1234.57,
          expenseLines: [],
        },
      }),
      NOW
    );
    const sum = doc.lines.reduce((s, l) => s + l.amount, 0);
    expect(Number(sum.toFixed(2))).toBe(1234.57);
    expect(doc.total).toBe(1234.57);
    expect(doc.warnings).toEqual([]);
  });

  it("bills each charge under its own name", () => {
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 100,
          laborCost: 0,
          workPrice: 100,
          salesTaxAmount: 0,
          totalDue: 440,
          expenseLines: [
            { name: "City permit", charged: 240 },
            { name: "Dumpster", charged: 100 },
          ],
        },
      }),
      NOW
    );
    const charges = doc.lines.filter(l => l.item === QUICKBOOKS_ITEMS.charge);
    expect(charges.map(c => c.description)).toEqual([
      "City permit",
      "Dumpster",
    ]);
    expect(charges.map(c => c.amount)).toEqual([240, 100]);
  });

  it("carries the bid's own tax figure rather than a code to recalculate from", () => {
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 100,
          laborCost: 0,
          workPrice: 100,
          salesTaxAmount: 9.25,
          totalDue: 109.25,
          expenseLines: [],
        },
      }),
      NOW
    );
    const tax = doc.lines.find(l => l.item === QUICKBOOKS_ITEMS.tax)!;
    expect(tax.amount).toBe(9.25);
    expect(doc.total).toBe(109.25);
  });

  it("omits a tax line entirely when there is no tax", () => {
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 100,
          laborCost: 0,
          workPrice: 100,
          salesTaxAmount: 0,
          totalDue: 100,
          expenseLines: [],
        },
      }),
      NOW
    );
    expect(doc.lines.some(l => l.item === QUICKBOOKS_ITEMS.tax)).toBe(false);
  });

  it("puts the whole charge on one line when there is no cost to split by", () => {
    // A bid whose materials and labor are all unpriced, but which carries a
    // flat overhead. Attributing it all to labor would be a made-up split.
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 0,
          laborCost: 0,
          workPrice: 500,
          salesTaxAmount: 0,
          totalDue: 500,
          expenseLines: [],
        },
      }),
      NOW
    );
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].item).toBe(QUICKBOOKS_ITEMS.work);
    expect(doc.lines[0].amount).toBe(500);
  });

  it("warns loudly if the lines ever fail to reconcile to the bid", () => {
    const doc = buildAccountingExport(
      source({
        totals: {
          materialCost: 100,
          laborCost: 0,
          workPrice: 100,
          salesTaxAmount: 0,
          totalDue: 999, // deliberately inconsistent
          expenseLines: [],
        },
      }),
      NOW
    );
    expect(doc.warnings.some(w => /Do not import/i.test(w))).toBe(true);
  });
});

// ── Warnings ─────────────────────────────────────────────────────────────────

describe("what it refuses to paper over", () => {
  it("says when there is no customer, because QuickBooks will reject the row", () => {
    const doc = buildAccountingExport(source({ customerName: null }), NOW);
    expect(doc.customer).toBe("");
    expect(doc.warnings.some(w => /no customer name/i.test(w))).toBe(true);
  });

  it("says when the bid has not been won", () => {
    const doc = buildAccountingExport(source({ status: "Draft" }), NOW);
    expect(doc.warnings.some(w => /has not been won/i.test(w))).toBe(true);
  });

  it("says nothing about status on a won bid", () => {
    const doc = buildAccountingExport(source({ status: "Won" }), NOW);
    expect(doc.warnings.some(w => /has not been won/i.test(w))).toBe(false);
  });

  it("keeps warnings out of the file itself", () => {
    const doc = buildAccountingExport(
      source({ status: "Draft", customerName: null }),
      NOW
    );
    const csv = toQuickBooksCsv(doc);
    expect(doc.warnings.length).toBeGreaterThan(0);
    for (const warning of doc.warnings) {
      expect(csv).not.toContain(warning);
    }
  });
});

// ── The guarantee ────────────────────────────────────────────────────────────

describe("leaks nothing internal", () => {
  const doc = buildAccountingExport(
    source({
      totals: {
        materialCost: 1234.56,
        laborCost: 987.65,
        workPrice: 2933.31,
        salesTaxAmount: 100,
        totalDue: 3273.31,
        expenseLines: [{ name: "City permit", charged: 240 }],
      },
    }),
    NOW
  );
  const csv = toQuickBooksCsv(doc);

  it("contains none of the internal field names", () => {
    for (const field of INTERNAL_FIELDS) {
      expect({
        field,
        found: csv.toLowerCase().includes(field.toLowerCase()),
      }).toEqual({ field, found: false });
    }
  });

  it("discloses charges rather than costs", () => {
    // The trap: these two figures sit right beside the exported ones on the
    // bid, look equally reasonable in a header, and are the margin.
    expect(csv).not.toContain("1234.56");
    expect(csv).not.toContain("987.65");
    // What it does contain is the charged split, which sums to the work price.
    const work = doc.lines
      .filter(
        l =>
          l.item !== QUICKBOOKS_ITEMS.tax && l.item !== QUICKBOOKS_ITEMS.charge
      )
      .reduce((s, l) => s + l.amount, 0);
    expect(Number(work.toFixed(2))).toBe(2933.31);
  });

  it("has no percentage anywhere — a margin is the one thing a % would be", () => {
    expect(csv).not.toMatch(/%/);
  });

  it("coincides with cost only when there is no margin to protect", () => {
    // Worth pinning because it looks alarming and is not. A contractor with no
    // overhead and no profit configured is charging cost, so the exported
    // charge and the cost are the same number — there is no margin being
    // disclosed, because there is no margin. The guarantee is that the export
    // never reveals a margin that EXISTS, not that it avoids arithmetic.
    const flat = buildAccountingExport(
      source({
        totals: {
          materialCost: 493.8,
          laborCost: 350.6,
          workPrice: 844.4, // uplift of exactly 1
          salesTaxAmount: 0,
          totalDue: 844.4,
          expenseLines: [],
        },
      }),
      NOW
    );
    expect(flat.total).toBe(844.4);
    expect(flat.warnings).toEqual([]);

    // And with a margin, neither cost survives into the file.
    const marked = buildAccountingExport(
      source({
        totals: {
          materialCost: 493.8,
          laborCost: 350.6,
          workPrice: 1174.4,
          salesTaxAmount: 0,
          totalDue: 1174.4,
          expenseLines: [],
        },
      }),
      NOW
    );
    const markedCsv = toQuickBooksCsv(marked);
    expect(markedCsv).not.toContain("493.80");
    expect(markedCsv).not.toContain("350.60");
    expect(markedCsv).toContain("686.78");
    expect(markedCsv).toContain("487.62");
    expect(marked.total).toBe(1174.4);
  });

  it("carries no scope, includes, excludes or proposal text", () => {
    // Numbers out, not documents. The only free text is the customer, the bid
    // name and the charge names the user typed themselves.
    for (const term of [
      "scope",
      "included",
      "excluded",
      "terms and conditions",
      "warranty",
      "valid until",
    ]) {
      expect({ term, found: csv.toLowerCase().includes(term) }).toEqual({
        term,
        found: false,
      });
    }
  });

  it("exposes no more columns than the template — nothing bolted on the end", () => {
    for (const row of splitDelimited(csv, ",")) {
      expect(row).toHaveLength(QUICKBOOKS_COLUMNS.length);
    }
  });
});

// ── Against a real bid ───────────────────────────────────────────────────────

describeDb("against a bid built through the app", () => {
  async function pricedMaterial(cost: number) {
    const created = await caller().materials.create({
      name: `Acct material ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: cost,
      category: "Receptacles",
    });
    return created!.id;
  }

  async function fixtureBid() {
    // Materials 100 + labor 50 = 150 direct; 10% overhead, 20% markup.
    const materialId = await pricedMaterial(100);
    const rates = await caller().laborRates.list();
    const rate = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 50,
      })
    ).laborRate!;

    const assembly = await caller().assemblies.create({
      name: `Acct assembly ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 1,
      laborRateId: rate.id,
      materials: [{ materialId, qty: 1 }],
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

    const bid = await caller().bids.create({
      name: `Acct bid ${uniq()}`,
      trades: ["electrical"],
    });
    await caller().bids.update({
      id: bid!.id,
      clientName: "Northwood Builders",
      status: "Won",
    });
    await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId: assembly!.id,
      qty: 1,
    });
    return bid!.id;
  }

  beforeAll(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    for (const id of [USER, OTHER_USER]) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing) {
        await database.insert(users).values({
          id,
          openId: `test-accounting-${id}`,
          name: `Accounting user ${id}`,
          accessTier: "internal",
        });
      }
    }
  });

  beforeEach(async () => {
    if (!hasDb) return;
    const database = await getDb();
    if (!database) return;
    await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  });

  it("totals exactly what the bid screen shows", async () => {
    const bidId = await fixtureBid();
    const detail = await caller().bids.get({ id: bidId });
    const doc = await caller().accounting.quickbooks({ bidId });

    // Asserted against the rollup rather than a number typed here, so the two
    // cannot drift apart as pricing changes.
    expect(doc.total).toBe(detail.totals.totalDue);
    expect(doc.total).toBe(198); // 150 × 1.1 × 1.2, checkable by hand
  });

  it("still totals exactly with charges and tax on the bid", async () => {
    const bidId = await fixtureBid();
    await caller().bidExtras.expenses.addToBid({
      bidId,
      name: "City permit",
      amount: 240,
    });
    const detail = await caller().bids.get({ id: bidId });
    const doc = await caller().accounting.quickbooks({ bidId });

    expect(doc.total).toBe(detail.totals.totalDue);
    expect(doc.lines.some(l => l.description === "City permit")).toBe(true);
  });

  it("takes the customer the proposal would address", async () => {
    const bidId = await fixtureBid();
    const doc = await caller().accounting.quickbooks({ bidId });
    const detail = await caller().bids.get({ id: bidId });
    expect(doc.customer).toBe(detail.resolvedClient.clientName);
    expect(doc.customer).toBe("Northwood Builders");
  });

  it("exports an unpriced bid without inventing anything", async () => {
    const bid = await caller().bids.create({
      name: `Empty acct ${uniq()}`,
      trades: ["electrical"],
    });
    const doc = await caller().accounting.quickbooks({ bidId: bid!.id });
    expect(doc.lines).toEqual([]);
    expect(doc.total).toBe(0);
    expect(doc.warnings.some(w => /nothing to bill/i.test(w))).toBe(true);
  });

  it("leaks nothing internal from a real bid either", async () => {
    const bidId = await fixtureBid();
    const doc = await caller().accounting.quickbooks({ bidId });
    const csv = toQuickBooksCsv(doc);

    for (const field of INTERNAL_FIELDS) {
      expect({
        field,
        found: csv.toLowerCase().includes(field.toLowerCase()),
      }).toEqual({ field, found: false });
    }
    // The fixture's real cost figures, which sit right beside the exported ones.
    expect(csv).not.toContain('100.00"');
    expect(csv).not.toContain("150.00");
    expect(csv).not.toMatch(/%/);
    // And the whole payload, not just the file — a client could render this.
    expect(JSON.stringify(doc).toLowerCase()).not.toContain("overhead");
    expect(JSON.stringify(doc).toLowerCase()).not.toContain("profit");
  });

  it("refuses another contractor's bid", async () => {
    const bidId = await fixtureBid();
    await expect(
      callerFor(OTHER_USER).accounting.quickbooks({ bidId })
    ).rejects.toThrow(/not found/i);
  });

  it("produces a file that reads back as valid CSV", async () => {
    const bidId = await fixtureBid();
    const doc = await caller().accounting.quickbooks({ bidId });
    const csv = toQuickBooksCsv(doc);

    const records = splitDelimited(csv, ",");
    expect(records[0]).toEqual([...QUICKBOOKS_COLUMNS]);
    expect(records).toHaveLength(doc.lines.length + 1);
    // Every amount reads back as a number the importer can take.
    for (const row of records.slice(1)) {
      expect(Number(row[9])).not.toBeNaN();
    }
  });
});
