/**
 * "Don't ask on this bid" (S3, 0147) and the category the prompts read
 * (scope-tags-plan.md step 6a), through the real router.
 *
 *   • dismissing sets `bids.scopePromptsDismissedAt`, "Ask again" clears it,
 *     and neither moves the bid's money;
 *   • another company's bid refuses, and its column is untouched;
 *   • `bids.get` gives each line its assembly's category — the company's
 *     fork answering for a line that stores the shipped id.
 *
 * Fixture ids 9991 / 9992 are this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, bidLineItems, bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9991;
const OTHER = 9992;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
dropFixtureUsersAfterAll([USER, OTHER]);

const caller = (id = USER) =>
  appRouter.createCaller({
    user: {
      id,
      openId: `test-scope-prompts-${id}`,
      role: "user",
      accessTier: "internal",
    },
  } as unknown as TrpcContext);

async function aBid(userId = USER) {
  return (await caller(userId).bids.create({
    name: `Scope prompts ${Date.now()}${Math.random()}`,
  }))!.id;
}

async function dismissedAt(bidId: number) {
  const database = (await getDb())!;
  const [row] = await database.select().from(bids).where(eq(bids.id, bidId));
  return row.scopePromptsDismissedAt;
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  for (const id of [USER, OTHER]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing)
      await database.insert(users).values({
        id,
        openId: `test-scope-prompts-${id}`,
        name: `Scope prompts fixture ${id}`,
        accessTier: "internal",
      });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = (await getDb())!;
  await database.delete(bids).where(inArray(bids.userId, [USER, OTHER]));
  await database
    .delete(assemblies)
    .where(inArray(assemblies.userId, [USER, OTHER]));
});

withDb("Don't ask on this bid", () => {
  it("sets and clears the column, and moves no money", async () => {
    const bidId = await aBid();
    const database = (await getDb())!;
    await database.insert(bidLineItems).values({
      bidId,
      name: "Light fixture",
      qty: "1",
      snapshotMaterialCost: "100.0000",
      snapshotLaborHours: "1.0000",
      snapshotLaborRate: "50.0000",
      snapshotModifierPct: "0.0000",
      snapshotUnpricedParts: 0,
    });
    const before = (await caller().bids.get({ id: bidId })).totals.directCost;
    expect(await dismissedAt(bidId)).toBeNull();

    await caller().bids.setScopePromptsDismissed({ bidId, dismissed: true });
    expect(await dismissedAt(bidId)).toBeInstanceOf(Date);
    expect((await caller().bids.get({ id: bidId })).totals.directCost).toBe(
      before
    );

    await caller().bids.setScopePromptsDismissed({ bidId, dismissed: false });
    expect(await dismissedAt(bidId)).toBeNull();
  });

  it("refuses another company's bid and leaves it as it was", async () => {
    const theirs = await aBid(OTHER);
    await expect(
      caller().bids.setScopePromptsDismissed({
        bidId: theirs,
        dismissed: true,
      })
    ).rejects.toThrow();
    expect(await dismissedAt(theirs)).toBeNull();
  });
});

withDb("the category the prompts read", () => {
  it("is the line's assembly's, the company's fork answering for a shipped id", async () => {
    const database = (await getDb())!;
    const [shipped] = await database
      .insert(assemblies)
      .values({ userId: OTHER, name: "Stand-in shipped", category: "Devices" })
      .$returningId();
    // A fork of it in USER's library, filed under Lighting: what USER means.
    await database.insert(assemblies).values({
      userId: USER,
      baselineId: shipped.id,
      name: "Stand-in fork",
      category: "Lighting",
    });
    const [mine] = await database
      .insert(assemblies)
      .values({ userId: USER, name: "My panel", category: "Panels" })
      .$returningId();

    const bidId = await aBid();
    const base = {
      bidId,
      qty: "1",
      snapshotMaterialCost: "0.0000",
      snapshotLaborHours: "0.0000",
      snapshotLaborRate: "0.0000",
      snapshotModifierPct: "0.0000",
      snapshotUnpricedParts: 0,
    };
    await database.insert(bidLineItems).values([
      { ...base, name: "typed line" },
      { ...base, name: "from my panel", assemblyId: mine.id },
      { ...base, name: "stores the shipped id", assemblyId: shipped.id },
    ]);
    const got = await caller().bids.get({ id: bidId });
    const byName = new Map(got.lines.map(l => [l.name, l.assemblyCategory]));
    expect(byName.get("typed line")).toBeNull();
    expect(byName.get("from my panel")).toBe("Panels");
    expect(byName.get("stores the shipped id")).toBe("Lighting");
  });
});
