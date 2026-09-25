/**
 * The five places that used ONE price-to-cost ratio, on a bid where that ratio
 * is wrong — and the whole path from a rule to a line to a dashboard card.
 *
 * ── Why a MIXED bid ──────────────────────────────────────────────────────────
 * Before material markup, a bid had one uplift, finalPrice ÷ directCost, and
 * five places used it to spread the price back over the bid's parts:
 *
 *   1. a marked-up expense's billed amount
 *   2. the proposal's price per unit
 *   3. the material share of the price, for sales tax
 *   4. the accounting export's Materials / Labor split
 *   5. the dashboard card (priced from SQL sums, not from the lines)
 *
 * All five are right while every dollar of cost is marked up alike, and every
 * one of them is wrong the moment some lines carry markup and others do not —
 * quietly, because the bid total underneath stays right. So the fixture here
 * is deliberately uneven: one line at 40%, one with none at all (stored from
 * before markup existed), one at 12%, a marked-up permit and a flat fee.
 *
 * Every expected figure below was worked by hand from the numbers in the
 * fixture, and the working is beside it.
 *
 * See references/material-markup.md § The five places.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { bidRollup } from "./bidPricing";
import { getDb, seedBaselineLaborRates } from "./db";
import {
  bids,
  markupRules,
  materials,
  pricingDefaults,
  users,
  type Bid,
  type BidLineItem,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { buildAccountingExport } from "../shared/accountingExport";
import { buildProposal } from "../shared/proposal";

// ─── The mixed bid, priced without a database ─────────────────────────────────

/*
  Lines (material cost, labor, markup):

    A  3 × $100 material, 3 × 1 h × $50    40%   mat 300  labor 150  mu 120
    B  2 × $50  material, 2 × 2 h × $50    NULL  mat 100  labor 200  mu   0
    C  1 × $800 material, no labor         12%   mat 800  labor   0  mu  96

  materials 1,200 · labor 350 · markup 216
  + marked-up permit 200            direct cost      1,750.00
  + material markup   216           cost w/ markup   1,966.00
  + overhead 10%                    196.60        -> 2,162.60
  + profit (markup) 15%             324.39        -> 2,486.99  = finalPrice

  Bottom-of-bid ratio = 2,486.99 / 1,966 = 1.265005086…
*/
const bid = {
  id: 1,
  overheadEnabled: true,
  overheadMode: "percentage",
  overheadValue: "0.1000",
  profitMethod: "markup",
  profitValue: "0.1500",
  productivityPct: null,
  taxRateOverridePct: "10.0000",
  taxJurisdictionId: null,
  siteAddress: null,
  taxExempt: false,
} as unknown as Bid;

const line = (
  id: number,
  cost: string,
  hours: string,
  qty: string,
  markup: string | null,
  unitLabel: string
) =>
  ({
    id,
    name: `Line ${id}`,
    qty,
    unitLabel,
    snapshotMaterialCost: cost,
    snapshotLaborHours: hours,
    snapshotModifierPct: "0",
    snapshotLaborRate: "50.0000",
    snapshotMarkupPct: markup,
    snapshotMarkupSource: null,
  }) as unknown as BidLineItem;

const LINES = [
  line(1, "100.0000", "1.0000", "3.0000", "0.400000", "Unit 1"),
  line(2, "50.0000", "2.0000", "2.0000", null, "Unit 2"),
  line(3, "800.0000", "0.0000", "1.0000", "0.120000", "Unit 3"),
];

const COMPANY = {
  overheadEnabled: false,
  overheadMode: "percentage" as const,
  overheadValue: 0,
  profitMethod: "markup" as const,
  profitValue: 0,
  productivityPct: 0,
};

const EXPENSES = [
  { name: "Permit", amount: 200, taxable: false, markedUp: true },
  { name: "Dump fee", amount: 50, taxable: false, markedUp: false },
];

const rolled = bidRollup(
  bid,
  LINES,
  COMPANY,
  {
    rules: {
      enabled: true,
      taxMaterials: true,
      taxLabor: false,
      applyTo: "price",
    },
    jurisdictions: [],
  },
  EXPENSES
);
const { totals } = rolled;

const exported = buildAccountingExport(
  {
    bidId: 1,
    bidName: "Mixed",
    customerName: null,
    status: "Draft",
    totals,
  },
  new Date(0)
);
const exportAmount = (item: string) =>
  exported.lines.filter(l => l.item === item).reduce((s, l) => s + l.amount, 0);

const proposal = buildProposal({
  bid: {
    name: "Mixed",
    clientName: null,
    siteAddress: null,
    proposalNote: null,
  },
  totals,
  salesTax: rolled.salesTax,
  expenses: totals.expenseLines.map(l => ({ name: l.name, amount: l.charged })),
  units: rolled.units.map(u => ({
    label: u.label,
    directCost: u.directCost,
    costWithMarkup: u.costWithMarkup,
  })),
  lines: [],
  branding: {
    companyName: "",
    licenseNumber: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    logoUrl: null,
  },
  design: {
    layout: "classic",
    accentColor: "#F5C518",
    hiddenSections: [],
    termsText: null,
    validDays: 30,
  },
  now: new Date(0),
} as never);
const unitPrice = (label: string) =>
  proposal.unitPricing.find(u => u.label === label)!.price;

describe("the mixed bid itself", () => {
  it("adds up as worked by hand", () => {
    expect(totals.materialCost).toBe(1200);
    expect(totals.laborCost).toBe(350);
    expect(totals.materialMarkup).toBe(216);
    expect(totals.directCost).toBe(1750);
    expect(totals.costWithMarkup).toBe(1966);
    expect(totals.overheadAmount).toBe(196.6);
    expect(totals.profitAmount).toBe(324.39);
    expect(totals.finalPrice).toBe(2486.99);
  });

  it("stacks profit on the marked-up material, by decision (D1)", () => {
    // Overhead is 10% of 1,966 — the subtotal WITH markup — not of 1,750.
    expect(totals.overheadAmount).toBe(196.6);
    expect(totals.overheadAmount).not.toBe(175);
  });
});

describe("1 · a marked-up expense takes overhead and profit, never material markup", () => {
  it("bills the permit at 200 × 1.265005 = 253.00", () => {
    // The old ratio, 2,486.99 / 1,750, would bill it at 284.23 — the wire's
    // 40% handed to a permit.
    expect(totals.expenseLines[0].charged).toBe(253);
    expect(totals.expenseLines[1].charged).toBe(50);
  });
});

describe("2 · the proposal prices each unit from its own marked-up cost", () => {
  it("prices the three units as worked by hand", () => {
    // 570 × r = 721.05    300 × r = 379.50    896 × r = 1,133.44
    expect(unitPrice("Unit 1")).toBe(721.05);
    expect(unitPrice("Unit 2")).toBe(379.5);
    expect(unitPrice("Unit 3")).toBe(1133.44);
  });
});

describe("3 and 4 · tax and the export split the billed price the same way", () => {
  /*
    Work price 2,486.99 − 253.00 = 2,233.99.
    Material is billed on 1,200 + 216 = 1,416 of the 1,766 marked-up work, so
    its share is round(223,399 × 1,416 / 1,766) cents = $1,791.24.
    The old split, by bare cost 1,200 / 1,550, would say $1,729.55 — taxing
    $61.69 of material as though it were labor.
  */
  it("gives material its cost-plus-markup share of the work price", () => {
    expect(totals.workPrice).toBe(2233.99);
    expect(rolled.salesTax.taxableMaterial).toBe(1791.24);
    expect(rolled.salesTax.amount).toBe(179.12);
  });

  it("books exactly the same Materials figure the tax was charged on", () => {
    expect(exportAmount("Materials")).toBe(rolled.salesTax.taxableMaterial);
    expect(exportAmount("Labor")).toBe(442.75);
  });
});

describe("all five agree with each other and with the bid total", () => {
  const cents = (n: number) => Math.round(n * 100);

  it("units sum to the work price", () => {
    const sum = proposal.unitPricing.reduce((s, u) => s + cents(u.price), 0);
    expect(sum).toBe(cents(totals.workPrice));
  });

  it("the work price plus the marked-up permit is the bid price", () => {
    expect(
      cents(totals.workPrice) + cents(totals.expenseLines[0].charged)
    ).toBe(cents(totals.finalPrice));
  });

  it("the export's Materials + Labor is the work price", () => {
    expect(
      cents(exportAmount("Materials")) + cents(exportAmount("Labor"))
    ).toBe(cents(totals.workPrice));
  });

  it("every exported line sums to what the customer owes", () => {
    const sum = exported.lines.reduce((s, l) => s + cents(l.amount), 0);
    expect(sum).toBe(cents(totals.totalDue));
    expect(cents(proposal.investment.total)).toBe(cents(totals.totalDue));
  });
});

// ─── Against a live database ──────────────────────────────────────────────────

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = 7878;

const ctxFor = (id: number): TrpcContext =>
  ({
    user: { id, openId: `test-material-markup-${id}`, role: "user" },
  }) as unknown as TrpcContext;
const caller = () => appRouter.createCaller(ctxFor(USER));

describe.skipIf(!hasDb)("markup from rule to line to dashboard", () => {
  let wireId: number;
  let boxId: number;
  let plainId: number;
  let rateId: number;

  beforeAll(async () => {
    const db = await getDb();
    const [existing] = await db!
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing) {
      await db!.insert(users).values({
        id: USER,
        openId: `test-material-markup-${USER}`,
        name: "Material markup test user",
      });
    }
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db!.delete(bids).where(eq(bids.userId, USER));
    await db!.delete(markupRules).where(eq(markupRules.userId, USER));
    await db!.delete(pricingDefaults).where(eq(pricingDefaults.userId, USER));
    await db!.delete(materials).where(eq(materials.userId, USER));

    // Fixture prices, never shipped ones (CLAUDE.md § Materials).
    const stamp = `${Date.now()}${Math.random()}`;
    wireId = (await caller().materials.create({
      name: `Markup wire ${stamp}`,
      unitOfSale: "foot",
      costPerUnit: 2,
      category: "Wire & Cable",
    }))!.id;
    boxId = (await caller().materials.create({
      name: `Markup box ${stamp}`,
      costPerUnit: 5,
      category: "Boxes",
    }))!.id;
    plainId = (await caller().materials.create({
      name: `Markup plate ${stamp}`,
      costPerUnit: 3,
      category: "Wall Plates & Misc",
    }))!.id;

    const rates = await caller().laborRates.list();
    rateId = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 60,
      })
    ).laborRate!.id;

    // The three levels that exist today: company default 10%, an item
    // override of 50% on the wire, and a category rule of 25% on Boxes
    // (written directly — the category screen is Piece 3).
    await caller().bids.setPricingDefaults({
      materialMarkupPct: 0.1,
      overheadEnabled: true,
      overheadValue: 0.1,
      profitMethod: "markup",
      profitValue: 0.15,
    });
    await caller().bids.setItemMarkupOverride({
      materialId: wireId,
      markupPct: 0.5,
    });
    await db!.insert(markupRules).values({
      userId: USER,
      kind: "category",
      category: "Boxes",
      markupPct: "0.250000",
    });
  });

  async function assemblyOf(parts: Array<{ materialId: number; qty: number }>) {
    return (await caller().assemblies.create({
      name: `Markup assembly ${Date.now()}${Math.random()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 0.5,
      laborRateId: rateId,
      materials: parts,
      modifierIds: [],
    }))!;
  }

  async function newBid() {
    return caller().bids.create({ name: `Markup bid ${Date.now()}` });
  }

  it("stores each line's markup and says where it came from", async () => {
    const b = await newBid();
    const wire = await assemblyOf([{ materialId: wireId, qty: 10 }]);
    const box = await assemblyOf([{ materialId: boxId, qty: 1 }]);
    const plate = await assemblyOf([{ materialId: plainId, qty: 1 }]);
    const mixed = await assemblyOf([
      { materialId: wireId, qty: 10 }, // $20 at 50%
      { materialId: plainId, qty: 1 }, // $3 at 10%
    ]);
    for (const a of [wire, box, plate, mixed]) {
      await caller().bids.addAssembly({
        bidId: b.id,
        assemblyId: a.id,
        qty: 2,
      });
    }

    const got = await caller().bids.get({ id: b.id });
    const byAssembly = (id: number) =>
      got.lines.find(l => l.assemblyId === id)!;

    expect(Number(byAssembly(wire.id).snapshotMarkupPct)).toBe(0.5);
    expect(byAssembly(wire.id).snapshotMarkupSource!.label).toBe(
      "from item override"
    );
    expect(Number(byAssembly(box.id).snapshotMarkupPct)).toBe(0.25);
    expect(byAssembly(box.id).snapshotMarkupSource!.label).toBe(
      "from Boxes category"
    );
    expect(Number(byAssembly(plate.id).snapshotMarkupPct)).toBe(0.1);
    expect(byAssembly(plate.id).snapshotMarkupSource!.label).toBe(
      "from company default"
    );
    // (20 × 0.5 + 3 × 0.1) / 23 = 0.447826…
    expect(Number(byAssembly(mixed.id).snapshotMarkupPct)).toBeCloseTo(
      10.3 / 23,
      6
    );
    expect(byAssembly(mixed.id).snapshotMarkupSource!.level).toBe("mixed");

    // Priced: wire line is 2 × $20 = $40 material, $20 markup.
    expect(byAssembly(wire.id).breakdown.materialMarkup).toBe(20);
  });

  it("puts the dashboard card on the bid's own price, to the cent", async () => {
    const b = await newBid();
    const wire = await assemblyOf([{ materialId: wireId, qty: 7 }]);
    const mixed = await assemblyOf([
      { materialId: boxId, qty: 3 },
      { materialId: plainId, qty: 2 },
    ]);
    await caller().bids.addAssembly({
      bidId: b.id,
      assemblyId: wire.id,
      qty: 3.5,
    });
    await caller().bids.addAssembly({
      bidId: b.id,
      assemblyId: mixed.id,
      qty: 11,
    });
    await caller().bidExtras.expenses.addToBid({
      bidId: b.id,
      itemId: null,
      name: "Permit",
      amount: 212.5,
      taxable: false,
      markedUp: true,
    });
    await caller().bidExtras.expenses.addToBid({
      bidId: b.id,
      itemId: null,
      name: "Dump fee",
      amount: 40,
      taxable: false,
      markedUp: false,
    });

    const got = await caller().bids.get({ id: b.id });
    expect(got.totals.materialMarkup).toBeGreaterThan(0);

    const card = (await caller().bids.dashboard()).find(c => c.id === b.id)!;
    expect(card.finalPrice).toBe(got.totals.finalPrice);
    expect(card.directCost).toBe(got.totals.directCost);
  });

  it("carries the markup onto every copy of a unit", async () => {
    const b = await newBid();
    const wire = await assemblyOf([{ materialId: wireId, qty: 4 }]);
    await caller().bids.addAssembly({
      bidId: b.id,
      assemblyId: wire.id,
      qty: 1,
      unitLabel: "Room 100",
    });
    await caller().bids.duplicateUnit({
      bidId: b.id,
      sourceUnitLabel: "Room 100",
      baseName: "Room",
      startNumber: 101,
      count: 2,
    });
    const got = await caller().bids.get({ id: b.id });
    expect(got.lines).toHaveLength(3);
    for (const l of got.lines) {
      expect(Number(l.snapshotMarkupPct)).toBe(0.5);
      expect(l.snapshotMarkupSource!.label).toBe("from item override");
    }
  });

  it("does not move a line when a rule changes — Re-apply does, on a Draft", async () => {
    const b = await newBid();
    const plate = await assemblyOf([{ materialId: plainId, qty: 1 }]);
    const wire = await assemblyOf([{ materialId: wireId, qty: 1 }]);
    await caller().bids.addAssembly({ bidId: b.id, assemblyId: plate.id });
    await caller().bids.addAssembly({ bidId: b.id, assemblyId: wire.id });

    await caller().bids.setPricingDefaults({ materialMarkupPct: 0.3 });

    // Frozen: the plate line still says 10%.
    const before = await caller().bids.get({ id: b.id });
    const plateLine = before.lines.find(l => l.assemblyId === plate.id)!;
    expect(Number(plateLine.snapshotMarkupPct)).toBe(0.1);

    // Only the plate follows the default; the wire has its own override.
    const preview = await caller().bids.markupReapplyPreview({ bidId: b.id });
    expect(preview.allowed).toBe(true);
    expect(preview.changes.map(c => c.lineId)).toEqual([plateLine.id]);
    expect(preview.changes[0]).toMatchObject({ fromPct: 0.1, toPct: 0.3 });

    expect(
      (await caller().bids.reapplyMarkupRules({ bidId: b.id })).changed
    ).toBe(1);
    const after = await caller().bids.get({ id: b.id });
    expect(
      Number(after.lines.find(l => l.id === plateLine.id)!.snapshotMarkupPct)
    ).toBe(0.3);
    expect(
      (await caller().bids.markupReapplyPreview({ bidId: b.id })).changes
    ).toEqual([]);
  });

  it("refuses to re-apply on a sent bid, on the server and not only on screen", async () => {
    const b = await newBid();
    const plate = await assemblyOf([{ materialId: plainId, qty: 1 }]);
    await caller().bids.addAssembly({ bidId: b.id, assemblyId: plate.id });
    await caller().bids.update({ id: b.id, status: "Active" });
    await caller().bids.setPricingDefaults({ materialMarkupPct: 0.3 });

    const preview = await caller().bids.markupReapplyPreview({ bidId: b.id });
    expect(preview.allowed).toBe(false);
    expect(preview.changes).toEqual([]);
    await expect(
      caller().bids.reapplyMarkupRules({ bidId: b.id })
    ).rejects.toThrow(/frozen/);

    const got = await caller().bids.get({ id: b.id });
    expect(Number(got.lines[0].snapshotMarkupPct)).toBe(0.1);
  });

  it("clears an item override back to the rule below it", async () => {
    await caller().bids.setItemMarkupOverride({
      materialId: wireId,
      markupPct: null,
    });
    const db = await getDb();
    const left = await db!
      .select()
      .from(markupRules)
      .where(and(eq(markupRules.userId, USER), eq(markupRules.kind, "item")));
    expect(left).toEqual([]);

    const b = await newBid();
    const wire = await assemblyOf([{ materialId: wireId, qty: 1 }]);
    await caller().bids.addAssembly({ bidId: b.id, assemblyId: wire.id });
    const got = await caller().bids.get({ id: b.id });
    // Wire & Cable has no category rule, so the company default applies.
    expect(got.lines[0].snapshotMarkupSource!.label).toBe(
      "from company default"
    );
  });
});
