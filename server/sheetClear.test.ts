/**
 * CLEAR ONE SHEET, AND PUT IT BACK (takeoffSheet.clear / restore).
 *
 * What carries the risk:
 *   • **The question must match the act.** The preview's counts are what the
 *     confirm asks about; a clear that removed something else would make the
 *     question a lie.
 *   • **Only this sheet.** Another sheet's marks and runs, and the counts
 *     themselves, stay.
 *   • **Back to the exact figures.** Measured before, after the clear and
 *     after the restore — the same queries each time (CLAUDE.md § "a count
 *     taken before the change is intent").
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
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9936;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-sheet-clear-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Sheet clear ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
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
  const [one, two] = sheets.map(s => s.id);
  for (const id of [one, two])
    await caller().bidPdfs.setSheetScale({ id, scaleText: `1/4" = 1'-0"` });
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `1/2" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  const recep = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Recep",
  });
  const exit = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Exit sign",
  });
  // Sheet 1: 3 receptacles and 2 exit signs. Sheet 2: 2 receptacles.
  const onOne = await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: one,
    groupId: recep.id,
    at: [
      { x: ft(40), y: ft(30) },
      { x: ft(15), y: 0 },
      { x: ft(60), y: ft(60) },
    ],
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: one,
    groupId: exit.id,
    at: [
      { x: ft(70), y: ft(10) },
      { x: ft(75), y: ft(10) },
    ],
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId: two,
    groupId: recep.id,
    at: [
      { x: ft(5), y: ft(5) },
      { x: ft(9), y: ft(5) },
    ],
  });
  // Sheet 1: a 70 ft run ending on a mark, with a 20 ft branch; and 10 ft.
  const main = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: one,
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
  await caller().takeoffRuns.setEnds({ id: main.id, endStampId: onOne.ids[0] });
  await caller().takeoffRuns.addLeg({
    runId: main.id,
    points: [
      { x: ft(15), y: 0 },
      { x: ft(15), y: -ft(20) },
    ],
    start: {
      kind: "tee",
      hostRunId: main.id,
      at: { x: ft(15), y: 0 },
      tolerance: 3,
      fitting: "mark",
      stampId: onOne.ids[1],
    },
    endKind: "distribution",
  });
  await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: one,
    name: "Short",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: ft(100), y: 0 },
      { x: ft(110), y: 0 },
    ],
  });
  // Sheet 2: 30 ft.
  await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: two,
    name: "Other sheet",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(30), y: 0 },
    ],
  });
  return { bidId: bid.id, one, two, recep: recep.id, exit: exit.id };
}

async function figures(bidId: number, sheetIds: number[]) {
  const [totals, bridge, groups, ...perSheet] = await Promise.all([
    caller().takeoffRuns.totals({ bidId }),
    caller().takeoffRunTypes.bridgeForBid({ bidId }),
    caller().takeoffGroups.list({ bidId }),
    ...sheetIds.map(async sheetId => ({
      runs: (await caller().takeoffRuns.listForSheet({ sheetId }))
        .map(r => [r.id, r.quantities?.runFeet ?? null])
        .sort(),
      marks: (await caller().takeoffStamps.listForSheet({ sheetId }))
        .map(m => m.id)
        .sort(),
    })),
  ]);
  return {
    conduit: totals.conduitBoughtFeet,
    bridge: bridge.map(e => ({
      rows: e.rows.map(r => [r.role, r.feet]),
      fittings: e.fittings.map(f => [f.role, f.qty]),
    })),
    counts: Object.fromEntries(groups.groups.map(g => [g.id, g.count])),
    perSheet,
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
      openId: `test-sheet-clear-${USER}`,
      name: "Sheet clear fixture",
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
});

withDb("clearing one sheet", () => {
  it("previews exactly what the clear then removes", async () => {
    const s = await scenario();
    const preview = await caller().takeoffSheet.clearPreview({
      sheetId: s.one,
    });
    expect(preview).toEqual({
      runs: 2,
      runsWithLegs: 1,
      marks: 5,
      counts: 2,
      // Exit signs are only on this sheet; receptacles are on sheet 2 too.
      countsLeftEmpty: 1,
    });
    const cleared = await caller().takeoffSheet.clear({ sheetId: s.one });
    expect(cleared.removedRuns).toBe(preview.runs);
    expect(cleared.removedMarks).toBe(preview.marks);
  });

  it("drops the bid by exactly this sheet's share, and leaves the other sheet alone", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, [s.one, s.two]);
    expect(before.conduit).toBeCloseTo(130, 2);
    expect(before.counts).toEqual({ [s.recep]: 5, [s.exit]: 2 });

    await caller().takeoffSheet.clear({ sheetId: s.one });
    const after = await figures(s.bidId, [s.one, s.two]);
    expect(after.conduit).toBeCloseTo(30, 2);
    expect(after.counts).toEqual({ [s.recep]: 2, [s.exit]: 0 });
    expect(after.perSheet[0]).toEqual({ runs: [], marks: [] });
    expect(after.perSheet[1]).toEqual(before.perSheet[1]);
  });

  it("puts everything back in one step, to the exact figures", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, [s.one, s.two]);
    const cleared = await caller().takeoffSheet.clear({ sheetId: s.one });
    await caller().takeoffSheet.restore({ undo: cleared.undo! });
    expect(await figures(s.bidId, [s.one, s.two])).toEqual(before);
  });

  it("refuses to put it back twice", async () => {
    const s = await scenario();
    const cleared = await caller().takeoffSheet.clear({ sheetId: s.one });
    await caller().takeoffSheet.restore({ undo: cleared.undo! });
    await expect(
      caller().takeoffSheet.restore({ undo: cleared.undo! })
    ).rejects.toThrow(/already|changed since/);
  });

  it("refuses on a locked bid, and removes nothing", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, [s.one, s.two]);
    await caller().bids.lockQuantities({ bidId: s.bidId });
    await expect(
      caller().takeoffSheet.clear({ sheetId: s.one })
    ).rejects.toThrow(/locked/);
    const after = await figures(s.bidId, [s.one, s.two]);
    expect(after.perSheet).toEqual(before.perSheet);
  });

  it("keeps the counts themselves, and the sheet's scale", async () => {
    const s = await scenario();
    await caller().takeoffSheet.clear({ sheetId: s.one });
    const { groups } = await caller().takeoffGroups.list({ bidId: s.bidId });
    expect(groups.map(g => g.id).sort()).toEqual([s.recep, s.exit].sort());
    const m = await caller().takeoffRuns.measurability({ sheetId: s.one });
    expect(m.ok).toBe(true);
  });
});
