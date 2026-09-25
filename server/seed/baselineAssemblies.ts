/**
 * Baseline assemblies — the starter recipes shipped with the app.
 *
 * ── Why this is a subset of the 27 CORE assemblies ───────────────────────────
 * STARTER_LIBRARY.md lists 27 CORE assemblies and marks with † every material
 * they need that the original 29-material starter catalog did not have — 36 of
 * them (old-work boxes, 14-3 NM-B, 50A receptacles, recessed cans, and so on).
 *
 * Seeding an assembly whose bill of materials is half missing would ship a
 * recipe that silently under-prices the job, which is worse than not shipping
 * it. So only the assemblies buildable ENTIRELY from existing materials are
 * here.
 *
 * That constraint has largely lifted: the catalog is now ~600 materials and
 * carries almost everything those 36 gaps named. The remaining assemblies are
 * a straightforward addition to this file whenever someone wants to write the
 * bills of material out — the blocker is now the recipes, not the parts.
 *
 * ── One consequence of the unpriced catalog, stated plainly ──────────────────
 * Shipped materials all cost $0 until the contractor prices them, so a starter
 * assembly's material cost is $0 out of the box and its labor hours carry the
 * whole figure. That is intended: a plausible-looking total built from prices
 * nobody verified is the failure this trades away. The Materials screen flags
 * and filters what still needs a price.
 *
 * ── Labor hours ──────────────────────────────────────────────────────────────
 * STARTER_LIBRARY.md ships assemblies with NO hours, deliberately. The hours
 * below come from shared/laborHourDefaults.ts and are placeholders in exactly
 * the same sense: a starting figure the user is expected to replace, never a
 * verified labor unit. They are stored so a starter assembly prices to
 * something non-zero out of the box; the builder screen labels them as guesses.
 *
 * Materials are matched BY NAME against the seeded baseline catalog, so this
 * file never hardcodes an id.
 */
import type { ProjectType } from "../../drizzle/schema";

/**
 * ── Which line is the BRANCH WHIP (D18) ──────────────────────────────────────
 * Devices carry the wiring between each other and a traced run is the homerun
 * back to the panel, so the cable already in these recipes IS the whip — a
 * receptacle's 25 ft of 12-2 NM-B is what reaches the next receptacle.
 *
 * It is declared per LINE rather than assumed, because "the wire line is the
 * whip" is false twice in this very file: the dedicated 20A receptacle's 35 ft
 * includes its own home run, and the panel's 40 ft of #8 THHN is feeder.
 * Neither is branch wire and neither may be scaled by the per-job dial or
 * retired by AI routing.
 */
export type BaselineAssemblyMaterial = {
  /** Must match a BASELINE_MATERIALS name exactly. */
  material: string;
  qty: number;
  /** This line is the branch wire to the next device. Omitted means no. */
  branchWhip?: boolean;
};

export type BaselineAssembly = {
  name: string;
  category:
    | "Devices"
    | "Lighting"
    | "Panels"
    | "Equipment Connections"
    | "Low Voltage/EMS";
  projectType: ProjectType;
  /** Placeholder — see the file header. */
  baseLaborHours: number;
  materials: BaselineAssemblyMaterial[];
  /** Starter modifier names switched on by default. Matched by name. */
  modifiers?: string[];
};

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

export const BASELINE_ASSEMBLIES: BaselineAssembly[] = [
  // ── Devices ──
  // Quantities and run-length allowances come straight from
  // STARTER_LIBRARY.md § CORE Assembly Bills of Material.
  {
    name: "Duplex receptacle standard",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.75,
    materials: [
      { material: "Single-gang box", qty: 1 },
      { material: "Duplex receptacle", qty: 1 },
      { material: "Wall plate", qty: 1 },
      { material: "12-2 NM-B", qty: 25, branchWhip: true },
      { material: "Wire nuts", qty: 3 },
    ],
  },
  {
    name: "GFCI receptacle",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.9,
    materials: [
      { material: "Single-gang box", qty: 1 },
      { material: "GFCI receptacle", qty: 1 },
      { material: "Wall plate", qty: 1 },
      { material: "12-2 NM-B", qty: 25, branchWhip: true },
      { material: "Wire nuts", qty: 3 },
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
    name: "Dedicated 20A receptacle",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 1.25,
    materials: [
      { material: "Single-gang box", qty: 1 },
      { material: "Duplex receptacle", qty: 1 },
      { material: "Wall plate", qty: 1 },
      { material: "12-2 NM-B", qty: 35 },
      { material: "20A Single-Pole breaker", qty: 1 },
      { material: "Wire nuts", qty: 3 },
    ],
  },
  {
    name: "Single-pole switch",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.6,
    materials: [
      { material: "Single-gang box", qty: 1 },
      { material: "Single-pole switch", qty: 1 },
      { material: "Wall plate", qty: 1 },
      { material: "14-2 NM-B", qty: 20, branchWhip: true },
      { material: "Wire nuts", qty: 3 },
    ],
  },
  {
    name: "Dimmer switch",
    category: "Devices",
    projectType: "both",
    baseLaborHours: 0.7,
    materials: [
      { material: "Single-gang box", qty: 1 },
      { material: "Dimmer", qty: 1 },
      { material: "Wall plate", qty: 1 },
      { material: "14-2 NM-B", qty: 20, branchWhip: true },
      { material: "Wire nuts", qty: 3 },
    ],
  },

  // ── Lighting ──
  // The fixture itself is owner/GC-supplied per the BOM's baseline
  // assumptions, so the assembly covers the box, whip and hanging only.
  {
    name: "Surface-mount ceiling fixture",
    category: "Lighting",
    projectType: "both",
    baseLaborHours: 0.6,
    materials: [
      { material: '4" square box', qty: 1 },
      { material: "Fixture mounting bracket", qty: 1 },
      { material: "14-2 NM-B", qty: 20, branchWhip: true },
      { material: "Wire nuts", qty: 3 },
    ],
  },
  {
    name: "Ceiling fan standard",
    category: "Lighting",
    projectType: "residential",
    baseLaborHours: 1.5,
    materials: [
      { material: "Fan-rated ceiling box", qty: 1 },
      { material: "14-2 NM-B", qty: 20, branchWhip: true },
      { material: "Wire nuts", qty: 4 },
    ],
    // Fans go in overhead, on a ladder, every time.
    modifiers: ["Working at height"],
  },

  // ── Panels ──
  {
    name: "200A main panel furnish and install",
    category: "Panels",
    projectType: "both",
    baseLaborHours: 8.0,
    materials: [
      { material: "200A main panel", qty: 1 },
      { material: "20A Single-Pole breaker", qty: 10 },
      // Was "20/2 breaker", a name retired by an earlier rename. Starters look
      // materials up by EXACT name, so this assembly was silently skipped on
      // every database seeded since then. materialsCatalog.test.ts now fails
      // on any starter line that names a renamed spelling.
      { material: "20A 2-Pole breaker", qty: 2 },
      { material: "#8 THHN", qty: 40 },
      { material: "Wire nuts", qty: 6 },
    ],
  },
];
