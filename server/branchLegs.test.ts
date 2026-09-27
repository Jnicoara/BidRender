/**
 * BRANCH LEGS through the real router (D20): adding a leg cuts the host at the
 * tee and carries its end, answers and circuits where they belong; deleting a
 * leg tidies the tee it leaves behind.
 *
 * The counting of a branched run is pinned in `runNetwork.test.ts`; what these
 * add is that the ROWS the router writes are the shape that counting expects.
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
  takeoffRunTees,
  takeoffRuns,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9811;
const STRANGER = 9812;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const callerAs = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-branch-legs-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerAs(USER);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Branch legs ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

/** An L: 40 ft east, then 30 ft south. The corner is at (40, 0). */
const MAIN = [
  { x: 0, y: 0 },
  { x: ft(40), y: 0 },
  { x: ft(40), y: ft(30) },
];

async function aMain(bidId: number, sheetId: number) {
  const run = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Panel A → far box",
    pathType: "conduit",
    status: "committed",
    points: MAIN,
    startKind: "panel",
    endKind: "receptacle",
  });
  await caller().takeoffRuns.addCircuit({
    runId: run.id,
    name: "A-1",
    conductorCount: 2,
  });
  await caller().takeoffRuns.addCircuit({
    runId: run.id,
    name: "A-3",
    conductorCount: 2,
  });
  return run.id;
}

async function rows(rootId: number) {
  const database = (await getDb())!;
  const all = await database
    .select()
    .from(takeoffRuns)
    .where(eq(takeoffRuns.userId, USER));
  return all
    .filter(r => r.id === rootId || r.parentRunId === rootId)
    .sort((a, b) => a.id - b.id);
}

async function circuitsOf(runId: number) {
  const database = (await getDb())!;
  return (
    await database
      .select()
      .from(takeoffRunCircuits)
      .where(eq(takeoffRunCircuits.runId, runId))
  ).map(c => c.name);
}

function feetOf(points: { x: number; y: number }[]) {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    );
  return sum / 18;
}

/** A branch north from (15, 0) along the first segment. */
const branchAt15 = (hostRunId: number) =>
  ({
    kind: "tee",
    hostRunId,
    at: { x: ft(15), y: 2 },
    tolerance: 3,
    fitting: "box",
    stampId: null,
  }) as const;

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, STRANGER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-branch-legs-${id}`,
        name: "Branch legs fixture",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, STRANGER]));
});

withDb("a branch along a leg cuts it at the tee", () => {
  it("leaves three legs meeting at one tee, covering the main exactly", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);

    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 5 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: "switch",
    });

    const [root, after, branch] = await rows(rootId);
    expect(after.id).toBe(result.cutRunId);
    expect(branch.id).toBe(result.id);
    expect([root.endTeeId, after.startTeeId, branch.startTeeId]).toEqual([
      result.teeId,
      result.teeId,
      result.teeId,
    ]);

    // Nothing added, nothing lost: the two pieces are the main.
    expect(feetOf(root.points) + feetOf(after.points)).toBeCloseTo(70, 6);
    // The branch starts EXACTLY on the tee, not where the click landed.
    expect(branch.points[0]).toEqual({ x: ft(15), y: 0 });
    expect(Number(branch.lengthInches) / 12).toBeCloseTo(20, 1);

    // The old end went with the far piece; the host's end is the tee.
    expect(root.endKind).toBeNull();
    expect(after.endKind).toBe("receptacle");
    expect(after.startKind).toBeNull();
    expect(root.startKind).toBe("panel");
    expect(branch.endKind).toBe("switch");
  });

  it("gives both new legs the host's circuits (answer 2)", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    expect(await circuitsOf(result.cutRunId!)).toEqual(["A-1", "A-3"]);
    expect(await circuitsOf(result.id)).toEqual(["A-1", "A-3"]);
    expect(await circuitsOf(rootId)).toEqual(["A-1", "A-3"]);
  });

  it("moves a pull-point answer with its corner, and drops one the tee replaces", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    await caller().takeoffRuns.answerPullPoint({
      runId: rootId,
      place: "corner",
      x: ft(40),
      y: 0,
      kind: "lb",
      status: "accepted",
    });

    // A tee at (15, 0): the corner at (40, 0) is now on the far piece.
    const first = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    const database = (await getDb())!;
    const moved = await database
      .select()
      .from(takeoffPullPoints)
      .where(eq(takeoffPullPoints.userId, USER));
    expect(moved.map(a => a.runId)).toEqual([first.cutRunId]);

    // A second tee ON that corner: the box stands there now.
    await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(40), y: 0 },
        { x: ft(55), y: 0 },
      ],
      start: {
        kind: "tee",
        hostRunId: first.cutRunId!,
        at: { x: ft(40) + 1, y: 1 },
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: null,
    });
    const after = await database
      .select()
      .from(takeoffPullPoints)
      .where(eq(takeoffPullPoints.userId, USER));
    expect(after).toHaveLength(0);
  });

  it("carries the host's end mark to the far piece", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const database = (await getDb())!;
    const [stamp] = await database.insert(takeoffStamps).values({
      bidId,
      sheetId,
      userId: USER,
      x: String(ft(40)),
      y: String(ft(30)),
    });
    await caller().takeoffRuns.setEnds({
      id: rootId,
      endStampId: stamp.insertId,
    });
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    const [root, after] = await rows(rootId);
    expect(root.endStampId).toBeNull();
    expect(after.id).toBe(result.cutRunId);
    expect(after.endStampId).toBe(stamp.insertId);
  });

  it("puts a tee at a leg's END without cutting, and reuses it for a cross", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const first = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(40), y: ft(30) },
        { x: ft(60), y: ft(30) },
      ],
      start: {
        kind: "tee",
        hostRunId: rootId,
        at: { x: ft(40) + 1, y: ft(30) - 1 },
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: null,
    });
    expect(first.cutRunId).toBeNull();
    const second = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(40), y: ft(30) },
        { x: ft(40), y: ft(50) },
      ],
      start: {
        kind: "tee",
        hostRunId: rootId,
        at: { x: ft(40), y: ft(30) },
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: null,
    });
    expect(second.teeId).toBe(first.teeId);
    const [root] = await rows(rootId);
    expect(root.endTeeId).toBe(first.teeId);
    expect(root.points).toEqual(MAIN);
  });
});

withDb("what a leg refuses", () => {
  it("refuses a branch from another run", async () => {
    const { bidId, sheetId } = await aBid();
    const a = await aMain(bidId, sheetId);
    const b = await aMain(bidId, sheetId);
    await expect(
      caller().takeoffRuns.addLeg({
        runId: a,
        points: [
          { x: ft(15), y: 0 },
          { x: ft(15), y: -ft(20) },
        ],
        start: branchAt15(b),
        endKind: null,
      })
    ).rejects.toThrow(/same run/);
  });

  it("refuses a kind on a tee end — it carries on at run height", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    await expect(
      caller().takeoffRuns.setEnds({ id: result.id, startKind: "receptacle" })
    ).rejects.toThrow(/branch tee/);
    // The OTHER end is an ordinary end and still takes a kind.
    await caller().takeoffRuns.setEnds({ id: result.id, endKind: "switch" });
  });

  it("is invisible to another company", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    await expect(
      callerAs(STRANGER).takeoffRuns.addLeg({
        runId: rootId,
        points: [
          { x: ft(15), y: 0 },
          { x: ft(15), y: -ft(20) },
        ],
        start: branchAt15(rootId),
        endKind: null,
      })
    ).rejects.toThrow(/not found/i);
  });
});

withDb("the whole run moves together", () => {
  it("commits every leg when the run is committed", async () => {
    const { bidId, sheetId } = await aBid();
    const draft = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Draft run",
      pathType: "conduit",
      status: "draft",
      points: MAIN,
    });
    await caller().takeoffRuns.addLeg({
      runId: draft.id,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(draft.id),
      endKind: null,
    });
    const done = await caller().takeoffRuns.commit({ id: draft.id });
    const all = await rows(draft.id);
    expect(all).toHaveLength(3);
    expect(all.every(r => r.status === "committed")).toBe(true);
    // The finish message names the WHOLE run: 70 ft of main (cut at the tee
    // into 15 + 55) and a 20 ft branch — not the 15 ft first leg it named
    // before, which the panel's leg header contradicted.
    expect(done.legCount).toBe(3);
    expect(done.runFeet).toBeCloseTo(90, 2);
    expect(done.lengthFeet).toBeLessThan(done.runFeet);
  });

  it("deletes legs and tees with the run", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    await caller().takeoffRuns.remove({ id: rootId });
    expect(await rows(rootId)).toHaveLength(0);
    const database = (await getDb())!;
    const tees = await database
      .select()
      .from(takeoffRunTees)
      .where(eq(takeoffRunTees.id, result.teeId!));
    expect(tees).toHaveLength(0);
  });
});

withDb("deleting the last branch at a tee (answer 6)", () => {
  it("joins the main back into one leg when the pieces agree", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    const removed = await caller().takeoffRuns.remove({ id: result.id });
    expect(removed.rejoined).toEqual([result.teeId]);

    const [root, ...rest] = await rows(rootId);
    expect(rest).toHaveLength(0);
    expect(feetOf(root.points)).toBeCloseTo(70, 6);
    expect(root.endKind).toBe("receptacle");
    expect(root.endTeeId).toBeNull();
    expect(await circuitsOf(rootId)).toEqual(["A-1", "A-3"]);
  });

  it("keeps the tee as a box when the far piece carries different circuits", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const result = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: branchAt15(rootId),
      endKind: null,
    });
    // A-3 turned down the branch: the far piece no longer carries it.
    const database = (await getDb())!;
    await database
      .delete(takeoffRunCircuits)
      .where(eq(takeoffRunCircuits.runId, result.cutRunId!));
    await caller().takeoffRuns.addCircuit({
      runId: result.cutRunId!,
      name: "A-1",
      conductorCount: 2,
    });

    const removed = await caller().takeoffRuns.remove({ id: result.id });
    expect(removed.keptAsBox).toEqual([result.teeId]);
    expect(await rows(rootId)).toHaveLength(2);
  });

  it("frees a leg end when the only other leg at an end tee is deleted", async () => {
    const { bidId, sheetId } = await aBid();
    const rootId = await aMain(bidId, sheetId);
    const leg = await caller().takeoffRuns.addLeg({
      runId: rootId,
      points: [
        { x: ft(40), y: ft(30) },
        { x: ft(60), y: ft(30) },
      ],
      start: {
        kind: "tee",
        hostRunId: rootId,
        at: { x: ft(40), y: ft(30) },
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: null,
    });
    await caller().takeoffRuns.remove({ id: leg.id });
    const [root] = await rows(rootId);
    expect(root.endTeeId).toBeNull();
    // Its stored kind is what it reads as again.
    expect(root.endKind).toBe("receptacle");
  });
});
