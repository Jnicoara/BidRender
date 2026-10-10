/**
 * TRACK A'S HALF OF references/sch80-and-500-plan.md (owner, 2026-10-09):
 * the SEED content. Track C's half — the label taking a schedule, the fold
 * sort, the 500 fitting family — is tested in its own files.
 *
 *   - nine PVC Sch 80 underground run types, one per size the catalog ships,
 *     each built exactly like its Sch 40 twin (tape, flat, 1.0; no wire);
 *   - "Surface raceway base, 500 series" renamed in place to
 *     "Surface raceway, 500 series", the 500 cover retired;
 *   - nine 500-series parts, named the way the fitting family builds them;
 *   - the 500 run type, 2 #12 + ground, on the SAME ground row as 700.
 *
 * Every case here fails on the code before it. The DB half runs the real
 * seed passes against a database holding the OLD 500 rows, because a fresh
 * catalog never has them — which is the only place "same id" can be shown.
 *
 * Fixture id 91354 is this file's own (C's sch80And500Runs.test.ts is 91353).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  BASELINE_MATERIALS_SEED_LOCK,
  getDb,
  seedBaselineMaterialsFrom,
  seedBaselineRunTypes,
  withSeedLock,
} from "./db";
import {
  materials,
  takeoffRunTypeExtras,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";
import { BASELINE_RUN_TYPES } from "./seed/baselineRunTypes";
import {
  BASELINE_MATERIALS,
  RENAMED_BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { sizesFor } from "./seed/materials/conduit";
import {
  FROZEN_ADDS_NOT_SEEDED,
  FROZEN_ADDS_SHIPPED_AS,
} from "../shared/frozenAddsHeld";
import {
  isShippedUndergroundType,
  undergroundRunTypeLabel,
} from "../shared/undergroundRunTypes";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const TAPE = "Underground warning tape";
const OLD_BASE_500 = "Surface raceway base, 500 series";
const COVER_500 = "Surface raceway cover, 500 series";
const RACEWAY_500 = "Surface raceway, 500 series";
const TYPE_500 = "500 series surface raceway, 2 #12 + ground";
const TYPE_700 = "700 series surface raceway, 2 #12 + ground";

/** The nine 500 parts, as plan § 7c lists them — the first six counted. */
const SHARED_WITH_700 = ["support clip", "tee", "device box"];
const PARTS_500 = [
  "coupling",
  "entrance end fitting",
  "support clip",
  "inside elbow",
  "flat elbow",
  "tee",
  "outside elbow",
  "device box",
  "device plate",
].map(part =>
  // ONE row for 500 and 700 since 2026-10-09 (catalog reality check): the
  // device box (V5747/V5748), support clip (V5703) and tee (V5715).
  SHARED_WITH_700.includes(part)
    ? `Surface raceway ${part}, 500/700 series`
    : `Surface raceway ${part}, 500 series`
);

const byName = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const typeByLabel = new Map(BASELINE_RUN_TYPES.map(t => [t.label, t]));

describe("the Sch 80 underground run types", () => {
  const sch80 = sizesFor("PVC Sch 80").map(size =>
    undergroundRunTypeLabel(size, "PVC Sch 80")
  );

  it("are nine — one per Sch 80 size the catalog ships, no 3-1/2 inch", () => {
    expect(sch80).toHaveLength(9);
    expect(sch80).not.toContain(
      undergroundRunTypeLabel('3-1/2"', "PVC Sch 80")
    );
    for (const label of sch80) expect(typeByLabel.has(label), label).toBe(true);
  });

  it("each is its Sch 40 twin with the Sch 80 pipe: tape on the flat, no wire", () => {
    for (const size of sizesFor("PVC Sch 80")) {
      const t = typeByLabel.get(undergroundRunTypeLabel(size, "PVC Sch 80"));
      expect(t, size).toEqual({
        label: `${size} PVC Sch 80, underground`,
        pathType: "conduit",
        racewayMaterialName: `${size} PVC Sch 80`,
        conductorMaterialName: null,
        conductorCount: null,
        groundCount: null,
        groundMaterialName: null,
        extras: [{ materialName: TAPE, feetPerFoot: 1, appliesTo: "flat" }],
      });
      // The pipe they name is a shipped row (nothing added for Sch 80).
      expect(byName.has(`${size} PVC Sch 80`), size).toBe(true);
    }
  });

  it("all sit behind the fold, beside the Sch 40 nine — eighteen in all", () => {
    const folded = BASELINE_RUN_TYPES.filter(t =>
      isShippedUndergroundType({ isShipped: true, label: t.label })
    ).map(t => t.label);
    expect(folded).toHaveLength(18);
    for (const label of sch80) expect(folded).toContain(label);
  });
});

describe("the 500 surface raceway", () => {
  it("is the 700 type's twin: 2 #12 + the SAME ground row, no extras", () => {
    const t500 = typeByLabel.get(TYPE_500);
    const t700 = typeByLabel.get(TYPE_700);
    expect(t500).toMatchObject({
      pathType: "conduit",
      racewayMaterialName: RACEWAY_500,
      conductorMaterialName: "#12 THHN solid Copper",
      conductorCount: 2,
      groundCount: 1,
    });
    expect(t500?.groundMaterialName).toBe(t700?.groundMaterialName);
    expect(t500?.groundMaterialName).toBe("#12 THHN green solid Copper");
    expect(t500?.extras ?? []).toEqual([]);
    // 2 #12 + ground ONLY (plan § 5, Q3): no other 500 type ships.
    expect(
      BASELINE_RUN_TYPES.filter(t => t.label.startsWith("500 series"))
    ).toHaveLength(1);
  });

  it("its row: per foot, 10 ft sticks joined by a coupling, clip spacing NOT SET", () => {
    const row = byName.get(RACEWAY_500);
    expect(row?.unitOfSale).toBe("foot");
    expect(row?.raceway).toEqual({
      stickLengthFeet: 10,
      stickJoint: "coupling",
      strapSpacingFeet: null,
      strapFromBoxFeet: null,
    });
    // The old name is still a search word on it.
    expect(row?.searchAliases).toMatch(/\bbase\b/);
  });

  it("the base row is RENAMED in place and the cover RETIRED — neither old name ships", () => {
    expect(RENAMED_BASELINE_MATERIALS[OLD_BASE_500]).toBe(RACEWAY_500);
    expect(FROZEN_ADDS_SHIPPED_AS[OLD_BASE_500]).toBe(RACEWAY_500);
    expect(RETIRED_BASELINE_MATERIALS).toContain(COVER_500);
    expect(FROZEN_ADDS_NOT_SEEDED[COVER_500]?.kind).toBe("retired");
    expect(byName.has(OLD_BASE_500)).toBe(false);
    expect(byName.has(COVER_500)).toBe(false);
  });

  it("ships its nine parts, each sold each, commercial, $0, findable by 500 and by wiremold", () => {
    for (const name of PARTS_500) {
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      expect(row!.unitOfSale, name).toBe("each");
      expect(row!.category, name).toBe("Surface Raceway");
      expect(row!.jobKind, name).toBe("commercial");
      expect(Number(row!.costPerUnit), name).toBe(0);
      expect(row!.searchAliases, name).toMatch(/\bv500\b/);
      expect(row!.searchAliases, name).toMatch(/\bwiremold\b/);
      // Never a 700 word on a 500-ONLY part: "700 elbow" must not find it.
      // A shared part answers to both, on purpose.
      if (!name.includes("500/700"))
        expect(row!.searchAliases, name).not.toMatch(/\b(v?700)\b/);
    }
  });
});

// ─── On a database: the old 500 rows, then the seed ──────────────────────────

const COMPANY = 91354;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = describe.skipIf(!hasDb);

dropFixtureUsersAfterAll([COMPANY]);

async function seedMaterials(): Promise<void> {
  let ran = false;
  await withSeedLock(BASELINE_MATERIALS_SEED_LOCK, async () => {
    await seedBaselineMaterialsFrom(
      BASELINE_MATERIALS,
      RETIRED_BASELINE_MATERIALS
    );
    ran = true;
  });
  if (!ran) throw new Error("the seed pass did not run (lock not taken)");
}

async function sharedRows(name: string) {
  const db = (await getDb())!;
  return db
    .select({
      id: materials.id,
      name: materials.name,
      isActive: materials.isActive,
    })
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)));
}

/** A shared cover row this file inserted, removed in afterAll (leak guard). */
const INSERTED: { cover?: number } = {};

withDb("the 500 rename on a database that holds the OLD rows", () => {
  let baseId: number;

  beforeAll(async () => {
    const db = (await getDb())!;
    await db
      .insert(users)
      .values({
        id: COMPANY,
        openId: `test-sch80-500-seed-${COMPANY}`,
        name: "Sch 80 / 500 seed fixture",
      })
      .onDuplicateKeyUpdate({ set: { name: "Sch 80 / 500 seed fixture" } });
    await seedMaterials();

    // Put the 500 rows back the way staging held them before this seed: the
    // raceway under its OLD name, and an ACTIVE cover beside it.
    const [renamed] = await sharedRows(RACEWAY_500);
    expect(renamed, "the seed ships the 500 raceway").toBeDefined();
    baseId = renamed.id;
    await db
      .update(materials)
      .set({ name: OLD_BASE_500 })
      .where(eq(materials.id, baseId));
    const [cover] = await sharedRows(COVER_500);
    if (cover) {
      await db
        .update(materials)
        .set({ isActive: true })
        .where(eq(materials.id, cover.id));
    } else {
      const [result] = await db.insert(materials).values({
        name: COVER_500,
        unitOfSale: "foot",
        costPerUnit: "0.0000",
        category: "Surface Raceway",
        searchAliases: "",
        userId: null,
      });
      INSERTED.cover = result.insertId;
    }
  });

  afterAll(async () => {
    if (!hasDb) return;
    const db = (await getDb())!;
    // Whatever happened, leave the shared catalog as the seed makes it.
    await db
      .update(materials)
      .set({ name: RACEWAY_500 })
      .where(and(eq(materials.id, baseId), eq(materials.name, OLD_BASE_500)));
    if (INSERTED.cover !== undefined)
      await db.delete(materials).where(eq(materials.id, INSERTED.cover));
  });

  it("renames the raceway IN PLACE (same id) and retires the cover, which still resolves", async () => {
    await seedMaterials();
    expect(await sharedRows(OLD_BASE_500)).toEqual([]);
    expect(await sharedRows(RACEWAY_500)).toEqual([
      { id: baseId, name: RACEWAY_500, isActive: true },
    ]);
    const cover = await sharedRows(COVER_500);
    expect(cover).toHaveLength(1);
    expect(cover[0].isActive).toBe(false);
  });

  it("seeds the 500 type on that same row, with #12 THHN green as its ground", async () => {
    await seedBaselineRunTypes();
    const db = (await getDb())!;
    const [t] = await db
      .select()
      .from(takeoffRunTypes)
      .where(
        and(isNull(takeoffRunTypes.userId), eq(takeoffRunTypes.label, TYPE_500))
      );
    expect(t?.racewayMaterialId).toBe(baseId);
    const [green] = await sharedRows("#12 THHN green solid Copper");
    const [conductor] = await sharedRows("#12 THHN solid Copper");
    expect([t?.conductorMaterialId, t?.conductorCount]).toEqual([
      conductor.id,
      2,
    ]);
    expect([t?.groundMaterialId, t?.groundCount]).toEqual([green.id, 1]);
  });

  it("seeds tape on all nine Sch 80 types, once — a second start adds nothing", async () => {
    await seedBaselineRunTypes();
    const db = (await getDb())!;
    const read = () =>
      db
        .select({
          label: takeoffRunTypes.label,
          raceway: materials.name,
          extraId: takeoffRunTypeExtras.id,
          appliesTo: takeoffRunTypeExtras.appliesTo,
        })
        .from(takeoffRunTypes)
        .innerJoin(
          materials,
          eq(materials.id, takeoffRunTypes.racewayMaterialId)
        )
        .leftJoin(
          takeoffRunTypeExtras,
          eq(takeoffRunTypeExtras.runTypeId, takeoffRunTypes.id)
        )
        .where(
          and(
            isNull(takeoffRunTypes.userId),
            eq(takeoffRunTypes.status, "active")
          )
        );
    const first = (await read()).filter(r => r.label.includes("PVC Sch 80"));
    await seedBaselineRunTypes();
    const second = (await read()).filter(r => r.label.includes("PVC Sch 80"));
    expect(second).toEqual(first);
    expect(first.map(r => r.label).sort()).toEqual(
      sizesFor("PVC Sch 80")
        .map(size => undergroundRunTypeLabel(size, "PVC Sch 80"))
        .sort()
    );
    for (const r of first) {
      expect(r.raceway, r.label).toBe(r.label.replace(", underground", ""));
      expect(r.extraId, r.label).not.toBeNull();
      expect(r.appliesTo, r.label).toBe("flat");
    }
  });
});
