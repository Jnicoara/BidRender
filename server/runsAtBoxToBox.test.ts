/**
 * BOX TO BOX, SAME HEIGHT (0131, owner 2026-10-07, case d) — through the
 * router, all the way to the totals.
 *
 * The arithmetic is pinned in runDropCases.test.ts. This holds the wiring,
 * where each failure would be a quiet wrong number:
 *   - the choice is KEPT, on the root and every leg, and a new leg inherits it;
 *   - picking it takes the two drops off — about 17 ft on a run between two
 *     receptacles at 1'-6" under a 10'-0" ceiling;
 *   - the boxes it feeds do NOT drop on their own instead (the claim rule,
 *     shared/takeoffHeights.ts `stampsClaimedByRuns`), or the 17 ft would
 *     come straight back through the count;
 *   - "Through ceiling" is stored as NULL, and puts every number back;
 *   - a locked bid refuses it and moves nothing.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  takeoffRunTypes,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9531;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-runs-at-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** 1/4" = 1'-0": a foot is 18 page points. */
const ft = (feet: number) => feet * 18;

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
      openId: `test-runs-at-${USER}`,
      name: "Box to box fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  // Run height 10'-0": receptacles ship at 1'-6", so each drop is 8.50 ft.
  await caller().takeoffHeights.setCompanyDistribution({ inches: 120 });
});

/**
 * A 40 ft run between two receptacle marks, each end linked to its mark —
 * as accepting the link does — and the marks' count dropping to receptacle
 * on the same run type, so a mark the run lets go of would drop on its own.
 */
async function wallRun() {
  const bid = (await caller().bids.create({
    name: `Box to box ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
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
  const type = await caller().takeoffRunTypes.create({
    label: `Box to box EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    conductorCount: 2,
  });
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Duplex receptacle",
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: sheet.id,
    groupId: group.id,
    at: [
      { x: ft(10), y: ft(10) },
      { x: ft(50), y: ft(10) },
    ],
  });
  await caller().takeoffGroups.setDrop({
    id: group.id,
    dropKind: "receptacle",
    dropRunTypeId: type.id,
  });
  const marks = await caller().takeoffStamps.listForSheet({
    sheetId: sheet.id,
  });
  const a = marks.find(m => Number(m.x) === ft(10))!.id;
  const b = marks.find(m => Number(m.x) === ft(50))!.id;
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: sheet.id,
    name: "Wall run",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: ft(10), y: ft(10) },
      { x: ft(50), y: ft(10) },
    ],
  });
  await caller().takeoffRuns.setEnds({
    id: run.id,
    startKind: "receptacle",
    endKind: "receptacle",
    startStampId: a,
    endStampId: b,
  });
  return { bidId: bid.id, sheetId: sheet.id, runId: run.id, a, b };
}

async function numbers(bidId: number) {
  const totals = await caller().takeoffRuns.totals({ bidId });
  return {
    conduit: Math.round(totals.conduitBoughtFeet * 100) / 100,
    markDrops: totals.markDropCount,
  };
}

async function storedRunsAt(runIds: number[]) {
  const database = (await getDb())!;
  const rows = await database
    .select({ id: takeoffRuns.id, runsAt: takeoffRuns.runsAt })
    .from(takeoffRuns)
    .where(inArray(takeoffRuns.id, runIds));
  return new Map(rows.map(r => [r.id, r.runsAt]));
}

describe.skipIf(!hasDb)("box to box, same height (0131)", () => {
  it("through the ceiling: 40 ft + two 8.50 ft drops, and the marks do not drop again", async () => {
    const { bidId } = await wallRun();
    expect(await numbers(bidId)).toEqual({ conduit: 57, markDrops: 0 });
  });

  it("box to box takes the 17 ft off — and the boxes do not drop on their own instead", async () => {
    const { bidId, runId } = await wallRun();
    const before = await numbers(bidId);
    await caller().takeoffRuns.setRunsAt({ runId, runsAt: "boxToBox" });
    const after = await numbers(bidId);
    expect(after).toEqual({ conduit: 40, markDrops: 0 });
    expect(before.conduit - after.conduit).toBe(17);
  });

  it("the panel row says which, and 'Through ceiling' is stored as NULL and puts every number back", async () => {
    const { bidId, sheetId, runId } = await wallRun();
    const row = async () =>
      (await caller().takeoffRuns.listForSheet({ sheetId })).find(
        r => r.id === runId
      )!;
    expect((await row()).runsAt).toBe("ceiling");

    await caller().takeoffRuns.setRunsAt({ runId, runsAt: "boxToBox" });
    expect((await row()).runsAt).toBe("boxToBox");

    await caller().takeoffRuns.setRunsAt({ runId, runsAt: "ceiling" });
    expect((await row()).runsAt).toBe("ceiling");
    expect((await storedRunsAt([runId])).get(runId)).toBeNull();
    expect(await numbers(bidId)).toEqual({ conduit: 57, markDrops: 0 });
  });

  it("is kept on the root AND every leg, set from either, and a new leg inherits it", async () => {
    const { runId } = await wallRun();
    // A branch off the root at x feet: cuts the root there and adds a leg.
    const branchAt = (x: number) =>
      caller().takeoffRuns.addLeg({
        runId,
        points: [
          { x: ft(x), y: ft(10) },
          { x: ft(x), y: ft(30) },
        ],
        start: {
          kind: "tee",
          hostRunId: runId,
          at: { x: ft(x), y: ft(10) },
          tolerance: 3,
          fitting: "box",
          stampId: null,
        },
        endKind: "switch",
      });
    const first = await branchAt(30);
    // Set from the LEG: the root and the cut piece move with it.
    await caller().takeoffRuns.setRunsAt({
      runId: first.id,
      runsAt: "boxToBox",
    });
    // A leg added AFTER the choice copies it from the root.
    const second = await branchAt(20);
    const database = (await getDb())!;
    const group = await database
      .select({ id: takeoffRuns.id })
      .from(takeoffRuns)
      .where(eq(takeoffRuns.parentRunId, runId));
    const ids = [runId, ...group.map(r => r.id)];
    expect(ids).toContain(second.id);
    const stored = await storedRunsAt(ids);
    for (const id of ids) expect(stored.get(id)).toBe("boxToBox");
  });

  it("a LOCKED bid refuses it, and nothing moves", async () => {
    const { bidId, runId } = await wallRun();
    await caller().bids.lockQuantities({ bidId });
    const before = await numbers(bidId);
    await expect(
      caller().takeoffRuns.setRunsAt({ runId, runsAt: "boxToBox" })
    ).rejects.toThrow(/locked/i);
    expect((await storedRunsAt([runId])).get(runId)).toBeNull();
    expect(await numbers(bidId)).toEqual(before);
  });
});
