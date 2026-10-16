/**
 * SPEED ON BIG DATA (owner's queue, 2026-10-16): the speed limits of
 * server/speedLimits.test.ts — a screen's reads under 2 s, a save under 1 s —
 * on a company far bigger than the everyday fixture:
 *
 *   60 bids, each with a sheet and 50 counted marks sent to the bid;
 *   one bid with a 500-sheet plan set and 5,000 marks on ONE sheet;
 *   the full shipped catalog (seeded).
 *
 * On demand only — `SPEED_BIG_DATA=1` — because building it takes a few
 * minutes and the Gate already holds the everyday limits on every push.
 * Results: references/stress-results-a.md "Speed on big data".
 *
 * Fixture user 9922 (deleted at the end, with everything it owns).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { bidPdfs } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  bidWithSheet,
  duplexAssembly,
  freshUser,
  rate,
  type Caller,
} from "./bidBuilders.testHelper";

const USER = 9922;
const run =
  Boolean(process.env.DATABASE_URL) && process.env.SPEED_BIG_DATA === "1";
if (run) dropFixtureUsersAfterAll([USER]);

const SCREEN_LIMIT_MS = 2000;
const SAVE_LIMIT_MS = 1000;
const RUNS = 3;

const grid = (n: number, x0: number, y0: number) =>
  Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % 70) * 30,
    y: y0 + Math.floor(i / 70) * 20,
  }));

async function timeIt(fn: (i: number) => Promise<unknown>) {
  await fn(0);
  const ms: number[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const t = performance.now();
    await fn(i);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  return { median: ms[Math.floor(ms.length / 2)], max: ms[ms.length - 1] };
}

describe.skipIf(!run)("speed on big data", () => {
  let c: Caller;
  let bigBid = 0;
  let bigSheet = 0;
  let bigPdf = 0;
  let groupId = 0;
  const built: Record<string, number> = {};

  beforeAll(async () => {
    const t0 = performance.now();
    await freshUser(USER);
    c = as(USER);
    const journeyman = await rate(c, "Big journeyman", 60);
    const duplex = await duplexAssembly(c, journeyman);

    // 60 bids, 50 marks each, sent.
    for (let i = 0; i < 60; i++) {
      const { bidId, sheetId } = await bidWithSheet(
        c,
        USER,
        `Big bid ${i + 1}`
      );
      const g = await c.takeoffGroups.forAssembly({
        bidId,
        assemblyId: duplex.id,
      });
      if (!("id" in g)) throw new Error("count");
      await c.takeoffStamps.drop({
        bidId,
        sheetId,
        groupId: g.id as number,
        at: grid(50, 200, 200),
      });
      await c.takeoffGroups.sendToBid({ id: g.id as number });
    }

    // One bid: a 500-sheet set, 5,000 marks on one sheet.
    const bid = (await c.bids.create({
      name: "Big set",
      trades: ["electrical"],
    }))!;
    bigBid = bid.id;
    const database = (await getDb())!;
    const [pdf] = await database.insert(bidPdfs).values({
      bidId: bigBid,
      userId: USER,
      filename: "Big set.pdf",
      storageKey: `test/big/${bigBid}/big.pdf`,
      byteSize: 400_000_000,
      pageCount: 500,
      sortOrder: 0,
    });
    bigPdf = pdf.insertId;
    await c.bidPdfs.ensureSheets({ bidPdfId: bigPdf, pageCount: 500 });
    const sheets = await c.bidPdfs.sheets({ bidPdfId: bigPdf });
    bigSheet = sheets[0].id;
    await c.bidPdfs.setSheetScale({ id: bigSheet, scaleText: `1/4" = 1'-0"` });
    const g = await c.takeoffGroups.forAssembly({
      bidId: bigBid,
      assemblyId: duplex.id,
    });
    if (!("id" in g)) throw new Error("count");
    groupId = g.id as number;
    for (let k = 0; k < 10; k++)
      await c.takeoffStamps.drop({
        bidId: bigBid,
        sheetId: bigSheet,
        groupId,
        at: grid(500, 100, 100 + k * 160),
      });
    await c.takeoffGroups.sendToBid({ id: groupId });
    built.sheets = sheets.length;
    built.marksOnSheet = (
      await c.takeoffStamps.listForSheet({ sheetId: bigSheet })
    ).length;
    built.bids = (await c.bids.dashboard()).length;
    built.buildSeconds = Math.round((performance.now() - t0) / 1000);
    console.log(`[big] built ${JSON.stringify(built)}`);
  }, 1_200_000);

  it("screens and saves on a big company stay inside the limits", async () => {
    const screens: Record<string, () => Promise<unknown>> = {
      Dashboard: () => Promise.all([c.bids.dashboard(), c.bids.archived()]),
      "Bid with 5,000 marks": () =>
        Promise.all([
          c.bids.get({ id: bigBid }),
          c.takeoffRunTypes.bridgeForBid({ bidId: bigBid }),
          c.bidPdfs.list({ bidId: bigBid }),
          c.assemblies.list(),
        ]),
      "Plans, the 5,000-mark sheet": () =>
        Promise.all([
          c.takeoffStamps.listForSheet({ sheetId: bigSheet }),
          c.takeoffGroups.list({ bidId: bigBid }),
          c.takeoffSummary.forBid({ bidId: bigBid }),
          c.takeoffRuns.totals({ bidId: bigBid }),
          c.materials.list(),
        ]),
      "Sheet list of 500": () => c.bidPdfs.sheets({ bidPdfId: bigPdf }),
      "Materials (full catalog)": () => c.materials.list(),
      "Materials list (5,000 marks)": () =>
        c.materialsList.get({ bidId: bigBid }),
      Proposal: () => c.proposals.document({ bidId: bigBid }),
    };
    const saves: Record<string, (i: number) => Promise<unknown>> = {
      "Place a mark on the 5,000 sheet": i =>
        c.takeoffStamps.drop({
          bidId: bigBid,
          sheetId: bigSheet,
          groupId,
          at: [{ x: 50 + i, y: 50 }],
        }),
      "Rename the big bid": i =>
        c.bids.update({ id: bigBid, name: `Big set ${i}` }),
    };
    const over: string[] = [];
    for (const [name, fn] of Object.entries(screens)) {
      const t = await timeIt(fn);
      console.log(
        `[big] screen ${name}: median ${t.median.toFixed(0)} ms, max ${t.max.toFixed(0)} ms`
      );
      if (t.median > SCREEN_LIMIT_MS)
        over.push(`${name} ${t.median.toFixed(0)} ms`);
    }
    for (const [name, fn] of Object.entries(saves)) {
      const t = await timeIt(fn);
      console.log(
        `[big] save ${name}: median ${t.median.toFixed(0)} ms, max ${t.max.toFixed(0)} ms`
      );
      if (t.median > SAVE_LIMIT_MS)
        over.push(`${name} ${t.median.toFixed(0)} ms`);
    }
    expect(over, "over the limit on big data").toEqual([]);
  }, 600_000);
});
