/**
 * WIRE AND CONDUIT LINES TAGGED OFF LEAVE THE MATERIALS LIST TOO (0146;
 * scope-tags-plan.md step 4, the run-type half; owner Q12).
 *
 * The materials list reads traced runs, not lines — so a pipe line tagged
 * By others was off the money and still on the order. One straight traced
 * run of a shipped conduit type with wire and a ground, sent to the bid,
 * then one ROLE at a time:
 *
 *   raceway   By others   Conduit footage off; wire and ground stay
 *   conductor Excluded    insulated wire off; conduit and bare stay
 *   ground    By others   bare ground off
 *   coupling  By others   the counted couplings off
 *   conductor Owner furn. off the order, listed by the foot
 *
 * Each is said in the footer (or the owner-furnished section), and Undo puts
 * every figure back. Fixture id 9946 is this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import type { LineScope } from "../shared/lineScope";

const COMPANY = 9946;
const hasDb = !!process.env.DATABASE_URL;
const withDb = hasDb ? describe : describe.skip;
dropFixtureUsersAfterAll([COMPANY]);

const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-scope-runs-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

/** 1/4" = 1'-0" is 18 page points a foot. */
const FT = 18;

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await db.getDb())!;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, COMPANY))
    .limit(1);
  if (!existing)
    await database.insert(users).values({
      id: COMPANY,
      openId: `test-scope-runs-${COMPANY}`,
      name: "Scope run lines company",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await db.getDb())!;
  await database.delete(bids).where(eq(bids.userId, COMPANY));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, COMPANY));
});

/** A bid with one scaled sheet, 100 ft of one conduit type traced and sent. */
async function aBid() {
  const types = await caller().takeoffRunTypes.list({});
  const type = types.find(
    t =>
      t.pathType === "conduit" &&
      t.racewayMaterialId !== null &&
      t.conductorMaterialId !== null &&
      (t.conductorCount ?? 0) > 0 &&
      (t.groundCount ?? 0) > 0
  );
  expect(type, "a shipped conduit type with wire and a ground").toBeDefined();
  const bid = (await caller().bids.create({
    name: `Scope runs ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  const database = (await db.getDb())!;
  const [pdf] = await database.insert(bidPdfs).values({
    bidId: bid.id,
    userId: COMPANY,
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
  await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId: sheet.id,
    name: "Run",
    pathType: "conduit",
    runTypeId: type!.id,
    status: "committed",
    // A quantity trace takes its wire from its type (D21) — no circuits
    // to draw, so the pipe, the wire and the ground are all on one run.
    traceMode: "quantity",
    points: [
      { x: 0, y: 0 },
      { x: 100 * FT, y: 0 },
    ],
  });
  await caller().takeoffRunTypes.sendToBid({
    bidId: bid.id,
    runTypeId: type!.id,
  });
  return bid.id;
}

async function read(bidId: number) {
  const doc = await caller().materialsList.get({ bidId });
  const feet = (label: string) =>
    doc.measured.find(m => m.label === label)?.feet ?? 0;
  return {
    conduit: feet("Conduit"),
    wire: feet("Wire, insulated"),
    bare: feet("Wire, bare ground"),
    couplings: doc.entries
      .filter(e => e.sources.some(s => s.includes("counted from traced runs")))
      .reduce((n, e) => n + e.qty, 0),
    leftOff: doc.leftOff,
    ownerFurnished: doc.ownerFurnished,
  };
}

async function tag(bidId: number, role: string, scopeTag: LineScope) {
  const line = (await caller().bids.get({ id: bidId })).lines.find(
    l => l.runMaterialRole === role
  );
  expect(line, `a ${role} line on the bid`).toBeDefined();
  return caller().bids.setLineScope({
    bidId,
    lineIds: [line!.id],
    scopeTag,
  });
}

withDb("wire and conduit lines tagged off leave the materials list", () => {
  it("untagged: conduit, wire, ground and fittings are all on the order", async () => {
    const got = await read(await aBid());
    expect(got.conduit).toBeGreaterThan(0);
    expect(got.wire).toBeGreaterThan(0);
    expect(got.bare).toBeGreaterThan(0);
    expect(got.couplings).toBeGreaterThan(0);
    expect(got.leftOff).toEqual({ byOthers: 0, excluded: 0 });
  });

  it("the pipe By others: its footage leaves, the wire stays, Undo puts it back", async () => {
    const bidId = await aBid();
    const before = await read(bidId);
    const set = await tag(bidId, "raceway", "by_others");
    const got = await read(bidId);
    expect(got.conduit).toBe(0);
    expect(got.wire).toBe(before.wire);
    expect(got.bare).toBe(before.bare);
    expect(got.leftOff).toEqual({ byOthers: 1, excluded: 0 });

    await caller().bids.setLineScope({ bidId, changes: set.previous });
    expect(await read(bidId)).toEqual(before);
  });

  it("the wire Excluded: insulated wire leaves, the pipe and the ground stay", async () => {
    const bidId = await aBid();
    const before = await read(bidId);
    await tag(bidId, "conductor", "excluded");
    const got = await read(bidId);
    expect(got.wire).toBe(0);
    expect(got.conduit).toBe(before.conduit);
    expect(got.bare).toBe(before.bare);
    expect(got.leftOff).toEqual({ byOthers: 0, excluded: 1 });
  });

  it("the ground By others: the bare ground leaves", async () => {
    const bidId = await aBid();
    const before = await read(bidId);
    await tag(bidId, "ground", "by_others");
    const got = await read(bidId);
    expect(got.bare).toBe(0);
    expect(got.wire).toBe(before.wire);
  });

  it("the couplings By others: the counted couplings leave", async () => {
    const bidId = await aBid();
    const before = await read(bidId);
    const coupling = (await caller().bids.get({ id: bidId })).lines.find(
      l => l.runMaterialRole === "coupling"
    );
    expect(coupling, "a coupling line").toBeDefined();
    await tag(bidId, "coupling", "by_others");
    const got = await read(bidId);
    expect(got.couplings).toBe(before.couplings - Number(coupling!.qty));
    expect(got.conduit).toBe(before.conduit);
  });

  it("the wire owner furnished: off the order, listed by the foot", async () => {
    const bidId = await aBid();
    await tag(bidId, "conductor", "ofci");
    const got = await read(bidId);
    expect(got.wire).toBe(0);
    expect(got.leftOff).toEqual({ byOthers: 0, excluded: 0 });
    expect(got.ownerFurnished).toHaveLength(1);
    expect(got.ownerFurnished[0].unit).toBe("foot");
    expect(got.ownerFurnished[0].qty).toBeGreaterThan(0);
  });
});
