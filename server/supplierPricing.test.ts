/**
 * Supplier Pricing runs on the REAL catalog, and the legacy one is gone.
 *
 * The failure this guards against is the one that prompted the work: a second
 * material list, 1,103 rows, sharing nothing with the catalog assemblies are
 * built from. Two lists meant two answers to "what does #12 THHN cost", and a
 * bid could be built from either.
 *
 * So this suite asserts both halves — the old dataset cannot come back, and the
 * pricing surface writes the same rows everything else reads.
 *
 * Fixture ids are distinct from every other suite; vitest shares one MySQL.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, seedBaselineMaterials } from "./db";
import { materials, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { priceAge } from "../shared/priceStaleness";

const USER = 8181;
const OTHER_USER = 8182;

const hasDb = Boolean(process.env.DATABASE_URL);

const callerFor = (userId: number) =>
  appRouter.createCaller({
    user: { id: userId, openId: `test-supplier-${userId}`, role: "user" },
  } as unknown as TrpcContext);

const caller = () => callerFor(USER);

// ── The legacy catalog is gone, and cannot come back ──────────────────────────

describe("the legacy master catalog", () => {
  it("no longer exists on disk", () => {
    // A 1,103-row dataset that nothing curates is not something to keep
    // "just in case" — it is the second catalog this work exists to remove.
    expect(existsSync("client/src/lib/materialCatalog.ts")).toBe(false);
  });

  it("took its screens and its router with it", () => {
    for (const path of [
      "client/src/components/CatalogPicker.tsx",
      "client/src/components/DataConnectorsPanel.tsx",
      "client/src/components/PriceSyncDialog.tsx",
      "client/src/components/tabs/UnifiedProjects.tsx",
      "client/src/pages/AssemblyBuilderPage.tsx",
      "client/src/pages/MaterialListPage.tsx",
      "server/routers/dataRouter.ts",
    ]) {
      expect(existsSync(path), `${path} should be deleted`).toBe(false);
    }
  });

  it("is not reachable through the API", () => {
    // The `data.materials.*` namespace was the only way in. If this ever comes
    // back, so has the second catalog.
    expect(
      (appRouter._def.procedures as Record<string, unknown>)[
        "data.materials.list"
      ]
    ).toBeUndefined();
    expect(Object.keys(appRouter._def.record)).not.toContain("data");
  });
});

// ── Pricing writes the real catalog ───────────────────────────────────────────

describe.skipIf(!hasDb)("supplier pricing on the real catalog", () => {
  beforeAll(async () => {
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
          openId: `test-supplier-${id}`,
          name: `Supplier pricing user ${id}`,
        });
      }
    }
    await seedBaselineMaterials().catch(() => {});
  });

  beforeEach(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(materials)
      .where(inArray(materials.userId, [USER, OTHER_USER]));
  });

  const aStarter = async () =>
    (await caller().materials.list()).find(m => m.userId === null)!;

  it("prices the same rows the Materials screen lists", async () => {
    const starter = await aStarter();
    const { material } = await caller().materials.update({
      id: starter.id,
      costPerUnit: 4.25,
      supplierName: "Platt",
    });

    // Read back through the ordinary catalog list — not a second endpoint.
    const listed = (await caller().materials.list()).find(
      m => m.id === material!.id
    )!;
    expect(Number(listed.costPerUnit)).toBeCloseTo(4.25, 4);
    expect(listed.supplierName).toBe("Platt");
  });

  it("stamps the price date so staleness has something to measure", async () => {
    const starter = await aStarter();
    const { material } = await caller().materials.update({
      id: starter.id,
      costPerUnit: 9.5,
    });

    expect(material!.priceUpdatedAt).toBeTruthy();
    expect(priceAge(material!.priceUpdatedAt, new Date())).toBe("fresh");
  });

  it("does not move the price date when something else is edited", async () => {
    // The reason priceUpdatedAt is not updatedAt: renaming a material must not
    // make a nine-month-old price look like this week's.
    const starter = await aStarter();
    const { material } = await caller().materials.update({
      id: starter.id,
      costPerUnit: 3,
    });
    const stamped = material!.priceUpdatedAt;

    const renamed = await caller().materials.update({
      id: material!.id,
      brandNote: "Some brand",
    });
    expect(renamed.material!.priceUpdatedAt).toEqual(stamped);
  });

  it("forks a starter rather than pricing the shared row", async () => {
    const starter = await aStarter();
    await caller().materials.update({ id: starter.id, costPerUnit: 7.77 });

    // Another contractor still sees the shipped row at its shipped price.
    const theirs = (await callerFor(OTHER_USER).materials.list()).find(
      m => m.name === starter.name
    )!;
    expect(theirs.userId).toBeNull();
    expect(Number(theirs.costPerUnit)).toBe(Number(starter.costPerUnit));
  });
});

// ── CSV import ────────────────────────────────────────────────────────────────

describe.skipIf(!hasDb)("importing a supplier price list", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(materials)
      .where(inArray(materials.userId, [USER, OTHER_USER]));
  });

  it("prices matching materials and stamps the supplier", async () => {
    const starters = (await caller().materials.list())
      .filter(m => m.userId === null)
      .slice(0, 2);

    const result = await caller().materials.importPrices({
      supplierName: "Rexel",
      rows: starters.map((m, i) => ({ name: m.name, costPerUnit: 1 + i })),
    });

    expect(result.priced).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);

    const after = await caller().materials.list();
    for (const [i, starter] of Array.from(starters.entries())) {
      const row = after.find(m => m.name === starter.name)!;
      expect(Number(row.costPerUnit)).toBeCloseTo(1 + i, 4);
      expect(row.supplierName).toBe("Rexel");
      expect(priceAge(row.priceUpdatedAt, new Date())).toBe("fresh");
    }
  });

  it("reports names that match nothing instead of creating them", async () => {
    // Inserting unmatched rows would rebuild the two-catalog problem one
    // import at a time, with materials nobody curated.
    const before = (await caller().materials.list()).length;

    const result = await caller().materials.importPrices({
      supplierName: "Rexel",
      rows: [{ name: "Nonexistent widget XYZ", costPerUnit: 5 }],
    });

    expect(result.priced).toHaveLength(0);
    expect(result.unmatched).toEqual(["Nonexistent widget XYZ"]);
    expect((await caller().materials.list()).length).toBe(before);
  });

  it("matches case- and whitespace-insensitively", async () => {
    // A supply house writes "12-2 NM-B " where the catalog says "12-2 NM-B".
    // Exact matching would report half a real price list as unmatched.
    const starter = (await caller().materials.list()).find(
      m => m.userId === null
    )!;

    const result = await caller().materials.importPrices({
      supplierName: "Graybar",
      rows: [{ name: `  ${starter.name.toUpperCase()}  `, costPerUnit: 12.5 }],
    });

    expect(result.priced).toEqual([starter.name]);
  });

  it('prices a renamed row under its old name, and says "priced as"', async () => {
    // A supplier's sheet lags the catalog: it still says "20A breaker" after
    // the row became "20A Single-Pole breaker" (RENAMED_BASELINE_MATERIALS).
    const result = await caller().materials.importPrices({
      supplierName: "Platt",
      rows: [{ name: "20a BREAKER", costPerUnit: 6.4 }],
    });

    expect(result.unmatched).toEqual([]);
    expect(result.priced).toEqual(["20A Single-Pole breaker"]);
    expect(result.renamed).toEqual([
      { from: "20a BREAKER", to: "20A Single-Pole breaker" },
    ]);
    const row = (await caller().materials.list()).find(
      m => m.name === "20A Single-Pole breaker"
    )!;
    expect(row.userId).toBe(USER);
    expect(Number(row.costPerUnit)).toBeCloseTo(6.4, 4);
  });

  it("two old spellings of one row fork it once, and the last price stands", async () => {
    // Both older SER spellings point at the same final name.
    const result = await caller().materials.importPrices({
      supplierName: "Platt",
      rows: [
        { name: "1/0-3 SER aluminum", costPerUnit: 2 },
        { name: "1/0-3 SER AL", costPerUnit: 3 },
      ],
    });

    expect(result.renamed.map(r => r.to)).toEqual([
      "1/0-1/0-1/0-2 SER AL",
      "1/0-1/0-1/0-2 SER AL",
    ]);
    const rows = (await caller().materials.list()).filter(
      m => m.name === "1/0-1/0-1/0-2 SER AL"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(USER);
    expect(Number(rows[0].costPerUnit)).toBeCloseTo(3, 4);
  });

  it("a company's own row still carrying the old name wins over the rename", async () => {
    // Their copy, made before the rename, is the row they mean.
    await caller().materials.create({ name: "30A breaker", costPerUnit: 1 });

    const result = await caller().materials.importPrices({
      supplierName: "Platt",
      rows: [{ name: "30A breaker", costPerUnit: 8 }],
    });

    expect(result.renamed).toEqual([]);
    expect(result.priced).toEqual(["30A breaker"]);
    const list = await caller().materials.list();
    const own = list.find(m => m.name === "30A breaker")!;
    expect(Number(own.costPerUnit)).toBeCloseTo(8, 4);
    // The shipped row was not touched, let alone forked.
    const shipped = list.find(m => m.name === "30A Single-Pole breaker")!;
    expect(shipped.userId).toBeNull();
  });

  it("a retired name stays unmatched", async () => {
    // Retired rows are in no rename map; nothing should price through them.
    const result = await caller().materials.importPrices({
      supplierName: "Platt",
      rows: [{ name: "#4 crimp lug", costPerUnit: 1.1 }],
    });

    expect(result.priced).toEqual([]);
    expect(result.renamed).toEqual([]);
    expect(result.unmatched).toEqual(["#4 crimp lug"]);
  });

  it("refuses an import with no supplier named", async () => {
    await expect(
      caller().materials.importPrices({
        supplierName: "   ",
        rows: [{ name: "anything", costPerUnit: 1 }],
      })
    ).rejects.toThrow();
  });
});
