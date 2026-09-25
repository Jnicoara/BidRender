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
      "fluorescent t8": added 2026-09-25. A plan still says "4' fluorescent
      strip", and this is what gets bought for it — so "fluorescent" found
      NOTHING in the whole catalog until now (the shared ALIAS_MAP knew the
      word but every term it pointed at was missing). Flagged for the owner:
      it is the LED replacement, not a fluorescent fixture.
    */
    "fluorescent t8"
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

export const LIGHTING: BaselineMaterial[] = [
  ...recessed,
  ...linear,
  ...track,
  ...underCabinet,
  ...poles,
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
