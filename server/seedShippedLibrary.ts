import {
  seedBaselineAssemblies,
  seedBaselineKits,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
  seedBaselineRunTypes,
} from "./db";

/**
 * Seed every shipped library, in the one order that works.
 *
 * ── Why this is its own function ─────────────────────────────────────────────
 * The server seeds the shipped catalog on every start (`server/_core/index.ts`)
 * and the tests never do. So a database built from migrations alone has no
 * shipped run types, and 11 tests fail on it — measured 2026-10-01 on a fresh
 * database, the state every CI run starts in. `scripts/seedBaseline.mts` runs
 * this for exactly that case.
 *
 * The server and the script call THIS rather than each listing the seeders,
 * because the order is not arbitrary and two copies of it would drift:
 *
 * - materials, labor rates and modifiers first, side by side;
 * - assemblies next: a recipe is resolved by NAME against those catalogs, and
 *   an assembly whose materials have not landed yet is skipped rather than
 *   half-built;
 * - kits after assemblies, which they name;
 * - run types last, because they name their raceway and conductor materials.
 *   They do not need assemblies or kits; they are chained rather than run
 *   alongside only so one failure cannot hide another.
 *
 * ── A failure is REPORTED, not thrown ────────────────────────────────────────
 * The server must keep starting if one shipped catalog fails to seed, as it
 * always has. So each failure goes to `report` and the function resolves. A
 * failure in the first three does not stop the rest. A failure in the chain
 * stops the steps after it in the chain, exactly as the server's
 * `.then().catch()` always did.
 */
export async function seedShippedLibrary(
  report: (step: string, err: unknown) => void
): Promise<void> {
  await Promise.all([
    seedBaselineMaterials().catch(err => report("BaselineMaterials", err)),
    seedBaselineLaborRates().catch(err => report("BaselineLaborRates", err)),
    seedBaselineModifiers().catch(err => report("BaselineModifiers", err)),
  ]);
  try {
    await seedBaselineAssemblies();
    await seedBaselineKits();
    await seedBaselineRunTypes();
  } catch (err) {
    report("BaselineAssemblies/Kits/RunTypes", err);
  }
}
