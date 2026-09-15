/**
 * The remove-plan warning has to count exactly what the delete destroys.
 *
 * Two halves, and both matter (references/takeoff-spec.md, row V3):
 *
 *   • the count covers every stamp, traced run, circuit and plan-reader result
 *     on THIS plan's sheets — and nothing from another plan on the same bid;
 *   • removing the plan really does delete all of it, so the warning is true.
 *     If a later change stopped the cascade, that test fails, and the warning
 *     would need rewording rather than quietly becoming wrong.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfSheets,
  bidPdfs,
  bids,
  planCopilotRuns,
  takeoffRunCircuits,
  takeoffRuns,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7577;
const OTHER_USER = 7578;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-plan-removal-${userId}`, role: "user" },
  } as unknown as TrpcContext);

async function database() {
  const db = await getDb();
  if (!db) throw new Error("No database for this test");
  return db;
}

/** A plan with `sheetCount` sheets, on a new bid unless one is given. */
async function newPlan(sheetCount: number, bidId?: number) {
  const db = await database();
  const id =
    bidId ??
    (await callerFor(USER).bids.create({
      name: `Removal test ${Date.now()}${Math.random()}`,
      trades: ["electrical"],
    }))!.id;
  const [pdf] = await db.insert(bidPdfs).values({
    bidId: id,
    userId: USER,
    filename: "E-Series.pdf",
    storageKey: `test/${id}/e-series-${Math.random()}.pdf`,
    byteSize: 1024,
    pageCount: sheetCount,
    sortOrder: 0,
  });
  const sheetIds: number[] = [];
  for (let page = 1; page <= sheetCount; page++) {
    const [sheet] = await db.insert(bidPdfSheets).values({
      bidPdfId: pdf.insertId,
      userId: USER,
      pageNumber: page,
      name: `E${page}`,
    });
    sheetIds.push(sheet.insertId);
  }
  return { bidId: id, bidPdfId: pdf.insertId, sheetIds };
}

async function addStamps(bidId: number, sheetId: number, howMany: number) {
  const db = await database();
  for (let i = 0; i < howMany; i++) {
    await db.insert(takeoffStamps).values({
      bidId,
      sheetId,
      userId: USER,
      assemblyName: "Duplex receptacle standard",
      x: String(10 + i),
      y: "20",
    });
  }
}

async function addRun(bidId: number, sheetId: number, circuits: number) {
  const db = await database();
  const [run] = await db.insert(takeoffRuns).values({
    bidId,
    sheetId,
    userId: USER,
    name: "Run",
    pathType: "conduit",
    points: [
      { x: 0, y: 0 },
      { x: 72, y: 0 },
    ],
    status: "committed",
  });
  for (let i = 0; i < circuits; i++) {
    await db.insert(takeoffRunCircuits).values({
      runId: run.insertId,
      userId: USER,
      name: `Ckt ${i + 1}`,
      conductorCount: 3,
    });
  }
  return run.insertId;
}

async function addReaderResult(bidId: number, sheetId: number) {
  const db = await database();
  await db.insert(planCopilotRuns).values({ bidId, sheetId, userId: USER });
}

/** What is actually left in the tables, read directly rather than through the app. */
async function rowsLeft(sheetIds: number[], runIds: number[]) {
  const db = await database();
  const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
  const [sheets, stamps, runs, readers] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(bidPdfSheets)
      .where(inArray(bidPdfSheets.id, sheetIds)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(takeoffStamps)
      .where(inArray(takeoffStamps.sheetId, sheetIds)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(takeoffRuns)
      .where(inArray(takeoffRuns.sheetId, sheetIds)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(planCopilotRuns)
      .where(inArray(planCopilotRuns.sheetId, sheetIds)),
  ]);
  const circuits =
    runIds.length === 0
      ? [{ n: 0 }]
      : await db
          .select({ n: sql<number>`count(*)` })
          .from(takeoffRunCircuits)
          .where(inArray(takeoffRunCircuits.runId, runIds));
  return {
    sheets: n(sheets),
    stamps: n(stamps),
    runs: n(runs),
    circuits: n(circuits),
    readerResults: n(readers),
  };
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        id,
        openId: `test-plan-removal-${id}`,
        name: `Plan removal test user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  // Plans, sheets and everything on them cascade from bids.
  await db.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("what the remove-plan warning counts", () => {
  it("counts every stamp, traced run, circuit and plan-reader result on the plan's sheets", async () => {
    const plan = await newPlan(3);
    const [first, second] = plan.sheetIds;
    await addStamps(plan.bidId, first, 3);
    await addRun(plan.bidId, first, 2);
    await addRun(plan.bidId, second, 0);
    await addReaderResult(plan.bidId, second);

    const impact = await callerFor(USER).bidPdfs.removalImpact({
      id: plan.bidPdfId,
    });
    expect(impact).toEqual({
      sheets: 3,
      stamps: 3,
      runs: 2,
      circuits: 2,
      readerResults: 1,
    });
  });

  it("does not count work on another plan attached to the same bid", async () => {
    const planA = await newPlan(2);
    const planB = await newPlan(2, planA.bidId);
    await addStamps(planA.bidId, planA.sheetIds[0], 1);
    await addStamps(planB.bidId, planB.sheetIds[0], 5);
    await addRun(planB.bidId, planB.sheetIds[1], 4);

    const impact = await callerFor(USER).bidPdfs.removalImpact({
      id: planA.bidPdfId,
    });
    expect(impact).toEqual({
      sheets: 2,
      stamps: 1,
      runs: 0,
      circuits: 0,
      readerResults: 0,
    });
  });

  it("reports nothing on a plan nobody has worked, and no sheets on one never opened", async () => {
    const worked = await newPlan(2);
    const neverOpened = await newPlan(0, worked.bidId);
    expect(
      await callerFor(USER).bidPdfs.removalImpact({ id: worked.bidPdfId })
    ).toEqual({ sheets: 2, stamps: 0, runs: 0, circuits: 0, readerResults: 0 });
    expect(
      await callerFor(USER).bidPdfs.removalImpact({ id: neverOpened.bidPdfId })
    ).toEqual({ sheets: 0, stamps: 0, runs: 0, circuits: 0, readerResults: 0 });
  });

  it("will not tell another account what is on someone else's plan", async () => {
    const plan = await newPlan(1);
    await addStamps(plan.bidId, plan.sheetIds[0], 2);
    await expect(
      callerFor(OTHER_USER).bidPdfs.removalImpact({ id: plan.bidPdfId })
    ).rejects.toThrow(/not found/i);
  });

  it("removing the plan deletes exactly what the warning counted, and nothing else", async () => {
    const plan = await newPlan(2);
    const other = await newPlan(1, plan.bidId);
    await addStamps(plan.bidId, plan.sheetIds[0], 4);
    const runId = await addRun(plan.bidId, plan.sheetIds[1], 3);
    await addReaderResult(plan.bidId, plan.sheetIds[0]);
    await addStamps(other.bidId, other.sheetIds[0], 2);

    const impact = await callerFor(USER).bidPdfs.removalImpact({
      id: plan.bidPdfId,
    });
    expect(await rowsLeft(plan.sheetIds, [runId])).toEqual(impact);

    await callerFor(USER).bidPdfs.remove({ id: plan.bidPdfId });

    expect(await rowsLeft(plan.sheetIds, [runId])).toEqual({
      sheets: 0,
      stamps: 0,
      runs: 0,
      circuits: 0,
      readerResults: 0,
    });
    expect((await rowsLeft(other.sheetIds, [])).stamps).toBe(2);
  });
});
