/**
 * BENDS AND PULL POINTS REACH THE BID — through Send, markup, the quantity
 * lock, Send-again and the supplier list, the same doors fittings use.
 *
 * Through the real routers against the test database. The counting is pinned
 * in `runBends.test.ts`; these pin what only the whole path can show:
 *
 *   - a field bend is LABOR ONLY: $0 material even when its pipe is priced,
 *     "Not priced" while its hours are unset, and Send-again fills the hours
 *     in without ever taking the pipe's price;
 *   - an accepted LB is a box: the elbow at its corner goes, two connectors
 *     come, and nothing is ever added without that answer;
 *   - the supplier list never orders a field bend as pipe.
 *
 * Every price and hour here is the test's own (CLAUDE.md § Starter content).
 * Fixture ids are distinct from every other suite.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidLineItems,
  bidPdfs,
  bids,
  materials,
  takeoffBendDefaults,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { lineNotPriced } from "../shared/lineNotPriced";

const USER = 8795;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-bends-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const feet = (ft: number) => ft * 18;

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
    label: `${size} EMT bends ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: (await shipped(`${size} EMT`)).id,
  });
}

/** An L: 40 ft along, a 90, 25 ft up. Both ends level — no drops. */
const L = [
  { x: 0, y: 0 },
  { x: feet(40), y: 0 },
  { x: feet(40), y: feet(25) },
];

/**
 * Five right-angle corners, legs of uneven length — 450° of bend, so at the
 * 360° default the fifth corner tips it over.
 */
const FIVE_CORNERS = [
  { x: 0, y: 0 },
  { x: feet(20), y: 0 },
  { x: feet(20), y: feet(12) },
  { x: feet(34), y: feet(12) },
  { x: feet(34), y: feet(27) },
  { x: feet(49), y: feet(27) },
  { x: feet(49), y: feet(40) },
];

async function trace(
  bidId: number,
  sheetId: number,
  runTypeId: number,
  points: { x: number; y: number }[],
  id?: number
) {
  const run = await caller().takeoffRuns.save({
    ...(id ? { id } : {}),
    bidId,
    sheetId,
    name: `Homerun ${Math.random()}`,
    pathType: "conduit",
    runTypeId,
    status: "committed",
    points,
  });
  if (!id) {
    await caller().takeoffRuns.setEnds({
      id: run.id,
      startKind: "distribution",
      endKind: "distribution",
      distributionHeightInches: 120,
      branchWiring: false,
    });
  }
  return run;
}

const detail = (bidId: number) => caller().bids.get({ id: bidId });
const line = <T extends { runMaterialRole: string | null }>(
  lines: T[],
  role: string
): T | undefined => lines.find(l => l.runMaterialRole === role);
async function preview(bidId: number) {
  const [entry] = await caller().takeoffRunTypes.bridgeForBid({ bidId });
  return new Map(entry.fittings.map(f => [f.role, f]));
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
      openId: `test-bends-${USER}`,
      name: "Bends fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
  await database.delete(materials).where(eq(materials.userId, USER));
  await database
    .delete(takeoffBendDefaults)
    .where(eq(takeoffBendDefaults.userId, USER));
});

withDb("a field bend is labor only", () => {
  it("is counted below the factory size, sent at $0 material, and reads Not priced", async () => {
    // Price the PIPE, so a field bend that took the pipe's cost would show.
    const pipe = await shipped('1/2" EMT');
    await caller().materials.update({ id: pipe.id, costPerUnit: 1.25 });

    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid("Field bend");
    await trace(bidId, sheetId, type.id, L);

    const p = await preview(bidId);
    expect(p.get("fieldBend")).toMatchObject({
      status: "counted",
      qty: 1,
      atLeast: true,
      materialName: '1/2" EMT field bend',
      priced: false,
    });
    expect(p.get("fieldBend")!.why).toMatch(
      /^At least 1 field bend: 1 corner \(90°\) — 1\/2" EMT is bent in the field below 1-1\/4"/
    );
    expect(p.get("elbow90")!.status).toBe("included");

    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const bend = line((await detail(bidId)).lines, "fieldBend")!;
    expect(Number(bend.qty)).toBe(1);
    expect(Number(bend.snapshotMaterialCost)).toBe(0);
    expect(bend.snapshotLaborHours).toBeNull();
    expect(bend.breakdown!.materialCost).toBe(0);
    expect(lineNotPriced(bend, bend.breakdown!.directCost)).toBe(true);
  });

  it("Send-again fills in the hours once the raceway has them — and only the hours", async () => {
    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid("Field bend refill");
    await trace(bidId, sheetId, type.id, L);
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });

    const pipe = await shipped('1/2" EMT');
    await caller().materials.update({
      id: pipe.id,
      costPerUnit: 1.25,
      fieldBendLaborHours: 0.25,
    });
    expect((await preview(bidId)).get("fieldBend")).toMatchObject({
      priced: true,
      resend: { kind: "refillHours", hours: 0.25 },
    });

    const again = await caller().takeoffRunTypes.sendToBid({
      bidId,
      runTypeId: type.id,
    });
    expect(again.refilled).toContain('1/2" EMT field bend');
    const bend = line((await detail(bidId)).lines, "fieldBend")!;
    expect(Number(bend.snapshotLaborHours)).toBeCloseTo(0.25, 4);
    // Never the pipe's $1.25/ft.
    expect(Number(bend.snapshotMaterialCost)).toBe(0);
    expect(lineNotPriced(bend, bend.breakdown!.directCost)).toBe(false);

    // Hours are set now: a later change to the raceway does not reach them.
    const fork = await shipped('1/2" EMT');
    await caller().materials.update({ id: fork.id, fieldBendLaborHours: 0.5 });
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    expect(
      Number(line((await detail(bidId)).lines, "fieldBend")!.snapshotLaborHours)
    ).toBeCloseTo(0.25, 4);
  });

  it("never reaches the supplier list as pipe", async () => {
    const type = await emtType('1/2"');
    const { bidId, sheetId } = await aBid("Supplier");
    await trace(bidId, sheetId, type.id, L);
    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries.map(e => e.name)).not.toContain('1/2" EMT field bend');
    // The pipe listed by the each would be the double count this guards.
    expect(
      doc.entries.filter(e => e.name === '1/2" EMT' && e.unit === "each")
    ).toEqual([]);
    expect(doc.notes.join(" ")).not.toMatch(/fieldBend/);
  });
});

withDb("factory elbows from the company size up", () => {
  it('counts a factory 90 on 1-1/4" EMT, names its row, and lists it as a minimum', async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Factory");
    await trace(bidId, sheetId, type.id, L);

    const p = await preview(bidId);
    expect(p.get("elbow90")).toMatchObject({
      status: "counted",
      qty: 1,
      atLeast: true,
      materialName: '1-1/4" EMT 90-degree elbow',
      priced: false,
    });
    expect(p.get("fieldBend")!.status).toBe("included");

    const doc = await caller().materialsList.get({ bidId });
    expect(doc.entries.map(e => e.name)).toContain(
      '1-1/4" EMT 90-degree elbow'
    );
    expect(doc.notes.join(" ")).toMatch(
      /plans do not show the kicks and offsets at boxes: 1-1\/4" EMT 90-degree elbow/
    );
  });

  it('follows the company setting — 1" becomes factory when the size drops to 1"', async () => {
    const database = await getDb();
    await database!
      .insert(takeoffBendDefaults)
      .values({ userId: USER, factoryElbowFromSize: '1"' });
    const type = await emtType('1"');
    const { bidId, sheetId } = await aBid("Setting");
    await trace(bidId, sheetId, type.id, L);
    const p = await preview(bidId);
    expect(p.get("elbow90")).toMatchObject({ status: "counted", qty: 1 });
    expect(p.get("fieldBend")!.status).toBe("included");
  });

  it("holds its quantity on a locked bid", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Locked");
    await trace(bidId, sheetId, type.id, L);
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    await caller().bids.lockQuantities({ bidId });

    await trace(bidId, sheetId, type.id, L);
    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    const elbow = line((await detail(bidId)).lines, "elbow90")!;
    expect(Number(elbow.qty)).toBe(1);
    const database = await getDb();
    const [stored] = await database!
      .select({ qty: bidLineItems.qty })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, elbow.id));
    expect(Number(stored.qty)).toBe(1);
    expect(elbow.fittingNote).toMatch(
      /^On the drawing now: At least 2 90° elbows/
    );
  });
});

withDb("the run list gives the drawing what it marks", () => {
  it("carries the proposal, then the accepted point, then the dismissal", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Markers");
    const run = await trace(bidId, sheetId, type.id, FIVE_CORNERS);
    const bendsOf = async () =>
      (await caller().takeoffRuns.listForSheet({ sheetId })).find(
        r => r.id === run.id
      )!.bends!;

    let bends = await bendsOf();
    expect(bends.proposals).toEqual([
      {
        place: "corner",
        ...FIVE_CORNERS[5],
        degrees: 450,
        // 1-1/4" is below the 2" default, so an LB is offered first.
        suggestedKind: "lb",
        answer: null,
      },
    ]);
    expect(bends.summary).toMatch(/^450° of bend on the drawing \(5 corners\)/);

    await caller().takeoffRuns.answerPullPoint({
      runId: run.id,
      place: "corner",
      ...FIVE_CORNERS[5],
      kind: "lb",
      status: "accepted",
    });
    bends = await bendsOf();
    expect(bends.proposals).toEqual([]);
    expect(bends.accepted).toMatchObject([
      { place: "corner", ...FIVE_CORNERS[5], kind: "lb" },
    ]);

    await caller().takeoffRuns.clearPullPointAnswer({
      id: bends.accepted[0].answerId,
    });
    await caller().takeoffRuns.answerPullPoint({
      runId: run.id,
      place: "corner",
      ...FIVE_CORNERS[5],
      kind: "lb",
      status: "dismissed",
    });
    bends = await bendsOf();
    expect(bends.proposals[0].answer).toMatchObject({ status: "dismissed" });
    expect(bends.overLimit).toEqual([
      "450° pulled through with no pull point — past the 360° limit, by your choice",
    ]);
  });

  it("gives a cable run no bends at all", async () => {
    const { bidId, sheetId } = await aBid("Cable");
    const run = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "MC",
      pathType: "cable",
      status: "committed",
      points: L,
    });
    const listed = (await caller().takeoffRuns.listForSheet({ sheetId })).find(
      r => r.id === run.id
    )!;
    expect(listed.bends).toBeNull();
  });
});

withDb("a pull point is proposed, and only an answer adds one", () => {
  it("proposes at the corner that tips 360°, and adds nothing until accepted", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Proposal");
    await trace(bidId, sheetId, type.id, FIVE_CORNERS);

    const p = await preview(bidId);
    expect(p.get("lb")).toMatchObject({ status: "counted", qty: 0 });
    expect(p.get("lb")!.why).toBe(
      "No LBs accepted on the drawing — 1 pull point proposed and not answered yet"
    );
    expect(p.get("elbow90")).toMatchObject({ qty: 5 });
    expect(p.get("connector")).toMatchObject({ qty: 2 });

    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    expect(line((await detail(bidId)).lines, "lb")).toBeUndefined();
  });

  it("an accepted LB takes its corner's elbow and brings two connectors", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Accepted");
    const run = await trace(bidId, sheetId, type.id, FIVE_CORNERS);
    await caller().takeoffRuns.answerPullPoint({
      runId: run.id,
      place: "corner",
      ...FIVE_CORNERS[5],
      kind: "lb",
      status: "accepted",
    });

    const p = await preview(bidId);
    expect(p.get("lb")).toMatchObject({
      qty: 1,
      materialName: '1-1/4" EMT LB conduit body',
    });
    expect(p.get("elbow90")).toMatchObject({ qty: 4 });
    expect(p.get("connector")).toMatchObject({ qty: 4 });
    expect(p.get("connector")!.why).toMatch(/1 LB \(2 each, into the hubs\)/);

    await caller().takeoffRunTypes.sendToBid({ bidId, runTypeId: type.id });
    expect(Number(line((await detail(bidId)).lines, "lb")!.qty)).toBe(1);
  });

  it("refuses an answer at a spot that is not a corner of the run", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Refused");
    const run = await trace(bidId, sheetId, type.id, FIVE_CORNERS);
    await expect(
      caller().takeoffRuns.answerPullPoint({
        runId: run.id,
        place: "corner",
        x: 5,
        y: 5,
        kind: "lb",
        status: "accepted",
      })
    ).rejects.toThrow(/not a corner of this run/);
  });

  it("keeps an answer when a point is added elsewhere, and drops it when its corner moves", async () => {
    const type = await emtType('1-1/4"');
    const { bidId, sheetId } = await aBid("Edited");
    const run = await trace(bidId, sheetId, type.id, FIVE_CORNERS);
    await caller().takeoffRuns.answerPullPoint({
      runId: run.id,
      place: "corner",
      ...FIVE_CORNERS[5],
      kind: "pullBox",
      status: "accepted",
    });

    // A point inserted on the first leg: every index shifts, the corner stays.
    const inserted = [
      FIVE_CORNERS[0],
      { x: feet(9), y: 0 },
      ...FIVE_CORNERS.slice(1),
    ];
    await trace(bidId, sheetId, type.id, inserted, run.id);
    expect((await preview(bidId)).get("pullBox")).toMatchObject({ qty: 1 });

    // The answered corner itself moves: the answer goes, the spot is proposed.
    const moved = inserted.map((p, i) =>
      i === 6 ? { x: p.x + feet(2), y: p.y } : p
    );
    await trace(bidId, sheetId, type.id, moved, run.id);
    const p = await preview(bidId);
    expect(p.get("pullBox")).toMatchObject({ qty: 0 });
    expect(p.get("lb")!.why).toMatch(
      /1 pull point proposed and not answered yet/
    );
  });
});
