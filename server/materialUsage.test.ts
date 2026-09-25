/**
 * materials.usage — how often each material is on THIS company's bids.
 *
 * What carries the risk, and so what these pin:
 *   • ISOLATION. It is a per-company signal; another contractor's bids must
 *     never move this one's search. So a second company bids the same
 *     material, and must not show up.
 *   • ALL FOUR PATHS a material reaches a bid by. Missing one undercounts
 *     silently — a ranking that is merely a bit worse, which nobody reports.
 *   • PER BID, not per line: forty lines of one part on one job count once.
 *   • A shipped row's use is credited to the company's FORK of it, which is
 *     the row their library actually shows.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bids,
  materials,
  takeoffGroups,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const A = 8741;
const B = 8742;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = hasDb ? describe : describe.skip;
const BASELINE_NAME = "Usage test shipped row 8741";

const caller = (id: number) =>
  appRouter.createCaller({
    user: { id, openId: `test-material-usage-${id}`, role: "user" },
  } as unknown as TrpcContext);

async function clean() {
  const database = await getDb();
  if (!database) return;
  await database.delete(bids).where(inArray(bids.userId, [A, B]));
  await database.delete(assemblies).where(inArray(assemblies.userId, [A, B]));
  await database
    .delete(takeoffRunTypes)
    .where(inArray(takeoffRunTypes.userId, [A, B]));
  await database.delete(materials).where(inArray(materials.userId, [A, B]));
  await database
    .delete(materials)
    .where(and(isNull(materials.userId), eq(materials.name, BASELINE_NAME)));
}

async function material(
  userId: number | null,
  name: string,
  baselineId?: number
) {
  const database = await getDb();
  const [row] = await database!.insert(materials).values({
    userId,
    name,
    unitOfSale: "each",
    costPerUnit: "0.0000",
    baselineId: baselineId ?? null,
  });
  return row.insertId;
}

async function assemblyOf(userId: number, name: string, materialIds: number[]) {
  const database = await getDb();
  const [row] = await database!.insert(assemblies).values({
    userId,
    name,
    category: "Devices",
    baseLaborHours: "0.1000",
  });
  for (const materialId of materialIds) {
    await database!
      .insert(assemblyMaterials)
      .values({ assemblyId: row.insertId, materialId, qty: "1.0000" });
  }
  return row.insertId;
}

async function aBid(userId: number, name: string) {
  const bid = (await caller(userId).bids.create({
    name: `${name} ${Date.now()}${Math.random()}`,
    trades: ["electrical"],
  }))!;
  return bid.id;
}

async function line(
  bidId: number,
  fields: Partial<typeof bidLineItems.$inferInsert> = {}
) {
  const database = await getDb();
  await database!
    .insert(bidLineItems)
    .values({ bidId, name: "usage test line", ...fields });
}

const ids: Record<string, number> = {};

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database) return;
  for (const id of [A, B]) {
    const [existing] = await database
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await database.insert(users).values({
        id,
        openId: `test-material-usage-${id}`,
        name: `Material usage fixture ${id}`,
      });
    }
  }
  await clean();

  // Company A's parts.
  ids.viaAssembly = await material(A, "Usage via assembly");
  ids.viaGroup = await material(A, "Usage via takeoff group");
  ids.viaGroupAssembly = await material(A, "Usage via group assembly");
  ids.viaRun = await material(A, "Usage via run conductor");
  ids.archivedOnly = await material(A, "Usage on an archived line only");
  // A shipped row, and company A's fork of it.
  ids.shipped = await material(null, BASELINE_NAME);
  ids.fork = await material(A, BASELINE_NAME, ids.shipped);

  const recipe = await assemblyOf(A, "Usage recipe", [
    ids.viaAssembly,
    ids.shipped, // written before the fork, so it names the shipped id
  ]);
  const groupRecipe = await assemblyOf(A, "Usage group recipe", [
    ids.viaGroupAssembly,
  ]);

  const bid1 = await aBid(A, "Usage bid one");
  const bid2 = await aBid(A, "Usage bid two");

  // Path 1, twice on bid1 and once on bid2: two bids, not three.
  await line(bid1, { assemblyId: recipe });
  await line(bid1, { assemblyId: recipe });
  await line(bid2, { assemblyId: recipe });

  // Paths 2 and 3: a takeoff group naming a material, and one naming a recipe.
  const [g1] = await database.insert(takeoffGroups).values({
    bidId: bid1,
    userId: A,
    label: "usage group material",
    materialId: ids.viaGroup,
  });
  await line(bid1, { takeoffGroupId: g1.insertId });
  const [g2] = await database.insert(takeoffGroups).values({
    bidId: bid2,
    userId: A,
    label: "usage group assembly",
    assemblyId: groupRecipe,
  });
  await line(bid2, { takeoffGroupId: g2.insertId });

  // Path 4: a traced-run line pricing the run type's conductor.
  const [rt] = await database.insert(takeoffRunTypes).values({
    userId: A,
    label: "Usage run type",
    conductorMaterialId: ids.viaRun,
  } as typeof takeoffRunTypes.$inferInsert);
  await line(bid2, {
    takeoffRunTypeId: rt.insertId,
    runMaterialRole: "conductor",
  });

  // An archived line counts for nothing.
  const archivedRecipe = await assemblyOf(A, "Usage archived recipe", [
    ids.archivedOnly,
  ]);
  await line(bid2, { assemblyId: archivedRecipe, archivedAt: new Date() });

  // Company B bids company A's material through its own assembly. It must
  // not count for A, and A's bids must not count for B.
  const bRecipe = await assemblyOf(B, "Usage B recipe", [ids.viaAssembly]);
  const bBid = await aBid(B, "Usage B bid");
  await line(bBid, { assemblyId: bRecipe });
  await line(bBid, { assemblyId: bRecipe });
});

afterAll(async () => {
  if (hasDb) await clean();
});

withDb("materials.usage", () => {
  const usageOf = async (company: number) =>
    new Map(
      (await caller(company).materials.usage()).map(u => [u.materialId, u])
    );

  it("counts distinct bids, not lines", async () => {
    const usage = await usageOf(A);
    expect(usage.get(ids.viaAssembly)?.bids).toBe(2);
  });

  it("finds a material by every path it reaches a bid", async () => {
    const usage = await usageOf(A);
    expect(usage.get(ids.viaGroup)?.bids, "takeoff group material").toBe(1);
    expect(usage.get(ids.viaGroupAssembly)?.bids, "takeoff group recipe").toBe(
      1
    );
    expect(usage.get(ids.viaRun)?.bids, "traced run conductor").toBe(1);
  });

  it("leaves out archived lines", async () => {
    const usage = await usageOf(A);
    expect(usage.has(ids.archivedOnly)).toBe(false);
  });

  it("credits a shipped row's use to the company's fork of it", async () => {
    const usage = await usageOf(A);
    expect(usage.get(ids.fork)?.bids).toBe(2);
    expect(usage.has(ids.shipped)).toBe(false);
  });

  it("dates the last use", async () => {
    const usage = await usageOf(A);
    const at = usage.get(ids.viaAssembly)!.lastUsedAt;
    expect(at).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - at.getTime())).toBeLessThan(10 * 60 * 1000);
  });

  it("is one company's, never another's", async () => {
    // A's material is on two of A's bids and one of B's. Each company sees
    // only its own.
    expect((await usageOf(A)).get(ids.viaAssembly)?.bids).toBe(2);
    const b = await usageOf(B);
    expect(b.get(ids.viaAssembly)?.bids).toBe(1);
    expect(b.has(ids.viaGroup)).toBe(false);
    expect(b.has(ids.fork)).toBe(false);
  });
});
