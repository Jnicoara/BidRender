/**
 * The owner's catalog review of the STARTER catalog, 2026-10-08 — the
 * renames and removals, in one place.
 *
 * The decisions are references/catalog-review-2026-10-08.md (the owner's
 * read-only check, copied in), and that file's last section says what was
 * built and every call made on a NOT SURE item. This module is what the
 * seed reads:
 *
 *   - CATALOG_REVIEW_RENAMES joins RENAMED_BASELINE_MATERIALS
 *     (shared/renamedMaterials.ts): the row is renamed IN PLACE, same id, so
 *     every starter, assembly, stamp and frozen bid line that points at it
 *     still does. "Wire nuts" — on 114 starters — is one of them.
 *   - CATALOG_REVIEW_RETIRED joins RETIRED_BASELINE_MATERIALS
 *     (server/seed/materials/index.ts): `isActive = false`, never deleted, so
 *     a bid line priced from one still resolves the part it was priced from.
 *
 * SHIPPED rows only, like every seed pass: a company's own copy keeps its
 * name and stays active.
 */
import { TRADE_SIZES } from "./tradeSizes";

/** Shipped name -> the name it ships under from this review. */
export const CATALOG_REVIEW_RENAMES: Readonly<Record<string, string>> = {
  // § 4 — wire nuts by wire range. The plain row is the one 114 starters
  // use, and stays the same row. The small and large rows FOLD into the two
  // new ranges by rename rather than standing beside them: "small" was for
  // few small conductors (the blue/orange 22-12), "large" for many or big
  // ones (the blue wing nut, 14-6). Neither is on a starter, so nothing
  // changes for a recipe, and there is no duplicate pair to choose between.
  "Wire nuts": "Wire nut, 22-8 AWG (tan/red)",
  "Wire nuts, small": "Wire nut, 22-12 AWG (blue/orange)",
  "Wire nuts, large": "Wing nut wire connector, 14-6 AWG (blue)",
  // § 6 — a #3 cable says its conductor count in words, so "3/3" and "#3/4"
  // never read as fractions or inches.
  "#3/4 MC cable Copper": "#3 4-conductor MC cable Copper",
  "3/3 MC cable Copper": "#3 3-conductor MC cable Copper",
  // § 6 — receptacles state their NEMA configuration. The dryer row is the
  // 4-wire one (RS2 also buys the 4-wire cord); the 3-wire 10-30R is new.
  "30A dryer receptacle": "30A dryer receptacle, NEMA 14-30R (4-wire)",
  "50A range receptacle": "50A range receptacle, NEMA 14-50R",
  "30A RV receptacle": "30A RV receptacle, NEMA TT-30R",
  "12/2 MC cable with 16/2 dimming Copper":
    "12/2 MC cable with 16/2 dimming pair (0-10V) Copper",
  // § 6 — bushings split: the shipped row is the plastic insulating one
  // (its own search words said so), and a grounding bushing is new at every
  // size.
  ...Object.fromEntries(
    TRADE_SIZES.map(size => [
      `${size} conduit bushing`,
      `${size} insulating bushing`,
    ])
  ),
  // § 6 — box depths, ONLY where the catalog's own data states the depth.
  // The boxes whose depth would be "typical" are listed for the owner to
  // verify (C:\dev\catalog-review\verify-box-depths.txt) and not renamed.
  '4" square box': '4" square box, 1-1/2" deep',
  '4-11/16" square box': '4-11/16" square box, 2-1/8" deep',
  "Octagon box, metal": 'Octagon box, metal, 1-1/2" deep',
  "Shallow round box": 'Shallow round box, 1/2" deep',
  // § 5 — the generic cord grip is on two starters (LT25, MH8), so it BECOMES
  // the everyday 1/2" size in place, rather than being retired: both
  // starters keep their line on the same row with no repair pass.
  "Cord grip": '1/2" cord grip (0.25"-0.50" cord)',
};

/**
 * The Wire & Cable rows the review ADDED — decided names in their own right,
 * by the owner's review rather than the 2026-10-07 sheet
 * (server/materialNaming.test.ts reads them as such).
 */
export const CATALOG_REVIEW_WIRE_ADDS: readonly string[] = [
  "#6 bare solid Copper",
  "#12 THHN green Copper",
  "6/2 NM-B Copper",
  "12/3 UF-B Copper",
  "10/3 UF-B Copper",
];

/** The nine IMC rows per size the catalog shipped. */
const IMC_SUFFIXES = [
  "",
  " connector",
  " coupling",
  " 90-degree elbow",
  " 45-degree elbow",
  " LB conduit body",
  " T conduit body",
  " LL conduit body",
  " LR conduit body",
  " C conduit body",
];

const BODY_SHAPES = ["LB", "T", "LL", "LR", "C"];

/** Every 3-1/2" row (EMT, PVC Sch 40 and the shared fittings): 33. */
export const RETIRED_THREE_AND_A_HALF: readonly string[] = [
  '3-1/2" EMT',
  '3-1/2" EMT 90-degree elbow',
  '3-1/2" EMT 45-degree elbow',
  ...BODY_SHAPES.map(s => `3-1/2" EMT ${s} conduit body`),
  ...["set-screw", "compression", "raintight"].flatMap(style => [
    `3-1/2" EMT ${style} connector`,
    `3-1/2" EMT ${style} coupling`,
  ]),
  '3-1/2" PVC Sch 40',
  '3-1/2" PVC Sch 40 connector',
  '3-1/2" PVC Sch 40 coupling',
  '3-1/2" PVC Sch 40 90-degree elbow',
  '3-1/2" PVC Sch 40 45-degree elbow',
  ...BODY_SHAPES.map(s => `3-1/2" PVC Sch 40 ${s} conduit body`),
  ...[90, 45].flatMap(angle =>
    [24, 36].map(
      radius => `3-1/2" PVC Sch 40 ${angle}-degree sweep, ${radius}" radius`
    )
  ),
  '3-1/2" EMT one-hole strap',
  '3-1/2" PVC one-hole strap',
  '3-1/2" conduit bushing',
  '3-1/2" conduit locknut',
  '3-1/2" strut conduit strap',
];

/** Every IMC row: 9 sizes x 10 = 90. */
export const RETIRED_IMC: readonly string[] = TRADE_SIZES.flatMap(size =>
  IMC_SUFFIXES.map(suffix => `${size} IMC${suffix}`)
);

/** Shipped names this review withdraws (retired, never deleted). */
export const CATALOG_REVIEW_RETIRED: readonly string[] = [
  // § 1 — #14, #12, #10 bare copper. #12 bare solid was the ground on three
  // shipped run types; they now name "#12 THHN green Copper"
  // (baselineRunTypes.ts), and the seed re-points the shipped types that
  // still link the bare row (RUN_TYPE_MATERIAL_SWAPS).
  "#14 bare solid Copper",
  "#12 bare solid Copper",
  "#10 bare solid Copper",
  "#10 bare stranded Copper",
  // § 1 — the unsized EMT strap (its "two-hole" words move to the new
  // sized two-hole straps) and three generics their sized rows cover.
  "EMT strap",
  "Wall pack",
  "Bath exhaust fan",
  "EV charger",
  // § 1 — all 3-1/2" and all IMC.
  ...RETIRED_THREE_AND_A_HALF,
  ...RETIRED_IMC,
  // § 5 — generic connectors no starter uses, in favour of their sized rows.
  "Split-bolt connector",
  "H-tap",
  "Butt splice",
  "Ring terminal",
  "Spade terminal",
  "Insulated multi-tap block",
  // § 6 — the unsized grounding bushing, now that every size ships one.
  // No starter uses it.
  "Grounding bushing",
];
