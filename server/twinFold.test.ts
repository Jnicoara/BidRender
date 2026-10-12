/**
 * FOLDING AN "- EXISTING TO REMAIN" TWIN COUNT INTO MARK STATUS
 * (shared/twinFold.ts; references/status-and-scope-plan.md § 1; owner,
 * 2026-10-10).
 *
 * The three rules, each read through the real routers and the bid's own
 * total:
 *
 * 1. A twin already on the bid is FLAGGED, never removed: its line stays,
 *    reads 0, and the bid's flags say "Remove this line".
 * 2. A locked bid never moves: the fold is refused and every mark, line and
 *    total is exactly where it was.
 * 3. Existing to remain never prices as new: the twin's new marks land on the
 *    base count as `existing`, and the base line's quantity does not change.
 *
 * Red without the fix: `takeoffGroups.foldExistingTwin` does not exist, so
 * every case here fails at the call.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { foldedStatus, planTwinFold, twinLineFlags } from "../shared/twinFold";

const USER = 9963;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-twin-fold-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [row] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!row)
    await database!.insert(users).values({
      id: USER,
      openId: `test-twin-fold-${USER}`,
      name: "Twin fold fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
});

const TWIN = "Duplex receptacle - EXISTING TO REMAIN";
const at = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Twin fold ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bid.id}/e.pdf`,
    byteSize: 1024,
    pageCount: 1,
    sortOrder: 0,
  });
  await caller().bidPdfs.ensureSheets({ bidPdfId: pdf.insertId, pageCount: 1 });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  return { bidId: bid.id, sheetId: sheet.id };
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

/** Send a count and price its line at $10 a device. */
async function sendPriced(bidId: number, groupId: number) {
  const sent = await caller().takeoffGroups.sendToBid({ id: groupId });
  await caller().bids.updateLine({
    bidId,
    id: sent.lineId,
    materialCost: 10,
  });
  return sent.lineId;
}

/**
 * The usual shape: 5 new receptacles and 3 existing ones counted under the
 * twin, BOTH sent to the bid at $10 — so the bid charges $80 for 5 devices.
 */
async function sentPair() {
  const { bidId, sheetId } = await bidWithSheet();
  const base = await count(bidId, sheetId, "Duplex receptacle", 5, 3000);
  const twin = await count(bidId, sheetId, TWIN, 3, 6000);
  const baseLine = await sendPriced(bidId, base);
  const twinLine = await sendPriced(bidId, twin);
  return { bidId, sheetId, base, twin, baseLine, twinLine };
}

const lineQty = async (bidId: number, lineId: number) =>
  Number(
    (await caller().bids.get({ id: bidId })).lines.find(l => l.id === lineId)
      ?.qty
  );

describe.skipIf(!hasDb)("folding a twin count into mark status", () => {
  it("moves the twin's marks to the base as existing: the total drops by exactly the twin, and the base line does not move", async () => {
    const f = await sentPair();
    const before = await caller().bids.get({ id: f.bidId });
    expect(before.totals.materialCost).toBe(80);

    const r = await caller().takeoffGroups.foldExistingTwin({ id: f.twin });
    expect(r).toMatchObject({
      moved: 3,
      baseGroupId: f.base,
      baseLabel: "Duplex receptacle",
      twinKept: true,
    });

    const after = await caller().bids.get({ id: f.bidId });
    // $30 off: the 3 existing devices stop pricing as new. Nothing else.
    expect(after.totals.materialCost).toBe(50);
    expect(await lineQty(f.bidId, f.baseLine)).toBe(5);

    const marks = await caller().takeoffStamps.listForSheet({
      sheetId: f.sheetId,
    });
    expect(marks).toHaveLength(8);
    expect(marks.every(m => m.groupId === f.base)).toBe(true);
    expect(marks.filter(m => m.status === "existing")).toHaveLength(3);
    expect(marks.filter(m => m.status === null)).toHaveLength(5);
  });

  it("never removes the twin's line: it stays, reads 0, and is flagged with remove", async () => {
    const f = await sentPair();
    await caller().takeoffGroups.foldExistingTwin({ id: f.twin });
    const bid = await caller().bids.get({ id: f.bidId });
    const line = bid.lines.find(l => l.id === f.twinLine);
    expect(line).toBeDefined();
    expect(Number(line!.qty)).toBe(0);
    expect(twinLineFlags(bid.lines, false)).toEqual([
      {
        lineId: f.twinLine,
        kind: "foldedAway",
        baseLabel: "Duplex receptacle",
        groupId: f.twin,
        locked: false,
      },
    ]);
    // The twin count is still there for the line to follow.
    const groups = (await caller().takeoffGroups.list({ bidId: f.bidId }))
      .groups;
    expect(groups.find(g => g.id === f.twin)?.count).toBe(0);
  });

  it("before the fold the same line is flagged as priced as new", async () => {
    const f = await sentPair();
    const bid = await caller().bids.get({ id: f.bidId });
    expect(twinLineFlags(bid.lines, false)).toEqual([
      expect.objectContaining({ lineId: f.twinLine, kind: "pricedAsNew" }),
    ]);
  });

  it("refuses on a locked bid and moves nothing", async () => {
    const f = await sentPair();
    await caller().bids.lockQuantities({ bidId: f.bidId });
    const before = await caller().bids.get({ id: f.bidId });
    const marksBefore = await caller().takeoffStamps.listForSheet({
      sheetId: f.sheetId,
    });
    await expect(
      caller().takeoffGroups.foldExistingTwin({ id: f.twin })
    ).rejects.toThrow(/locked/);
    const after = await caller().bids.get({ id: f.bidId });
    expect(after.totals).toEqual(before.totals);
    expect(after.lines.map(l => [l.id, l.qty])).toEqual(
      before.lines.map(l => [l.id, l.qty])
    );
    expect(
      await caller().takeoffStamps.listForSheet({ sheetId: f.sheetId })
    ).toEqual(marksBefore);
  });

  it("keeps a status a person chose: a twin mark set to remove stays remove", async () => {
    const f = await sentPair();
    const twinMarks = (
      await caller().takeoffStamps.listForSheet({ sheetId: f.sheetId })
    ).filter(m => m.groupId === f.twin);
    await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids: [twinMarks[0].id],
      status: "remove",
    });
    await caller().takeoffGroups.foldExistingTwin({ id: f.twin });
    const byId = new Map(
      (await caller().takeoffStamps.listForSheet({ sheetId: f.sheetId })).map(
        m => [m.id, m]
      )
    );
    expect(byId.get(twinMarks[0].id)?.status).toBe("remove");
    expect(byId.get(twinMarks[1].id)?.status).toBe("existing");
  });

  it("with no base count and no line, the twin itself becomes the base", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const twin = await count(bidId, sheetId, TWIN, 2, 3000);
    const r = await caller().takeoffGroups.foldExistingTwin({ id: twin });
    expect(r).toMatchObject({ baseGroupId: twin, twinKept: false });
    const groups = (await caller().takeoffGroups.list({ bidId })).groups;
    expect(groups.map(g => g.label)).toEqual(["Duplex receptacle"]);
    expect(groups[0].count).toBe(0);
    expect(groups[0].split.existing).toBe(2);
  });

  it("with a base count and no line, the emptied twin goes", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const base = await count(bidId, sheetId, "Duplex receptacle", 1, 3000);
    const twin = await count(bidId, sheetId, TWIN, 2, 6000);
    await caller().takeoffGroups.foldExistingTwin({ id: twin });
    const groups = (await caller().takeoffGroups.list({ bidId })).groups;
    expect(groups.map(g => g.id)).toEqual([base]);
    expect(groups[0].split).toMatchObject({ new: 1, existing: 2 });
  });

  it("with no base count and a line, a base is made beside the kept twin", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const twin = await count(bidId, sheetId, TWIN, 2, 3000);
    const twinLine = await sendPriced(bidId, twin);
    const r = await caller().takeoffGroups.foldExistingTwin({ id: twin });
    expect(r.baseGroupId).not.toBe(twin);
    expect(r.twinKept).toBe(true);
    expect(await lineQty(bidId, twinLine)).toBe(0);
    const groups = (await caller().takeoffGroups.list({ bidId })).groups;
    expect(groups.map(g => g.label).sort()).toEqual([
      "Duplex receptacle",
      TWIN,
    ]);
  });

  it("Undo puts the marks back on the twin exactly as they were", async () => {
    const f = await sentPair();
    const before = await caller().bids.get({ id: f.bidId });
    const r = await caller().takeoffGroups.foldExistingTwin({ id: f.twin });
    // The screen's undo: the same two calls it makes.
    await caller().takeoffStamps.moveToGroup({
      ids: r.previous.map(m => m.id),
      groupId: f.twin,
    });
    await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids: r.previous
        .filter(m => m.status === null || m.status === "new")
        .map(m => m.id),
      status: null,
    });
    const after = await caller().bids.get({ id: f.bidId });
    expect(after.totals).toEqual(before.totals);
  });

  it("refuses a count that is not a twin", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const plain = await count(bidId, sheetId, "Duplex receptacle", 1, 3000);
    await expect(
      caller().takeoffGroups.foldExistingTwin({ id: plain })
    ).rejects.toThrow(/not an existing-to-remain count/);
  });
});

describe("the fold's decisions", () => {
  it("only a new mark becomes existing; a person's answer stays", () => {
    expect(foldedStatus(null)).toBe("existing");
    expect(foldedStatus("new")).toBe("existing");
    expect(foldedStatus("remove")).toBe("remove");
    expect(foldedStatus("relocate")).toBe("relocate");
    expect(foldedStatus("unconfirmed")).toBe("unconfirmed");
    expect(foldedStatus("existing")).toBe("existing");
  });

  it("finds the base by the legend's key, oldest first", () => {
    const plan = planTwinFold(
      { id: 9, label: "EXIT SIGN - Existing to remain", onLine: false },
      [
        { id: 7, label: "exit sign " },
        { id: 3, label: "Exit sign" },
        { id: 9, label: "EXIT SIGN - Existing to remain" },
      ]
    );
    expect(plan).toEqual({
      twinId: 9,
      baseLabel: "Exit sign",
      target: { kind: "group", id: 3 },
      keepTwin: false,
    });
  });

  it("says nothing about an ordinary line, and nothing about a remove line", () => {
    expect(
      twinLineFlags(
        [
          { id: 1, name: "Duplex receptacle", qty: "4", takeoffGroupId: 2 },
          {
            id: 2,
            name: `Remove ${TWIN}`,
            qty: "1",
            takeoffGroupId: 3,
            lineRole: "remove",
          },
        ],
        false
      )
    ).toEqual([]);
  });

  it("a twin added by hand is flagged for removal; a locked bid is flagged too", () => {
    expect(
      twinLineFlags(
        [{ id: 5, name: TWIN, qty: "2", takeoffGroupId: null }],
        true
      )
    ).toEqual([
      {
        lineId: 5,
        kind: "byHand",
        baseLabel: "Duplex receptacle",
        groupId: null,
        locked: true,
      },
    ]);
  });
});
