/**
 * A LOCKED BID DOES NOT CHANGE — NOT BY ADDING TO IT EITHER.
 *
 * `lockedDeletes.test.ts` covers taking marks and runs away. This covers the
 * other direction, which the lock let through until 2026-09-29: placing a new
 * mark, tracing or re-saving a run, typing a run's length, adding a leg,
 * answering a pull point, and editing a run's circuits. None of them moved
 * the locked line (it reads its stored `qty`), but each moved the drawing
 * behind it — so the sheet and the quote disagreed with nothing on screen to
 * say so, and unlocking later would have pulled the difference onto the bid.
 *
 * Owner, 2026-09-29: "a locked bid must not change". Every refusal is
 * asserted TWO ways — it throws, and the row is exactly as it was — and has
 * an unlocked twin, because a check in the wrong place would freeze every bid.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  takeoffPullPoints,
  takeoffRunCircuits,
  takeoffRuns,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9938;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-locked-edits-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A bid with one sheet at 1/4", one count, and one conduit run with a corner. */
async function aBid() {
  const bid = (await caller().bids.create({
    name: `Locked edits ${Date.now()}${Math.random()}`,
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
  const sheetId = sheets[0].id;
  await caller().bidPdfs.setSheetScale({
    id: sheetId,
    scaleText: `1/4" = 1'-0"`,
  });
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Recep",
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId,
    groupId: group.id,
    at: [{ x: 10, y: 10 }],
  });
  const points = [
    { x: 0, y: 0 },
    { x: 180, y: 0 },
    { x: 180, y: 180 },
  ];
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Home run",
    pathType: "conduit",
    status: "committed",
    points,
  });
  const circuit = await caller().takeoffRuns.addCircuit({
    runId: run.id,
    name: "A-1",
    conductorCount: 2,
    groundCount: 1,
  });
  return {
    bidId: bid.id,
    sheetId,
    groupId: group.id,
    runId: run.id,
    circuitId: circuit.id,
    points,
    lock: () => caller().bids.lockQuantities({ bidId: bid.id }),
    unlock: () => caller().bids.unlockQuantities({ bidId: bid.id }),
  };
}

const database = async () => (await getDb())!;

async function marksOn(bidId: number) {
  return (await database())
    .select({ id: takeoffStamps.id })
    .from(takeoffStamps)
    .where(eq(takeoffStamps.bidId, bidId));
}

async function runsOn(bidId: number) {
  return (await database())
    .select()
    .from(takeoffRuns)
    .where(eq(takeoffRuns.bidId, bidId))
    .orderBy(takeoffRuns.id);
}

async function circuitsOf(runId: number) {
  return (await database())
    .select()
    .from(takeoffRunCircuits)
    .where(eq(takeoffRunCircuits.runId, runId))
    .orderBy(takeoffRunCircuits.id);
}

async function pullPointsOf(runId: number) {
  return (await database())
    .select()
    .from(takeoffPullPoints)
    .where(eq(takeoffPullPoints.runId, runId));
}

const cornerAnswer = (runId: number) => ({
  runId,
  place: "corner" as const,
  x: 180,
  y: 0,
  kind: "lb" as const,
  status: "accepted" as const,
});

beforeAll(async () => {
  if (!hasDb) return;
  const [existing] = await (await database())
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await (await database()).insert(users).values({
      id: USER,
      openId: `test-locked-edits-${USER}`,
      name: "Locked edits fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  await (await database()).delete(bids).where(inArray(bids.userId, [USER]));
});

withDb("adding to a locked bid", () => {
  it("refuses a new mark, and places nothing", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffStamps.drop({
        bidId: f.bidId,
        sheetId: f.sheetId,
        groupId: f.groupId,
        at: [{ x: 40, y: 40 }],
      })
    ).rejects.toThrow(/locked, so new marks cannot be placed/);
    expect(await marksOn(f.bidId)).toHaveLength(1);
  });

  it("refuses a new run, and saves nothing", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffRuns.save({
        bidId: f.bidId,
        sheetId: f.sheetId,
        name: "After the lock",
        pathType: "conduit",
        status: "draft",
        points: [
          { x: 0, y: 90 },
          { x: 90, y: 90 },
        ],
      })
    ).rejects.toThrow(/locked, so new runs cannot be traced/);
    expect((await runsOn(f.bidId)).map(r => r.id)).toEqual([f.runId]);
  });

  it("refuses re-saving an existing run, and leaves its points", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffRuns.save({
        id: f.runId,
        bidId: f.bidId,
        sheetId: f.sheetId,
        name: "Home run",
        pathType: "conduit",
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: 900, y: 0 },
        ],
      })
    ).rejects.toThrow(/locked/);
    const [run] = await runsOn(f.bidId);
    expect(run.points).toEqual(f.points);
  });

  it("refuses a typed length, and a cleared one", async () => {
    const f = await aBid();
    await caller().takeoffRuns.setTypedLength({
      id: f.runId,
      typedLengthInches: 600,
    });
    await f.lock();
    await expect(
      caller().takeoffRuns.setTypedLength({
        id: f.runId,
        typedLengthInches: 1200,
      })
    ).rejects.toThrow(/locked, so a run's length cannot be typed or cleared/);
    await expect(
      caller().takeoffRuns.setTypedLength({
        id: f.runId,
        typedLengthInches: null,
      })
    ).rejects.toThrow(/locked/);
    const [run] = await runsOn(f.bidId);
    expect(Number(run.typedLengthInches)).toBe(600);
  });

  it("refuses a run's location, set or cleared, and leaves it", async () => {
    // Gap 2 (2026-10-08): the one run edit that went through a lock.
    const f = await aBid();
    await caller().takeoffRuns.setLocation({ id: f.runId, location: "Wall" });
    await f.lock();
    await expect(
      caller().takeoffRuns.setLocation({
        id: f.runId,
        location: "Ceiling/Overhead",
      })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().takeoffRuns.setLocation({ id: f.runId, location: null })
    ).rejects.toThrow(/locked/);
    const [run] = await runsOn(f.bidId);
    expect(run.location).toBe("Wall");
  });

  it("refuses a new leg, and adds no row", async () => {
    const f = await aBid();
    await f.lock();
    await expect(
      caller().takeoffRuns.addLeg({
        runId: f.runId,
        points: [
          { x: 180, y: 180 },
          { x: 360, y: 180 },
        ],
        start: { kind: "free", startKind: null },
        endKind: null,
      })
    ).rejects.toThrow(/locked, so legs cannot be added/);
    expect(await runsOn(f.bidId)).toHaveLength(1);
  });

  it("refuses a pull-point answer, and taking one back", async () => {
    const f = await aBid();
    await caller().takeoffRuns.answerPullPoint(cornerAnswer(f.runId));
    const [answer] = await pullPointsOf(f.runId);
    await f.lock();
    await expect(
      caller().takeoffRuns.answerPullPoint({
        ...cornerAnswer(f.runId),
        kind: "pullBox",
      })
    ).rejects.toThrow(/locked, so pull points cannot be answered/);
    await expect(
      caller().takeoffRuns.clearPullPointAnswer({ id: answer.id })
    ).rejects.toThrow(/locked/);
    expect(await pullPointsOf(f.runId)).toEqual([answer]);
  });

  it("refuses a circuit added, changed or removed", async () => {
    const f = await aBid();
    const before = await circuitsOf(f.runId);
    await f.lock();
    await expect(
      caller().takeoffRuns.addCircuit({
        runId: f.runId,
        name: "A-3",
        conductorCount: 2,
      })
    ).rejects.toThrow(/locked, so circuits cannot be changed/);
    await expect(
      caller().takeoffRuns.updateCircuit({ id: f.circuitId, conductorCount: 4 })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().takeoffRuns.removeCircuit({ id: f.circuitId })
    ).rejects.toThrow(/locked/);
    expect(await circuitsOf(f.runId)).toEqual(before);
  });

  it("refuses finishing a draft run", async () => {
    const f = await aBid();
    const draft = await caller().takeoffRuns.save({
      bidId: f.bidId,
      sheetId: f.sheetId,
      name: "Draft",
      pathType: "conduit",
      status: "draft",
      points: [
        { x: 0, y: 90 },
        { x: 90, y: 90 },
      ],
    });
    await f.lock();
    await expect(caller().takeoffRuns.commit({ id: draft.id })).rejects.toThrow(
      /locked/
    );
    const row = (await runsOn(f.bidId)).find(r => r.id === draft.id)!;
    expect(row.status).toBe("draft");
  });
});

withDb("the same edits on an unlocked bid", () => {
  it("lets every one of them through once the bid is unlocked", async () => {
    const f = await aBid();
    await f.lock();
    await f.unlock();

    await caller().takeoffStamps.drop({
      bidId: f.bidId,
      sheetId: f.sheetId,
      groupId: f.groupId,
      at: [{ x: 40, y: 40 }],
    });
    expect(await marksOn(f.bidId)).toHaveLength(2);

    await caller().takeoffRuns.setTypedLength({
      id: f.runId,
      typedLengthInches: 1200,
    });
    await caller().takeoffRuns.setLocation({ id: f.runId, location: "Roof" });
    await caller().takeoffRuns.answerPullPoint(cornerAnswer(f.runId));
    const [answer] = await pullPointsOf(f.runId);
    await caller().takeoffRuns.clearPullPointAnswer({ id: answer.id });
    expect(await pullPointsOf(f.runId)).toEqual([]);

    await caller().takeoffRuns.updateCircuit({
      id: f.circuitId,
      conductorCount: 4,
    });
    await caller().takeoffRuns.addCircuit({
      runId: f.runId,
      name: "A-3",
      conductorCount: 2,
    });
    expect(await circuitsOf(f.runId)).toHaveLength(2);
    await caller().takeoffRuns.removeCircuit({ id: f.circuitId });

    await caller().takeoffRuns.addLeg({
      runId: f.runId,
      points: [
        { x: 180, y: 180 },
        { x: 360, y: 180 },
      ],
      start: { kind: "free", startKind: null },
      endKind: null,
    });
    const created = await caller().takeoffRuns.save({
      bidId: f.bidId,
      sheetId: f.sheetId,
      name: "After unlocking",
      pathType: "conduit",
      status: "draft",
      points: [
        { x: 0, y: 90 },
        { x: 90, y: 90 },
      ],
    });
    await caller().takeoffRuns.commit({ id: created.id });
    expect(await runsOn(f.bidId)).toHaveLength(3);
    expect(Number((await runsOn(f.bidId))[0].typedLengthInches)).toBe(1200);
    expect((await runsOn(f.bidId))[0].location).toBe("Roof");
  });
});
