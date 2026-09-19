/**
 * Baseline run types — the starter palette shipped with the app.
 *
 * These become rows in `takeoff_run_types` with `userId = NULL`: owned by
 * nobody, read-only, and forked the moment a user edits one. Same ownership
 * model as BASELINE_MATERIALS and BASELINE_LABOR_RATES.
 *
 * ── Why ship any at all ──────────────────────────────────────────────────────
 * An empty palette means defining a type before you can draw your first line,
 * which is the setup-before-value failure that made the old stamp tool unusable
 * on a fresh plan set and that level 1 exists to remove
 * (references/plan-viewer-overhaul.md § 3). Four recognisable rows mean the
 * first trace on a new account works, and the contractor's own definitions
 * arrive when they want them rather than before they can start.
 *
 * ── What ships is IDENTITY. What does not ship is MONEY ──────────────────────
 * Every row here names a raceway, a conductor and a count — facts about a
 * physical thing, the same in every shop, and all of them visible in the label
 * so nothing is hidden behind it. **No allowances ship**, and when those
 * columns exist they will ship NULL and inherit from the company defaults,
 * because an allowance is the contractor's own judgement and CLAUDE.md is
 * explicit: a plausible number nobody chose is indistinguishable on screen from
 * one they set.
 *
 * That is the same split as a material shipping at $0 — the row exists so you
 * can start, and the number that costs money is empty and flagged.
 *
 * ── Kept deliberately short ──────────────────────────────────────────────────
 * Four, not forty. A palette is chosen from at the start of every trace, so its
 * length is a tax on the most frequent action on the screen. These are the
 * combinations a commercial estimator reaches for most; everything else is one
 * "new type" away and belongs to the person who needs it.
 *
 * ── Materials are named, not numbered ────────────────────────────────────────
 * Each row names the catalog material it is made of, resolved to an id at seed
 * time by the same by-name lookup `seedBaselineAssemblies` uses — which is why
 * this seeder runs after the materials one. A name that finds nothing leaves
 * the link NULL and the type still works; it simply has nothing to price
 * against yet, which is the honest state for a type whose material is missing.
 */
import type { RunPathType } from "../../drizzle/schema";

export type BaselineRunType = {
  label: string;
  pathType: RunPathType;
  /**
   * Catalog name of the raceway. NULL for a cable type, where the cable IS the
   * material and `conductorMaterialName` holds it.
   */
  racewayMaterialName: string | null;
  /** Catalog name of the conductor, or of the cable itself. */
  conductorMaterialName: string | null;
  /**
   * Conductors in one circuit of this type, INCLUDING the ground.
   *
   * Matches how `takeoff_run_circuits.conductorCount` already works — a
   * 2-wire-and-ground circuit is 3. § 2.1 of the overhaul document records that
   * separating the ground is the right call and that the migration is
   * mechanical; until that happens this file must not invent a second
   * convention, because two meanings for one column is worse than the one
   * imperfect meaning it has.
   */
  conductorCount: number;
};

export const BASELINE_RUN_TYPES: BaselineRunType[] = [
  {
    label: '1/2" EMT, 2 #12 + ground',
    pathType: "conduit",
    racewayMaterialName: '1/2" EMT',
    conductorMaterialName: "#12 THHN",
    conductorCount: 3,
  },
  {
    label: '3/4" EMT, 3 #12 + ground',
    pathType: "conduit",
    racewayMaterialName: '3/4" EMT',
    conductorMaterialName: "#12 THHN",
    conductorCount: 4,
  },
  {
    label: "12-2 MC cable",
    pathType: "cable",
    racewayMaterialName: null,
    conductorMaterialName: "12-2 MC cable",
    conductorCount: 3,
  },
  {
    label: "12-3 MC cable",
    pathType: "cable",
    racewayMaterialName: null,
    conductorMaterialName: "12-3 MC cable",
    conductorCount: 4,
  },
];
