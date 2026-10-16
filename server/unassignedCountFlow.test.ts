/**
 * "Just count, pick the item later" end to end (references/count-first-plan.md):
 * marks go into the bid's ONE Unassigned count, it reads as "Unassigned",
 * it never reaches the bid, and its marks block a priced print until they
 * are assigned. Each `it` is red on the code before this change.
 *
 * Fixture user 9790 is this file's own.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9790;
dropFixtureUsersAfterAll([USER]);
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-unassigned-${USER}`, role: "user" },
  } as unknown as TrpcContext);

describeDb("a bid with marks nobody has named yet", () => {
  beforeAll(async () => {
    const database = (await getDb())!;
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, USER))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id: USER,
        openId: `test-unassigned-${USER}`,
        name: "Unassigned count fixture",
      });
  });

  beforeEach(async () => {
    const database = (await getDb())!;
    await database.delete(bids).where(inArray(bids.userId, [USER]));
  });

  async function aBidWithThreeUnassigned() {
    const bid = (await caller().bids.create({
      name: `Unassigned bid ${Date.now()}${Math.random()}`,
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
    const held = await caller().takeoffGroups.unassigned({ bidId: bid.id });
    await caller().takeoffStamps.drop({
      bidId: bid.id,
      sheetId: sheet.id,
      groupId: held.id,
      at: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 300, y: 100 },
      ],
    });
    return { bidId: bid.id, heldId: held.id };
  }

  it("there is ONE Unassigned count per bid, and it reads as 'Unassigned'", async () => {
    const { bidId, heldId } = await aBidWithThreeUnassigned();
    const again = await caller().takeoffGroups.unassigned({ bidId });
    expect(again.id).toBe(heldId);
    const { groups, waitingToSend } = await caller().takeoffGroups.list({
      bidId,
    });
    const held = groups.find(r => r.id === heldId)!;
    expect(held.label).toBe("Unassigned");
    expect(held.unassigned).toBe(true);
    expect(held.count).toBe(3);
    // Never offered to the bid: "Send" has nothing waiting.
    expect(held.sendability).toEqual({ sendable: false, reason: "unassigned" });
    expect(waitingToSend).toBe(0);
  });

  it("blocks a priced print until the marks are assigned", async () => {
    const { bidId, heldId } = await aBidWithThreeUnassigned();
    expect((await caller().proposals.document({ bidId })).unassignedMarks).toBe(
      3
    );

    // Pick what they are: a named count, all three moved in one go.
    const exits = await caller().takeoffGroups.create({
      bidId,
      label: "Exit signs",
    });
    const moved = await caller().takeoffStamps.moveToGroup({
      fromGroupId: heldId,
      groupId: exits.id,
    });
    expect(moved.moved).toBe(3);
    expect((await caller().proposals.document({ bidId })).unassignedMarks).toBe(
      0
    );
    const { groups } = await caller().takeoffGroups.list({ bidId });
    expect(groups.find(r => r.id === exits.id)?.count).toBe(3);
  });

  it("moving marks INTO it says 'Unassigned', never the stored label", async () => {
    const { bidId, heldId } = await aBidWithThreeUnassigned();
    const exits = await caller().takeoffGroups.create({
      bidId,
      label: "Exit signs",
    });
    await caller().takeoffStamps.moveToGroup({
      fromGroupId: heldId,
      groupId: exits.id,
    });
    const back = await caller().takeoffStamps.moveToGroup({
      fromGroupId: exits.id,
      groupId: heldId,
    });
    // The screen's toast reads "Moved 3 marks to <label>".
    expect(back.label).toBe("Unassigned");
  });

  it("an undo that cannot put it back says 'Unassigned', never the stored label", async () => {
    const { bidId, heldId } = await aBidWithThreeUnassigned();
    const removed = await caller().takeoffGroups.remove({ id: heldId });
    // "Just count" again starts a new Unassigned count.
    await caller().takeoffGroups.unassigned({ bidId });
    await expect(
      caller().takeoffGroups.restore({ undo: removed.undo! })
    ).rejects.toThrow(/^(?!.*__unassigned__).*Unassigned/);
  });

  it("nobody can make a count of their own that looks like it", async () => {
    const { bidId } = await aBidWithThreeUnassigned();
    await expect(
      caller().takeoffGroups.create({ bidId, label: "__unassigned__" })
    ).rejects.toThrow(/kept for marks nobody has named/);
    await expect(
      caller().takeoffGroups.create({ bidId, label: "Unassigned" })
    ).rejects.toThrow(/kept for marks nobody has named/);
  });
});
