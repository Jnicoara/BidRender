/**
 * A color chosen for a run type (run colors Part B, migration 0088), through
 * the routers — what the type editor saves and what the drawing reads.
 *
 * The rules themselves (a chosen color wins; automatic types skip the colors
 * chosen on the same bid; a fork's color reaches runs naming the shipped id)
 * are pinned without a database in client/src/lib/runAppearance.test.ts. This
 * file proves the two ends are wired to them: `takeoffRunTypes.update` stores
 * it, and `takeoffRuns.typeColors` hands it to `runTypeColor`.
 *
 * Fixture ids are distinct from every other suite — vitest shares one database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, takeoffRunTypes, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { MARK_COLORS, runTypeColor } from "../shared/takeoffMarks";

const USER = 9861;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-run-type-color-${USER}`, role: "user" },
  } as unknown as TrpcContext);

const [blue, pink, violet] = MARK_COLORS;

async function aBid() {
  const bid = (await caller().bids.create({
    name: `Run type color ${Date.now()}${Math.random()}`,
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

async function aRun(
  bidId: number,
  sheetId: number,
  runTypeId: number,
  y: number
) {
  return caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Color probe",
    pathType: "conduit",
    status: "committed",
    runTypeId,
    points: [
      { x: 0, y },
      { x: 180, y },
    ],
  });
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
      openId: `test-run-type-color-${USER}`,
      name: "Run type color fixture",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(eq(bids.userId, USER));
  await database
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER]));
});

afterAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(eq(bids.userId, USER));
  await database
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [USER]));
});

withDb("choosing a run type's color", () => {
  it("stores it, and 'Automatic' (null) clears it", async () => {
    const mine = await caller().takeoffRunTypes.create({
      label: `Mine ${Date.now()}${Math.random()}`,
      pathType: "conduit",
    });
    const id = mine!.id;
    await caller().takeoffRunTypes.update({ id, color: pink });
    let row = (await caller().takeoffRunTypes.list()).find(t => t.id === id);
    expect(row!.color).toBe(pink);

    await caller().takeoffRunTypes.update({ id, color: null });
    row = (await caller().takeoffRunTypes.list()).find(t => t.id === id);
    expect(row!.color).toBeNull();
  });

  it("refuses a color outside the six", async () => {
    const mine = await caller().takeoffRunTypes.create({
      label: `Mine ${Date.now()}${Math.random()}`,
      pathType: "conduit",
    });
    await expect(
      caller().takeoffRunTypes.update({
        id: mine!.id,
        // @ts-expect-error — the input is typed to the palette; the server
        // must refuse it too, for a caller that is not this client.
        color: "#123456",
      })
    ).rejects.toThrow();
  });

  it("forks a SHIPPED type, and the fork carries the color (answer 3)", async () => {
    const shipped = (await caller().takeoffRunTypes.list()).find(
      t => t.isShipped && t.pathType === "conduit"
    );
    if (!shipped) throw new Error("no shipped conduit type to fork");
    const result = await caller().takeoffRunTypes.update({
      id: shipped.id,
      color: violet,
    });
    expect(result.forked).toBe(true);
    const list = await caller().takeoffRunTypes.list();
    const fork = list.find(t => t.id === result.id);
    expect(fork!.color).toBe(violet);
    // The shipped row itself is untouched — no company's choice lands on it.
    const database = (await getDb())!;
    const [baseline] = await database
      .select()
      .from(takeoffRunTypes)
      .where(eq(takeoffRunTypes.id, shipped.id));
    expect(baseline.color).toBeNull();
  });

  it("reaches runs that were traced under the shipped id", async () => {
    const shipped = (await caller().takeoffRunTypes.list()).find(
      t => t.isShipped && t.pathType === "conduit"
    );
    if (!shipped) throw new Error("no shipped conduit type to fork");
    const { bidId, sheetId } = await aBid();
    await aRun(bidId, sheetId, shipped.id, 20); // traced BEFORE the fork
    const { id: forkId } = await caller().takeoffRunTypes.update({
      id: shipped.id,
      color: violet,
    });

    const colors = await caller().takeoffRuns.typeColors({ bidId });
    expect(colors.sameAs[shipped.id]).toBe(forkId);
    // The run still names the shipped id and is drawn in the fork's color.
    expect(runTypeColor(shipped.id, colors)).toBe(violet);
  });

  it("makes the automatic types on the bid skip it (answer 1)", async () => {
    const make = async () =>
      (await caller().takeoffRunTypes.create({
        label: `Type ${Date.now()}${Math.random()}`,
        pathType: "conduit",
      }))!.id;
    const [first, second] = [await make(), await make()];
    const { bidId, sheetId } = await aBid();
    await aRun(bidId, sheetId, first, 20);
    await aRun(bidId, sheetId, second, 40);

    let colors = await caller().takeoffRuns.typeColors({ bidId });
    expect(runTypeColor(first, colors)).toBe(blue);
    expect(runTypeColor(second, colors)).toBe(pink);

    // The SECOND type chooses blue; the first, automatic, steps to pink.
    await caller().takeoffRunTypes.update({ id: second, color: blue });
    colors = await caller().takeoffRuns.typeColors({ bidId });
    expect(runTypeColor(second, colors)).toBe(blue);
    expect(runTypeColor(first, colors)).toBe(pink);
  });
});
