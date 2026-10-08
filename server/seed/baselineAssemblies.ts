/**
 * Baseline assemblies — the starter recipes shipped with the app.
 *
 * ── The first 8 here, the other 160 in starterAssemblies.ts ──────────────────
 * These 8 shipped first, and their names and hours are unchanged. The rest of
 * the 168 in references/starter-assemblies-plan.md are in
 * `starterAssemblies.ts` (2026-10-06), and BASELINE_ASSEMBLIES below is both.
 * An assembly whose parts are not all in the catalog is held rather than
 * seeded half-built — a recipe missing lines under-prices the job, which is
 * worse than it being absent (`starterHolds`, assemblyRecipe.ts).
 *
 * ── One consequence of the unpriced catalog, stated plainly ──────────────────
 * Shipped materials all cost $0 until the contractor prices them, so a starter
 * assembly's material cost is $0 out of the box and its labor hours carry the
 * whole figure. That is intended: a plausible-looking total built from prices
 * nobody verified is the failure this trades away. The Materials screen flags
 * and filters what still needs a price.
 *
 * ── Labor hours ──────────────────────────────────────────────────────────────
 * The 8 below carry placeholder hours from shared/laborHourDefaults.ts — a
 * starting figure, never a verified labor unit — from before the owner's
 * decision D1 (2026-09-29): hours are NOT SET, never 0 or a guess. Every
 * starter in starterAssemblies.ts ships null. Clearing these 8 is a
 * meaning-changing step-3 migration, Track A's, after 0123 and its code are
 * live (references/track-a-handoff-starter-assemblies.md H2).
 *
 * Parts are named by STABLE KEY (`starterParts.ts`), never by catalog name,
 * and this file never hardcodes a database id — see that file for why.
 */
import { p, type BaselineAssembly } from "./assemblyRecipe";
import { PLANNED_STARTER_ASSEMBLIES } from "./starterAssemblies";

export type {
  BaselineAssembly,
  BaselineAssemblyMaterial,
} from "./assemblyRecipe";

/**
 * The starter role every shipped assembly is costed against.
 *
 * ── Why they need one at all ─────────────────────────────────────────────────
 * `assemblies.laborRateId` is nullable, and these shipped with it null. An
 * assembly with hours and no role freezes `snapshotLaborRate` at 0 onto every
 * bid line made from it, so the line puts its hours into the total and nothing
 * into the price: a bid could read "9.7 hours, $0.00" and look entirely
 * finished. That is not the deliberate $0 this app ships — an unpriced MATERIAL
 * is flagged on the Materials screen and an unpriced RATE on Labor Rates, but
 * an unlinked assembly was flagged nowhere.
 *
 * ── This does NOT put a price on anything ────────────────────────────────────
 * The starter Journeyman rate itself ships at $0, like every other piece of
 * starter content, so a brand-new account still prices labor at nothing. What
 * changes is WHERE that zero shows up: it becomes the Journeyman rate needing a
 * number, which the Labor Rates screen flags, the getting-started checklist
 * counts, and the first-run flow asks for before a user reaches their first
 * bid. One zero, in the one place the app already knows how to explain.
 *
 * And once the contractor sets that rate, every starter assembly picks it up —
 * including after a fork, because `resolveLaborRate` follows the supersede
 * chain rather than matching the id outright.
 *
 * ── One role for all of them, on purpose ─────────────────────────────────────
 * Journeyman is the rate a small electrical shop bids most work at. Assigning
 * apprentice hours to the simpler assemblies would be inventing a labor
 * allocation the contractor never chose, which is the same mistake as shipping
 * a plausible price. One honest default, changed per assembly in the builder.
 */
export const DEFAULT_ASSEMBLY_ROLE = "Journeyman";

/**
 * The 8 that shipped first. Quantities and run-length allowances come from
 * STARTER_LIBRARY.md § CORE Assembly Bills of Material.
 */
const FIRST_STARTERS: BaselineAssembly[] = [
  // ── Devices ──
  {
    ref: "DV1",
    name: "Duplex receptacle standard",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.75,
    materials: [
      p("single-gang-box", 1),
      p("duplex-receptacle", 1),
      p("1-gang-wall-plate-duplex-nylon", 1),
      p("12-2-nm-b", 25, { branchWhip: true }),
      p("wire-nuts", 3),
    ],
  },
  {
    ref: "DV2",
    name: "GFCI receptacle",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.9,
    materials: [
      p("single-gang-box", 1),
      p("gfci-receptacle", 1),
      p("1-gang-wall-plate-decorator-nylon", 1),
      p("12-2-nm-b", 25, { branchWhip: true }),
      p("wire-nuts", 3),
    ],
  },
  {
    // 35 ft rather than 25: this one includes its own home run, and so also
    // the breaker — it creates a new circuit rather than extending one.
    //
    // DELIBERATELY NOT a branch whip (D18). Part of that 35 ft is the homerun,
    // which a traced run would own, so marking it would scale and retire wire
    // that is not branch wiring. Splitting it into a marked branch line and an
    // unmarked homerun line is the honest fix whenever somebody wants the dial
    // to reach it.
    ref: "DV3",
    name: "Dedicated 20A receptacle",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 1.25,
    materials: [
      p("single-gang-box", 1),
      p("duplex-receptacle", 1),
      p("1-gang-wall-plate-duplex-nylon", 1),
      p("12-2-nm-b", 35),
      p("20a-single-pole-breaker", 1),
      p("wire-nuts", 3),
    ],
  },
  {
    ref: "DV4",
    name: "Single-pole switch",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.6,
    materials: [
      p("single-gang-box", 1),
      p("single-pole-switch", 1),
      p("1-gang-wall-plate-toggle-nylon", 1),
      p("14-2-nm-b", 20, { branchWhip: true }),
      p("wire-nuts", 3),
    ],
  },
  {
    ref: "DV5",
    name: "Dimmer switch",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.7,
    materials: [
      p("single-gang-box", 1),
      p("dimmer", 1),
      p("1-gang-wall-plate-decorator-nylon", 1),
      p("14-2-nm-b", 20, { branchWhip: true }),
      p("wire-nuts", 3),
    ],
  },

  // ── Lighting ──
  // The fixture is its own line (plan D2, 2026-09-29), so an owner-furnished
  // job deletes one line. It reaches a NEW database only: the seeder never
  // edits a starter that already exists, so these two keep their old recipe
  // wherever they were seeded before — the same rule that keeps a company's
  // copy safe. todo.md has the open question of whether to add it there.
  {
    ref: "LT1",
    name: "Surface-mount ceiling fixture",
    category: "Lighting",
    projectType: "both",
    baseLaborHours: 0.6,
    materials: [
      p("4in-square-box", 1),
      p("fixture-mounting-bracket", 1),
      p("surface-mount-ceiling-fixture", 1, { fixture: true }),
      p("14-2-nm-b", 20, { branchWhip: true }),
      p("wire-nuts", 3),
    ],
  },
  {
    ref: "LT2",
    name: "Ceiling fan standard",
    category: "Lighting",
    projectType: "residential",
    baseLaborHours: 1.5,
    materials: [
      p("fan-rated-ceiling-box", 1),
      p("ceiling-fan", 1, { fixture: true }),
      p("14-2-nm-b", 20, { branchWhip: true }),
      p("wire-nuts", 4),
    ],
    // Fans go in overhead, on a ladder, every time.
    modifiers: ["Working at height"],
  },

  // ── Panels ──
  {
    ref: "PG1",
    name: "200A main panel furnish and install",
    category: "Panels",
    projectType: "both",
    baseLaborHours: 8.0,
    materials: [
      p("200a-main-panel", 1),
      p("20a-single-pole-breaker", 10),
      // Once named "20/2 breaker", a spelling retired by an earlier rename,
      // and this assembly was silently skipped on every database seeded in
      // between. Parts are keyed now (starterParts.ts), so a rename can no
      // longer strand a line.
      p("20a-2-pole-breaker", 2),
      p("no8-thhn", 40),
      p("wire-nuts", 6),
    ],
  },
];

/** All 168: the first 8, then the planned 160 in plan order. */
export const BASELINE_ASSEMBLIES: BaselineAssembly[] = [
  ...FIRST_STARTERS,
  ...PLANNED_STARTER_ASSEMBLIES,
];
