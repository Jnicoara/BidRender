/**
 * THE QUANTITY LOCK: a bid that has been sent stops following the drawing.
 *
 * ── What carries the risk, and so what these pin ─────────────────────────────
 *   • **A locked bid must not move.** Not when marks are placed, not when runs
 *     are traced, not when a total is re-read an hour later. A number behind a
 *     price somebody has already quoted changing quietly is the worst failure
 *     this app has.
 *   • **An UNLOCKED bid must still move.** The lock is a third state of one
 *     column, and the way that goes wrong is by leaking: a check written in the
 *     wrong place freezes every bid, and a frozen draft looks exactly like a
 *     working one until somebody counts fourteen receptacles and the total does
 *     not budge. So every case here has an unlocked bid beside the locked one.
 *   • **The money must follow the frozen quantity, not the drawing.** A screen
 *     showing 14 while the total prices 16 is worse than either number alone.
 *   • **Unlocking must be able to NAME what it will change**, because that is
 *     the whole content of the confirmation in front of it.
 *
 * ── Where the prices are in all this: nowhere ────────────────────────────────
 * They froze per line at add time (R4) and nothing here touches them. The pure
 * tests below assert that every sentence this feature shows says so, because the
 * cheap misunderstanding is an estimator unlocking a bid expecting fresh costs.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bidPdfs,
  bids,
  laborRates,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  followsDrawing,
  lockedBannerCopy,
  quantitySource,
  quantityText,
  typedQuantityRefusal,
  unlockChanges,
  unlockConfirmCopy,
  unlockedNoticeCopy,
} from "../shared/quantityLock";

// ── The decisions, with no database in the way ───────────────────────────────

const counted = { takeoffGroupId: 7, takeoffRunTypeId: null };
const traced = { takeoffGroupId: null, takeoffRunTypeId: 3 };
const byHand = { takeoffGroupId: null, takeoffRunTypeId: null };
const LOCKED_AT = new Date("2026-09-24T18:00:00Z");

describe("where a line's quantity comes from", () => {
  it("is the drawing for a count and for traced footage, while unlocked", () => {
    expect(quantitySource(counted, null)).toBe("drawing");
    expect(quantitySource(traced, null)).toBe("drawing");
  });

  it("is the stored number for both of them once the bid is locked", () => {
    expect(quantitySource(counted, LOCKED_AT)).toBe("locked");
    expect(quantitySource(traced, LOCKED_AT)).toBe("locked");
  });

  it("is TYPED for a hand-added line, locked or not — the lock is not about it", () => {
    expect(quantitySource(byHand, null)).toBe("typed");
    expect(quantitySource(byHand, LOCKED_AT)).toBe("typed");
    expect(followsDrawing(byHand)).toBe(false);
  });
});

describe("what unlocking would change", () => {
  const line = (over: Partial<Parameters<typeof unlockChanges>[0][0]>) => ({
    id: 1,
    name: "Exit sign LED",
    takeoffGroupId: 7,
    takeoffRunTypeId: null,
    lockedQty: 14,
    drawingQty: 14,
    ...over,
  });

  it("names the line and both numbers", () => {
    expect(unlockChanges([line({ drawingQty: 16 })])).toEqual([
      { lineId: 1, name: "Exit sign LED", from: 14, to: 16 },
    ]);
  });

  it("says nothing about a line the drawing agrees with", () => {
    expect(unlockChanges([line({})])).toEqual([]);
  });

  it("ignores a hand-added line, which no unlock can reach", () => {
    expect(
      unlockChanges([
        line({ takeoffGroupId: null, drawingQty: 999, lockedQty: 6 }),
      ])
    ).toEqual([]);
  });

  it("does not report a float tail as a change — the column holds four places", () => {
    expect(
      unlockChanges([line({ lockedQty: 125.01, drawingQty: 125.010000001 })])
    ).toEqual([]);
  });

  it("reports measured footage, which moves in fractions", () => {
    const changes = unlockChanges([
      line({ name: '1/2" EMT', lockedQty: 125.01, drawingQty: 250.02 }),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBe(125.01);
    expect(changes[0].to).toBe(250.02);
  });
});

describe("the words, which are the feature as much as the column is", () => {
  it("prints a quantity without the four decimals the column carries", () => {
    expect(quantityText(14)).toBe("14");
    expect(quantityText(125.01)).toBe("125.01");
  });

  /*
    THE ONE MISREADING THAT COSTS MONEY.

    An estimator who believes the lock is what froze their prices will unlock a
    bid expecting today's material costs, and get last month's — because the
    snapshot on each line never moved and never will. Every surface says so, and
    these assertions are why it cannot be quietly dropped by an edit for
    brevity.
  */
  it("says prices were frozen separately, on every surface", () => {
    expect(lockedBannerCopy(LOCKED_AT, 7).body).toMatch(/[Pp]rices/);
    expect(lockedBannerCopy(LOCKED_AT, 7).body).toMatch(/already frozen/);
    expect(unlockConfirmCopy([]).body).toMatch(/prices on every line stay/i);
    expect(
      unlockConfirmCopy([{ lineId: 1, name: "x", from: 1, to: 2 }]).body
    ).toMatch(/prices on every line stay/i);
  });

  it("dates the banner and counts what it is holding", () => {
    const copy = lockedBannerCopy(LOCKED_AT, 7);
    expect(copy.title).toMatch(/Sep 24, 2026/);
    expect(copy.body).toMatch(/7 lines/);
  });

  it("says what a lock would hold, before there is one", () => {
    expect(unlockedNoticeCopy(1)).toMatch(/1 line on this bid follows/);
    expect(unlockedNoticeCopy(4)).toMatch(/4 lines on this bid follow /);
  });

  it("lists every change by name, so the answer is to a fact", () => {
    const copy = unlockConfirmCopy([
      { lineId: 1, name: "Exit sign LED", from: 14, to: 16 },
      { lineId: 2, name: '1/2" EMT', from: 125.01, to: 250.02 },
    ]);
    expect(copy.changeLines).toEqual([
      "Exit sign LED: 14 → 16",
      '1/2" EMT: 125.01 → 250.02',
    ]);
  });

  it("still confirms when nothing would move, and says that instead", () => {
    const copy = unlockConfirmCopy([]);
    expect(copy.title).toBeTruthy();
    expect(copy.changeLines).toEqual([]);
    expect(copy.body).toMatch(/No quantity moves right now/);
  });

  /*
    A REFUSAL DESCRIBING THE OLD BEHAVIOUR IS WORSE THAN NO REFUSAL.

    "Change it by marking on the Plans screen" is the right answer on a
    following line and a lie on a frozen one — marking is exactly what will not
    change it. The absence of the word is the assertion.
  */
  it("does not send somebody to the Plans screen for a locked quantity", () => {
    const locked = typedQuantityRefusal("locked", 14);
    expect(locked).toMatch(/locked/i);
    expect(locked).toMatch(/Unlock the bid/);
    expect(locked).not.toMatch(/mark/i);

    const following = typedQuantityRefusal("drawing", 14);
    expect(following).toMatch(/marking or unmarking/);
    expect(following).toMatch(/14/);
  });
});

// ── And the same thing through the routers, against a real database ──────────

const USER = 8677;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-qty-lock-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A 100 ft straight run at 1/4" = 1'-0", in page points. See runToBidWire. */
const SCALE_TEXT = `1/4" = 1'-0"`;
const HUNDRED_FEET_PTS = (100 * 12) / 48 / (1 / 72);

/**
 * An assembly priced by this file and nothing else — CLAUDE.md § Starter
 * content: a test that borrows a shipped price is really asserting the seed has
 * not changed.
 */
async function ownAssembly(name: string, costPerUnit: number) {
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
    category: "Devices",
    baseLaborHours: "0.5000",
    laborRateId: rate.insertId,
  });
  await database!.insert(assemblyMaterials).values({
    assemblyId: assembly.insertId,
    materialId: material.insertId,
    qty: "1.0000",
  });
  return assembly.insertId;
}

async function aBid(name: string) {
  const bid = (await caller().bids.create({
    name: `${name} ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({ id: sheet.id, scaleText: SCALE_TEXT });
  return { bidId: bid.id, sheetId: sheet.id };
}

/** Arm a count against an assembly and mark it `times` times. */
async function countOf(
  bidId: number,
  sheetId: number,
  assemblyId: number,
  times: number
) {
  const group = await caller().takeoffGroups.forAssembly({ bidId, assemblyId });
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

const mark = (bidId: number, sheetId: number, groupId: number, times: number) =>
  caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: Array.from({ length: times }, (_, i) => ({ x: 500 + i, y: 500 + i })),
  });

const detail = (bidId: number) => caller().bids.get({ id: bidId });

/** The number in the COLUMN, with nothing resolved — see storedBidLineItems. */
async function storedQty(bidId: number): Promise<number[]> {
  const database = await getDb();
  const rows = await database!
    .select({ qty: bidLineItems.qty })
    .from(bidLineItems)
    .where(eq(bidLineItems.bidId, bidId));
  return rows.map(row => Number(row.qty));
}

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
      openId: `test-qty-lock-${USER}`,
      name: "Quantity lock fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database.delete(assemblies).where(eq(assemblies.userId, USER));
  // Run types are per USER, not per bid, so deleting bids does not clear them.
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database.delete(laborRates).where(eq(laborRates.userId, USER));
});

withDb("a locked bid holds still; a draft beside it does not", () => {
  it("stops a counted line following the marks, and keeps the draft following", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);

    const sent = await aBid("Sent to the customer");
    const draft = await aBid("Still being built");
    const sentGroup = await countOf(sent.bidId, sent.sheetId, assemblyId, 14);
    const draftGroup = await countOf(
      draft.bidId,
      draft.sheetId,
      assemblyId,
      14
    );
    await caller().takeoffGroups.sendToBid({ id: sentGroup.id });
    await caller().takeoffGroups.sendToBid({ id: draftGroup.id });

    const locked = await caller().bids.lockQuantities({ bidId: sent.bidId });
    expect(locked.frozen).toBe(1);

    // Two more of the same thing found on the drawing, on both bids.
    await mark(sent.bidId, sent.sheetId, sentGroup.id, 2);
    await mark(draft.bidId, draft.sheetId, draftGroup.id, 2);

    expect(Number((await detail(sent.bidId)).lines[0].qty)).toBe(14);
    expect(Number((await detail(draft.bidId)).lines[0].qty)).toBe(16);

    /*
      AND THE MONEY, which is the half a quantity assertion cannot see. A line
      reading 14 whose total prices 16 is worse than either number on its own —
      the screen and the price would disagree with nothing to say which was
      sent.
    */
    expect((await detail(sent.bidId)).totals.materialCost).toBeCloseTo(
      14 * 38,
      2
    );
    expect((await detail(draft.bidId)).totals.materialCost).toBeCloseTo(
      16 * 38,
      2
    );
  });

  it("lets it follow again on unlock, all the way to the total", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("Unlock me");
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    await caller().bids.lockQuantities({ bidId });
    await mark(bidId, sheetId, group.id, 2);

    expect(Number((await detail(bidId)).lines[0].qty)).toBe(14);

    await caller().bids.unlockQuantities({ bidId });

    expect(Number((await detail(bidId)).lines[0].qty)).toBe(16);
    expect((await detail(bidId)).totals.materialCost).toBeCloseTo(16 * 38, 2);
  });

  it("freezes traced footage too, and un-freezes it", async () => {
    const list = await caller().materials.list();
    const emt = list.find(m => m.name === '1/2" EMT')!;
    const priced = await caller().materials.update({
      id: emt.id,
      costPerUnit: 1.25,
    });
    const type = await caller().takeoffRunTypes.create({
      label: `Lock test EMT ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: priced?.material?.id ?? emt.id,
    });

    const { bidId, sheetId } = await aBid("Traced and locked");
    const trace = (name: string) =>
      caller().takeoffRuns.save({
        bidId,
        sheetId,
        name,
        pathType: "conduit",
        runTypeId: type.id,
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: HUNDRED_FEET_PTS, y: 0 },
        ],
      });

    await trace("Homerun 1");
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const pipe = (lines: { runMaterialRole: string | null; qty: string }[]) =>
      Number(lines.find(l => l.runMaterialRole === "raceway")!.qty);

    expect(pipe((await detail(bidId)).lines)).toBeCloseTo(100, 0);

    await caller().bids.lockQuantities({ bidId });
    await trace("Homerun 2");

    // A second hundred feet on the drawing, and the bid does not know.
    expect(pipe((await detail(bidId)).lines)).toBeCloseTo(100, 0);

    await caller().bids.unlockQuantities({ bidId });
    expect(pipe((await detail(bidId)).lines)).toBeCloseTo(200, 0);
  });

  /*
    SENDING AGAIN WAS THE LOCK'S OPEN DOOR. `sendToBid` refreshes an existing
    run-type line's quantity in place, and on a locked bid that column IS the
    frozen answer — so tracing more and pressing Send rewrote a quoted number.
    Measured on the stored column as well as the resolved line, because the
    resolved line reads the column once locked and would hide nothing.
  */
  it("does not let Send-again overwrite locked footage", async () => {
    const list = await caller().materials.list();
    const emt = list.find(m => m.name === '1/2" EMT')!;
    const type = await caller().takeoffRunTypes.create({
      label: `Lock resend EMT ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: emt.id,
    });
    const { bidId, sheetId } = await aBid("Locked, sent again");
    const trace = (name: string) =>
      caller().takeoffRuns.save({
        bidId,
        sheetId,
        name,
        pathType: "conduit",
        runTypeId: type.id,
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: HUNDRED_FEET_PTS, y: 0 },
        ],
      });

    await trace("Homerun 1");
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    await caller().bids.lockQuantities({ bidId });
    const before = await storedQty(bidId);

    await trace("Homerun 2");
    const again = await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: type.id,
    });

    expect(again.updated).toEqual([]);
    expect(again.skipped.map(s => s.why).join(" ")).toMatch(/locked/i);
    expect(await storedQty(bidId)).toEqual(before);
    const pipe = (await detail(bidId)).lines.find(
      l => l.runMaterialRole === "raceway"
    )!;
    expect(Number(pipe.qty)).toBeCloseTo(100, 0);
  });
});

withDb("locking writes the drawing's answer into the column", () => {
  it("moves the stored number, measured on both sides", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("Stored number");
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    await mark(bidId, sheetId, group.id, 2);

    /*
      BEFORE AND AFTER OF THE SAME QUERY, because a lock that silently did
      nothing would leave every displayed number exactly where this test found
      it — the bid showed 16 all along. Only the stored column can tell the two
      apart. CLAUDE.md § "A COUNT TAKEN BEFORE THE CHANGE IS INTENT".
    */
    expect(await storedQty(bidId)).toEqual([14]);
    const result = await caller().bids.lockQuantities({ bidId });
    expect(await storedQty(bidId)).toEqual([16]);
    expect(result.moved).toBe(1);
    expect(result.frozen).toBe(1);
  });

  it("holds nothing on a bid with no line from the plans", async () => {
    const assemblyId = await ownAssembly("Panel schedule", 120);
    const { bidId } = await aBid("Typed by hand");
    await caller().bids.addAssembly({ bidId, assemblyId, qty: 3 });

    const before = await caller().bids.quantityLock({ bidId });
    expect(before).toEqual({ lockedAt: null, followingLines: 0, changes: [] });

    const result = await caller().bids.lockQuantities({ bidId });
    expect(result.frozen).toBe(0);
    // The hand-typed quantity is untouched — it was never following anything.
    expect(await storedQty(bidId)).toEqual([3]);
    expect(Number((await detail(bidId)).lines[0].qty)).toBe(3);
  });
});

withDb("what the confirmation is allowed to say", () => {
  it("names the quantity that would move, and nothing else", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("Name the change");
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    await caller().bids.lockQuantities({ bidId });

    const quiet = await caller().bids.quantityLock({ bidId });
    expect(quiet.lockedAt).not.toBeNull();
    expect(quiet.followingLines).toBe(1);
    // Locked an instant ago and nobody has drawn since: a real, common answer.
    expect(quiet.changes).toEqual([]);

    await mark(bidId, sheetId, group.id, 2);

    const moved = await caller().bids.quantityLock({ bidId });
    expect(moved.changes).toHaveLength(1);
    expect(moved.changes[0].name).toBe("Exit sign LED");
    expect(moved.changes[0].from).toBe(14);
    expect(moved.changes[0].to).toBe(16);
  });

  it("reports nothing pending while the bid is still following", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("Following");
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    await caller().takeoffGroups.sendToBid({ id: group.id });
    await mark(bidId, sheetId, group.id, 2);

    /*
      The stored column says 14 and the bid shows 16, which is ordinary and is
      NOT a pending change: the line is already reading the drawing. Comparing
      the two on an unlocked bid would warn about every line sent before the
      last mark.
    */
    const state = await caller().bids.quantityLock({ bidId });
    expect(state.lockedAt).toBeNull();
    expect(state.followingLines).toBe(1);
    expect(state.changes).toEqual([]);
  });
});

withDb("a locked quantity is not typeable either", () => {
  it("refuses the edit and says unlock, not mark", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("No typing");
    const group = await countOf(bidId, sheetId, assemblyId, 14);
    const { lineId } = await caller().takeoffGroups.sendToBid({
      id: group.id,
    });

    await expect(
      caller().bids.updateLine({ bidId, id: lineId, qty: 20 })
    ).rejects.toThrow(/marking or unmarking/);

    await caller().bids.lockQuantities({ bidId });

    await expect(
      caller().bids.updateLine({ bidId, id: lineId, qty: 20 })
    ).rejects.toThrow(/Unlock the bid/);
    expect(Number((await detail(bidId)).lines[0].qty)).toBe(14);
  });

  it("leaves everything else on the line ordinary", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const { bidId, sheetId } = await aBid("Unit label");
    const group = await countOf(bidId, sheetId, assemblyId, 4);
    const { lineId } = await caller().takeoffGroups.sendToBid({
      id: group.id,
    });
    await caller().bids.lockQuantities({ bidId });

    await caller().bids.updateLine({
      bidId,
      id: lineId,
      unitLabel: "Room 101",
    });
    const line = (await detail(bidId)).lines[0];
    expect(line.unitLabel).toBe("Room 101");
    expect(Number(line.qty)).toBe(4);
  });
});

withDb("a count sent to a locked bid", () => {
  it("arrives at the number it crossed with, and stays there", async () => {
    const assemblyId = await ownAssembly("Exit sign LED", 38);
    const second = await ownAssembly("Emergency light", 52);
    const { bidId, sheetId } = await aBid("Locked but still counting");
    const first = await countOf(bidId, sheetId, assemblyId, 4);
    await caller().takeoffGroups.sendToBid({ id: first.id });
    await caller().bids.lockQuantities({ bidId });

    /*
      Sending is NOT refused on a locked bid, deliberately: the estimator asked
      for this count to be on it, and the line arrives frozen at today's number
      like everything else there. Refusing would be a second lock rule in a
      second place, and the one an estimator would meet with no way through.
    */
    const late = await countOf(bidId, sheetId, second, 6);
    const crossed = await caller().takeoffGroups.sendToBid({ id: late.id });
    expect(crossed.count).toBe(6);

    await mark(bidId, sheetId, late.id, 3);

    const { lines } = await detail(bidId);
    const lateLine = lines.find(l => l.takeoffGroupId === late.id)!;
    expect(Number(lateLine.qty)).toBe(6);
  });
});
