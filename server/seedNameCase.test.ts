/**
 * NAMES THAT DIFFER ONLY BY CAPITALS ARE TWO ROWS, AND A RESTART KEEPS BOTH.
 *
 * ── The fault this pins (audit 2026-10-07) ───────────────────────────────────
 * The `materials` columns are utf8mb4_unicode_ci, so SQL compares names
 * ignoring case, while the seed's own matching (JS Sets) is exact. A shipped
 * name that differs from a RETIRED name only in capitals — the proposed
 * "4/0-3 SER Aluminum" against the retired "4/0-3 SER aluminum" — then went
 * wrong three ways on every start:
 *
 *   1. the retire pass switched OFF the shipped row too (case-blind IN);
 *   2. the reactivate pass (exact) switched it back on — churn, every boot;
 *   3. the duplicate repair (case-blind GROUP BY) treated the two as one
 *      name and DELETED the higher id — and `assembly_materials` cascades,
 *      so every recipe line pointing at it went with it.
 *
 * The fix makes those three exact (`BINARY` in dedupeBaselineRows, a JS
 * filter in retire, rename written by id). This file goes red without it.
 * It was confirmed red before the fix: the second seed deleted a row and its
 * recipe line.
 *
 * Fixture ids are distinct from every other suite (7466).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  BASELINE_MATERIALS_SEED_LOCK,
  type BaselineSeedReport,
  getDb,
  seedBaselineMaterialsFrom,
  withSeedLock,
} from "./db";
import {
  assemblies,
  assemblyMaterials,
  materials,
  users,
} from "../drizzle/schema";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import type { BaselineMaterial } from "./seed/materials/types";

const USER = 7466;
const hasDb = Boolean(process.env.DATABASE_URL);

/** Shipped today. */
const SHIPPED: BaselineMaterial = {
  name: "Zz seed case fixture SER Aluminum",
  unitOfSale: "foot",
  costPerUnit: "0.0000",
  category: "Wire & Cable",
  searchAliases: "",
};
/** Retired long ago, and the same name but for one capital. */
const RETIRED_NAME = "Zz seed case fixture SER aluminum";
const NAMES = [SHIPPED.name, RETIRED_NAME];

const CATALOG = [...BASELINE_MATERIALS, SHIPPED];
const RETIRED = [...RETIRED_BASELINE_MATERIALS, RETIRED_NAME];

async function seed(): Promise<BaselineSeedReport> {
  let report: BaselineSeedReport | undefined;
  await withSeedLock(BASELINE_MATERIALS_SEED_LOCK, async () => {
    report = await seedBaselineMaterialsFrom(CATALOG, RETIRED);
  });
  if (!report) throw new Error("the seed pass did not run (lock not taken)");
  return report;
}

async function removeFixtureRows() {
  const db = await getDb();
  if (!db) return;
  // Assemblies first: their lines point at the shipped rows.
  await db.delete(assemblies).where(eq(assemblies.userId, USER));
  await db
    .delete(materials)
    .where(and(inArray(materials.name, NAMES), isNull(materials.userId)));
}

/** The fixture rows, read by EXACT name — the SQL match would fold them. */
async function fixtureRows() {
  const db = await getDb();
  const rows = await db!
    .select({
      id: materials.id,
      name: materials.name,
      isActive: materials.isActive,
    })
    .from(materials)
    .where(and(inArray(materials.name, NAMES), isNull(materials.userId)));
  return {
    shipped: rows.filter(r => r.name === SHIPPED.name),
    retired: rows.filter(r => r.name === RETIRED_NAME),
  };
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  await db
    .insert(users)
    .values({
      id: USER,
      openId: `test-seednamecase-${USER}`,
      name: "Seed name case fixture",
      email: `seednamecase-${USER}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({ set: { name: "Seed name case fixture" } });
});

beforeEach(async () => {
  if (!hasDb) return;
  await removeFixtureRows();
});

afterAll(async () => {
  if (!hasDb) return;
  await removeFixtureRows();
});

describe.skipIf(!hasDb)(
  "a shipped name and a retired name that differ only by capitals",
  () => {
    it("keep both rows, the recipe line and the shipped row's state across restarts", async () => {
      const db = (await getDb())!;

      // A database seeded before the retirement: the old spelling is a live
      // shipped row, with a recipe pointing at it.
      const [old] = await db.insert(materials).values({
        name: RETIRED_NAME,
        unitOfSale: "foot",
        costPerUnit: "0.0000",
        category: "Wire & Cable",
        searchAliases: "",
        userId: null,
      });
      expect(old.insertId).toBeGreaterThan(0);

      // First start on the new catalog: the new spelling is inserted (a
      // higher id) and the old one retired.
      await seed();
      const first = await fixtureRows();
      expect(first.shipped, "one shipped row").toHaveLength(1);
      expect(first.retired, "the old row is kept").toHaveLength(1);
      const shippedId = first.shipped[0].id;

      // A company recipe on the new row — the line a case-blind dedupe
      // deletes by cascade.
      const [asm] = await db.insert(assemblies).values({
        userId: USER,
        name: "Zz seed case fixture assembly",
        category: "Devices",
      });
      await db.insert(assemblyMaterials).values({
        assemblyId: asm.insertId,
        materialId: shippedId,
        qty: "1",
      });

      // Two more starts. Each must change nothing.
      for (const start of [2, 3]) {
        const report = await seed();
        expect(report.retired, `start ${start}: nothing newly retired`).toBe(0);
        expect(
          report.reactivated,
          `start ${start}: nothing switched back on`
        ).toBe(0);
        expect(report.inserted, `start ${start}: nothing re-inserted`).toBe(0);

        const rows = await fixtureRows();
        expect(
          rows.shipped.map(r => r.id),
          `start ${start}: the shipped row survives, same id`
        ).toEqual([shippedId]);
        expect(rows.shipped[0].isActive, "the shipped row stays on").toBe(true);
        expect(rows.retired, "the retired row survives").toHaveLength(1);
        expect(rows.retired[0].isActive, "the retired row stays off").toBe(
          false
        );

        const lines = await db
          .select({ id: assemblyMaterials.id })
          .from(assemblyMaterials)
          .where(eq(assemblyMaterials.assemblyId, asm.insertId));
        expect(lines, `start ${start}: the recipe line survives`).toHaveLength(
          1
        );
      }
    });
  }
);
