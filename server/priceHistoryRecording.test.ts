/**
 * PRICE HISTORY RECORDING (references/price-history-plan.md § 7, tests 1, 2,
 * 4 and 8): each way a company's price changes writes exactly ONE
 * `material_price_history` row, with the right "how"; a write that changes
 * nothing writes none. Every count is the same query read before and after
 * (CLAUDE.md § "A count taken before the change is intent, not outcome").
 *
 * Not covered here, and said so: an employee's edit recording the person
 * apart from the owner (test 5) — the scope split is pinned for every router
 * by scopeDiscipline.test.ts, and the door takes `actorUserId` from
 * `ctx.scope.actorUserId` in each caller; and the one-transaction rollback
 * (test 3), which needs a forced insert failure this suite has no seam for.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import {
  getDb,
  getMaterialById,
  revertMaterialToBaseline,
  seedBaselineMaterials,
  updateMaterial,
} from "./db";
import { materialPriceHistory, materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { priceWrite } from "../shared/packPricing";

const USER = 6481;
const hasDb = Boolean(process.env.DATABASE_URL);
const SHIPPED = "Wire nut, 22-8 AWG (tan/red)";

const caller = () =>
  appRouter.createCaller({
    user: { id: USER, openId: `test-pricehist-${USER}`, role: "user" },
  } as unknown as TrpcContext);

async function history() {
  const db = (await getDb())!;
  return db
    .select()
    .from(materialPriceHistory)
    .where(eq(materialPriceHistory.userId, USER))
    .orderBy(asc(materialPriceHistory.id));
}

async function shippedId(): Promise<number> {
  const db = (await getDb())!;
  const [row] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(eq(materials.name, SHIPPED))
    .limit(1);
  return row.id;
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db
    .insert(users)
    .values({
      id: USER,
      openId: `test-pricehist-${USER}`,
      name: "Price history fixture",
      email: `pricehist-${USER}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({ set: { name: "Price history fixture" } });
  await seedBaselineMaterials();
});

beforeEach(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db
    .delete(materialPriceHistory)
    .where(eq(materialPriceHistory.userId, USER));
  await db.delete(materials).where(eq(materials.userId, USER));
});

afterAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db
    .delete(materialPriceHistory)
    .where(eq(materialPriceHistory.userId, USER));
  await db.delete(materials).where(eq(materials.userId, USER));
});

describe.skipIf(!hasDb)("price history recording", () => {
  it("a typed edit of a shipped row records one 'typed' row, keyed to the shipped item", async () => {
    const id = await shippedId();
    expect(await history()).toHaveLength(0);
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 0.31,
    });
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "typed",
      materialKey: id, // the shipped id: a later re-fork does not split it
      materialId: row!.id, // the fork actually written
      unitCost: "0.3100",
      changedByUserId: USER,
      packPrice: null,
    });
    // Forking alone wrote nothing: the one row is the price change.
  });

  it("writing the same price back, or editing only the name, records nothing", async () => {
    const id = await shippedId();
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 0.31,
    });
    const before = (await history()).length;
    await caller().materials.update({ id: row!.id, costPerUnit: 0.31 });
    await caller().materials.update({ id: row!.id, name: `${SHIPPED} (mine)` });
    expect((await history()).length).toBe(before);
  });

  it("records the previous price on the next change", async () => {
    const id = await shippedId();
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 0.31,
    });
    await caller().materials.update({ id: row!.id, costPerUnit: 0.35 });
    const rows = await history();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      unitCost: "0.3500",
      previousUnitCost: "0.3100",
    });
  });

  it("create with a price records one row; create at $0 records none", async () => {
    await caller().materials.create({
      name: `Hist probe priced ${Date.now()}`,
      costPerUnit: 4.5,
    });
    expect(await history()).toHaveLength(1);
    expect((await history())[0]).toMatchObject({
      previousUnitCost: null,
      unitCost: "4.5000",
    });
    await caller().materials.create({
      name: `Hist probe free ${Date.now()}`,
      costPerUnit: 0,
    });
    expect(await history()).toHaveLength(1);
  });

  it("an import records 'imported', with the supplier", async () => {
    const out = await caller().materials.importPrices({
      supplierName: "Test Supply",
      rows: [{ name: SHIPPED, costPerUnit: 0.29 }],
    });
    expect(out.priced).toEqual([SHIPPED]);
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "imported",
      supplierName: "Test Supply",
      isExamplePrice: false,
      unitCost: "0.2900",
    });
  });

  it("reverting to the shipped price records the change back", async () => {
    const id = await shippedId();
    const shipped = await getMaterialById(id, USER);
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 9.99,
    });
    const before = (await history()).length;
    await revertMaterialToBaseline(row!.id, USER, USER);
    const rows = await history();
    expect(rows.length).toBe(before + 1);
    expect(Number(rows.at(-1)!.unitCost)).toBe(Number(shipped!.costPerUnit));
    expect(rows.at(-1)!.previousUnitCost).toBe("9.9900");
  });

  it("a typed PACK price records the pack it came from", async () => {
    const id = await shippedId();
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 0.31,
    });
    const db = (await getDb())!;
    await db
      .update(materials)
      .set({ packQty: "100", packLabel: "bag" })
      .where(and(eq(materials.id, row!.id), eq(materials.userId, USER)));
    await updateMaterial(row!.id, USER, {
      price: {
        write: priceWrite({ typed: "pack", amount: 32.5, packQty: 100 }),
        why: { source: "typed", actorUserId: USER },
      },
    });
    const last = (await history()).at(-1)!;
    expect(last).toMatchObject({
      unitCost: "0.3250",
      packPrice: "32.5000",
      packQty: "100.0000",
      packLabel: "bag",
    });
    // And the row itself holds the pair the history recorded.
    const stored = await getMaterialById(row!.id, USER);
    expect(stored).toMatchObject({
      costPerUnit: "0.3250",
      packPrice: "32.5000",
    });
  });

  it("a per-unit write after a pack price clears the pack price", async () => {
    const id = await shippedId();
    const { material: row } = await caller().materials.update({
      id,
      costPerUnit: 0.31,
    });
    await updateMaterial(row!.id, USER, {
      price: {
        write: priceWrite({ typed: "pack", amount: 32.5, packQty: 100 }),
        why: { source: "typed", actorUserId: USER },
      },
    });
    await caller().materials.update({ id: row!.id, costPerUnit: 0.4 });
    const stored = await getMaterialById(row!.id, USER);
    expect(stored).toMatchObject({ costPerUnit: "0.4000", packPrice: null });
  });
});
