/**
 * A MARK'S OWN DROP, ALL THE WAY TO THE BID.
 * references/vertical-drops-plan.md § 2, § 4, § 8.
 *
 * The pure rules are in groupDrops.test.ts and takeoffVerticals.test.ts.
 * This holds the wiring, where a fault is a number that quietly stays put:
 *   - a mark's own height (0098) moves the bid line, the totals and the
 *     drops readout together;
 *   - "No drop on these" takes exactly that mark's drop off;
 *   - a run end linked to a mark but counting no drop there leaves the
 *     mark's drop on its count (gap 5 — it used to vanish);
 *   - a run end on an EXISTING device prices its drop and the run row says
 *     so; "Leave it off" takes it off (option C, owner 2026-10-05);
 *   - a locked bid refuses both edits.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
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

const USER = 9382;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-mark-drops-${USER}`, role: "user" },
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
      openId: `test-mark-drops-${USER}`,
      name: "Mark drops fixture",
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
    name: `Mark drops ${Date.now()}${Math.random()}`,
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
    label: `Mark drops EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: await priced('1/2" EMT', 1.25),
    conductorMaterialId: await priced("#12 THHN Copper", 0.18),
    conductorCount: 2,
    groundMaterialId: await priced("#12 bare solid Copper", 0.12),
    groundCount: 1,
  });
}

/** A 100 ft homerun of `type`, its end at (HUNDRED_FEET_PTS, 0). */
async function homerun(bidId: number, sheetId: number, typeId: number) {
  const run = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Homerun",
    pathType: "conduit",
    runTypeId: typeId,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: HUNDRED_FEET_PTS, y: 0 },
    ],
  });
  return run.id;
}

/** `n` receptacles dropping in `typeId`; returns the group and mark ids. */
async function receptacles(
  bidId: number,
  sheetId: number,
  n: number,
  typeId: number
) {
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
  await caller().takeoffGroups.setDrop({
    id: group.id,
    dropKind: "receptacle",
    dropRunTypeId: typeId,
  });
  const ids = (await caller().takeoffStamps.listForSheet({ sheetId }))
    .filter(m => m.groupId === group.id)
    .map(m => m.id);
  return { groupId: group.id, ids };
}

async function setup(n = 4) {
  const { bidId, sheetId } = await bidWithSheet();
  const type = await emtType();
  const runId = await homerun(bidId, sheetId, type.id);
  await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
  const { groupId, ids } = await receptacles(bidId, sheetId, n, type.id);
  const raceway = async () =>
    Number(
      (await caller().bids.get({ id: bidId })).lines.find(
        l => l.takeoffRunTypeId === type.id && l.runMaterialRole === "raceway"
      )!.qty
    );
  return { bidId, sheetId, typeId: type.id, runId, groupId, ids, raceway };
}

describe.skipIf(!hasDb)("a mark's own height reaches the bid", () => {
  it("drops a 54-inch mark 5.50 ft, and every reading agrees", async () => {
    const { bidId, sheetId, ids, raceway } = await setup(4);
    // 100 ft traced + 4 drops of 8.50 ft.
    expect(await raceway()).toBeCloseTo(134, 2);

    await caller().takeoffStamps.setHeight({
      bidId,
      ids: [ids[0]],
      inches: 54,
      source: "typed",
    });
    // 100 + 3 × 8.50 + 5.50.
    expect(await raceway()).toBeCloseTo(131, 2);
    expect(
      (await caller().takeoffRuns.totals({ bidId })).conduitBoughtFeet
    ).toBeCloseTo(131, 2);
    const readout = await caller().takeoffRuns.drops({ bidId });
    expect(readout.fromMarks[0].feet).toBeCloseTo(31, 2);
    // Never "N × one drop" when the marks differ.
    expect(readout.fromMarks[0].perDropFeet).toBeNull();
    const mark = (await caller().takeoffStamps.listForSheet({ sheetId })).find(
      m => m.id === ids[0]
    )!;
    expect(mark.mountHeightInches).toBe(54);
    expect(mark.mountHeightSource).toBe("typed");

    // Back to the count's height.
    await caller().takeoffStamps.setHeight({
      bidId,
      ids: [ids[0]],
      inches: null,
      source: "typed",
    });
    expect(await raceway()).toBeCloseTo(134, 2);
  });

  it("stores an accepted plan height as READ", async () => {
    const { bidId, sheetId, ids } = await setup(1);
    await caller().takeoffStamps.setHeight({
      bidId,
      ids,
      inches: 48,
      source: "read",
    });
    const [mark] = await caller().takeoffStamps.listForSheet({ sheetId });
    expect(mark.mountHeightSource).toBe("read");
  });

  it("leaves exactly one mark's drop off, and gives it back", async () => {
    const { bidId, ids, raceway } = await setup(4);
    await caller().takeoffStamps.setDropExcluded({
      bidId,
      ids: [ids[1]],
      excluded: true,
    });
    expect(await raceway()).toBeCloseTo(125.5, 2);
    expect((await caller().takeoffRuns.totals({ bidId })).markDropCount).toBe(
      3
    );
    await caller().takeoffStamps.setDropExcluded({
      bidId,
      ids: [ids[1]],
      excluded: false,
    });
    expect(await raceway()).toBeCloseTo(134, 2);
  });

  it("refuses both on a locked bid", async () => {
    const { bidId, ids } = await setup(1);
    await caller().bids.lockQuantities({ bidId });
    await expect(
      caller().takeoffStamps.setHeight({
        bidId,
        ids,
        inches: 54,
        source: "typed",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().takeoffStamps.setDropExcluded({ bidId, ids, excluded: true })
    ).rejects.toThrow(/locked/);
  });
});

describe.skipIf(!hasDb)("a run end linked to a mark", () => {
  it("keeps the mark's drop when the end counts none there (gap 5)", async () => {
    const { bidId, runId, ids, raceway } = await setup(4);
    // Linked, but the end says "carries on at run height": no drop counted
    // by the run. The mark's own drop must stay on its count.
    await caller().takeoffRuns.setEnds({
      id: runId,
      endStampId: ids[0],
      endKind: "distribution",
    });
    expect(await raceway()).toBeCloseTo(134, 2); // NOT 125.5
    expect((await caller().takeoffRuns.totals({ bidId })).markDropCount).toBe(
      4
    );
  });

  it("takes the drop over, once, when the end counts it", async () => {
    const { bidId, runId, ids, raceway } = await setup(4);
    // No end kind of its own: it takes the count's ("receptacle").
    await caller().takeoffRuns.setEnds({ id: runId, endStampId: ids[0] });
    // The run's end drop (8.50) replaces the mark's: still 134, not 142.5.
    expect(await raceway()).toBeCloseTo(134, 2);
    expect((await caller().takeoffRuns.totals({ bidId })).markDropCount).toBe(
      3
    );
  });

  it("reads the linked mark's own height", async () => {
    const { bidId, runId, ids, raceway } = await setup(4);
    await caller().takeoffRuns.setEnds({ id: runId, endStampId: ids[0] });
    await caller().takeoffStamps.setHeight({
      bidId,
      ids: [ids[0]],
      inches: 54,
      source: "typed",
    });
    // 100 + run end 5.50 + 3 marks × 8.50.
    expect(await raceway()).toBeCloseTo(131, 2);
  });

  it("prices a drop to an EXISTING device, says so, and leaves it off on request", async () => {
    const { bidId, sheetId, runId, ids, raceway } = await setup(4);
    await caller().takeoffRuns.setEnds({ id: runId, endStampId: ids[0] });
    await caller().takeoffStamps.setStatus({
      bidId,
      ids: [ids[0]],
      status: "existing",
    });
    // Run end drop priced (8.50); the existing mark buys no drop of its own;
    // the other 3 marks drop as before.
    expect(await raceway()).toBeCloseTo(134, 2);
    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.ends.endOnExisting).toBe(true);
    expect(run.ends.startOnExisting).toBe(false);

    // "Leave it off" sets the end to run height.
    await caller().takeoffRuns.setEnds({ id: runId, endKind: "distribution" });
    expect(await raceway()).toBeCloseTo(125.5, 2);
  });
});
