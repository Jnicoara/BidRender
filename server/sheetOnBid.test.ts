/**
 * A mark or a run is written under ONE bid, on a sheet of THAT bid
 * (break-it, Track B 2026-10-16).
 *
 * `takeoffStamps.drop` and `takeoffRuns.save` take a bid id and a sheet id
 * separately, and checked only that the sheet was the company's. So a mark
 * sent with bid A's id onto bid B's sheet was written: counted on neither
 * bid (every bid-wide read keeps to sheets on the bid — `onLivePlanSheet`),
 * yet drawn and listed on B's sheet — a ghost mark. And the lock check reads
 * the BID id, so B's quantities could be locked and its drawing still change
 * through A's id. Reachable by a crafted request, or a screen still holding
 * one bid's sheet while sending as another.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { as, at, bidWithSheet, freshUser, ft } from "./bidBuilders.testHelper";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9958;
const c = as(USER);
let a: { bidId: number; sheetId: number };
let b: { bidId: number; sheetId: number };
let groupOnA: number;

dropFixtureUsersAfterAll([USER]);

beforeAll(async () => {
  await freshUser(USER);
  a = await bidWithSheet(c, USER, "sheet-on-bid A");
  b = await bidWithSheet(c, USER, "sheet-on-bid B (locked)");
  const group = await c.takeoffGroups.create({
    bidId: a.bidId,
    label: "Duplex",
  });
  groupOnA = (group as { id: number }).id;
  await c.bids.lockQuantities({ bidId: b.bidId });
});

describe("a mark or run goes only on a sheet of its own bid", () => {
  it("refuses marks sent with bid A's id onto bid B's sheet", async () => {
    await expect(
      c.takeoffStamps.drop({
        bidId: a.bidId,
        sheetId: b.sheetId,
        groupId: groupOnA,
        at: at(2, 500),
      })
    ).rejects.toThrow(/Sheet not found on this bid/);
    expect(await c.takeoffStamps.listForSheet({ sheetId: b.sheetId })).toEqual(
      []
    );
  });

  it("refuses a run sent with bid A's id onto bid B's sheet", async () => {
    await expect(
      c.takeoffRuns.save({
        bidId: a.bidId,
        sheetId: b.sheetId,
        name: "ghost",
        pathType: "conduit",
        status: "committed",
        points: [
          { x: 0, y: 0 },
          { x: ft(20), y: 0 },
        ],
      })
    ).rejects.toThrow(/Sheet not found on this bid/);
    expect(await c.takeoffRuns.listForSheet({ sheetId: b.sheetId })).toEqual(
      []
    );
  });

  it("still places marks and runs on the bid's own sheet", async () => {
    const placed = await c.takeoffStamps.drop({
      bidId: a.bidId,
      sheetId: a.sheetId,
      groupId: groupOnA,
      at: at(2, 500),
    });
    expect(placed.dropped).toBe(2);
    const run = await c.takeoffRuns.save({
      bidId: a.bidId,
      sheetId: a.sheetId,
      name: "real",
      pathType: "conduit",
      status: "committed",
      points: [
        { x: 0, y: 0 },
        { x: ft(20), y: 0 },
      ],
    });
    expect(run).toBeTruthy();
  });
});
