/**
 * WHAT THE CATALOG REVIEW (2026-10-08) DOES TO A DATABASE THAT ALREADY EXISTS.
 *
 * The pure half is server/catalogReview20261008.test.ts. This half runs the
 * real seed passes against the test database, because each claim is about a
 * row that was there BEFORE the new seed — which a fresh catalog, the only
 * thing the pure tests can see, never has:
 *
 *   1. the Specialty tag (0140) lands on the shipped row, is re-stamped on
 *      every start, and never reaches a company's copy — not by the seed,
 *      and not by forking a tagged row;
 *   2. a shipped run type still linking #12 bare copper as its ground is
 *      moved to #12 THHN green, while a company's own copy is left alone;
 *   3. the shipped 3-1/2" underground type is ARCHIVED, not deleted, and a
 *      second start changes nothing.
 *
 * Fixture ids are this file's own (7510-7511).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  BASELINE_MATERIALS_SEED_LOCK,
  forkMaterial,
  getDb,
  seedBaselineMaterialsFrom,
  seedBaselineRunTypes,
  withSeedLock,
} from "./db";
import { materials, takeoffRunTypes, users } from "../drizzle/schema";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import { undergroundRunTypeLabel } from "../shared/undergroundRunTypes";
import { dropFixtureUsersAfterAll } from "./testFixtureUsers";

const COMPANY = 7510;
const hasDb = Boolean(process.env.DATABASE_URL);
const withDb = describe.skipIf(!hasDb);

const BARE = "#12 bare solid Copper";
const GREEN = "#12 THHN green Copper";
const EMT_TYPE = '1/2" EMT, 2 #12 + ground';
const UNDERGROUND_3_5 = undergroundRunTypeLabel('3-1/2"');

async function seed(): Promise<void> {
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

async function shipped(name: string) {
  const db = (await getDb())!;
  const rows = await db
    .select()
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, name)));
  expect(rows, `one shipped "${name}"`).toHaveLength(1);
  return rows[0];
}

/**
 * A shipped #12 bare row as an OLD database holds it: a fresh test database
 * never has one, because the catalog stopped shipping it. Inserted as the
 * retired row it becomes, and the seed's retire pass is what proves itself
 * on it.
 */
async function oldBareRow(): Promise<number> {
  const db = (await getDb())!;
  const [existing] = await db
    .select({ id: materials.id })
    .from(materials)
    .where(and(isNull(materials.userId), eq(materials.name, BARE)));
  if (existing) return existing.id;
  const [result] = await db.insert(materials).values({
    name: BARE,
    unitOfSale: "foot",
    costPerUnit: "0.0000",
    category: "Wire & Cable",
    searchAliases: "",
    userId: null,
  });
  return result.insertId;
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db
    .insert(users)
    .values({
      id: COMPANY,
      openId: `test-catalog-review-${COMPANY}`,
      name: "Catalog review fixture",
      email: `catalog-review-${COMPANY}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({ set: { name: "Catalog review fixture" } });
  await seed();
  await seedBaselineRunTypes();
});

afterAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db.delete(takeoffRunTypes).where(eq(takeoffRunTypes.userId, COMPANY));
  await db.delete(materials).where(eq(materials.userId, COMPANY));
});
dropFixtureUsersAfterAll([COMPANY]);

withDb("the Specialty tag on a database (0140)", () => {
  it("is on the shipped row, and re-stamped if anything clears it", async () => {
    const busway = await shipped("Busway");
    expect(busway.isSpecialty).toBe(true);
    expect((await shipped('4" canless wafer LED downlight')).isSpecialty).toBe(
      null
    );

    const db = (await getDb())!;
    await db
      .update(materials)
      .set({ isSpecialty: null })
      .where(eq(materials.id, busway.id));
    await seed();
    expect((await shipped("Busway")).isSpecialty).toBe(true);
  });

  it("never reaches a company's copy: a fork of a tagged row is everyday", async () => {
    const busway = await shipped("Busway");
    const forkId = await forkMaterial(busway.id, COMPANY);
    const db = (await getDb())!;
    const [fork] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, forkId));
    expect(fork.userId).toBe(COMPANY);
    expect(fork.isSpecialty, "the fork copied the tag").toBe(null);

    await seed();
    const [after] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, forkId));
    expect(after.isSpecialty, "the seed tagged a company's row").toBe(null);
  });
});

withDb(
  "the #12 + ground run types on a database that predates the review",
  () => {
    it("move a shipped type's #12 bare ground to #12 THHN green, and leave a company's copy alone", async () => {
      const db = (await getDb())!;
      const bareId = await oldBareRow();
      const green = await shipped(GREEN);

      const [type] = await db
        .select()
        .from(takeoffRunTypes)
        .where(
          and(
            isNull(takeoffRunTypes.userId),
            eq(takeoffRunTypes.label, EMT_TYPE)
          )
        );
      // As an old database has it: the shipped type pulls #12 bare.
      await db
        .update(takeoffRunTypes)
        .set({ groundMaterialId: bareId })
        .where(eq(takeoffRunTypes.id, type.id));
      // A company's own copy that also pulls #12 bare — theirs to keep.
      const [own] = await db.insert(takeoffRunTypes).values({
        userId: COMPANY,
        label: "Catalog review fixture type",
        pathType: "conduit",
        groundMaterialId: bareId,
        groundCount: 1,
      });

      await seedBaselineRunTypes();

      const [moved] = await db
        .select({ ground: takeoffRunTypes.groundMaterialId })
        .from(takeoffRunTypes)
        .where(eq(takeoffRunTypes.id, type.id));
      expect(moved.ground).toBe(green.id);
      const [kept] = await db
        .select({ ground: takeoffRunTypes.groundMaterialId })
        .from(takeoffRunTypes)
        .where(eq(takeoffRunTypes.id, own.insertId));
      expect(kept.ground, "a company's own type was re-pointed").toBe(bareId);

      // And the bare row itself is retired, not deleted: still there, by id.
      await seed();
      const [bare] = await db
        .select({ isActive: materials.isActive })
        .from(materials)
        .where(eq(materials.id, bareId));
      expect(bare?.isActive).toBe(false);
    });
  }
);

withDb('the 3-1/2" underground run type on a database that has it', () => {
  it("is archived, never deleted, and a second start changes nothing", async () => {
    const db = (await getDb())!;
    const existing = await db
      .select({ id: takeoffRunTypes.id })
      .from(takeoffRunTypes)
      .where(
        and(
          isNull(takeoffRunTypes.userId),
          eq(takeoffRunTypes.label, UNDERGROUND_3_5)
        )
      );
    let id = existing[0]?.id;
    if (id === undefined) {
      // A fresh database never seeded it; an older one did, ACTIVE.
      const [result] = await db.insert(takeoffRunTypes).values({
        userId: null,
        label: UNDERGROUND_3_5,
        pathType: "conduit",
      });
      id = result.insertId;
    }
    await db
      .update(takeoffRunTypes)
      .set({ status: "active", archivedAt: null })
      .where(eq(takeoffRunTypes.id, id));

    await seedBaselineRunTypes();
    const [first] = await db
      .select()
      .from(takeoffRunTypes)
      .where(eq(takeoffRunTypes.id, id));
    expect(first?.status).toBe("archived");
    expect(first?.archivedAt).not.toBeNull();

    await seedBaselineRunTypes();
    const [second] = await db
      .select()
      .from(takeoffRunTypes)
      .where(eq(takeoffRunTypes.id, id));
    expect(second).toEqual(first);

    // The other underground types stay active.
    const active = await db
      .select({ label: takeoffRunTypes.label })
      .from(takeoffRunTypes)
      .where(
        and(
          isNull(takeoffRunTypes.userId),
          eq(takeoffRunTypes.status, "active"),
          inArray(takeoffRunTypes.label, [
            undergroundRunTypeLabel('3"'),
            undergroundRunTypeLabel('4"'),
          ])
        )
      );
    expect(active).toHaveLength(2);
  });
});
