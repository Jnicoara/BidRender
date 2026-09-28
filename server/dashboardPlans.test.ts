/**
 * The Dashboard knows each bid's plans (2026-09-27): the Plans chip on a card
 * and the "Recent plans" row both read `plans` off `bids.dashboard`.
 *
 * The counts are correlated subqueries rather than a join, because joining
 * bid_pdfs into a query that sums line items would multiply every line by the
 * number of plan sets. The line-count assertion below is what goes red if
 * somebody "simplifies" it into a join.
 *
 * Fixture ids are distinct from every other suite.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bidPdfs, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 7481;
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-dashboard-plans-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  const [existing] = await db!
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await db!.insert(users).values({
      id: USER,
      openId: `test-dashboard-plans-${USER}`,
      name: "Dashboard plans test user",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  await db!.delete(bids).where(eq(bids.userId, USER));
});

async function attach(bidId: number, pageCount: number | null, at: Date) {
  const db = await getDb();
  await db!.insert(bidPdfs).values({
    bidId,
    userId: USER,
    filename: "E.pdf",
    storageKey: `test/${bidId}/${Math.random()}.pdf`,
    byteSize: 1,
    pageCount,
    sortOrder: 0,
    createdAt: at,
  });
}

describe.skipIf(!hasDb)("plans on the dashboard", () => {
  it("counts a bid's sets and sheets, and when the newest was attached", async () => {
    const bid = (await caller().bids.create({
      name: "With plans",
      trades: ["electrical"],
    }))!;
    await attach(bid.id, 5, new Date("2026-09-20T10:00:00Z"));
    await attach(bid.id, 3, new Date("2026-09-22T10:00:00Z"));

    const row = (await caller().bids.dashboard()).find(b => b.id === bid.id)!;
    expect(row.plans.sets).toBe(2);
    expect(row.plans.pages).toBe(8);
    expect(row.plans.setsUncounted).toBe(0);
    expect(row.plans.lastUploadedAt?.toISOString()).toBe(
      "2026-09-22T10:00:00.000Z"
    );
  });

  it("says when a set has not been opened, so its sheets are not known", async () => {
    const bid = (await caller().bids.create({
      name: "Never opened",
      trades: ["electrical"],
    }))!;
    await attach(bid.id, null, new Date());
    const row = (await caller().bids.dashboard()).find(b => b.id === bid.id)!;
    expect(row.plans).toMatchObject({ sets: 1, pages: 0, setsUncounted: 1 });
  });

  it("does not multiply a bid's lines by its plan sets", async () => {
    const bid = (await caller().bids.create({
      name: "Lines and plans",
      trades: ["electrical"],
    }))!;
    const [assembly] = await caller().assemblies.list();
    await caller().bids.addAssembly({
      bidId: bid.id,
      assemblyId: assembly.id,
      qty: 2,
    });
    const before = (await caller().bids.dashboard()).find(
      b => b.id === bid.id
    )!;
    await attach(bid.id, 4, new Date());
    await attach(bid.id, 6, new Date());
    await attach(bid.id, 2, new Date());
    const after = (await caller().bids.dashboard()).find(b => b.id === bid.id)!;

    expect(after.lineCount).toBe(before.lineCount);
    expect(after.totalDue).toBe(before.totalDue);
    expect(after.plans.sets).toBe(3);
  });

  it("shows no plans on a bid without any", async () => {
    const bid = (await caller().bids.create({
      name: "No drawings",
      trades: ["electrical"],
    }))!;
    const row = (await caller().bids.dashboard()).find(b => b.id === bid.id)!;
    expect(row.plans).toEqual({
      sets: 0,
      pages: 0,
      setsUncounted: 0,
      lastUploadedAt: null,
    });
  });
});
