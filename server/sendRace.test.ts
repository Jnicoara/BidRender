/**
 * TWO SENDS OF ONE COUNT AT ONCE — one line, and a calm answer for the other.
 *
 * A double-click sends `takeoffGroups.sendToBid` twice at the same moment.
 * The unique key on (bid, count) already let only ONE line in, so the bid's
 * number was never doubled — but the losing request answered with the raw
 * failed INSERT (a 500, shown as an error over a send that worked). It now
 * answers exactly as a second send made later does: CONFLICT, "already on the
 * bid". Race drill, 2026-10-14. Fixture id 9479 is this file's alone.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  bidCloseoutLines,
  bidCloseouts,
  bidLineItems,
  bidPdfs,
  users,
  type User,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9479;
dropFixtureUsersAfterAll([USER]);
const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

let me: User;
const caller = () =>
  appRouter.createCaller({
    user: me,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);

describeDb("sending one count twice at once", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    await db.delete(users).where(eq(users.id, USER));
    await db
      .insert(users)
      .values({ id: USER, openId: `test-send-race-${USER}`, name: "Race" });
    [me] = await db.select().from(users).where(eq(users.id, USER));
  });

  it("makes one line, and the other send says it is already on the bid", async () => {
    const db = (await getDb())!;
    const bid = (await caller().bids.create({ name: "Send race" }))!;
    const [pdf] = await db.insert(bidPdfs).values({
      bidId: bid.id,
      userId: USER,
      filename: "race.pdf",
      storageKey: `test/${bid.id}/race.pdf`,
      byteSize: 1024,
      pageCount: 1,
      sortOrder: 0,
    });
    const { sheets } = await caller().bidPdfs.ensureSheets({
      bidPdfId: pdf.insertId,
      pageCount: 1,
      outline: [],
    });
    for (let run = 0; run < 3; run++) {
      const group = await caller().takeoffGroups.create({
        bidId: bid.id,
        label: `Race ${run}`,
      });
      await caller().takeoffStamps.drop({
        bidId: bid.id,
        sheetId: sheets[0].id,
        groupId: group.id,
        at: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      });
      const results = await Promise.allSettled([
        caller().takeoffGroups.sendToBid({ id: group.id }),
        caller().takeoffGroups.sendToBid({ id: group.id }),
      ]);
      const lines = await db
        .select()
        .from(bidLineItems)
        .where(eq(bidLineItems.takeoffGroupId, group.id));
      expect(lines).toHaveLength(1);
      const refused = results.filter(r => r.status === "rejected");
      // Usually one wins and one is refused; if the second only starts after
      // the first has finished, the refusal is the ordinary one — same words.
      for (const r of refused)
        expect((r as PromiseRejectedResult).reason).toMatchObject({
          code: "CONFLICT",
          message: expect.stringMatching(/already on the bid/),
        });
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    }
  });

  it("two close-out saves at once leave one close-out with ONE set of lines", async () => {
    const db = (await getDb())!;
    const bid = (await caller().bids.create({ name: "Close-out race" }))!;
    const save = (actual: number) =>
      caller().closeout.save({
        bidId: bid.id,
        mode: "byAssembly",
        lines: [
          {
            assemblyId: null,
            assemblyName: "Duplex",
            qty: 2,
            estimatedHours: 1,
            actualHours: actual,
          },
          {
            assemblyId: null,
            assemblyName: "Switch",
            qty: 1,
            estimatedHours: 1,
            actualHours: actual,
          },
        ],
      });
    const results = await Promise.allSettled([save(3), save(4)]);
    expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const closeouts = await db
      .select()
      .from(bidCloseouts)
      .where(eq(bidCloseouts.bidId, bid.id));
    expect(closeouts).toHaveLength(1);
    const lines = await db
      .select()
      .from(bidCloseoutLines)
      .where(eq(bidCloseoutLines.closeoutId, closeouts[0].id));
    // One save's two lines, all from the same save — never four.
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map(l => Number(l.actualHours))).size).toBe(1);
  });
});
