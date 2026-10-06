/**
 * MOVING MARKS TO ANOTHER COUNT keeps every mark and its place, and changes
 * only what it counts.
 *
 * Asked for 2026-10-01 for the reader-accuracy hand count: devices drawn as
 * existing to remain had been counted together with new ones, and the only
 * fix was to delete them and click every one again.
 *
 * What would go wrong without each check here: a move that rewrote only
 * `groupId` would leave the mark's name and Category saying the old thing
 * (the System layer reads the Category); a move that half-ran would leave a
 * count at a number nobody chose; a move on a locked bid would change the
 * drawing a quote was priced from.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9947;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-move-marks-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Move marks ${Date.now()}${Math.random()}`,
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
  const recep = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Duplex receptacle",
  });
  const existing = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Duplex receptacle - EXISTING TO REMAIN",
  });
  await caller().takeoffStamps.drop({
    bidId: bid.id,
    sheetId,
    groupId: recep.id,
    at: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ],
  });
  const marks = () => caller().takeoffStamps.listForSheet({ sheetId });
  return { bidId: bid.id, sheetId, recep, existing, marks };
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  const [row] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!row)
    await database.insert(users).values({
      id: USER,
      openId: `test-move-marks-${USER}`,
      name: "Move marks fixture",
    });
});
dropFixtureUsersAfterAll([USER]);

withDb("moving marks to another count", () => {
  it("moves the chosen marks, keeps their ids and places, and leaves the rest", async () => {
    const f = await aBid();
    const before = await f.marks();
    const [a, b] = before;
    const r = await caller().takeoffStamps.moveToGroup({
      ids: [a.id, b.id],
      groupId: f.existing.id,
    });
    expect(r.moved).toBe(2);
    expect(r.previous).toEqual([{ groupId: f.recep.id, ids: [a.id, b.id] }]);

    const after = await f.marks();
    expect(after.map(m => m.id).sort()).toEqual(before.map(m => m.id).sort());
    const byId = new Map(after.map(m => [m.id, m]));
    expect(byId.get(a.id)).toMatchObject({
      groupId: f.existing.id,
      name: "Duplex receptacle - EXISTING TO REMAIN",
      x: a.x,
      y: a.y,
    });
    expect(byId.get(b.id)?.groupId).toBe(f.existing.id);
    expect(byId.get(before[2].id)?.groupId).toBe(f.recep.id);
  });

  it("moves back to exactly where they were — the undo", async () => {
    const f = await aBid();
    const before = await f.marks();
    const r = await caller().takeoffStamps.moveToGroup({
      ids: before.map(m => m.id),
      groupId: f.existing.id,
    });
    for (const back of r.previous)
      await caller().takeoffStamps.moveToGroup(back);
    const after = await f.marks();
    expect(after.map(m => [m.id, m.groupId, m.name])).toEqual(
      before.map(m => [m.id, m.groupId, m.name])
    );
  });

  it("moves nothing when any mark is not on the count's bid", async () => {
    const f = await aBid();
    const other = await aBid();
    const ids = [
      ...(await f.marks()).map(m => m.id),
      (await other.marks())[0].id,
    ];
    await expect(
      caller().takeoffStamps.moveToGroup({ ids, groupId: f.existing.id })
    ).rejects.toThrow(/Nothing was moved/);
    expect((await f.marks()).every(m => m.groupId === f.recep.id)).toBe(true);
  });

  it("refuses on a locked bid and leaves every mark where it was", async () => {
    const f = await aBid();
    const ids = (await f.marks()).map(m => m.id);
    await caller().bids.lockQuantities({ bidId: f.bidId });
    await expect(
      caller().takeoffStamps.moveToGroup({ ids, groupId: f.existing.id })
    ).rejects.toThrow(/locked/);
    expect((await f.marks()).every(m => m.groupId === f.recep.id)).toBe(true);
  });
});
