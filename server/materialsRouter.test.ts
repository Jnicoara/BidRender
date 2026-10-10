/**
 * Integration tests for the materials router (Foundation library API).
 *
 * Calls procedures directly via appRouter.createCaller, the pattern established
 * in v545.test.ts. Needs a database; skipped without DATABASE_URL.
 *
 * Uses different test user ids from materialsLibrary.test.ts on purpose —
 * vitest runs test files in parallel, and sharing a fixture user would let one
 * file's cleanup wipe rows out from under the other.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, seedBaselineMaterials } from "./db";
import { materials, users } from "../drizzle/schema";

const USER = 4243;
const OTHER_USER = 9998;

const hasDb = Boolean(process.env.DATABASE_URL);

function ctxFor(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `test-materials-router-${userId}`,
      name: "Materials router test user",
      email: `materials-router-${userId}@test.com`,
      role: "contractor",
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const caller = () => appRouter.createCaller(ctxFor(USER));
const otherCaller = () => appRouter.createCaller(ctxFor(OTHER_USER));

/** A baseline material guaranteed to exist, used across the fork/revert tests. */
const BASELINE_NAME = "15A GFCI receptacle";

/**
 * Read the baseline row straight from the table rather than through
 * materials.list — the list deliberately hides a baseline once the user has
 * forked it, which is the very state most of these tests are setting up.
 */
async function baselineRow() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db
    .select()
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, BASELINE_NAME)))
    .limit(1);
  if (!row)
    throw new Error(`baseline "${BASELINE_NAME}" missing — seeding failed`);
  return row;
}

async function baselineId(): Promise<number> {
  return (await baselineRow()).id;
}

/**
 * What the shipped row currently costs, read rather than hardcoded.
 *
 * These tests are about fork and revert copying content faithfully, not about
 * what a GFCI costs — and the catalog now ships every row unpriced on purpose,
 * so a hardcoded figure here would only ever be asserting that the seed data
 * has not changed. Reading it keeps "the fork matches the original" true
 * whatever the original happens to say.
 */
async function baselineCost(): Promise<number> {
  return Number((await baselineRow()).costPerUnit);
}

/** Forks and edits persist, so every test starts from a clean user library. */
beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db
    .delete(materials)
    .where(inArray(materials.userId, [USER, OTHER_USER]));
});

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;

  for (const id of [USER, OTHER_USER]) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        id,
        openId: `test-materials-router-${id}`,
        name: `Materials router test user ${id}`,
      });
    }
  }

  await db
    .delete(materials)
    .where(inArray(materials.userId, [USER, OTHER_USER]));
  await seedBaselineMaterials();
});

describe.skipIf(!hasDb)("materials.list / get", () => {
  it("lists the shipped baseline library", async () => {
    const rows = await caller().materials.list();
    expect(rows.length).toBeGreaterThanOrEqual(28);
    expect(rows.some(r => r.name === BASELINE_NAME && r.userId === null)).toBe(
      true
    );
  });

  it("gets a single material by id", async () => {
    const id = await baselineId();
    const row = await caller().materials.get({ id });
    expect(row.name).toBe(BASELINE_NAME);
  });

  it("returns NOT_FOUND for a material that does not exist", async () => {
    await expect(caller().materials.get({ id: 99_999_999 })).rejects.toThrow(
      /not found/i
    );
  });
});

describe.skipIf(!hasDb)("materials.create", () => {
  it("creates a user-owned material", async () => {
    const created = await caller().materials.create({
      name: "Router test widget",
      unitOfSale: "box",
      costPerUnit: 12.34,
    });
    expect(created?.userId).toBe(USER);
    expect(created?.unitOfSale).toBe("box");
    expect(Number(created?.costPerUnit)).toBeCloseTo(12.34, 4);
  });

  it("rejects a duplicate name, including against baseline rows", async () => {
    await expect(
      caller().materials.create({
        name: BASELINE_NAME,
        unitOfSale: "each",
        costPerUnit: 1,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects a duplicate name case-insensitively", async () => {
    await caller().materials.create({
      name: "Casing Test Widget",
      unitOfSale: "each",
      costPerUnit: 1,
    });
    await expect(
      caller().materials.create({
        name: "casing test widget",
        unitOfSale: "each",
        costPerUnit: 1,
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("rejects a blank name", async () => {
    await expect(
      caller().materials.create({
        name: "   ",
        unitOfSale: "each",
        costPerUnit: 1,
      })
    ).rejects.toThrow();
  });

  it("rejects a negative cost", async () => {
    await expect(
      caller().materials.create({
        name: "Negative cost widget",
        unitOfSale: "each",
        costPerUnit: -1,
      })
    ).rejects.toThrow();
  });

  it("rejects a cost too large for the column", async () => {
    await expect(
      caller().materials.create({
        name: "Huge cost widget",
        unitOfSale: "each",
        costPerUnit: 1_000_000,
      })
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasDb)(
  "materials.update forks baseline rows transparently",
  () => {
    it("editing a baseline creates the user's own copy and leaves the shipped row alone", async () => {
      const id = await baselineId();
      const result = await caller().materials.update({ id, costPerUnit: 19.5 });

      expect(result.forked).toBe(true);
      expect(result.material?.id).not.toBe(id);
      expect(result.material?.userId).toBe(USER);
      expect(result.material?.baselineId).toBe(id);
      expect(Number(result.material?.costPerUnit)).toBeCloseTo(19.5, 4);

      // The shipped row is untouched for everyone else.
      const otherView = await otherCaller().materials.get({ id });
      expect(Number(otherView.costPerUnit)).toBeCloseTo(
        await baselineCost(),
        4
      );
    });

    it("the fork replaces the baseline in the user's list", async () => {
      const id = await baselineId();
      await caller().materials.update({ id, costPerUnit: 19.5 });

      const rows = await caller().materials.list();
      expect(rows.some(r => r.id === id)).toBe(false);
      expect(rows.filter(r => r.name === BASELINE_NAME)).toHaveLength(1);
    });

    it("editing an already-forked material does not fork again", async () => {
      const id = await baselineId();
      const first = await caller().materials.update({ id, costPerUnit: 19.5 });
      const second = await caller().materials.update({
        id: first.material!.id,
        costPerUnit: 21,
      });

      expect(second.forked).toBe(false);
      expect(second.material?.id).toBe(first.material?.id);
      expect(Number(second.material?.costPerUnit)).toBeCloseTo(21, 4);
    });

    it("cannot edit another user's material", async () => {
      const mine = await caller().materials.create({
        name: "Not for the other user",
        unitOfSale: "each",
        costPerUnit: 5,
      });
      await expect(
        otherCaller().materials.update({ id: mine!.id, costPerUnit: 999 })
      ).rejects.toThrow(/not found/i);
    });
  }
);

describe.skipIf(!hasDb)("materials.fork / revert", () => {
  it("fork takes a copy without changing anything", async () => {
    const id = await baselineId();
    const forked = await caller().materials.fork({ id });

    expect(forked?.userId).toBe(USER);
    expect(forked?.baselineId).toBe(id);
    expect(Number(forked?.costPerUnit)).toBeCloseTo(await baselineCost(), 4);
  });

  it("forking something already owned returns it unchanged", async () => {
    const mine = await caller().materials.create({
      name: "Already mine",
      unitOfSale: "each",
      costPerUnit: 2,
    });
    const result = await caller().materials.fork({ id: mine!.id });
    expect(result?.id).toBe(mine!.id);
  });

  it("revert restores the shipped values and keeps the row id", async () => {
    const id = await baselineId();
    const edited = await caller().materials.update({
      id,
      costPerUnit: 99,
      name: "My renamed GFCI",
    });
    const forkId = edited.material!.id;

    const reverted = await caller().materials.revert({ id: forkId });
    expect(reverted?.id).toBe(forkId);
    expect(reverted?.name).toBe(BASELINE_NAME);
    expect(Number(reverted?.costPerUnit)).toBeCloseTo(await baselineCost(), 4);
  });

  it("refuses to revert a material created from scratch", async () => {
    const mine = await caller().materials.create({
      name: "Nothing to revert to",
      unitOfSale: "each",
      costPerUnit: 3,
    });
    await expect(caller().materials.revert({ id: mine!.id })).rejects.toThrow(
      /no original/i
    );
  });

  it("cannot revert another user's material", async () => {
    const mine = await caller().materials.create({
      name: "Revert guard",
      unitOfSale: "each",
      costPerUnit: 4,
    });
    await expect(
      otherCaller().materials.revert({ id: mine!.id })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("materials.archive", () => {
  it("hides the user's own material from the list", async () => {
    const mine = await caller().materials.create({
      name: "Short lived widget",
      unitOfSale: "each",
      costPerUnit: 1,
    });
    await caller().materials.archive({ id: mine!.id });

    const rows = await caller().materials.list();
    expect(rows.some(r => r.id === mine!.id)).toBe(false);
  });

  it("removes a baseline material by forking it first", async () => {
    const id = await baselineId();
    const { id: archivedId } = await caller().materials.archive({ id });
    // The baseline row is shared with every user, so the fork is what gets
    // archived — and the fork is then what hides the baseline from the list.
    expect(archivedId).not.toBe(id);
    expect((await caller().materials.list()).some(r => r.id === id)).toBe(
      false
    );
  });

  it("cannot archive another user's material", async () => {
    const mine = await caller().materials.create({
      name: "Deactivate guard",
      unitOfSale: "each",
      costPerUnit: 1,
    });
    await expect(
      otherCaller().materials.archive({ id: mine!.id })
    ).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!hasDb)("authentication", () => {
  it("rejects an unauthenticated caller", async () => {
    const anon = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    } as unknown as TrpcContext);
    await expect(anon.materials.list()).rejects.toThrow();
  });
});
