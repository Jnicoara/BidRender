/**
 * A PRICE THE CONTRACTOR TYPED MUST SURVIVE EVERY RESTART.
 *
 * ── Why this needs its own file ──────────────────────────────────────────────
 * `seedBaselineMaterials` runs on every server start and re-stamps baseline
 * rows from the seed file — name, shelf, slang, and `costPerUnit`. That is
 * deliberate: it is how a re-shelved material or a new alias reaches every live
 * database with no migration, and how the catalog's prices will arrive once the
 * pricing sheet lands (CLAUDE.md § "Where a priced catalog lands").
 *
 * It is also, by one `WHERE` clause, the most destructive loop in the app. The
 * pass is scoped `isNull(materials.userId)`. Widen that by accident — drop the
 * filter, or "fix" a fork whose price looks stale — and every startup would
 * walk over the prices contractors typed, quietly, with the app looking
 * completely healthy afterwards. There is no error, no log line, and the only
 * symptom is that somebody's bid is suddenly built on the shipped number.
 *
 * ── What makes this test worth more than the comment above it ────────────────
 * A comment cannot fail. This can: the scoping is asserted against a real
 * database, by running the seeder twice with a user's fork in front of it.
 *
 * Verified red on 2026-09-21 by deleting `isNull(materials.userId)` from the
 * baseline query in `backfillMaterialMetadata` — exactly the slip it guards
 * against. The contractor's $12.50 came back as the shipped zero:
 *
 *   AssertionError: expected +0 to be close to 12.5,
 *                   received difference is 12.5, but expected 0.00005
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineMaterials } from "./db";
import { materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

const USER = 6464;
const hasDb = Boolean(process.env.DATABASE_URL);

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-seedprice-${USER}`, role: "user" },
  } as unknown as TrpcContext);

/** A shipped row every database has, whichever way the catalog grows. */
const SHIPPED = "Wire nuts";

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db
    .insert(users)
    .values({
      id: USER,
      openId: `test-seedprice-${USER}`,
      name: "Seed price fixture",
      email: `seedprice-${USER}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({ set: { name: "Seed price fixture" } });
  await seedBaselineMaterials();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  // Clear this user's forks so a re-run starts from the shipped catalog.
  await db.delete(materials).where(eq(materials.userId, USER));
});

afterAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  // This suite forks shipped rows and invents its own. Left behind, they would
  // show up in another suite's catalog listing as an extra "Wire nuts".
  await db.delete(materials).where(eq(materials.userId, USER));
});

describe.skipIf(!hasDb)("a restart never touches a user's own price", () => {
  it("keeps the fork's price and leaves the shipped row alone", async () => {
    const before = (await caller().materials.list()).find(
      m => m.name === SHIPPED
    )!;
    expect(before.userId).toBeNull();

    // Pricing a shipped material forks it: a new row, owned by this user.
    await caller().materials.update({ id: before.id, costPerUnit: 12.5 });

    const forked = (await caller().materials.list()).find(
      m => m.name === SHIPPED
    )!;
    expect(forked.id).not.toBe(before.id);
    expect(forked.userId).toBe(USER);
    expect(Number(forked.costPerUnit)).toBeCloseTo(12.5, 4);

    // THE RESTART. Same call the server makes on boot, twice — once is not a
    // test of idempotence, and "nothing moved" and "nothing ran" look alike
    // from one side.
    await seedBaselineMaterials();
    await seedBaselineMaterials();

    const after = (await caller().materials.list()).find(
      m => m.name === SHIPPED
    )!;
    expect(after.id).toBe(forked.id);
    expect(Number(after.costPerUnit)).toBeCloseTo(12.5, 4);

    // And the baseline underneath is still the app's, re-stamped from the seed
    // file. This half is what proves the seeder actually RAN — without it, a
    // seeder that did nothing at all would pass the assertion above.
    const db = await getDb();
    const [baseline] = await db!
      .select()
      .from(materials)
      .where(and(eq(materials.id, before.id), isNull(materials.userId)));
    expect(baseline).toBeDefined();
    expect(Number(baseline.costPerUnit)).toBeCloseTo(
      Number(before.costPerUnit),
      4
    );
  });

  it("keeps a price the user set on a material they invented", async () => {
    // No baselineId at all, so nothing in the seed file describes it. The
    // seeder has no business touching it and must not guess.
    const name = `Own part ${Date.now()}${Math.random()}`;
    const created = await caller().materials.create({
      name,
      unitOfSale: "each",
      costPerUnit: 41.25,
      category: "Consumables",
    });
    // `create` reads the row back and can come back empty; fail by name here
    // rather than as a bare TypeError on `created.id` below.
    if (!created) throw new Error("materials.create returned no material");

    await seedBaselineMaterials();

    const after = (await caller().materials.list()).find(m => m.name === name)!;
    expect(after.id).toBe(created.id);
    expect(Number(after.costPerUnit)).toBeCloseTo(41.25, 4);
  });

  it("re-stamps the shipped row itself, which is the half that must keep working", async () => {
    /*
      The mirror of the two above, and the reason the filter cannot simply be
      "never write anything". Baseline rows ARE the seed file's to own: that is
      what lets a corrected shelf, a new alias — and, once the pricing sheet
      lands, an example price — reach every live database without a migration.

      So this asserts the pass is alive. If someone made the seeder timid to
      protect user prices, these would go red rather than the protection
      silently costing the catalog its updates.
    */
    const db = await getDb();
    const [shipped] = await db!
      .select()
      .from(materials)
      .where(and(eq(materials.name, SHIPPED), isNull(materials.userId)));

    await db!
      .update(materials)
      .set({ costPerUnit: "999.0000", searchAliases: "wrong" })
      .where(eq(materials.id, shipped.id));

    await seedBaselineMaterials();

    const [restored] = await db!
      .select()
      .from(materials)
      .where(eq(materials.id, shipped.id));
    expect(Number(restored.costPerUnit)).toBeCloseTo(
      Number(shipped.costPerUnit),
      4
    );
    expect(restored.searchAliases).toBe(shipped.searchAliases);
  });
});
