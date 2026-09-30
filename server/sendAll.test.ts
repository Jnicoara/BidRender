/**
 * THE WHOLE-SET SUMMARY AND "SEND ALL TO BID" — and the re-send they rely on.
 *
 * references/track-b-deletes-summary-pan-plan.md §§ 2–3, built 2026-09-29.
 *
 *   • A re-send after a from-plans line was ARCHIVED used to die on the unique
 *     index (the archived row still holds the slot) with a raw database error.
 *     Checked first because Send all is built on the single send.
 *   • `takeoffSummary.forBid` says what is on the bid and what is not, with a
 *     reason for every item not on it.
 *   • `takeoffSummary.sendAll` sends exactly what the preview showed: twice
 *     changes nothing, a locked bid refuses and writes nothing, an item that
 *     cannot go is listed with its reason and never arrives as $0, and a list
 *     that moved since the preview is refused.
 *
 * Fixture ids 9971–9972 are this file's alone — vitest runs files in parallel
 * and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bidPdfs,
  bids,
  laborRates,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9971;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-send-all-${USER}`, role: "user" },
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
 * A bid with one scaled sheet and one unscaled; an assembly count of 3 marks
 * and a free count of 2; a 100 ft conduit run under its own type; one untyped
 * run; one typed run on the unscaled sheet. Nothing sent.
 */
async function aBid() {
  const bid = (await caller().bids.create({
    name: `Send all ${Date.now()}${Math.random()}`,
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
  const exit = await caller().takeoffGroups.forAssembly({
    bidId: bid.id,
    assemblyId,
  });
  const mark = (groupId: number, n: number) =>
    caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId: sheet.id,
      groupId,
      at: Array.from({ length: n }, (_, i) => ({ x: 10 + i, y: 10 + i })),
    });
  await mark(exit.id, 3);
  const free = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: `Doorbell ${Math.random()}`,
  });
  await mark(free.id, 2);
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `Send all EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  const trace = (sheetId: number, runTypeId: number | null) =>
    caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      runTypeId,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: HUNDRED_FEET_PTS, y: 0 },
      ],
    });
  await trace(sheet.id, type.id);
  return {
    bidId: bid.id,
    sheetId: sheet.id,
    unscaledId: unscaled.id,
    exitId: exit.id,
    freeId: free.id,
    runTypeId: type.id,
    assemblyId,
    trace,
    lock: () => caller().bids.lockQuantities({ bidId: bid.id }),
  };
}

async function liveLines(bidId: number) {
  return (await database())
    .select()
    .from(bidLineItems)
    .where(and(eq(bidLineItems.bidId, bidId), isNull(bidLineItems.archivedAt)))
    .orderBy(bidLineItems.id);
}

async function allLines(bidId: number) {
  return (await database())
    .select()
    .from(bidLineItems)
    .where(eq(bidLineItems.bidId, bidId))
    .orderBy(bidLineItems.id);
}

/** Archive every line on a bid the way a pre-2026-09-29 room archive could. */
async function archiveAll(bidId: number) {
  await (await database())
    .update(bidLineItems)
    .set({ archivedAt: new Date() })
    .where(eq(bidLineItems.bidId, bidId));
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
      openId: `test-send-all-${USER}`,
      name: "Send all fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const d = await database();
  await d.delete(bids).where(inArray(bids.userId, [USER]));
  await d.delete(assemblies).where(eq(assemblies.userId, USER));
  await d.delete(takeoffRunTypes).where(eq(takeoffRunTypes.userId, USER));
  await d.delete(laborRates).where(eq(laborRates.userId, USER));
  await d.delete(materials).where(eq(materials.userId, USER));
});

withDb("re-sending after a from-plans line was archived", () => {
  it("a count goes back on the bid as one live line, not a database error", async () => {
    const s = await aBid();
    await caller().takeoffGroups.sendToBid({ id: s.exitId });
    await archiveAll(s.bidId);

    await caller().takeoffGroups.sendToBid({ id: s.exitId });

    const live = await liveLines(s.bidId);
    expect(live.map(l => [l.takeoffGroupId, Number(l.qty)])).toEqual([
      [s.exitId, 3],
    ]);
  });

  it("a run type goes back on the bid as one live line", async () => {
    const s = await aBid();
    await caller().takeoffRunTypes.sendToBid({
      bidId: s.bidId,
      runTypeId: s.runTypeId,
    });
    // The pipe, plus the fittings counted from the same run.
    const roles = (await liveLines(s.bidId)).map(l => l.runMaterialRole);
    expect(roles).toContain("raceway");
    await archiveAll(s.bidId);

    await caller().takeoffRunTypes.sendToBid({
      bidId: s.bidId,
      runTypeId: s.runTypeId,
    });

    const live = await liveLines(s.bidId);
    expect(live.map(l => l.runMaterialRole).sort()).toEqual([...roles].sort());
    // The archived copies that held the slots are gone, not left beside them.
    expect(await allLines(s.bidId)).toHaveLength(roles.length);
  });
});
