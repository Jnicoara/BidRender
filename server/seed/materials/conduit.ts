/**
 * Conduit, raceway and their fittings.
 *
 * ── The five families are generated, and that is the point ───────────────────
 * EMT, PVC 40, PVC 80, rigid and IMC each ship at all nine trade sizes with a
 * connector, coupling, 90 and LB — 225 rows that differ in two words. Written
 * out by hand they would be 225 chances to give 2-1/2" the size spellings that
 * 1-1/2" got and 3" did not. Generated, "how a size is typed" is decided once
 * in types.ts and every family inherits it.
 *
 * ── What is NOT cross-aliased ────────────────────────────────────────────────
 * IMC is not aliased "rigid" and rigid is not aliased "IMC", even though the
 * trade groups them and a supply house shelves them together. They are
 * different products at different prices, and aliasing either to the other's
 * name is precisely the mistake that made searching "recep" return "Wall plate"
 * — an alias must surface a material, never outrank the one the query names.
 */
import {
  aliases,
  sizeAliases,
  FLEX_SIZES,
  MAST_SIZES,
  TRADE_SIZES,
  UNPRICED,
  type BaselineMaterial,
  type RacewayFacts,
} from "./types";
import {
  EMT_FITTING_STYLES,
  emtStyledFittingName,
  oneHoleStrapName,
  sweepName,
  type EmtFittingStyle,
} from "../../../shared/runFittingMaterials";

// ─── The five rigid families ──────────────────────────────────────────────────

type Family = {
  /** How the size and family read as a name: `1/2" EMT`. */
  label: string;
  /** Slang for the family itself, minus anything its label already says. */
  slang: string;
  /**
   * What the fitting count reads off the pipe, per size. EDITABLE DEFAULTS,
   * shipped so a fresh catalog counts something — not code advice, and the
   * screen labels them as defaults. See `shared/runFittings.ts`.
   */
  raceway: (size: string) => RacewayFacts;
};

/**
 * PVC's strap spacing steps up with size — the familiar 3 / 5 / 6 / 7 ft
 * table. A default for a company to change, like everything here.
 */
function pvcStrapSpacing(size: string): number {
  if (['1/2"', '3/4"', '1"'].includes(size)) return 3;
  if (['1-1/4"', '1-1/2"', '2"'].includes(size)) return 5;
  if (['2-1/2"', '3"'].includes(size)) return 6;
  return 7;
}

const FAMILIES: Family[] = [
  {
    label: "EMT",
    slang: "thinwall thin wall pipe tube tubing electrical metallic steel",
    // Decided 2026-09-26: 10 ft sticks, strapped every 10 ft and within 3 ft
    // of a box.
    raceway: () => ({
      stickLengthFeet: 10,
      stickJoint: "coupling",
      strapSpacingFeet: 10,
      strapFromBoxFeet: 3,
    }),
  },
  {
    label: "PVC Sch 40",
    slang: "schedule sch40 plastic poly grey gray underground buried",
    // Belled: each stick takes the next without a coupling (2026-09-26).
    raceway: size => ({
      stickLengthFeet: 10,
      stickJoint: "belled",
      strapSpacingFeet: pvcStrapSpacing(size),
      strapFromBoxFeet: 3,
    }),
  },
  {
    label: "PVC Sch 80",
    slang: "schedule sch80 plastic poly grey gray heavy wall exposed riser",
    raceway: size => ({
      stickLengthFeet: 10,
      stickJoint: "belled",
      strapSpacingFeet: pvcStrapSpacing(size),
      strapFromBoxFeet: 3,
    }),
  },
  {
    label: "rigid conduit",
    slang: "rmc grc galvanized galvanised threaded heavy wall grc",
    // Sold with one coupling threaded on each stick (2026-09-26).
    raceway: () => ({
      stickLengthFeet: 10,
      stickJoint: "coupling_on_stick",
      strapSpacingFeet: 10,
      strapFromBoxFeet: 3,
    }),
  },
  {
    label: "IMC",
    slang: "intermediate metal threaded galvanized galvanised",
    raceway: () => ({
      stickLengthFeet: 10,
      stickJoint: "coupling_on_stick",
      strapSpacingFeet: 10,
      strapFromBoxFeet: 3,
    }),
  },
];

/**
 * The six fittings every family ships at every size.
 *
 * The 45 was added 2026-09-26 for the bend count (`shared/runBends.ts`): a
 * traced corner of 15–67° takes one, and without the row every such corner
 * had nothing to price against. Its name comes from `elbowName`, the same
 * function the lookup builds with; `materialsCatalog.test.ts` checks every
 * elbow, LB and T body the lookup can ask for exists here. Sweeps
 * (large-radius) were held for an Underground category until 2026-09-29, and
 * now ship as their own rows — see `pvcSweeps` below.
 *
 * The T body was added 2026-09-27 (references/materials-track-c-plan.md § 4,
 * owner's answers T1–T6): all nine sizes, one row per family, matching the LB
 * so a body chosen at any tee has a row to price against. Its name comes from
 * `tBodyName`.
 *
 * LL, LR and C bodies were added 2026-09-28 (plan § 7). This overrides T6,
 * which held them "until the takeoff proposes them": the owner asked for the
 * rows anyway, for adding by hand. The takeoff still proposes none of them.
 * Same five families and nine sizes; names from `llName`, `lrName` and
 * `cBodyName`. No brand aliases (L4), to match the LB.
 *
 * EVERY conduit body is priced WITH its cover and gasket, and says so (owner,
 * 2026-09-27, plan § 5, C1). The catalog ships no separate cover row and the
 * takeoff adds no cover line for an LB or a T, so a bare-body price would
 * leave the cover off every bid with nothing to show it. The LB rows said
 * nothing either way until then. `BODY_DESCRIPTION` is shared so the shapes
 * cannot drift apart; LL, LR and C take it too, and
 * `materialsCatalog.test.ts` fails on any "conduit body" row without it.
 */
const BODY_DESCRIPTION = "Priced with its cover and gasket.";

const FITTINGS: { suffix: string; slang: string; description?: string }[] = [
  { suffix: "connector", slang: "fitting terminal adapter male box" },
  { suffix: "coupling", slang: "coupler splice join" },
  { suffix: "90-degree elbow", slang: "ell bend sweep factory" },
  { suffix: "45-degree elbow", slang: "ell bend factory forty five" },
  {
    suffix: "LB conduit body",
    slang: "condulet access fitting pull",
    description: BODY_DESCRIPTION,
  },
  {
    // Not "tee body": "body" is in the name, so the phrase is "tee" + name.
    suffix: "T conduit body",
    slang: "tee condulet access fitting pull branch split",
    description: BODY_DESCRIPTION,
  },
  {
    suffix: "LL conduit body",
    slang: "condulet access fitting pull left",
    description: BODY_DESCRIPTION,
  },
  {
    suffix: "LR conduit body",
    slang: "condulet access fitting pull right",
    description: BODY_DESCRIPTION,
  },
  {
    suffix: "C conduit body",
    slang: "condulet access fitting pull straight through",
    description: BODY_DESCRIPTION,
  },
];

/**
 * Brand names as aliases on the T body, the owner's choice for the boxes
 * audit carried over (§ 4). The LB rows were left as they were, so this
 * change moves no existing search. Keyed by family label; EMT has no counter
 * brand everyone calls it by.
 */
const T_BODY_BRANDS: Record<string, string> = {
  "rigid conduit": "crouse hinds",
  IMC: "crouse hinds",
  "PVC Sch 40": "carlon",
  "PVC Sch 80": "carlon",
};

/**
 * EMT's couplings and connectors come in three styles, so EMT does not take
 * the plain two from FITTINGS. Set-screw is the RENAMED original row (see
 * RENAMED_BASELINE_MATERIALS) — "EMT coupling" at the counter means set-screw
 * — and compression and raintight are new. Names come from
 * `shared/runFittingMaterials.ts`, which the fitting lookup reads too.
 */
const EMT_STYLE_SLANG: Record<EmtFittingStyle, string> = {
  "set-screw": "setscrew set screw ss",
  compression: "comp gland nut",
  raintight: "rain tight rain-tight wet outdoor",
};

function emtStyledFittings(size: string): BaselineMaterial[] {
  const family = FAMILIES[0];
  return EMT_FITTING_STYLES.flatMap(style =>
    FITTINGS.filter(
      f => f.suffix === "coupling" || f.suffix === "connector"
    ).map(fitting => ({
      name: emtStyledFittingName(
        size,
        style,
        fitting.suffix as "coupling" | "connector"
      ),
      unitOfSale: "each" as const,
      costPerUnit: UNPRICED,
      category: "Conduit Fittings" as const,
      searchAliases: aliases(
        sizeAliases(size),
        family.slang,
        fitting.slang,
        EMT_STYLE_SLANG[style]
      ),
    }))
  );
}

/**
 * A fitting's slang for one family. The only exception: PVC's standard 90
 * does not answer to "sweep", because PVC ships real sweeps (below) and a
 * bare "sweep" should find them rather than the ordinary elbow (owner,
 * 2026-09-29, plan § 8 S5). EMT, rigid and IMC ship no sweep rows, so their
 * 90 keeps the word — there it is what the trade means by it.
 */
function fittingSlang(
  familyLabel: string,
  fitting: { suffix: string; slang: string }
): string {
  if (fitting.suffix === "90-degree elbow" && PVC_LABELS.has(familyLabel)) {
    return fitting.slang
      .split(" ")
      .filter(w => w !== "sweep")
      .join(" ");
  }
  return fitting.slang;
}

const PVC_LABELS = new Set(["PVC Sch 40", "PVC Sch 80"]);

/**
 * Large-radius PVC sweeps, 56 rows (owner, 2026-09-29, plan § 8, S1–S5):
 * 1" to 4", 90 and 45, 24" and 36" radius, Schedule 40 and 80.
 *
 * On Conduit Fittings, NOT waiting for an Underground shelf — this overrides
 * takeoff-spec D19 answer 2. Underground is a LOCATION tag on the run (D8),
 * not a shelf, and `backfillMaterialMetadata` re-stamps the category on every
 * start, so moving them later is a one-word edit here with the same ids.
 *
 * Not 1/2" or 3/4": there the factory elbow is the bend. Not 30° or 22.5°:
 * the bend count only ever produces 90s and 45s, so those would be rows it
 * can never count — hand-add a custom row. Not marked "common": a bare
 * "2 pvc 90" still leads with the standard elbow.
 *
 * The standard 90 above keeps being what the takeoff counts on a PVC run. A
 * run type counts sweeps only when its 90 (or 45) is pointed at one of these.
 */
const SWEEP_SIZES = ['1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"'];
const SWEEP_ANGLES = [90, 45] as const;
const SWEEP_RADII = [24, 36] as const;

const pvcSweeps: BaselineMaterial[] = FAMILIES.filter(f =>
  PVC_LABELS.has(f.label)
).flatMap(family =>
  SWEEP_SIZES.flatMap(size =>
    SWEEP_ANGLES.flatMap(angle =>
      SWEEP_RADII.map(radius => ({
        name: sweepName(size, family.label, angle, radius),
        unitOfSale: "each" as const,
        costPerUnit: UNPRICED,
        category: "Conduit Fittings" as const,
        description: `Large-radius factory sweep, ${radius}" to the centreline.`,
        searchAliases: aliases(
          sizeAliases(size),
          family.slang,
          "large long big bend ell underground stub stubup riser utility",
          angle === 45 ? "forty five" : undefined
        ),
      }))
    )
  )
);

const rigidFamilies: BaselineMaterial[] = FAMILIES.flatMap(family => [
  // The raceway itself, priced by the foot the way it is estimated even though
  // it is bought in 10 ft sticks — which `raceway` records for the count.
  ...TRADE_SIZES.map(size => ({
    name: `${size} ${family.label}`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Conduit" as const,
    searchAliases: aliases(sizeAliases(size), family.slang, "conduit raceway"),
    raceway: family.raceway(size),
  })),
  ...TRADE_SIZES.flatMap(size => [
    ...FITTINGS.filter(
      fitting =>
        family.label !== "EMT" ||
        (fitting.suffix !== "coupling" && fitting.suffix !== "connector")
    ).map(fitting => ({
      name: `${size} ${family.label} ${fitting.suffix}`,
      unitOfSale: "each" as const,
      costPerUnit: UNPRICED,
      category: "Conduit Fittings" as const,
      searchAliases: aliases(
        sizeAliases(size),
        family.slang,
        fittingSlang(family.label, fitting),
        fitting.suffix === "T conduit body"
          ? T_BODY_BRANDS[family.label]
          : undefined
      ),
      ...(fitting.description ? { description: fitting.description } : {}),
    })),
    ...(family.label === "EMT" ? emtStyledFittings(size) : []),
  ]),
]);

/**
 * Sized one-hole straps, one family per outside diameter: EMT, PVC (40 and 80
 * share it) and rigid (rigid and IMC share it). What the strap count prices
 * against — the unsized "EMT strap" below stays for assemblies that use it.
 */
const STRAP_FAMILIES = [
  { label: "EMT", slang: "thinwall" },
  { label: "PVC", slang: "plastic schedule sch40 sch80" },
  { label: "rigid", slang: "rmc grc imc galvanized" },
];

const straps: BaselineMaterial[] = STRAP_FAMILIES.flatMap(family =>
  TRADE_SIZES.map(size => ({
    name: oneHoleStrapName(size, family.label),
    unitOfSale: "each" as const,
    costPerUnit: UNPRICED,
    category: "Conduit Fittings" as const,
    searchAliases: aliases(
      sizeAliases(size),
      family.slang,
      "1 hole clamp conduit pipe hanger support"
    ),
  }))
);

// ─── Flex ─────────────────────────────────────────────────────────────────────

/**
 * Flex stops at 1-1/4" and has no elbow or LB, because neither exists: the
 * whole point of flex is that it turns the corner itself.
 */
const FLEX_FAMILIES = [
  {
    label: "flexible metal conduit",
    slang: "fmc flex greenfield steel spiral whip",
  },
  {
    label: "liquidtight flexible conduit",
    slang: "lfmc sealtite seal tite liquid tight carflex whip wet",
  },
];

const flex: BaselineMaterial[] = FLEX_FAMILIES.flatMap(family => [
  ...FLEX_SIZES.map(size => ({
    name: `${size} ${family.label}`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Conduit" as const,
    searchAliases: aliases(sizeAliases(size), family.slang, "raceway"),
    // A coil, not sticks: no couplings. Strapped every 4-1/2 ft and within
    // 12 in of a box — defaults, like the rigid families'.
    raceway: {
      stickLengthFeet: null,
      stickJoint: "continuous" as const,
      strapSpacingFeet: 4.5,
      strapFromBoxFeet: 1,
    },
  })),
  ...FLEX_SIZES.flatMap(size =>
    [
      { suffix: "connector", slang: "fitting box straight angle" },
      { suffix: "coupling", slang: "coupler splice join" },
    ].map(fitting => ({
      name: `${size} ${family.label} ${fitting.suffix}`,
      unitOfSale: "each" as const,
      costPerUnit: UNPRICED,
      category: "Conduit Fittings" as const,
      searchAliases: aliases(sizeAliases(size), family.slang, fitting.slang),
    }))
  ),
]);

// ─── Bushings and locknuts ────────────────────────────────────────────────────

/**
 * Generic rather than per-family: a 3/4" locknut fits 3/4" threads whatever the
 * raceway on the other side of them is, and shipping five identical locknuts
 * under five family names would be five rows for one part.
 */
const terminations: BaselineMaterial[] = [
  ...TRADE_SIZES.map(size => ({
    name: `${size} conduit bushing`,
    unitOfSale: "each" as const,
    costPerUnit: UNPRICED,
    category: "Conduit Fittings" as const,
    searchAliases: aliases(
      sizeAliases(size),
      "plastic insulating insulated throat bushing"
    ),
  })),
  ...TRADE_SIZES.map(size => ({
    name: `${size} conduit locknut`,
    unitOfSale: "each" as const,
    costPerUnit: UNPRICED,
    category: "Conduit Fittings" as const,
    searchAliases: aliases(sizeAliases(size), "lock nut ring steel"),
    defaultQty: 2,
  })),
];

// ─── Weatherheads ─────────────────────────────────────────────────────────────

/** No 1/2" or 3/4": nobody runs a service mast that small. */
const weatherheads: BaselineMaterial[] = [
  { label: "PVC weatherhead", slang: "plastic poly schedule" },
  { label: "metal weatherhead", slang: "aluminum aluminium steel clamp" },
].flatMap(kind =>
  MAST_SIZES.map(size => ({
    name: `${size} ${kind.label}`,
    unitOfSale: "each" as const,
    costPerUnit: UNPRICED,
    category: "Conduit Fittings" as const,
    searchAliases: aliases(
      sizeAliases(size),
      kind.slang,
      "service head entrance cap mast gooseneck riser"
    ),
  }))
);

export const CONDUIT: BaselineMaterial[] = [
  ...rigidFamilies,
  ...pvcSweeps,
  ...straps,
  ...flex,
  ...terminations,
  ...weatherheads,
  {
    // The plain wall strap, as distinct from the strut-mounted straps in
    // strut.ts: this one screws to a surface, that one bolts to channel.
    name: "EMT strap",
    unitOfSale: "each",
    costPerUnit: UNPRICED,
    category: "Conduit Fittings",
    searchAliases: aliases(
      "one hole 1 hole two hole 2 hole conduit pipe clamp minerallac hanger"
    ),
    defaultQty: 3,
  },
  {
    // Moved from the pricing sheet, 2026-09-25. Steps a knockout down to a
    // smaller fitting; sold as a pair in a set.
    name: "Reducing washer set",
    unitOfSale: "each",
    costPerUnit: UNPRICED,
    category: "Conduit Fittings",
    searchAliases: aliases("reducer knockout ko step down enclosure hole pair"),
  },
];
