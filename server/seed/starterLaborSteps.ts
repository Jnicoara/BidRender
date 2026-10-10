/**
 * The shipped WORK STEP library and the starters' step lists
 * (references/step-based-labor-plan.md § 10, § 11; owner answers § 13).
 *
 * ── Hand-written content, and NO TIMES ───────────────────────────────────────
 * Names, units and the reasoning live here. The MINUTES do not: they come from
 * the owner's "Steps" tab of pricing/starter-catalog-pricing.xlsx, through
 * Track A's loader, into the GENERATED starterStepMinutes.ts — which ships
 * empty. So every step ships NOT SET, every starter's step total is NOT SET,
 * and not one bid line prices differently until the owner types minutes
 * (plan § 13a). The draft minutes in plan § 10 are for the sheet's "Draft"
 * column, not for here.
 *
 * ── Never a published table, never an AI output (plan § 9) ───────────────────
 * Each reasoning line says what the time covers in physical motions. No
 * number here or in the generated file is copied, paraphrased or "adjusted
 * from" NECA, RSMeans or any published labor table.
 *
 * ── Keys are the carry-over key ──────────────────────────────────────────────
 * `key` is what the sheet carries a typed minute by. Never reuse a key for a
 * different step; retire a step by removing it here (the seed sets
 * `isActive = false`, and assemblies pointing at it still resolve).
 */

export type StarterLaborStep = {
  key: string;
  name: string;
  unit: string;
  reasoning: string;
};

export const STARTER_LABOR_STEPS: readonly StarterLaborStep[] = [
  {
    key: "S01",
    name: "Mount a new-work box (nail-on)",
    unit: "each",
    reasoning:
      "Measure and mark the height; hold, drive two nails, check set-back for the drywall; knock out the openings needed.",
  },
  {
    key: "S02",
    name: "Mount a fan-rated box with brace",
    unit: "each",
    reasoning:
      "As a new-work box, plus fitting and screwing the brace between the joists.",
  },
  {
    key: "S03",
    name: "Prepare a cable end at a box",
    unit: "per cable end",
    reasoning:
      "Cut to length, strip the sheath, push it in, leave the tails folded for trim.",
  },
  {
    key: "S04",
    name: "Make up the grounds",
    unit: "each box",
    reasoning: "Strip, splice the grounds with a pigtail, fold back.",
  },
  {
    key: "S05",
    name: "Strip and terminate a device",
    unit: "each",
    reasoning:
      "Strip three conductors, form hooks or back-wire, tighten three screws and the ground screw.",
  },
  {
    key: "S06",
    name: "Extra: 3-way, 4-way or interconnect conductor",
    unit: "each",
    reasoning:
      "Identify the travelers or the interconnect, one more termination, keep the colors straight.",
  },
  {
    key: "S07",
    name: "Extra: GFCI",
    unit: "each",
    reasoning:
      "Find line and load, fold in a bulkier device, press test and reset.",
  },
  {
    key: "S08",
    name: "Extra: device with leads (dimmer, sensor)",
    unit: "each",
    reasoning:
      "Splice the pigtail leads with wire nuts instead of screw terminals.",
  },
  {
    key: "S09",
    name: "Fold in and set the device",
    unit: "each",
    reasoning:
      "Fold the conductors, screw the device in square, check it is flush.",
  },
  {
    key: "S10",
    name: "Plate or cover",
    unit: "each",
    reasoning: "One or two screws.",
  },
  {
    key: "S11",
    name: "Test",
    unit: "each",
    reasoning: "Plug tester, or operate it once.",
  },
  {
    key: "S12",
    name: 'Mount a 4" or 4-11/16" square box (bracket)',
    unit: "each",
    reasoning:
      "Stud bracket on, box on the bracket, set the depth for the ring, two screws each.",
  },
  {
    key: "S13",
    name: "Install a mud ring",
    unit: "each",
    reasoning: "Two screws.",
  },
  {
    key: "S14",
    name: "Cut and connect MC at a box",
    unit: "per cable end",
    reasoning: "Cut the armor, red-head on, connector on, locknut tight.",
  },
  {
    key: "S15",
    name: "Ground pigtail to the box",
    unit: "each",
    reasoning: "Green screw in the tapped hole, splice.",
  },
  {
    key: "S16",
    name: "Set a canless wafer",
    unit: "each",
    reasoning:
      "Locate and mark; cut the hole; connect at the wafer's junction box; push in and set the clips.",
  },
  {
    key: "S17",
    name: "Mount a fixture bracket",
    unit: "each",
    reasoning: "Two screws to the box, check it is level.",
  },
  {
    key: "S18",
    name: "Hang a surface fixture",
    unit: "each",
    reasoning:
      "Splice three conductors, hold and fasten the canopy, lamp or lens on.",
  },
  {
    key: "S19",
    name: "Assemble and hang a ceiling fan",
    unit: "each",
    reasoning:
      "Unbox; assemble downrod and canopy; hang and splice; blades and light kit; run it and balance it.",
  },
  {
    key: "S20",
    name: "Set a lay-in fixture in the grid",
    unit: "each",
    reasoning:
      "Lift the tile, set the fixture, square it in the grid, tile back.",
  },
  {
    key: "S21",
    name: "Hang a support wire to structure",
    unit: "each",
    reasoning:
      "Up the ladder, fasten to the deck or joist, wrap three turns, attach to the fixture or box.",
  },
  {
    key: "S22",
    name: "Grid clip",
    unit: "each",
    reasoning: "Snap it on, bend the tab.",
  },
  {
    key: "S23",
    name: "Connect a fixture whip (both ends)",
    unit: "each",
    reasoning:
      "Connector at the fixture and splice; connector at the box and splice.",
  },
  {
    key: "S24",
    name: "Install a troffer retrofit kit",
    unit: "each",
    reasoning:
      "Open the fixture; remove lens, lamps, ballast and sockets; mount the kit; splice the driver; close it.",
  },
  {
    key: "S25",
    name: "Convert a 2-lamp fixture to ballast bypass",
    unit: "each",
    reasoning:
      "Remove the ballast; change four lampholders to non-shunted; rewire line to the sockets; label the fixture; lamps in.",
  },
  {
    key: "S26",
    name: "Mount and connect an exit or emergency unit",
    unit: "each",
    reasoning:
      "Canopy to the ring, splice, connect the battery, hang the unit, press test.",
  },
  {
    key: "S27",
    name: "Hang a surface or suspended strip",
    unit: "each",
    reasoning:
      "Mark and fasten, or hang it on two wires; splice; lamp or lens.",
  },
  {
    key: "S28",
    name: "Remove a fixture and make it safe",
    unit: "each",
    reasoning:
      "Lift the tile or drop the fixture, disconnect, cap the conductors, move it out of the way.",
  },
  {
    key: "S29",
    name: "Remove a device and blank it",
    unit: "each",
    reasoning:
      "Plate and device off, cap the conductors, fold them in, blank plate on.",
  },
  {
    key: "S30",
    name: "Open and close the panel cover",
    unit: "per visit",
    reasoning: "Screws out, cover off, and back on.",
  },
  {
    key: "S31",
    name: "Snap in a breaker",
    unit: "each",
    reasoning: "Knock out the filler, snap the breaker on.",
  },
  {
    key: "S32",
    name: "Land a 1-pole circuit and label it",
    unit: "each",
    reasoning:
      "Route in the gutter, strip, land hot and neutral, ground to the bar, write the directory.",
  },
  {
    key: "S33",
    name: "Land a 2-pole circuit and label it",
    unit: "each",
    reasoning: "As a 1-pole circuit with a second hot and heavier conductors.",
  },
  {
    key: "S34",
    name: "Mount a box on an independent support",
    unit: "each",
    reasoning: "Box to the wire clip, level it.",
  },
  {
    key: "S35",
    name: "Make up a splice box",
    unit: "each",
    reasoning: "Splice through with four wire nuts, fold in.",
  },
  {
    key: "S36",
    name: "Set a smoke or CO head and test",
    unit: "each",
    reasoning: "Twist the head on, pull the tab, press test.",
  },
  {
    key: "S37",
    name: "Frame in a bath fan housing",
    unit: "each",
    reasoning:
      "Locate between the joists, fasten the housing, knock out for the cable.",
  },
  {
    key: "S38",
    name: "Duct and roof cap for a bath fan",
    unit: "each",
    reasoning:
      "Cut the roof, flash and seal the cap, run the flex duct, clamp both ends.",
  },
  {
    key: "S39",
    name: "Install a siding mounting block",
    unit: "each",
    reasoning: "Cut the siding opening, set and fasten the block, seal it.",
  },
  {
    key: "S40",
    name: "In-use cover",
    unit: "each",
    reasoning: "Gasket, base, lid, screws.",
  },
  {
    key: "S41",
    name: "Prepare a large cable end (#8 and up)",
    unit: "per cable end",
    reasoning: "Stiffer sheath, more to form, a bigger connector.",
  },
  {
    key: "S42",
    name: "Terminate a large receptacle (#6, 4-wire)",
    unit: "each",
    reasoning: "Strip four heavy conductors, form them, torque four lugs.",
  },
  {
    key: "S43",
    name: "Install a range or dryer cord on the appliance",
    unit: "each",
    reasoning:
      "Remove the terminal cover, strain relief, three or four terminals, cover back on.",
  },
  {
    key: "S44",
    name: "Mount an outdoor disconnect",
    unit: "each",
    reasoning:
      "Locate, level, four fasteners into the wall, knock out top or bottom.",
  },
  {
    key: "S45",
    name: "Land conductors in a disconnect",
    unit: "each",
    reasoning: "Line and load sides, and the ground.",
  },
  {
    key: "S46",
    name: "Install a condenser whip (both ends)",
    unit: "each",
    reasoning:
      "Connector into the disconnect and into the unit, land at both ends.",
  },
  {
    key: "S47",
    name: "Seal a penetration with duct seal",
    unit: "each",
    reasoning: "Press it in around the conductors.",
  },
];

/** One line of a starter's step list: a library step × count, or the cable step. */
export type StarterStepLine = { step: string; count: number } | { cable: true };

const s = (step: string, count = 1): StarterStepLine => ({ step, count });
const CABLE: StarterStepLine = { cable: true };

/** The steps every plain device box shares, in the order the work is done. */
const NM_DEVICE = [s("S01"), CABLE, s("S03", 2), s("S04"), s("S05")];
const NM_TRIM = [s("S09"), s("S10"), s("S11")];
const MC_DEVICE = [s("S12"), s("S13"), CABLE, s("S14", 2), s("S15"), s("S05")];
const PANEL_1P = [s("S30"), s("S31"), s("S32")];
const PANEL_2P = [s("S30"), s("S31"), s("S33")];
const LAY_IN = [s("S20"), s("S21", 2), s("S22", 4), s("S23"), s("S11")];

/**
 * The top 30 starters' step lists (plan § 11), by EXACT shipped name — a
 * starter renamed without updating this loses its list, and
 * server/starterLaborSteps.test.ts fails on any name that is not shipped.
 */
export const STARTER_ASSEMBLY_STEPS: Readonly<
  Record<string, readonly StarterStepLine[]>
> = {
  // ── Residential ──
  "Duplex receptacle standard": [...NM_DEVICE, ...NM_TRIM],
  "Single-pole switch": [...NM_DEVICE, ...NM_TRIM],
  'Wafer LED downlight, 6" (canless)': [CABLE, s("S03", 2), s("S16"), s("S11")],
  'Wafer LED downlight, 4" (canless)': [CABLE, s("S03", 2), s("S16"), s("S11")],
  "GFCI receptacle": [...NM_DEVICE, s("S07"), ...NM_TRIM],
  "3-way switch": [...NM_DEVICE, s("S06"), ...NM_TRIM],
  "Surface-mount ceiling fixture": [
    s("S12"),
    CABLE,
    s("S03", 2),
    s("S04"),
    s("S17"),
    s("S18"),
    s("S11"),
  ],
  "Dimmer switch": [...NM_DEVICE, s("S08"), ...NM_TRIM],
  "Combination smoke/CO detector": [...NM_DEVICE, s("S06"), s("S36")],
  "Ceiling fan standard": [
    s("S02"),
    CABLE,
    s("S03", 2),
    s("S04"),
    s("S19"),
    s("S11"),
  ],
  "Dedicated 20A receptacle": [...NM_DEVICE, ...NM_TRIM, ...PANEL_1P],
  "Bath exhaust fan wiring": [
    s("S37"),
    s("S38"),
    CABLE,
    s("S03", 2),
    s("S04"),
    s("S05"),
    s("S11"),
  ],
  "Outdoor GFCI receptacle, in-use cover": [
    s("S39"),
    ...NM_DEVICE,
    s("S07"),
    s("S09"),
    s("S40"),
    s("S11"),
  ],
  "Range receptacle, 50A": [
    s("S12"),
    CABLE,
    s("S41", 2),
    s("S42"),
    s("S10"),
    ...PANEL_2P,
    s("S43"),
  ],
  "HVAC condenser disconnect + whip": [
    s("S44"),
    CABLE,
    s("S03", 2),
    s("S45"),
    s("S46"),
    s("S47"),
    ...PANEL_2P,
  ],
  // ── Commercial ──
  "2x4 LED troffer, lay-in": LAY_IN,
  "Duplex receptacle, MC": [...MC_DEVICE, ...NM_TRIM],
  "Troffer LED retrofit kit": [s("S24"), s("S11")],
  "4 ft fluorescent to LED, ballast bypass (2-lamp)": [s("S25"), s("S11")],
  "Single-pole switch, MC": [...MC_DEVICE, ...NM_TRIM],
  "Emergency light / exit combo": [
    s("S12"),
    s("S13"),
    CABLE,
    s("S14", 2),
    s("S26"),
  ],
  "Exit sign": [s("S12"), s("S13"), CABLE, s("S14", 2), s("S26")],
  "Demo lay-in fixture, make safe above ceiling": [s("S28"), s("S10")],
  "Junction box above lay-in ceiling": [
    s("S21"),
    s("S34"),
    s("S15"),
    s("S35"),
    s("S10"),
  ],
  "GFCI receptacle, MC": [...MC_DEVICE, s("S07"), ...NM_TRIM],
  "2x2 LED troffer, lay-in": LAY_IN,
  "Wall occupancy sensor, MC": [...MC_DEVICE, s("S08"), ...NM_TRIM],
  "Demo device, blank plate": [s("S29")],
  "4 ft LED strip, surface / suspended": [
    s("S27"),
    s("S21", 2),
    s("S23"),
    s("S11"),
  ],
  "Breaker add, single-pole": PANEL_1P,
};
