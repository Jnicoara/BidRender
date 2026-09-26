/**
 * v5.45 — Integration tests for new routers
 * Tests: masterItems, masterAssemblies, masterLaborRates, bidSummary
 *
 * These are the LEGACY routers (CLAUDE.md § "THE LEGACY MODEL"): nothing in
 * `client/src` reads them, but they still ship in `appRouter`, so they are
 * still tested.
 *
 * ── Its own user, not user 1 — fixed 2026-09-26 ──────────────────────────────
 * This file used to act as a hand-built user with `id: 1`, which was only ever
 * true on the Manus-era dev database, where user 1 was the owner's real
 * account. It never made a user of its own; it borrowed one. Once the suite
 * was confined to scratch databases (6db45ba, 2026-09-25), there was no user 1,
 * company scope could not create a company for it, and 8 tests failed on
 * `companies_ownerUserId_users_id_fk` on every run.
 *
 * Worse, the other 6 PASSED while testing nothing: each began
 * `if (!createdId) return;`, so a failed create made every test that depended
 * on it return early and report green. Those guards are now assertions — a
 * test that cannot do its job fails, it does not quietly skip.
 *
 * So: a fixture user inserted here, and the context built from THAT ROW as the
 * database returns it. The old hand-built user was also missing six fields the
 * `User` type requires, which nothing reported because `pnpm check` excludes
 * test files (CLAUDE.md § "The forcing functions stop at the test boundary").
 * Reading the real row means its shape cannot drift from the schema again.
 *
 * Everything this file writes cascades from `users` (master_* and projects
 * directly, bid_summary through projects, the company scope creates), so
 * deleting the fixture user is the whole cleanup — before, for a run that
 * crashed, and after.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { users, type User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

/** Distinct from every other suite's fixture ids. */
const USER = 5450;

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

let adminUser: User;

function createAdminCtx(): TrpcContext {
  return {
    user: adminUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function removeFixtureUser() {
  const database = await getDb();
  if (!database) return;
  await database.delete(users).where(eq(users.id, USER));
}

beforeAll(async () => {
  if (!hasDb) return;
  const database = await getDb();
  if (!database)
    throw new Error("DATABASE_URL is set but the DB is unreachable");
  // A crashed earlier run may have left the user and its rows behind.
  await removeFixtureUser();
  await database.insert(users).values({
    id: USER,
    openId: `test-v545-${USER}`,
    name: "v545 admin",
    email: `v545-${USER}@test.invalid`,
    role: "admin",
  });
  const [row] = await database
    .select()
    .from(users)
    .where(eq(users.id, USER))
    .limit(1);
  adminUser = row;
});

afterAll(async () => {
  if (!hasDb) return;
  await removeFixtureUser();
});

describeDb("masterItems router", () => {
  let createdId: number | undefined;

  it("creates a master item", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    const result = (await caller.masterItems.create({
      itemCode: "TEST-001",
      description: "Test Item v545",
      unit: "EA",
      masterMaterialCost: 10.5,
      masterLaborHours: 0.25,
    })) as { id?: number; description?: string };
    expect(result.id).toBeTypeOf("number");
    expect(result.description).toBe("Test Item v545");
    createdId = result.id!;
  });

  it("lists master items and finds the created one", async () => {
    expect(createdId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    const items = await caller.masterItems.list();
    expect(Array.isArray(items)).toBe(true);
    const found = items.find(i => i.id === createdId);
    expect(found).toBeDefined();
  });

  it("updates a master item", async () => {
    expect(createdId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    await caller.masterItems.update({
      id: createdId!,
      description: "Updated Test Item v545",
      masterMaterialCost: 12.0,
    });
    // Read it back. "Did not throw" is not the same as "was updated".
    const updated = (await caller.masterItems.list()).find(
      i => i.id === createdId
    );
    expect(updated?.description).toBe("Updated Test Item v545");
    expect(Number(updated?.masterMaterialCost)).toBeCloseTo(12);
  });

  it("deletes a master item", async () => {
    expect(createdId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    await caller.masterItems.delete({ id: createdId! });
    const items = await caller.masterItems.list();
    expect(items.some(i => i.id === createdId)).toBe(false);
  });
});

describeDb("masterLaborRates router", () => {
  let rateId: number | undefined;

  it("creates a labor rate", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    const result = (await caller.masterLaborRates.create({
      name: "Journeyman v545",
      ratePerHour: 85.0,
    })) as { id?: number; name?: string };
    expect(result.id).toBeTypeOf("number");
    expect(result.name).toBe("Journeyman v545");
    rateId = result.id!;
  });

  it("lists labor rates and finds the created one", async () => {
    expect(rateId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    const rates = await caller.masterLaborRates.list();
    expect(Array.isArray(rates)).toBe(true);
    expect(rates.some(r => r.id === rateId)).toBe(true);
  });

  it("deletes a labor rate", async () => {
    expect(rateId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    await caller.masterLaborRates.delete({ id: rateId! });
    const rates = await caller.masterLaborRates.list();
    expect(rates.some(r => r.id === rateId)).toBe(false);
  });
});

describeDb("masterAssemblies router", () => {
  let assemblyId: number | undefined;

  it("creates a master assembly", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    const result = (await caller.masterAssemblies.create({
      name: "Test Assembly v545",
      description: "A test assembly",
    })) as { id?: number; name?: string };
    expect(result.id).toBeTypeOf("number");
    expect(result.name).toBe("Test Assembly v545");
    assemblyId = result.id!;
  });

  it("lists master assemblies and finds the created one", async () => {
    expect(assemblyId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    const list = await caller.masterAssemblies.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some(a => a.id === assemblyId)).toBe(true);
  });

  it("deletes a master assembly", async () => {
    expect(assemblyId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    await caller.masterAssemblies.delete({ id: assemblyId! });
    const list = await caller.masterAssemblies.list();
    expect(list.some(a => a.id === assemblyId)).toBe(false);
  });
});

describeDb("bidSummary router", () => {
  let testProjectId: number | undefined;

  it("creates a project for bid summary test", async () => {
    const caller = appRouter.createCaller(createAdminCtx());
    // `category` used to be passed here too. The router dropped it long ago
    // and zod strips unknown keys, so it was silently ignored.
    const project = await caller.projects.create({
      name: "Bid Summary Test Project",
    });
    expect(project.id).toBeTypeOf("number");
    testProjectId = project.id;
  });

  it("upserts a bid summary", async () => {
    expect(testProjectId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    const result = await caller.bidSummary.upsert({
      projectId: testProjectId!,
      percentageLaborFactor: 1.1,
      lumpSumHours: 8,
      markupPct: 15,
      defaultLaborRateId: null,
    });
    expect(result).toBeDefined();
  });

  it("retrieves the upserted bid summary", async () => {
    expect(testProjectId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    const fetched = await caller.bidSummary.get({ projectId: testProjectId! });
    expect(fetched).not.toBeNull();
    expect(parseFloat(String(fetched?.percentageLaborFactor))).toBeCloseTo(1.1);
    expect(parseFloat(String(fetched?.lumpSumHours))).toBeCloseTo(8);
    expect(parseFloat(String(fetched?.markupPct))).toBeCloseTo(15);
  });

  it("cleans up test project", async () => {
    expect(testProjectId).toBeTypeOf("number");
    const caller = appRouter.createCaller(createAdminCtx());
    await caller.projects.delete({ id: testProjectId! });
    const gone = await caller.bidSummary.get({ projectId: testProjectId! });
    expect(gone ?? null).toBeNull();
  });
});
