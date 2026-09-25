/**
 * Lighting and the hardware that hangs it.
 *
 * Fixtures are generic on purpose. A shipped catalog cannot know whether a job
 * takes a 3000K or 4000K wafer, and a row that pretends to be a specific part
 * number is worse than one the estimator prices from their own quote — so these
 * are named by what they are and what size, and nothing else.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const fixture = {
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category: "Lighting Hardware" as const,
};

/**
 * Two sizes, not three. A wafer sold as 5"/6" fits either trim opening — that
 * is the whole point of the size — so a separate 6" row was the same product
 * listed twice, and an estimator picking between them would be choosing
 * between a part and itself.
 *
 * Written 5"/6" rather than 5/6" so the leading measurement is a real 5 inches;
 * "5/6" reads as the fraction five-sixths to anything parsing sizes, which put
 * it below the 4" wafer in the size order.
 */
const recessed: BaselineMaterial[] = [
  { size: '4"', slang: "4 four" },
  { size: '5"/6"', slang: "5 6 five six 5/6" },
].map(({ size, slang }) => ({
  ...fixture,
  name: `${size} wafer LED downlight`,
  searchAliases: aliases(
    slang,
    "recessed can pot light slim canless retrofit trim housing"
  ),
}));

const linear: BaselineMaterial[] = ["4 ft", "8 ft"].map(length => ({
  ...fixture,
  name: `${length} LED strip fixture`,
  searchAliases: aliases(
    length.replace(" ", ""),
    length.startsWith("4") ? "four foot 48" : "eight foot 96",
    "shop light linear wrap industrial surface tube",
    /*
      "fluorescent": added 2026-09-25. A plan still says "4' fluorescent
      strip", and this is what gets bought for it — so "fluorescent" found
      NOTHING in the whole catalog until then (the shared ALIAS_MAP knew the
      word but every term it pointed at was missing). It is the LED
      replacement, not a fluorescent fixture.

      "t8" was here too, and came out the same day, when real T8 tubes joined
      the catalog (see `tubes` below): a strip FIXTURE answering "t8" beside
      the tubes the word actually names is an accessory-style alias competing
      with the product (CLAUDE.md § Materials).
    */
    "fluorescent"
  ),
}));

/**
 * Track is sold by the section, and the section does not light anything — the
 * heads are bought separately and counted separately, usually several per
 * section. A takeoff that lists only track has priced the rail and forgotten
 * the fixtures, which is most of the cost.
 */
const TRACK_LENGTH_SLANG: Record<string, string> = {
  "4 ft": "four foot 48",
  "6 ft": "six foot 72",
  "8 ft": "eight foot 96",
};

const track: BaselineMaterial[] = [
  ...["4 ft", "6 ft", "8 ft"].map(length => ({
    ...fixture,
    name: `${length} lighting track`,
    searchAliases: aliases(
      length.replace(" ", ""),
      TRACK_LENGTH_SLANG[length],
      "rail section monorail retail accent halo juno"
    ),
    description: "The rail only — heads are a separate item.",
  })),
  {
    ...fixture,
    name: "Track light head",
    searchAliases: aliases(
      "fixture lamp holder gimbal spot can par gu10 accent rail"
    ),
    // Several heads to a section is the normal case, so the builder should not
    // start at one and make the estimator correct it every time.
    defaultQty: 4,
  },
];

/**
 * Two different products under one heading. A bar fixture is a rigid unit cut
 * to a cabinet run and bought per fixture; tape is a continuous reel cut to
 * length on site and bought by the foot. Pricing one as the other is wrong by
 * an order of magnitude either way, so they are separate rows with separate
 * units of sale.
 */
const underCabinet: BaselineMaterial[] = [
  ...['12"', '18"', '24"', '36"'].map(length => ({
    ...fixture,
    name: `${length} under-cabinet light bar`,
    searchAliases: aliases(
      length.replace('"', ""),
      "undercabinet under counter kitchen puck linkable led task hardwired"
    ),
    description: "Rigid bar fixture, sold per unit.",
  })),
  {
    ...fixture,
    name: "LED tape light",
    // By the foot: a reel is cut to the run, so footage is what gets taken off.
    // The standard 16.4 ft reel is 5 metres, which is why the number is odd —
    // it is aliased so someone searching the reel length still lands here.
    unitOfSale: "foot",
    searchAliases: aliases(
      "strip ribbon rope reel 16.4 5m cove undercabinet under cabinet cuttable dimmable"
    ),
    description: "Sold by the foot. A standard reel is 16.4 ft (5 m).",
  },
];

const poles: BaselineMaterial[] = ["12 ft", "20 ft", "30 ft"].map(height => ({
  ...fixture,
  name: `${height} light pole`,
  searchAliases: aliases(
    height.replace(" ", ""),
    "parking lot site square round steel aluminum base anchor bolt exterior"
  ),
}));

/*
  ── LED linear tubes ──────────────────────────────────────────────────────────
  Added 2026-09-25 from the lighting audit; the catalog had no tube, no lamp and
  no ballast item at all.

  The install type is in the NAME, after the tube, the way a breaker states its
  pole count — because it is the one thing that decides whether the fixture
  gets rewired, and a ballast-compatible tube on a job priced for bypass (or
  the reverse) is a wrong labour number:
    ballast compatible  works on the existing ballast, no rewiring ("Type A",
                        "plug and play").
    ballast bypass      ballast removed, line voltage to the sockets ("Type B").

  ── "ballast compatible", not "plug-and-play", and why ─────────────────────
  First written "plug-and-play". The standard search sweep caught it at once:
  "plug" is what an electrician calls a receptacle, a word in a NAME outranks
  an alias, and "plug" led with two LED tubes instead of Duplex receptacle.
  "ballast compatible" is the same product's other trade name, reads as the
  opposite of "ballast bypass" — which is the whole distinction — and keeps
  "plug and play" findable as an alias, where it cannot outrank anything.

  T12 has NO rows of its own, deliberately. An LED "T8" tube fits the same G13
  sockets, and a T12 magnetic ballast will not run a ballast-compatible tube —
  so a T12 retrofit IS a ballast-bypass tube. "t12" is an alias on the bypass
  rows and on neither ballast-compatible row.

  Not carried, by decision (2026-09-25): 3 ft and 5 ft (F25T8 / F40T8 — real,
  uncommon), 8 ft ballast compatible (rare), hybrid A+B tubes, 2 ft U-bends. Add
  them here when a job asks for them.
*/
const TUBE_FEET: Record<string, string> = {
  "2 ft": "2ft two foot 24 f17t8",
  "4 ft": "4ft four foot 48 f32t8",
};
const tubes: BaselineMaterial[] = [
  ...Object.entries(TUBE_FEET).map(([length, slang]) => ({
    ...fixture,
    name: `${length} LED T8 tube, ballast compatible`,
    searchAliases: aliases(
      slang,
      "type a plug and play instant fit direct replacement fluorescent lamp g13 bipin"
    ),
  })),
  ...Object.entries(TUBE_FEET).map(([length, slang]) => ({
    ...fixture,
    name: `${length} LED T8 tube, ballast bypass`,
    searchAliases: aliases(
      slang,
      "type b direct wire ballast free single ended double ended t12 fluorescent lamp g13 bipin"
    ),
  })),
  {
    ...fixture,
    name: "8 ft LED T8 tube, ballast bypass, single-pin",
    searchAliases: aliases(
      "8ft eight foot 96 f96t8 f96t12 slimline fa8 type b direct wire ballast free t12 fluorescent lamp"
    ),
  },
  {
    ...fixture,
    // "T8" in the name although it replaces a T12 HO: the LED tube itself is
    // T8-sized, and the name keeps it on the shelf beside the other tubes.
    name: "8 ft LED T8 tube, ballast bypass, HO",
    searchAliases: aliases(
      "8ft eight foot 96 high output f96t12ho f96t8ho r17d recessed double contact type b direct wire ballast free t12 fluorescent lamp"
    ),
  },
  {
    // Single-ended bypass tubes need line and neutral on separate pins at one
    // end, which a shunted socket shorts together — so a bypass retrofit on a
    // fixture with shunted sockets buys these as well.
    ...fixture,
    name: "Non-shunted lampholder",
    searchAliases: aliases("tombstone socket unshunted g13 bypass retrofit"),
  },
];

/*
  ── Promoted from the pricing sheet, 2026-09-25 ───────────────────────────────
  These were on pricing/buildPricingSheet.mts as NEW rows, where the live
  search could not reach them — the same gap the 2-pole breakers had. The set
  is the curated one agreed in the lighting audit: troffers, vapor tights, the
  vanity bar, and recessed cans at the two sizes that do most of the work.
  Names are exactly the sheet's, so the sheet now meets them as shipped rows.
*/
const troffers: BaselineMaterial[] = ["1x4", "2x2", "2x4"].map(size => ({
  ...fixture,
  name: `${size} LED troffer`,
  searchAliases: aliases(
    size.replace("x", " x "),
    "lay in drop ceiling grid recessed flat panel edge lit lithonia"
  ),
}));

const vaporTight: BaselineMaterial[] = [
  { length: "4 ft", slang: "4ft four foot 48" },
  { length: "8 ft", slang: "8ft eight foot 96" },
].map(({ length, slang }) => ({
  ...fixture,
  name: `${length} vapor tight fixture`,
  searchAliases: aliases(
    slang,
    "vaportight vapour wet location gasketed enclosed garage car wash parking cold storage linear led"
  ),
}));

/**
 * Six can types at 4" and 6" — the curated sizes. The sheet also lists 3" and
 * 5"; those stay there until a job asks.
 */
const CAN_TYPES: { type: string; slang: string }[] = [
  { type: "new construction IC", slang: "new work insulation contact rated" },
  { type: "new construction non-IC", slang: "new work non ic" },
  { type: "remodel IC", slang: "old work retrofit insulation contact rated" },
  { type: "remodel non-IC", slang: "old work retrofit non ic" },
  {
    type: "airtight shallow",
    slang: "air tight at ic energy code low profile",
  },
  { type: "sloped ceiling", slang: "vaulted pitched angled slope" },
];
const cans: BaselineMaterial[] = ['4"', '6"'].flatMap(size =>
  CAN_TYPES.map(({ type, slang }) => ({
    ...fixture,
    name: `${size} recessed can, ${type}`,
    searchAliases: aliases(
      size === '4"' ? "4 four" : "6 six",
      "pot light housing downlight",
      slang,
      "halo juno"
    ),
  }))
);

/**
 * The LED module that goes INTO an existing can — the most common downlight
 * job on a remodel, and missing until now. 5"/6" as one row, for the reason
 * `recessed` gives above.
 */
const retrofitTrims: BaselineMaterial[] = [
  { size: '4"', slang: "4 four rl4" },
  { size: '5"/6"', slang: "5 6 five six 5/6 rl56" },
].map(({ size, slang }) => ({
  ...fixture,
  name: `${size} LED retrofit trim`,
  searchAliases: aliases(
    slang,
    "can recessed baffle module pot light upgrade downlight halo"
  ),
}));

/*
  The shipped "Wall pack" stays the standard one — renaming a shipped row is
  a RENAMED_BASELINE_MATERIALS job, and it is already the size most jobs buy.
  These sit beside it for the small, the big and the dark-sky kind.
*/
const wallPacks: BaselineMaterial[] = [
  { name: "Wall pack, mini", slang: "small compact entry door" },
  { name: "Wall pack, large", slang: "high output big" },
  { name: "Wall pack, full cutoff", slang: "dark sky fco cut off downward" },
].map(({ name, slang }) => ({
  ...fixture,
  name,
  searchAliases: aliases(
    slang,
    "wallpack exterior building mounted security led outdoor lithonia rab"
  ),
}));

const vanities: BaselineMaterial[] = [
  { name: "Vanity light bar", slang: "linear led" },
  ...["1", "2", "3", "4"].map(n => ({
    name: `Vanity light, ${n}-light`,
    slang: "",
  })),
].map(({ name, slang }) => ({
  ...fixture,
  name,
  searchAliases: aliases(slang, "bath bathroom mirror wall fixture"),
}));

const securityLights: BaselineMaterial[] = [
  {
    name: "LED security light, motion-activated, 2-head",
    slang: "pir sensor twin double head flood",
  },
  {
    name: "LED security light, motion-activated, 3-head",
    slang: "pir sensor triple head flood",
  },
  {
    name: "LED security light, dusk-to-dawn",
    // Not "photocell": that is another shipped material, and this must not
    // compete with it (materialsCatalog.test.ts, alias hygiene).
    slang: "dusk dawn barn yard area flood",
  },
].map(({ name, slang }) => ({
  ...fixture,
  name,
  searchAliases: aliases(slang, "outdoor exterior"),
}));

/*
  ── Lamps ─────────────────────────────────────────────────────────────────────
  Screw-in and pin-based LED replacements. Named by the lamp's shape code, which
  is how they are ordered; the everyday name and base go in the aliases.
*/
const lamps: BaselineMaterial[] = [
  {
    name: "LED A19 bulb, 60W equivalent",
    slang: "lamp screw in e26 medium base household standard 800 lumen",
  },
  {
    name: "LED A21 bulb, 100W equivalent",
    slang: "lamp screw in e26 medium base household 1600 lumen",
  },
  {
    name: "LED BR30 flood bulb",
    slang: "lamp reflector recessed can e26 65 watt equivalent",
  },
  {
    name: "LED BR40 flood bulb",
    slang: "lamp reflector recessed can e26 85 watt equivalent",
  },
  { name: "LED PAR20 bulb", slang: "lamp spot flood reflector e26 track" },
  { name: "LED PAR30 bulb", slang: "lamp spot flood reflector e26 track" },
  {
    name: "LED PAR38 bulb",
    slang: "lamp spot flood reflector e26 outdoor security",
  },
  // No "ceiling fan" or "high bay" here: both are other shipped materials, and
  // a lamp answering to them would compete with the fixture the word names.
  {
    name: "LED candelabra bulb, E12",
    slang: "lamp chandelier torpedo flame tip b10 b11 small base",
  },
  { name: "LED G25 globe bulb", slang: "lamp round vanity e26" },
  {
    name: "LED corn bulb, E26",
    slang: "lamp hid replacement retrofit medium base",
  },
  {
    name: "LED corn bulb, E39",
    slang: "lamp hid replacement retrofit mogul metal halide hps",
  },
  {
    name: "LED PL-pin lamp, G24",
    slang: "cfl pin plug in 2 pin 4 pin g24q g24d gx24 downlight",
  },
].map(({ name, slang }) => ({
  ...fixture,
  name,
  searchAliases: aliases(slang, "philips cree feit"),
}));

export const LIGHTING: BaselineMaterial[] = [
  ...recessed,
  ...linear,
  ...track,
  ...underCabinet,
  ...poles,
  ...tubes,
  ...troffers,
  ...vaporTight,
  ...cans,
  ...retrofitTrims,
  ...wallPacks,
  ...vanities,
  ...securityLights,
  ...lamps,
  {
    ...fixture,
    name: "Surface-mount ceiling fixture",
    searchAliases: aliases("flush mount drum dome closet utility round led"),
  },
  {
    ...fixture,
    name: "Wall pack",
    searchAliases: aliases(
      "wallpack exterior building mounted security dusk dawn led outdoor"
    ),
  },
  {
    ...fixture,
    name: "Flood light",
    searchAliases: aliases(
      "floodlight security exterior knuckle mount aimable led outdoor"
    ),
  },
  {
    ...fixture,
    name: "High bay",
    searchAliases: aliases(
      "highbay ufo warehouse shop ceiling industrial led linear"
    ),
  },
  {
    ...fixture,
    name: "Exit sign",
    searchAliases: aliases(
      "egress emergency running man red green led battery backup"
    ),
  },
  {
    ...fixture,
    name: "Emergency light",
    searchAliases: aliases(
      "egress bug eye battery backup unit equipment twin head"
    ),
  },
  {
    ...fixture,
    name: "Bollard light",
    searchAliases: aliases(
      "path walkway landscape site short pole exterior led"
    ),
  },
  {
    ...fixture,
    name: "Ceiling fan",
    searchAliases: aliases(
      "paddle fan blade downrod flush mount bedroom porch"
    ),
  },
  {
    ...fixture,
    name: "Fixture mounting bracket",
    searchAliases: aliases(
      "bar hanger crossbar cross strap stud hickey saddle"
    ),
  },
  {
    ...fixture,
    name: "6ft MC whip",
    searchAliases: aliases(
      "fixture light 6 foot flex armored metal clad pigtail greenfield"
    ),
  },
];
