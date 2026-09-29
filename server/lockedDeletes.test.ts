/**
 * A LOCKED BID CANNOT LOSE ITS MARKS OR RUNS.
 *
 * The lock freezes the bid's quantities at the drawing's answer. Until
 * 2026-09-29 only the run edits that change what a run IS checked it
 * (`refuseIfLocked` in takeoffRunsRouter); deleting a mark, a selection of
 * marks or a run went straight through. The locked line did not move — it
 * reads its stored `qty` — but the drawing behind it did, so the bid and the
 * sheet it was priced from quietly disagreed, and unlocking later would have
 * re-read a drawing with holes in it and moved a quoted number.
 *
 * Every refusal here has its unlocked twin beside it: a check in the wrong
 * place would freeze every bid, and a draft that cannot lose a misclick looks
 * like a working screen until somebody tries.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9931;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-locked-deletes-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Locked deletes ${Date.now()}${Math.random()}`,
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
    at: [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ],
  });
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Home run",
    pathType: "conduit",
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
    ],
  });
  const markIds = async () =>
    (await caller().takeoffStamps.listForSheet({ sheetId })).map(m => m.id);
  const runIds = async () =>
    (await caller().takeoffRuns.listForSheet({ sheetId })).map(r => r.id);
  return { bidId: bid.id, sheetId, runId: run.id, markIds, runIds };
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
      openId: `test-locked-deletes-${USER}`,
      name: "Locked deletes fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

withDb("deleting on a locked bid", () => {
  it("refuses one mark, and leaves it on the sheet", async () => {
    const f = await aBid();
    const [first] = await f.markIds();
    await caller().bids.lockQuantities({ bidId: f.bidId });
    await expect(caller().takeoffStamps.remove({ id: first })).rejects.toThrow(
      /locked/
    );
    expect(await f.markIds()).toHaveLength(3);
  });

  it("refuses a selection of marks, all of it", async () => {
    const f = await aBid();
    const ids = await f.markIds();
    await caller().bids.lockQuantities({ bidId: f.bidId });
    await expect(caller().takeoffStamps.removeMany({ ids })).rejects.toThrow(
      /locked/
    );
    expect(await f.markIds()).toHaveLength(3);
  });

  it("refuses a run", async () => {
    const f = await aBid();
    await caller().bids.lockQuantities({ bidId: f.bidId });
    await expect(caller().takeoffRuns.remove({ id: f.runId })).rejects.toThrow(
      /locked/
    );
    expect(await f.runIds()).toEqual([f.runId]);
  });

  it("lets every one of them through again once unlocked", async () => {
    const f = await aBid();
    const [first, ...rest] = await f.markIds();
    await caller().bids.lockQuantities({ bidId: f.bidId });
    await caller().bids.unlockQuantities({ bidId: f.bidId });
    await caller().takeoffStamps.remove({ id: first });
    await caller().takeoffStamps.removeMany({ ids: rest });
    await caller().takeoffRuns.remove({ id: f.runId });
    expect(await f.markIds()).toEqual([]);
    expect(await f.runIds()).toEqual([]);
  });

  it("does not freeze a bid that was never locked", async () => {
    const f = await aBid();
    const [first] = await f.markIds();
    await caller().takeoffStamps.remove({ id: first });
    await caller().takeoffRuns.remove({ id: f.runId });
    expect(await f.markIds()).toHaveLength(2);
    expect(await f.runIds()).toEqual([]);
  });

  it("refuses a selection that reaches into a locked bid from an unlocked one", async () => {
    const open = await aBid();
    const locked = await aBid();
    await caller().bids.lockQuantities({ bidId: locked.bidId });
    const ids = [...(await open.markIds()), ...(await locked.markIds())];
    await expect(caller().takeoffStamps.removeMany({ ids })).rejects.toThrow(
      /locked/
    );
    expect(await open.markIds()).toHaveLength(3);
    expect(await locked.markIds()).toHaveLength(3);
  });
});
