/**
 * QUANTITY MODE through the real router (D21): a trace saved in quantity mode
 * carries the mode onto every leg, makes no tees, takes its drops as end
 * kinds, and switches back to a route without losing anything.
 *
 * The arithmetic is pinned in `quantityDrops.test.ts`,
 * `runTypeFootageCore.test.ts` and `runFittings.test.ts`; what these add is
 * that the ROWS the router writes are the shape those read — and that the
 * totals and the drops readout MOVE when a drop is answered, which is the
 * part a screen can get wrong while every pure test passes.
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
  takeoffRunCircuits,
  takeoffRunTees,
  takeoffRunTypes,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9841;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-quantity-mode-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Quantity mode ${Date.now()}${Math.random()}`,
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
  // 10'-0" run height, so a receptacle at 1'-6" is an 8'-6" drop.
  await caller().takeoffHeights.setBidDistribution({
    bidId: bid.id,
    inches: 120,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function aType() {
  return caller().takeoffRunTypes.create({
    label: `3/4" EMT 3 #12 ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    conductorCount: 3,
  });
}

/** A 40 ft quantity leg, then a 20 ft leg starting on its middle. */
async function aQuantityTrace(bidId: number, sheetId: number, typeId: number) {
  const root = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Quantity on E1",
    pathType: "conduit",
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
    ],
    runTypeId: typeId,
    traceMode: "quantity",
  });
  const leg = await caller().takeoffRuns.addLeg({
    runId: root.id,
    points: [
      { x: ft(20), y: 0 },
      { x: ft(20), y: ft(20) },
    ],
    start: { kind: "free", startKind: null },
    endKind: null,
  });
  return { rootId: root.id, legId: leg.id };
}

async function rowsOf(rootId: number) {
  const database = (await getDb())!;
  const all = await database
    .select()
    .from(takeoffRuns)
    .where(eq(takeoffRuns.userId, USER));
  return all
    .filter(r => r.id === rootId || r.parentRunId === rootId)
    .sort((a, b) => a.id - b.id);
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
      openId: `test-quantity-mode-${USER}`,
      name: "Quantity mode fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
});

withDb("a quantity trace's rows", () => {
  it("carries the mode onto every leg, and makes no tee", async () => {
    const { bidId, sheetId } = await aBid();
    const type = await aType();
    const { rootId } = await aQuantityTrace(bidId, sheetId, type.id);
    const rows = await rowsOf(rootId);
    expect(rows.map(r => r.traceMode)).toEqual(["quantity", "quantity"]);
    expect(rows.every(r => r.startTeeId === null && r.endTeeId === null)).toBe(
      true
    );
    const database = (await getDb())!;
    expect(
      await database
        .select()
        .from(takeoffRunTees)
        .where(eq(takeoffRunTees.rootRunId, rootId))
    ).toEqual([]);
  });

  it("refuses a tee start on a quantity trace", async () => {
    const { bidId, sheetId } = await aBid();
    const type = await aType();
    const { rootId } = await aQuantityTrace(bidId, sheetId, type.id);
    await expect(
      caller().takeoffRuns.addLeg({
        runId: rootId,
        points: [
          { x: ft(10), y: 0 },
          { x: ft(10), y: -ft(10) },
        ],
        start: {
          kind: "tee",
          hostRunId: rootId,
          at: { x: ft(10), y: 0 },
          tolerance: 1,
          fitting: "box",
          stampId: null,
        },
        endKind: null,
      })
    ).rejects.toThrow(/no branch tees/);
  });

  it("a route run saved without a mode stays route (NULL)", async () => {
    const { bidId, sheetId } = await aBid();
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Route",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: ft(10), y: 0 },
      ],
    });
    const [row] = await rowsOf(run.id);
    expect(row.traceMode).toBeNull();
  });
});

withDb("drops on a quantity trace", () => {
  it("counts nothing vertical until approved, then moves the totals and the readout", async () => {
    const { bidId, sheetId } = await aBid();
    const type = await aType();
    const { rootId, legId } = await aQuantityTrace(bidId, sheetId, type.id);

    // Before: 60 ft flat, wire from the type (3 conductors), no drops, and
    // three ends waiting (the leg's start is on the main — not offered).
    const before = await caller().takeoffRuns.totals({ bidId });
    expect(before.conduitFeet).toBeCloseTo(60, 2);
    expect(before.wireFeet).toBeCloseTo(180, 2);
    expect(before.conduitVerticalFeet).toBe(0);
    expect(before.flatOnlyCount).toBe(0);
    expect(before.quantity).toEqual({ traceCount: 1, openEnds: 3 });
    expect((await caller().takeoffRuns.drops({ bidId })).drops).toEqual([]);

    // Approve all three.
    await caller().takeoffRuns.answerDrops({
      rootRunId: rootId,
      answers: [
        { runId: rootId, end: "start", kind: "receptacle" },
        { runId: rootId, end: "end", kind: "receptacle" },
        { runId: legId, end: "end", kind: "receptacle" },
      ],
    });
    const after = await caller().takeoffRuns.totals({ bidId });
    expect(after.conduitVerticalFeet).toBeCloseTo(25.5, 2); // 3 × 8.5
    expect(after.conduitFeet).toBeCloseTo(85.5, 2);
    expect(after.quantity.openEnds).toBe(0);
    const readout = await caller().takeoffRuns.drops({ bidId });
    expect(readout.drops).toHaveLength(3);
    expect(readout.drops.every(d => d.source === "quantity")).toBe(true);
    expect(readout.drops.every(d => d.feet === 8.5)).toBe(true);

    // Dismiss one; take another back. Both leave the readout; only the
    // taken-back one is offered again.
    await caller().takeoffRuns.answerDrops({
      rootRunId: rootId,
      answers: [
        { runId: rootId, end: "start", kind: "distribution" },
        { runId: legId, end: "end", kind: null },
      ],
    });
    const later = await caller().takeoffRuns.totals({ bidId });
    expect(later.conduitVerticalFeet).toBeCloseTo(8.5, 2);
    expect(later.quantity.openEnds).toBe(1);
    expect((await caller().takeoffRuns.drops({ bidId })).drops).toHaveLength(1);
  });

  it("refuses answers on a route run or a leg of another trace", async () => {
    const { bidId, sheetId } = await aBid();
    const type = await aType();
    const { rootId } = await aQuantityTrace(bidId, sheetId, type.id);
    const route = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Route",
      pathType: "conduit",
      status: "committed",
      points: [
        { x: 0, y: ft(50) },
        { x: ft(10), y: ft(50) },
      ],
    });
    await expect(
      caller().takeoffRuns.answerDrops({
        rootRunId: route.id,
        answers: [{ runId: route.id, end: "end", kind: "receptacle" }],
      })
    ).rejects.toThrow(/quantity traces only/);
    await expect(
      caller().takeoffRuns.answerDrops({
        rootRunId: rootId,
        answers: [{ runId: route.id, end: "end", kind: "receptacle" }],
      })
    ).rejects.toThrow(/not part of this trace/);
  });

  it("lists route drops too, labelled as route", async () => {
    const { bidId, sheetId } = await aBid();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: ft(10), y: 0 },
      ],
      startKind: "distribution",
      endKind: "receptacle",
    });
    const readout = await caller().takeoffRuns.drops({ bidId });
    expect(readout.drops).toHaveLength(1);
    expect(readout.drops[0]).toMatchObject({
      source: "route",
      end: "end",
      feet: 8.5,
      direction: "drop",
    });
  });
});

withDb("switching modes", () => {
  it("to route gives each leg a circuit from its type and deletes nothing; back to quantity reads the same", async () => {
    const { bidId, sheetId } = await aBid();
    const type = await aType();
    const { rootId, legId } = await aQuantityTrace(bidId, sheetId, type.id);
    await caller().takeoffRuns.answerDrops({
      rootRunId: rootId,
      answers: [{ runId: rootId, end: "start", kind: "receptacle" }],
    });
    const wireBefore = (await caller().takeoffRuns.totals({ bidId })).wireFeet;

    const result = await caller().takeoffRuns.setTraceMode({
      runId: legId,
      mode: "route",
    });
    expect(result).toEqual({ rows: 2, circuitsAdded: 2 });
    const rows = await rowsOf(rootId);
    expect(rows.map(r => r.traceMode)).toEqual(["route", "route"]);
    // The approved drop is still the end kind; the rest are questions again.
    expect(rows[0].startKind).toBe("receptacle");
    expect(rows[0].endKind).toBeNull();
    const database = (await getDb())!;
    const circuits = await database
      .select()
      .from(takeoffRunCircuits)
      .where(
        inArray(
          takeoffRunCircuits.runId,
          rows.map(r => r.id)
        )
      );
    expect(circuits.map(c => c.conductorCount)).toEqual([3, 3]);
    // The wire did not move: the same circuit, now stored.
    expect((await caller().takeoffRuns.totals({ bidId })).wireFeet).toBe(
      wireBefore
    );

    // And back: the stored circuits stay, unread, and nothing is duplicated.
    await caller().takeoffRuns.setTraceMode({
      runId: rootId,
      mode: "quantity",
    });
    await caller().takeoffRuns.setTraceMode({ runId: rootId, mode: "route" });
    expect(
      (
        await database
          .select()
          .from(takeoffRunCircuits)
          .where(
            inArray(
              takeoffRunCircuits.runId,
              rows.map(r => r.id)
            )
          )
      ).length
    ).toBe(2);
  });
});
