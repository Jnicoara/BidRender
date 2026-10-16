/**
 * COUNTING DEEP TEST, MANUAL — a count worked the way people work it, with
 * the bid total checked against HAND MATH after every step (owner,
 * 2026-10-15 night). Through the real routers on the test database.
 *
 * One receptacle = $3.00 of parts + 0.15 h × $62 = $9.30 labor = $12.30.
 *
 *   step                                         marks   line qty   direct
 *   owner taps 5 on sheet 1, a second estimator
 *     taps 4 on sheet 2 at the same moment          9        9      110.70
 *   the estimator's batch is undone                 5        5       61.50
 *   …and redone                                     9        9      110.70
 *   two marked existing, one marked remove          9        6       73.80
 *   three tagged "Wall" (location, not money)       9        6       73.80
 *   the line tagged owner-furnished                 9        6       55.80
 *
 * The owner-furnished line keeps labor only: 6 × $9.30 = $55.80.
 *
 * Fixture users 9915 (owner) and 9916 (estimator in the owner's company).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { companies } from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";
import {
  as,
  at,
  duplexAssembly,
  freshUser,
  rate,
  type Caller,
} from "./bidBuilders.testHelper";
import { bidPdfs } from "../drizzle/schema";

const OWNER = 9915;
const MATE = 9916;
dropFixtureUsersAfterAll([OWNER, MATE]);
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  "a count worked by hand, totals against hand math",
  () => {
    let owner: Caller;
    let mate: Caller;
    let bidId = 0;
    let sheets: number[] = [];
    let groupId = 0;
    let lineId = 0;
    let mateIds: number[] = [];

    const state = async () => {
      const detail = await owner.bids.get({ id: bidId });
      const line = detail.lines.find(l => l.id === lineId)!;
      let marks = 0;
      for (const sheetId of sheets)
        marks += (await owner.takeoffStamps.listForSheet({ sheetId })).length;
      return {
        marks,
        qty: Number(line.qty),
        direct: detail.totals.directCost,
        due: detail.totals.totalDue,
      };
    };

    beforeAll(async () => {
      await freshUser(OWNER);
      await freshUser(MATE);
      owner = as(OWNER);
      mate = as(MATE);
      const journeyman = await rate(owner, "Manual journeyman", 62);
      const duplex = await duplexAssembly(owner, journeyman);

      // The estimator joins the owner's company (a seat for them first).
      await owner.materials.list(); // makes the owner's company
      const database = (await getDb())!;
      await database
        .update(companies)
        .set({ seatLimit: 3 })
        .where(eq(companies.ownerUserId, OWNER));
      const invite = await owner.company.invite({ role: "estimator" });
      await mate.company.acceptInvite({ code: invite.code });

      // One bid, a plan set of two sheets.
      const bid = (await owner.bids.create({
        name: "Manual counting",
        trades: ["electrical"],
      }))!;
      bidId = bid.id;
      const [pdf] = await database.insert(bidPdfs).values({
        bidId,
        userId: OWNER,
        filename: "E.pdf",
        storageKey: `test/manual/${bidId}/e.pdf`,
        byteSize: 1024,
        pageCount: 2,
        sortOrder: 0,
      });
      await owner.bidPdfs.ensureSheets({
        bidPdfId: pdf.insertId,
        pageCount: 2,
      });
      sheets = (await owner.bidPdfs.sheets({ bidPdfId: pdf.insertId })).map(
        s => s.id
      );
      const g = await owner.takeoffGroups.forAssembly({
        bidId,
        assemblyId: duplex.id,
      });
      if (!("id" in g)) throw new Error("expected one count");
      groupId = g.id as number;
    }, 90_000);

    it("two people tapping at once, on two sheets: 9 marks, one line of 9, $110.70", async () => {
      const [, mates] = await Promise.all([
        owner.takeoffStamps.drop({
          bidId,
          sheetId: sheets[0],
          groupId,
          at: at(5, 3000),
        }),
        mate.takeoffStamps.drop({
          bidId,
          sheetId: sheets[1],
          groupId,
          at: at(4, 3000),
        }),
      ]);
      mateIds = mates.ids;
      ({ lineId } = await owner.takeoffGroups.sendToBid({ id: groupId }));
      expect(await state()).toMatchObject({
        marks: 9,
        qty: 9,
        direct: 110.7,
        due: 110.7,
      });
    });

    it("undo the estimator's batch: 5 and $61.50; redo: back to 9 and $110.70", async () => {
      expect(mateIds).toHaveLength(4);
      const removed = await mate.takeoffStamps.removeMany({ ids: mateIds });
      expect(removed.removed).toBe(4);
      expect(await state()).toMatchObject({ marks: 5, qty: 5, direct: 61.5 });
      expect(removed.undo).not.toBeNull();
      await mate.takeoffStamps.restore({ undo: removed.undo! });
      expect(await state()).toMatchObject({ marks: 9, qty: 9, direct: 110.7 });
    });

    it("two marked existing and one remove: the line prices the 6 new ones, $73.80", async () => {
      const ids = (
        await owner.takeoffStamps.listForSheet({ sheetId: sheets[0] })
      ).map(m => m.id);
      await owner.takeoffStamps.setStatus({
        bidId,
        ids: ids.slice(0, 2),
        status: "existing",
      });
      await owner.takeoffStamps.setStatus({
        bidId,
        ids: ids.slice(2, 3),
        status: "remove",
      });
      expect(await state()).toMatchObject({ marks: 9, qty: 6, direct: 73.8 });
    });

    it("a location tag is where, not how many: totals do not move", async () => {
      const ids = (
        await owner.takeoffStamps.listForSheet({ sheetId: sheets[1] })
      ).map(m => m.id);
      for (const id of ids.slice(0, 3))
        await mate.takeoffStamps.setLocation({ id, location: "Wall" });
      expect(await state()).toMatchObject({ marks: 9, qty: 6, direct: 73.8 });
    });

    it("owner-furnished: parts come off, labor stays — 6 × $9.30 = $55.80", async () => {
      await owner.bids.setLineScope({
        bidId,
        lineIds: [lineId],
        scopeTag: "ofci",
      });
      expect(await state()).toMatchObject({
        marks: 9,
        qty: 6,
        direct: 55.8,
        due: 55.8,
      });
    });
  }
);
