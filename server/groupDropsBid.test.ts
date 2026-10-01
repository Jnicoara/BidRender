/**
 * VERTICALS ON MARKS, ALL THE WAY TO THE BID.
 * references/track-b-held-migrations-plan.md § 3.
 *
 * The pure rules are in groupDrops.test.ts. This holds the wiring, where the
 * failures would be quiet:
 *   - the drops land on the run type's bid line, and the totals, the drops
 *     readout and the materials list say the same number;
 *   - a bid with NO traced run still prices its drops (the footage loader used
 *     to return nothing when there were no runs);
 *   - a drop on a shipped run type the company later forks prices from the
 *     FORK — the stored id is read through resolveRunType (Track A's guard);
 *   - a locked bid refuses a drop change.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { footageByRunType } from "./runTypeFootage";
import {
  bidPdfs,
  bids,
  materials,
  takeoffHeightDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9381;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-group-drops-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const HUNDRED_FEET_PTS = (100 * 12 * 72) / 48;

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database!.insert(users).values({
      id: USER,
      openId: `test-group-drops-${USER}`,
      name: "Group drops fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
  await database!
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database!.delete(materials).where(eq(materials.userId, USER));
  await database!
    .delete(takeoffHeightDefaults)
    .where(eq(takeoffHeightDefaults.userId, USER));
  // Run height 10'-0": receptacles ship at 1'-6", so each drop is 8.50 ft.
  await caller().takeoffHeights.setCompanyDistribution({ inches: 120 });
});

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Drops ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function priced(name: string, cost: number) {
  const list = await caller().materials.list();
  const row = list.find(m => m.name === name)!;
  const updated = await caller().materials.update({
    id: row.id,
    costPerUnit: cost,
  });
  return updated?.material?.id ?? row.id;
}

async function emtType() {
  return caller().takeoffRunTypes.create({
    label: `Drops EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: await priced('1/2" EMT', 1.25),
    conductorMaterialId: await priced("#12 THHN", 0.18),
    conductorCount: 2,
    groundMaterialId: await priced("#12 bare CU, solid", 0.12),
    groundCount: 1,
  });
}

/** A group of `n` receptacle marks, far from every run end. */
async function receptacles(bidId: number, sheetId: number, n: number) {
  const group = await caller().takeoffGroups.create({
    bidId,
    label: `Receptacles ${Math.random()}`,
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y: 3000 })),
  });
  return group.id;
}

describe.skipIf(!hasDb)("drops from marks reach the bid", () => {
  it("adds them to the run type's line, and every reading agrees", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const type = await emtType();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      runTypeId: type.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: HUNDRED_FEET_PTS, y: 0 },
      ],
    });
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const groupId = await receptacles(bidId, sheetId, 4);

    const raceway = async () =>
      Number(
        (await caller().bids.get({ id: bidId })).lines.find(
          l => l.takeoffRunTypeId === type.id && l.runMaterialRole === "raceway"
        )!.qty
      );
    expect(await raceway()).toBeCloseTo(100, 2);

    await caller().takeoffGroups.setDrop({
      id: groupId,
      dropKind: "receptacle",
      dropRunTypeId: type.id,
    });

    // 100 ft traced + 4 drops of 8.50 ft.
    expect(await raceway()).toBeCloseTo(134, 2);
    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.conduitBoughtFeet).toBeCloseTo(134, 2);
    expect(totals.markDropCount).toBe(4);
    const readout = await caller().takeoffRuns.drops({ bidId });
    expect(readout.fromMarks).toHaveLength(1);
    expect(readout.fromMarks[0].feet).toBeCloseTo(34, 2);
    const list = await caller().materialsList.get({ bidId });
    expect(list.notes.join(" ")).toMatch(
      /4 drops to counted devices.*NOT counted/
    );
    const row = (await caller().takeoffGroups.list({ bidId })).groups.find(
      g => g.id === groupId
    )!;
    expect(row.drop.result?.status).toBe("counted");
    expect(row.drop.result?.perDropFeet).toBe(8.5);
  });

  it("prices drops on a bid with no traced run at all", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const type = await emtType();
    const groupId = await receptacles(bidId, sheetId, 2);
    await caller().takeoffGroups.setDrop({
      id: groupId,
      dropKind: "receptacle",
      dropRunTypeId: type.id,
    });
    const footage = await footageByRunType(bidId, USER, null);
    const row = footage.get(type.id);
    expect(row?.conduitBoughtFeet).toBeCloseTo(17, 2);
    expect(row?.markDropCount).toBe(2);
  });

  it("prices a drop on a shipped type from the company's FORK", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const shipped = (
      await caller().takeoffRunTypes.list({ includeArchived: false })
    ).find(
      t => t.isShipped && t.pathType === "conduit" && t.conductorCount === 2
    )!;
    expect(shipped).toBeTruthy();
    const groupId = await receptacles(bidId, sheetId, 1);
    await caller().takeoffGroups.setDrop({
      id: groupId,
      dropKind: "receptacle",
      dropRunTypeId: shipped.id,
    });
    const wireBefore = (await caller().takeoffRuns.totals({ bidId }))
      .wireBoughtFeet;

    // Editing the shipped type FORKS it; the group still stores the shipped id.
    const { forked } = await caller().takeoffRunTypes.update({
      id: shipped.id,
      conductorCount: 4,
    });
    expect(forked).toBe(true);
    const wireAfter = (await caller().takeoffRuns.totals({ bidId }))
      .wireBoughtFeet;
    // Two more conductors down one 8.50 ft drop.
    expect(wireAfter - wireBefore).toBeCloseTo(17, 2);
  });

  it("refuses a drop change on a locked bid", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const groupId = await receptacles(bidId, sheetId, 1);
    await caller().bids.lockQuantities({ bidId });
    await expect(
      caller().takeoffGroups.setDrop({ id: groupId, dropKind: "receptacle" })
    ).rejects.toThrow(/locked/);
  });
});
