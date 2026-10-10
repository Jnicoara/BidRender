/**
 * DROPS NOT PRICED ON THE LISTS — dashboard cards, the column and headline
 * sums, "Find a bid" and analytics (owner, 2026-10-10: "N drops not priced",
 * never $0).
 *
 * Until this date only the bid page and the print counted a drop whose count
 * has no drop material (server/dropsNotPriced.test.ts). The lists build their
 * tally from lines alone, so a bid whose ONLY gap was its drops read as fully
 * priced on its card while the bid it opened said "2 drops not priced".
 *
 * The fixture's one line is fully priced, so the drops are the only gap; and
 * a bid with no marks rides alongside to prove a bid that does not use drops
 * comes back exactly as before — no `drops` key, the same figure.
 *
 * Fixture id 9742 is this file's alone.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineLaborRates, seedBaselineMaterials } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  laborRates,
  takeoffGroups,
  takeoffHeightDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { NOTHING_NOT_PRICED } from "../shared/lineNotPriced";
import { sumBidTotals } from "../shared/bidTotals";

const USER = 9742;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: {
      id: USER,
      openId: `test-drops-lists-${USER}`,
      role: "user",
    },
  } as unknown as TrpcContext);
const uniq = () => `${Date.now()}${Math.random()}`;

describe("a sum of bids carries their drops", () => {
  const bid = (drops?: number) => ({
    notPriced: { lines: 1, parts: 0, hours: 0, ...(drops ? { drops } : {}) },
    incomplete: false,
  });

  it("adds them up, and says them", () => {
    expect(sumBidTotals([bid(2), bid(), bid(3)], () => 10).notPriced).toEqual({
      lines: 3,
      parts: 0,
      hours: 0,
      drops: 5,
    });
  });

  it("a sum with none reads exactly as it did — no drops key", () => {
    expect(sumBidTotals([bid(), bid()], () => 10).notPriced).toEqual({
      lines: 2,
      parts: 0,
      hours: 0,
    });
    expect(sumBidTotals([], () => 0).notPriced).toEqual(NOTHING_NOT_PRICED);
  });
});

describeDb("the lists say a bid's drops not priced", () => {
  beforeAll(async () => {
    const database = (await getDb())!;
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id: USER,
        openId: `test-drops-lists-${USER}`,
        name: "Drops on the lists fixture",
      });
    await seedBaselineMaterials();
    await seedBaselineLaborRates();
  });

  beforeEach(async () => {
    const database = (await getDb())!;
    await database.delete(bids).where(inArray(bids.userId, [USER]));
    await database.delete(assemblies).where(eq(assemblies.userId, USER));
    await database.delete(laborRates).where(eq(laborRates.userId, USER));
    await database
      .delete(takeoffRunTypes)
      .where(eq(takeoffRunTypes.userId, USER));
    await database
      .delete(takeoffHeightDefaults)
      .where(eq(takeoffHeightDefaults.userId, USER));
  });

  /** A bid with one fully priced line; `marks` receptacles with no drop material. */
  async function aBid(marks: number) {
    const material = await caller().materials.create({
      name: `Lists probe ${uniq()}`,
      unitOfSale: "each",
      costPerUnit: 100,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const journeyman = await caller().laborRates.update({
      id: rates.find(r => r.name === "Journeyman")!.id,
      hourlyCost: 50,
    });
    const assembly = await caller().assemblies.create({
      name: `Lists receptacle ${uniq()}`,
      category: "Devices",
      trade: "electrical",
      projectType: null,
      baseLaborHours: 2,
      laborRateId: journeyman.laborRate!.id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
      mountHeightTypeKey: "receptacle",
    });
    const bid = (await caller().bids.create({
      name: `Lists bid ${uniq()}`,
      trades: ["electrical"],
    }))!;
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly!.id,
      qty: 1,
      unitLabel: null,
    });
    if (marks === 0) return bid.id;
    const database = (await getDb())!;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "E1.pdf",
      storageKey: `test/${bid.id}/e1.pdf`,
      byteSize: 1024,
      pageCount: 1,
      sortOrder: 0,
    });
    await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });
    const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
    await caller().takeoffHeights.setBidDistribution({
      bidId: bid.id,
      inches: 120,
    });
    const group = await caller().takeoffGroups.create({
      bidId: bid.id,
      label: "Receptacle",
    });
    await database
      .update(takeoffGroups)
      .set({ kind: "assembly", assemblyId: assembly!.id })
      .where(eq(takeoffGroups.id, group.id));
    await caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId: sheet.id,
      groupId: group.id,
      at: Array.from({ length: marks }, (_, i) => ({
        x: 100 + 300 * i,
        y: 100,
      })),
    });
    return bid.id;
  }

  it("a dashboard card says the drops its bid page says, and a bid without them is unchanged", async () => {
    const withDrops = await aBid(2);
    const plain = await aBid(0);
    expect((await caller().bids.get({ id: withDrops })).dropsNotPriced).toBe(2);

    const cards = await caller().bids.dashboard();
    const card = cards.find(c => c.id === withDrops)!;
    expect(card.notPriced).toEqual({ lines: 0, parts: 0, hours: 0, drops: 2 });

    const plainCard = cards.find(c => c.id === plain)!;
    expect(plainCard.notPriced).toEqual({ lines: 0, parts: 0, hours: 0 });
    const plainBid = await caller().bids.get({ id: plain });
    expect(plainCard.totalDue).toBe(plainBid.totals.totalDue);
  });

  it("'Find a bid' says them too", async () => {
    const withDrops = await aBid(3);
    const plain = await aBid(0);
    const { items } = await caller().bids.search({});
    expect(items.find(r => r.id === withDrops)!.notPriced).toEqual({
      lines: 0,
      parts: 0,
      hours: 0,
      drops: 3,
    });
    expect(items.find(r => r.id === plain)!.notPriced).toEqual({
      lines: 0,
      parts: 0,
      hours: 0,
    });
  });

  it("analytics counts the bid as not priced and says how many drops", async () => {
    const withDrops = await aBid(2);
    await aBid(0);
    const { totals } = await caller().analytics.outcomes();
    expect(totals.notPricedBids).toBe(1);
    expect(totals.notPricedBidList.map(b => b.bidId)).toEqual([withDrops]);
    expect(totals.notPricedDrops).toBe(2);
  });
});
