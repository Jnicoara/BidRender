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
import { createRunCircuit, getDb } from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { undergroundRunTypeLabel } from "../shared/undergroundRunTypes";
import {
  circuitNeedsPickedWire,
  countRunsWithNoWire,
  emptyPipeLookup,
  runCarriesNoWire,
} from "../shared/runNoWire";

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
/** No type in these says "empty pipe". */
const saysNothing = () => false;
const none = new Map<number, unknown[]>();
const some = new Map<number, unknown[]>([[1, [{}]]]);

describe("which runs carry no wire", () => {
  it("flags a typed conduit run whose wire the bid would price, with none", () => {
    expect(runCarriesNoWire(row(), none, saysNothing)).toBe(true);
  });

  it("does not flag it once a circuit is there", () => {
    expect(runCarriesNoWire(row(), some, saysNothing)).toBe(false);
  });

  it("never flags a cable run — the cable is the wire", () => {
    expect(
      runCarriesNoWire(row({ pathType: "cable" }), none, saysNothing)
    ).toBe(false);
  });

  it("does not flag wire left out ON PURPOSE", () => {
    // No type: nothing to price, said elsewhere as "no run type".
    expect(runCarriesNoWire(row({ runTypeId: null }), none, saysNothing)).toBe(
      false
    );
    // An AI suggestion nobody accepted.
    expect(
      runCarriesNoWire(row({ isSuggestion: true }), none, saysNothing)
    ).toBe(false);
    // Answered branch wiring: the devices' whips carry it (D18).
    expect(
      runCarriesNoWire(
        row({
          startKind: "receptacle",
          endKind: "receptacle",
          branchWiring: true,
        }),
        none,
        saysNothing
      )
    ).toBe(false);
  });

  it("does not flag a run whose TYPE says empty pipe (0), and does flag NULL", () => {
    // 2026-10-08: a spare conduit was flagged forever, with no answer short
    // of putting wire in it. Zero on the type is that answer.
    // A MERGED palette, as getRunTypesFor returns it: shipped 8 was forked
    // as 9, so 8 itself is not in the list (shared/forkedRows.ts).
    const palette = [
      { id: 7, baselineId: null, conductorCount: 0 },
      { id: 6, baselineId: null, conductorCount: null },
      { id: 9, baselineId: 8, conductorCount: 0 },
    ];
    const lookup = emptyPipeLookup(palette);
    expect(runCarriesNoWire(row({ runTypeId: 7 }), none, lookup)).toBe(false);
    // NULL is "not said" — the shipped underground types — and still asks.
    expect(runCarriesNoWire(row({ runTypeId: 6 }), none, lookup)).toBe(true);
    // A run stored against the shipped id follows the fork's answer.
    expect(runCarriesNoWire(row({ runTypeId: 8 }), none, lookup)).toBe(false);
  });

  it("asks for the wire to be PICKED only where a circuit would have no material on purpose", () => {
    const noWire = { conductorMaterialId: null, conductorCount: null };
    // An underground trench: no wire said, a per-foot extra (the tape).
    expect(circuitNeedsPickedWire(noWire, 1)).toBe(true);
    // An empty pipe: the type says 0.
    expect(
      circuitNeedsPickedWire(
        { conductorMaterialId: null, conductorCount: 0 },
        0
      )
    ).toBe(true);
    // A plain raceway-only type: a circuit is the manual way to measure wire.
    expect(circuitNeedsPickedWire(noWire, 0)).toBe(false);
    // A type that names its wire, with tape or without.
    expect(
      circuitNeedsPickedWire({ conductorMaterialId: 9, conductorCount: 2 }, 1)
    ).toBe(false);
    expect(circuitNeedsPickedWire(null, 0)).toBe(false);
  });

  it("counts a branched run once, however many legs are empty (D20)", () => {
    const rows = [
      { ...row({ id: 1 }), parentRunId: null },
      { ...row({ id: 2 }), parentRunId: 1 },
      { ...row({ id: 3 }), parentRunId: null },
    ];
    expect(countRunsWithNoWire(rows, none, saysNothing)).toBe(2);
    expect(countRunsWithNoWire(rows, new Map([[3, [{}]]]), saysNothing)).toBe(
      1
    );
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
  const trace = (traceMode?: "quantity", runTypeId: number = type.id) =>
    caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId,
      name: "Homerun",
      pathType: "conduit",
      runTypeId,
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
  const traceAs = (runTypeId: number) => trace(undefined, runTypeId);
  return { bidId: bid.id, trace, traceAs, rowOf, onBid };
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

/*
  THE UNDERGROUND RUN (2026-10-08, owner: anything that can put a wrong number
  on a bid gets fixed now). The shipped underground types leave the wire
  unsaid on purpose (per-foot-items-plan.md § 3b), so a traced trench used to
  sit at "no wire" with no answer that fitted: "Add wires" pulled wire with no
  material named, and "empty pipe" did not exist.
*/
withDb("an underground run: pick its wire, or say it is an empty pipe", () => {
  async function trench() {
    const s = await scenario();
    const ug = (await caller().takeoffRunTypes.list({})).find(
      t => t.isShipped && t.label === undergroundRunTypeLabel('2"')
    )!;
    expect(ug).toBeDefined();
    const run = await s.traceAs(ug.id);
    const bridgeFor = async (runId: number) => {
      const typeId = (await s.rowOf(runId)).runTypeId!;
      const bridge = await caller().takeoffRunTypes.bridgeForBid({
        bidId: s.bidId,
      });
      return bridge.find(entry => entry.runTypeId === typeId)!;
    };
    return { ...s, ug, run, bridgeFor };
  }

  it("asks, and the bid's item says where to answer", async () => {
    const t = await trench();
    expect((await t.rowOf(t.run.id)).noWire).toBe(true);
    const item = (
      await caller().takeoffSummary.forBid({ bidId: t.bidId })
    ).notOnBid.find(i => i.key === "noWire")!;
    expect(item.fixAt?.runId).toBe(t.run.id);
    expect(item.fixAt?.pageNumber).toBe(1);
  });

  it("an EMPTY PIPE clears the question and keeps the tape", async () => {
    const t = await trench();
    const tapeBefore = (await t.bridgeFor(t.run.id)).rows.find(
      r => r.role === "extra"
    )!.feet;
    expect(tapeBefore).toBeGreaterThan(0);

    const result = await caller().takeoffRuns.respecify({
      id: t.run.id,
      racewayMaterialId: t.ug.racewayMaterialId,
      conductorMaterialId: null,
      conductorCount: null,
      emptyPipe: true,
    });
    expect(result.label).toBe('2" PVC Sch 40, empty pipe, underground');
    expect((await t.rowOf(t.run.id)).noWire).toBe(false);
    expect(await t.onBid()).toBe(0);

    const after = await t.bridgeFor(t.run.id);
    // Same tape, same feet — and no wire or ground row invented at 0.
    expect(after.rows.find(r => r.role === "extra")!.feet).toBe(tapeBefore);
    expect(after.rows.map(r => r.role).sort()).toEqual(["extra", "raceway"]);

    // A second empty trench lands on the same type, not a twin.
    const again = await t.traceAs(t.ug.id);
    const second = await caller().takeoffRuns.respecify({
      id: again.id,
      racewayMaterialId: t.ug.racewayMaterialId,
      conductorMaterialId: null,
      conductorCount: null,
      emptyPipe: true,
    });
    expect(second.runTypeId).toBe(result.runTypeId);
    expect(second.created).toBe(false);
  });

  it("PICKING THE WIRE prices it and keeps the tape", async () => {
    const t = await trench();
    const catalog = await caller().materials.list();
    const thhn6 = catalog.find(m => m.name === "#6 THHN Copper")!;
    expect(thhn6).toBeDefined();
    const tapeBefore = (await t.bridgeFor(t.run.id)).rows.find(
      r => r.role === "extra"
    )!.feet;

    await caller().takeoffRuns.respecify({
      id: t.run.id,
      racewayMaterialId: t.ug.racewayMaterialId,
      conductorMaterialId: thhn6.id,
      conductorCount: 2,
      emptyPipe: false,
    });
    expect((await t.rowOf(t.run.id)).noWire).toBe(false);
    const after = await t.bridgeFor(t.run.id);
    const wire = after.rows.find(r => r.role === "conductor")!;
    expect(wire.materialName).toBe("#6 THHN Copper");
    expect(wire.feet).toBeGreaterThan(0);
    expect(after.rows.find(r => r.role === "extra")!.feet).toBe(tapeBefore);
  });

  it("names the GROUND too when the type named none, so it can go on the bid", async () => {
    // Seen on screen 2026-10-08: picking only the wire left the circuit's
    // ground counted with nothing named — "can't go on the bid as it
    // stands", with no way to name it from the run.
    const t = await trench();
    const catalog = await caller().materials.list();
    const id = (name: string) => catalog.find(m => m.name === name)!.id;

    await caller().takeoffRuns.respecify({
      id: t.run.id,
      racewayMaterialId: t.ug.racewayMaterialId,
      conductorMaterialId: id("#6 THHN Copper"),
      conductorCount: 2,
      emptyPipe: false,
      groundMaterialId: id("#10 bare solid Copper"),
    });
    const ground = (await t.bridgeFor(t.run.id)).rows.find(
      r => r.role === "ground"
    )!;
    expect(ground.materialName).toBe("#10 bare solid Copper");
    expect(ground.feet).toBeGreaterThan(0);
    expect(ground.sendable).toEqual({ ok: true });
  });

  it("refuses a circuit on a type that names no wire, and writes none (never wire with no material)", async () => {
    const t = await trench();
    await expect(
      caller().takeoffRuns.addCircuit({
        runId: t.run.id,
        name: "Circuit 1",
        conductorCount: 2,
        groundCount: 1,
      })
    ).rejects.toThrow(/Pick the wire/);
    const row = await t.rowOf(t.run.id);
    expect(row.circuits).toHaveLength(0);
    expect(row.noWire).toBe(true);
    // The panel's circuit editor reads this to offer "Pick the wire".
    expect(row.pickWireToAdd).toBe(true);
  });

  it("refuses a circuit on an EMPTY PIPE too, which the type says on purpose", async () => {
    const t = await trench();
    await caller().takeoffRuns.respecify({
      id: t.run.id,
      racewayMaterialId: t.ug.racewayMaterialId,
      conductorMaterialId: null,
      conductorCount: null,
      emptyPipe: true,
    });
    expect((await t.rowOf(t.run.id)).pickWireToAdd).toBe(true);
    await expect(
      caller().takeoffRuns.addCircuit({
        runId: t.run.id,
        name: "Circuit 1",
        conductorCount: 2,
        groundCount: 1,
      })
    ).rejects.toThrow(/Pick the wire/);
  });

  it("still lets a plain raceway-only type take a circuit by hand", async () => {
    const s = await scenario();
    const catalog = await caller().materials.list();
    const plain = await caller().takeoffRunTypes.create({
      label: `Raceway only ${Date.now()}${Math.random()}`,
      pathType: "conduit",
      racewayMaterialId: catalog.find(m => m.name === '1/2" EMT')!.id,
    });
    const run = await s.traceAs(plain.id);
    expect((await s.rowOf(run.id)).pickWireToAdd).toBe(false);
    await caller().takeoffRuns.addCircuit({
      runId: run.id,
      name: "Ckt 1",
      conductorCount: 2,
      groundCount: 1,
    });
    expect((await s.rowOf(run.id)).circuits).toHaveLength(1);
  });

  it("refuses an empty pipe on a run that already has wire, and says why", async () => {
    const t = await trench();
    // A circuit written before addCircuit refused one here (2026-10-08) —
    // such rows exist, so respecify still has to say what to do with them.
    await createRunCircuit({
      runId: t.run.id,
      userId: USER,
      name: "Circuit 1",
      conductorCount: 2,
      groundCount: 1,
    });
    await expect(
      caller().takeoffRuns.respecify({
        id: t.run.id,
        racewayMaterialId: t.ug.racewayMaterialId,
        conductorMaterialId: null,
        conductorCount: null,
        emptyPipe: true,
      })
    ).rejects.toThrow(/Remove it first/);
  });
});
