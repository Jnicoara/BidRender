/**
 * UNDO FOR THE RUN EDITS THAT MOVE A NUMBER (Track B Gap 4c, 2026-10-08).
 *
 * Run type, typed length, circuits and legs each change what the bid buys,
 * and until 2026-10-08 none of them was an undo step: Ctrl+Z after one took
 * back whatever came BEFORE it instead. Each now returns the run's network as
 * it was, sealed, and `takeoffRuns.restore` puts it back.
 *
 * What carries the risk, and what each case checks:
 *   • **Before-and-after of the same figures.** A restore that did nothing
 *     would pass a check that only looked for `undo` in the reply (CLAUDE.md
 *     § "a count taken before the change is intent"). So the run list, the
 *     totals and the bridge are read before the edit, after it — where they
 *     must have MOVED, or the case proves nothing — and after the restore.
 *   • **Redo is the same call again**, so each case sends it a second time
 *     and checks the figures land where the edit first put them.
 *   • **A step whose run moved on is refused**, and changes nothing.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
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

const USER = 9981;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-run-edit-undo-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function scenario() {
  const bid = (await caller().bids.create({
    name: `Run edit undo ${Date.now()}${Math.random()}`,
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
  const material = (name: string) => catalog.find(m => m.name === name)!;
  const half = await caller().takeoffRunTypes.create({
    label: `1/2" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: material('1/2" EMT').id,
  });
  const threeQuarter = await caller().takeoffRunTypes.create({
    label: `3/4" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: material('3/4" EMT').id,
  });
  // 70 ft: 40 east, then 30 south.
  const run = await caller().takeoffRuns.save({
    bidId: bid.id,
    sheetId,
    name: "Main",
    pathType: "conduit",
    runTypeId: half.id,
    status: "committed",
    points: [
      { x: 0, y: 0 },
      { x: ft(40), y: 0 },
      { x: ft(40), y: ft(30) },
    ],
  });
  const circuit = await caller().takeoffRuns.addCircuit({
    runId: run.id,
    name: "Ckt 1",
    conductorCount: 2,
    groundCount: 1,
  });
  return {
    bidId: bid.id,
    sheetId,
    runId: run.id,
    circuitId: circuit.id,
    halfId: half.id,
    threeQuarterId: threeQuarter.id,
  };
}

/** Every figure the screen and the bid read for this sheet's runs. */
async function figures(bidId: number, sheetId: number) {
  const [runs, totals, bridge] = await Promise.all([
    caller().takeoffRuns.listForSheet({ sheetId }),
    caller().takeoffRuns.totals({ bidId }),
    caller().takeoffRunTypes.bridgeForBid({ bidId }),
  ]);
  return {
    runs: [...runs].sort((a, b) => a.id - b.id),
    totals,
    bridge,
  };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

/**
 * The whole contract for one edit: it moves the figures, its packet puts them
 * back exactly, and sending it again lands where it first did.
 */
async function undoesAndRedoes(
  s: Scenario,
  edit: () => Promise<{
    undo:
      | Parameters<
          ReturnType<typeof caller>["takeoffRuns"]["restore"]
        >[0]["undo"]
      | null;
  }>
) {
  const before = await figures(s.bidId, s.sheetId);
  const done = await edit();
  expect(done.undo).toBeTruthy();
  const after = await figures(s.bidId, s.sheetId);
  // The edit really moved something, or putting it back proves nothing.
  expect(after).not.toEqual(before);

  await caller().takeoffRuns.restore({ undo: done.undo! });
  expect(await figures(s.bidId, s.sheetId)).toEqual(before);

  // Redo: the same call again.
  const again = await edit();
  expect(again.undo).toBeTruthy();
  const redone = await figures(s.bidId, s.sheetId);
  expect(redone.totals).toEqual(after.totals);
  expect(redone.bridge).toEqual(after.bridge);
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
      openId: `test-run-edit-undo-${USER}`,
      name: `Run edit undo fixture ${USER}`,
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER]));
  await database
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER]));
  await database.delete(materials).where(inArray(materials.userId, [USER]));
});

withDb("undoing a run edit that moves a number", () => {
  it("puts a run's TYPE back", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.setRunType({
        id: s.runId,
        runTypeId: s.threeQuarterId,
      })
    );
  });

  it("puts a run's type back after it was cleared", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.setRunType({ id: s.runId, runTypeId: null })
    );
  });

  it("puts a run back after it was respecified", async () => {
    const s = await scenario();
    const catalog = await caller().materials.list();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.respecify({
        id: s.runId,
        racewayMaterialId: catalog.find(m => m.name === '1" EMT')!.id,
        conductorMaterialId: null,
        conductorCount: null,
      })
    );
  });

  it("puts a TYPED LENGTH back, both typing one and clearing one", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.setTypedLength({
        id: s.runId,
        typedLengthInches: 120 * 12,
      })
    );
    // The redo left 120 ft typed; clearing it is its own step.
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.setTypedLength({
        id: s.runId,
        typedLengthInches: null,
      })
    );
  });

  it("takes an ADDED circuit back off", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.addCircuit({
        runId: s.runId,
        name: "Ckt 2",
        conductorCount: 3,
        groundCount: 1,
      })
    );
  });

  it("puts a CHANGED circuit back", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.updateCircuit({
        id: s.circuitId,
        conductorCount: 4,
      })
    );
  });

  it("puts a REMOVED circuit back, same id", async () => {
    const s = await scenario();
    const before = await figures(s.bidId, s.sheetId);
    const done = await caller().takeoffRuns.removeCircuit({ id: s.circuitId });
    expect(
      (await figures(s.bidId, s.sheetId)).totals.wireBoughtFeet
    ).not.toEqual(before.totals.wireBoughtFeet);
    await caller().takeoffRuns.restore({ undo: done.undo! });
    const back = await figures(s.bidId, s.sheetId);
    expect(back).toEqual(before);
    // Same id, so redo (remove it again) still names a circuit that exists.
    const again = await caller().takeoffRuns.removeCircuit({
      id: s.circuitId,
    });
    expect(again.undo).toBeTruthy();
  });

  it("takes an added LEG back off, the tee's cut included", async () => {
    const s = await scenario();
    await undoesAndRedoes(s, () =>
      caller().takeoffRuns.addLeg({
        runId: s.runId,
        points: [
          { x: ft(15), y: 0 },
          { x: ft(15), y: -ft(20) },
        ],
        start: {
          kind: "tee",
          hostRunId: s.runId,
          at: { x: ft(15), y: 0 },
          tolerance: 3,
          fitting: "box",
          stampId: null,
        },
        endKind: "distribution",
      })
    );
  });

  /*
    Found building this: adding legs to a FINISHED run ends by committing it
    again, and the screen pushed "run finished" for that too — whose undo
    deletes the whole run. `wasCommitted` is how the screen tells the two
    apart, and `onDraft` stops a leg of a run still being traced pushing a
    step that the finish already covers.
  */
  it("says a commit was of a run already finished, so its undo is not 'delete the run'", async () => {
    const s = await scenario();
    const again = await caller().takeoffRuns.commit({ id: s.runId });
    expect(again.wasCommitted).toBe(true);

    const draft = await caller().takeoffRuns.save({
      bidId: s.bidId,
      sheetId: s.sheetId,
      name: "Draft",
      pathType: "conduit",
      runTypeId: s.halfId,
      status: "draft",
      points: [
        { x: 0, y: ft(50) },
        { x: ft(10), y: ft(50) },
      ],
    });
    const leg = await caller().takeoffRuns.addLeg({
      runId: draft.id,
      points: [
        { x: ft(10), y: ft(50) },
        { x: ft(10), y: ft(60) },
      ],
      start: { kind: "free", startKind: null },
      endKind: null,
    });
    expect(leg.onDraft).toBe(true);
    const first = await caller().takeoffRuns.commit({ id: draft.id });
    expect(first.wasCommitted).toBe(false);

    const onFinished = await caller().takeoffRuns.addLeg({
      runId: s.runId,
      points: [
        { x: ft(40), y: ft(30) },
        { x: ft(50), y: ft(30) },
      ],
      start: { kind: "free", startKind: null },
      endKind: null,
    });
    expect(onFinished.onDraft).toBe(false);
  });

  it("refuses a step whose run has moved on since, and changes nothing", async () => {
    const s = await scenario();
    const first = await caller().takeoffRuns.setTypedLength({
      id: s.runId,
      typedLengthInches: 100 * 12,
    });
    await caller().takeoffRuns.setTypedLength({
      id: s.runId,
      typedLengthInches: 200 * 12,
    });
    const now = await figures(s.bidId, s.sheetId);
    await expect(
      caller().takeoffRuns.restore({ undo: first.undo! })
    ).rejects.toThrow(/changed since/);
    expect(await figures(s.bidId, s.sheetId)).toEqual(now);
  });
});
