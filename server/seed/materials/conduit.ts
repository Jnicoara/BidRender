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

/** The four fittings every family ships at every size. */
const FITTINGS = [
  { suffix: "connector", slang: "fitting terminal adapter male box" },
  { suffix: "coupling", slang: "coupler splice join" },
  { suffix: "90-degree elbow", slang: "ell bend sweep factory" },
  { suffix: "LB conduit body", slang: "condulet access fitting pull" },
];

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
      searchAliases: aliases(sizeAliases(size), family.slang, fitting.slang),
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
