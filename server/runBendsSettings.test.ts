/**
 * The company's bend settings: each NULL-means-default, each reaches the
 * count, and the choices offered are exactly the sizes the catalog ships.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { takeoffBendDefaults, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { BEND_SIZE_CHOICES } from "../shared/runBends";
import { TRADE_SIZES } from "./seed/materials/types";

const USER = 8796;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-bend-settings-${USER}`, role: "user" },
  } as unknown as TrpcContext);

it("offers exactly the trade sizes the catalog ships raceway in", () => {
  // A size here with no raceway could never apply; a raceway size missing
  // here could never be chosen.
  expect([...BEND_SIZE_CHOICES]).toEqual([...TRADE_SIZES]);
});

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  const [existing] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  if (!existing) {
    await database.insert(users).values({
      id: USER,
      openId: `test-bend-settings-${USER}`,
      name: "Bend settings fixture",
    });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  const database = await getDb();
  await database!
    .delete(takeoffBendDefaults)
    .where(eq(takeoffBendDefaults.userId, USER));
});

withDb("company bend settings", () => {
  it("reads the shipped defaults when nothing is stored — and creates nothing", async () => {
    const bends = await caller().takeoffHeights.bends();
    expect(bends.stored).toEqual({
      factoryElbowFromSize: null,
      pullPointLimitDegrees: null,
      pullBoxFromSize: null,
    });
    expect(bends.effective).toEqual({
      factoryElbowFrom: '1-1/4"',
      pullPointLimit: 360,
      pullBoxFrom: '2"',
    });
    const database = await getDb();
    const rows = await database!
      .select()
      .from(takeoffBendDefaults)
      .where(eq(takeoffBendDefaults.userId, USER));
    expect(rows).toEqual([]);
  });

  it("sets one without touching the others, and NULL goes back to the default", async () => {
    await caller().takeoffHeights.setBends({ pullPointLimitDegrees: 270 });
    await caller().takeoffHeights.setBends({ factoryElbowFromSize: '1"' });
    let bends = await caller().takeoffHeights.bends();
    expect(bends.stored).toEqual({
      factoryElbowFromSize: '1"',
      pullPointLimitDegrees: 270,
      pullBoxFromSize: null,
    });
    expect(bends.effective.pullBoxFrom).toBe('2"');

    await caller().takeoffHeights.setBends({ pullPointLimitDegrees: null });
    bends = await caller().takeoffHeights.bends();
    expect(bends.stored.pullPointLimitDegrees).toBeNull();
    expect(bends.effective.pullPointLimit).toBe(360);
    // The other choice stayed.
    expect(bends.stored.factoryElbowFromSize).toBe('1"');
  });

  it("refuses a limit that is not offered and a size no raceway ships in", async () => {
    await expect(
      caller().takeoffHeights.setBends({
        pullPointLimitDegrees: 300 as unknown as 360,
      })
    ).rejects.toThrow();
    await expect(
      caller().takeoffHeights.setBends({
        factoryElbowFromSize: '5"' as unknown as '1"',
      })
    ).rejects.toThrow();
  });
});
