/**
 * A BRANCHED RUN REACHES THE BID (D20) — Send, Send-again, markup, the
 * quantity lock and the supplier list, on a run of three legs meeting at a
 * tee.
 *
 * Through the real routers against the test database. The counting is pinned
 * in `runNetwork.test.ts` and the rows in `branchLegs.test.ts`; what these
 * add is that the branch arrives on the bid as ordinary lines, bought once.
 *
 * Every price here is the test's own (CLAUDE.md § Starter content).
 *
 * Fixture ids are distinct from every other suite.
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
import { behindTheLock } from "./behindTheLock.testHelper";

const USER = 9821;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-branch-bridge-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Branch bridge ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const [sheet] = await caller().bidPdfs.sheets({ bidPdfId: pdf.insertId });
  await caller().bidPdfs.setSheetScale({
    id: sheet.id,
    scaleText: `1/4" = 1'-0"`,
  });
  return { bidId: bid.id, sheetId: sheet.id };
}

async function shipped(name: string) {
  const row = (await caller().materials.list()).find(m => m.name === name);
  if (!row) throw new Error(`No material named ${name}`);
  return row;
}

async function emtType(size: string) {
  return caller().takeoffRunTypes.create({
    label: `${size} EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: (await shipped(`${size} EMT`)).id,
  });
}

/** Both ends level with a run height set, so nothing reads "at least". */
async function level(id: number, ends: ("start" | "end")[]) {
  await caller().takeoffRuns.setEnds({
    id,
    ...(ends.includes("start") ? { startKind: "distribution" } : {}),
    ...(ends.includes("end") ? { endKind: "distribution" } : {}),
    distributionHeightInches: 120,
    branchWiring: false,
  });
}

/**
 * 70 ft of main — 40 east, 30 south — with a 20 ft branch north from the
 * point 15 ft along. Straight, so the only corner is the main's at (40, 0).
 */
async function branchedRun(
  bidId: number,
  sheetId: number,
  mainType: number,
  branchType?: number
) {
  const root = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Panel A → far box",
    pathType: "conduit",
    runTypeId: mainType,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
      { x: ft(40), y: ft(30) },
    ],
  });
  await level(root.id, ["start", "end"]);
  const leg = await caller().takeoffRuns.addLeg({
    runId: root.id,
    points: [
      { x: ft(15), y: 0 },
      { x: ft(15), y: -ft(20) },
    ],
    start: {
      kind: "tee",
      hostRunId: root.id,
      at: { x: ft(15), y: 0 },
      tolerance: 3,
      fitting: "box",
      stampId: null,
    },
    endKind: "distribution",
    ...(branchType ? { runTypeId: branchType } : {}),
  });
  await level(leg.id, ["end"]);
  return { rootId: root.id, ...leg };
}

const detail = (bidId: number) => caller().bids.get({ id: bidId });
const line = <T extends { runMaterialRole: string | null }>(
  lines: T[],
  role: string
): T | undefined => lines.find(l => l.runMaterialRole === role);

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
      openId: `test-branch-bridge-${USER}`,
      name: "Branch bridge fixture",
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

withDb("the preview counts a branched run as one network", () => {
  it("counts three connectors at the tee, one box and its cover", async () => {
    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid();
    await branchedRun(bidId, sheetId, type.id);

    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const byRole = new Map(entry.fittings.map(f => [f.role, f]));

    // 3 at the tee + the panel end + the far end + the branch end.
    expect(byRole.get("connector")).toMatchObject({ qty: 6 });
    expect(byRole.get("connector")!.why).toMatch(
      /1 branch tee \(3 of this size\)/
    );
    // 15 ft, 55 ft and 20 ft: 1 + 5 + 1 couplings, each leg a fresh stick.
    expect(byRole.get("coupling")).toMatchObject({ qty: 7, atLeast: false });
    expect(byRole.get("teeBox")).toMatchObject({
      status: "counted",
      qty: 1,
      materialName: '4" square box, 1-1/2" deep',
    });
    expect(byRole.get("teeCover")).toMatchObject({
      qty: 1,
      materialName: '4" square blank cover',
    });
    // The main's one corner, bent in the field on 1/2" — the tee turns none.
    expect(byRole.get("fieldBend")).toMatchObject({ qty: 1 });

    // Footage is the three legs' own lengths: the jump is not pipe.
    expect(entry.rows.find(r => r.role === "raceway")!.feet).toBeCloseTo(90, 2);
  });

  it("buys the box ONCE at a tee between two sizes, with the larger pipe", async () => {
    const half = await emtType('1/2"');
    const threeQuarter = await emtType('3/4"');
    const { bidId, sheetId } = await aBid();
    // A 1/2" main with a 3/4" branch: the box goes with the 3/4".
    await branchedRun(bidId, sheetId, half.id, threeQuarter.id);

    const entries = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    const teeBoxes = entries.map(e => ({
      typeId: e.runTypeId,
      box: e.fittings.find(f => f.role === "teeBox")!,
    }));
    expect(teeBoxes.find(t => t.typeId === threeQuarter.id)!.box).toMatchObject(
      { qty: 1 }
    );
    expect(teeBoxes.find(t => t.typeId === half.id)!.box).toMatchObject({
      qty: 0,
    });
    // Connectors still total 6, each sized to its own pipe.
    const connectors = entries.reduce(
      (sum, e) => sum + e.fittings.find(f => f.role === "connector")!.qty,
      0
    );
    expect(connectors).toBe(6);
  });
});

withDb("sent, marked up, locked and listed", () => {
  it("sends the tee box as an ordinary priced, marked-up line", async () => {
    const box = await shipped('4" square box, 1-1/2" deep');
    await caller().materials.update({ id: box.id, costPerUnit: 3.2 });
    await caller().bids.setPricingDefaults({ materialMarkupPct: 0.3 });

    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid();
    await branchedRun(bidId, sheetId, type.id);
    const result = await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: type.id,
    });
    expect(result.sent).toEqual(
      expect.arrayContaining(["connector", "teeBox", "teeCover"])
    );

    const bid = await detail(bidId);
    const teeBox = line(bid.lines, "teeBox")!;
    expect(Number(teeBox.qty)).toBe(1);
    expect(Number(teeBox.snapshotMaterialCost)).toBeCloseTo(3.2, 4);
    expect(teeBox.fittingNote).toBe("1 tee box: one at each branch tee");
    // The same markup as any other part on the bid.
    expect(Number(teeBox.snapshotMarkupPct)).toBeCloseTo(
      Number(line(bid.lines, "connector")!.snapshotMarkupPct),
      6
    );
    expect(Number(line(bid.lines, "connector")!.qty)).toBe(6);
  });

  it("holds still on a locked bid, then follows the drawing on unlock", async () => {
    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid();
    const run = await branchedRun(bidId, sheetId, type.id);
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    await caller().bids.lockQuantities({ bidId });

    // A second branch off the far piece: another tee. Behind the lock — a
    // locked bid refuses a new leg since 2026-09-29; this is a drawing that
    // moved before that rule.
    await behindTheLock(bidId, () =>
      caller().takeoffRuns.addLeg({
        runId: run.rootId,
        points: [
          { x: ft(40), y: ft(10) },
          { x: ft(55), y: ft(10) },
        ],
        start: {
          kind: "tee",
          hostRunId: run.cutRunId!,
          at: { x: ft(40), y: ft(10) },
          tolerance: 3,
          fitting: "box",
          stampId: null,
        },
        endKind: null,
      })
    );
    // Since 2026-09-29 a locked bid refuses the send outright (server/lockGuard.ts),
    // which is a stronger form of "Send-again does not move a frozen line".
    await expect(
      caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id })
    ).rejects.toThrow(/locked/);
    expect(Number(line((await detail(bidId)).lines, "teeBox")!.qty)).toBe(1);

    await caller().bids.unlockQuantities({ bidId });
    expect(Number(line((await detail(bidId)).lines, "teeBox")!.qty)).toBe(2);
  });

  it("lists the tee box with the boxes on the supplier list", async () => {
    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid();
    await branchedRun(bidId, sheetId, type.id);
    const doc = await caller().materialsList.get({ bidId });
    const box = doc.entries.find(e => e.name === '4" square box, 1-1/2" deep');
    expect(box).toMatchObject({ qty: 1, unit: "each", category: "Boxes" });
    expect(
      doc.entries.find(e => e.name === '4" square blank cover')
    ).toMatchObject({ qty: 1 });
    // One run, however many legs: nothing in the notes counts legs as runs.
    expect(doc.notes.join(" ")).not.toMatch(/3 traced runs/);
  });
});
