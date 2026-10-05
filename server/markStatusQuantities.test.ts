/**
 * An existing device never prices as new; an unconfirmed mark is nobody's
 * answer (shared/markStatus.ts, rule 1; migrations 0098 and 0103).
 *
 * Four marks on one count: two new (one with no status at all — every mark
 * placed before the column), one `existing`, one `unconfirmed`. Every place a
 * quantity is made from must say 2:
 *
 * - the bid line the count is sent to (`stampCountsForBid`);
 * - the "N placed" count the screens compare that line with
 *   (`countStampsByGroup`) — the same rule, or the line would look out of date
 *   with its own count forever;
 * - the marks the materials list, the export and the drops read
 *   (`getStampsForBid`).
 *
 * The sheet's own drawing still shows all four (`getStampsForSheet`): a mark
 * is never hidden for what it is, only left out of what is bought.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidPdfs,
  laborRates,
  materials,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9103;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-mark-status-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-mark-status-${USER}`,
      name: "Mark status test user",
    });
  }
});

/** A priced assembly of this user's own: fixture prices, never shipped ones. */
async function ownAssembly() {
  const database = (await getDb())!;
  const [material] = await database.insert(materials).values({
    userId: USER,
    name: `Mark status device ${Date.now()}${Math.random()}`,
    unitOfSale: "each",
    costPerUnit: "10.0000",
  });
  const [rate] = await database.insert(laborRates).values({
    userId: USER,
    name: `Mark status role ${Date.now()}${Math.random()}`,
    hourlyCost: "50.0000",
  });
  const [assembly] = await database.insert(assemblies).values({
    userId: USER,
    name: `Mark status assembly ${Date.now()}${Math.random()}`,
    category: "Devices",
    baseLaborHours: "0.5000",
    laborRateId: rate.insertId,
  });
  await database.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return assembly.insertId;
}

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Mark status ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
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
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  return { bidId: bid.id, sheetId: sheets[0].id };
}

withDb("a mark's status decides whether it is a quantity", () => {
  it("leaves an existing device and an unconfirmed mark out of every quantity, and shows all four", async () => {
    const assemblyId = await ownAssembly();
    const { bidId, sheetId } = await scenario();
    const group = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    const dropped = await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: [1, 2, 3, 4].map(i => ({ x: i * 10, y: i * 10 })),
    });
    expect(dropped.ids).toHaveLength(4);

    // Two stay NULL-or-new; one is an existing device; one is unchecked.
    const database = (await getDb())!;
    const [noStatus, isNew, isExisting, isUnconfirmed] = dropped.ids;
    void noStatus;
    await database
      .update(takeoffStamps)
      .set({ status: "new" })
      .where(eq(takeoffStamps.id, isNew));
    await database
      .update(takeoffStamps)
      .set({ status: "existing" })
      .where(eq(takeoffStamps.id, isExisting));
    await database
      .update(takeoffStamps)
      .set({ status: "unconfirmed" })
      .where(eq(takeoffStamps.id, isUnconfirmed));

    // The bid line: priced for two, never four.
    await caller().takeoffGroups.sendToBid({ id: group.id });
    const lines = (await caller().bids.get({ id: bidId })).lines;
    const line = lines.find(l => l.takeoffGroupId === group.id);
    expect(
      Number(line?.qty),
      "the bid line priced an existing or unconfirmed mark"
    ).toBe(2);

    // The count the screens compare it with: the same two.
    expect((await db.countStampsByGroup(bidId, USER)).get(group.id)).toBe(2);

    // What the materials list, the export and the drops read: the same two.
    const forQuantities = await db.getStampsForBid(bidId, USER);
    expect(forQuantities.map(s => s.id).sort()).toEqual(
      [noStatus, isNew].sort()
    );

    // The drawing still shows every mark.
    expect(await db.getStampsForSheet(sheetId, USER)).toHaveLength(4);
  });

  it("with no status set anywhere — every mark placed so far — nothing changes", async () => {
    const assemblyId = await ownAssembly();
    const { bidId, sheetId } = await scenario();
    const group = await caller().takeoffGroups.forAssembly({
      bidId,
      assemblyId,
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: [1, 2, 3].map(i => ({ x: i * 10, y: i * 10 })),
    });
    await caller().takeoffGroups.sendToBid({ id: group.id });
    const line = (await caller().bids.get({ id: bidId })).lines.find(
      l => l.takeoffGroupId === group.id
    );
    expect(Number(line?.qty)).toBe(3);
  });
});
