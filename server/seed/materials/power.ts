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

/*
  Sizes: 15–50A, the run every plug-on and bolt-on line makes. 60A and 70A
  single-pole exist in QO only, so they stay on the pricing sheet rather than
  in the shipped list. 25–50A added 2026-09-24 from the pricing sheet, where
  they had sat as "new" rows while live search could not find them.
*/
const singlePole: BaselineMaterial[] = [
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
].map(amps => ({
  ...gear("Breakers"),
  name: `${amps}A Single-Pole breaker`,
  searchAliases: aliases(
    `${amps} amp`,
    "single pole one pole 1p sp 1-pole",
    BREAKER_SLANG
  ),
}));

/*
  Sizes: every plug-on two-pole from 15A to 125A.

  Until 2026-09-24 this list stopped at 70A with 100A on its own, so a search
  for "90a breaker" on the live site could only return the 90A 3-POLE — the
  rarer part — because the two-pole it meant did not exist. The pricing sheet
  had carried 80/90/110/125A as new rows for days; nothing had moved them here,
  which is the only place search reads.

  Above 125A a two-pole is a main breaker (a different frame, and usually part
  of the panel), so 150A and up are deliberately NOT shipped as branch
  breakers. The pricing sheet lists them; see the audit in CHANGELOG.md.
*/
const doublePole: BaselineMaterial[] = [
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "60",
  "70",
  "80",
  "90",
  "100",
  "110",
  "125",
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
 * Three-pole breakers — rooftop units, 3-phase motors, panel feeders on a
 * commercial job. The amperage set is the pricing sheet's
 * (pricing/buildPricingSheet.mts), including the odd 15/25/35/45/80/90A sizes
 * a nameplate actually calls for.
 *
 * Added 2026-09-24. Until then the sheet listed these as NEW rows and the seed
 * had none, while the changelog spoke of the "3-Pole rows beside" the others.
 */
const THREE_POLE_SLANG =
  "3 pole three pole triple pole 3p tp 3 phase three phase 3ph";

const triplePole: BaselineMaterial[] = [
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "60",
  "70",
  "80",
  "90",
  "100",
  "125",
  "150",
  "200",
].map(amps => ({
  ...gear("Breakers"),
  name: `${amps}A 3-Pole breaker`,
  searchAliases: aliases(
    `${amps} amp ${amps}a ${amps}/3`,
    THREE_POLE_SLANG,
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
  { type: PROTECTED_TYPES[1], amps: ["20", "30", "40", "50", "60"] }, // GFCI
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
/**
 * The larger single-pole protected breakers. Moved from the pricing sheet,
 * 2026-09-25: a 25A or 30A single-pole circuit that still needs arc or ground
 * fault protection.
 */
const protectedSingleLarge: BaselineMaterial[] = [
  { amps: "25", type: PROTECTED_TYPES[0] },
  { amps: "30", type: PROTECTED_TYPES[0] },
  { amps: "30", type: PROTECTED_TYPES[1] },
].map(({ amps, type }) => ({
  ...gear("Breakers"),
  name: `${amps}A Single-Pole ${type.suffix} breaker`,
  searchAliases: aliases(
    `${amps} amp`,
    "single pole one pole 1p sp 1-pole",
    type.slang,
    BREAKER_SLANG
  ),
}));

/**
 * Half-size breakers take half a space on the lines built for them. Not the
 * same part as a tandem (two circuits in one full space), so named apart.
 * Moved from the pricing sheet, 2026-09-25.
 */
const halfSize: BaselineMaterial[] = [
  ...["15", "20", "30"].map(amps => ({
    amps,
    pole: "Single-Pole",
    slang: "single pole one pole 1p sp",
  })),
  ...["15", "20", "30", "40", "50"].map(amps => ({
    amps,
    pole: "2-Pole",
    slang: TWO_POLE_SLANG,
  })),
].map(({ amps, pole, slang }) => ({
  ...gear("Breakers"),
  name: `${amps}A ${pole} half-size breaker`,
  searchAliases: aliases(
    `${amps} amp`,
    slang,
    "half inch 1/2 slim thin space saver",
    BREAKER_SLANG
  ),
}));

/**
 * Quad breakers: two 2-pole circuits in the space of one 2-pole, the way a
 * tandem is two single-poles in one space. Named "2-Pole" because each of its
 * circuits is one. Moved from the pricing sheet, 2026-09-25.
 */
const quads: BaselineMaterial[] = ["15", "20"].map(amps => ({
  ...gear("Breakers"),
  name: `${amps}A 2-Pole quad breaker`,
  searchAliases: aliases(
    `${amps} amp ${amps}/2`,
    "quadplex twin double tandem two circuits",
    TWO_POLE_SLANG,
    BREAKER_SLANG
  ),
}));

/** Parts a breaker needs or a panel schedule calls for, beside the breakers. */
const breakerAccessories: BaselineMaterial[] = [
  {
    ...gear("Breakers"),
    name: "Breaker handle tie",
    searchAliases: aliases("common trip tie bar multiwire mwbc shared neutral"),
  },
  {
    ...gear("Breakers"),
    name: "Breaker hold-down kit",
    searchAliases: aliases("retainer backfed back fed generator main clip"),
  },
  {
    ...gear("Breakers"),
    name: "Breaker lock-off",
    searchAliases: aliases("lockout lock out padlock loto handle lock"),
  },
  {
    ...gear("Breakers"),
    // The sheet calls it "Plug-on surge protective device". A name holding
    // "plug" put it first for "plug", above every receptacle, and "Load
    // center …" then put it first for "load center", above every panel.
    name: "Breaker-style surge protective device",
    searchAliases: aliases(
      "plug-on plugon spd tvss whole house load center type 2 panel"
    ),
  },
  {
    ...gear("Breakers"),
    name: "Sub-feed breaker kit",
    searchAliases: aliases("subfeed lugs feed through main panel"),
  },
  // On the sheet's Distribution Equipment list; they are breakers, so they
  // live on the Breakers shelf.
  {
    ...gear("Breakers"),
    name: "Shunt-trip breaker, 2-Pole",
    searchAliases: aliases(
      "shunt trip remote hood suppression ansul restaurant",
      TWO_POLE_SLANG
    ),
  },
  {
    ...gear("Breakers"),
    name: "Shunt-trip breaker, 3-Pole",
    searchAliases: aliases(
      "shunt trip remote hood suppression ansul restaurant",
      THREE_POLE_SLANG
    ),
  },
];

const tandems: BaselineMaterial[] = [
  "15/15",
  "20/20",
  "15/20",
  // Moved from the pricing sheet, 2026-09-25.
  "30/30",
].map(config => ({
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

/**
 * Panels by amperage AND space count, beside the unsized rows above. Moved
 * from the pricing sheet, 2026-09-25, where they are the parents the brand
 * variants hang from. The unsized "200A main panel" stays: it is what a
 * starter assembly names, and it is the right row when the space count is not
 * known yet.
 */
const PANEL_SPACES: { amps: string; spaces: string[] }[] = [
  { amps: "60", spaces: ["8", "12"] },
  { amps: "100", spaces: ["12", "20", "24"] },
  { amps: "125", spaces: ["20", "24", "30"] },
  { amps: "150", spaces: ["30", "40"] },
  { amps: "200", spaces: ["30", "40", "42"] },
  { amps: "225", spaces: ["42"] },
  { amps: "400", spaces: ["42"] },
];
const spacedPanels: BaselineMaterial[] = PANEL_SPACES.flatMap(
  ({ amps, spaces }) =>
    spaces.flatMap(spaces => [
      {
        ...gear("Panels"),
        name: `${amps}A main panel, ${spaces}-space`,
        searchAliases: aliases(
          `${amps} amp ${spaces} space ${spaces} circuit`,
          "load center loadcenter breaker box service panelboard main breaker"
        ),
      },
      {
        ...gear("Panels"),
        name: `${amps}A main-lug sub-panel, ${spaces}-space`,
        searchAliases: aliases(
          `${amps} amp ${spaces} space ${spaces} circuit`,
          "mlo subpanel load center loadcenter panelboard remote no main"
        ),
      },
    ])
);

const outdoorPanels: BaselineMaterial[] = ["100", "200"].map(amps => ({
  ...gear("Panels"),
  name: `${amps}A outdoor main panel`,
  searchAliases: aliases(
    `${amps} amp`,
    "nema 3r exterior raintight load center loadcenter main breaker"
  ),
}));

/** Panel parts, sold apart from the panel. Moved from the pricing sheet. */
const panelParts: BaselineMaterial[] = [
  /*
    Both renamed from the sheet's wording so the everyday rows still lead:
    "Combination meter-main panel" led "panel", "Meter-main combo" then led
    "meter" (a name that STARTS with the word scores above one that does not),
    and "Generator ready load center" led "load center".
  */
  {
    name: "Combination meter-main",
    slang: "combo all in one service meter socket panel load center",
  },
  {
    name: "Generator-ready main panel",
    slang: "interlock transfer backup standby load center",
  },
  {
    name: "Panelboard interior only",
    slang: "guts insides replacement bus retrofit can",
  },
  { name: "Panel cover, flush", slang: "dead front door trim recessed" },
  { name: "Panel cover, surface", slang: "dead front door trim" },
  { name: "Panel trim ring", slang: "flush trim frame drywall gap" },
  { name: "Panel neutral bar", slang: "bus bar terminal strip white" },
  { name: "Feed-through lug kit", slang: "feedthru double lugs sub feed" },
].map(({ name, slang }) => ({
  ...gear("Panels"),
  name,
  searchAliases: aliases(slang),
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
      "astronomic timer programmable lighting control 7 day sign signage"
    ),
    description: COMMERCIAL_NOTE,
  },
  /*
    ── Moved from the pricing sheet, 2026-09-25 ─────────────────────────────
    Fittings for the placeholder runs above, and the tenant-improvement,
    office and restaurant gear the sheet found by walking those jobs.
  */
  ...[
    { name: "Busway elbow", slang: "bus duct fitting ell turn" },
    { name: "Cable tray elbow", slang: "ladder basket fitting ell turn 90" },
    { name: "Cable tray tee", slang: "ladder basket fitting branch t" },
    {
      name: "Cable tray support bracket",
      slang: "ladder basket wall hanger trapeze",
    },
    /*
      Size first, as "4x4 pull box" is. "Wireway, 4x4" made "Wireway" the head
      noun, which a search for "wire" matched ahead of building wire; the same
      went for "Panelboard, 208V" and "panel".
    */
    { name: "4x4 wireway", slang: "4 x 4 trough gutter lay in hinged nema 1" },
    { name: "6x6 wireway", slang: "6 x 6 trough gutter lay in hinged nema 1" },
    { name: "Wireway coupling", slang: "trough gutter connector joiner" },
    { name: "Wireway elbow", slang: "trough gutter fitting ell turn 90" },
    {
      name: "208V 3-phase panelboard",
      slang: "208y/120 three phase commercial lighting appliance mlo main",
    },
    {
      name: "480V 3-phase panelboard",
      slang: "480y/277 three phase commercial lighting power mlo main",
    },
    {
      name: "Current transformer cabinet",
      slang: "ct can cabinet utility metering service",
    },
    {
      name: "Combination motor starter",
      slang: "combo disconnect starter nema magnetic",
    },
    ...["0", "1", "2"].map(size => ({
      name: `Motor starter, size ${size}`,
      slang: `nema ${size} magnetic contactor overload`,
    })),
    {
      name: "Variable frequency drive",
      slang: "vfd ac drive inverter motor speed control",
    },
    {
      name: "Hood suppression micro-switch",
      slang: "ansul hood fire suppression micro switch restaurant",
    },
    {
      name: "Equipment shut-off relay",
      slang: "hood suppression restaurant shunt kill cooking equipment",
    },
    {
      name: "Hood control interface relay",
      slang: "restaurant exhaust fan makeup air",
    },
    {
      name: "Poke-through device, 2-service",
      slang: "pokethrough floor fire rated core drill power data",
    },
    {
      name: "Poke-through device, 4-service",
      slang: "pokethrough floor fire rated core drill power data",
    },
    {
      name: "Floor monument, 2-gang",
      slang: "tombstone surface floor outlet power data",
    },
    { name: "Raised floor box", slang: "access floor computer room" },
    { name: "Desk grommet outlet", slang: "desktop power usb pop up" },
    {
      name: "Tele-power pole, 10 ft",
      slang: "telepower power pole ceiling drop office cubicle",
    },
    {
      name: "Tele-power pole, 15 ft",
      slang: "telepower power pole ceiling drop office cubicle",
    },
    {
      name: "Power pole fitting kit",
      slang: "telepower tele-power ceiling drop fittings",
    },
    {
      name: "Furniture feed connector",
      slang: "modular systems furniture base feed cubicle office",
    },
    {
      name: "Modular furniture whip, 6 ft",
      slang: "cubicle systems furniture feed office",
    },
    {
      name: "Modular furniture whip, 10 ft",
      slang: "cubicle systems furniture feed office",
    },
  ].map(({ name, slang }) => ({
    ...gear("Distribution Equipment"),
    name,
    searchAliases: aliases(slang),
  })),
  {
    ...gear("Distribution Equipment"),
    name: "Under-carpet flat cable",
    // By the foot: the sheet had it as "each", which is not how it is bought.
    unitOfSale: "foot",
    searchAliases: aliases("flat wire undercarpet office floor ffc"),
  },
];

export const PANELS_AND_BREAKERS: BaselineMaterial[] = [
  ...singlePole,
  ...doublePole,
  ...triplePole,
  ...protectedSingle,
  ...protectedSingleLarge,
  ...protectedDouble,
  ...tandems,
  ...halfSize,
  ...quads,
  ...breakerAccessories,
  ...mainPanels,
  ...subPanels,
  ...spacedPanels,
  ...outdoorPanels,
  ...panelParts,
  ...meterBases,
  ...disconnects,
  ...fuses,
  ...spaDisconnects,
];
