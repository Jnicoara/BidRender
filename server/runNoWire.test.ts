/**
 * A CONDUIT RUN WITH NO WIRE IS SAID, ON THE RUN AND ON THE BID.
 *
 * A route run starts with no circuits, by design (runToBidWire.test.ts: "the
 * honest starting state"). So a traced pipe could reach the bid with nothing
 * pulled through it and the only sign was a grey "none" on the run row —
 * ranked first in the 2026-09-29 audit. Owner: no silent default; amber on
 * the run and on the bid, plus a one-tap fix.
 *
 * The rule is shared/runNoWire.ts. These pin both what it flags and — just as
 * important — what it must NOT flag: wire left out on purpose is not missing.
 * The first half runs with no database; the second goes through the routers
 * the Plans screen and the bid page read.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { countRunsWithNoWire, runCarriesNoWire } from "../shared/runNoWire";

// ── The rule, with no database in the way ────────────────────────────────────

const row = (over: Partial<Parameters<typeof runCarriesNoWire>[0]> = {}) => ({
  id: 1,
  isSuggestion: false,
  runTypeId: 7,
  pathType: "conduit" as const,
  startKind: "distribution",
  endKind: "junctionBox",
  startTeeId: null,
  endTeeId: null,
  traceMode: null,
  branchWiring: null,
  ...over,
});
const none = new Map<number, unknown[]>();
const some = new Map<number, unknown[]>([[1, [{}]]]);

describe("which runs carry no wire", () => {
  it("flags a typed conduit run whose wire the bid would price, with none", () => {
    expect(runCarriesNoWire(row(), none)).toBe(true);
  });

  it("does not flag it once a circuit is there", () => {
    expect(runCarriesNoWire(row(), some)).toBe(false);
  });

  it("never flags a cable run — the cable is the wire", () => {
    expect(runCarriesNoWire(row({ pathType: "cable" }), none)).toBe(false);
  });

  it("does not flag wire left out ON PURPOSE", () => {
    // No type: nothing to price, said elsewhere as "no run type".
    expect(runCarriesNoWire(row({ runTypeId: null }), none)).toBe(false);
    // An AI suggestion nobody accepted.
    expect(runCarriesNoWire(row({ isSuggestion: true }), none)).toBe(false);
    // Answered branch wiring: the devices' whips carry it (D18).
    expect(
      runCarriesNoWire(
        row({
          startKind: "receptacle",
          endKind: "receptacle",
          branchWiring: true,
        }),
        none
      )
    ).toBe(false);
  });

  it("counts a branched run once, however many legs are empty (D20)", () => {
    const rows = [
      { ...row({ id: 1 }), parentRunId: null },
      { ...row({ id: 2 }), parentRunId: 1 },
      { ...row({ id: 3 }), parentRunId: null },
    ];
    expect(countRunsWithNoWire(rows, none)).toBe(2);
    expect(countRunsWithNoWire(rows, new Map([[3, [{}]]]))).toBe(1);
  });
});

// ── Through the routers ──────────────────────────────────────────────────────

const USER = 9940;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-no-wire-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function scenario() {
  const bid = (await caller().bids.create({
    name: `No wire ${Date.now()}${Math.random()}`,
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
  const { sheets } = await caller().bidPdfs.ensureSheets({
    bidPdfId: pdf.insertId,
    pageCount: 1,
    outline: [],
  });
  const sheetId = sheets[0].id;
  await caller().bidPdfs.setSheetScale({
    id: sheetId,
    scaleText: `1/4" = 1'-0"`,
  });
  const catalog = await caller().materials.list();
  const id = (name: string) => catalog.find(m => m.name === name)!.id;
  const type = await caller().takeoffRunTypes.create({
    label: `No wire EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: id('1/2" EMT'),
    conductorMaterialId: id("#12 THHN Copper"),
    conductorCount: 2,
    groundMaterialId: id("#12 bare solid Copper"),
    groundCount: 1,
  });
  const trace = (traceMode?: "quantity") =>
    caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      runTypeId: type.id,
      status: "committed",
      ...(traceMode ? { traceMode } : {}),
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    });
  const rowOf = async (runId: number) =>
    (await caller().takeoffRuns.listForSheet({ sheetId })).find(
      r => r.id === runId
    )!;
  const onBid = async () =>
    (await caller().bids.get({ id: bid.id })).fromPlans.runsWithNoWire;
  return { bidId: bid.id, trace, rowOf, onBid };
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
      openId: `test-no-wire-${USER}`,
      name: "No wire fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(eq(takeoffRunTypes.userId, USER));
});

withDb("a conduit run with no wire, on the run and on the bid", () => {
  it("is flagged on its row and counted on the bid, until a circuit is added", async () => {
    const s = await scenario();
    const run = await s.trace();
    expect((await s.rowOf(run.id)).noWire).toBe(true);
    expect(await s.onBid()).toBe(1);

    // The one-tap fix sends the type's own counts as one circuit.
    await caller().takeoffRuns.addCircuit({
      runId: run.id,
      name: "Circuit 1",
      conductorCount: 2,
      groundCount: 1,
    });
    expect((await s.rowOf(run.id)).noWire).toBe(false);
    expect(await s.onBid()).toBe(0);
  });

  it("does not flag a quantity trace, whose wire comes from its type (D21)", async () => {
    const s = await scenario();
    const run = await s.trace("quantity");
    expect((await s.rowOf(run.id)).noWire).toBe(false);
    expect(await s.onBid()).toBe(0);
  });

  it("counts each empty run, and only those", async () => {
    const s = await scenario();
    await s.trace();
    const wired = await s.trace();
    await s.trace();
    await caller().takeoffRuns.addCircuit({
      runId: wired.id,
      name: "Circuit 1",
      conductorCount: 2,
      groundCount: 1,
    });
    expect(await s.onBid()).toBe(2);
  });
});
