/**
 * A RETIRED NAME PUT BACK IN THE CATALOG MUST COME BACK.
 *
 * ── The bug this pins (todo.md, found 2026-09-26) ────────────────────────────
 * The retire pass hides every shipped row named in RETIRED_BASELINE_MATERIALS,
 * and until this file nothing ever showed one again. Take a name off that list
 * and put it back in the catalog, and on any database that still held the old
 * row it stayed hidden: the insert pass skipped the name because a row with it
 * existed. The catalog claimed to ship a material no screen showed, with no
 * error anywhere, and a fresh database — the only kind a test normally sees —
 * could not show it.
 *
 * ── Why switching it back on is safe for a company ──────────────────────────
 * On a SHIPPED row, `isActive = false` has exactly one writer: the retire pass.
 * A company that edits, archives or deletes a starter does it to its OWN copy
 * (`archiveLibraryRow` forks first), and that copy is what hides the starter
 * from its list. So the reactivation touches `userId IS NULL` rows only, and
 * the second test below is what says a company's copy never moves.
 *
 * Verified red on 2026-09-26 before the reactivation existed:
 *
 *   AssertionError: the fixture is back in the catalog but still hidden:
 *                   expected false to be true
 *
 * Fixture ids are distinct from every other suite — vitest runs files in
 * parallel and shared ids delete each other's rows mid-run.
 */
import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  archiveMaterial,
  BASELINE_MATERIALS_SEED_LOCK,
  type BaselineSeedReport,
  forkMaterial,
  getDb,
  getLibraryMaterials,
  seedBaselineMaterialsFrom,
  updateMaterial,
  withSeedLock,
} from "./db";
import { materials, users } from "../drizzle/schema";
import {
  BASELINE_MATERIALS,
  RETIRED_BASELINE_MATERIALS,
} from "./seed/materials";
import type { BaselineMaterial } from "./seed/materials/types";

const USER = 7404;
/** A second company, holding a copy hidden the pre-a051f53 way. */
const OTHER = 7405;
const COMPANIES = [USER, OTHER];
const hasDb = Boolean(process.env.DATABASE_URL);

/** A shipped row only this suite knows about, so it can come and go freely. */
const FIXTURE: BaselineMaterial = {
  name: "Zz seed reactivation fixture lug",
  unitOfSale: "each",
  costPerUnit: "0.0000",
  category: "Connectors & Terminations",
  searchAliases: "",
};

const SHIPPING = [...BASELINE_MATERIALS, FIXTURE];
const NOT_SHIPPING = BASELINE_MATERIALS;
const RETIRING = [...RETIRED_BASELINE_MATERIALS, FIXTURE.name];
const NOT_RETIRING = RETIRED_BASELINE_MATERIALS;

/**
 * One seed pass under the server's own lock. Throws if the lock was not taken,
 * because `withSeedLock` skips silently — and a skipped pass would pass every
 * "nothing changed" assertion in this file for the wrong reason.
 */
async function seed(
  catalog: BaselineMaterial[],
  retired: string[]
): Promise<BaselineSeedReport> {
  let report: BaselineSeedReport | undefined;
  await withSeedLock(BASELINE_MATERIALS_SEED_LOCK, async () => {
    report = await seedBaselineMaterialsFrom(catalog, retired);
  });
  if (!report) throw new Error("the seed pass did not run (lock not taken)");
  return report;
}

async function removeFixtureRows() {
  const db = await getDb();
  if (!db) return;
  // Forks first: they point at the shipped row.
  await db.delete(materials).where(inArray(materials.userId, COMPANIES));
  await db
    .delete(materials)
    .where(and(eq(materials.name, FIXTURE.name), isNull(materials.userId)));
}

async function shippedFixture() {
  const db = await getDb();
  const rows = await db!
    .select()
    .from(materials)
    .where(and(eq(materials.name, FIXTURE.name), isNull(materials.userId)));
  expect(rows, "exactly one shipped fixture row").toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  if (!hasDb) return;
  const db = await getDb();
  if (!db) return;
  for (const id of COMPANIES) {
    await db
      .insert(users)
      .values({
        id,
        openId: `test-seedreactivate-${id}`,
        name: "Seed reactivation fixture",
        email: `seedreactivate-${id}@example.test`,
        loginMethod: "password",
      })
      .onDuplicateKeyUpdate({ set: { name: "Seed reactivation fixture" } });
  }
});

beforeEach(async () => {
  if (!hasDb) return;
  await removeFixtureRows();
});

afterAll(async () => {
  if (!hasDb) return;
  // Left behind, the fixture would sit in every other suite's library as an
  // active shipped row the seed file has never heard of.
  await removeFixtureRows();
});

describe.skipIf(!hasDb)("a retired name put back in the catalog", () => {
  it("is showing again after the next seed", async () => {
    // Shipped, then retired, then put back — the three states in order.
    await seed(SHIPPING, NOT_RETIRING);
    expect((await shippedFixture()).isActive).toBe(true);

    await seed(NOT_SHIPPING, RETIRING);
    const retired = await shippedFixture();
    expect(retired.isActive, "the retire pass hid it").toBe(false);

    await seed(SHIPPING, NOT_RETIRING);
    const back = await shippedFixture();
    expect(
      back.isActive,
      "the fixture is back in the catalog but still hidden"
    ).toBe(true);
    // The SAME row, not a second one: everything pointing at the old id —
    // assemblies, kits, takeoff stamps, priced bids — still resolves.
    expect(back.id).toBe(retired.id);

    const library = await getLibraryMaterials(USER);
    expect(library.map(m => m.id)).toContain(back.id);
  });

  it("leaves a company's own copy exactly as it was, and a second seed changes nothing", async () => {
    await seed(SHIPPING, NOT_RETIRING);
    const shipped = await shippedFixture();

    // The company prices the starter ($12.50) and then archives it. Both land
    // on their own copy; the starter underneath is untouched.
    const forkId = await forkMaterial(shipped.id, USER);
    await updateMaterial(forkId, USER, { costPerUnit: "12.5000" });
    const archivedId = await archiveMaterial(forkId, USER);
    expect(archivedId).toBe(forkId);

    // Another company's copy hidden the OLD way: forked, then `isActive =
    // false`, which is what removing a material did before a051f53 made it
    // an archive. Production held none of these on 2026-09-26; this is here
    // so the seeder can never be the thing that changes that. Forked rather
    // than typed in, because a real one was: a hand-built row with a NULL
    // field would be filled by the fork-inheritance pass in
    // backfillMaterialMetadata, which is older than this file and correct.
    const db = await getDb();
    const oldStyleId = await forkMaterial(shipped.id, OTHER);
    await db!
      .update(materials)
      .set({ isActive: false })
      .where(eq(materials.id, oldStyleId));

    const companyRows = async () =>
      db!
        .select()
        .from(materials)
        .where(inArray(materials.userId, COMPANIES))
        .orderBy(materials.id);
    const before = await companyRows();

    // Retire the starter, then put it back.
    await seed(NOT_SHIPPING, RETIRING);
    const back = await seed(SHIPPING, NOT_RETIRING);
    expect(back.reactivated, "the starter itself came back").toBe(1);
    expect((await shippedFixture()).isActive).toBe(true);

    // Every column of every company row, including updatedAt — not just the
    // ones this test thought to check.
    const after = await companyRows();
    expect(after).toEqual(before);

    const fork = after.find(r => r.id === forkId)!;
    expect(Number(fork.costPerUnit)).toBeCloseTo(12.5, 4);
    expect(fork.status).toBe("archived");
    expect(after.find(r => r.id === oldStyleId)!.isActive).toBe(false);

    // Their working list still does not show the starter they archived, and
    // their archive still holds their priced copy.
    const working = await getLibraryMaterials(USER);
    expect(working.map(m => m.id)).not.toContain(shipped.id);
    expect(working.map(m => m.id)).not.toContain(forkId);
    const archive = await getLibraryMaterials(USER, "archived");
    expect(archive.map(m => m.id)).toContain(forkId);

    // THE SECOND RUN. Reported as having run, and nothing moved: the shipped
    // row and every company row are byte-for-byte what the first run left.
    const shippedAfterFirst = await shippedFixture();
    const again = await seed(SHIPPING, NOT_RETIRING);
    expect(again).toEqual({ inserted: 0, retired: 0, reactivated: 0 });
    expect(await shippedFixture()).toEqual(shippedAfterFirst);
    expect(await companyRows()).toEqual(after);
  });

  it("never switches on a company row that shares a shipped name", async () => {
    // Only `userId IS NULL` rows are the catalog's. A company row hidden the
    // old way, under the very name the catalog ships, is theirs.
    await seed(SHIPPING, NOT_RETIRING);
    const db = await getDb();
    const [own] = await db!.insert(materials).values({
      name: FIXTURE.name,
      unitOfSale: "each",
      costPerUnit: "7.0000",
      category: "Connectors & Terminations",
      userId: USER,
      isActive: false,
    });

    await seed(NOT_SHIPPING, RETIRING);
    await seed(SHIPPING, NOT_RETIRING);

    const [row] = await db!
      .select()
      .from(materials)
      .where(eq(materials.id, own.insertId));
    expect(row.userId).toBe(USER);
    expect(row.isActive).toBe(false);
  });
});
