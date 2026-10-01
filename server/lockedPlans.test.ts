/**
 * A LOCKED BID: THE LAST DOORS — sending, scales, plan sets and bid lines.
 *
 * `lockedEdits.test.ts` and `lockedDeletes.test.ts` close the marks and runs.
 * These are the remaining ways the numbers behind a locked bid could still
 * move, closed on 2026-09-29 at the owner's answer to the plan's questions
 * 1, 3 and 4:
 *
 *   • Send to bid — a count, a run type. It used to be allowed on a locked
 *     bid ("arrives frozen"); a new line is a change, so it is refused.
 *   • A sheet's scale — set, cleared, or auto-detected. A scale multiplies
 *     every run measured on its sheet.
 *   • Removing a plan set — it cascades away every mark and run on it.
 *   • Removing a bid line that came FROM THE PLANS, one at a time or by the
 *     bulk room archive. A hand-typed line stays removable.
 *
 * Each refusal is asserted two ways — it throws, and the row is as it was —
 * and has its unlocked twin.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bidPdfs,
  bidPdfSheets,
  bidUnitLinks,
  bids,
  laborRates,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9939;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-locked-plans-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const database = async () => (await getDb())!;

/** A 100 ft run at 1/4" = 1'-0", in page points. */
const HUNDRED_FEET_PTS = (100 * 12) / 48 / (1 / 72);

/** An assembly priced here, so no test borrows a shipped price. */
async function ownAssembly(name: string) {
  const d = await database();
  const [material] = await d.insert(materials).values({
    userId: USER,
    name: `${name} material`,
    unitOfSale: "each",
    costPerUnit: "10.0000",
  });
  const [rate] = await d.insert(laborRates).values({
    userId: USER,
    name: `${name} role`,
    hourlyCost: "70.0000",
  });
  const [assembly] = await d.insert(assemblies).values({
    userId: USER,
    name,
    category: "Devices",
    baseLaborHours: "0.5000",
    laborRateId: rate.insertId,
  });
  await d.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return assembly.insertId;
}

/**
 * A bid with: one scaled sheet and one unscaled; a count of 3 marks; a
 * 100 ft conduit run under its own type; nothing sent yet.
 */
async function aBid() {
  const bid = (await caller().bids.create({
    name: `Locked plans ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const d = await database();
  const [pdf] = await d.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E1.pdf",
    storageKey: `test/${bid.id}/e1.pdf`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 2,
    outline: [],
  });
  const [sheet, unscaled] = sheets;
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  const assemblyId = await ownAssembly(`Exit sign ${Math.random()}`);
  const group = await caller().takeoffGroups.forAssembly({
    bidId: bid.id,
    assemblyId,
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: sheet.id,
    groupId: group.id,
    at: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ],
  });
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `Locked plans EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: sheet.id,
    name: "Homerun",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: HUNDRED_FEET_PTS, y: 0 },
    ],
  });
  return {
    bidId: bid.id,
    pdfId: pdf.insertId,
    sheetId: sheet.id,
    unscaledId: unscaled.id,
    groupId: group.id,
    runTypeId: type.id,
    assemblyId,
    lock: () => caller().bids.lockQuantities({ bidId: bid.id }),
    unlock: () => caller().bids.unlockQuantities({ bidId: bid.id }),
  };
}

async function linesOf(bidId: number) {
  return (await database())
    .select()
    .from(bidLineItems)
    .where(eq(bidLineItems.bidId, bidId))
    .orderBy(bidLineItems.id);
}

async function sheetRow(id: number) {
  const [row] = await (await database())
    .select()
    .from(bidPdfSheets)
    .where(eq(bidPdfSheets.id, id));
  return row;
}

beforeAll(async () => {
  if (!hasDb) return;
  const d = await database();
  const [existing] = await d
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await d.insert(users).values({
      id: USER,
      openId: `test-locked-plans-${USER}`,
      name: "Locked plans fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const d = await database();
  await d.delete(bids).where(inArray(bids.userId, [USER]));
  await d.delete(assemblies).where(eq(assemblies.userId, USER));
  // Run types are per USER, not per bid, so deleting bids does not clear them.
  await d.delete(takeoffRunTypes).where(eq(takeoffRunTypes.userId, USER));
  await d.delete(materials).where(eq(materials.userId, USER));
  await d.delete(laborRates).where(eq(laborRates.userId, USER));
});

withDb("sending to a locked bid", () => {
  it("refuses a count, and adds no line", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffGroups.sendToBid({ id: f.groupId })
    ).rejects.toThrow(/locked, so nothing more can be sent/);
    expect(await linesOf(f.bidId)).toEqual([]);
  });

  it("refuses a run type, and adds no line", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffRunTypes.sendToBid({
        bidId: f.bidId,
        runTypeId: f.runTypeId,
      })
    ).rejects.toThrow(/locked, so nothing more can be sent/);
    expect(await linesOf(f.bidId)).toEqual([]);
  });

  it("refuses sending a run type AGAIN, and leaves its line alone", async () => {
    const f = await aBid();
    await caller().takeoffRunTypes.sendToBid({
      bidId: f.bidId,
      runTypeId: f.runTypeId,
    });
    await f.lock();
    const before = await linesOf(f.bidId);
    await expect(
      caller().takeoffRunTypes.sendToBid({
        bidId: f.bidId,
        runTypeId: f.runTypeId,
      })
    ).rejects.toThrow(/locked/);
    expect(await linesOf(f.bidId)).toEqual(before);
  });

  it("lets both through once unlocked", async () => {
    const f = await aBid();
    await f.lock();
    await f.unlock();
    await caller().takeoffGroups.sendToBid({ id: f.groupId });
    await caller().takeoffRunTypes.sendToBid({
      bidId: f.bidId,
      runTypeId: f.runTypeId,
    });
    const lines = await linesOf(f.bidId);
    expect(lines.some(l => l.takeoffGroupId === f.groupId)).toBe(true);
    expect(lines.some(l => l.takeoffRunTypeId === f.runTypeId)).toBe(true);
  });
});

withDb("a locked bid's scales", () => {
  it("refuses a new scale, and keeps the old one", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().bidPdfs.setSheetScale({
        id: f.sheetId,
        scaleText: `1/8" = 1'-0"`,
      })
    ).rejects.toThrow(/locked, so a sheet's scale cannot be changed/);
    expect(Number((await sheetRow(f.sheetId)).scaleRatio)).toBe(48);
  });

  it("refuses clearing a scale, and keeps it", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().bidPdfs.clearSheetScale({ id: f.sheetId })
    ).rejects.toThrow(/locked, so a sheet's scale cannot be cleared/);
    expect(Number((await sheetRow(f.sheetId)).scaleRatio)).toBe(48);
  });

  it("does not APPLY a detected scale, and does not complain either", async () => {
    const f = await aBid();
    await f.lock();
    const result = await caller().bidPdfs.detectSheetScale({
      id: f.unscaledId,
      sheetText: `POWER PLAN\nSCALE: 1/4" = 1'-0"`,
    });
    expect(result.applied).toBe(false);
    const row = await sheetRow(f.unscaledId);
    expect(row.scaleRatio).toBeNull();
    // Remembered as a suggestion for after the unlock.
    expect(row.detectedScaleText).not.toBeNull();
  });

  it("lets all three through once unlocked", async () => {
    const f = await aBid();
    await f.lock();
    await f.unlock();
    await caller().bidPdfs.setSheetScale({
      id: f.sheetId,
      scaleText: `1/8" = 1'-0"`,
    });
    expect(Number((await sheetRow(f.sheetId)).scaleRatio)).toBe(96);
    await caller().bidPdfs.clearSheetScale({ id: f.sheetId });
    expect((await sheetRow(f.sheetId)).scaleRatio).toBeNull();
    const detected = await caller().bidPdfs.detectSheetScale({
      id: f.unscaledId,
      sheetText: `POWER PLAN\nSCALE: 1/4" = 1'-0"`,
    });
    expect(detected.applied).toBe(true);
  });
});

withDb("removing a plan set from a locked bid", () => {
  const pdfsOf = async (bidId: number) =>
    (await database()).select().from(bidPdfs).where(eq(bidPdfs.bidId, bidId));

  it("refuses, and the plan and its marks stay", async () => {
    const f = await aBid();
    await f.lock();
    await expect(caller().bidPdfs.remove({ id: f.pdfId })).rejects.toThrow(
      /locked, so its plan sets cannot be removed/
    );
    expect(await pdfsOf(f.bidId)).toHaveLength(1);
    expect(
      await caller().takeoffStamps.listForSheet({ sheetId: f.sheetId })
    ).toHaveLength(3);
  });

  it("lets it through once unlocked", async () => {
    const f = await aBid();
    await f.lock();
    await f.unlock();
    await caller().bidPdfs.remove({ id: f.pdfId });
    expect(await pdfsOf(f.bidId)).toEqual([]);
  });
});

withDb("removing bid lines on a locked bid", () => {
  it("refuses a line from the plans, and keeps it", async () => {
    const f = await aBid();
    const { lineId } = await caller().takeoffGroups.sendToBid({
      id: f.groupId,
    });
    await f.lock();
    await expect(
      caller().bids.removeLine({ bidId: f.bidId, id: lineId })
    ).rejects.toThrow(/locked, so lines from the plans cannot be removed/);
    expect((await linesOf(f.bidId)).map(l => l.id)).toEqual([lineId]);
  });

  it("still removes a hand-typed line — the lock was never about it", async () => {
    const f = await aBid();
    const other = await ownAssembly(`Panel ${Math.random()}`);
    await caller().bids.addAssembly({
      bidId: f.bidId,
      assemblyId: other,
      qty: 2,
    });
    await f.lock();
    const [typed] = await linesOf(f.bidId);
    await caller().bids.removeLine({ bidId: f.bidId, id: typed.id });
    expect(await linesOf(f.bidId)).toEqual([]);
  });

  it("refuses the bulk room archive when it would take a line from the plans", async () => {
    const f = await aBid();
    const { lineId } = await caller().takeoffGroups.sendToBid({
      id: f.groupId,
    });
    await caller().bids.updateLine({
      bidId: f.bidId,
      id: lineId,
      unitLabel: "Room 101",
    });
    await (await database()).insert(bidUnitLinks).values({
      bidId: f.bidId,
      unitLabel: "Room 101",
      templateLabel: "Type A",
    });
    await f.lock();
    await expect(
      caller().bids.archiveLinkedCopies({
        bidId: f.bidId,
        templateLabel: "Type A",
      })
    ).rejects.toThrow(/locked, so lines from the plans cannot be removed/);
    const [line] = await linesOf(f.bidId);
    expect(line.archivedAt).toBeNull();
  });

  it("lets a line from the plans go once unlocked", async () => {
    const f = await aBid();
    const { lineId } = await caller().takeoffGroups.sendToBid({
      id: f.groupId,
    });
    await f.lock();
    await f.unlock();
    await caller().bids.removeLine({ bidId: f.bidId, id: lineId });
    expect(await linesOf(f.bidId)).toEqual([]);
  });
});
