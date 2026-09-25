/**
 * Tests for the Foundation material library data layer (server/db.ts § Materials).
 *
 * Named materialsLibrary rather than materials to avoid colliding with
 * materials.test.ts, which covers the older /matdb supply-house price list.
 *
 * The merge tests are pure and always run. The rest need a database and are
 * skipped without DATABASE_URL, matching how v545.test.ts expects a real DB.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq, inArray, isNull } from "drizzle-orm";
import {
  createMaterial,
  archiveMaterial,
  forkMaterial,
  getDb,
  getLibraryMaterials,
  getMaterialById,
  mergeLibraryRows,
  revertMaterialToBaseline,
  seedBaselineMaterials,
  updateMaterial,
} from "./db";
import { materials, users } from "../drizzle/schema";
import { BASELINE_MATERIALS } from "./seed/baselineMaterials";

const USER = 4242;
const OTHER_USER = 9999;

// ─── mergeLibraryRows — pure, no database ─────────────────────────────────────

describe("mergeLibraryRows", () => {
  const baseline = (id: number) => ({ id, userId: null, baselineId: null });
  const owned = (id: number, baselineId: number | null) => ({
    id,
    userId: USER,
    baselineId,
  });

  it("returns baseline rows untouched when the user has forked nothing", () => {
    const rows = [baseline(1), baseline(2)];
    expect(mergeLibraryRows(rows, USER).map(r => r.id)).toEqual([1, 2]);
  });

  it("hides a baseline row once the user has forked it", () => {
    const rows = [baseline(1), baseline(2), owned(50, 1)];
    expect(mergeLibraryRows(rows, USER).map(r => r.id)).toEqual([2, 50]);
  });

  it("keeps fully custom rows, which supersede nothing", () => {
    const rows = [baseline(1), owned(50, null)];
    expect(mergeLibraryRows(rows, USER).map(r => r.id)).toEqual([1, 50]);
  });

  it("does not let another user's fork hide a baseline row", () => {
    const rows = [baseline(1), { id: 60, userId: OTHER_USER, baselineId: 1 }];
    expect(mergeLibraryRows(rows, USER).map(r => r.id)).toEqual([1, 60]);
  });

  it("preserves input ordering", () => {
    const rows = [baseline(3), owned(50, 3), baseline(1)];
    expect(mergeLibraryRows(rows, USER).map(r => r.id)).toEqual([50, 1]);
  });
});

// ─── Database-backed behaviour ────────────────────────────────────────────────

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * `materials.userId` is a real foreign key, so the test users have to exist
 * before any user-owned row can be inserted. Both users and their materials are
 * disposable fixtures — wiped at the start of each run so repeats stay clean.
 */
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
        openId: `test-materials-library-${id}`,
        name: `Materials library test user ${id}`,
      });
    }
  }

  await db
    .delete(materials)
    .where(inArray(materials.userId, [USER, OTHER_USER]));
});

describe.skipIf(!hasDb)("baseline material seeding", () => {
  beforeAll(async () => {
    await seedBaselineMaterials();
  });

  it("seeds every starter material as a baseline row", async () => {
    const rows = await getLibraryMaterials(USER);
    for (const seeded of BASELINE_MATERIALS) {
      const found = rows.find(r => r.name === seeded.name && r.userId === null);
      expect(found, `missing baseline material: ${seeded.name}`).toBeDefined();
    }
  });

  it("is idempotent — running it twice does not duplicate rows", async () => {
    await seedBaselineMaterials();
    const rows = await getLibraryMaterials(USER);
    const duplicated = rows.filter(
      r => r.userId === null && r.name === "20A Single-Pole breaker"
    );
    expect(duplicated).toHaveLength(1);
  });

  it("stores cost as an exact decimal, not a rounded float", async () => {
    // Written against a material this test prices itself. It used to read a
    // shipped row's $0.08, which stopped saying anything once the catalog
    // began shipping every row unpriced — and an assertion that 0 is exactly 0
    // would not have caught a rounding bug anyway. An awkward decimal does.
    const id = await createMaterial({
      userId: USER,
      name: `Decimal probe ${Date.now()}`,
      unitOfSale: "each",
      costPerUnit: "0.0800",
    });
    const row = await getMaterialById(id, USER);
    expect(row?.costPerUnit).toBe("0.0800");
    expect(Number(row?.costPerUnit)).toBeCloseTo(0.08, 10);
  });
});

describe.skipIf(!hasDb)("material categories", () => {
  beforeAll(async () => {
    await seedBaselineMaterials();
  });

  it("shelves every starter material under the category the seed file declares", async () => {
    const rows = await getLibraryMaterials(USER);
    for (const seeded of BASELINE_MATERIALS) {
      const found = rows.find(r => r.name === seeded.name && r.userId === null);
      expect(found?.category, `wrong category for ${seeded.name}`).toBe(
        seeded.category
      );
    }
  });

  it("leaves no starter material uncategorised", async () => {
    const rows = await getLibraryMaterials(USER);
    const baselines = rows.filter(r => r.userId === null);
    expect(baselines.every(r => r.category !== null)).toBe(true);
  });

  it("re-stamps a baseline row whose category was lost, so the seed file stays the authority", async () => {
    const db = await getDb();
    const before = await getLibraryMaterials(USER);
    const target = before.find(
      r => r.userId === null && r.name === "EMT strap"
    )!;

    await db!
      .update(materials)
      .set({ category: null })
      .where(eq(materials.id, target.id));
    await seedBaselineMaterials();

    const after = await getMaterialById(target.id, USER);
    expect(after?.category).toBe("Conduit Fittings");
  });

  it("backfills a fork that predates the column from the baseline it came from", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "3-way switch"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);

    // Simulate a row forked before `category` existed.
    const db = await getDb();
    await db!
      .update(materials)
      .set({ category: null })
      .where(eq(materials.id, forkId));

    await seedBaselineMaterials();

    const fork = await getMaterialById(forkId, USER);
    expect(fork?.category).toBe("Switches");
  });

  it("does not overwrite a category the user chose for their own copy", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "Fan-rated ceiling box"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);

    await updateMaterial(forkId, USER, { category: "Wall Plates & Misc" });
    await seedBaselineMaterials();

    const fork = await getMaterialById(forkId, USER);
    expect(fork?.category).toBe("Wall Plates & Misc");
  });

  it("carries the category onto a fresh fork without any category-specific code", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "GFCI receptacle"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);
    const fork = await getMaterialById(forkId, USER);
    expect(fork?.category).toBe("Receptacles");
  });

  it("restores the starter category on revert", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "6ft MC whip"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);

    await updateMaterial(forkId, USER, { category: "Boxes" });
    expect((await getMaterialById(forkId, USER))?.category).toBe("Boxes");

    await revertMaterialToBaseline(forkId, USER);
    expect((await getMaterialById(forkId, USER))?.category).toBe(
      "Lighting Hardware"
    );
  });
});

describe.skipIf(!hasDb)("material search aliases", () => {
  beforeAll(async () => {
    await seedBaselineMaterials();
  });

  it("gives every starter material trade slang to be found by", async () => {
    // Read baselines straight from the table, not through getLibraryMaterials:
    // the merged list hides any baseline an earlier test forked.
    const db = await getDb();
    const rows = await db!
      .select()
      .from(materials)
      .where(isNull(materials.userId));
    for (const seeded of BASELINE_MATERIALS) {
      const found = rows.find(r => r.name === seeded.name);
      expect(
        found?.searchAliases,
        `no aliases for ${seeded.name}`
      ).toBeTruthy();
    }
  });

  it("never repeats a word already in the material's own name", async () => {
    // An alias that restates the name is dead weight — the name already matches,
    // and at a higher tier than alias text can reach.
    for (const seeded of BASELINE_MATERIALS) {
      const nameWords = new Set(
        seeded.name
          .toLowerCase()
          .replace(/[^a-z0-9 ]/g, " ")
          .split(/\s+/)
          .filter(w => w.length > 2)
      );
      const aliasWords = seeded.searchAliases.toLowerCase().split(/\s+/);
      const restated = aliasWords.filter(w => w.length > 2 && nameWords.has(w));
      expect(
        restated,
        `${seeded.name} restates: ${restated.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("re-stamps aliases that were lost, so the seed file stays the authority", async () => {
    const db = await getDb();
    const before = await getLibraryMaterials(USER);
    const target = before.find(
      r => r.userId === null && r.name === '4" square box'
    )!;

    await db!
      .update(materials)
      .set({ searchAliases: null })
      .where(eq(materials.id, target.id));
    await seedBaselineMaterials();

    const after = await getMaterialById(target.id, USER);
    expect(after?.searchAliases).toContain("1900");
  });

  it("backfills a fork that predates the column from its baseline", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "Wire nuts"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);

    const db = await getDb();
    await db!
      .update(materials)
      .set({ searchAliases: null })
      .where(eq(materials.id, forkId));
    await seedBaselineMaterials();

    const fork = await getMaterialById(forkId, USER);
    expect(fork?.searchAliases).toContain("marrette");
  });

  it("does not overwrite aliases the user wrote themselves", async () => {
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "EMT strap"
    )!;
    const forkId = await forkMaterial(baseline.id, USER);

    await updateMaterial(forkId, USER, { searchAliases: "my own words" });
    await seedBaselineMaterials();

    const fork = await getMaterialById(forkId, USER);
    expect(fork?.searchAliases).toBe("my own words");
  });

  it("keeps aliases the user deliberately cleared cleared", async () => {
    // The Materials editor stores a cleared field as "" rather than NULL for
    // exactly this reason: NULL is the backfill's signal to inherit from the
    // baseline, so saving a clear as NULL would put the starter's slang back
    // the next time the server booted — a silent undo of a real edit.
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(r => r.userId === null && r.name === "Dimmer")!;
    const forkId = await forkMaterial(baseline.id, USER);

    await updateMaterial(forkId, USER, { searchAliases: "" });
    await seedBaselineMaterials();

    expect((await getMaterialById(forkId, USER))?.searchAliases).toBe("");
  });
});

describe.skipIf(!hasDb)("fork and revert", () => {
  let baselineId: number;

  beforeAll(async () => {
    await seedBaselineMaterials();
    const rows = await getLibraryMaterials(USER);
    const baseline = rows.find(
      r => r.userId === null && r.name === "Duplex receptacle"
    );
    baselineId = baseline!.id;
  });

  it("forking produces a user-owned copy that points back at the baseline", async () => {
    const forkId = await forkMaterial(baselineId, USER);
    const fork = await getMaterialById(forkId, USER);
    expect(fork?.userId).toBe(USER);
    expect(fork?.baselineId).toBe(baselineId);
    expect(fork?.name).toBe("Duplex receptacle");
  });

  it("forking twice returns the same copy rather than duplicating", async () => {
    const first = await forkMaterial(baselineId, USER);
    const second = await forkMaterial(baselineId, USER);
    expect(second).toBe(first);
  });

  it("the fork replaces its baseline in the merged list", async () => {
    const forkId = await forkMaterial(baselineId, USER);
    const rows = await getLibraryMaterials(USER);
    expect(rows.some(r => r.id === baselineId)).toBe(false);
    expect(rows.some(r => r.id === forkId)).toBe(true);
  });

  it("reverting restores baseline content and keeps the same row id", async () => {
    // The shipped cost is read rather than hardcoded: what matters is that the
    // fork ends up matching its original again, not what the original says.
    const original = await getMaterialById(baselineId, USER);

    const forkId = await forkMaterial(baselineId, USER);
    await updateMaterial(forkId, USER, {
      costPerUnit: "99.0000",
      name: "My edited receptacle",
    });

    const edited = await getMaterialById(forkId, USER);
    expect(edited?.name).toBe("My edited receptacle");

    await revertMaterialToBaseline(forkId, USER);
    const reverted = await getMaterialById(forkId, USER);
    expect(reverted?.id).toBe(forkId);
    expect(reverted?.name).toBe("Duplex receptacle");
    expect(reverted?.costPerUnit).toBe(original?.costPerUnit);
  });

  it("refuses to revert a fully custom material", async () => {
    const customId = await createMaterial({
      userId: USER,
      name: "Custom widget",
      unitOfSale: "each",
      costPerUnit: "3.0000",
    });
    await expect(revertMaterialToBaseline(customId, USER)).rejects.toThrow(
      /no original/i
    );
  });
});

describe.skipIf(!hasDb)("ownership", () => {
  let baselineId: number;

  beforeAll(async () => {
    await seedBaselineMaterials();
    const rows = await getLibraryMaterials(USER);
    baselineId = rows.find(r => r.userId === null)!.id;
  });

  it("baseline rows cannot be edited directly", async () => {
    const before = await getMaterialById(baselineId, USER);
    await updateMaterial(baselineId, USER, { name: "hijacked" });
    const after = await getMaterialById(baselineId, USER);
    expect(after?.name).toBe(before?.name);
  });

  it("archiving a baseline row forks it first, leaving the shared row alone", async () => {
    // The db helper is shared with Modifiers, where hiding a starter IS
    // allowed, so it forks and archives the fork rather than touching the row
    // every user sees. The baseline itself survives untouched — what changes is
    // that this user's merged view no longer surfaces it.
    //
    // Materials never reach this path in practice: materialsRouter.archive
    // refuses a starter outright, which is where that policy lives and where
    // server/libraryArchive.test.ts asserts it.
    await archiveMaterial(baselineId, USER);

    const baseline = await getMaterialById(baselineId, OTHER_USER);
    expect(baseline).toBeDefined();
    expect(baseline!.status).toBe("active");

    const archived = await getLibraryMaterials(USER, "archived");
    expect(archived.some(r => r.baselineId === baselineId)).toBe(true);
  });

  it("one user cannot read another user's material", async () => {
    const id = await createMaterial({
      userId: OTHER_USER,
      name: "Private to other user",
      unitOfSale: "each",
      costPerUnit: "1.0000",
    });
    expect(await getMaterialById(id, USER)).toBeUndefined();
    expect(await getMaterialById(id, OTHER_USER)).toBeDefined();
  });

  it("one user cannot edit another user's material", async () => {
    const id = await createMaterial({
      userId: OTHER_USER,
      name: "Not yours",
      unitOfSale: "each",
      costPerUnit: "1.0000",
    });
    await updateMaterial(id, USER, { name: "hijacked" });
    const row = await getMaterialById(id, OTHER_USER);
    expect(row?.name).toBe("Not yours");
  });

  it("ownership columns in an update payload are ignored", async () => {
    const id = await createMaterial({
      userId: USER,
      name: "Stays mine",
      unitOfSale: "each",
      costPerUnit: "1.0000",
    });
    await updateMaterial(id, USER, {
      name: "Renamed",
      userId: OTHER_USER,
    } as never);
    const row = await getMaterialById(id, USER);
    expect(row?.name).toBe("Renamed");
    expect(row?.userId).toBe(USER);
  });

  it("archiving a user's own material removes it from the list", async () => {
    const id = await createMaterial({
      userId: USER,
      name: "Temporary",
      unitOfSale: "each",
      costPerUnit: "1.0000",
    });
    await archiveMaterial(id, USER);
    const rows = await getLibraryMaterials(USER);
    expect(rows.some(r => r.id === id)).toBe(false);
  });
});
