/**
 * The bridge, end to end: a count on a drawing becoming money on a bid.
 *
 * ── What carries the risk here, and so what these pin ────────────────────────
 *   • **The quantity must follow the marks, for ever.** Not once at the moment
 *     of sending. Mark two more and the line moves; remove every mark and it
 *     reads 0 and stays. A number that stopped following would be a bid quietly
 *     disagreeing with the drawing it came from.
 *   • **The price must NOT follow anything.** R4. Moving a material's cost after
 *     the line exists must leave the bid exactly where it was, or the snapshot
 *     boundary this whole app rests on has a hole in it.
 *   • **Nothing may be counted twice.** R3, listed Missing since 2026-09-14:
 *     not two lines for one count, and not the same parts arriving on a
 *     supplier's list down both paths at once.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  takeoffGroups,
  assemblies,
  assemblyMaterials,
  bidPdfs,
  bids,
  laborRates,
  materials,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 8621;

const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-bridge-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/**
 * An assembly priced by this file and nothing else.
 *
 * CLAUDE.md § Starter content: a test that borrows a shipped price is really
 * asserting the seed has not changed. Every number these tests assert traces
 * back to this function.
 */
async function ownAssembly(name: string, costPerUnit: number, hours: number) {
  const database = await getDb();
  const [material] = await database!.insert(materials).values({
    userId: USER,
    name: `${name} material`,
    unitOfSale: "each",
    costPerUnit: costPerUnit.toFixed(4),
  });
  const [rate] = await database!.insert(laborRates).values({
    userId: USER,
    name: `${name} role`,
    hourlyCost: "70.0000",
  });
  const [assembly] = await database!.insert(assemblies).values({
    userId: USER,
    name,
    baseLaborHours: hours.toFixed(4),
    laborRateId: rate.insertId,
  });
  await database!.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return { assemblyId: assembly.insertId, materialId: material.insertId };
}

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Bridge test ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
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
  await caller().bidPdfs.setSheetScale({
    id: sheets[0].id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheets[0].id };
}

/** Arm a count against an assembly and mark it `times` times. */
async function countOf(
  bidId: number,
  sheetId: number,
  assemblyId: number,
  times: number
) {
  const group = await caller().takeoffGroups.forAssembly({
    bidId,
    assemblyId,
  });
  if (times > 0) {
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: Array.from({ length: times }, (_, i) => ({ x: i + 1, y: i + 1 })),
    });
  }
  return group;
}

const lineFor = async (bidId: number) =>
  (await caller().bids.get({ id: bidId })).lines;

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-bridge-${USER}`,
      name: "Bridge test user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
});

withDb("sending a count to the bid", () => {
  it("creates ONE line, named by the count, at the marked quantity", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 14);

    const sent = await caller().takeoffGroups.sendToBid({ id: group.id });
    expect(sent.count).toBe(14);
    expect(sent.warning).toBeNull();

    const lines = await lineFor(bidId);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe("Exit sign LED");
    expect(Number(lines[0].qty)).toBe(14);
    // 14 × $38. The price is this file's, not the seed's.
    expect(Number(lines[0].snapshotMaterialCost)).toBe(38);
    expect(lines[0].takeoffGroupId).toBe(group.id);
  });

  it("refuses to send the same count twice", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 14);

    await caller().takeoffGroups.sendToBid({ id: group.id });
    await expect(
      caller().takeoffGroups.sendToBid({ id: group.id })
    ).rejects.toThrow(/already on the bid/i);

    expect(await lineFor(bidId)).toHaveLength(1);
  });

  it("never lets a level 1 count cross, and says what to do instead", async () => {
    const { bidId, sheetId } = await scenario();
    const group = await caller().takeoffGroups.create({
      bidId,
      label: "Exit signs",
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: [{ x: 1, y: 1 }],
    });

    await expect(
      caller().takeoffGroups.sendToBid({ id: group.id })
    ).rejects.toThrow(/no price behind it/i);
    expect(await lineFor(bidId)).toHaveLength(0);
  });

  it("refuses a count with no marks, naming that rather than the price", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 0);

    await expect(
      caller().takeoffGroups.sendToBid({ id: group.id })
    ).rejects.toThrow(/Nothing is marked/i);
  });
});

withDb("the plans own what it is and how many", () => {
  it("moves the line when more marks are placed — with nothing pressed", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    expect(Number((await lineFor(bidId))[0].qty)).toBe(14);

    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: group.id,
      at: [
        { x: 90, y: 90 },
        { x: 91, y: 91 },
      ],
    });

    const after = await lineFor(bidId);
    expect(Number(after[0].qty)).toBe(16);
    // And the money follows the count, because only the count moved.
    expect(Number(after[0].snapshotMaterialCost)).toBe(38);
  });

  it("reads 0 and KEEPS the line when every mark is removed", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 3);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    const marks = await caller().takeoffStamps.listForSheet({ sheetId });
    for (const mark of marks) {
      await caller().takeoffStamps.remove({ id: mark.id });
    }

    const after = await lineFor(bidId);
    // Money disappearing off a bid because somebody undid a click, with nothing
    // on screen saying so, is the worse failure. The line stays and reads 0.
    expect(after).toHaveLength(1);
    expect(Number(after[0].qty)).toBe(0);
  });

  it("renames the line when the count is renamed", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 4);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    await caller().takeoffGroups.rename({
      id: group.id,
      label: "Exit signs — stairwell",
    });

    expect((await lineFor(bidId))[0].name).toBe("Exit signs — stairwell");
  });
});

withDb("the bid owns what it costs", () => {
  it("does NOT re-price when the material's cost moves afterwards — R4", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId, materialId } = await ownAssembly(
      "Exit sign LED",
      38,
      0.5
    );
    const group = await countOf(bidId, sheetId, assemblyId, 10);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    const database = await getDb();
    await database!
      .update(materials)
      .set({ costPerUnit: "99.0000" })
      .where(eq(materials.id, materialId));

    const after = await lineFor(bidId);
    // The whole snapshot boundary in one assertion. If this ever reads 99, the
    // freeze is broken for every bid in the app, not only for this one.
    expect(Number(after[0].snapshotMaterialCost)).toBe(38);
  });

  it("refuses a typed quantity, and points at the screen that changes it", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    const line = (await lineFor(bidId))[0];

    await expect(
      caller().bids.updateLine({ bidId, id: line.id, qty: 20 })
    ).rejects.toThrow(/Plans screen/i);

    expect(Number((await lineFor(bidId))[0].qty)).toBe(14);
  });

  it("refuses a typed name rather than accepting one it would then drop", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 2);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    const line = (await lineFor(bidId))[0];

    await expect(
      caller().bids.updateLine({ bidId, id: line.id, name: "Something else" })
    ).rejects.toThrow(/Rename that count/i);
  });

  it("leaves a hand-added line completely alone", async () => {
    const { bidId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 6 });
    const line = (await lineFor(bidId))[0];

    expect(line.takeoffGroupId).toBeNull();
    await caller().bids.updateLine({ bidId, id: line.id, qty: 9 });
    expect(Number((await lineFor(bidId))[0].qty)).toBe(9);
  });
});

withDb("R3 — nothing reaches the bid twice", () => {
  it("warns at the moment of sending when a hand-added line already exists", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Duplex receptacle", 4, 0.3);
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 6 });
    const group = await countOf(bidId, sheetId, assemblyId, 20);

    const sent = await caller().takeoffGroups.sendToBid({ id: group.id });
    expect(sent.warning).toMatch(/added by hand/i);
    // It WARNS, it does not refuse: a second line may be exactly right.
    expect(await lineFor(bidId)).toHaveLength(2);
  });

  it("keeps saying so when the hand-added line arrives AFTER the send", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Duplex receptacle", 4, 0.3);
    const group = await countOf(bidId, sheetId, assemblyId, 20);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    const clean = await caller().bids.get({ id: bidId });
    expect(clean.fromPlans.doubleCounted).toEqual([]);

    // The half a one-time warning cannot cover.
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 6 });
    const after = await caller().bids.get({ id: bidId });
    expect(after.fromPlans.doubleCounted).toEqual(["Duplex receptacle"]);
  });

  it("does not send the same parts to a supplier down both paths", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 14);

    const before = await caller().materialsList.get({ bidId });
    const beforeQty = before.entries[0]?.qty;
    expect(beforeQty).toBe(14);

    await caller().takeoffGroups.sendToBid({ id: group.id });

    const after = await caller().materialsList.get({ bidId });
    // 14, not 28. Before the bridge these two sources could not overlap; now
    // they overlap exactly, and the marks defer to the line.
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0].qty).toBe(14);
  });
});

withDb("removing things", () => {
  it("refuses to delete a count that is on the bid, and names the way through", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 5);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    await expect(
      caller().takeoffGroups.remove({ id: group.id })
    ).rejects.toThrow(/on the bid as a line/i);

    // Neither the marks nor the money went anywhere.
    expect(await lineFor(bidId)).toHaveLength(1);
    expect(
      (await caller().takeoffStamps.listForSheet({ sheetId })).length
    ).toBe(5);
  });

  it("lets the count go once its line is removed, and it can be sent again", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    const group = await countOf(bidId, sheetId, assemblyId, 5);
    await caller().takeoffGroups.sendToBid({ id: group.id });

    const line = (await lineFor(bidId))[0];
    await caller().bids.removeLine({ bidId, id: line.id });

    // The clean undo: it is waiting again rather than stranded.
    const listed = await caller().takeoffGroups.list({ bidId });
    expect(listed.waitingToSend).toBe(1);

    const resent = await caller().takeoffGroups.sendToBid({ id: group.id });
    expect(resent.count).toBe(5);

    await caller().bids.removeLine({
      bidId,
      id: (await lineFor(bidId))[0].id,
    });
    await expect(
      caller().takeoffGroups.remove({ id: group.id })
    ).resolves.toMatchObject({ removed: 5 });
  });
});

withDb("what the screens are told", () => {
  it("counts only work the estimator can act on as waiting", async () => {
    const { bidId, sheetId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    await countOf(bidId, sheetId, assemblyId, 14);
    // A level 1 count: waiting for a price, not waiting to be sent.
    const plain = await caller().takeoffGroups.create({
      bidId,
      label: "Something nobody has priced",
    });
    await caller().takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: plain.id,
      at: [{ x: 5, y: 5 }],
    });

    const listed = await caller().takeoffGroups.list({ bidId });
    expect(listed.waitingToSend).toBe(1);

    const bid = await caller().bids.get({ id: bidId });
    expect(bid.fromPlans.waitingToSend).toBe(1);
    expect(bid.fromPlans.countedWithNoPrice).toBe(1);
  });

  it("says nothing at all about a bid with no takeoff on it", async () => {
    const { bidId } = await scenario();
    const { assemblyId } = await ownAssembly("Exit sign LED", 38, 0.5);
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 6 });

    const bid = await caller().bids.get({ id: bidId });
    expect(bid.fromPlans).toEqual({
      waitingToSend: 0,
      countedWithNoPrice: 0,
      doubleCounted: [],
    });
  });
});

withDb("a count follows YOUR fork of a shipped assembly", () => {
  it("SNAPSHOTS THE FORK'S NUMBERS, not the starter's $0", async () => {
    /*
      ── The fifth instance of the fork bug, and the money one ────────────────
      Counting is done with whatever is in the library, which for a new user is
      a shipped assembly at $0. Pricing that assembly FORKS it — a new row, a
      new id — and the counted group still stores the baseline's id.

      `addCountToBid` read that id literally, so sending the count froze the
      SHIPPED row's $0 onto the bid line. A snapshot is never re-priced, so the
      bid stayed wrong permanently, and nothing on screen said so.

      Found by server/forkableReferences.test.ts on 2026-09-21 rather than by
      somebody pricing a job, which is the whole point of that file.
    */
    const { bidId, sheetId } = await scenario();
    const database = await getDb();

    // A "shipped" assembly: userId NULL, priced at nothing, like every starter.
    const [shipped] = await database!.insert(assemblies).values({
      userId: null,
      name: `Fork flow starter ${Date.now()}`,
      category: "Devices",
      baseLaborHours: "0.5000",
      overheadLaborHours: "0.0000",
    });
    const baselineId = shipped.insertId;

    // Count with it FIRST, the way a real user does.
    const group = await countOf(bidId, sheetId, baselineId, 10);

    // Now price it. Editing a shipped row forks it.
    const forked = await caller().assemblies.update({
      id: baselineId,
      baseLaborHours: 1.25,
    });
    expect(forked!.id).not.toBe(baselineId);

    // The group still points at the baseline — that is the whole situation.
    const [stored] = await database!
      .select({ assemblyId: takeoffGroups.assemblyId })
      .from(takeoffGroups)
      .where(eq(takeoffGroups.id, group.id));
    expect(stored.assemblyId).toBe(baselineId);

    await caller().takeoffGroups.sendToBid({ id: group.id });
    const lines = await lineFor(bidId);
    expect(lines).toHaveLength(1);
    // 1.25 h is the fork's. 0.5 h is the starter's, and is what shipped before.
    expect(Number(lines[0].snapshotLaborHours)).toBe(1.25);

    await database!.delete(assemblies).where(eq(assemblies.id, baselineId));
  });
});
