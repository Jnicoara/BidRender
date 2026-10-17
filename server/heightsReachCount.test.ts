/**
 * Settings › Heights says "Changing a height here re-prices every bid that
 * has not set its own — N bids right now". A bid whose quantities are locked
 * (every bid that has left Draft is) keeps its numbers, so it must not be in
 * N: the count promised a reach the change does not have (copy pass,
 * 2026-10-16).
 *
 * Fixture id 9978 is this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bids, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9978;
const hasDb = Boolean(process.env.DATABASE_URL);
const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-heights-reach-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  const [existing] = await db!.select().from(users).where(eq(users.id, USER));
  if (!existing)
    await db!.insert(users).values({
      id: USER,
      openId: `test-heights-reach-${USER}`,
      name: "Heights reach test",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  await db!.delete(bids).where(eq(bids.userId, USER));
});

describe.skipIf(!hasDb)("the bids a height change reaches", () => {
  it("counts bids that follow their drawing, not locked ones", async () => {
    const open = await caller().bids.create({
      name: "Follows heights",
      trades: ["electrical"],
    });
    const locked = await caller().bids.create({
      name: "Locked heights",
      trades: ["electrical"],
    });
    await caller().bids.lockQuantities({ bidId: locked!.id });
    const { bidsInheriting } = await caller().takeoffHeights.company();
    expect(bidsInheriting).toBe(1);
    expect(open).toBeTruthy();
  });
});
