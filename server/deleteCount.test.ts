/**
 * DELETING A WHOLE COUNT — every mark, every sheet — and putting it back.
 *
 * references/track-b-deletes-summary-pan-plan.md § 1.2 row c′. Until
 * 2026-09-29 `takeoffGroups.remove` had no control calling it, no lock check,
 * and no undo. The screen now offers it behind a confirm, so:
 *
 *   • a locked bid refuses it and loses nothing;
 *   • it returns an undo packet, and `restore` puts the count back with the
 *     same id and every mark on every sheet;
 *   • a restore that would make two counts of one name on one bid refuses.
 *
 * Fixture id 9972 is this file's alone.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9972;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-delete-count-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A count of 2 marks on sheet 1 and 3 on sheet 2. */
async function aCount() {
  const bid = (await caller().bids.create({
    name: `Delete count ${Date.now()}${Math.random()}`,
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
  const group = await caller().takeoffGroups.create({
    bidId: bid.id,
    label: "Exit sign",
  });
  const drop = (sheetId: number, n: number) =>
    caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId,
      groupId: group.id,
      at: Array.from({ length: n }, (_, i) => ({ x: 10 + i, y: 10 + i })),
    });
  await drop(sheets[0].id, 2);
  await drop(sheets[1].id, 3);
  const marks = async () =>
    (
      await Promise.all(
        sheets.map(s => caller().takeoffStamps.listForSheet({ sheetId: s.id }))
      )
    )
      .flat()
      .map(m => m.id)
      .sort();
  const counts = async () =>
    (await caller().takeoffGroups.list({ bidId: bid.id })).groups.map(g => [
      g.id,
      g.label,
      g.count,
    ]);
  return { bidId: bid.id, groupId: group.id, marks, counts };
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
      openId: `test-delete-count-${USER}`,
      name: "Delete count fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
});

withDb("deleting a whole count", () => {
  it("a locked bid refuses it, and every mark stays", async () => {
    const c = await aCount();
    const before = await c.marks();
    await caller().bids.lockQuantities({ bidId: c.bidId });
    await expect(
      caller().takeoffGroups.remove({ id: c.groupId })
    ).rejects.toThrow(/locked/);
    expect(await c.marks()).toEqual(before);
  });

  it("removes every mark on every sheet, and Undo puts back the same count and marks", async () => {
    const c = await aCount();
    const marksBefore = await c.marks();
    const countsBefore = await c.counts();
    expect(marksBefore).toHaveLength(5);

    const { removed, undo } = await caller().takeoffGroups.remove({
      id: c.groupId,
    });
    expect(removed).toBe(5);
    expect(await c.marks()).toEqual([]);
    expect(await c.counts()).toEqual([]);

    await caller().takeoffGroups.restore({ undo: undo! });
    expect(await c.marks()).toEqual(marksBefore);
    expect(await c.counts()).toEqual(countsBefore);
  });

  it("refuses to put it back beside a new count of the same name", async () => {
    const c = await aCount();
    const { undo } = await caller().takeoffGroups.remove({ id: c.groupId });
    await caller().takeoffGroups.create({ bidId: c.bidId, label: "Exit sign" });
    await expect(
      caller().takeoffGroups.restore({ undo: undo! })
    ).rejects.toThrow(/has been started since/);
  });
});
