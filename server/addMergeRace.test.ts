/**
 * TWO COUNTS OF ONE ASSEMBLY AT ONCE — both land, on one line.
 *
 * The Count screen adds with `merge: true`: a repeat count stacks onto the
 * existing line. Two of them arriving together — a fast double Enter, two
 * people on one bid, or counts held offline and sent the moment the signal
 * came back — both read the line's quantity and both wrote it plus one: a
 * line at 1 counted twice ended at 2, ONE COUNT LOST, with nothing said. On an
 * empty bid both found no line and both inserted, one count split over two
 * lines. Drill, 2026-10-15 (references/overnight-log.md 6x). Fixture id 9481
 * is this file's alone.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users, type User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const USER = 9481;
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

describeDb("counting one assembly twice at once", () => {
  let assemblyId = 0;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.delete(users).where(eq(users.id, USER));
    await db
      .insert(users)
      .values({ id: USER, openId: `test-add-race-${USER}`, name: "Race" });
    [me] = await db.select().from(users).where(eq(users.id, USER));
    const material = await caller().materials.create({
      name: `Race material ${USER}`,
      unitOfSale: "each",
      costPerUnit: 2,
      category: "Receptacles",
    });
    const rates = await caller().laborRates.list();
    const assembly = await caller().assemblies.create({
      name: `Race assembly ${USER}`,
      category: "Devices",
      trade: "electrical",
      projectType: "both",
      baseLaborHours: 1,
      laborRateId: rates[0].id,
      materials: [{ materialId: material!.id, qty: 1 }],
      modifierIds: [],
    });
    assemblyId = assembly!.id;
  });

  const add = (bidId: number) =>
    caller().bids.addAssembly({ bidId, assemblyId, qty: 1, merge: true });
  const quantities = async (bidId: number) =>
    (await caller().bids.get({ id: bidId }))!.lines.map(l => Number(l.qty));

  it("adds BOTH to an existing line — none is lost", async () => {
    for (let run = 0; run < 4; run++) {
      const bid = (await caller().bids.create({ name: `Merge race ${run}` }))!;
      await add(bid.id);
      await Promise.all([add(bid.id), add(bid.id), add(bid.id)]);
      expect(await quantities(bid.id)).toEqual([4]);
    }
  });

  it("makes ONE line on an empty bid, holding every count", async () => {
    for (let run = 0; run < 4; run++) {
      const bid = (await caller().bids.create({ name: `Merge race e${run}` }))!;
      await Promise.all([add(bid.id), add(bid.id)]);
      expect(await quantities(bid.id)).toEqual([2]);
    }
  });

  it("still makes a NEW line each time without merge (the Bids screen)", async () => {
    const bid = (await caller().bids.create({ name: "No merge" }))!;
    await Promise.all([
      caller().bids.addAssembly({ bidId: bid.id, assemblyId, qty: 1 }),
      caller().bids.addAssembly({ bidId: bid.id, assemblyId, qty: 1 }),
    ]);
    expect((await quantities(bid.id)).sort()).toEqual([1, 1]);
  });
});
