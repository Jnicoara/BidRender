/**
 * The preview segment — last clicked point to the cursor — is NEVER part of a
 * saved run, the bid's quantity or the totals (owner, 2026-09-29 and again
 * 2026-10-07: "if anything does, it is a wrong-number bug").
 *
 * The pill is pinned by client/src/lib/traceReadout.test.ts. This pins the
 * SAVE: whatever a client sends alongside the points — a length, a cursor
 * point — the server measures the clicked points and nothing else. Its twin,
 * client/src/lib/traceSavePath.test.ts, pins that TraceLayer never hands the
 * cursor up as a point. references/track-b-plans-screen-gaps-plan.md, Gap 5.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidPdfs,
  bids,
  materials,
  takeoffRunTypes,
  takeoffRuns,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9941;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-preview-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** At 1/4" = 1'-0", one real foot is 18 page points. */
const ft = (n: number) => n * 18;

async function sheetWithType() {
  const bid = (await caller().bids.create({
    name: `Preview ${Date.now()}${Math.random()}`,
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
  await caller().bidPdfs.setSheetScale({
    id: sheets[0].id,
    scaleText: `1/4" = 1'-0"`,
  });
  const emt = (await caller().materials.list()).find(
    m => m.name === '1/2" EMT'
  )!;
  const type = await caller().takeoffRunTypes.create({
    label: `1/2" EMT ${Date.now()}${Math.random()}`,
    pathType: "conduit",
    racewayMaterialId: emt.id,
  });
  return { bidId: bid.id, sheetId: sheets[0].id, typeId: type.id };
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
      openId: `test-preview-${USER}`,
      name: "Preview fixture",
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

withDb("a traced run's length is its clicked points, nothing more", () => {
  it("ignores a length or a cursor point sent with the points", async () => {
    const s = await sheetWithType();
    // Two clicks, 30 ft apart. The cursor is a further 500 ft away — the
    // preview segment a stray mouse would draw.
    const sent = {
      bidId: s.bidId,
      sheetId: s.sheetId,
      name: "Feeder",
      pathType: "conduit" as const,
      runTypeId: s.typeId,
      status: "committed" as const,
      points: [
        { x: 0, y: 0 },
        { x: ft(30), y: 0 },
      ],
      // Neither is part of the API. A client that sent them anyway must not
      // move a number.
      lengthInches: 530 * 12,
      hover: { x: ft(530), y: 0 },
    };
    const run = await caller().takeoffRuns.save(sent);

    const database = (await getDb())!;
    const [stored] = await database
      .select()
      .from(takeoffRuns)
      .where(eq(takeoffRuns.id, run.id));
    expect(stored.points).toEqual(sent.points);
    expect(Number(stored.lengthInches)).toBeCloseTo(30 * 12, 2);

    // The bid's quantity for that type: 30 ft of raceway, not 530.
    const [entry] = await caller().takeoffRunTypes.bridgeForBid({
      bidId: s.bidId,
    });
    expect(entry.rows.find(r => r.role === "raceway")!.feet).toBeCloseTo(30, 2);
  });
});
