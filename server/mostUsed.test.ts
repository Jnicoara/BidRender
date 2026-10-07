/**
 * "Most used" (shared/mostUsed.ts, assemblies.mostUsed) — the row at the top
 * of the assembly picker (references/top-assemblies-draft.md § 4).
 *
 * Pure rules first, then the procedure against the database: nothing below
 * 3 bids, counted by BIDS not lines, forks counted with their starter, the
 * sample bid / archived bids and lines left out, and a line added moves it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, bidLineItems, bids, users } from "../drizzle/schema";
import {
  MOST_USED_LIMIT,
  rankMostUsed,
  type AssemblyUse,
} from "../shared/mostUsed";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);
const use = (assemblyId: number, bidId: number, ago = 1): AssemblyUse => ({
  assemblyId,
  bidId,
  usedAt: daysAgo(ago),
});
const identity = (id: number) => id;

describe("ranking (pure)", () => {
  it("shows NOTHING until the company has 3 bids — no empty row", () => {
    const uses = [use(1, 10), use(1, 11)];
    expect(
      rankMostUsed(uses, { bidCount: 2, now: NOW, resolve: identity })
    ).toEqual([]);
    expect(
      rankMostUsed(uses, { bidCount: 3, now: NOW, resolve: identity })
    ).toHaveLength(1);
  });

  it("counts distinct BIDS, not lines", () => {
    // Assembly 1: on three bids. Assembly 2: many lines, ONE bid.
    const uses = [
      use(1, 10),
      use(1, 11),
      use(1, 12),
      use(2, 10),
      use(2, 10),
      use(2, 10),
      use(2, 10),
    ];
    const ranked = rankMostUsed(uses, {
      bidCount: 5,
      now: NOW,
      resolve: identity,
    });
    expect(ranked.map(r => [r.assemblyId, r.bids])).toEqual([
      [1, 3],
      [2, 1],
    ]);
  });

  it("counts a fork WITH its starter, under the one the library shows", () => {
    // 5 = the shipped starter, 50 = the company's fork of it.
    const resolve = (id: number) => (id === 5 ? 50 : id);
    const uses = [use(5, 10), use(50, 11), use(50, 12), use(7, 10), use(7, 11)];
    const ranked = rankMostUsed(uses, { bidCount: 5, now: NOW, resolve });
    expect(ranked[0]).toMatchObject({ assemblyId: 50, bids: 3 });
  });

  it("drops a use whose assembly is gone", () => {
    const ranked = rankMostUsed([use(9, 10), use(1, 10)], {
      bidCount: 3,
      now: NOW,
      resolve: id => (id === 9 ? undefined : id),
    });
    expect(ranked.map(r => r.assemblyId)).toEqual([1]);
  });

  it("only counts the last 12 months", () => {
    const ranked = rankMostUsed([use(1, 10, 400), use(2, 11, 30)], {
      bidCount: 3,
      now: NOW,
      resolve: identity,
    });
    expect(ranked.map(r => r.assemblyId)).toEqual([2]);
  });

  it("breaks ties by most recent use, and stops at 8", () => {
    const uses = Array.from({ length: 12 }, (_, i) =>
      use(i + 1, 100 + i, i + 1)
    );
    const ranked = rankMostUsed(uses, {
      bidCount: 12,
      now: NOW,
      resolve: identity,
    });
    expect(ranked).toHaveLength(MOST_USED_LIMIT);
    // All used once: the most recent (1 day ago = assembly 1) first.
    expect(ranked.map(r => r.assemblyId).slice(0, 3)).toEqual([1, 2, 3]);
  });
});

const COMPANY = 6221;
dropFixtureUsersAfterAll([COMPANY]);
const hasDb = Boolean(process.env.DATABASE_URL);
const caller = () =>
  appRouter.createCaller({
    user: { id: COMPANY, openId: `test-most-used-${COMPANY}`, role: "user" },
  } as unknown as TrpcContext);

describe.skipIf(!hasDb)("assemblies.mostUsed", () => {
  const ids: Record<string, number> = {};
  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-most-used-${COMPANY}`,
        name: "Most used company",
      });
    await db.delete(bids).where(eq(bids.userId, COMPANY));
    await db.delete(assemblies).where(eq(assemblies.userId, COMPANY));
    for (const name of ["Alpha", "Bravo", "Charlie", "Sample only"]) {
      const made = await caller().assemblies.create({
        name: `${name} ${Date.now()}${Math.random()}`,
        category: "Devices",
        baseLaborHours: 1,
      });
      ids[name] = made!.id;
    }
  });

  async function bidWith(
    names: string[],
    extra: Partial<typeof bids.$inferInsert> = {}
  ) {
    const bid = (await caller().bids.create({ name: `MU ${Date.now()}` }))!;
    const db = (await getDb())!;
    if (Object.keys(extra).length)
      await db.update(bids).set(extra).where(eq(bids.id, bid.id));
    for (const n of names)
      await caller().bids.addAssembly({ bidId: bid.id, assemblyId: ids[n] });
    return bid.id;
  }

  it("is EMPTY with fewer than 3 bids, then ranks by bids", async () => {
    await bidWith(["Alpha", "Bravo"]);
    await bidWith(["Alpha"]);
    expect(await caller().assemblies.mostUsed()).toEqual([]);

    const third = await bidWith(["Alpha", "Charlie"]);
    const ranked = await caller().assemblies.mostUsed();
    // Alpha first on 3 bids; Bravo and Charlie tie on 1 — added within the
    // same second here, so their order is the id tie-break, not asserted.
    expect([ranked[0].id, ranked[0].bids]).toEqual([ids.Alpha, 3]);
    expect(
      ranked
        .slice(1)
        .map(r => [r.id, r.bids])
        .sort((a, b) => a[0] - b[0])
    ).toEqual(
      [
        [ids.Bravo, 1],
        [ids.Charlie, 1],
      ].sort((a, b) => a[0] - b[0])
    );

    // A line added MOVES it: Bravo onto a second bid passes Charlie.
    await caller().bids.addAssembly({ bidId: third, assemblyId: ids.Bravo });
    const after = await caller().assemblies.mostUsed();
    expect(after.map(r => r.id).slice(0, 2)).toEqual([ids.Alpha, ids.Bravo]);
  });

  it("leaves out the sample bid, archived bids and archived lines", async () => {
    const db = (await getDb())!;
    for (let i = 0; i < 4; i++)
      await bidWith(["Sample only"], { isSample: true });
    await bidWith(["Sample only"], { archivedAt: new Date() });
    const live = await bidWith(["Sample only"]);
    await db
      .update(bidLineItems)
      .set({ archivedAt: new Date() })
      .where(eq(bidLineItems.bidId, live));
    const ranked = await caller().assemblies.mostUsed();
    expect(ranked.map(r => r.id)).not.toContain(ids["Sample only"]);
  });
});
