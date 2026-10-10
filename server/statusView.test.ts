/**
 * THE STATUS VIEW (status-and-scope-plan § 1a / 1b / 2a; owner answers § 8).
 *
 * Driven through the real routers. Four promises, each red without its half
 * of the change:
 *
 * 1. The bid's bar and the count cards read the SAME rows: the per-sheet
 *    split adds up to the cards' splits, sheet by sheet.
 * 2. A status change is an UNDO step: `setStatus` says what each mark was,
 *    and `restoreStatus` puts it back — `unconfirmed` included — with the
 *    bid's total back to the cent. Refused on a locked bid, which never moves.
 * 3. A sheet's demo / new tag is stored, cleared, and refused for another
 *    company's sheet — and moves NO number on the bid.
 * 4. Viewing never changes numbers: reading the list (which the bar reads)
 *    twice leaves the bid's total where it was.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfSheets,
  bidPdfs,
  bids,
  takeoffStamps,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import { sumSplits } from "../shared/markStatus";

const USER = 9417;
const OTHER = 9418;
dropFixtureUsersAfterAll([USER, OTHER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-status-view-${id}`, role: "user" },
  } as unknown as TrpcContext);
const caller = () => callerFor(USER);

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
        openId: `test-status-view-${id}`,
        name: "Status view fixture",
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

/** A bid with ONE plan of two sheets. */
async function bidWithTwoSheets() {
  const bid = (await caller().bids.create({
    name: `Status view ${Date.now()}${Math.random()}`,
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
  return { bidId: bid.id, pdfId: pdf.insertId, sheetA: a.id, sheetB: b.id };
}

async function drop(
  bidId: number,
  sheetId: number,
  groupId: number,
  n: number,
  y: number,
  status: "new" | "existing" | "remove" | "relocate" | null = null
) {
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: at(n, y),
    status,
  });
}

/**
 * Receptacles: sheet A has 4 new + 2 staying, sheet B has 3 new + 5 to
 * remove. Switches: sheet B, 2 new + 1 relocated. Receptacles sent at $10.
 */
async function fixture() {
  const f = await bidWithTwoSheets();
  const recep = await caller().takeoffGroups.create({
    bidId: f.bidId,
    label: "Duplex receptacle",
  });
  const sw = await caller().takeoffGroups.create({
    bidId: f.bidId,
    label: "Single pole switch",
  });
  await drop(f.bidId, f.sheetA, recep.id, 4, 3000);
  await drop(f.bidId, f.sheetA, recep.id, 2, 6000, "existing");
  await drop(f.bidId, f.sheetB, recep.id, 3, 3000);
  await drop(f.bidId, f.sheetB, recep.id, 5, 6000, "remove");
  await drop(f.bidId, f.sheetB, sw.id, 2, 9000);
  await drop(f.bidId, f.sheetB, sw.id, 1, 12000, "relocate");
  const sent = await caller().takeoffGroups.sendToBid({ id: recep.id });
  await caller().bids.updateLine({
    bidId: f.bidId,
    id: sent.lineId,
    materialCost: 10,
  });
  return { ...f, recep: recep.id, sw: sw.id, line: sent.lineId };
}

const total = async (bidId: number) =>
  (await caller().bids.get({ id: bidId })).totals.materialCost;

async function idsOn(sheetId: number, status: string | null) {
  const database = await getDb();
  const rows = await database!
    .select({ id: takeoffStamps.id, status: takeoffStamps.status })
    .from(takeoffStamps)
    .where(eq(takeoffStamps.sheetId, sheetId));
  return rows.filter(r => r.status === status).map(r => r.id);
}

describe.skipIf(!hasDb)("the bid's status bar", () => {
  it("splits every mark by sheet, from the same rows the count cards read", async () => {
    const f = await fixture();
    const list = await caller().takeoffGroups.list({ bidId: f.bidId });
    const bySheet = new Map(list.statusBySheet.map(s => [s.sheetId, s.split]));
    expect(bySheet.get(f.sheetA)).toEqual({
      new: 4,
      existing: 2,
      remove: 0,
      relocate: 0,
      unconfirmed: 0,
    });
    expect(bySheet.get(f.sheetB)).toEqual({
      new: 5,
      existing: 0,
      remove: 5,
      relocate: 1,
      unconfirmed: 0,
    });
    // The bar's total is the cards' splits added up — and the sheets agree.
    const cards = sumSplits(list.groups.map(g => g.split));
    expect(sumSplits(list.statusBySheet.map(s => s.split))).toEqual(cards);
    expect(cards).toEqual({
      new: 9,
      existing: 2,
      remove: 5,
      relocate: 1,
      unconfirmed: 0,
    });
  });

  it("finds a sheet by its row in the jump list", async () => {
    const f = await fixture();
    const jump = await caller().bidPdfs.sheetJumpList({ bidId: f.bidId });
    expect(jump.map(j => j.sheetId)).toEqual([f.sheetA, f.sheetB]);
  });

  it("is a view: reading it moves no number", async () => {
    const f = await fixture();
    const before = await caller().bids.get({ id: f.bidId });
    expect(before.totals.materialCost).toBe(70); // 7 new receptacles × $10
    await caller().takeoffGroups.list({ bidId: f.bidId });
    await caller().takeoffGroups.list({ bidId: f.bidId });
    const after = await caller().bids.get({ id: f.bidId });
    expect(after.totals).toEqual(before.totals);
  });
});

describe.skipIf(!hasDb)("a status change is an Undo step", () => {
  it("says what each mark was, and restoreStatus puts it back to the cent", async () => {
    const f = await fixture();
    expect(await total(f.bidId)).toBe(70);

    // "Make them Remove": sheet B's 3 new receptacles.
    const newOnB = await idsOn(f.sheetB, null);
    const recepNewOnB = (
      await caller().takeoffStamps.listForSheet({ sheetId: f.sheetB })
    )
      .filter(s => s.groupId === f.recep && newOnB.includes(s.id))
      .map(s => s.id);
    expect(recepNewOnB).toHaveLength(3);
    const set = await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids: recepNewOnB,
      status: "remove",
    });
    expect(set.updated).toBe(3);
    expect(set.previous).toEqual([{ status: null, ids: recepNewOnB }]);
    expect(await total(f.bidId)).toBe(40); // the 3 stop pricing as new

    // Undo.
    const undo = await caller().takeoffStamps.restoreStatus({
      bidId: f.bidId,
      sets: set.previous,
    });
    expect(undo.updated).toBe(3);
    expect(await total(f.bidId)).toBe(70);
    expect((await idsOn(f.sheetB, null)).sort()).toEqual(newOnB.sort());
    // Its own redo: it says what it overwrote.
    expect(undo.previous).toEqual([{ status: "remove", ids: recepNewOnB }]);
  });

  it("puts back a mixed selection, unconfirmed included", async () => {
    const f = await fixture();
    const database = await getDb();
    const staying = await idsOn(f.sheetA, "existing");
    // One mark the reader left unconfirmed — no person can choose that.
    await database!
      .update(takeoffStamps)
      .set({ status: "unconfirmed" })
      .where(eq(takeoffStamps.id, staying[0]));
    const fresh = (await idsOn(f.sheetA, null)).slice(0, 1);
    const ids = [staying[0], staying[1], fresh[0]];

    const set = await caller().takeoffStamps.setStatus({
      bidId: f.bidId,
      ids,
      status: "new",
    });
    const before = new Map(
      set.previous.flatMap(p => p.ids.map(id => [id, p.status] as const))
    );
    expect(before.get(staying[0])).toBe("unconfirmed");
    expect(before.get(staying[1])).toBe("existing");
    expect(before.get(fresh[0])).toBe(null);

    await caller().takeoffStamps.restoreStatus({
      bidId: f.bidId,
      sets: set.previous,
    });
    const rows = await database!
      .select({ id: takeoffStamps.id, status: takeoffStamps.status })
      .from(takeoffStamps)
      .where(inArray(takeoffStamps.id, ids));
    expect(new Map(rows.map(r => [r.id, r.status]))).toEqual(before);
  });

  it("is refused on a locked bid, which never moves", async () => {
    const f = await fixture();
    const ids = await idsOn(f.sheetB, "remove");
    await caller().bids.lockQuantities({ bidId: f.bidId });
    const before = await caller().bids.get({ id: f.bidId });
    await expect(
      caller().takeoffStamps.restoreStatus({
        bidId: f.bidId,
        sets: [{ status: null, ids }],
      })
    ).rejects.toThrow(/locked/);
    await expect(
      caller().takeoffStamps.setStatus({ bidId: f.bidId, ids, status: "new" })
    ).rejects.toThrow(/locked/);
    expect((await caller().bids.get({ id: f.bidId })).totals).toEqual(
      before.totals
    );
    expect((await idsOn(f.sheetB, "remove")).sort()).toEqual(ids.sort());
  });

  it("cannot reach another company's marks", async () => {
    const f = await fixture();
    const ids = await idsOn(f.sheetB, "remove");
    await expect(
      callerFor(OTHER).takeoffStamps.restoreStatus({
        bidId: f.bidId,
        sets: [{ status: null, ids }],
      })
    ).rejects.toThrow();
    expect((await idsOn(f.sheetB, "remove")).sort()).toEqual(ids.sort());
  });
});

describe.skipIf(!hasDb)("a sheet's demo / new work tag", () => {
  it("is stored, read back on the sheet, and cleared", async () => {
    const f = await fixture();
    const tagged = await caller().bidPdfs.setSheetWorkTag({
      id: f.sheetB,
      workTag: "demo",
    });
    expect(tagged.workTag).toBe("demo");
    const sheets = await caller().bidPdfs.sheets({ bidPdfId: f.pdfId });
    expect(sheets.map(s => s.workTag)).toEqual([null, "demo"]);
    await caller().bidPdfs.setSheetWorkTag({ id: f.sheetB, workTag: null });
    expect(
      (await caller().bidPdfs.sheets({ bidPdfId: f.pdfId })).map(s => s.workTag)
    ).toEqual([null, null]);
  });

  it("moves no number on the bid, and no mark's status", async () => {
    const f = await fixture();
    const before = await caller().bids.get({ id: f.bidId });
    const marksBefore = await caller().takeoffStamps.listForSheet({
      sheetId: f.sheetB,
    });
    await caller().bidPdfs.setSheetWorkTag({ id: f.sheetB, workTag: "demo" });
    await caller().bidPdfs.setSheetWorkTag({ id: f.sheetA, workTag: "both" });
    expect((await caller().bids.get({ id: f.bidId })).totals).toEqual(
      before.totals
    );
    const marksAfter = await caller().takeoffStamps.listForSheet({
      sheetId: f.sheetB,
    });
    expect(marksAfter.map(m => [m.id, m.status])).toEqual(
      marksBefore.map(m => [m.id, m.status])
    );
  });

  it("refuses another company's sheet", async () => {
    const f = await fixture();
    await expect(
      callerFor(OTHER).bidPdfs.setSheetWorkTag({
        id: f.sheetA,
        workTag: "demo",
      })
    ).rejects.toThrow(/not found/i);
    // Read the row directly, so the check does not go through the code under test.
    const database = await getDb();
    const [row] = await database!
      .select({ workTag: bidPdfSheets.workTag })
      .from(bidPdfSheets)
      .where(eq(bidPdfSheets.id, f.sheetA));
    expect(row.workTag).toBeNull();
  });
});
