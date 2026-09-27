/**
 * Traced runs through the API: the scale gate, shared runs, and draft saving.
 *
 * The pure arithmetic is pinned in server/takeoffMath.test.ts. This suite is
 * about the things only the server can guarantee:
 *
 *   • the scale gate is a CONTROL, not a disabled button — a request that
 *     bypasses the UI still cannot get a measured length out of an unscaled or
 *     not-to-scale sheet;
 *   • a draft is saved even when it cannot be measured, because the clicking is
 *     real work and losing it is worse than holding an unmeasured path;
 *   • conduit is counted once per run and wire per circuit, all the way through
 *     to the bid total.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getBidById, getDb } from "./db";
import { bidPdfSheets, bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { footageByRunType } from "./runTypeFootage";
import type { RunTypeFootageRow } from "./runTypeFootageCore";

const USER = 8383;
const OTHER_USER = 8384;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-runs-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

/** 25 paper inches — 100 feet at 1/4" = 1'-0". */
const RUN_100FT = [
  { x: 0, y: 0 },
  { x: 25 * 72, y: 0 },
];

/**
 * A bid with one document and one sheet, at a chosen scale.
 * Returns the ids the run procedures need.
 */
async function scenario(
  options: {
    scaleText?: string;
    notToScale?: boolean;
  } = {}
) {
  const bid = (await caller().bids.create({
    name: `Trace test ${Date.now()}${Math.random()}`,
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
  const sheet = sheets[0];

  if (options.scaleText) {
    await caller().bidPdfs.setSheetScale({
      id: sheet.id,
      scaleText: options.scaleText,
    });
  }
  if (options.notToScale) {
    // Persisted on the sheet — phase 2a only held this in browser state.
    await database!
      .update(bidPdfSheets)
      .set({ notToScale: true })
      .where(eq(bidPdfSheets.id, sheet.id));
  }

  return { bidId: bid.id, sheetId: sheet.id };
}

/** A run type of this company's own, so a run can be on the bid. */
async function aType(pathType: "conduit" | "cable") {
  return caller().takeoffRunTypes.create({
    label: `Test ${pathType} ${Date.now()}${Math.random()}`,
    pathType,
  });
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [USER, OTHER_USER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-runs-${id}`,
        name: `Trace test user ${id}`,
      });
    }
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  // Runs, circuits, sheets and pdfs all cascade from bids.
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER_USER]));
});

// ── The gate ─────────────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("the scale gate", () => {
  it("reports a scaled sheet as measurable", async () => {
    const { sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const result = await caller().takeoffRuns.measurability({ sheetId });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ratio).toBe(48);
  });

  it("reports an unscaled sheet as blocked, with the reason", async () => {
    const { sheetId } = await scenario();
    const result = await caller().takeoffRuns.measurability({ sheetId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-scale");
  });

  it("reports a NOT-TO-SCALE sheet as blocked even with a detected scale", async () => {
    const { sheetId } = await scenario({ notToScale: true });
    const database = await getDb();
    // Simulate detection having applied something — which must not clear the flag.
    await database!
      .update(bidPdfSheets)
      .set({ scaleRatio: "48.000000", scaleSource: "detected" })
      .where(eq(bidPdfSheets.id, sheetId));

    const result = await caller().takeoffRuns.measurability({ sheetId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-to-scale");
  });

  it("clears a NOT-TO-SCALE sheet once a scale is set by hand", async () => {
    const { sheetId } = await scenario({ notToScale: true });
    await caller().bidPdfs.setSheetScale({
      id: sheetId,
      scaleText: `1/4" = 1'-0"`,
    });

    const result = await caller().takeoffRuns.measurability({ sheetId });
    expect(result.ok).toBe(true);
  });

  it("REFUSES to produce a length by saving against an unscaled sheet", async () => {
    // The control, not the courtesy: bypassing the UI must not yield a number.
    const { bidId, sheetId } = await scenario();
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: RUN_100FT,
    });
    expect(saved.measured).toBe(false);
    expect(saved.lengthFeet).toBeNull();
  });

  it("REFUSES to commit a run on an unscaled sheet", async () => {
    const { bidId, sheetId } = await scenario();
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await expect(caller().takeoffRuns.commit({ id: saved.id })).rejects.toThrow(
      /no scale set/i
    );
  });

  it("REFUSES to commit a run on a not-to-scale sheet", async () => {
    const { bidId, sheetId } = await scenario({ notToScale: true });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await expect(caller().takeoffRuns.commit({ id: saved.id })).rejects.toThrow(
      /not to scale/i
    );
  });

  it("shows no quantities for runs on an unscaled sheet — not zero", async () => {
    const { bidId, sheetId } = await scenario();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: RUN_100FT,
    });
    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.quantities).toBeNull();
  });

  it("measures once a scale is set afterwards", async () => {
    // The recovery path: trace first, scale later, and the work is still there.
    const { bidId, sheetId } = await scenario();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await caller().bidPdfs.setSheetScale({
      id: sheetId,
      scaleText: `1/4" = 1'-0"`,
    });

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.quantities!.conduitFeet).toBe(100);
  });
});

// ── Saving and drafts ────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("saving trace work", () => {
  it("keeps the points even when the sheet cannot be measured", async () => {
    // The clicking is real work. Refusing the save to protect a number would
    // throw away the thing that took the time.
    const { bidId, sheetId } = await scenario();
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Unscaled",
      pathType: "conduit",
      points: RUN_100FT,
    });

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.points).toHaveLength(2);
    expect(run.quantities).toBeNull();
  });

  it("stores a partial trace as a draft", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "In progress",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      status: "draft",
    });

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.status).toBe("draft");
    expect(run.id).toBe(saved.id);
  });

  it("updates the same run in place as the trace grows — autosave", async () => {
    // Autosave must not leave a trail of half-drawn duplicates behind it.
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const first = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Growing",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
      ],
    });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      id: first.id,
      name: "Growing",
      pathType: "conduit",
      points: [
        { x: 0, y: 0 },
        { x: 720, y: 0 },
        { x: 720, y: 720 },
      ],
    });

    const runs = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(runs).toHaveLength(1);
    expect(runs[0].points).toHaveLength(3);
  });

  it("survives a reload — a draft is recoverable from the server", async () => {
    // The crash-recovery guarantee, at the layer that actually persists.
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Interrupted",
      pathType: "conduit",
      points: RUN_100FT,
      status: "draft",
    });

    // A completely fresh caller, as a reloaded page would be.
    const recovered = await callerFor(USER).takeoffRuns.listForSheet({
      sheetId,
    });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].name).toBe("Interrupted");
    expect(recovered[0].status).toBe("draft");
    expect(recovered[0].quantities!.runFeet).toBe(100);
  });

  it("refuses to commit a run with fewer than two points", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "One click",
      pathType: "conduit",
      points: [{ x: 5, y: 5 }],
    });
    await expect(caller().takeoffRuns.commit({ id: saved.id })).rejects.toThrow(
      /two points/i
    );
  });

  it("refuses a path with a non-finite coordinate", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    await expect(
      caller().takeoffRuns.save({
        bidId,
        sheetId,
        name: "Bad",
        pathType: "conduit",
        points: [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0 },
        ],
      })
    ).rejects.toThrow();
  });

  it("refuses another user's sheet", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    await expect(
      callerFor(OTHER_USER).takeoffRuns.save({
        bidId,
        sheetId,
        name: "Theirs",
        pathType: "conduit",
        points: RUN_100FT,
      })
    ).rejects.toThrow(/not found/i);
  });

  it("flags a run whose sheet scale changed after it was traced", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Traced at 1/4",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await caller().bidPdfs.setSheetScale({
      id: sheetId,
      scaleText: `1/8" = 1'-0"`,
    });

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.scaleChangedSinceTraced).toBe(true);
    // The length shown follows the CURRENT scale — double, at half the scale.
    expect(run.quantities!.runFeet).toBe(200);
  });
});

// ── Conduit vs wire, through the API ─────────────────────────────────────────

describe.skipIf(!hasDb)("shared runs", () => {
  /*
    Typed, because the totals count what the BID prices (shared/runOnBid.ts,
    2026-09-27) and a run with no type is not on the bid. These fixtures were
    untyped until then, which was fine while the totals counted any finished
    run; the arithmetic they pin — conduit once, wire per circuit — is
    unchanged, and so is every assertion below.
  */
  async function committedRun(pathType: "conduit" | "cable" = "conduit") {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const type = await aType(pathType);
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType,
      runTypeId: type.id,
      points: RUN_100FT,
    });
    await caller().takeoffRuns.commit({ id: saved.id });
    return { bidId, sheetId, runId: saved.id, runTypeId: type.id };
  }

  it("counts the conduit once and the wire per circuit", async () => {
    const { bidId, runId } = await committedRun();
    for (const name of ["Ckt 1", "Ckt 2", "Ckt 3"]) {
      await caller().takeoffRuns.addCircuit({ runId, name, conductorCount: 3 });
    }

    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.conduitFeet).toBe(100);
    expect(totals.wireFeet).toBe(900);
  });

  it("does not change the conduit total as circuits are added", async () => {
    const { bidId, runId } = await committedRun();
    const before = await caller().takeoffRuns.totals({ bidId });
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 1",
      conductorCount: 3,
    });
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 2",
      conductorCount: 3,
    });
    const after = await caller().takeoffRuns.totals({ bidId });

    expect(before.conduitFeet).toBe(100);
    expect(after.conduitFeet).toBe(100);
    expect(after.wireFeet).toBeGreaterThan(before.wireFeet);
  });

  it("gives a cable run no conduit and no separate wire", async () => {
    const { bidId } = await committedRun("cable");
    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.cableFeet).toBe(100);
    expect(totals.conduitFeet).toBe(0);
    expect(totals.wireFeet).toBe(0);
  });

  it("refuses to assign a circuit to a cable run", async () => {
    const { runId } = await committedRun("cable");
    await expect(
      caller().takeoffRuns.addCircuit({
        runId,
        name: "Ckt 1",
        conductorCount: 2,
      })
    ).rejects.toThrow(/cable run/i);
  });

  it("reflects an edited conductor count in the wire total", async () => {
    const { bidId, sheetId, runId } = await committedRun();
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 1",
      conductorCount: 2,
    });
    expect((await caller().takeoffRuns.totals({ bidId })).wireFeet).toBe(200);

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    await caller().takeoffRuns.updateCircuit({
      id: run.circuits[0].id,
      conductorCount: 4,
    });

    expect((await caller().takeoffRuns.totals({ bidId })).wireFeet).toBe(400);
    // The pipe is unchanged — only the wire moved.
    expect((await caller().takeoffRuns.totals({ bidId })).conduitFeet).toBe(
      100
    );
  });

  it("drops a circuit's wire when the circuit is removed", async () => {
    const { bidId, sheetId, runId } = await committedRun();
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 1",
      conductorCount: 3,
    });
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 2",
      conductorCount: 3,
    });
    expect((await caller().takeoffRuns.totals({ bidId })).wireFeet).toBe(600);

    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    await caller().takeoffRuns.removeCircuit({ id: run.circuits[0].id });

    const after = await caller().takeoffRuns.totals({ bidId });
    expect(after.wireFeet).toBe(300);
    expect(after.conduitFeet).toBe(100);
  });

  /*
    THE TWO TESTS BELOW WERE REWRITTEN 2026-09-27, NOT DELETED. They asserted
    that a draft was left out of the totals (T5) while the bid priced it — the
    very disagreement the owner asked to remove. They now assert the new rule:
    the totals count what the bid prices, drafts included, and SAY so.
  */
  it("counts a draft, as the bid does, and still leaves out a suggestion", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const type = await aType("conduit");
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Still drawing",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT,
      status: "draft",
    });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "AI idea",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT,
      status: "committed",
      isSuggestion: true,
    });

    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.conduitFeet).toBe(100);
    expect(totals.leftOut.draftCount).toBe(1);
  });

  it("reads the same before and after a draft is finished", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const type = await aType("conduit");
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Feeder",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT,
      status: "draft",
    });
    const draft = await caller().takeoffRuns.totals({ bidId });
    expect(draft.conduitFeet).toBe(100);
    expect(draft.leftOut.draftCount).toBe(1);

    await caller().takeoffRuns.commit({ id: saved.id });
    const finished = await caller().takeoffRuns.totals({ bidId });
    expect(finished.conduitFeet).toBe(100);
    expect(finished.leftOut.draftCount).toBe(0);
  });

  it("leaves out a run with no type, and says how many feet", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Untyped",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await caller().takeoffRuns.commit({ id: saved.id });

    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.conduitFeet).toBe(0);
    expect(totals.leftOut.noType).toEqual({
      count: 1,
      conduitFeet: 100,
      cableFeet: 0,
    });
  });

  it("keeps a branch-wiring conduit run's pipe and leaves out its wire", async () => {
    const { bidId, runId } = await committedRun();
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 1",
      conductorCount: 3,
    });
    await caller().takeoffRuns.setEnds({ id: runId, branchWiring: true });

    const totals = await caller().takeoffRuns.totals({ bidId });
    expect(totals.conduitFeet).toBe(100);
    expect(totals.wireFeet).toBe(0);
    expect(totals.leftOut.branch.count).toBe(1);
  });

  /*
    THE FORCING TEST. One bid holding every kind of run the rule sorts — a
    finished typed run, a draft, a run with no type, a branch-wiring run and a
    suggestion — and the totals must equal what the bid's own lines are built
    from, EXACTLY. This cannot pass while the two readings use different
    filters, which is how they drifted apart in the first place.
  */
  it("equals the footage the bid prices, run for run", async () => {
    const { bidId, sheetId, runId } = await committedRun();
    await caller().takeoffRuns.addCircuit({
      runId,
      name: "Ckt 1",
      conductorCount: 3,
    });
    const type = await aType("conduit");
    const draft = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Draft",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT.map(p => ({ x: p.x / 2, y: p.y + 100 })),
      status: "draft",
    });
    await caller().takeoffRuns.addCircuit({
      runId: draft.id,
      name: "D1",
      conductorCount: 2,
    });
    const branch = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Branch",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT.map(p => ({ x: p.x / 4, y: p.y + 200 })),
    });
    await caller().takeoffRuns.addCircuit({
      runId: branch.id,
      name: "B1",
      conductorCount: 2,
    });
    await caller().takeoffRuns.setEnds({ id: branch.id, branchWiring: true });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "No type",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Suggested",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT,
      isSuggestion: true,
    });

    const totals = await caller().takeoffRuns.totals({ bidId });
    const bid = await getBidById(bidId, USER);
    const priced = await footageByRunType(
      bidId,
      USER,
      bid?.distributionHeightInches ?? null
    );
    const sum = (pick: (r: RunTypeFootageRow) => number) =>
      Math.round(
        Array.from(priced.values()).reduce((s, r) => s + pick(r), 0) * 100
      ) / 100;

    expect(totals.conduitFeet).toBe(sum(r => r.conduitFeet));
    expect(totals.cableFeet).toBe(sum(r => r.cableFeet));
    expect(totals.wireFeet).toBe(sum(r => r.insulatedFeet + r.groundFeet));
    // And the sum is not trivially zero: 100 + 50 + 25 ft of pipe.
    expect(totals.conduitFeet).toBe(175);
  });
});

// ── AI suggestions ───────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("a suggested home run", () => {
  it("is never counted until the user accepts it", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const type = await aType("conduit");
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Suggested home run",
      pathType: "conduit",
      runTypeId: type.id,
      points: RUN_100FT,
      status: "committed",
      isSuggestion: true,
    });

    expect((await caller().takeoffRuns.totals({ bidId })).conduitFeet).toBe(0);

    // Accepting makes it a draft, and a draft is on the bid — so it counts
    // from here, not only once finished (2026-09-27).
    await caller().takeoffRuns.acceptSuggestion({ id: saved.id });
    expect((await caller().takeoffRuns.totals({ bidId })).conduitFeet).toBe(
      100
    );
  });

  it("shows as a suggestion until accepted", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Suggested",
      pathType: "conduit",
      points: RUN_100FT,
      isSuggestion: true,
    });
    const [run] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(run.isSuggestion).toBe(true);
  });

  it("refuses to accept something that is not a suggestion", async () => {
    const { bidId, sheetId } = await scenario({ scaleText: `1/4" = 1'-0"` });
    const saved = await caller().takeoffRuns.save({
      bidId,
      sheetId,
      name: "Hand traced",
      pathType: "conduit",
      points: RUN_100FT,
    });
    await expect(
      caller().takeoffRuns.acceptSuggestion({ id: saved.id })
    ).rejects.toThrow(/not a suggestion/i);
  });
});
