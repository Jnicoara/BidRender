/**
 * A line the engine cannot price: isolated, reported, referenced, and never a
 * quiet $0. See shared/linePricingProblems.ts.
 *
 * ── What each block is guarding ──────────────────────────────────────────────
 *   • the rule        — which stored values count, and that NULL does not
 *   • isolation       — one broken line cannot throw the bid, or any other bid
 *                       priced beside it, and the good lines price exactly as
 *                       they would alone
 *   • the SQL twin    — the dashboard card, summed in SQL, leaves out the same
 *                       line and lands on the same price as the bid screen
 *   • reports         — one row per problem, stable reference, resolved when
 *                       fixed, reopened when broken again
 *   • refusals        — a priced proposal, the export and a close-out refuse;
 *                       scope-only does not
 *   • lookup          — a reference opens only its own company's row
 *
 * A broken line is made by writing the impossible value straight into the row,
 * because every router input refuses it — which is the point: the fault this
 * guards against arrives by a path the inputs cannot see.
 *
 * Fixture ids 9471/9472 are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { rollUpBid } from "./bidPricing";
import {
  bidLineItems,
  bids,
  pricingProblemReports,
  users,
  type Bid,
  type BidLineItem,
} from "../drizzle/schema";
import {
  formatErrorRef,
  lineProblem,
  parseErrorRef,
  problemFixHint,
} from "../shared/linePricingProblems";
import type { CompanyPricingDefaults } from "../shared/pricing";
import type { TrpcContext } from "./_core/context";

const USER = 9471;
const OTHER_USER = 9472;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

// ─── The rule ────────────────────────────────────────────────────────────────

const sound = {
  qty: "2",
  snapshotMaterialCost: "10",
  snapshotLaborHours: "1",
  snapshotLaborRate: "50",
  snapshotMarkupPct: null,
};

describe("lineProblem", () => {
  it("passes an ordinary line", () => {
    expect(lineProblem(sound)).toBeNull();
  });

  it("does not treat an untyped price or hours as a problem", () => {
    // A free count nobody has priced yet: the warning strip names it, and it
    // totals as 0 by the money convention. It is unfinished, not broken.
    expect(
      lineProblem({
        ...sound,
        snapshotMaterialCost: null,
        snapshotLaborHours: null,
      })
    ).toBeNull();
  });

  it("names each impossible value", () => {
    expect(lineProblem({ ...sound, qty: "-1" })?.code).toBe(
      "negative-quantity"
    );
    expect(lineProblem({ ...sound, snapshotLaborRate: "-5" })?.code).toBe(
      "negative-labor-rate"
    );
    expect(lineProblem({ ...sound, snapshotLaborHours: "-1" })?.code).toBe(
      "negative-labor-hours"
    );
    expect(lineProblem({ ...sound, snapshotMaterialCost: "-3" })?.code).toBe(
      "negative-material-cost"
    );
    expect(lineProblem({ ...sound, snapshotMarkupPct: "-0.1" })?.code).toBe(
      "negative-markup"
    );
  });

  it("allows a deliberate zero everywhere", () => {
    expect(
      lineProblem({
        qty: "0",
        snapshotMaterialCost: "0",
        snapshotLaborHours: "0",
        snapshotLaborRate: "0",
        snapshotMarkupPct: "0",
      })
    ).toBeNull();
  });
});

describe("references", () => {
  it("round-trips, and reads what gets typed or read aloud", () => {
    expect(formatErrorRef(1042)).toBe("ERR-1042");
    for (const typed of [
      "ERR-1042",
      "err-1042",
      " ERR 1042 ",
      "1042",
      "err1042",
    ])
      expect(parseErrorRef(typed)).toBe(1042);
  });

  it("refuses what is not a reference", () => {
    for (const typed of ["", "ERR-", "ERR-12a", "BID-1042", "-5", "0"])
      expect(parseErrorRef(typed)).toBeNull();
  });
});

describe("problemFixHint", () => {
  it("sends a typed quantity to the quantity box", () => {
    expect(
      problemFixHint("negative-quantity", {
        quantityTypeable: true,
        pricedByHand: false,
      })
    ).toMatch(/quantity/);
  });

  it("sends a frozen snapshot to remove-and-re-add", () => {
    // An assembly line's snapshot cannot be typed over (R4).
    expect(
      problemFixHint("negative-labor-rate", {
        quantityTypeable: true,
        pricedByHand: false,
      })
    ).toMatch(/Remove the line/);
    // A quantity that follows the plans is not typeable either.
    expect(
      problemFixHint("negative-quantity", {
        quantityTypeable: false,
        pricedByHand: false,
      })
    ).toMatch(/Remove the line/);
  });
});

// ─── Isolation, in the rollup ────────────────────────────────────────────────

const company: CompanyPricingDefaults = {
  overheadEnabled: false,
  overheadMode: "percentage",
  overheadValue: 0,
  profitMethod: "markup",
  profitValue: 0.2,
  productivityPct: 0,
};

const bidRow = {
  overheadEnabled: null,
  overheadMode: null,
  overheadValue: null,
  profitMethod: null,
  profitValue: null,
  productivityPct: null,
} as unknown as Bid;

let nextId = 1;
const line = (over: Partial<BidLineItem> = {}) =>
  ({
    id: nextId++,
    qty: "1",
    snapshotMaterialCost: "10",
    snapshotLaborHours: "1",
    snapshotLaborRate: "50",
    snapshotModifierPct: "0",
    snapshotMarkupPct: null,
    ...over,
  }) as unknown as BidLineItem;

describe("rollUpBid isolation", () => {
  it("prices the good lines exactly as it would without the broken one", () => {
    const good = [line(), line({ qty: "3" })];
    const broken = line({ qty: "-2" });
    const alone = rollUpBid(bidRow, good, company);
    const mixed = rollUpBid(bidRow, [good[0], broken, good[1]], company);

    expect(mixed.directCost).toBe(alone.directCost);
    expect(mixed.bidPrice.finalPrice).toBe(alone.bidPrice.finalPrice);
    expect(mixed.incomplete).toBe(true);
    expect(alone.incomplete).toBe(false);
    expect(mixed.breakdowns[1]).toBeNull();
    expect(mixed.problems).toEqual([
      { lineId: broken.id, code: "negative-quantity", detail: "qty=-2" },
    ]);
  });

  it("does not throw on settings with no finite price", () => {
    const badBid = { ...bidRow, profitMethod: "margin", profitValue: "1.5" };
    const result = rollUpBid(badBid as Bid, [line()], company);
    expect(result.incomplete).toBe(true);
    expect(result.problems[0]).toMatchObject({
      lineId: null,
      code: "bid-settings-invalid",
    });
    // Cost with markup — never presented as a price, since it is flagged.
    expect(result.bidPrice.finalPrice).toBe(result.directCost);
  });
});

// ─── Through the routers ─────────────────────────────────────────────────────

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: {
      id: userId,
      openId: `test-pricing-problems-${userId}`,
      role: "user",
      // The accounting export is internal-tier; see accountingExport.test.ts.
      accessTier: "internal",
    },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);
const uniq = () => `${Date.now()}${Math.random()}`;

describeDb("a broken line on a real bid", () => {
  /** Two priced assembly lines. Returns the bid and the two line ids. */
  async function fixtureBid() {
    const material = await caller().materials.create({
      name: `Problem material ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: 40,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const rate = (
      await caller().laborRates.update({
        id: rates.find(r => r.name === "Journeyman")!.id,
        hourlyCost: 60,
      })
    ).laborRate!;
    const assembly = await caller().assemblies.create({
      name: `Problem assembly ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 0.5,
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
    const bid = await caller().bids.create({
      name: `Problem bid ${uniq()}`,
      trades: ["electrical"],
    });
    for (const qty of [2, 5])
      await caller().bids.addAssembly({
        bidId: bid!.id,
        assemblyId: assembly!.id,
        qty,
      });
    const detail = await caller().bids.get({ id: bid!.id });
    return { bidId: bid!.id, lineIds: detail.lines.map(l => l.id) };
  }

  async function corrupt(lineId: number, qty: string) {
    const database = (await getDb())!;
    await database
      .update(bidLineItems)
      .set({ qty })
      .where(eq(bidLineItems.id, lineId));
  }

  beforeAll(async () => {
    const database = await getDb();
    if (!database) return;
    for (const id of [USER, OTHER_USER]) {
      const [existing] = await database
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!existing)
        await database.insert(users).values({
          id,
          openId: `test-pricing-problems-${id}`,
          name: `Pricing problems user ${id}`,
          accessTier: "internal",
        });
    }
  });

  beforeEach(async () => {
    const database = await getDb();
    if (!database) return;
    // Reports cascade with their bids.
    await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
  });

  it("opens, shows the line as unpriceable with a reference, and totals the rest", async () => {
    const { bidId, lineIds } = await fixtureBid();
    const before = await caller().bids.get({ id: bidId });
    await corrupt(lineIds[1], "-5");

    const detail = await caller().bids.get({ id: bidId });
    const broken = detail.lines.find(l => l.id === lineIds[1])!;
    expect(broken.breakdown).toBeNull();
    expect(broken.problem?.code).toBe("negative-quantity");
    expect(broken.problem?.ref).toMatch(/^ERR-\d+$/);
    expect(detail.incomplete).toBe(true);

    // The total is the GOOD line alone — not the good line plus a negative.
    const goodOnly = before.lines.find(l => l.id === lineIds[0])!.breakdown!;
    expect(detail.totals.directCost).toBe(goodOnly.directCost);
  });

  it("keeps the lists that price every bid at once working", async () => {
    const { bidId, lineIds } = await fixtureBid();
    const healthy = await fixtureBid();
    await corrupt(lineIds[0], "-1");

    const search = await caller().bids.search({});
    const flags = new Map(search.items.map(b => [b.id, b.incomplete]));
    expect(flags.get(bidId)).toBe(true);
    expect(flags.get(healthy.bidId)).toBe(false);

    await caller().bids.archive({ id: bidId });
    const archived = await caller().bids.archived();
    expect(archived.find(b => b.id === bidId)?.incomplete).toBe(true);
  });

  it("puts the same price on the dashboard card as on the bid", async () => {
    // The card is summed in SQL (costSums). If the SQL did not skip the same
    // line, the card would carry the broken line's negative value and the two
    // would disagree by exactly it.
    const { bidId, lineIds } = await fixtureBid();
    await corrupt(lineIds[1], "-5");

    const detail = await caller().bids.get({ id: bidId });
    const card = (await caller().bids.dashboard()).find(b => b.id === bidId)!;
    expect(card.incomplete).toBe(true);
    expect(card.directCost).toBe(detail.totals.directCost);
    expect(card.finalPrice).toBe(detail.totals.finalPrice);
  });

  it("files one report per problem, and resolves and reopens it", async () => {
    const database = (await getDb())!;
    const { bidId, lineIds } = await fixtureBid();
    await corrupt(lineIds[0], "-1");

    const first = await caller().bids.get({ id: bidId });
    const again = await caller().bids.get({ id: bidId });
    expect(again.problems[0].ref).toBe(first.problems[0].ref);

    const reportId = parseErrorRef(first.problems[0].ref!)!;
    const rowOf = async () =>
      (
        await database
          .select()
          .from(pricingProblemReports)
          .where(eq(pricingProblemReports.id, reportId))
      )[0];
    expect((await rowOf()).occurrences).toBe(2);
    expect((await rowOf()).resolvedAt).toBeNull();

    // Fixed: the next look resolves it.
    await corrupt(lineIds[0], "1");
    const fixed = await caller().bids.get({ id: bidId });
    expect(fixed.incomplete).toBe(false);
    expect((await rowOf()).resolvedAt).not.toBeNull();

    // Broken again: the SAME reference reopens rather than a new one.
    await corrupt(lineIds[0], "-1");
    const reopened = await caller().bids.get({ id: bidId });
    expect(reopened.problems[0].ref).toBe(first.problems[0].ref);
    expect((await rowOf()).resolvedAt).toBeNull();

    const all = await database
      .select()
      .from(pricingProblemReports)
      .where(eq(pricingProblemReports.bidId, bidId));
    expect(all).toHaveLength(1);
  });

  it("refuses a priced proposal, the export and a close-out — with the reference", async () => {
    const { bidId, lineIds } = await fixtureBid();
    await corrupt(lineIds[0], "-1");
    const { problems } = await caller().bids.get({ id: bidId });
    const ref = problems[0].ref!;

    await expect(
      caller().proposals.document({ bidId, mode: "full" })
    ).rejects.toThrow(ref);
    await expect(caller().accounting.quickbooks({ bidId })).rejects.toThrow(
      ref
    );
    await expect(
      caller().closeout.save({ bidId, mode: "total", totalActualHours: 4 })
    ).rejects.toThrow(ref);

    // Scope-only prints no money, so it is still available.
    const scopeOnly = await caller().proposals.document({
      bidId,
      mode: "scope-only",
    });
    expect(scopeOnly.document).toBeTruthy();

    // And the close-out panel still opens, saying the estimate is short.
    const closeout = await caller().closeout.get({ bidId });
    expect(closeout.estimate.unpriceableLines).toBe(1);
    expect(closeout.estimate.lines).toHaveLength(1);
  });

  it("looks a reference up within the company, and nowhere else", async () => {
    const { bidId, lineIds } = await fixtureBid();
    await corrupt(lineIds[0], "-1");
    const { problems } = await caller().bids.get({ id: bidId });
    const ref = problems[0].ref!;

    const found = await caller().pricingProblems.lookup({
      ref: ref.toLowerCase(),
    });
    expect(found).toMatchObject({ ref, bidId, code: "negative-quantity" });

    await expect(
      callerFor(OTHER_USER).pricingProblems.lookup({ ref })
    ).rejects.toThrow(/No report/);
  });
});
