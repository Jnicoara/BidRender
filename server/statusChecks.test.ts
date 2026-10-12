/**
 * The status bar's two fix-its (status-and-scope-plan § 1c):
 *
 * 1. "CHECK THEM" — the unconfirmed marks, one at a time. The order and
 *    skipping (`nextMarkToCheck`), the bid-wide list it walks
 *    (`takeoffStamps.unconfirmedForBid`), and the answer being an Undo step
 *    that moves the bid's number and moves it back.
 * 2. THE TWIN WARNING — every "… - EXISTING TO REMAIN" count still holding
 *    new marks (`twinCountWarnings`), cleared by the same fold the bid
 *    screen uses, and put back by the same Undo (@/hooks/useFoldTwin).
 *
 * Locked bids never move: the list still answers (looking), the answers and
 * the fold are refused.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffStamps, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { nextMarkToCheck } from "../shared/markStatus";
import { twinCountWarnings } from "../shared/twinFold";

const USER = 9419;
const OTHER = 9420;
dropFixtureUsersAfterAll([USER, OTHER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-status-checks-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);

// ─── Pure: the walk's order ─────────────────────────────────────────────────

describe("nextMarkToCheck", () => {
  const list = [
    { id: 1, sheetId: 10 },
    { id: 2, sheetId: 10 },
    { id: 3, sheetId: 11 },
  ];
  const none = new Set<number>();

  it("starts at the first and goes in the list's order", () => {
    expect(nextMarkToCheck(list, none, none, null)?.id).toBe(1);
    expect(nextMarkToCheck(list, none, none, 1)?.id).toBe(2);
    expect(nextMarkToCheck(list, none, none, 2)?.id).toBe(3);
  });

  it("wraps past the end to the marks before it", () => {
    expect(nextMarkToCheck(list, new Set([1]), none, 3)?.id).toBe(2);
  });

  it("never shows an answered mark again, even before the list refetches", () => {
    expect(nextMarkToCheck(list, none, new Set([2]), 1)?.id).toBe(3);
    expect(nextMarkToCheck(list, none, new Set([1, 2, 3]), 3)).toBeNull();
  });

  it("passes over skipped marks and stops when only skipped ones are left", () => {
    expect(nextMarkToCheck(list, new Set([2]), none, 1)?.id).toBe(3);
    expect(nextMarkToCheck(list, new Set([1, 2, 3]), none, 3)).toBeNull();
  });

  it("a skipped mark that is the only one left is not offered again", () => {
    expect(nextMarkToCheck(list, new Set([3]), new Set([1, 2]), 3)).toBeNull();
  });
});

// ─── Pure: which twins the bar warns about ──────────────────────────────────

describe("twinCountWarnings", () => {
  it("lists a twin with new marks, naming the count its marks would go to", () => {
    expect(
      twinCountWarnings([
        { id: 1, label: "Duplex receptacle", count: 5 },
        { id: 2, label: "Duplex receptacle - EXISTING TO REMAIN", count: 3 },
      ])
    ).toEqual([
      {
        groupId: 2,
        label: "Duplex receptacle - EXISTING TO REMAIN",
        newMarks: 3,
        baseLabel: "Duplex receptacle",
      },
    ]);
  });

  it("is silent about a twin with no new marks, and about ordinary counts", () => {
    expect(
      twinCountWarnings([
        { id: 1, label: "Exit sign", count: 4 },
        { id: 2, label: "Exit sign - EXISTING TO REMAIN", count: 0 },
      ])
    ).toEqual([]);
  });

  it("names the twin's own base when the bid has no base count yet", () => {
    expect(
      twinCountWarnings([
        { id: 9, label: "Smoke detector - existing to remain", count: 2 },
      ])[0].baseLabel
    ).toBe("Smoke detector");
  });
});

// ─── Through the routers ────────────────────────────────────────────────────

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  for (const id of [USER, OTHER]) {
    const [row] = await database!
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row)
      await database!.insert(users).values({
        id,
        openId: `test-status-checks-${id}`,
        name: "Status checks fixture",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
});

const at = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));

async function bidWithTwoSheets() {
  const bid = (await caller().bids.create({
    name: `Status checks ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 2,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 2 });
  const [a, b] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  return { bidId: bid.id, sheetA: a.id, sheetB: b.id };
}

async function count(
  bidId: number,
  sheetId: number,
  label: string,
  n: number,
  y: number
) {
  const group = await caller().takeoffGroups.create({ bidId, label });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: at(n, y),
  });
  return group.id;
}

async function sendPriced(bidId: number, groupId: number) {
  const sent = await caller().takeoffGroups.sendToBid({ id: groupId });
  await caller().bids.updateLine({
    bidId,
    id: sent.lineId,
    materialCost: 10,
  });
  return sent.lineId;
}

const total = async (bidId: number) =>
  (await caller().bids.get({ id: bidId })).totals.materialCost;

/** Make the marks of a count unconfirmed — what the reader leaves behind. */
async function unconfirm(groupId: number, howMany: number) {
  const database = await getDb();
  const rows = await database!
    .select({ id: takeoffStamps.id })
    .from(takeoffStamps)
    .where(eq(takeoffStamps.groupId, groupId))
    .limit(howMany);
  await database!
    .update(takeoffStamps)
    .set({ status: "unconfirmed" })
    .where(
      inArray(
        takeoffStamps.id,
        rows.map(r => r.id)
      )
    );
  return rows.map(r => r.id);
}

describe.skipIf(!hasDb)("Check them: the unconfirmed marks", () => {
  it("lists only unconfirmed marks, sheet by sheet, down the drawing", async () => {
    const f = await bidWithTwoSheets();
    const onB = await count(f.bidId, f.sheetB, "Receptacle B", 2, 9000);
    const onA = await count(f.bidId, f.sheetA, "Receptacle A", 4, 3000);
    const b = await unconfirm(onB, 2);
    const a = await unconfirm(onA, 2);
    const list = await caller().takeoffStamps.unconfirmedForBid({
      bidId: f.bidId,
    });
    expect(list.map(m => m.id)).toEqual([...a, ...b]);
    expect(list.every(m => typeof m.x === "number")).toBe(true);
    expect(list[0]).toMatchObject({ sheetId: f.sheetA, groupId: onA });
  });

  it("an answer moves the bid and drops the mark from the list; Undo puts both back", async () => {
    const f = await bidWithTwoSheets();
    const g = await count(f.bidId, f.sheetA, "Duplex receptacle", 5, 3000);
    await sendPriced(f.bidId, g);
    const [first] = await unconfirm(g, 2);
    expect(await total(f.bidId)).toBe(30); // 3 new × $10; 2 not counted

    // Answer "New" — the walk's button sends exactly this.
    const answer = await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids: [first],
      status: "new",
    });
    expect(await total(f.bidId)).toBe(40);
    const after = await caller().takeoffStamps.unconfirmedForBid({
      bidId: f.bidId,
    });
    expect(after.map(m => m.id)).not.toContain(first);
    expect(after).toHaveLength(1);

    // Undo — the step the answer pushed.
    await caller().takeoffStamps.restoreStatus({
      bidId: f.bidId,
      sets: answer.previous,
    });
    expect(await total(f.bidId)).toBe(30);
    expect(
      (await caller().takeoffStamps.unconfirmedForBid({ bidId: f.bidId })).map(
        m => m.id
      )
    ).toContain(first);
  });

  it("on a locked bid: the list still answers, an answer is refused, nothing moves", async () => {
    const f = await bidWithTwoSheets();
    const g = await count(f.bidId, f.sheetA, "Duplex receptacle", 3, 3000);
    await sendPriced(f.bidId, g);
    const ids = await unconfirm(g, 1);
    await caller().bids.lockQuantities({ bidId: f.bidId });
    const before = await caller().bids.get({ id: f.bidId });
    expect(
      await caller().takeoffStamps.unconfirmedForBid({ bidId: f.bidId })
    ).toHaveLength(1);
    await expect(
      caller().takeoffStamps.setStatus({ bidId: f.bidId, ids, status: "new" })
    ).rejects.toThrow(/locked/);
    expect((await caller().bids.get({ id: f.bidId })).totals).toEqual(
      before.totals
    );
  });

  it("is not readable by another company", async () => {
    const f = await bidWithTwoSheets();
    await expect(
      callerFor(OTHER).takeoffStamps.unconfirmedForBid({ bidId: f.bidId })
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasDb)("the twin warning on the status bar", () => {
  const TWIN = "Duplex receptacle - EXISTING TO REMAIN";

  it("warns from the count list, and the fold clears it — the total drops by the twin, Undo puts it back", async () => {
    const f = await bidWithTwoSheets();
    const base = await count(f.bidId, f.sheetA, "Duplex receptacle", 5, 3000);
    const twin = await count(f.bidId, f.sheetA, TWIN, 3, 6000);
    await sendPriced(f.bidId, base);
    await sendPriced(f.bidId, twin);
    expect(await total(f.bidId)).toBe(80);

    const warnings = async () =>
      twinCountWarnings(
        (await caller().takeoffGroups.list({ bidId: f.bidId })).groups
      );
    expect(await warnings()).toEqual([
      {
        groupId: twin,
        label: TWIN,
        newMarks: 3,
        baseLabel: "Duplex receptacle",
      },
    ]);

    // The bar's button — the same call the bid screen makes.
    const r = await caller().takeoffGroups.foldExistingTwin({ id: twin });
    expect(r.twinKept).toBe(true);
    expect(await warnings()).toEqual([]);
    expect(await total(f.bidId)).toBe(50);

    // The hook's Undo: the marks back on the twin, new again.
    await caller().takeoffStamps.moveToGroup({
      ids: r.previous.map(m => m.id),
      groupId: twin,
    });
    await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids: r.previous
        .filter(m => m.status === null || m.status === "new")
        .map(m => m.id),
      status: null,
    });
    expect(await total(f.bidId)).toBe(80);
    expect(await warnings()).toHaveLength(1);
  });

  it("a locked bid still warns, and the fold is refused", async () => {
    const f = await bidWithTwoSheets();
    await count(f.bidId, f.sheetA, "Duplex receptacle", 2, 3000);
    const twin = await count(f.bidId, f.sheetA, TWIN, 3, 6000);
    await sendPriced(f.bidId, twin);
    await caller().bids.lockQuantities({ bidId: f.bidId });
    const before = await caller().bids.get({ id: f.bidId });
    expect(
      twinCountWarnings(
        (await caller().takeoffGroups.list({ bidId: f.bidId })).groups
      )
    ).toHaveLength(1);
    await expect(
      caller().takeoffGroups.foldExistingTwin({ id: twin })
    ).rejects.toThrow(/locked/);
    expect((await caller().bids.get({ id: f.bidId })).totals).toEqual(
      before.totals
    );
  });
});
