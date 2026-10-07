/**
 * EDITING A RUN'S POINTS (drag, add, remove) — takeoffRuns.setPoints.
 *
 * What carries the risk:
 *   • **The `save` trap.** `save` resets status, suggestion and location to
 *     their defaults, so editing points through it would quietly demote a
 *     finished run to a draft. The first case goes red if anyone swaps it in.
 *   • **The bid follows the drawing**, and a typed length keeps pricing it.
 *   • **A pull-point answer on a corner that moved is cleared, SAID, and
 *     comes back on undo.**
 *   • **A tee end stays on its tee**, and a locked bid refuses the edit.
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
  materials,
  takeoffHeightDefaults,
  takeoffRunTypes,
  takeoffRuns,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { UNCONFIRMED_MARK_REFUSAL } from "./routers/takeoffRunsRouter";

const USER = 9935;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-set-points-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Set points ${Date.now()}${Math.random()}`,
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
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `1/2" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  // 70 ft: 40 east then 30 south, a corner at (40, 0).
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Main",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    location: "Underground",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
      { x: ft(40), y: ft(30) },
    ],
  });
  return { bidId: bid.id, sheetId, runId: run.id, typeId: type.id };
}

async function row(id: number) {
  const database = (await getDb())!;
  const [r] = await database
    .select()
    .from(takeoffRuns)
    .where(eq(takeoffRuns.id, id));
  return r;
}

async function raceway(bidId: number) {
  const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
  return {
    feet: entry.rows.find(r => r.role === "raceway")!.feet,
    fittings: Object.fromEntries(entry.fittings.map(f => [f.role, f.qty])),
  };
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
      openId: `test-set-points-${USER}`,
      name: "Set points fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database
    .delete(takeoffHeightDefaults)
    .where(eq(takeoffHeightDefaults.userId, USER));
});

withDb("moving a run's points", () => {
  it("keeps a finished run finished, with its location", async () => {
    const s = await scenario();
    expect((await row(s.runId)).status).toBe("committed");
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(50), y: 0 },
        { x: ft(50), y: ft(30) },
      ],
    });
    const after = await row(s.runId);
    expect(after.status).toBe("committed");
    expect(after.location).toBe("Underground");
    expect(after.isSuggestion).toBe(false);
  });

  it("moves the length and what goes on the bid, measured on both sides", async () => {
    const s = await scenario();
    const before = await raceway(s.bidId);
    expect(before.feet).toBeCloseTo(70, 2);
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(50), y: 0 },
        { x: ft(50), y: ft(30) },
      ],
    });
    expect((await raceway(s.bidId)).feet).toBeCloseTo(80, 2);
    const [listed] = await caller().takeoffRuns.listForSheet({
      sheetId: s.sheetId,
    });
    expect(listed.quantities!.runFeet).toBeCloseTo(80, 2);
  });

  it("adds a point: a new corner is a new bend", async () => {
    const s = await scenario();
    const before = await raceway(s.bidId);
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(20), y: 0 },
        { x: ft(20), y: ft(10) },
        { x: ft(40), y: ft(10) },
        { x: ft(40), y: ft(30) },
      ],
    });
    const after = await raceway(s.bidId);
    const bends = (f: Record<string, number>) =>
      (f.fieldBend ?? 0) + (f.elbow90 ?? 0) + (f.elbow45 ?? 0);
    expect(bends(after.fittings)).toBeGreaterThan(bends(before.fittings));
  });

  it("leaves a typed length pricing the bid while the drawing moves", async () => {
    const s = await scenario();
    await caller().takeoffRuns.setTypedLength({
      id: s.runId,
      typedLengthInches: 100 * 12,
    });
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(10), y: 0 },
      ],
    });
    const after = await row(s.runId);
    expect(Number(after.typedLengthInches)).toBe(1200);
    expect(Number(after.lengthInches)).toBeCloseTo(120, 2);
    expect((await raceway(s.bidId)).feet).toBeCloseTo(100, 2);
  });

  it("clears a pull-point answer whose corner moved, says so, and undo brings it back", async () => {
    const s = await scenario();
    await caller().takeoffRuns.answerPullPoint({
      runId: s.runId,
      place: "corner",
      x: ft(40),
      y: 0,
      kind: "lb",
      status: "accepted",
    });
    const before = await raceway(s.bidId);
    const beforeRow = await row(s.runId);

    const edit = await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(45), y: 0 },
        { x: ft(45), y: ft(30) },
      ],
    });
    expect(edit.clearedAnswers).toBe(1);
    expect(await raceway(s.bidId)).not.toEqual(before);

    await caller().takeoffRuns.restore({ undo: edit.undo! });
    expect(await raceway(s.bidId)).toEqual(before);
    expect((await row(s.runId)).points).toEqual(beforeRow.points);
  });

  it("keeps an answer whose corner did not move", async () => {
    const s = await scenario();
    await caller().takeoffRuns.answerPullPoint({
      runId: s.runId,
      place: "corner",
      x: ft(40),
      y: 0,
      kind: "lb",
      status: "accepted",
    });
    const edit = await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: -ft(5), y: 0 },
        { x: ft(40), y: 0 },
        { x: ft(40), y: ft(30) },
      ],
    });
    expect(edit.clearedAnswers).toBe(0);
  });

  it("keeps a tee end on its tee, whatever the client sends", async () => {
    const s = await scenario();
    await caller().takeoffRuns.addLeg({
      runId: s.runId,
      points: [
        { x: ft(15), y: 0 },
        { x: ft(15), y: -ft(20) },
      ],
      start: {
        kind: "tee",
        hostRunId: s.runId,
        at: { x: ft(15), y: 0 },
        tolerance: 3,
        fitting: "box",
        stampId: null,
      },
      endKind: "distribution",
    });
    const database = (await getDb())!;
    const legs = await database
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.parentRunId, s.runId));
    const branch = legs.find(
      l => l.startTeeId !== null && l.points![0].y === 0 && l.points![1].y < 0
    )!;
    const moved = await caller().takeoffRuns.setPoints({
      id: branch.id,
      points: [
        { x: ft(99), y: ft(99) },
        { x: ft(15), y: -ft(25) },
      ],
    });
    expect(moved.points[0]).toEqual({ x: ft(15), y: 0 });
    expect((await row(branch.id)).points![0]).toEqual({ x: ft(15), y: 0 });
  });

  it("refuses on a locked bid and leaves the points as they were", async () => {
    const s = await scenario();
    const before = (await row(s.runId)).points;
    await caller().bids.lockQuantities({ bidId: s.bidId });
    await expect(
      caller().takeoffRuns.setPoints({
        id: s.runId,
        points: [
          { x: 0, y: 0 },
          { x: ft(10), y: 0 },
        ],
      })
    ).rejects.toThrow(/locked/);
    expect((await row(s.runId)).points).toEqual(before);
  });

  it("refuses fewer than two points", async () => {
    const s = await scenario();
    await expect(
      caller().takeoffRuns.setPoints({ id: s.runId, points: [{ x: 0, y: 0 }] })
    ).rejects.toThrow();
  });
});

/*
  A RUN END DRAGGED OFF ITS MARK, OR ONTO ANOTHER (Track B Gap 1,
  2026-10-07). `setPoints` wrote the points and nothing else, so the run kept
  claiming the box it no longer touched — its drop came from the wrong box and
  that box's own drop stayed suppressed. Run height 10'-0"; a receptacle drops
  8.50 ft. Mark A sits at the run's end (40, 30), mark B at (80, 30).
*/
withDb("an end dragged off or onto a mark", () => {
  async function withMarks() {
    const s = await scenario();
    await caller().takeoffHeights.setCompanyDistribution({ inches: 120 });
    const group = await caller().takeoffGroups.create({
      bidId: s.bidId,
      label: "Receptacle",
    });
    await caller().takeoffStamps.drop({
      bidId: s.bidId,
      sheetId: s.sheetId,
      groupId: group.id,
      at: [
        { x: ft(40), y: ft(30) },
        { x: ft(80), y: ft(30) },
      ],
    });
    await caller().takeoffGroups.setDrop({
      id: group.id,
      dropKind: "receptacle",
      dropRunTypeId: s.typeId,
    });
    const marks = await caller().takeoffStamps.listForSheet({
      sheetId: s.sheetId,
    });
    const a = marks.find(m => Number(m.x) === ft(40))!.id;
    const b = marks.find(m => Number(m.x) === ft(80))!.id;
    // The end is ON mark A and claims it, as accepting the link does.
    await caller().takeoffRuns.setEnds({ id: s.runId, endStampId: a });
    return { ...s, a, b };
  }

  /** The run's own drop at its end, and how many marks still drop. */
  async function drops(bidId: number) {
    const [readout, totals] = await Promise.all([
      caller().takeoffRuns.drops({ bidId }),
      caller().takeoffRuns.totals({ bidId }),
    ]);
    return {
      runEndFeet: readout.drops
        .filter(d => d.end === "end")
        .reduce((sum, d) => sum + d.feet, 0),
      markDrops: totals.markDropCount,
    };
  }

  const offTheMark = [
    { x: 0, y: 0 },
    { x: ft(40), y: 0 },
    { x: ft(40), y: ft(50) },
  ];
  const ontoB = [
    { x: 0, y: 0 },
    { x: ft(40), y: 0 },
    { x: ft(80), y: ft(30) },
  ];

  it("starts claimed: the run drops 8.50 ft into A, and only B drops on its own", async () => {
    const s = await withMarks();
    expect(await drops(s.bidId)).toEqual({ runEndFeet: 8.5, markDrops: 1 });
  });

  it("dragged OFF A into open space: the claim goes, the run drops nothing, A drops on its own", async () => {
    const s = await withMarks();
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: offTheMark,
      endStampId: null,
    });
    expect((await row(s.runId)).endStampId).toBeNull();
    // Before the fix: still { 8.5, 1 } — A's drop counted from a box the
    // run no longer touches, and A's own drop held back.
    expect(await drops(s.bidId)).toEqual({ runEndFeet: 0, markDrops: 2 });
  });

  it("dragged ONTO B: claims B and lets A go — A drops again on its own", async () => {
    const s = await withMarks();
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: ontoB,
      endStampId: s.b,
    });
    expect((await row(s.runId)).endStampId).toBe(s.b);
    const after = await drops(s.bidId);
    // Before the fix: B unclaimed AND A still claimed — the run's 8.50 ft
    // read from A, B dropping on its own too. One mark drops on its own now,
    // and with B the claimed one, that mark is A.
    expect(after).toEqual({ runEndFeet: 8.5, markDrops: 1 });
  });

  it("a wall-connection answer about the old box is cleared with the claim", async () => {
    const s = await withMarks();
    const database = (await getDb())!;
    await database
      .update(takeoffRuns)
      .set({ endConnect: "confirmed" })
      .where(eq(takeoffRuns.id, s.runId));
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: ontoB,
      endStampId: s.b,
    });
    expect((await row(s.runId)).endConnect).toBeNull();
  });

  it("an end that did not move keeps its claim (nothing sent for it)", async () => {
    const s = await withMarks();
    await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: [
        { x: 0, y: 0 },
        { x: ft(30), y: 0 },
        { x: ft(40), y: ft(30) },
      ],
    });
    expect((await row(s.runId)).endStampId).toBe(s.a);
    expect(await drops(s.bidId)).toEqual({ runEndFeet: 8.5, markDrops: 1 });
  });

  it("undo puts the old claim back, and the drops with it", async () => {
    const s = await withMarks();
    const edit = await caller().takeoffRuns.setPoints({
      id: s.runId,
      points: offTheMark,
      endStampId: null,
    });
    await caller().takeoffRuns.restore({ undo: edit.undo! });
    expect((await row(s.runId)).endStampId).toBe(s.a);
    expect(await drops(s.bidId)).toEqual({ runEndFeet: 8.5, markDrops: 1 });
  });

  it("refuses an UNCONFIRMED mark and leaves the run as it was", async () => {
    const s = await withMarks();
    const database = (await getDb())!;
    const [unchecked] = await database.insert(takeoffStamps).values({
      bidId: s.bidId,
      sheetId: s.sheetId,
      userId: USER,
      x: String(ft(60)),
      y: String(ft(60)),
      status: "unconfirmed",
    });
    const before = await row(s.runId);
    await expect(
      caller().takeoffRuns.setPoints({
        id: s.runId,
        points: [
          { x: 0, y: 0 },
          { x: ft(60), y: ft(60) },
        ],
        endStampId: unchecked.insertId,
      })
    ).rejects.toThrow(UNCONFIRMED_MARK_REFUSAL);
    const after = await row(s.runId);
    expect(after.points).toEqual(before.points);
    expect(after.endStampId).toBe(s.a);
  });
});
