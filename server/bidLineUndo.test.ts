/**
 * UNDO FOR REMOVING A BID LINE — owner, 2026-09-30 (todo.md), built 2026-10-10.
 *
 * The whole point is the FROZEN price. A line keeps what its parts and labor
 * cost when it was added; re-adding the assembly would price it at today's
 * numbers. So the fixture changes the catalog price between adding and
 * removing, and the restored row must still carry the old one — compared
 * field by field against the stored row, not against a number typed here.
 *
 *   • remove + Undo gives back the exact stored row, same id, and the same
 *     bid total, though the catalog price moved in between;
 *   • a bid that never used it is unchanged, row for row;
 *   • a panel priced by the line points at it again;
 *   • a packet for another bid, a second Undo, and a forged packet refuse.
 *
 * Fixture id 9741 is this file's alone.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidLineItems, bidPanels, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9741;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: {
      id: USER,
      openId: `test-bid-line-undo-${USER}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);
const uniq = () => `${Date.now()}${Math.random()}`;

async function rawLines(bidId: number) {
  const database = (await getDb())!;
  return database
    .select()
    .from(bidLineItems)
    .where(eq(bidLineItems.bidId, bidId))
    .orderBy(bidLineItems.id);
}

/** A bid with two priced lines; returns the material so a test can re-price it. */
async function aBid() {
  const material = await caller().materials.create({
    name: `Undo material ${uniq()}`,
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
    name: `Undo assembly ${uniq()}`,
    category: "Devices",
    trade: "electrical",
    projectType: "both",
    baseLaborHours: 0.5,
    laborRateId: rate.id,
    materials: [{ materialId: material!.id, qty: 2 }],
    modifierIds: [],
  });
  const bid = (await caller().bids.create({
    name: `Undo bid ${uniq()}`,
    trades: ["electrical"],
  }))!;
  const a = await caller().bids.addAssembly({
    bidId: bid.id,
    assemblyId: assembly!.id,
    qty: 3,
  });
  await caller().bids.addAssembly({
    bidId: bid.id,
    assemblyId: assembly!.id,
    qty: 5,
  });
  return { bidId: bid.id, lineId: a.line!.id, materialId: material!.id };
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: USER,
      openId: `test-bid-line-undo-${USER}`,
      name: "Bid line undo fixture",
      accessTier: "internal",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

withDb("Undo for removing a bid line", () => {
  it("puts back the exact stored line and total, though the catalog price moved", async () => {
    const b = await aBid();
    const rowsBefore = await rawLines(b.bidId);
    const totalBefore = (await caller().bids.get({ id: b.bidId })).totals;

    // Today's price changes AFTER the line was added — a re-add would see it.
    await caller().materials.update({ id: b.materialId, costPerUnit: 95 });

    const { undo } = await caller().bids.removeLine({
      bidId: b.bidId,
      id: b.lineId,
    });
    expect(undo).not.toBeNull();
    expect((await rawLines(b.bidId)).map(r => r.id)).not.toContain(b.lineId);

    const { restored } = await caller().bids.restoreLine({
      bidId: b.bidId,
      undo: undo!,
    });
    expect(restored).toBe(b.lineId);
    // Every column, frozen prices included, exactly as stored before.
    expect(await rawLines(b.bidId)).toEqual(rowsBefore);
    expect((await caller().bids.get({ id: b.bidId })).totals).toEqual(
      totalBefore
    );
  });

  it("leaves a bid that never used it unchanged, row for row", async () => {
    const used = await aBid();
    const other = await aBid();
    const otherRows = await rawLines(other.bidId);
    const otherTotals = (await caller().bids.get({ id: other.bidId })).totals;

    const { undo } = await caller().bids.removeLine({
      bidId: used.bidId,
      id: used.lineId,
    });
    await caller().bids.restoreLine({ bidId: used.bidId, undo: undo! });

    expect(await rawLines(other.bidId)).toEqual(otherRows);
    expect((await caller().bids.get({ id: other.bidId })).totals).toEqual(
      otherTotals
    );
  });

  it("points a panel priced by the line back at it", async () => {
    const b = await aBid();
    const database = (await getDb())!;
    const [panel] = await database.insert(bidPanels).values({
      bidId: b.bidId,
      userId: USER,
      name: "LP-1",
      lineItemId: b.lineId,
    });
    const linkOf = async () =>
      (
        await database
          .select({ lineItemId: bidPanels.lineItemId })
          .from(bidPanels)
          .where(eq(bidPanels.id, panel.insertId))
      )[0].lineItemId;

    const { undo } = await caller().bids.removeLine({
      bidId: b.bidId,
      id: b.lineId,
    });
    expect(await linkOf()).toBeNull();
    await caller().bids.restoreLine({ bidId: b.bidId, undo: undo! });
    expect(await linkOf()).toBe(b.lineId);
  });

  it("refuses a second Undo, another bid's packet, and a forged one", async () => {
    const b = await aBid();
    const other = await aBid();
    const { undo } = await caller().bids.removeLine({
      bidId: b.bidId,
      id: b.lineId,
    });

    await expect(
      caller().bids.restoreLine({ bidId: other.bidId, undo: undo! })
    ).rejects.toThrow(/not valid here/);

    const forged = {
      ...undo!,
      data: undo!.data.replace(
        /"snapshotMaterialCost":"[^"]*"/,
        '"snapshotMaterialCost":"0.00"'
      ),
    };
    await expect(
      caller().bids.restoreLine({ bidId: b.bidId, undo: forged })
    ).rejects.toThrow(/not valid here/);

    await caller().bids.restoreLine({ bidId: b.bidId, undo: undo! });
    await expect(
      caller().bids.restoreLine({ bidId: b.bidId, undo: undo! })
    ).rejects.toThrow(/already back/);
  });
});
