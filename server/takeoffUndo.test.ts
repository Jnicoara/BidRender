/**
 * UNDO ON THE PLANS SCREEN: A DELETE CAN BE PUT BACK EXACTLY.
 *
 * What carries the risk:
 *   • **Same ids, links re-attached.** A restored mark under a new id would
 *     leave the run that ended on it ending on nothing — a vertical gone from
 *     the bid, said nowhere. So each case checks the LINK, not just the row.
 *   • **Before-and-after of the same figures.** A restore that silently did
 *     nothing would pass a check that only counted rows it meant to insert
 *     (CLAUDE.md § "a count taken before the change is intent"). So the bid's
 *     figures are read before the delete, after it, and after the restore.
 *   • **Refusal over a half-restore.** A packet not sealed here, a step whose
 *     target changed, a locked bid: each says so and changes nothing.
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
  takeoffRunTees,
  takeoffRunTypes,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9933;
const OTHER = 9934;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const callerFor = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-takeoff-undo-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Undo ${Date.now()}${Math.random()}`,
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
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Recep",
  });
  const placed = await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId,
    groupId: group.id,
    at: [
      { x: ft(40), y: ft(30) },
      { x: ft(15), y: 0 },
      { x: ft(60), y: ft(60) },
    ],
  });
  // 70 ft: 40 east, 30 south, ending on the first mark; a corner at (40, 0).
  const root = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Main",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
      { x: ft(40), y: ft(30) },
    ],
  });
  await caller().takeoffRuns.setEnds({
    id: root.id,
    endStampId: placed.ids[0],
  });
  await caller().takeoffRuns.answerPullPoint({
    runId: root.id,
    place: "corner",
    x: ft(40),
    y: 0,
    kind: "lb",
    status: "accepted",
  });
  // A branch north from 15 ft along, its tee standing on the second mark.
  await caller().takeoffRuns.addLeg({
    runId: root.id,
    points: [
      { x: ft(15), y: 0 },
      { x: ft(15), y: -ft(20) },
    ],
    start: {
      kind: "tee",
      hostRunId: root.id,
      at: { x: ft(15), y: 0 },
      tolerance: 3,
      fitting: "mark",
      stampId: placed.ids[1],
    },
    endKind: "distribution",
  });
  return {
    bidId: bid.id,
    sheetId,
    rootId: root.id,
    groupId: group.id,
    markIds: placed.ids,
  };
}

/** Every figure the bid is priced from, as the screen reads them. */
async function figures(bidId: number, sheetId: number) {
  const database = (await getDb())!;
  const [runs, links, marks, totals, bridge, groups] = await Promise.all([
    caller().takeoffRuns.listForSheet({ sheetId }),
    // The list does not carry the mark links, so they are read off the rows.
    database
      .select({
        id: takeoffRuns.id,
        startStampId: takeoffRuns.startStampId,
        endStampId: takeoffRuns.endStampId,
      })
      .from(takeoffRuns)
      .where(eq(takeoffRuns.sheetId, sheetId)),
    caller().takeoffStamps.listForSheet({ sheetId }),
    caller().takeoffRuns.totals({ bidId }),
    caller().takeoffRunTypes.bridgeForBid({ bidId }),
    caller().takeoffGroups.list({ bidId }),
  ]);
  return {
    runs: runs
      .map(r => {
        const link = links.find(l => l.id === r.id)!;
        return {
          id: r.id,
          feet: r.quantities?.runFeet ?? null,
          startStampId: link.startStampId,
          endStampId: link.endStampId,
        };
      })
      .sort((a, b) => a.id - b.id),
    marks: marks.map(m => m.id).sort((a, b) => a - b),
    conduit: totals.conduitBoughtFeet,
    bridge: bridge.map(e => ({
      rows: e.rows.map(r => [r.role, r.feet]),
      fittings: e.fittings.map(f => [f.role, f.qty]),
    })),
    counts: groups.groups.map(g => [g.id, g.count]),
  };
}

async function teeStampIds(rootId: number) {
  const database = (await getDb())!;
  const rows = await database
    .select({ stampId: takeoffRunTees.stampId })
    .from(takeoffRunTees)
    .where(eq(takeoffRunTees.rootRunId, rootId));
  return rows.map(r => r.stampId);
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, OTHER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-takeoff-undo-${id}`,
        name: `Undo fixture ${id}`,
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
  await database
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER, OTHER]));
  await database
    .delete(materials)
    .where(inArray(materials.userId, [USER, OTHER]));
});

withDb("undoing a mark delete", () => {
  it("gives every placed mark's id back, so a placement can be undone", async () => {
    const s = await scenario();
    expect(s.markIds).toHaveLength(3);
    const marks = await caller().takeoffStamps.listForSheet({
      sheetId: s.sheetId,
    });
    expect(marks.map(m => m.id).sort()).toEqual([...s.markIds].sort());
  });

  it("puts the marks back with their ids, the run end and the tee re-attached", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    // The fixture really has what the restore must bring back. The tee cut
    // the main in two, so the mark end is on the far piece, not the root.
    const endsOnMark = before.runs.filter(r => r.endStampId === s.markIds[0]);
    expect(endsOnMark).toHaveLength(1);
    expect(await teeStampIds(s.rootId)).toEqual([s.markIds[1]]);
    expect(before.counts).toEqual([[s.groupId, 3]]);
    expect(before.conduit).toBeCloseTo(90, 2);
    expect(before.bridge[0].fittings.length).toBeGreaterThan(0);

    const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    expect(del.removed).toBe(3);
    const gone = await figures(s.bidId, s.sheetId);
    expect(gone.marks).toEqual([]);
    expect(
      gone.runs.find(r => r.id === endsOnMark[0].id)!.endStampId
    ).toBeNull();
    expect(await teeStampIds(s.rootId)).toEqual([null]);
    expect(gone.counts).not.toEqual(before.counts);

    const back = await caller().takeoffStamps.restore({ undo: del.undo! });
    expect(back.restored).toBe(3);
    expect(await figures(s.bidId, s.sheetId)).toEqual(before);
    expect(await teeStampIds(s.rootId)).toEqual([s.markIds[1]]);
  });

  it("does the same for a single mark", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const del = await caller().takeoffStamps.remove({ id: s.markIds[0] });
    await caller().takeoffStamps.restore({ undo: del.undo! });
    expect(await figures(s.bidId, s.sheetId)).toEqual(before);
  });

  it("refuses to put them back twice", async () => {
    const s = await scenario();
    const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    await caller().takeoffStamps.restore({ undo: del.undo! });
    await expect(
      caller().takeoffStamps.restore({ undo: del.undo! })
    ).rejects.toThrow(/already/);
  });

  it("refuses when the count they belonged to has been deleted", async () => {
    const s = await scenario();
    const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    await caller().takeoffGroups.remove({ id: s.groupId });
    await expect(
      caller().takeoffStamps.restore({ undo: del.undo! })
    ).rejects.toThrow(/count/);
  });

  it("refuses an edited packet, and one sealed for another company", async () => {
    const s = await scenario();
    const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    const edited = { ...del.undo!, data: del.undo!.data.replace("12", "13") };
    await expect(
      caller().takeoffStamps.restore({ undo: edited })
    ).rejects.toThrow(/not valid/);
    await expect(
      callerFor(OTHER).takeoffStamps.restore({ undo: del.undo! })
    ).rejects.toThrow(/not valid/);
    // A marks packet is not a run packet either.
    await expect(
      caller().takeoffRuns.restore({ undo: del.undo! })
    ).rejects.toThrow(/not valid/);
  });

  it("refuses on a locked bid", async () => {
    const s = await scenario();
    const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    await caller().bids.lockQuantities({ bidId: s.bidId });
    await expect(
      caller().takeoffStamps.restore({ undo: del.undo! })
    ).rejects.toThrow(/locked/);
    expect(
      await caller().takeoffStamps.listForSheet({ sheetId: s.sheetId })
    ).toEqual([]);
  });
});

withDb("undoing a run delete", () => {
  it("puts back the whole run — legs, tee, pull-point answer — at the same figures", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const del = await caller().takeoffRuns.remove({ id: s.rootId });
    const gone = await figures(s.bidId, s.sheetId);
    expect(gone.runs).toEqual([]);
    expect(gone.conduit).toBe(0);

    await caller().takeoffRuns.restore({ undo: del.undo! });
    expect(await figures(s.bidId, s.sheetId)).toEqual(before);
    expect(await teeStampIds(s.rootId)).toEqual([s.markIds[1]]);
  });

  it("undoes a LEG delete, un-joining the two pieces the delete re-joined", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const branch = before.runs.find(
      r => r.id !== s.rootId && r.feet !== null && Math.abs(r.feet - 20) < 0.01
    )!;
    const del = await caller().takeoffRuns.remove({ id: branch.id });
    // The main is whole again: one row, 70 ft.
    const gone = await figures(s.bidId, s.sheetId);
    expect(gone.runs).toHaveLength(1);
    expect(gone.runs[0].feet).toBeCloseTo(70, 2);

    await caller().takeoffRuns.restore({ undo: del.undo! });
    expect(await figures(s.bidId, s.sheetId)).toEqual(before);
  });

  it("refuses when the run was changed after the delete", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const branch = before.runs.find(
      r => r.id !== s.rootId && r.feet !== null && Math.abs(r.feet - 20) < 0.01
    )!;
    const del = await caller().takeoffRuns.remove({ id: branch.id });
    await caller().takeoffRuns.setLocation({
      id: s.rootId,
      location: "Underground",
    });
    await expect(
      caller().takeoffRuns.restore({ undo: del.undo! })
    ).rejects.toThrow(/changed since/);
  });

  it("refuses when a mark the run ended on has been deleted since", async () => {
    const s = await scenario();
    const del = await caller().takeoffRuns.remove({ id: s.rootId });
    await caller().takeoffStamps.remove({ id: s.markIds[0] });
    await expect(
      caller().takeoffRuns.restore({ undo: del.undo! })
    ).rejects.toThrow(/mark/);
    const database = (await getDb())!;
    const left = await database
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, s.rootId));
    expect(left).toEqual([]);
  });

  it("restores in stack order: the mark, then the run that ended on it", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const runDel = await caller().takeoffRuns.remove({ id: s.rootId });
    const markDel = await caller().takeoffStamps.removeMany({ ids: s.markIds });
    await caller().takeoffStamps.restore({ undo: markDel.undo! });
    await caller().takeoffRuns.restore({ undo: runDel.undo! });
    expect(await figures(s.bidId, s.sheetId)).toEqual(before);
  });
});
