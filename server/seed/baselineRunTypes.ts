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
 * **Fifteen since 2026-10-08, and the palette still OPENS on five** (owner;
 * references/per-foot-items-plan.md § 3b–3c). The 700 surface raceway type
 * joins the four, and ten underground PVC types — one per Sch 40 size — sit
 * behind ONE "Underground (10)" fold in RunTypePicker, closed by default
 * (CLAUDE.md § Customization, rules 1 and 3). They ship because underground
 * warning tape has to follow the TRENCH, and a type is how a run says what it
 * is (takeoff-spec D3); a PVC type used above and below grade could not say.
 *
 * ── Materials are named, not numbered ────────────────────────────────────────
 * Each row names the catalog material it is made of, resolved to an id at seed
 * time by the same by-name lookup `seedBaselineAssemblies` uses — which is why
 * this seeder runs after the materials one. A name that finds nothing leaves
 * the link NULL and the type still works; it simply has nothing to price
 * against yet, which is the honest state for a type whose material is missing.
 */
import type { RunExtraAppliesTo, RunPathType } from "../../drizzle/schema";
import { undergroundRunTypeLabel } from "../../shared/undergroundRunTypes";
import { sizesFor } from "./materials/conduit";

/**
 * A per-foot item that rides on a shipped type (0135,
 * `takeoff_run_type_extras`). Matched by EXACT name, like the type's own
 * materials.
 */
export type BaselineRunTypeExtra = {
  materialName: string;
  feetPerFoot: number;
  appliesTo: RunExtraAppliesTo;
};

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
   * INSULATED conductors in one circuit of this type. The ground is separate.
   *
   * ── This said "INCLUDING the ground" until 2026-09-20 ──────────────────────
   * It did, and it was right to, because only one column existed and two
   * meanings for one column is worse than one imperfect meaning. Migrations
   * 0061-0064 gave the ground its own column and its own count, so a row
   * labelled "2 #12 + ground" now ships as a 2 and a 1 rather than as a 3 that
   * has to be explained.
   *
   * NULL = not said, with no conductor named either: the underground types
   * carry no wire, because what goes in a trench varies by job (plan § 3b).
   */
  conductorCount: number | null;
  /** Grounds in one circuit. Null on a cable — see `groundMaterialName`. */
  groundCount: number | null;
  /**
   * The ground wire itself, on a conduit type.
   *
   * NULL on a cable, and not because nobody got round to it: a 12-2 MC carries
   * its ground inside the jacket, so there is no separate wire to buy and a
   * name here would put a second line on a supplier's quote for something that
   * arrives on the same reel.
   */
  groundMaterialName: string | null;
  /**
   * Per-foot extras (0135). Omitted = none. Underground warning tape on the
   * underground types is the only shipped extra (owner decision 2).
   */
  extras?: BaselineRunTypeExtra[];
};

/**
 * Underground warning tape lies in the trench: it follows the FLAT traced
 * length, never the risers (plan § 3a), one foot of tape per foot of trench.
 */
const WARNING_TAPE: BaselineRunTypeExtra = {
  materialName: "Underground warning tape",
  feetPerFoot: 1,
  appliesTo: "flat",
};

/*
  The *MaterialName fields are matched EXACTLY against shipped names when a
  database is first seeded (server/db.ts, seedBaselineRunTypes) — no rename
  map — so a catalog rename edits them in the same commit, or a fresh
  database ships these types with no wire. server/frozenMaterialNames.test.ts
  fails if one stops naming a shipped row.

  The LABELS do not follow a rename, on purpose: a shipped type is keyed by
  `pathType:label`, so a new label would insert a second copy of the type on
  every existing database. "12-2 MC cable" stays the label of the type whose
  cable is now "12/2 MC cable Copper".
*/
export const BASELINE_RUN_TYPES: BaselineRunType[] = [
  {
    label: '1/2" EMT, 2 #12 + ground',
    pathType: "conduit",
    racewayMaterialName: '1/2" EMT',
    conductorMaterialName: "#12 THHN Copper",
    conductorCount: 2,
    groundCount: 1,
    groundMaterialName: "#12 THHN green Copper",
  },
  {
    label: '3/4" EMT, 3 #12 + ground',
    pathType: "conduit",
    racewayMaterialName: '3/4" EMT',
    conductorMaterialName: "#12 THHN Copper",
    conductorCount: 3,
    groundCount: 1,
    groundMaterialName: "#12 THHN green Copper",
  },
  {
    label: "12-2 MC cable",
    pathType: "cable",
    racewayMaterialName: null,
    conductorMaterialName: "12/2 MC cable Copper",
    // 12-2 is two insulated and a ground, all inside one jacket.
    conductorCount: 2,
    groundCount: 1,
    groundMaterialName: null,
  },
  {
    label: "12-3 MC cable",
    pathType: "cable",
    racewayMaterialName: null,
    conductorMaterialName: "12/3 MC cable Copper",
    // 12-3 is three insulated and a ground, all inside one jacket.
    conductorCount: 3,
    groundCount: 1,
    groundMaterialName: null,
  },
  /*
    Wiremold 700 is a run type of its own (owner decision 1, plan § 3c):
    picked and traced like EMT, priced by the foot from ONE raceway row, with
    the same wire as the 1/2" EMT type. Its fittings are found from the
    raceway's shipped name by the fitting family — until that family ships
    (plan § 9, step 2) the count says it cannot match them, rather than
    buying EMT parts.
  */
  {
    label: "700 series surface raceway, 2 #12 + ground",
    pathType: "conduit",
    racewayMaterialName: "Surface raceway, 700 series",
    conductorMaterialName: "#12 THHN Copper",
    conductorCount: 2,
    groundCount: 1,
    groundMaterialName: "#12 THHN green Copper",
  },
  /*
    Underground PVC, one per Sch 40 size the catalog ships (owner decision 3,
    plan § 3b), each carrying warning tape. NO WIRE: a trench may hold SER, a
    feeder or a set of THHN, and GR2/GR5 carry their own feeder — a type that
    shipped wire would count it twice. NULL is "not said". Sch 80 is not
    shipped (plan § 7, Q2, open).
  */
  ...sizesFor("PVC Sch 40").map(
    (size): BaselineRunType => ({
      label: undergroundRunTypeLabel(size, "PVC Sch 40"),
      pathType: "conduit",
      racewayMaterialName: `${size} PVC Sch 40`,
      conductorMaterialName: null,
      conductorCount: null,
      groundCount: null,
      groundMaterialName: null,
      extras: [WARNING_TAPE],
    })
  ),
];

/**
 * Shipped run types withdrawn from the palette — ARCHIVED on the shipped row,
 * never deleted, so a run already traced under one still resolves its type
 * (getRunTypesFor reads archived rows for exactly that). Matched by
 * `pathType:label`, the key the seed inserts under.
 *
 * Owner's catalog review, 2026-10-08: the 3-1/2" underground type went with
 * its pipe (every 3-1/2" row was retired). It is no longer in
 * BASELINE_RUN_TYPES, so a fresh database never gets it; this archives it on
 * every database that already has it. A company's own copy is untouched.
 */
export const RETIRED_BASELINE_RUN_TYPES: readonly {
  pathType: RunPathType;
  label: string;
}[] = [
  {
    pathType: "conduit",
    label: undergroundRunTypeLabel('3-1/2"', "PVC Sch 40"),
  },
];

/**
 * Material links on SHIPPED run types to move from one shipped row to
 * another, by exact name. The seed's other pass only fills a NULL link, so a
 * changed `*MaterialName` above reaches a fresh database and nothing else —
 * this is what moves an existing one.
 *
 * Only a link that still points at the `from` row is moved: a shipped type
 * somebody re-pointed is left alone, and a company's own copy of a type is
 * never in the pass (`userId` NULL only).
 *
 * Owner's catalog review, 2026-10-08: #12 bare copper was retired, and the
 * three "#12 + ground" types now pull a green #12 THHN as their ground.
 */
export const RUN_TYPE_MATERIAL_SWAPS: readonly { from: string; to: string }[] =
  [{ from: "#12 bare solid Copper", to: "#12 THHN green Copper" }];
