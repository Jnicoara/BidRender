import {
  seedBaselineAssemblies,
  seedBaselineKits,
  seedBaselineLaborRates,
  seedBaselineMaterials,
  seedBaselineModifiers,
  seedBaselineRunTypes,
  seedStarterLaborSteps,
  withSeedLock,
} from "./db";
import {
  applySeedFindingFields,
  seedProposal,
  seedProposalSummary,
} from "./seedProposal";

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
  report: (step: string, err: unknown) => void,
  /** Where the one summary line goes; the server's console by default. */
  log: (line: string) => void = line => console.info(line)
): Promise<void> {
  await Promise.all([
    seedBaselineMaterials().catch(err => report("BaselineMaterials", err)),
    seedBaselineLaborRates().catch(err => report("BaselineLaborRates", err)),
    seedBaselineModifiers().catch(err => report("BaselineModifiers", err)),
    // The step LIBRARY before the starters: a starter inserted below writes
    // its step list as it is inserted (0143). Its own catch, so a step
    // failure can never stop the starters, kits or run types.
    seedStarterLaborSteps().catch(err => report("StarterLaborSteps", err)),
  ]);
  try {
    await seedBaselineAssemblies();
    await seedBaselineKits();
    await seedBaselineRunTypes();
  } catch (err) {
    report("BaselineAssemblies/Kits/RunTypes", err);
  }

  /*
    ── Everything above only INSERTS what is missing (2026-10-13) ──
    A start no longer rewrites an existing shared row's numbers or names
    (references/boot-seed-plan.md). What the seed says differently is
    computed once here: the finding fields are applied as ONE logged `seed`
    batch (owner Q3), and the rest is only counted — `scripts/starterDrift.mts`
    lists it and applies it when somebody confirms.
  */
  try {
    const proposal = await seedProposal();
    let applied = 0;
    await withSeedLock("helixbid:seed:finding_fields", async () => {
      const result = await applySeedFindingFields(proposal);
      if (result === "no-log")
        log(
          "[seed] starter: finding fields NOT applied — no change log yet (0152)"
        );
      else if (result !== null) applied = result.applied.length;
    });
    log(seedProposalSummary(proposal, applied));
  } catch (err) {
    report("SeedProposal", err);
  }
}
