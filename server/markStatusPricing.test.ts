/**
 * AN EXISTING-TO-REMAIN MARK NEVER PRICES AS NEW (shared/markStatus.ts; pin
 * plan § 7; migration 0098's `takeoff_stamps.status`).
 *
 * Driven through the real routers, because the rule has to hold at every
 * place a mark becomes a number, and those are four different pieces of code
 * (found by an audit, 2026-10-05): the SQL behind a bid line's live quantity
 * and "Send N", the SQL behind the count list, the per-mark drops, and the
 * pure `groupStamps` behind the supplier list and the export. One fixture —
 * five new receptacles and three existing — is read through each of them.
 *
 * Red on the code before the status rule: every reading below said 8.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  bidPdfs,
  bids,
  materials,
  symbolLinks,
  takeoffHeightDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9402;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-mark-status-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing)
    await database!.insert(users).values({
      id: USER,
      openId: `test-mark-status-${USER}`,
      name: "Mark status fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!.delete(bids).where(inArray(bids.userId, [USER]));
  await database!.delete(symbolLinks).where(eq(symbolLinks.userId, USER));
  await database!.delete(assemblies).where(eq(assemblies.userId, USER));
  await database!
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database!.delete(materials).where(eq(materials.userId, USER));
  await database!
    .delete(takeoffHeightDefaults)
    .where(eq(takeoffHeightDefaults.userId, USER));
});

async function bidWithSheet() {
  const bid = (await caller().bids.create({
    name: `Status ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

const at = (n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ x: 3000 + i * 400, y }));

/**
 * "Duplex receptacle": 5 NEW marks and 3 EXISTING ones — the existing ones
 * placed as existing, the way a run of them is counted.
 */
async function fiveNewThreeExisting(bidId: number, sheetId: number) {
  const group = await caller().takeoffGroups.create({
    bidId,
    label: "Duplex receptacle",
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: at(5, 3000),
  });
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId: group.id,
    at: at(3, 6000),
    status: "existing",
  });
  return group.id;
}

const marksOn = (sheetId: number) =>
  caller().takeoffStamps.listForSheet({ sheetId });

describe.skipIf(!hasDb)("an existing mark is never priced as new", () => {
  it("the count says 5, and says the 3 existing in words", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const id = await fiveNewThreeExisting(bidId, sheetId);
    const row = (await caller().takeoffGroups.list({ bidId })).groups.find(
      g => g.id === id
    )!;
    expect(row.count).toBe(5);
    expect(row.split).toEqual({
      new: 5,
      existing: 3,
      remove: 0,
      relocate: 0,
      unconfirmed: 0,
    });
    // All eight are on the drawing, with their status.
    const marks = await marksOn(sheetId);
    expect(marks).toHaveLength(8);
    expect(marks.filter(m => m.status === "existing")).toHaveLength(3);
  });

  it("Send puts 5 on the bid, priced at 5", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const id = await fiveNewThreeExisting(bidId, sheetId);
    const sent = await caller().takeoffGroups.sendToBid({ id });
    expect(sent.count).toBe(5);
    await caller().bids.updateLine({
      bidId,
      id: sent.lineId,
      materialCost: 10,
    });
    const bid = await caller().bids.get({ id: bidId });
    expect(Number(bid.lines[0].qty)).toBe(5);
    expect(bid.totals.materialCost).toBe(50);
  });

  it("re-prices live when a mark's status changes — both ways", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    const id = await fiveNewThreeExisting(bidId, sheetId);
    const sent = await caller().takeoffGroups.sendToBid({ id });
    await caller().bids.updateLine({
      bidId,
      id: sent.lineId,
      materialCost: 10,
    });

    const newOnes = (await marksOn(sheetId)).filter(m => m.status === null);
    const { updated } = await caller().takeoffStamps.setStatus({
      bidId,
      ids: [newOnes[0].id, newOnes[1].id],
      status: "existing",
    });
    expect(updated).toBe(2);
    let bid = await caller().bids.get({ id: bidId });
    expect(Number(bid.lines[0].qty)).toBe(3);

    // Remove and relocate are not priced as new either (labour, owner's call).
    await caller().takeoffStamps.setStatus({
      bidId,
      ids: [newOnes[2].id],
      status: "remove",
    });
    await caller().takeoffStamps.setStatus({
      bidId,
      ids: [newOnes[3].id],
      status: "relocate",
    });
    bid = await caller().bids.get({ id: bidId });
    expect(Number(bid.lines[0].qty)).toBe(1);

    // And back: "new" is stored as NULL, and is priced again.
    await caller().takeoffStamps.setStatus({
      bidId,
      ids: newOnes.slice(0, 4).map(m => m.id),
      status: "new",
    });
    bid = await caller().bids.get({ id: bidId });
    expect(Number(bid.lines[0].qty)).toBe(5);
    expect(
      (await marksOn(sheetId)).filter(m => m.status === null)
    ).toHaveLength(5);
  });

  it("the supplier's list and the takeoff export say 5", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    await fiveNewThreeExisting(bidId, sheetId);
    const doc = await caller().materialsList.get({ bidId });
    expect(doc.forQuote).toEqual([
      { name: "Duplex receptacle", qty: 5, unit: "each" },
    ]);
    const exported = await caller().takeoffExport.get({ bidId });
    const counts = exported.wholeBid.filter(r => r.kind === "Count");
    expect(counts.map(r => [r.item, r.quantity])).toEqual([
      ["Duplex receptacle", 5],
    ]);
  });

  it("buys a drop for the 5 new devices, not for the existing 3", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    await caller().takeoffHeights.setCompanyDistribution({ inches: 120 });
    const id = await fiveNewThreeExisting(bidId, sheetId);
    const type = await caller().takeoffRunTypes.create({
      label: `Status EMT ${Math.random()}`,
      pathType: "conduit",
    });
    await caller().takeoffGroups.setDrop({
      id,
      dropKind: "receptacle",
      dropRunTypeId: type.id,
    });
    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.markDropCount).toBe(5);
  });

  it("is refused on a locked bid, which must not move", async () => {
    const { bidId, sheetId } = await bidWithSheet();
    await fiveNewThreeExisting(bidId, sheetId);
    await caller().bids.lockQuantities({ bidId });
    const [mark] = await marksOn(sheetId);
    await expect(
      caller().takeoffStamps.setStatus({
        bidId,
        ids: [mark.id],
        status: "existing",
      })
    ).rejects.toThrow(/locked/i);
  });

  it("changes nothing on another bid, whatever ids it is handed", async () => {
    const a = await bidWithSheet();
    const b = await bidWithSheet();
    await fiveNewThreeExisting(a.bidId, a.sheetId);
    const marksA = await marksOn(a.sheetId);
    const { updated } = await caller().takeoffStamps.setStatus({
      bidId: b.bidId,
      ids: marksA.map(m => m.id),
      status: "remove",
    });
    expect(updated).toBe(0);
    expect(
      (await marksOn(a.sheetId)).filter(m => m.status === "remove")
    ).toHaveLength(0);
  });
});

describe.skipIf(!hasDb)("a count's chosen pin look", () => {
  it("saves on this job, and NULL goes back to automatic", async () => {
    const { bidId } = await bidWithSheet();
    const group = await caller().takeoffGroups.create({
      bidId,
      label: "Kitchen",
    });
    await caller().takeoffGroups.setLook({
      id: group.id,
      shape: "hexagon",
      letter: " k2 ",
      color: "#F472B6",
    });
    let row = (await caller().takeoffGroups.list({ bidId })).groups[0];
    expect(row.look).toEqual({
      shape: "hexagon",
      letter: "K2",
      color: "#F472B6",
    });
    // Omitted leaves a field; null clears it.
    await caller().takeoffGroups.setLook({ id: group.id, letter: null });
    row = (await caller().takeoffGroups.list({ bidId })).groups[0];
    expect(row.look).toEqual({
      shape: "hexagon",
      letter: null,
      color: "#F472B6",
    });
  });

  it("refuses a colour the palette does not hold, rather than storing it", async () => {
    const { bidId } = await bidWithSheet();
    const group = await caller().takeoffGroups.create({ bidId, label: "X" });
    await expect(
      caller().takeoffGroups.setLook({ id: group.id, color: "#123456" })
    ).rejects.toThrow(/six pin colors/);
  });

  it("'every job' on a typed count says why there is nowhere to keep it", async () => {
    const { bidId } = await bidWithSheet();
    const group = await caller().takeoffGroups.create({
      bidId,
      label: "Typed thing",
    });
    await expect(
      caller().takeoffGroups.setLook({
        id: group.id,
        where: "everyJob",
        shape: "square",
      })
    ).rejects.toThrow(/typed by name/);
  });

  it("'every job' lands on the legend symbol and clears the count's own", async () => {
    const { bidId } = await bidWithSheet();
    const database = await getDb();
    await database!.insert(symbolLinks).values({
      userId: USER,
      label: "LINEAR TYPE",
      lookupKey: "linear type",
    });
    const group = await caller().takeoffGroups.create({
      bidId,
      label: "Linear type",
    });
    await caller().takeoffGroups.setLook({ id: group.id, shape: "rect" });
    const saved = await caller().takeoffGroups.setLook({
      id: group.id,
      where: "everyJob",
      letter: "LT",
    });
    expect(saved.savedOn).toBe("symbol");
    const [symbol] = await database!
      .select()
      .from(symbolLinks)
      .where(eq(symbolLinks.userId, USER));
    expect(symbol.markLetter).toBe("LT");
    const row = (await caller().takeoffGroups.list({ bidId })).groups[0];
    expect(row.look).toEqual({ shape: null, letter: null, color: null });
  });
});
