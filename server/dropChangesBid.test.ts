/**
 * A DROP CHANGE, A DELETE AND AN UNDO EACH MOVE THE BID — AND COME BACK.
 *
 * The owner's rule (2026-09-29): after any drop change, delete or undo, the
 * run totals, the bid's lines and the materials list move at once. The
 * CLIENT half (which cached queries each change refreshes) is
 * client/src/lib/takeoffRefresh.test.ts; this is the SERVER half, measured
 * before, after and after the undo from the same queries, so "nothing moved"
 * and "nothing happened" cannot pass for each other (CLAUDE.md § a count taken
 * before the change is intent).
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

const USER = 9937;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-drop-changes-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Drop changes ${Date.now()}${Math.random()}`,
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
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Homerun",
    pathType: "conduit",
    runTypeId: type.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
    ],
  });
  await caller().takeoffRuns.setEnds({
    id: run.id,
    startKind: "distribution",
    endKind: "distribution",
    // The run's own run height, so "carries on" is level and a device end
    // is a measurable drop.
    distributionHeightInches: 120,
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
      { x: ft(5), y: ft(5) },
      { x: ft(9), y: ft(5) },
      { x: ft(13), y: ft(5) },
    ],
  });
  await caller().takeoffRunTypes.sendToBid({
    bidId: bid.id,
    runTypeId: type.id,
  });
  await caller().takeoffGroups.sendToBid({ id: group.id });
  return {
    bidId: bid.id,
    sheetId,
    runId: run.id,
    runTypeId: type.id,
    groupId: group.id,
    markIds: placed.ids,
  };
}

/** Everything the owner named: run totals, bid lines, materials list. */
async function figures(s: {
  bidId: number;
  runTypeId: number;
  groupId: number;
}) {
  const [totals, bid, list] = await Promise.all([
    caller().takeoffRuns.totals({ bidId: s.bidId }),
    caller().bids.get({ id: s.bidId }),
    caller().materialsList.get({ bidId: s.bidId }),
  ]);
  const lines = bid!.lines;
  return {
    conduit: totals.conduitBoughtFeet,
    raceLine: Number(
      lines.find(
        l =>
          l.takeoffRunTypeId === s.runTypeId && l.runMaterialRole === "raceway"
      )?.qty ?? NaN
    ),
    countLine: Number(
      lines.find(l => l.takeoffGroupId === s.groupId)?.qty ?? NaN
    ),
    list: {
      entries: list.entries.map(e => [e.name, e.qty]),
      measured: list.measured,
    },
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
      openId: `test-drop-changes-${USER}`,
      name: "Drop changes fixture",
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

withDb("an end change moves the bid, and its undo moves it back", () => {
  it("adds the drop to totals, the bid line and the materials list", async () => {
    const s = await scenario();
    const before = await figures(s);
    expect(before.conduit).toBeCloseTo(40, 2);
    expect(before.raceLine).toBeCloseTo(40, 2);

    // A receptacle at the far end: a drop from 10 ft to the device height.
    const change = await caller().takeoffRuns.setEnds({
      id: s.runId,
      endKind: "receptacle",
    });
    const after = await figures(s);
    expect(after.conduit).toBeGreaterThan(before.conduit);
    expect(after.raceLine).toBeCloseTo(after.conduit, 2);
    expect(after.list).not.toEqual(before.list);

    await caller().takeoffRuns.restore({ undo: change.undo! });
    expect(await figures(s)).toEqual(before);
  });

  it("moves the SAME figures when the height of one end is typed", async () => {
    const s = await scenario();
    await caller().takeoffRuns.setEnds({ id: s.runId, endKind: "receptacle" });
    const at18 = await figures(s);
    const change = await caller().takeoffRuns.setEnds({
      id: s.runId,
      endHeightInches: 48,
    });
    const at48 = await figures(s);
    // 120 → 48 is a shorter drop than 120 → the device height.
    expect(at48.conduit).not.toBeCloseTo(at18.conduit, 2);
    expect(at48.raceLine).toBeCloseTo(at48.conduit, 2);
    await caller().takeoffRuns.restore({ undo: change.undo! });
    expect(await figures(s)).toEqual(at18);
  });
});

withDb(
  "a count card's delete moves the bid, and its undo moves it back",
  () => {
    it("drops the count's bid line, then restores it exactly", async () => {
      const s = await scenario();
      const before = await figures(s);
      expect(before.countLine).toBe(3);

      const del = await caller().takeoffStamps.removeMany({ ids: s.markIds });
      const after = await figures(s);
      expect(after.countLine).toBe(0);

      await caller().takeoffStamps.restore({ undo: del.undo! });
      expect(await figures(s)).toEqual(before);
    });
  }
);
