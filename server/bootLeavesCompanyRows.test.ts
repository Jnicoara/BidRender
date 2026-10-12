/**
 * A SERVER START NEVER WRITES A COMPANY'S OWN ROWS.
 *
 * Owner, 2026-10-12 (baseline-screen-plan.md § 6 and § 9 F3): the boot may
 * re-stamp the SHARED starter (`userId` NULL) from the seed files — that is
 * the loader's job — and nothing else. A company's own copy of a material,
 * assembly, kit, rate, modifier, run type or step is the company's, and a
 * deploy must not reach it, not even to "fill a blank".
 *
 * ── The two ways it used to ──────────────────────────────────────────────────
 * 1. `backfillMaterialMetadata` pass 2 filled NULL category, aliases,
 *    default qty and raceway facts on companies' forks. A stick length going
 *    from NULL to 10 ft turns "not countable" into a coupling count on an open
 *    bid, with nobody choosing it (F3).
 * 2. `dedupeBaselineRows` deleted a duplicate SHARED row, and the foreign keys
 *    cascaded: a company recipe line pointing at that duplicate was deleted
 *    with it. The boot never named a company row, and still removed one.
 *
 * ── How this proves it ───────────────────────────────────────────────────────
 * Every row the fixture company owns, across every library table and the
 * recipe/kit children, is read before and after TWO full boots
 * (`seedShippedLibrary`, the server's own call) and compared whole. And the
 * shared row is checked to have been re-stamped, so "nothing moved" cannot be
 * "nothing ran". Red without the fix: pass 2 fills the fork's NULLs, and the
 * dedupe cascades the recipe line away.
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  getDb,
  forkMaterial,
  createAssembly,
  setAssemblyMaterials,
} from "./db";
import { seedShippedLibrary } from "./seedShippedLibrary";
import {
  assemblies,
  assemblyLaborSteps,
  assemblyMaterials,
  assemblyModifiers,
  kitAssemblies,
  kits,
  laborRates,
  laborSteps,
  materials,
  modifiers,
  takeoffRunTypeExtras,
  takeoffRunTypes,
  users,
} from "../drizzle/schema";

const USER = 6471;
const hasDb = Boolean(process.env.DATABASE_URL);

/** A shipped raceway: its fork's NULL raceway facts are what pass 2 filled. */
const RACEWAY = '3/4" EMT';
/** Obscure on purpose: a duplicate of it is briefly visible to other suites. */
const DUPED = "Wire pulling grip";

let duplicateId: number | null = null;

async function boot(): Promise<void> {
  const failures: string[] = [];
  await seedShippedLibrary(step => failures.push(step));
  expect(failures).toEqual([]);
}

/** Every row the fixture company owns, whole, in a stable order. */
async function companyRows(): Promise<Record<string, unknown[]>> {
  const db = (await getDb())!;
  const assemblyIds = (
    await db
      .select({ id: assemblies.id })
      .from(assemblies)
      .where(eq(assemblies.userId, USER))
  ).map(r => r.id);
  const kitIds = (
    await db.select({ id: kits.id }).from(kits).where(eq(kits.userId, USER))
  ).map(r => r.id);
  return {
    materials: await db
      .select()
      .from(materials)
      .where(eq(materials.userId, USER))
      .orderBy(materials.id),
    laborRates: await db
      .select()
      .from(laborRates)
      .where(eq(laborRates.userId, USER))
      .orderBy(laborRates.id),
    modifiers: await db
      .select()
      .from(modifiers)
      .where(eq(modifiers.userId, USER))
      .orderBy(modifiers.id),
    assemblies: await db
      .select()
      .from(assemblies)
      .where(eq(assemblies.userId, USER))
      .orderBy(assemblies.id),
    kits: await db
      .select()
      .from(kits)
      .where(eq(kits.userId, USER))
      .orderBy(kits.id),
    runTypes: await db
      .select()
      .from(takeoffRunTypes)
      .where(eq(takeoffRunTypes.userId, USER))
      .orderBy(takeoffRunTypes.id),
    runTypeExtras: await db
      .select()
      .from(takeoffRunTypeExtras)
      .where(eq(takeoffRunTypeExtras.userId, USER))
      .orderBy(takeoffRunTypeExtras.id),
    laborSteps: await db
      .select()
      .from(laborSteps)
      .where(eq(laborSteps.userId, USER))
      .orderBy(laborSteps.id),
    assemblyMaterials:
      assemblyIds.length === 0
        ? []
        : await db
            .select()
            .from(assemblyMaterials)
            .where(inArray(assemblyMaterials.assemblyId, assemblyIds))
            .orderBy(assemblyMaterials.id),
    assemblyModifiers:
      assemblyIds.length === 0
        ? []
        : await db
            .select()
            .from(assemblyModifiers)
            .where(inArray(assemblyModifiers.assemblyId, assemblyIds))
            .orderBy(assemblyModifiers.id),
    assemblyLaborSteps:
      assemblyIds.length === 0
        ? []
        : await db
            .select()
            .from(assemblyLaborSteps)
            .where(inArray(assemblyLaborSteps.assemblyId, assemblyIds))
            .orderBy(assemblyLaborSteps.id),
    kitAssemblies:
      kitIds.length === 0
        ? []
        : await db
            .select()
            .from(kitAssemblies)
            .where(inArray(kitAssemblies.kitId, kitIds))
            .orderBy(kitAssemblies.id),
  };
}

async function cleanUp(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Children cascade from the company's assemblies and materials.
  await db.delete(assemblies).where(eq(assemblies.userId, USER));
  await db.delete(materials).where(eq(materials.userId, USER));
  if (duplicateId !== null) {
    await db
      .delete(materials)
      .where(and(eq(materials.id, duplicateId), isNull(materials.userId)));
    duplicateId = null;
  }
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = (await getDb())!;
  await db
    .insert(users)
    .values({
      id: USER,
      openId: `test-bootrows-${USER}`,
      name: "Boot leaves company rows fixture",
      email: `bootrows-${USER}@example.test`,
      loginMethod: "password",
    })
    .onDuplicateKeyUpdate({
      set: { name: "Boot leaves company rows fixture" },
    });
  await cleanUp();
  await boot();
});

afterAll(async () => {
  if (!hasDb) return;
  await cleanUp();
});

describe.skipIf(!hasDb)(
  "a server start never writes a company's own rows",
  () => {
    it("leaves a fork's blanks blank, and every other company row as it was", async () => {
      const db = (await getDb())!;
      const [shipped] = await db
        .select()
        .from(materials)
        .where(and(eq(materials.name, RACEWAY), isNull(materials.userId)));
      expect(shipped).toBeDefined();
      // The shipped row HAS the facts, so a fill would have something to copy.
      expect(shipped.stickLengthFeet).not.toBeNull();
      expect(shipped.category).not.toBeNull();

      const forkId = await forkMaterial(shipped.id, USER);
      // A fork as one made before those columns existed: blanks everywhere the
      // old pass 2 filled.
      await db
        .update(materials)
        .set({
          category: null,
          searchAliases: null,
          defaultQty: null,
          stickLengthFeet: null,
          stickJoint: null,
          strapSpacingFeet: null,
          strapFromBoxFeet: null,
          costPerUnit: "7.2500",
        })
        .where(eq(materials.id, forkId));

      // And a shipped row knocked off its seed value, to prove the boot RAN.
      await db
        .update(materials)
        .set({ searchAliases: "knocked off" })
        .where(eq(materials.id, shipped.id));

      const before = await companyRows();
      expect(before.materials).toHaveLength(1);

      await boot();
      await boot();

      expect(await companyRows()).toEqual(before);

      const [restamped] = await db
        .select()
        .from(materials)
        .where(eq(materials.id, shipped.id));
      expect(restamped.searchAliases).toBe(shipped.searchAliases);
    });

    it("does not delete a company recipe line by removing a duplicate shared row", async () => {
      const db = (await getDb())!;
      const [original] = await db
        .select()
        .from(materials)
        .where(and(eq(materials.name, DUPED), isNull(materials.userId)));
      expect(original).toBeDefined();

      // A second shared row of the same name: what the pre-lock race left.
      const { id: _id, createdAt: _c, updatedAt: _u, ...content } = original;
      const [inserted] = await db.insert(materials).values(content);
      duplicateId = inserted.insertId;

      // The company's own recipe uses the DUPLICATE.
      const assemblyId = await createAssembly({
        userId: USER,
        name: `Boot fixture recipe ${USER}`,
        category: "General",
      });
      await setAssemblyMaterials(assemblyId, [
        { materialId: duplicateId, qty: "2.0000", isBranchWhip: false },
      ]);

      const before = await companyRows();
      expect(before.assemblyMaterials).toHaveLength(1);

      await boot();
      await boot();

      expect(await companyRows()).toEqual(before);
    });
  }
);
