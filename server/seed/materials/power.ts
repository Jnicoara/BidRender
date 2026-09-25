/**
 * Breakers, panels, disconnects and the commercial distribution gear.
 *
 * ── Pole count is spelled out, the way a counter ticket is ───────────────────
 * A two-pole 20 amp breaker is written "20A 2-Pole" in every supply-house
 * catalog, and that is the displayed name here. It used to be "20/2", which is
 * how the trade SAYS it — and that spelling is kept as a search alias, along
 * with "double pole", "two pole" and "DP", so nothing stopped being findable.
 * The rename went through RENAMED_BASELINE_MATERIALS (see ./index.ts): baseline
 * rows are matched by name, so editing this string alone would have inserted a
 * second row and orphaned every assembly pointing at the first.
 *
 * Single-pole says so too: "20A Single-Pole breaker", "20A Single-Pole AFCI
 * breaker". Changed 2026-09-24. This comment used to argue the opposite — that
 * "1-Pole" on the most common part in the catalog would be noise — and the bare
 * "20A breaker" form it defended is why a single-pole row and its brand
 * variants could not be named from one pattern, and why "15A breaker" sat
 * beside "15A 1-Pole breaker" in the pricing sheet as two rows for one part.
 * Every breaker now states its pole count, and a one-pole breaker says
 * "Single-Pole" rather than "1-Pole" because that is how it is said and
 * written. The old names are in RENAMED_BASELINE_MATERIALS, and "20A breaker"
 * still finds the row, because every word of it is still in the name.
 *
 * ── Panels and Breakers are separate shelves ─────────────────────────────────
 * A panel is a box you hang once; a breaker is a part you stock by the dozen.
 * Shelving them together meant scrolling past five panel sizes to reach the 20A
 * breakers. Disconnects, meter bases and fuses sit with Panels rather than
 * Breakers: they are service equipment, and a fuse goes in a fused disconnect,
 * not in a load center.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const gear = (category: "Panels" | "Breakers" | "Distribution Equipment") => ({
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category,
});

const BREAKER_SLANG = "circuit cb ocpd bolt on plug in load center";
/** Said out loud and written on takeoff sheets; kept findable after the rename. */
const TWO_POLE_SLANG = "2 pole double pole two pole dp 240 volt 240v";

const singlePole: BaselineMaterial[] = ["15", "20", "30"].map(amps => ({
  ...gear("Breakers"),
  name: `${amps}A Single-Pole breaker`,
  searchAliases: aliases(
    `${amps} amp`,
    "single pole one pole 1p sp 1-pole",
    BREAKER_SLANG
  ),
}));

const doublePole: BaselineMaterial[] = [
  "20",
  "30",
  "40",
  "50",
  "60",
  "70",
  "100",
].map(amps => ({
  ...gear("Breakers"),
  name: `${amps}A 2-Pole breaker`,
  searchAliases: aliases(
    `${amps} amp ${amps}a ${amps}/2`,
    TWO_POLE_SLANG,
    BREAKER_SLANG
  ),
}));

/**
 * The three protected types, single- and two-pole.
 *
 * AFCI and GFCI are separate products from the combo, not steps toward it: a
 * kitchen small-appliance circuit needs the combo, a bedroom needs AFCI alone,
 * and a spa or well pump needs a two-pole GFCI. Shipping only the combo left an
 * estimator either mis-specifying or adding the row by hand on every job.
 */
type Protected = { suffix: string; slang: string };

const PROTECTED_TYPES: Protected[] = [
  {
    suffix: "AFCI",
    slang: "arc fault afi combination arc bedroom living",
  },
  {
    suffix: "GFCI",
    slang: "ground fault gfi bathroom kitchen outdoor wet",
  },
  {
    suffix: "AFCI/GFCI combo",
    slang: "arc ground dual function combination gfi afi kitchen laundry",
  },
];

/** Single-pole protected breakers — 15A and 20A cover the branch circuits. */
const protectedSingle: BaselineMaterial[] = PROTECTED_TYPES.flatMap(type =>
  ["15", "20"].map(amps => ({
    ...gear("Breakers"),
    name: `${amps}A Single-Pole ${type.suffix} breaker`,
    searchAliases: aliases(
      `${amps} amp`,
      "single pole one pole 1p sp 1-pole",
      type.slang,
      BREAKER_SLANG
    ),
  }))
);

/**
 * Two-pole protected breakers.
 *
 * Amperages differ per type because the loads do: a two-pole GFCI is a spa,
 * hot tub or well pump (20–60A), while two-pole AFCI and combo units exist at
 * the smaller end where a 240V branch circuit still needs arc protection.
 */
const protectedDouble: BaselineMaterial[] = [
  { type: PROTECTED_TYPES[1], amps: ["20", "30", "50", "60"] }, // GFCI
  { type: PROTECTED_TYPES[0], amps: ["20", "30"] }, // AFCI
  { type: PROTECTED_TYPES[2], amps: ["20", "30"] }, // combo
].flatMap(({ type, amps }) =>
  amps.map(a => ({
    ...gear("Breakers"),
    name: `${a}A 2-Pole ${type.suffix} breaker`,
    searchAliases: aliases(
      `${a} amp ${a}a ${a}/2`,
      TWO_POLE_SLANG,
      type.slang,
      BREAKER_SLANG
    ),
  }))
);

/**
 * Tandems fit two circuits in one slot. Named by both halves because that is
 * how they are ordered — a "15/20 tandem" is not a 15A or a 20A breaker.
 */
const tandems: BaselineMaterial[] = ["15/15", "20/20", "15/20"].map(config => ({
  ...gear("Breakers"),
  name: `${config} tandem breaker`,
  searchAliases: aliases(
    config.replace("/", " "),
    "twin duplex half slim skinny cheater peanut two circuits one space",
    BREAKER_SLANG
  ),
}));

const PANEL_AMPS = ["100", "125", "150", "200", "400"];

const mainPanels: BaselineMaterial[] = PANEL_AMPS.map(amps => ({
  ...gear("Panels"),
  name: `${amps}A main panel`,
  searchAliases: aliases(
    `${amps} amp`,
    "load center loadcenter breaker box service panelboard distribution main breaker"
  ),
}));

const subPanels: BaselineMaterial[] = PANEL_AMPS.map(amps => ({
  ...gear("Panels"),
  name: `${amps}A main-lug sub-panel`,
  searchAliases: aliases(
    `${amps} amp`,
    "mlo subpanel load center loadcenter panelboard remote distribution no main"
  ),
  description:
    "Main-lug only — fed from an upstream breaker, with no main of its own.",
}));

const meterBases: BaselineMaterial[] = ["100", "200", "400"].map(amps => ({
  ...gear("Panels"),
  name: `${amps}A meter base`,
  searchAliases: aliases(
    `${amps} amp`,
    "socket can meter main utility service ringless"
  ),
}));

/**
 * Disconnects come fused and non-fused at every size and the two are NOT
 * interchangeable — a fused switch needs fuses bought with it and a non-fused
 * one will not provide the branch protection a spec may be calling for. Both
 * variants ship at every amperage rather than leaving the estimator to assume.
 */
const disconnects: BaselineMaterial[] = ["30", "60", "100", "200"].flatMap(
  amps => [
    {
      ...gear("Panels"),
      name: `${amps}A fused disconnect`,
      searchAliases: aliases(
        `${amps} amp`,
        "safety switch service ac unit nema 3r outdoor fusible"
      ),
    },
    {
      ...gear("Panels"),
      name: `${amps}A non-fused disconnect`,
      searchAliases: aliases(
        `${amps} amp`,
        "safety switch service ac unit nema 3r outdoor unfused"
      ),
    },
  ]
);

/**
 * Fuses are their own line, not a variant of the switch.
 *
 * A fused disconnect ships empty: the fuses are a separate purchase, at a real
 * per-job cost, and they are also the part that gets replaced later. Folding
 * them into the switch as an option would hide them from the takeoff entirely
 * — the classic way a panel schedule prices out light.
 *
 * The amperages mirror the fused disconnects one for one, INCLUDING the 400A
 * and 600A commercial ones further down this file. A fused switch with no fuse
 * to go in it is the same omission wearing a different hat, so the rule is
 * "every fused disconnect has a fuse" rather than a fixed list — and there is a
 * test asserting exactly that, because the two lists are far apart on screen.
 */
const fuses: BaselineMaterial[] = ["30", "60", "100", "200", "400", "600"].map(
  amps => ({
    ...gear("Panels"),
    name: `${amps}A cartridge fuse`,
    searchAliases: aliases(
      `${amps} amp`,
      "class rk5 rk1 j t time delay dual element one time ferrule knife blade buss"
    ),
    // Fuses go in per pole, and nobody buys one.
    defaultQty: 3,
  })
);

const spaDisconnects: BaselineMaterial[] = ["50", "60"].map(amps => ({
  ...gear("Panels"),
  name: `${amps}A spa disconnect`,
  searchAliases: aliases(
    `${amps} amp`,
    "hot tub pool gfci gfi outdoor panel gfci breaker included all in one"
  ),
  description: "All-in-one enclosure with the GFCI breaker built in.",
}));

// ─── Commercial distribution ──────────────────────────────────────────────────

/**
 * Placeholders, and honestly so: these are single generic rows standing in for
 * families that are specified per job by kVA, ampacity and enclosure. They earn
 * their place because a commercial bid that silently omits its transformer is
 * wrong by five figures, and a row the estimator prices by hand is a far better
 * failure than no row at all.
 */
const COMMERCIAL_NOTE =
  "Generic placeholder — size and price it per the job's schedule.";

export const DISTRIBUTION: BaselineMaterial[] = [
  {
    ...gear("Distribution Equipment"),
    name: "Dry-type transformer",
    searchAliases: aliases(
      "xfmr kva step down 480 208 120 240 buck boost isolation"
    ),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "Busway",
    unitOfSale: "foot",
    searchAliases: aliases("bus duct plug in feeder run overhead"),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "Cable tray",
    unitOfSale: "foot",
    searchAliases: aliases("ladder basket rack runway support wire mesh"),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "Automatic transfer switch",
    searchAliases: aliases("ats generator standby emergency backup switchover"),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "Surge protective device",
    searchAliases: aliases(
      "spd tvss suppressor lightning protection panel mounted transient"
    ),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "400A fused disconnect",
    searchAliases: aliases("400 amp safety switch service fusible large nema"),
  },
  {
    ...gear("Distribution Equipment"),
    name: "600A fused disconnect",
    searchAliases: aliases("600 amp safety switch service fusible large nema"),
  },
  {
    ...gear("Distribution Equipment"),
    name: "Lighting contactor",
    searchAliases: aliases(
      "relay coil mechanically held electrically parking lot control panel"
    ),
    description: COMMERCIAL_NOTE,
  },
  {
    ...gear("Distribution Equipment"),
    name: "Time clock",
    searchAliases: aliases(
      "astronomic timer programmable lighting control 7 day"
    ),
    description: COMMERCIAL_NOTE,
  },
];

export const PANELS_AND_BREAKERS: BaselineMaterial[] = [
  ...singlePole,
  ...doublePole,
  ...protectedSingle,
  ...protectedDouble,
  ...tandems,
  ...mainPanels,
  ...subPanels,
  ...meterBases,
  ...disconnects,
  ...fuses,
  ...spaDisconnects,
];
