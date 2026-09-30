/**
 * A TEE ON A CABLE RUN BUYS A BOX (plan W4, owner Q2, 2026-09-29).
 *
 * Until then a cable type got no fitting rows at all, so a branch on an MC or
 * NM run counted its footage and drops and bought nothing at the split: one
 * 4" square box and blank cover short per tee, with nothing on screen to say
 * so. The box is the same pair a small-pipe tee buys (`SMALL_TEE_BOX`).
 *
 * And the send's half of the same rule, found while building it: `sendToBid`
 * decided who owns a tee from the ONE type being sent, so a type owned every
 * tee it touched. Sending a 1/2" and a 3/4" type that share a tee stored a
 * box for each. The bid screen read it right (it counts every type), which is
 * why nothing looked wrong — the stored lines did not agree with it.
 *
 * Through the real routers against the test database. Red before the fix:
 * the cable tee sent no box, and the two sizes sent two.
 *
 * Fixture ids are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidLineItems,
  bidPdfs,
  bids,
  materials,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9834;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-cable-tee-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Cable tee ${Date.now()}${Math.random()}`,
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

async function mcType() {
  return caller().takeoffRunTypes.create({
    label: `12-2 MC ${Date.now()}${Math.random()}`,
    pathType: "cable",
    conductorMaterialId: (await shipped("12-2 MC cable")).id,
  });
}

async function emtType(size: string) {
  return caller().takeoffRunTypes.create({
    label: `${size} EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: (await shipped(`${size} EMT`)).id,
  });
}

async function level(id: number, ends: ("start" | "end")[]) {
  await caller().takeoffRuns.setEnds({
    id,
    ...(ends.includes("start") ? { startKind: "distribution" } : {}),
    ...(ends.includes("end") ? { endKind: "distribution" } : {}),
    distributionHeightInches: 120,
    branchWiring: false,
  });
}

/** 40 ft east with a 20 ft branch north from 15 ft along — one tee. */
async function branchedRun(
  bidId: number,
  sheetId: number,
  pathType: "conduit" | "cable",
  mainType: number,
  branchType?: number
) {
  const root = await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Main",
    pathType,
    runTypeId: mainType,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
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
}

/** The tee-box lines STORED on the bid — what the send wrote. */
async function storedTeeBoxes(bidId: number) {
  const database = (await getDb())!;
  return database
    .select({
      runTypeId: bidLineItems.takeoffRunTypeId,
      qty: bidLineItems.qty,
    })
    .from(bidLineItems)
    .where(
      and(
        eq(bidLineItems.bidId, bidId),
        eq(bidLineItems.runMaterialRole, "teeBox")
      )
    );
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
      openId: `test-cable-tee-${USER}`,
      name: "Cable tee fixture",
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

withDb("a tee on a cable run", () => {
  it('buys a 4" square box and blank cover, and nothing a pipe would', async () => {
    const mc = await mcType();
    const { bidId, sheetId } = await aBid();
    await branchedRun(bidId, sheetId, "cable", mc.id);

    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    // Its connectors and straps too since § R1 (mcCableFittings.test.ts) —
    // but nothing a pipe buys: no coupling, elbow, LB or pull box.
    expect(entry.fittings.map(f => f.role).sort()).toEqual([
      "connector",
      "strap",
      "teeBox",
      "teeCover",
    ]);
    const byRole = new Map(entry.fittings.map(f => [f.role, f]));
    expect(byRole.get("teeBox")).toMatchObject({
      status: "counted",
      qty: 1,
      materialName: '4" square box',
    });
    expect(byRole.get("teeCover")).toMatchObject({
      qty: 1,
      materialName: '4" square blank cover',
    });

    const result = await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: mc.id,
    });
    expect(result.sent).toEqual(expect.arrayContaining(["teeBox", "teeCover"]));
    const lines = (await caller().bids.get({ id: bidId })).lines;
    const box = lines.find(l => l.runMaterialRole === "teeBox")!;
    expect(box.runMaterialId).toBe((await shipped('4" square box')).id);
    expect(Number(box.qty)).toBe(1);
    expect(box.fittingNote).toBe("1 tee box: one at each branch tee");
    expect(lines.find(l => l.runMaterialRole === "teeCover")).toBeDefined();
  });

  it("a cable run with no tee buys no box — and shows nothing new", async () => {
    const mc = await mcType();
    const { bidId, sheetId } = await aBid();
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Straight MC",
      pathType: "cable",
      runTypeId: mc.id,
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: ft(40), y: 0 },
      ],
    });
    await level(run.id, ["start", "end"]);
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
    // Only the tee rows: the run's connectors and straps are counted since
    // § R1 (mcCableFittings.test.ts).
    const teeRows = entry.fittings.filter(
      f => f.role === "teeBox" || f.role === "teeCover"
    );
    expect(teeRows).toHaveLength(2);
    expect(teeRows.every(f => f.qty === 0)).toBe(true);
  });
});

withDb("the send decides a tee's owner with every type in view", () => {
  it("stores ONE box for a tee two pipe sizes share, sent one type at a time", async () => {
    const half = await emtType('1/2"');
    const threeQuarter = await emtType('3/4"');
    const { bidId, sheetId } = await aBid();
    // A 1/2" main with a 3/4" branch: the box goes with the 3/4".
    await branchedRun(bidId, sheetId, "conduit", half.id, threeQuarter.id);

    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: half.id });
    await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: threeQuarter.id,
    });

    const boxes = await storedTeeBoxes(bidId);
    const total = boxes.reduce((sum, b) => sum + Number(b.qty), 0);
    expect(total, "boxes stored for one tee").toBe(1);
    expect(boxes.find(b => Number(b.qty) > 0)!.runTypeId).toBe(threeQuarter.id);
  });
});

/*
  Pipe and cable never meet at a tee today: a branch keeps its run's kind.
  Found writing the plan's "mixed EMT/MC tee" case, which cannot be traced.
  Pinned, because `cableTeeOwners`' "a tee any pipe meets stays the pipe's"
  guards exactly this, and the day it becomes possible that rule is what
  keeps the box from being bought twice.
*/
withDb("a tee where pipe meets cable", () => {
  it("cannot be traced: a cable branch on a conduit run is refused", async () => {
    const emt = await emtType('1/2"');
    const mc = await mcType();
    const { bidId, sheetId } = await aBid();
    await expect(
      branchedRun(bidId, sheetId, "conduit", emt.id, mc.id)
    ).rejects.toThrow(/is a cable type, and this is a conduit run/);
  });
});
