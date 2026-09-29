/**
 * A mark or a run whose plan set is gone must not reach a quantity.
 *
 * On a database with its foreign keys this cannot arise: deleting a plan set
 * cascades to its sheets, and each sheet to its marks and runs. But a database
 * copied with `CREATE TABLE … LIKE` has none (bidrender_local_b, measured
 * 2026-09-28: 0 foreign keys), and a restore done the wrong way would have
 * none either. On such a database the marks and runs stay behind, and until
 * 2026-09-28 every price and quantity read selected them by `bidId` alone —
 * so a deleted drawing's marks kept pricing, and its runs kept adding
 * connectors to the fittings count.
 *
 * So this test REMOVES the rows the way a database without links would —
 * foreign-key checks off, which also turns the cascade off — and asks every
 * read the bid prices from whether it can tell. Two ways to be orphaned, both
 * covered: the SHEET row gone (its plan set still there), and the PLAN SET row
 * gone (its sheet still there).
 *
 * The reference is a control bid built from the same steps without the extra
 * plan sets. "Reads like a bid that never had them" is an exact comparison;
 * hand-written expected numbers would only restate the arithmetic.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { appRouter } from "./routers";
import * as db from "./db";
import { getDb } from "./db";
import { footageByRunType } from "./runTypeFootage";
import { bidPdfSheets, bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9351;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-deleted-plans-${USER}`, role: "user" },
  } as unknown as TrpcContext);
const uniq = () => `${Date.now()}${Math.random()}`;

/**
 * Deleting the bids cascades to everything this file made EXCEPT plan C's
 * sheet: its plan set was removed with the cascade off, so nothing above it is
 * left to delete it through. Left behind, it is an orphan row in a database
 * that has its links, and the backup's restore test reloads every row. So the
 * sheets go by user as well.
 */
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
      openId: `test-deleted-plans-${USER}`,
      name: "Deleted plans fixture",
    });
  }
  await clean();
});

afterAll(async () => {
  if (hasDb) await clean();
});

/** One plan set with one sheet at 1/4" = 1'-0". */
async function planSet(bidId: number, name: string) {
  const database = await getDb();
  const [pdf] = await database!.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: `${name}.pdf`,
    storageKey: `test/${bidId}/${name}.pdf`,
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
  return { pdfId: pdf.insertId, sheetId };
}

/**
 * What goes on one sheet: `marks` Duplex marks and one finished EMT run of
 * `length` points. Different sizes per sheet, so a leak shows as a number.
 */
async function drawOn(
  bidId: number,
  sheetId: number,
  groupId: number,
  runTypeId: number,
  marks: number,
  length: number
) {
  await caller().takeoffStamps.drop({
    bidId,
    sheetId,
    groupId,
    at: Array.from({ length: marks }, (_, i) => ({ x: i + 1, y: 1 })),
  });
  await caller().takeoffRuns.save({
    bidId,
    sheetId,
    name: "Run",
    pathType: "conduit",
    runTypeId,
    status: "committed",
    isSuggestion: false,
    points: [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
  });
}

/**
 * A bid with plan set A (kept) and, when `extras`, plan sets B and C, each
 * with its own marks and run. The Duplex count goes on the bid at $10 a mark.
 */
async function buildBid(runTypeId: number, extras: boolean) {
  const bid = (await caller().bids.create({
    name: `Deleted plans ${uniq()}`,
  }))!;
  const bidId = bid.id;
  const group = await caller().takeoffGroups.create({ bidId, label: "Duplex" });

  const a = await planSet(bidId, "A");
  await drawOn(bidId, a.sheetId, group.id, runTypeId, 2, 480);

  let b: Awaited<ReturnType<typeof planSet>> | null = null;
  let c: Awaited<ReturnType<typeof planSet>> | null = null;
  if (extras) {
    b = await planSet(bidId, "B");
    await drawOn(bidId, b.sheetId, group.id, runTypeId, 3, 720);
    c = await planSet(bidId, "C");
    await drawOn(bidId, c.sheetId, group.id, runTypeId, 4, 960);
  }

  const { lineId } = await caller().takeoffGroups.sendToBid({ id: group.id });
  await caller().bids.updateLine({ bidId, id: lineId, materialCost: 10 });
  return { bidId, groupId: group.id, b, c };
}

/**
 * Delete rows the way a database with no foreign keys would: nothing cascades.
 * `FOREIGN_KEY_CHECKS = 0` is per SESSION, so this uses its own connection
 * rather than a pooled one that the app's next query might pick up.
 */
async function deleteWithoutCascade(sqlText: string, id: number) {
  const conn = await createConnection(process.env.DATABASE_URL!);
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query(sqlText, [id]);
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.end();
  }
}

/** Every read a bid's quantities or price come from. */
async function readings(bidId: number, groupId: number) {
  const [counts, stamps, runs, footage, bid, dashboard] = await Promise.all([
    db.countStampsByGroup(bidId, USER),
    db.getStampsForBid(bidId, USER),
    db.getRunsForBid(bidId, USER),
    footageByRunType(bidId, USER, null),
    caller().bids.get({ id: bidId }),
    caller().bids.dashboard(),
  ]);
  const card = dashboard.find(row => row.id === bidId)!;
  return {
    count: counts.get(groupId),
    stamps: stamps.length,
    runs: runs.length,
    // Every field of the row, with each fitting leg kept but its ids dropped:
    // the two bids' runs have different ids, and a leg is what an orphaned
    // unmeasurable run used to leak into (two connectors each).
    footage: Array.from(footage.values()).map(row => ({
      ...row,
      legs: row.legs.map(({ id, runId, from, to, ...leg }) => leg),
    })),
    lineQty: Number(bid.lines[0].qty),
    materialCost: bid.totals.materialCost,
    cardTotal: Number(card.totalDue.toFixed(2)),
  };
}

/**
 * The integration test above covers the reads that exist today. This covers
 * the next one: any server file that filters marks or runs by `bidId` must
 * also say `onLivePlanSheet(` within the same few lines. A new read by bid
 * alone would pass every other test and price a deleted drawing on a database
 * without links, which no test here builds unless asked.
 */
describe("every bid-wide read of marks or runs goes through onLivePlanSheet", () => {
  it("has no read by bidId alone", () => {
    const root = path.resolve(import.meta.dirname);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
          files.push(full);
      }
    };
    walk(root);

    const pattern = /eq\(\s*takeoff(Stamps|Runs)\.bidId\b/;
    const found: string[] = [];
    const bare: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!pattern.test(line)) return;
        const where = `${path.relative(root, file)}:${i + 1}`;
        found.push(where);
        const window = lines.slice(i, i + 5).join("\n");
        if (!window.includes("onLivePlanSheet(")) bare.push(where);
      });
    }
    // Not vacuous: the four reads that exist today are found.
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(bare).toEqual([]);
  });
});

withDb("a deleted plan set's marks and runs reach no quantity", () => {
  it("reads exactly like a bid that never had those plan sets", async () => {
    const emt = await caller().takeoffRunTypes.create({
      label: `Deleted plans EMT ${uniq()}`,
      pathType: "conduit",
    });

    const control = await buildBid(emt.id, false);
    const expected = await readings(control.bidId, control.groupId);
    // The control is not vacuous: two marks at $10, one run with footage.
    expect(expected.count).toBe(2);
    expect(expected.materialCost).toBe(20);
    expect(expected.footage[0].conduitFeet).toBeGreaterThan(0);

    const subject = await buildBid(emt.id, true);
    const before = await readings(subject.bidId, subject.groupId);
    // And B and C really do count while they exist: 2 + 3 + 4 marks.
    expect(before.count).toBe(9);
    expect(before.runs).toBe(3);

    // B loses its SHEET row; C loses its PLAN SET row. Nothing cascades.
    await deleteWithoutCascade(
      "DELETE FROM bid_pdf_sheets WHERE id = ?",
      subject.b!.sheetId
    );
    await deleteWithoutCascade(
      "DELETE FROM bid_pdfs WHERE id = ?",
      subject.c!.pdfId
    );

    const after = await readings(subject.bidId, subject.groupId);
    expect(after).toEqual(expected);
  });
});
