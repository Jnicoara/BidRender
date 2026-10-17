/**
 * Renaming a count (break-it, Track B 2026-10-16). `takeoffGroups.rename`
 * took any count on any bid: the Unassigned count could be renamed into an
 * ordinary one — its unnamed marks became sendable and the priced-print
 * block lifted with nobody having said what they are — and a count on a bid
 * whose quantities are LOCKED could be renamed, where its siblings
 * (`setLaborRoleHours`, `setDrop`) refuse. Both went through before the fix.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { as, at, bidWithSheet, freshUser } from "./bidBuilders.testHelper";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9961;
const c = as(USER);
dropFixtureUsersAfterAll([USER]);
let bidId = 0;
let sheetId = 0;

beforeAll(async () => {
  await freshUser(USER);
  ({ bidId, sheetId } = await bidWithSheet(c, USER, "rename check"));
});

describe("renaming a count", () => {
  it("renames an ordinary count", async () => {
    const g = (await c.takeoffGroups.create({ bidId, label: "Duplex" })) as {
      id: number;
    };
    expect(
      await c.takeoffGroups.rename({ id: g.id, label: "Duplex, GFCI" })
    ).toEqual({ id: g.id, label: "Duplex, GFCI" });
  });

  it("refuses to turn the Unassigned count into an ordinary one", async () => {
    const pen = (await c.takeoffGroups.unassigned({ bidId })) as {
      id: number;
    };
    await c.takeoffStamps.drop({
      bidId,
      sheetId,
      groupId: pen.id,
      at: at(2, 400),
    });
    await expect(
      c.takeoffGroups.rename({ id: pen.id, label: "Now a normal count" })
    ).rejects.toThrow(/picking what they are/);
  });

  it("refuses on a bid whose quantities are locked", async () => {
    const g = (await c.takeoffGroups.create({ bidId, label: "Exit sign" })) as {
      id: number;
    };
    await c.bids.lockQuantities({ bidId });
    await expect(
      c.takeoffGroups.rename({ id: g.id, label: "Something else" })
    ).rejects.toThrow(/locked/);
  });
});
