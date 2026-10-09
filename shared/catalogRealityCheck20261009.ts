/**
 * The catalog reality check, 2026-10-09 — every rename, retirement and
 * search-word change the owner approved, in one place.
 *
 * Sources, all owner-approved on 2026-10-09:
 *   - references/catalog-reality-check.md (Track C), batch 1 and batch 2
 *     "Proposed changes", with the owner's calls in its two APPROVED sections;
 *   - its PANELS table (all 56 rows, the five Square D-only rows included);
 *   - references/box-depth-check.md (Track A) with the owner's box calls;
 *   - two labels for the CW3 and CW11 starters.
 * Every call made on a line that offered a choice ("or", "optional", "confirm
 * or retire") is listed in references/catalog-reality-check-build.md, which
 * is the human-readable record of this file.
 *
 * ── How it is applied: by NAME, from this one module ────────────────────────
 *   - REALITY_RENAMES joins RENAMED_BASELINE_MATERIALS: the row is renamed IN
 *     PLACE, same id, so every starter, assembly, stamp and frozen bid line
 *     that points at it still does. The seed applies the same map to the
 *     module rows (`applyRealityCheck` in server/seed/materials/index.ts), so
 *     the name the seed ships and the name the rename pass writes cannot be
 *     two spellings of one decision.
 *   - REALITY_RETIRED_INTO joins RETIRED_BASELINE_MATERIALS (`isActive =
 *     false`, never deleted): a bid line priced from one still resolves the
 *     part it was priced from. The KEPT row gains the retired row's name as
 *     search words (approval condition 1), and on no other row.
 *   - A renamed row keeps its old name as search words too, so "Duplex
 *     receptacle" and "Single-gang box" still find their rows.
 *
 * SHIPPED rows only, like every seed pass: a company's own copy keeps its
 * name and stays active. No bid_line_items snapshot is touched by any of it.
 */
import { TRADE_SIZES } from "./tradeSizes";
import {
  PULL_BOX_DEPTH,
  PVC_SHARED_FITTING_FAMILY,
  PVC_TWO_HOLE_STRAP_SIZES,
  pvcSharedFittingName,
  type PvcSharedFittingPart,
} from "./runFittingMaterials";

const BODY_SHAPES = ["LB", "LL", "LR", "T", "C"] as const;

/** `1/2"` -> `{size} {words}` rows, for the per-size families below. */
const perSize = (
  sizes: readonly string[],
  from: (size: string) => string,
  to: (size: string) => string
): [string, string][] => sizes.map(size => [from(size), to(size)]);

/** Fuses and disconnects carry their voltage (batch 1 + batch 2, panels). */
const FUSE_AMPS = ["30", "60", "100", "200", "400", "600"];
const DISCONNECT_AMPS = ["30", "60", "100", "200"];

/**
 * PVC couplings, terminal adapters and conduit bodies: ONE row per size for
 * Sch 40 and Sch 80 (batch 2, PVC; the pair rule in
 * next-live-release-plan.md § 4 item 6). The Sch 40 row is renamed in place
 * to the shared name `pvcSharedFittingName` builds — the same function the
 * fitting lookup calls — and the Sch 80 row retires into it.
 */
const PVC_SHARED_PARTS: { sch: string; part: PvcSharedFittingPart }[] = [
  { sch: "coupling", part: "coupling" },
  { sch: "connector", part: "terminal adapter" },
  ...BODY_SHAPES.map(shape => ({
    sch: `${shape} conduit body`,
    part: `${shape} conduit body` as PvcSharedFittingPart,
  })),
];
const PVC_SHARED_RENAMES: [string, string][] = TRADE_SIZES.flatMap(size =>
  PVC_SHARED_PARTS.map(({ sch, part }): [string, string] => [
    `${size} PVC Sch 40 ${sch}`,
    pvcSharedFittingName(size, part),
  ])
);
const PVC_SHARED_RETIRED: [string, string][] = TRADE_SIZES.flatMap(size =>
  PVC_SHARED_PARTS.map(({ sch, part }): [string, string] => [
    `${size} PVC Sch 80 ${sch}`,
    pvcSharedFittingName(size, part),
  ])
);

/**
 * PANELS — table B of the approved panel table: one generic row for each
 * single-phase load center at least two brand lines stock. 56 rows,
 * including the five that rest on Square D's two lines alone (owner: keep
 * them). Rows renamed into (below) keep their id; the rest are new.
 */
const PANEL_TABLE_SPEC: [
  string,
  "main-lug" | "main-breaker",
  string,
  number[],
][] = [
  ["indoor", "main-lug", "70", [2]],
  ["indoor", "main-lug", "100", [6]],
  ["indoor", "main-lug", "125", [4, 8, 12, 16, 20, 24, 30]],
  ["indoor", "main-lug", "150", [24]],
  ["indoor", "main-lug", "200", [12, 20, 30, 40]],
  ["indoor", "main-lug", "225", [42]],
  ["outdoor", "main-lug", "70", [2]],
  ["outdoor", "main-lug", "100", [6]],
  ["outdoor", "main-lug", "125", [2, 4, 8, 12, 16, 20, 24]],
  ["outdoor", "main-lug", "200", [12, 20, 30, 40]],
  ["outdoor", "main-lug", "225", [42]],
  ["indoor", "main-breaker", "100", [12, 16, 20, 24, 30]],
  ["indoor", "main-breaker", "125", [24, 30]],
  ["indoor", "main-breaker", "150", [24, 30, 32]],
  ["indoor", "main-breaker", "200", [20, 24, 30, 40, 42]],
  ["indoor", "main-breaker", "225", [42]],
  ["outdoor", "main-breaker", "100", [12, 16, 20]],
  ["outdoor", "main-breaker", "125", [24]],
  ["outdoor", "main-breaker", "150", [20, 30]],
  ["outdoor", "main-breaker", "200", [12, 20, 30, 40, 42]],
];

/** A panel row's name, in the table's form. */
export function panelName(
  amps: string,
  main: "main-lug" | "main-breaker",
  spaces: number,
  where: string
): string {
  return `${amps}A ${main} panel, ${spaces}-space, ${where}`;
}

/** The 56 rows of table B, as specs (for the seed's search words) and names. */
export const PANEL_TABLE: readonly {
  name: string;
  amps: string;
  main: "main-lug" | "main-breaker";
  spaces: number;
  where: string;
}[] = PANEL_TABLE_SPEC.flatMap(([where, main, amps, spaces]) =>
  spaces.map(n => ({
    name: panelName(amps, main, n, where),
    amps,
    main,
    spaces: n,
    where,
  }))
);

/**
 * PANELS — the approved table (§ C of the PANELS section): the 19 renames.
 * Every one keeps its id. The 37 rows of table B that nothing is renamed
 * into are new (server/seed/materials/realityCheck.ts).
 */
const PANEL_RENAMES: Record<string, string> = {
  "200A main panel, 40-space": "200A main-breaker panel, 40-space, indoor",
  "100A main panel, 24-space": "100A main-breaker panel, 24-space, indoor",
  // No 100A 24-space main-lug panel is sold; the stocked 24-space can is
  // 125A. The "Subpanel, 100A" starter stays on this row (owner).
  "100A main-lug sub-panel, 24-space": "125A main-lug panel, 24-space, indoor",
  "100A outdoor main panel": "100A main-breaker panel, 12-space, outdoor",
  "200A outdoor main panel": "200A main-breaker panel, 40-space, outdoor",
  "100A main panel, 12-space": "100A main-breaker panel, 12-space, indoor",
  "100A main panel, 20-space": "100A main-breaker panel, 20-space, indoor",
  "125A main panel, 24-space": "125A main-breaker panel, 24-space, indoor",
  "125A main panel, 30-space": "125A main-breaker panel, 30-space, indoor",
  "150A main panel, 30-space": "150A main-breaker panel, 30-space, indoor",
  "200A main panel, 30-space": "200A main-breaker panel, 30-space, indoor",
  "200A main panel, 42-space": "200A main-breaker panel, 42-space, indoor",
  "225A main panel, 42-space": "225A main-breaker panel, 42-space, indoor",
  "100A main-lug sub-panel": "100A main-lug panel, 6-space, indoor",
  "125A main-lug sub-panel, 20-space": "125A main-lug panel, 20-space, indoor",
  "125A main-lug sub-panel, 30-space": "125A main-lug panel, 30-space, indoor",
  "200A main-lug sub-panel, 30-space": "200A main-lug panel, 30-space, indoor",
  "200A main-lug sub-panel, 40-space": "200A main-lug panel, 40-space, indoor",
  "225A main-lug sub-panel, 42-space": "225A main-lug panel, 42-space, indoor",
};

const PANEL_RETIRED_INTO: Record<string, string> = {
  "200A main panel": "200A main-breaker panel, 40-space, indoor",
  // Owner call (2), batch 2: 60A is discontinued; the temporary power pole
  // starter repoints to the 100A 12-space outdoor panel.
  "60A main panel, 8-space": "100A main-breaker panel, 12-space, outdoor",
  "60A main panel, 12-space": "100A main-breaker panel, 12-space, outdoor",
  "100A main panel": "100A main-breaker panel, 20-space, indoor",
  "125A main panel": "125A main-breaker panel, 24-space, indoor",
  "150A main panel": "150A main-breaker panel, 30-space, indoor",
  "125A main panel, 20-space": "125A main-breaker panel, 24-space, indoor",
  "150A main panel, 40-space": "200A main-breaker panel, 40-space, indoor",
  "125A main-lug sub-panel": "125A main-lug panel, 12-space, indoor",
  "150A main-lug sub-panel": "150A main-lug panel, 24-space, indoor",
  "200A main-lug sub-panel": "200A main-lug panel, 30-space, indoor",
  "60A main-lug sub-panel, 8-space": "125A main-lug panel, 8-space, indoor",
  "60A main-lug sub-panel, 12-space": "125A main-lug panel, 12-space, indoor",
  "100A main-lug sub-panel, 12-space": "125A main-lug panel, 12-space, indoor",
  "100A main-lug sub-panel, 20-space": "125A main-lug panel, 20-space, indoor",
  "125A main-lug sub-panel, 24-space": "125A main-lug panel, 24-space, indoor",
  "150A main-lug sub-panel, 30-space": "200A main-lug panel, 30-space, indoor",
  "150A main-lug sub-panel, 40-space": "200A main-lug panel, 40-space, indoor",
  "200A main-lug sub-panel, 42-space": "225A main-lug panel, 42-space, indoor",
  // Batch 2 (panels): the bare 400A rows retire into their sized rows,
  // which the panel table leaves as they are.
  "400A main panel": "400A main panel, 42-space",
  "400A main-lug sub-panel": "400A main-lug sub-panel, 42-space",
};

/** Shipped name -> the name it ships under from this check. */
export const REALITY_RENAMES: Readonly<Record<string, string>> = {
  ...PANEL_RENAMES,

  // ── Wire & cable (batch 1, approval condition 3: the PLAIN rows are the
  // solid ones every starter and run type uses; the stranded twins stay).
  "#14 THHN Copper": "#14 THHN solid Copper",
  "#12 THHN Copper": "#12 THHN solid Copper",
  "#10 THHN Copper": "#10 THHN solid Copper",
  "#12 THHN green Copper": "#12 THHN green solid Copper",
  "Landscape lighting cable Copper": "12/2 landscape lighting cable Copper",
  // Its own words name the maker's power adapter (first of the two choices).
  "Video doorbell chime kit": "Video doorbell power kit",
  "Cat6 patch panel": "Cat6 patch panel, 24-port",
  // Batch 2, wire.
  "4/0-4/0-2/0 SER Aluminum": "4/0-4/0-2/0 SEU Aluminum",
  "250-250-250 SER Aluminum": "250-250-250-3/0 SER Aluminum",
  // Back to the trade's own spelling (2026-10-08 had made them words).
  "#3 3-conductor MC cable Copper": "3/3 MC cable Copper",
  "#3 4-conductor MC cable Copper": "3/4 MC cable Copper",
  "16/2 fire alarm cable Copper":
    "16/2 fire alarm cable, FPLR, unshielded Copper",
  "Fiber optic cable": "Fiber optic cable, 12-strand OM4 multimode, plenum",
  "Surface raceway (wire mold), low voltage": "Surface raceway, low voltage",

  // ── Boxes: the owner's box calls (box-depth-check.md, "Owner's
  // decisions"). Plastic device and ceiling boxes are named by CUBIC INCHES
  // (#14); the depth and the old name stay search words.
  "Single-gang box": "Single-gang new work box, plastic, 18 cu in",
  "Double-gang box": "Double-gang new work box, plastic, 32 cu in",
  "Triple-gang box": "Triple-gang new work box, plastic, 46 cu in",
  "Single-gang box, deep": "Single-gang new work box, plastic, 22.5 cu in",
  "Double-gang box, deep": "Double-gang new work box, plastic, 35 cu in",
  "4-gang box": "4-gang new work box, plastic, 60 cu in",
  "5-gang box": "5-gang new work box, plastic, 94 cu in",
  "Single-gang old-work box": "Single-gang old work box, plastic, 20 cu in",
  "Double-gang old-work box": "Double-gang old work box, plastic, 34 cu in",
  "Triple-gang old-work box": "Triple-gang old work box, plastic, 55 cu in",
  "Octagon box, plastic": "Round ceiling box, plastic, 20 cu in",
  "Old-work ceiling box": "Old work ceiling box, plastic, 18 cu in",
  "Single-gang metal box": 'Single-gang metal box, 2-1/2" deep',
  // #12: one-piece welded gang boxes ("gangable" is a search word).
  "Double-gang metal box": 'Double-gang welded metal box, 2-1/2" deep',
  "Triple-gang metal box": 'Triple-gang welded metal box, 2-1/2" deep',
  "Masonry box, single-gang": 'Masonry box, single-gang, 3-1/2" deep',
  "Masonry box, double-gang": 'Masonry box, double-gang, 3-1/2" deep',
  "Masonry box, triple-gang": 'Masonry box, triple-gang, 3-1/2" deep',
  // Batch 1 redefines it as the NEW-WORK fan box ("brace" words go).
  "Fan-rated ceiling box": 'Fan-rated ceiling box, 2-1/4" deep',
  "Ceiling fan brace box": 'Ceiling fan brace box, 1-1/2" deep',
  "Handy box": 'Handy box, 1-7/8" deep',
  '1/2" weatherproof box, single-gang':
    '1/2" weatherproof box, single-gang, 2" deep',
  '1/2" weatherproof box, double-gang':
    '1/2" weatherproof box, double-gang, 2" deep',
  // #8: no 1/2" triple-gang is stocked at 2"; the stocked one is 3/4", deep.
  '1/2" weatherproof box, triple-gang':
    '3/4" weatherproof box, triple-gang, 2-5/8" deep',
  '3/4" weatherproof box, single-gang':
    '3/4" weatherproof box, single-gang, 2" deep',
  '3/4" weatherproof box, double-gang':
    '3/4" weatherproof box, double-gang, 2" deep',
  '1/2" weatherproof round box': '1/2" weatherproof round box, 1-1/2" deep',
  '3/4" weatherproof round box': '3/4" weatherproof round box, 1-1/2" deep',
  '1/2" weatherproof box, single-gang, PVC':
    '1/2" weatherproof box, single-gang, PVC, 2-3/8" deep',
  '3/4" weatherproof box, single-gang, PVC':
    '3/4" weatherproof box, single-gang, PVC, 2-3/8" deep',
  ...Object.fromEntries(
    Object.entries(PULL_BOX_DEPTH).flatMap(([side, depth]) => {
      const rows: [string, string][] = [
        [`${side}x${side} pull box`, `${side}x${side}x${depth} pull box`],
      ];
      if (["6", "8", "12"].includes(side))
        rows.push([
          `${side}x${side} pull box, NEMA 3R`,
          `${side}x${side}x${depth} pull box, NEMA 3R`,
        ]);
      if (["4", "6", "8", "12"].includes(side))
        rows.push([
          `${side}x${side} PVC pull box`,
          `${side}x${side}x${depth} PVC pull box`,
        ]);
      return rows;
    })
  ),
  "Floor box": "Floor box, 1-gang, adjustable, nonmetallic",
  // Boxes (batch 1 / batch 2).
  "Low-voltage mud ring": "Low-voltage mounting bracket, 1-gang",
  "Low-voltage mud ring, 2-gang": "Low-voltage mounting bracket, 2-gang",
  "Panel knockout seal": '1/2" knockout seal',
  "Old-work box F-clip": "Old-work box support (F-clip)",
  '3" nail plate': 'Nail plate, 1-1/2" x 3"',
  '5" nail plate': 'Nail plate, 1-1/2" x 5"',
  "Stainless steel weatherproof cover": "Weatherproof flip cover, stainless",

  // ── Raceway, supports, fasteners (batch 1 + batch 2).
  "Ceiling support wire": "12 ga ceiling hanger wire",
  "Concrete wedge anchor": '3/8" x 3" concrete wedge anchor',
  "Beam clamp": 'Beam clamp, 3/8" rod',
  "T-bar grid clip": "T-grid fixture clip",
  "Independent support wire clip": "T-grid independent support clip",
  "Grid box bracket": "T-bar box hanger",
  "Roof flashing boot": "Pipe roof flashing boot, adjustable split",
  // Condition 2: one box fits both series (Wiremold V5747/V5748).
  "Surface raceway device box, 700 series":
    "Surface raceway device box, 500/700 series",
  // Batch 2: one clip (V5703) and one tee (V5715) for both series.
  "Surface raceway support clip, 700 series":
    "Surface raceway support clip, 500/700 series",
  "Surface raceway tee, 700 series": "Surface raceway tee, 500/700 series",
  "J-hook": 'J-hook, 2"',
  "Raceway end cap": "Raceway end cap / blank end plate",
  "Raceway device box, 2-gang":
    "Surface raceway device box, 2-gang, 700 series",
  "Raceway divider clip": "Raceway divider clip, 2400D series",
  "Surface raceway, 1500 series": "Overfloor raceway, 1500 series",
  "Surface raceway, 2400 series two-channel":
    "Surface raceway, 2400D series (divided)",
  '1-5/8" x 1-1/4" strut channel, 10 ft': '1-5/8" x 7/8" strut channel, 10 ft',
  '1-5/8" x 3-1/4" strut channel, 10 ft':
    '1-5/8" x 3-1/4" back-to-back strut channel, 10 ft',
  'Service mast, 2"': 'Service mast, 2", 10 ft',
  'Service mast, 2-1/2"': 'Service mast, 2-1/2", 10 ft',
  'Service mast, 3"': 'Service mast, 3", 10 ft',
  // Batch 2, metal fittings. Both names are BUILT by the fitting lookup
  // (`emtStyledFittingName`, `fittingMaterialName`), which changed with them.
  ...Object.fromEntries(
    TRADE_SIZES.flatMap(size => [
      ...(["connector", "coupling"] as const).map(kind => [
        `${size} EMT raintight ${kind}`,
        `${size} EMT raintight compression ${kind}`,
      ]),
      [
        `${size} rigid conduit connector`,
        `${size} rigid conduit threadless compression connector`,
      ],
    ])
  ),
  "Reducing washer set": 'Reducing washer, 3/4" to 1/2"',
  ...Object.fromEntries(PVC_SHARED_RENAMES),
  ...Object.fromEntries(
    PVC_TWO_HOLE_STRAP_SIZES.map(size => [
      `${size} PVC one-hole strap`,
      `${size} PVC two-hole strap`,
    ])
  ),

  // ── Devices, connectors, grounding (batch 1 + batch 2).
  // Lugs: every range row becomes ONE size, its largest (the size a range
  // row priced as); the other sizes are new rows (realityCheck.ts).
  "8-6 AWG crimp lug": "#6 AWG crimp lug",
  "4-2 AWG crimp lug": "#2 AWG crimp lug",
  "1-1/0 AWG crimp lug": "1/0 AWG crimp lug",
  "2/0-4/0 AWG crimp lug": "4/0 AWG crimp lug",
  "250-350 kcmil crimp lug": "350 kcmil crimp lug, single size",
  ...Object.fromEntries(
    ['3/8"', '1/2"', '3/4"', '1"'].map(size => [
      `${size} cable connector`,
      `${size} NM clamp connector`,
    ])
  ),
  "Duplex receptacle": "15A duplex receptacle",
  "GFCI receptacle": "15A GFCI receptacle",
  "GFCI receptacle, weather-resistant":
    "15A GFCI receptacle, weather-resistant",
  "Duplex receptacle, weather-resistant":
    "15A duplex receptacle, weather-resistant",
  "Single receptacle": "15A single receptacle",
  "Quad receptacle": "15A quad receptacle",
  "Single-pole switch": "15A single-pole switch",
  "3-way switch": "15A 3-way switch",
  "4-way switch": "15A 4-way switch",
  "Motor-rated toggle switch": "Manual motor starter switch, 2-pole 30A",
  "Ground rod clamp": 'Ground rod clamp, 5/8", direct burial',
  '3/4" cord grip (0.40"-0.70" cord)': '3/4" cord grip',
  '1" cord grip (0.50"-0.90" cord)': '1" cord grip',
  "Mechanical lug, 1-hole, 1/0-500 kcmil":
    "Mechanical lug, 1-hole, #4-500 kcmil",

  // ── Panels and power (batch 1 + the non-panel lines of batch 2).
  "Combination meter-main": "200A meter-main combination",
  "Shunt-trip breaker, 2-Pole": "30A 2-Pole shunt-trip breaker",
  "Shunt-trip breaker, 3-Pole": "30A 3-Pole shunt-trip breaker",
  ...Object.fromEntries(
    FUSE_AMPS.map(amps => [
      `${amps}A cartridge fuse`,
      `${amps}A 250V Class RK5 cartridge fuse`,
    ])
  ),
  ...Object.fromEntries(
    DISCONNECT_AMPS.flatMap(amps =>
      ["fused", "non-fused"].flatMap(kind =>
        ["NEMA 1", "NEMA 3R"].map(enclosure => [
          `${amps}A ${kind} disconnect, ${enclosure}`,
          `${amps}A ${kind} disconnect, ${enclosure}, 240V`,
        ])
      )
    )
  ),
  // "Relay module, smoke alarm", not "Smoke alarm relay module" (the line's
  // wording): a name STARTING with "smoke" led a search for "smoke" above
  // every smoke detector (searchSpotCheck, 2026-10-09).
  "Detector relay module": "Relay module, smoke alarm",
  "Automatic transfer switch": "200A automatic transfer switch",
  "Variable frequency drive": "Variable frequency drive, 5 HP, 480V 3-phase",
  "Lighting contactor": "30A 8-pole lighting contactor",
  "Surge protective device": "Panel-mount surge protective device, Type 2",
  ...Object.fromEntries(
    ["125", "150", "175", "200"].map(amps => [
      `${amps}A 2-Pole breaker`,
      `${amps}A 2-Pole branch breaker`,
    ])
  ),
  ...Object.fromEntries(
    ["100", "125", "150", "200"].map(amps => [
      `${amps}A 2-Pole main breaker`,
      `${amps}A 2-Pole main breaker, back-fed kit`,
    ])
  ),
  "15A 2-Pole quad breaker": "15A 2-Pole quad breaker (two 2-pole circuits)",
  "20A 2-Pole quad breaker": "20A 2-Pole quad breaker (two 2-pole circuits)",
  "Panel trim ring": "Panel trim extension",

  // ── Lighting and equipment (batch 1 + batch 2).
  "6 ft MC whip": '6 ft fixture whip, 3/8" MC, 14/3',
  "8 ft MC whip": "8 ft MC whip, 14/3",
  "AC condenser whip": 'AC whip, 3/4" x 6 ft liquidtight, #8',
  "Duct clamp": '4" duct clamp, worm gear',
  '4" insulated flex duct': '4" insulated flex duct, 25 ft',
  '6" insulated flex duct': '6" insulated flex duct, 25 ft',
  "8 ft LED T8 tube, ballast bypass, HO":
    "8 ft LED tube, R17d HO, ballast bypass",
  "8 ft LED T8 tube, ballast bypass, single-pin":
    "8 ft LED tube, FA8 single-pin, ballast bypass",
  "LED corn bulb, E39": "LED corn bulb, E39, 100W",
  "12 ft light pole": '12 ft square steel light pole, 4" 11 ga',
  "20 ft light pole": '20 ft square steel light pole, 4" 11 ga',
  "30 ft light pole": "30 ft square steel light pole",
  "Pole base grout": "Non-shrink grout, 50 lb bag",
  "Range cord, 4-wire": "Range cord, 4-wire, 50A, 6 ft",
  "Unit heater": "Electric unit heater, 5 kW 240V",
  "Well pump control box": "Well pump control box, 1/2 HP 230V 3-wire",
  // HELD, not applied: batch 2 folds the 5" and 6" disc light, CCT disc and
  // LED retrofit trim back into one row each. The owner decided on
  // 2026-10-07, twice, to ship every wafer, canless and CCT-disc size as its
  // own item and NEVER fold two together (materialsCatalog.test.ts) — and
  // the batch-2 line does not cite that decision. Asked of the owner
  // (references/catalog-reality-check-build.md); until answered, the sizes
  // stay apart.
  '6" recessed can, airtight shallow': '6" recessed can, shallow, IC airtight',
  "Pole wire harness": "Pole base in-line fuse holder",
  "Track light connector": "Track light connector, straight",
  "Addressable module": "Addressable monitor module",
  "Fire alarm battery": "12V 7Ah fire alarm battery",
  "Fire alarm control panel": "Conventional fire alarm control panel",
  "Fan-forced wall heater": "Fan-forced wall heater, 2000W 240V",
  "Manual transfer switch": "30A 6-circuit manual transfer switch",
  "Inline duct fan": '6" inline duct fan',
  "Well pump pitless adapter": 'Well pump pitless adapter, 1" x 6"',
  "Cable tray": 'Cable tray, 12" ladder',
  "Cable tray elbow": 'Cable tray elbow, 12" ladder',
  "Cable tray tee": 'Cable tray tee, 12" ladder',
  "Combination motor starter": "Combination motor starter, size 1",
  "Zip ties": 'Zip ties, 8", bag of 100',
  // "Add a length": 5 ft is the stocked lay-in section.
  "4x4 wireway": "4x4 wireway, 5 ft",
  "6x6 wireway": "6x6 wireway, 5 ft",
};

/** Retired shipped name -> the kept row that takes its job (and its name). */
export const REALITY_RETIRED_INTO: Readonly<Record<string, string>> = {
  ...PANEL_RETIRED_INTO,
  ...Object.fromEntries(PVC_SHARED_RETIRED),
  // Batch 1 (the starter repoints are in server/seed/starterParts.ts).
  "320A meter base": "400A meter base",
  "50A RV receptacle": "50A range receptacle, NEMA 14-50R",
  "Floor box cover": "Floor box cover, duplex",
  ...Object.fromEntries(
    ["1", "2", "3", "4"].map(n => [
      `${n}-gang blank plate`,
      `${n}-gang wall plate, blank, nylon`,
    ])
  ),
  "Raceway entrance end fitting":
    "Surface raceway entrance end fitting, 700 series",
  "Surface raceway device box, 500 series":
    "Surface raceway device box, 500/700 series",
  "Surface raceway support clip, 500 series":
    "Surface raceway support clip, 500/700 series",
  "Surface raceway tee, 500 series": "Surface raceway tee, 500/700 series",
  // The trapeze starter already carries the rods, clamps and hardware; the
  // kit stood in for the strut (batch 1, condition 4).
  "Trapeze hanger kit": '1-5/8" x 1-5/8" strut channel, 10 ft',
  "Ground lug, compression": "#4 AWG crimp lug",
  // Batch 1: the slim variant into the plain wafer of the SAME size.
  ...Object.fromEntries(
    ['2"', '3"', '4"', '5"', '6"', '8"'].map(size => [
      `${size} canless wafer LED downlight, slim`,
      `${size} canless wafer LED downlight`,
    ])
  ),
  // Batch 2, the unseried surface raceway parts -> the 700 rows the starter
  // uses (old names kept as search words, condition 1).
  "Raceway coupling": "Surface raceway coupling, 700 series",
  "Raceway device box, 1-gang": "Surface raceway device box, 500/700 series",
  "Raceway flat elbow": "Surface raceway flat elbow, 700 series",
  "Raceway inside elbow": "Surface raceway inside elbow, 700 series",
  "Raceway outside elbow": "Surface raceway outside elbow, 700 series",
  "Raceway mounting strap": "Surface raceway support clip, 500/700 series",
  "Raceway tee fitting": "Surface raceway tee, 500/700 series",
  "Raceway blank end plate": "Raceway end cap / blank end plate",
  "Duct bank spacer": 'Conduit spacer, 2"',
  // Batch 2, devices and boxes.
  "14-10 AWG crimp lug": "Ring terminal, yellow (12-10 AWG)",
  "Twist-lock receptacle": "L14-30 receptacle",
  "Device wing bracket": "Old-work box support (F-clip)",
  '1-1/2" nail plate': 'Nail plate, 1-1/2" x 3"',
  "2-gang wall plate, duplex/decorator, stainless, oversized":
    "2-gang wall plate, duplex/decorator, stainless",
  "Duplex/toggle combo plate": "2-gang wall plate, toggle/duplex, nylon",
  // Batch 2, equipment.
  "Phase tape, black": "Electrical tape",
  // Batch 2, lighting.
  ...Object.fromEntries(
    ['3"', '4"', '5"', '6"'].map(size => [
      `${size} adjustable trim`,
      `${size} gimbal trim`,
    ])
  ),
  // HELD: "every 5" canless wafer row → retire" (batch 2) removes a SIZE the
  // owner decided on 2026-10-07 to ship — see the disc lights above. The
  // variant retirements below remove no size and go ahead.
  // Batch 2: wet rated becomes a search word on the plain wafer.
  ...Object.fromEntries(
    ['2"', '3"', '4"', '5"', '6"', '8"'].map(size => [
      `${size} canless wafer LED downlight, wet rated`,
      `${size} canless wafer LED downlight`,
    ])
  ),
  '2" canless wafer LED downlight, gimbal': '2" canless wafer LED downlight',
  '8" canless wafer LED downlight, gimbal': '8" canless wafer LED downlight',
  ...Object.fromEntries(
    ['3"', '4"', '5"'].map(size => [
      `${size} recessed can, airtight shallow`,
      '6" recessed can, shallow, IC airtight',
    ])
  ),
  ...Object.fromEntries(
    [
      "new construction IC",
      "new construction non-IC",
      "remodel IC",
      "remodel non-IC",
    ].map(kind => [`3" recessed can, ${kind}`, `4" recessed can, ${kind}`])
  ),
  '5" recessed can, new construction non-IC':
    '6" recessed can, new construction non-IC',
  ...Object.fromEntries(
    ['3"', '4"', '5"'].map(size => [
      `${size} recessed can, sloped ceiling`,
      '6" recessed can, sloped ceiling',
    ])
  ),
  "4 ft MC whip": '6 ft fixture whip, 3/8" MC, 14/3',
  // Batch 2, panels (non-panel lines): AFCI ratings nobody stocks.
  "25A 1-Pole AFCI breaker": "20A 1-Pole AFCI breaker",
  "30A 1-Pole AFCI breaker": "20A 1-Pole AFCI breaker",
  "30A 2-Pole AFCI breaker": "20A 2-Pole AFCI breaker",
  "30A 2-Pole AFCI/GFCI combo breaker": "20A 2-Pole AFCI/GFCI combo breaker",
  // Batch 2, metal fittings: a flex coil has no couplings (runFittings counts
  // none on a continuous raceway, so no traced run loses a part).
  ...Object.fromEntries(
    ['1/2"', '3/4"', '1"', '1-1/4"'].map(size => [
      `${size} liquidtight flexible conduit coupling`,
      `${size} liquidtight flexible conduit connector`,
    ])
  ),
};

/** Retired with no row to take its job. */
export const REALITY_RETIRED: readonly string[] = [
  // Batch 2, equipment: "retire, or mark special order".
  "Under-carpet flat cable",
  // Batch 2, boxes: the mixed 3-gang plates (D/Dec/Dec, D/D/Dec, T/D/Dec).
  ...["nylon", "stainless"].flatMap(finish =>
    [
      "duplex/decorator/decorator",
      "duplex/duplex/decorator",
      "toggle/duplex/decorator",
    ].map(mix => `3-gang wall plate, ${mix}, ${finish}`)
  ),
];

/**
 * Search words added or dropped on a FINAL name (after the renames). Words,
 * not phrases: a dropped phrase drops each of its words from that row only.
 */
export type AliasEdit = { add?: string; drop?: string };

const MAIN_LUG = (name: string) => / main-lug /.test(name);

/** Edits that apply to every row a test picks out. */
export const REALITY_ALIAS_RULES: readonly {
  applies: (name: string) => boolean;
  edit: AliasEdit;
  why: string;
}[] = [
  {
    applies: name => / XHHW Aluminum$/.test(name),
    edit: { drop: "thhn" },
    why: "batch 1, wire",
  },
  {
    applies: name => / SE[RU] (Copper|Aluminum)$/.test(name),
    edit: { drop: "seu" },
    why: "batch 2, wire: every SER row",
  },
  {
    applies: name => / SER Copper$/.test(name),
    // The "8/3" forms only. "8-3" was each row's own NAME until 2026-09-25
    // ("8-3 SER copper"), and approval condition 1 keeps an old name
    // searchable on its row — so the dash form stays.
    edit: { drop: "8/3 6/3 4/3 2/3 1/3" },
    why: "batch 2, wire: NM-B and MC names off the SER copper rows",
  },
  {
    applies: name => / EMT [A-Z]+ conduit body$/.test(name),
    edit: { drop: "steel", add: "set screw setscrew aluminum" },
    why: "batch 2, metal fittings",
  },
  {
    applies: name => / grounding bushing$/.test(name),
    edit: { drop: "myers" },
    why: "batch 2, metal fittings",
  },
  {
    applies: name => / rigid conduit T conduit body$/.test(name),
    edit: { drop: "crouse hinds" },
    why: "batch 2, metal fittings (a brand)",
  },
  {
    applies: name => / pull box/.test(name),
    edit: { drop: "trough wireway" },
    why: "batch 1 + batch 2, boxes",
  },
  {
    applies: name => / PVC pull box$/.test(name),
    edit: { drop: "underground" },
    why: "batch 2, boxes",
  },
  {
    applies: name => / cartridge fuse$/.test(name),
    edit: { drop: "j t" },
    why: "batch 2, panels: J and T aliases off R-class rows",
  },
  {
    applies: MAIN_LUG,
    edit: { add: "mlo" },
    why: "owner, panel table: MLO on every main-lug row",
  },
  {
    applies: name => / strut channel, 10 ft$/.test(name),
    edit: { drop: "p1000 p3300" },
    why: "batch 2, raceway: each strut row only its own part number",
  },
];

/** Edits on one final name. */
export const REALITY_ALIAS_EDITS: Readonly<Record<string, AliasEdit>> = {
  "12/2 landscape lighting cable Copper": { drop: "14/2" },
  "Cat6 patch panel, 24-port": { drop: "48" },
  // "4/0-3" stays: it was a retired row's own NAME (condition 1).
  "4/0-4/0-4/0-2/0 SER Aluminum": { drop: "4/0/3" },
  "14/2 fire alarm cable Copper": { drop: "shielded" },
  "16/2 fire alarm cable, FPLR, unshielded Copper": {
    drop: "shielded fplp plenum",
  },
  "12/2 MC cable healthcare (HCF) Copper": { drop: "ac-hcf" },
  "Fiber optic cable, 12-strand OM4 multimode, plenum": {
    drop: "single mode om3 os2",
  },
  "Surface raceway, low voltage": { add: "wiremold" },
  // Now a 3/4" box: its 1/2" generator's size words go, the 3/4" ones come.
  '3/4" weatherproof box, triple-gang, 2-5/8" deep': {
    drop: "half 0.5 1/2",
    add: "three quarter 0.75 deep",
  },
  'Fan-rated ceiling box, 2-1/4" deep': {
    drop: "brace saf-t-brace support",
    add: "new work nail on hanger bar",
  },
  'Handy box, 1-7/8" deep': { drop: "1900" },
  '4" square raised cover, single receptacle': { drop: "1.59" },
  "5-gang new work box, plastic, 94 cu in": {
    drop: "pvc old work remodel cut",
    add: '3-9/16"',
  },
  'Double-gang welded metal box, 2-1/2" deep': {
    add: "gangable gang box one piece",
  },
  'Triple-gang welded metal box, 2-1/2" deep': {
    add: "gangable gang box one piece",
  },
  "1-gang wall plate, 30A/50A power receptacle, nylon": { add: "midway" },
  "Overfloor raceway, 1500 series": { drop: "ds" },
  // One part for both series: both part-number prefixes find it.
  "Surface raceway device box, 500/700 series": { add: "v500 v700" },
  "Surface raceway support clip, 500/700 series": { add: "v500 v700" },
  "Surface raceway tee, 500/700 series": { add: "v500 v700" },
  "Service entrance elbow": { drop: "sill plate" },
  "50A range receptacle, NEMA 14-50R": { add: "rv camper" },
  "400A meter base": { add: "320a cl320" },
  "Manual motor starter switch, 2-pole 30A": {
    drop: "15 amp decora rocker light",
  },
  "Pop-up floor receptacle": { drop: "countertop island tombstone" },
  "Low-voltage momentary switch": { drop: "15 amp decora toggle" },
  "Addressable monitor module": { drop: "control output" },
  "Generator cord cap, CS6365": { drop: "cs6364" },
  "Sub-feed breaker kit": { drop: "subfeed lugs through" },
  // NOT renamed to "closure plug" (batch 2 asked): a name containing "plug"
  // outranks the receptacle for "plug", the word CLAUDE.md names as the one
  // an estimator types for a receptacle. Same rows, sized already; the words
  // go on as search words instead.
  '1/2" threaded closure': { add: "closure plug" },
  '3/4" threaded closure': { add: "closure plug" },
  '1-5/8" x 1-5/8" strut channel, 10 ft': { add: "p1000" },
  '1-5/8" x 13/16" strut channel, 10 ft': { add: "p4000" },
  '1-5/8" x 7/8" strut channel, 10 ft': { add: "p3300" },
  '1-5/8" x 3-1/4" back-to-back strut channel, 10 ft': { add: "p1001" },
  "Old-work box support (F-clip)": { add: "madison bar strap hold" },
  "Relay module, smoke alarm": { add: "detector" },
};

/** Specialty tags this check adds (owner: the 5-gang box). */
export const REALITY_SPECIALTY: readonly string[] = [
  "5-gang new work box, plastic, 94 cu in",
];

export { PULL_BOX_DEPTH, PVC_SHARED_FITTING_FAMILY, PVC_TWO_HOLE_STRAP_SIZES };

/** Panel-table rows nothing is renamed into: the seed ships them as new. */
export const NEW_PANEL_ROWS: readonly (typeof PANEL_TABLE)[number][] =
  PANEL_TABLE.filter(row => !Object.values(PANEL_RENAMES).includes(row.name));
