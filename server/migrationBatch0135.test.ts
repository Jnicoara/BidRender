/**
 * What migrations 0135–0138 promise (the per-foot items plan's M1–M4,
 * references/per-foot-items-plan.md § 4, written 2026-10-08 by Track A): the
 * behaviour drift cannot see. Each case fails on a database without its
 * migration — the table or column is absent, or the old unique key refuses
 * a second extra.
 *
 * Shape alone (column types, keys, foreign keys) is server/schemaDrift.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  assemblies,
  assemblyMaterials,
  bidLineItems,
  bids,
  materials,
  takeoffRunTypeExtras,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 91350;
const hasDb = !!process.env.DATABASE_URL;

dropFixtureUsersAfterAll([COMPANY]);

type ColumnRow = { t: string; c: string; n: string; d: unknown; ty: string };

describe.skipIf(!hasDb)("migrations 0135–0138 (per-foot items)", () => {
  let bidId: number;
  let runTypeId: number;
  let materialId: number;

  beforeAll(async () => {
    const db = (await getDb())!;
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, COMPANY))
      .limit(1);
    if (!existing)
      await db.insert(users).values({
        id: COMPANY,
        openId: `test-migration-batch-${COMPANY}`,
        name: "Migration batch 0135 company",
      });
    const [bid] = await db
      .insert(bids)
      .values({ userId: COMPANY, name: "0135 batch bid" })
      .$returningId();
    bidId = bid.id;
    const [material] = await db
      .insert(materials)
      .values({
        userId: COMPANY,
        name: `0135 tracer wire ${Date.now()}`,
        unitOfSale: "foot",
        costPerUnit: "0.1500",
      })
      .$returningId();
    materialId = material.id;
    const [type] = await db
      .insert(takeoffRunTypes)
      .values({ userId: COMPANY, label: "0135 trench", pathType: "conduit" })
      .$returningId();
    runTypeId = type.id;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    await db.delete(bids).where(eq(bids.userId, COMPANY));
  });

  it("0135: an extra is stored on a run type and goes when the type goes", async () => {
    const db = (await getDb())!;
    const [doomed] = await db
      .insert(takeoffRunTypes)
      .values({ userId: COMPANY, label: "0135 doomed", pathType: "conduit" })
      .$returningId();
    await db.insert(takeoffRunTypeExtras).values({
      userId: COMPANY,
      runTypeId: doomed.id,
      materialId,
      feetPerFoot: "1.0000",
      appliesTo: "flat",
    });
    const [back] = await db
      .select({
        feet: takeoffRunTypeExtras.feetPerFoot,
        appliesTo: takeoffRunTypeExtras.appliesTo,
        baseline: takeoffRunTypeExtras.baselineExtraId,
      })
      .from(takeoffRunTypeExtras)
      .where(eq(takeoffRunTypeExtras.runTypeId, doomed.id));
    expect(back).toEqual({ feet: "1.0000", appliesTo: "flat", baseline: null });

    await db.delete(takeoffRunTypes).where(eq(takeoffRunTypes.id, doomed.id));
    expect(
      await db
        .select()
        .from(takeoffRunTypeExtras)
        .where(eq(takeoffRunTypeExtras.runTypeId, doomed.id))
    ).toEqual([]);
  });

  it("0135: deleting the extra's material leaves the extra, saying NULL — never a different part", async () => {
    const db = (await getDb())!;
    const [gone] = await db
      .insert(materials)
      .values({
        userId: COMPANY,
        name: `0135 doomed tape ${Date.now()}`,
        unitOfSale: "foot",
        costPerUnit: "0.0300",
      })
      .$returningId();
    const [extra] = await db
      .insert(takeoffRunTypeExtras)
      .values({
        userId: COMPANY,
        runTypeId,
        materialId: gone.id,
        feetPerFoot: "1.0000",
        appliesTo: "all",
      })
      .$returningId();
    await db.delete(materials).where(eq(materials.id, gone.id));
    const [back] = await db
      .select({ materialId: takeoffRunTypeExtras.materialId })
      .from(takeoffRunTypeExtras)
      .where(eq(takeoffRunTypeExtras.id, extra.id));
    expect(back).toEqual({ materialId: null });
  });

  it("0136: two EXTRA lines on one type are allowed when their keys differ, and a repeat of either is refused", async () => {
    const db = (await getDb())!;
    const line = (runExtraKey: number) => ({
      bidId,
      name: `extra ${runExtraKey}`,
      qty: "0",
      takeoffRunTypeId: runTypeId,
      runMaterialRole: "extra" as const,
      runExtraKey,
    });
    // Tape and tracer wire on one trench type — refused by the old key,
    // which had no runExtraKey in it.
    await db.insert(bidLineItems).values(line(1001));
    await db.insert(bidLineItems).values(line(1002));
    await expect(db.insert(bidLineItems).values(line(1001))).rejects.toThrow();
  });

  it("0136: the wider key still refuses a second RACEWAY line — runExtraKey defaults to 0, never NULL", async () => {
    const db = (await getDb())!;
    const raceway = {
      bidId,
      name: "raceway",
      qty: "0",
      takeoffRunTypeId: runTypeId,
      runMaterialRole: "raceway" as const,
    };
    const [first] = await db
      .insert(bidLineItems)
      .values(raceway)
      .$returningId();
    await expect(db.insert(bidLineItems).values(raceway)).rejects.toThrow();
    const [row] = await db
      .select({
        key: bidLineItems.runExtraKey,
        shared: bidLineItems.extraFeetPerFoot,
        traced: bidLineItems.snapshotTracedParts,
        answers: bidLineItems.tracedPartAnswers,
      })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, first.id));
    // 0136 + 0138: an ordinary line is "not an extra", "follows the type",
    // and has no traced parts and no answers.
    expect(row).toEqual({ key: 0, shared: null, traced: null, answers: null });
  });

  it("0136 + 0137 + 0138: the nullable columns have NO default, so unset stays unset", async () => {
    const db = (await getDb())!;
    const [rows] = (await db.execute(
      sql`SELECT TABLE_NAME AS t, COLUMN_NAME AS c, IS_NULLABLE AS n, COLUMN_DEFAULT AS d, DATA_TYPE AS ty
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND ((TABLE_NAME = 'bid_line_items' AND COLUMN_NAME IN
                   ('extraFeetPerFoot', 'runExtraKey', 'snapshotTracedParts', 'tracedPartAnswers'))
              OR (TABLE_NAME = 'assembly_materials' AND COLUMN_NAME = 'qtySource'))
          ORDER BY TABLE_NAME, COLUMN_NAME`
    )) as unknown as [ColumnRow[]];
    expect(
      rows.map(r => [r.t, r.c, r.n, r.d === null ? null : String(r.d), r.ty])
    ).toEqual([
      ["assembly_materials", "qtySource", "YES", null, "enum"],
      ["bid_line_items", "extraFeetPerFoot", "YES", null, "decimal"],
      // The one NOT NULL: it is in a unique key, and 0 is true of every row.
      ["bid_line_items", "runExtraKey", "NO", "0", "int"],
      ["bid_line_items", "snapshotTracedParts", "YES", null, "json"],
      ["bid_line_items", "tracedPartAnswers", "YES", null, "json"],
    ]);
  });

  it("0136: the old three-column key is gone and the new one is unique on four", async () => {
    const db = (await getDb())!;
    const [rows] = (await db.execute(
      sql`SELECT INDEX_NAME AS i, NON_UNIQUE AS nu, COLUMN_NAME AS c
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bid_line_items'
            AND INDEX_NAME LIKE 'bid_line_items_bid_runtype_role%'
          ORDER BY INDEX_NAME, SEQ_IN_INDEX`
    )) as unknown as [{ i: string; nu: number; c: string }[]];
    expect(rows.map(r => [r.i, Number(r.nu), r.c])).toEqual([
      ["bid_line_items_bid_runtype_role_extra_uq", 0, "bidId"],
      ["bid_line_items_bid_runtype_role_extra_uq", 0, "takeoffRunTypeId"],
      ["bid_line_items_bid_runtype_role_extra_uq", 0, "runMaterialRole"],
      ["bid_line_items_bid_runtype_role_extra_uq", 0, "runExtraKey"],
    ]);
  });

  it("0137: a recipe part starts with no quantity source — read as fixed", async () => {
    const db = (await getDb())!;
    const [assembly] = await db
      .insert(assemblies)
      .values({ userId: COMPANY, name: "0137 trench", category: "General" })
      .$returningId();
    const [fresh] = await db
      .insert(assemblyMaterials)
      .values({ assemblyId: assembly.id, materialId, qty: "1" })
      .$returningId();
    const [traced] = await db
      .insert(assemblyMaterials)
      .values({
        assemblyId: assembly.id,
        materialId,
        qty: "10",
        qtySource: "traced_or_default",
      })
      .$returningId();
    const source = async (id: number) =>
      (
        await db
          .select({ source: assemblyMaterials.qtySource })
          .from(assemblyMaterials)
          .where(eq(assemblyMaterials.id, id))
      )[0].source;
    expect(await source(fresh.id)).toBeNull();
    expect(await source(traced.id)).toBe("traced_or_default");
  });

  it("0138: a line's traced parts and answers round-trip as JSON", async () => {
    const db = (await getDb())!;
    const [line] = await db
      .insert(bidLineItems)
      .values({
        bidId,
        name: "GR2",
        qty: "1",
        snapshotTracedParts: [
          {
            materialId,
            baselineMaterialId: null,
            name: "Underground warning tape",
            unitCost: "0.0300",
            defaultQty: null,
          },
        ],
        tracedPartAnswers: { [String(materialId)]: { feet: 40 } },
      })
      .$returningId();
    const [back] = await db
      .select({
        traced: bidLineItems.snapshotTracedParts,
        answers: bidLineItems.tracedPartAnswers,
      })
      .from(bidLineItems)
      .where(eq(bidLineItems.id, line.id));
    expect(back.traced?.[0]).toMatchObject({
      defaultQty: null,
      unitCost: "0.0300",
    });
    expect(back.answers).toEqual({ [String(materialId)]: { feet: 40 } });
  });
});
