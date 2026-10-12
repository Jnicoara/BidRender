/**
 * Additional expenses, includes/excludes, and the scope-only document.
 *
 * ── The three things most worth protecting ───────────────────────────────────
 * 1. A ONE-OFF must not join the library. "Permit — $340 on this job only"
 *    leaving a $340 "Permit" behind for someone to pick up next month is a
 *    wrong number on a future bid, arrived at by being helpful.
 *
 * 2. The library is a source to copy FROM, never a live link. Editing a saved
 *    exclusion must not change the wording on a proposal already sent — with
 *    exclusions the exact wording is the whole point of having them.
 *
 * 3. The scope-only document must contain NO money. Not "no total" — no dollar
 *    figure anywhere, including the per-unit prices that are easy to forget.
 *    That is asserted by scanning the built document rather than by trusting
 *    the builder, because a guarantee checked by the thing making the promise
 *    is not much of a guarantee.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  seedBaselineAssemblies,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
} from "./db";
import {
  assemblies,
  bids,
  expenseItems,
  materials,
  pricingDefaults,
  scopeNotes,
  taxJurisdictions,
  users,
} from "../drizzle/schema";
import {
  containsMoney,
  groupScopeNotes,
  partitionScopeNotes,
  sectionAllowedInMode,
  sumExpenses,
} from "../shared/bidExtras";
import type { TrpcContext } from "./_core/context";

const USER = 9101;
const OTHER_USER = 9102;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-extras-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

const unique = (label: string) =>
  `${label} ${Date.now()}${Math.round(Math.random() * 1e6)}`;

// ══════════════════════════════════════════════════════════════════════════════
// Pure
// ══════════════════════════════════════════════════════════════════════════════

describe("summing flat charges", () => {
  it("adds in whole cents", () => {
    expect(
      sumExpenses([
        { name: "Permit", amount: 180.55 },
        { name: "Inspection", amount: 95.45 },
      ])
    ).toBe(276);
  });

  it("is zero for none", () => {
    expect(sumExpenses([])).toBe(0);
  });

  it("does not drift over many lines", () => {
    const lines = Array.from({ length: 100 }, () => ({
      name: "Fee",
      amount: 0.07,
    }));
    expect(sumExpenses(lines)).toBe(7);
  });
});

describe("grouping includes and excludes", () => {
  it("splits by kind", () => {
    const grouped = groupScopeNotes([
      { kind: "include", text: "All rough-in and trim" },
      { kind: "exclude", text: "Permit pulled by owner" },
      { kind: "include", text: "Fixtures supplied by us" },
    ]);
    expect(grouped.includes).toHaveLength(2);
    expect(grouped.excludes).toEqual(["Permit pulled by owner"]);
  });

  it("drops blank lines rather than printing empty bullets", () => {
    // An exclusion that says nothing looks like one somebody meant to finish.
    const grouped = groupScopeNotes([
      { kind: "exclude", text: "   " },
      { kind: "include", text: "" },
      { kind: "exclude", text: "Trenching" },
    ]);
    expect(grouped.includes).toHaveLength(0);
    expect(grouped.excludes).toEqual(["Trenching"]);
  });

  /**
   * The editor is now laid out in the same two columns the document prints, so
   * it needs the same split — but with the whole row, because it removes lines
   * by id and shows a bookmark only on ones the user typed. Both callers go
   * through partitionScopeNotes so the two cannot disagree about which side a
   * line lands on.
   */
  it("keeps the rest of the row, for the editor", () => {
    const rows = [
      { id: 1, kind: "include" as const, text: "Rough-in", scopeNoteId: null },
      { id: 2, kind: "exclude" as const, text: "Permits", scopeNoteId: 9 },
    ];
    const { includes, excludes } = partitionScopeNotes(rows);
    expect(includes).toEqual([rows[0]]);
    expect(excludes).toEqual([rows[1]]);
    // The id survives — without it the editor cannot remove the line.
    expect(includes[0].id).toBe(1);
    expect(excludes[0].scopeNoteId).toBe(9);
  });

  it("drops blanks for the editor too, by the same rule", () => {
    const { includes, excludes } = partitionScopeNotes([
      { id: 1, kind: "include" as const, text: "  " },
      { id: 2, kind: "exclude" as const, text: "Trenching" },
    ]);
    expect(includes).toHaveLength(0);
    expect(excludes).toHaveLength(1);
  });

  it("agrees with what the document prints", () => {
    // The regression this guards: two implementations of "which column" that
    // drift, putting a line on the editor's left and the proposal's right.
    const rows = [
      { kind: "include" as const, text: "Rough-in" },
      { kind: "exclude" as const, text: " Permits " },
      { kind: "include" as const, text: "" },
    ];
    const grouped = groupScopeNotes(rows);
    const partitioned = partitionScopeNotes(rows);
    expect(partitioned.includes.map(n => n.text.trim())).toEqual(
      grouped.includes
    );
    expect(partitioned.excludes.map(n => n.text.trim())).toEqual(
      grouped.excludes
    );
  });
});

describe("which sections a mode allows", () => {
  it("allows everything on the full document", () => {
    for (const id of ["investment", "unitPricing", "scope", "terms"]) {
      expect(sectionAllowedInMode(id, "full")).toBe(true);
    }
  });

  it("blocks BOTH money sections on scope-only, not just the total", () => {
    // unitPricing is the one that gets forgotten, and it is a per-room PRICE.
    expect(sectionAllowedInMode("investment", "scope-only")).toBe(false);
    expect(sectionAllowedInMode("unitPricing", "scope-only")).toBe(false);
  });

  it("keeps the descriptive sections on scope-only", () => {
    for (const id of ["letterhead", "preparedFor", "scope", "inclusions"]) {
      expect(sectionAllowedInMode(id, "scope-only")).toBe(true);
    }
  });
});

describe("the money detector used by these tests", () => {
  it("catches the shapes money actually takes on this document", () => {
    // Everything rendered as money goes through `money()`, which always emits
    // a currency symbol — so these are the shapes that can actually appear.
    for (const text of ["$1,240.00", "$180", "1,240.00", "$ 95"]) {
      expect(containsMoney(text)).toBe(true);
    }
  });

  it("does not fire on ordinary document text", () => {
    for (const text of [
      "Duplex receptacle, 20A",
      "24",
      "Excludes: permit pulled by owner",
      "E-101 Power Plan",
      "August 14, 2026",
      "1.5 hours",
      // Found in the browser: labor prints two decimals, and an earlier
      // version of this detector called that money. A check that fires on
      // "1.42 labor hours" is one somebody learns to ignore.
      "Estimated at 1.42 labor hours of licensed work",
    ]) {
      expect(containsMoney(text)).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Through the API
// ══════════════════════════════════════════════════════════════════════════════

async function pricedBid() {
  const material = await caller().materials.create({
    name: unique("Extras probe material"),
    unitOfSale: "each",
    costPerUnit: 100,
    category: "Receptacles",
  });
  const rates = await caller().laborRates.list();
  const priced = await caller().laborRates.update({
    id: rates.find(r => r.name === "Journeyman")!.id,
    hourlyCost: 50,
  });
  const list = await caller().assemblies.list();
  const starter = list.find(a => a.name === "Duplex receptacle standard")!;
  const assembly = await caller().assemblies.update({
    id: starter.id,
    laborRateId: priced.laborRate!.id,
    baseLaborHours: 1,
    materials: [{ materialId: material!.id, qty: 1 }],
  });
  const bid = await caller().bids.create({
    name: unique("Extras bid"),
    trades: ["electrical"],
  });
  await caller().bids.addAssembly({
    bidId: bid!.id,
    assemblyId: assembly.assembly!.id,
    qty: 2,
    unitLabel: "Room 101",
  });
  return bid!;
}

beforeAll(async () => {
  if (!hasDb) return;
  const dbc = await getDb();
  if (!dbc) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await dbc
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await dbc.insert(users).values({
        id,
        openId: `test-extras-${id}`,
        name: `Extras test user ${id}`,
      });
    }
  }
  await seedBaselineMaterials();
  await seedBaselineLaborRates();
  await seedBaselineModifiers();
  await seedBaselineAssemblies();
});

beforeEach(async () => {
  if (!hasDb) return;
  const dbc = await getDb();
  if (!dbc) return;
  const ours = [USER, OTHER_USER];
  await dbc.delete(bids).where(inArray(bids.userId, ours));
  await dbc.delete(expenseItems).where(inArray(expenseItems.userId, ours));
  await dbc.delete(scopeNotes).where(inArray(scopeNotes.userId, ours));
  await dbc
    .delete(taxJurisdictions)
    .where(inArray(taxJurisdictions.userId, ours));
  await dbc.delete(assemblies).where(inArray(assemblies.userId, ours));
  await dbc.delete(materials).where(inArray(materials.userId, ours));
  await dbc
    .delete(pricingDefaults)
    .where(inArray(pricingDefaults.userId, ours));
});

describe.skipIf(!hasDb)("the saved expense list", () => {
  it("saves and reloads a reusable charge", async () => {
    const created = await caller().bidExtras.expenses.create({
      name: "Permit fee",
      amount: 180,
      notes: "City of Springfield",
    });
    expect(created!.amount).toBe(180);

    const list = await caller().bidExtras.expenses.list();
    expect(list.map(e => e.name)).toContain("Permit fee");
    expect(list.find(e => e.id === created!.id)!.amount).toBe(180);
  });

  it("edits an amount without touching bids already using it", async () => {
    // The snapshot rule. Raising the permit fee must not re-price a sent bid.
    const item = await caller().bidExtras.expenses.create({
      name: "Permit fee",
      amount: 180,
    });
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      itemId: item!.id,
    });

    await caller().bidExtras.expenses.update({ id: item!.id, amount: 260 });

    const onBid = await caller().bidExtras.expenses.onBid({ bidId: bid.id });
    expect(onBid[0].amount).toBe(180);
  });

  it("archives rather than deleting, and restores", async () => {
    const item = await caller().bidExtras.expenses.create({
      name: "Old fee",
      amount: 20,
    });
    await caller().bidExtras.expenses.setArchived({
      id: item!.id,
      archived: true,
    });
    expect(
      (await caller().bidExtras.expenses.list()).map(e => e.id)
    ).not.toContain(item!.id);
    expect(
      (await caller().bidExtras.expenses.archived()).map(e => e.id)
    ).toContain(item!.id);

    await caller().bidExtras.expenses.setArchived({
      id: item!.id,
      archived: false,
    });
    expect((await caller().bidExtras.expenses.list()).map(e => e.id)).toContain(
      item!.id
    );
  });

  it("never shows another user's saved charges", async () => {
    await callerFor(OTHER_USER).bidExtras.expenses.create({
      name: "Theirs",
      amount: 99,
    });
    expect(
      (await caller().bidExtras.expenses.list()).map(e => e.name)
    ).not.toContain("Theirs");
  });

  it("refuses to put another user's saved charge on a bid", async () => {
    const theirs = await callerFor(OTHER_USER).bidExtras.expenses.create({
      name: "Theirs",
      amount: 99,
    });
    const bid = await pricedBid();
    await expect(
      caller().bidExtras.expenses.addToBid({
        bidId: bid.id,
        itemId: theirs!.id,
      })
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasDb)("one-offs stay off the list", () => {
  it("adds a charge to a bid without saving it anywhere", async () => {
    // THE assertion: a one-off must not pollute the library.
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Special permit, this job only",
      amount: 340,
    });

    const onBid = await caller().bidExtras.expenses.onBid({ bidId: bid.id });
    expect(onBid).toHaveLength(1);
    expect(onBid[0].amount).toBe(340);
    expect(onBid[0].expenseItemId).toBeNull();

    expect(await caller().bidExtras.expenses.list()).toHaveLength(0);
  });

  it("can promote a one-off to the library later, on request", async () => {
    const bid = await pricedBid();
    const added = await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Dispatch",
      amount: 65,
    });
    expect(await caller().bidExtras.expenses.list()).toHaveLength(0);

    await caller().bidExtras.expenses.saveToLibrary({
      bidId: bid.id,
      id: added.id,
    });

    const list = await caller().bidExtras.expenses.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Dispatch");
    // And the bid now records where it came from.
    const onBid = await caller().bidExtras.expenses.onBid({ bidId: bid.id });
    expect(onBid[0].expenseItemId).toBe(list[0].id);
  });

  it("does not save the same one-off twice", async () => {
    const bid = await pricedBid();
    const added = await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Dispatch",
      amount: 65,
    });
    await caller().bidExtras.expenses.saveToLibrary({
      bidId: bid.id,
      id: added.id,
    });
    const second = await caller().bidExtras.expenses.saveToLibrary({
      bidId: bid.id,
      id: added.id,
    });
    expect(second.alreadySaved).toBe(true);
    expect(await caller().bidExtras.expenses.list()).toHaveLength(1);
  });
});

// The working a job-cost tile adds (drizzle/0145, quick-bid-plan § 6). It can
// carry the labor rate, so it is the bid screen's and never the customer's.
describe.skipIf(!hasDb)("a charge's working note", () => {
  const WORKING = "6 trips × 1.5 h × $85.00/h";

  it("is stored with the charge and read back on the bid", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Drive time",
      amount: 765,
      notes: WORKING,
    });
    const [row] = await caller().bidExtras.expenses.onBid({ bidId: bid.id });
    expect(row.notes).toBe(WORKING);
    expect(row.amount).toBe(765);
  });

  it("never reaches the quote — not in any form", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Drive time",
      amount: 765,
      notes: WORKING,
    });
    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.investment.expenses!.lines.map(l => l.name)).toEqual([
      "Drive time",
    ]);
    // Scanned, not trusted: neither the working nor the rate it carries.
    const printed = JSON.stringify(document);
    expect(printed).not.toContain("trips");
    expect(printed).not.toContain("85.00/h");
  });

  it("stores blank as no note, and a typed one-off has none", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit",
      amount: 340,
      notes: "   ",
    });
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Inspection",
      amount: 95,
    });
    const rows = await caller().bidExtras.expenses.onBid({ bidId: bid.id });
    expect(rows.map(r => r.notes)).toEqual([null, null]);
  });

  it("is cleared by a new amount, and kept by anything else", async () => {
    const bid = await pricedBid();
    const added = await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Drive time",
      amount: 765,
      notes: WORKING,
    });
    const notes = async () =>
      (await caller().bidExtras.expenses.onBid({ bidId: bid.id }))[0].notes;

    await caller().bidExtras.expenses.updateOnBid({
      bidId: bid.id,
      id: added.id,
      taxable: true,
    });
    expect(await notes()).toBe(WORKING);

    // "6 trips × 1.5 h × $85.00/h" beside $900 would state the wrong sum.
    await caller().bidExtras.expenses.updateOnBid({
      bidId: bid.id,
      id: added.id,
      amount: 900,
    });
    expect(await notes()).toBeNull();
  });
});

describe.skipIf(!hasDb)("expenses on the price", () => {
  it("adds as a pass-through, on top of the bid price", async () => {
    const bid = await pricedBid();
    const before = await caller().bids.get({ id: bid.id });

    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit fee",
      amount: 180,
    });

    const after = await caller().bids.get({ id: bid.id });
    // The work price is untouched — expenses are not marked up.
    expect(after.totals.finalPrice).toBeCloseTo(before.totals.finalPrice, 2);
    expect(after.totals.expensesTotal).toBe(180);
    expect(after.totals.subtotal).toBeCloseTo(
      before.totals.finalPrice + 180,
      2
    );
    expect(after.totals.totalDue).toBeCloseTo(after.totals.subtotal, 2);
  });

  it("is NOT in the sales-tax base", async () => {
    // Permits are generally not taxable receipts, and folding them in would
    // move every tax figure the previous release established.
    await caller().salesTax.setRules({
      enabled: true,
      taxMaterials: true,
      taxLabor: true,
    });
    await caller().salesTax.create({
      name: "IL",
      state: "IL",
      components: [{ label: "State", ratePct: 10 }],
    });

    const bid = await pricedBid();
    await caller().bids.update({ id: bid.id, siteAddress: "Springfield, IL" });
    const before = await caller().bids.get({ id: bid.id });

    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit fee",
      amount: 180,
    });
    const after = await caller().bids.get({ id: bid.id });

    expect(after.salesTax.amount).toBeCloseTo(before.salesTax.amount, 2);
    // And the bottom line is price + tax + expenses.
    expect(after.totals.totalDue).toBeCloseTo(
      after.totals.finalPrice + after.salesTax.amount + 180,
      2
    );
  });

  it("shows each charge by name on the proposal", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit fee",
      amount: 180,
    });
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Inspection",
      amount: 95,
    });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.investment.expenses).not.toBeNull();
    expect(document.investment.expenses!.lines.map(l => l.name)).toEqual([
      "Permit fee",
      "Inspection",
    ]);
    expect(document.investment.expenses!.total).toBe(275);
    expect(document.investment.total).toBeCloseTo(
      document.investment.workTotal + 275,
      2
    );
  });

  it("leaves the document exactly as before when there are none", async () => {
    const bid = await pricedBid();
    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.investment.expenses).toBeNull();
    expect(document.investment.total).toBe(document.investment.workTotal);
  });
});

describe.skipIf(!hasDb)("includes and excludes", () => {
  it("saves a reusable line and reloads it", async () => {
    const note = await caller().bidExtras.scope.create({
      kind: "exclude",
      text: "Permit pulled by owner",
    });
    const list = await caller().bidExtras.scope.list();
    expect(list.find(n => n.id === note!.id)!.text).toBe(
      "Permit pulled by owner"
    );
  });

  it("copies the wording onto the bid rather than linking to it", async () => {
    // With an exclusion the exact wording is what settles a dispute. Editing
    // the library entry must not rewrite a proposal already sent.
    const note = await caller().bidExtras.scope.create({
      kind: "exclude",
      text: "Permit pulled by owner",
    });
    const bid = await pricedBid();
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      noteId: note!.id,
    });

    await caller().bidExtras.scope.update({
      id: note!.id,
      text: "Permit pulled by us after all",
    });

    const onBid = await caller().bidExtras.scope.onBid({ bidId: bid.id });
    expect(onBid[0].text).toBe("Permit pulled by owner");
  });

  it("adds a one-off without saving it", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      kind: "exclude",
      text: "No work above the ceiling grid on this job",
    });
    expect(await caller().bidExtras.scope.list()).toHaveLength(0);
    expect(
      await caller().bidExtras.scope.onBid({ bidId: bid.id })
    ).toHaveLength(1);
  });

  it("prints both lists on the proposal", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      kind: "include",
      text: "All rough-in, trim and final testing",
    });
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      kind: "exclude",
      text: "Permit pulled by owner",
    });

    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.inclusions.includes).toEqual([
      "All rough-in, trim and final testing",
    ]);
    expect(document.inclusions.excludes).toEqual(["Permit pulled by owner"]);
    expect(document.visibleSections).toContain("inclusions");
  });

  it("hides the section when the bid has neither", async () => {
    const bid = await pricedBid();
    const { document } = await caller().proposals.document({ bidId: bid.id });
    expect(document.visibleSections).not.toContain("inclusions");
  });

  it("never shows another user's saved lines", async () => {
    await callerFor(OTHER_USER).bidExtras.scope.create({
      kind: "exclude",
      text: "Theirs",
    });
    expect(
      (await caller().bidExtras.scope.list()).map(n => n.text)
    ).not.toContain("Theirs");
  });
});

describe.skipIf(!hasDb)("the scope-only document", () => {
  /** Everything on a document that could carry a figure. */
  const allText = (doc: {
    investment: unknown;
    scope: { label: string | null; lines: { name: string; qty: number }[] }[];
    inclusions: { includes: string[]; excludes: string[] };
    unitPricing: { label: string; price: number }[];
    summary: { projectName: string; note: string | null };
  }) =>
    [
      ...doc.scope.flatMap(g => [g.label ?? "", ...g.lines.map(l => l.name)]),
      ...doc.inclusions.includes,
      ...doc.inclusions.excludes,
      doc.summary.projectName,
      doc.summary.note ?? "",
    ].join("\n");

  it("contains no dollar figure anywhere", async () => {
    // The whole promise of the feature, checked from outside the builder.
    await caller().salesTax.setRules({ enabled: true, taxMaterials: true });
    await caller().salesTax.create({
      name: "IL",
      state: "IL",
      components: [{ label: "State", ratePct: 10 }],
    });

    const bid = await pricedBid();
    await caller().bids.update({ id: bid.id, siteAddress: "Springfield, IL" });
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit fee",
      amount: 180,
    });
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      kind: "exclude",
      text: "Permit pulled by owner",
    });

    const { document } = await caller().proposals.document({
      bidId: bid.id,
      mode: "scope-only",
    });

    expect(document.visibleSections).not.toContain("investment");
    expect(document.visibleSections).not.toContain("unitPricing");
    expect(containsMoney(allText(document))).toBe(false);

    // Serialising the visible parts must not turn up a figure either.
    const rendered = JSON.stringify({
      visibleSections: document.visibleSections,
      scope: document.scope,
      inclusions: document.inclusions,
      summary: document.summary,
      preparedFor: document.preparedFor,
      letterhead: document.letterhead,
    });
    expect(containsMoney(rendered)).toBe(false);
  });

  it("makes no claim about a price it does not show", async () => {
    // Found by looking at the real page: the document still said "This price
    // is good through 13 September" and the labor line still said "included
    // in the price below" — both pointing at a price that had been removed.
    // A dangling reference like that is what a GC notices first.
    const bid = await pricedBid();
    const { document } = await caller().proposals.document({
      bidId: bid.id,
      mode: "scope-only",
    });

    expect(document.mode).toBe("scope-only");
    expect(document.summary.validUntilLabel).toBeNull();

    // And the priced document keeps saying it.
    const full = await caller().proposals.document({ bidId: bid.id });
    expect(full.document.mode).toBe("full");
    expect(full.document.summary.validUntilLabel).not.toBeNull();
  });

  it("still shows the work, so there is something to confirm", async () => {
    const bid = await pricedBid();
    await caller().bidExtras.scope.addToBid({
      bidId: bid.id,
      kind: "include",
      text: "All rough-in and trim",
    });

    const { document } = await caller().proposals.document({
      bidId: bid.id,
      mode: "scope-only",
    });
    expect(document.visibleSections).toContain("scope");
    expect(document.visibleSections).toContain("inclusions");
    expect(document.scope.length).toBeGreaterThan(0);
  });

  it("hides the price even though that section is normally required", async () => {
    // isSectionVisible refuses to hide `investment`. The mode is what suspends
    // that, and this is the assertion that it actually does.
    const bid = await pricedBid();
    const full = await caller().proposals.document({ bidId: bid.id });
    expect(full.document.visibleSections).toContain("investment");

    const scopeOnly = await caller().proposals.document({
      bidId: bid.id,
      mode: "scope-only",
    });
    expect(scopeOnly.document.visibleSections).not.toContain("investment");
  });

  it("does not change what the priced document says", async () => {
    // Asking for scope-only must not alter the real proposal — the mode is
    // transient and nothing about it is stored.
    const bid = await pricedBid();
    await caller().bidExtras.expenses.addToBid({
      bidId: bid.id,
      name: "Permit fee",
      amount: 180,
    });

    const before = await caller().proposals.document({ bidId: bid.id });
    await caller().proposals.document({ bidId: bid.id, mode: "scope-only" });
    const after = await caller().proposals.document({ bidId: bid.id });

    expect(after.document.investment.total).toBe(
      before.document.investment.total
    );
    expect(after.document.visibleSections).toEqual(
      before.document.visibleSections
    );
  });
});
