/**
 * THE PREVIEW SEGMENT IS NEVER PART OF A SAVED RUN.
 *
 * While tracing, the screen shows a dim "Next" length from the last point to
 * the cursor (client/src/lib/traceReadout.ts). That segment lives only in the
 * trace layer's own state and is never sent. The server does not accept a
 * length at all: it recomputes one from the points it stores.
 *
 * **This is a guard, not a fix-test, and it passed the day it was written.**
 * Nothing was broken here. It exists so that a later change that lets a
 * client-supplied length, or a cursor point, into a save goes red on every
 * surface that reports a run's footage: the run list, the totals and the bid
 * bridge.
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
import { pathRealInches } from "../shared/takeoffGeometry";

const USER = 9932;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-trace-preview-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

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
      openId: `test-trace-preview-${USER}`,
      name: "Trace preview fixture",
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

withDb("a saved run is its clicked points and nothing more", () => {
  it("reports the clicked path's length on every surface", async () => {
    const bid = (await caller().bids.create({
      name: `Trace preview ${Date.now()}${Math.random()}`,
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
    const emt = (await caller().materials.list()).find(
      m => m.name === '1/2" EMT'
    )!;
    const type = await caller().takeoffRunTypes.create({
      label: `1/2" EMT ${Date.now()}`,
      pathType: "conduit",
      racewayMaterialId: emt.id,
    });

    // 37 ft east, then 12 ft south: 49 ft clicked.
    const clicked = [
      { x: 0, y: 0 },
      { x: ft(37), y: 0 },
      { x: ft(37), y: ft(12) },
    ];
    await caller().takeoffRuns.save({
      bidId: bid.id,
      sheetId,
      name: "Clicked only",
      pathType: "conduit",
      runTypeId: type.id,
      status: "committed",
      points: clicked,
    });

    const feet = pathRealInches(clicked, 48)! / 12;
    expect(feet).toBeCloseTo(49, 6);

    const [listed] = await caller().takeoffRuns.listForSheet({ sheetId });
    expect(listed.quantities!.runFeet).toBeCloseTo(feet, 2);

    const totals = await caller().takeoffRuns.totals({ bidId: bid.id });
    expect(totals.conduitBoughtFeet).toBeCloseTo(feet, 2);

    const [entry] = await caller().takeoffRunTypes.bridgeForBid({
      bidId: bid.id,
    });
    expect(entry.rows.find(r => r.role === "raceway")!.feet).toBeCloseTo(
      feet,
      2
    );
  });
});
