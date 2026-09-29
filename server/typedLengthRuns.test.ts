/**
 * TYPED-LENGTH RUNS — draw the path, type the length (§ 4c of
 * references/plan-viewer-overhaul.md; references/track-b-held-migrations-plan.md
 * § 2).
 *
 * Four things, and each one fails without the change it guards:
 *
 *   1. A typed run on a sheet with NO SCALE is counted — on the panel, in the
 *      totals and on the bid line — where before it was "not measured".
 *   2. Nothing recomputes it. Re-saving the points, moving a point and
 *      changing the sheet's scale all leave the typed number exactly as typed.
 *      This is the hazard § 4d names: `lengthInches` IS recomputed on every
 *      save, and a typed value stored there would have been lost.
 *   3. It is labelled typed wherever the footage appears, with what the drawn
 *      line measures beside it on a scaled sheet.
 *   4. Zero and negative are refused, and clearing goes back to the drawing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { footageByRunType } from "./runTypeFootage";
import { bidPdfSheets, bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  quantitiesForRun,
  runFeet,
  tracedRunOf,
  NO_VERTICALS,
} from "../shared/takeoffQuantities";
import { buildTakeoffExport, takeoffExportCsv } from "../shared/takeoffExport";

const USER = 9361;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-typed-length-${USER}`, role: "user" },
  } as unknown as TrpcContext);
const uniq = () => `${Date.now()}${Math.random()}`;

async function clean() {
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(eq(bids.userId, USER));
  await database.delete(bidPdfSheets).where(eq(bidPdfSheets.userId, USER));
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  const [existing] = await database!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database!.insert(users).values({
      id: USER,
      openId: `test-typed-length-${USER}`,
      name: "Typed length fixture",
    });
  }
  await clean();
});

afterAll(async () => {
  if (hasDb) await clean();
});

/** A bid with one sheet, optionally scaled at 1/4" = 1'-0" (ratio 48). */
async function bidWithSheet(scaled: boolean) {
  const bid = (await caller().bids.create({ name: `Typed ${uniq()}` }))!;
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId: bid.id,
    userId: USER,
    filename: "riser.pdf",
    storageKey: `test/${bid.id}/riser.pdf`,
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
  if (scaled)
    await caller().bidPdfs.setSheetScale({
      id: sheetId,
      scaleText: `1/4" = 1'-0"`,
    });
  const type = await caller().takeoffRunTypes.create({
    label: `Typed EMT ${uniq()}`,
    pathType: "conduit",
  });
  return { bidId: bid.id, sheetId, runTypeId: type.id };
}

/** 720 page points = 10 paper inches = 40 ft at 1/4" scale. */
const POINTS = [
  { x: 0, y: 0 },
  { x: 720, y: 0 },
];

async function saveRun(
  where: { bidId: number; sheetId: number; runTypeId: number },
  points = POINTS,
  id?: number
) {
  const result = await caller().takeoffRuns.save({
    ...(id ? { id } : {}),
    bidId: where.bidId,
    sheetId: where.sheetId,
    name: "Riser",
    pathType: "conduit",
    runTypeId: where.runTypeId,
    status: "committed",
    isSuggestion: false,
    points,
  });
  return result.id;
}

async function panelRow(sheetId: number, runId: number) {
  const rows = await caller().takeoffRuns.listForSheet({ sheetId });
  return rows.find(r => r.id === runId)!;
}

// ── The arithmetic, no database ─────────────────────────────────────────────

describe("runFeet with a typed length", () => {
  it("uses the typed length and does not need a scale", () => {
    const typed = tracedRunOf({
      pathType: "conduit",
      points: POINTS,
      typedLengthInches: "720.0000", // as MySQL returns a DECIMAL
    });
    expect(runFeet(typed, null)).toBe(60);
    // The drawn line would say 40 at this scale — the typed 60 wins.
    expect(runFeet(typed, 48)).toBe(60);
  });

  it("measures the points when nothing is typed, as before", () => {
    const traced = tracedRunOf({
      pathType: "conduit",
      points: POINTS,
      typedLengthInches: null,
    });
    expect(runFeet(traced, 48)).toBe(40);
    expect(runFeet(traced, null)).toBeNull();
  });

  it("reports a bad stored value as unmeasurable, never as the drawn length", () => {
    const bad = { pathType: "conduit" as const, points: POINTS };
    expect(runFeet({ ...bad, typedLengthInches: 0 }, 48)).toBeNull();
    expect(runFeet({ ...bad, typedLengthInches: -12 }, 48)).toBeNull();
    expect(runFeet({ ...bad, typedLengthInches: Number.NaN }, 48)).toBeNull();
  });

  it("says which kind of fact it is, and what the drawing measures", () => {
    const q = quantitiesForRun(
      { pathType: "conduit", points: POINTS, typedLengthInches: 720 },
      [],
      48,
      NO_VERTICALS
    )!;
    expect(q.lengthSource).toBe("typed");
    expect(q.runFeet).toBe(60);
    expect(q.drawnFeet).toBe(40);
    expect(q.conduitFeet).toBe(60);
  });
});

describe("the takeoff export keeps typed and traced apart", () => {
  it("puts typed feet in their own column, not under Traced", () => {
    const doc = buildTakeoffExport({
      bidName: "Riser job",
      preparedOn: new Date("2026-09-29T12:00:00Z"),
      sheets: [
        {
          sheetId: 1,
          planFile: "set.pdf",
          page: 1,
          number: "E6",
          title: "Riser",
        },
      ],
      counts: [],
      runs: [
        {
          sheetId: 1,
          key: "7",
          typeLabel: '3/4" EMT',
          pathType: "conduit",
          status: "committed",
          runCount: 2,
          totalFeet: 110,
          verticalFeet: 10,
          typedFeet: 60,
          wireFeet: 0,
          groundFeet: 0,
          unmeasurableCount: 0,
          branchCount: 0,
          unansweredCount: 0,
          endsNotCountedCount: 0,
        },
      ],
      untypedRunCount: 0,
    });
    const row = doc.bySheet.find(r => r.kind === "Run")!;
    expect(row.quantity).toBe(110);
    expect(row.tracedFeet).toBe(40);
    expect(row.typedFeet).toBe(60);
    expect(row.verticalFeet).toBe(10);
    expect(takeoffExportCsv(doc)).toContain('"Typed ft"');
  });
});

// ── Through the routers, against the test database ──────────────────────────

withDb("a typed run on a sheet with no scale", () => {
  it("is counted on the panel, in the totals and on the bid", async () => {
    const where = await bidWithSheet(false);
    const runId = await saveRun(where);

    // Before typing: the honest "not measured" state, exactly as today.
    expect((await panelRow(where.sheetId, runId)).quantities).toBeNull();

    await caller().takeoffRuns.setTypedLength({
      id: runId,
      typedLengthInches: 720,
    });

    const row = await panelRow(where.sheetId, runId);
    expect(row.quantities?.runFeet).toBe(60);
    expect(row.quantities?.lengthSource).toBe("typed");
    expect(row.quantities?.drawnFeet).toBeNull(); // no scale to draw against

    const totals = await caller().takeoffRuns.totals({ bidId: where.bidId });
    expect(totals.conduitFeet).toBe(60);
    expect(totals.unmeasurableCount).toBe(0);
    expect(totals.typedCount).toBe(1);

    const footage = await footageByRunType(where.bidId, USER, null);
    const line = footage.get(where.runTypeId)!;
    expect(line.conduitFeet).toBe(60);
    expect(line.typedFeet).toBe(60);
    expect(line.unmeasurableCount).toBe(0);
  });
});

withDb("finishing a run on a sheet with no scale", () => {
  it("finishes, and reports the typed length once there is one", async () => {
    const where = await bidWithSheet(false);
    const runId = await saveRun(where);

    // Finished before typing: allowed, and no number is invented.
    const untyped = await caller().takeoffRuns.commit({ id: runId });
    expect(untyped.runFeet).toBeNull();

    await caller().takeoffRuns.setTypedLength({
      id: runId,
      typedLengthInches: 720,
    });
    const typed = await caller().takeoffRuns.commit({ id: runId });
    expect(typed.runFeet).toBe(60);
    // Nothing was MEASURED — there is still no scale to measure against.
    expect(typed.lengthFeet).toBeNull();
  });
});

withDb("nothing recomputes a typed length", () => {
  it("survives a re-save, moved points and a new sheet scale", async () => {
    const where = await bidWithSheet(true);
    const runId = await saveRun(where);
    await caller().takeoffRuns.setTypedLength({
      id: runId,
      typedLengthInches: 720,
    });

    // The autosave path: the same points, saved again.
    await saveRun(where, POINTS, runId);
    // A moved point — the drawn line gets longer.
    await saveRun(
      where,
      [
        { x: 0, y: 0 },
        { x: 1440, y: 0 },
      ],
      runId
    );
    // A different scale on the sheet.
    await caller().bidPdfs.setSheetScale({
      id: where.sheetId,
      scaleText: `1/8" = 1'-0"`,
    });

    const row = await panelRow(where.sheetId, runId);
    expect(row.quantities?.runFeet).toBe(60);
    expect(row.quantities?.lengthSource).toBe("typed");
    // And the drawing's own figure moved, so the typed one is visibly apart:
    // 20 paper inches at 1/8" = 1'-0" is 160 ft.
    expect(row.quantities?.drawnFeet).toBe(160);
  });
});

withDb("setting and clearing a typed length", () => {
  it("refuses zero, negative and an absurd length, storing nothing", async () => {
    const where = await bidWithSheet(true);
    const runId = await saveRun(where);
    for (const bad of [0, -12, 200_000]) {
      await expect(
        caller().takeoffRuns.setTypedLength({
          id: runId,
          typedLengthInches: bad,
        })
      ).rejects.toThrow();
    }
    const row = await panelRow(where.sheetId, runId);
    expect(row.quantities?.lengthSource).toBe("traced");
    expect(row.quantities?.runFeet).toBe(40);
  });

  it("goes back to measuring the drawing when cleared", async () => {
    const where = await bidWithSheet(true);
    const runId = await saveRun(where);
    await caller().takeoffRuns.setTypedLength({
      id: runId,
      typedLengthInches: 720,
    });
    expect((await panelRow(where.sheetId, runId)).quantities?.runFeet).toBe(60);

    await caller().takeoffRuns.setTypedLength({
      id: runId,
      typedLengthInches: null,
    });
    const row = await panelRow(where.sheetId, runId);
    expect(row.quantities?.runFeet).toBe(40);
    expect(row.quantities?.lengthSource).toBe("traced");
  });
});
