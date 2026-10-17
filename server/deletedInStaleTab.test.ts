/**
 * Two tabs: one deletes (archives) an assembly or material, the other still
 * shows it in a picker and adds it. A deleted thing must not land on a bid
 * or in a recipe behind the person's back — the screen they deleted it from
 * says it is in Recently deleted, and a bid line priced from it would be
 * something nobody can find in the library any more. Refused, in words,
 * with the way back (night 4 break-it loop, 2026-10-16).
 *
 * Fixture id 9977 is this file's alone.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { assemblies, bids, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 9977;
const hasDb = Boolean(process.env.DATABASE_URL);
const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-stale-tab-${USER}`, role: "user" },
  } as unknown as TrpcContext);

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  const [existing] = await db!.select().from(users).where(eq(users.id, USER));
  if (!existing)
    await db!.insert(users).values({
      id: USER,
      openId: `test-stale-tab-${USER}`,
      name: "Stale tab test",
    });
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  await db!.delete(bids).where(eq(bids.userId, USER));
  await db!.delete(assemblies).where(eq(assemblies.userId, USER));
  await db!.delete(materials).where(inArray(materials.userId, [USER]));
});

describe.skipIf(!hasDb)("a thing deleted in another tab", () => {
  it("is not added to a bid, and the bid's lines do not change", async () => {
    const asm = await caller().assemblies.create({
      name: "Stale tab duplex",
      category: "Devices",
      baseLaborHours: 0.5,
    });
    const bid = await caller().bids.create({
      name: "Stale tab bid",
      trades: ["electrical"],
    });
    await caller().assemblies.archive({ id: asm!.id });
    await expect(
      caller().bids.addAssembly({ bidId: bid!.id, assemblyId: asm!.id })
    ).rejects.toThrow(/deleted.*Recently deleted/);
    const detail = await caller().bids.get({ id: bid!.id });
    expect(detail?.lines).toHaveLength(0);
  });

  it("a deleted material is not put into a recipe", async () => {
    const mat = await caller().materials.create({
      name: "Stale tab wire nut",
      unitOfSale: "each",
      costPerUnit: 0.25,
      category: "Receptacles",
    });
    await caller().materials.archive({ id: mat!.id });
    await expect(
      caller().assemblies.create({
        name: "Stale tab recipe",
        category: "Devices",
        baseLaborHours: 0.5,
        materials: [{ materialId: mat!.id, qty: 2 }],
      })
    ).rejects.toThrow(/deleted.*Recently deleted/);
  });

  it("restored, it adds again", async () => {
    const asm = await caller().assemblies.create({
      name: "Stale tab quad",
      category: "Devices",
      baseLaborHours: 0.5,
    });
    const bid = await caller().bids.create({
      name: "Stale tab bid 2",
      trades: ["electrical"],
    });
    await caller().assemblies.archive({ id: asm!.id });
    await caller().assemblies.restore({ id: asm!.id });
    const added = await caller().bids.addAssembly({
      bidId: bid!.id,
      assemblyId: asm!.id,
    });
    expect(added.line).toBeTruthy();
  });
});
