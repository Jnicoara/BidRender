/**
 * Symbol guide — "what it is / how it's usually bid"
 * (references/plan-reading-help-plan.md § 3).
 *
 * ── DRAFT — NEEDS THE OWNER'S REVIEW BEFORE BETA (§ 9 Q5) ───────────────────
 * Drafted by Track B on 2026-10-13, under the same rule as the abbreviation
 * list: B drafts, the owner reads every line before a beta user sees it.
 * `SYMBOLS_REVIEW` says where it stands.
 *
 * ── Rules for an entry ──────────────────────────────────────────────────────
 * - **The picture is the COMMON way it is drawn**, never "the" way: every
 *   card says "Drawn differently on every set — this set's legend wins".
 *   Pictures are a few shapes on a 32 x 32 grid, drawn to read at 32 px —
 *   the size they ship at, not the size they were drawn at.
 * - **"How it's usually bid" is words, never numbers** (§ 9 Q6): no hours,
 *   no prices, no digits at all. `server/planHelpSymbols.test.ts` fails on
 *   a digit.
 * - **`count` is the thing "Count these" counts** (§ 9 Q11): an ordinary
 *   count, level 1, no assembly asked for, named in the PLURAL by
 *   `countName` ("Duplex receptacles"). The plural is what a count is, and
 *   it keeps the name off the catalog's retired spellings — "Duplex
 *   receptacle" is itself an old name of "15A duplex receptacle"
 *   (RENAMED_BASELINE_MATERIALS). Things bought by the foot have no
 *   `count` — they are traced, not counted.
 * - Keyed by `trade` from day one.
 */
import type { TradeId } from "../trades";

export const SYMBOLS_REVIEW = {
  status: "draft" as "draft" | "reviewed",
  note: "Draft - needs the owner's review before beta (plan-reading-help-plan.md § 9 Q5).",
};

/** One shape on the 32 x 32 grid. Stroked in the text colour. */
export type SymbolShape =
  | { circle: [cx: number, cy: number, r: number]; fill?: boolean }
  | { line: [x1: number, y1: number, x2: number, y2: number]; dash?: boolean }
  | { rect: [x: number, y: number, w: number, h: number]; fill?: boolean }
  | { path: string; fill?: boolean }
  | { text: [x: number, y: number, words: string]; size?: number };

export type PlanSymbol = {
  trade: TradeId;
  /** What it is called — the card's heading. */
  name: string;
  /** The names it goes by on a job and at the counter. */
  aka: string[];
  picture: SymbolShape[];
  whatItIs: string;
  /** Counted each or measured by the foot, and the usual pieces. Words only. */
  howBid: string;
  /** The marks beside it that change what it is. */
  lookOutFor: string[];
  /** The one thing counted, singular. None: traced, not counted. */
  count?: string;
};

/**
 * The name "Count these" starts a plain count under: the counted thing in
 * the plural. Null for a symbol that is traced rather than counted.
 */
export function countName(symbol: PlanSymbol): string | null {
  if (!symbol.count) return null;
  const c = symbol.count;
  return /(s|x|ch|sh)$/i.test(c) ? `${c}es` : `${c}s`;
}

const E = "electrical";

// Pieces several pictures share.
const DUPLEX: SymbolShape[] = [
  { circle: [16, 13, 6] },
  { line: [7, 10.5, 25, 10.5] },
  { line: [7, 15.5, 25, 15.5] },
];
const DUPLEX_MID: SymbolShape[] = [
  { circle: [16, 16, 7] },
  { line: [6, 13, 26, 13] },
  { line: [6, 19, 26, 19] },
];

export const PLAN_SYMBOLS: readonly PlanSymbol[] = [
  // ── Receptacles ─────────────────────────────────────────────────────────
  {
    trade: E,
    name: "Duplex receptacle",
    aka: ["plug", "outlet", "duplex", "recep"],
    picture: DUPLEX_MID,
    whatItIs: "An ordinary wall plug with two outlets.",
    howBid:
      "Counted each: a box, the device, a plate, and wire to the next device on the circuit.",
    lookOutFor: [
      "GFI or GFCI — a ground-fault device",
      "WP — weatherproof cover",
      'A height like +48" — not at the usual height',
      "A small number — its circuit",
      "(E) — existing, nothing new",
    ],
    count: "Duplex receptacle",
  },
  {
    trade: E,
    name: "Quad receptacle",
    aka: ["fourplex", "quad", "double duplex", "4-plex"],
    picture: [
      { circle: [10, 16, 5] },
      { circle: [22, 16, 5] },
      { line: [3, 13, 29, 13] },
      { line: [3, 19, 29, 19] },
    ],
    whatItIs: "Two duplex receptacles side by side under one plate.",
    howBid:
      "Counted each: a two-gang box, two devices, a two-gang plate, and wire.",
    lookOutFor: ["A circuit number — sometimes each half is on its own"],
    count: "Quad receptacle",
  },
  {
    trade: E,
    name: "GFCI receptacle",
    aka: ["gfi", "gfci", "ground fault plug"],
    picture: [...DUPLEX, { text: [16, 29, "GFI"], size: 8 }],
    whatItIs:
      "A receptacle with ground-fault protection built in. Required near water, outdoors, in garages and kitchens.",
    howBid:
      "Counted each, like a duplex but with a GFCI device. One GFCI can protect the plugs after it on the circuit — the notes may say to use it that way.",
    lookOutFor: ["WP as well — outdoors", "A note saying GFCI breaker instead"],
    count: "GFCI receptacle",
  },
  {
    trade: E,
    name: "Weatherproof receptacle",
    aka: ["wp plug", "outdoor plug", "exterior receptacle"],
    picture: [...DUPLEX, { text: [16, 29, "WP"], size: 8 }],
    whatItIs: "A receptacle outdoors or in a wet spot.",
    howBid:
      "Counted each: a weather-resistant GFCI device, an in-use cover, and a box made for outdoors.",
    lookOutFor: ["GFI — almost always, outdoors", "A height above grade"],
    count: "Weatherproof receptacle",
  },
  {
    trade: E,
    name: "Special-purpose receptacle",
    aka: ["range plug", "dryer plug", "welder plug", "240v plug", "power plug"],
    picture: [
      { circle: [16, 16, 8] },
      { path: "M16 10 L21.5 20 L10.5 20 Z", fill: true },
    ],
    whatItIs:
      "A receptacle for one big appliance or machine — a range, a dryer, a welder.",
    howBid:
      "Counted each, with its own circuit back to the panel. The device and plate match the plug type, which the schedule or a note names.",
    lookOutFor: [
      "A NEMA plug type or an amp rating beside it",
      "A letter tag pointing to an equipment schedule",
    ],
    count: "Special-purpose receptacle",
  },
  {
    trade: E,
    name: "Floor receptacle",
    aka: ["floor plug", "floor outlet"],
    picture: [{ rect: [3, 3, 26, 26] }, ...DUPLEX_MID],
    whatItIs: "A receptacle set in the floor.",
    howBid:
      "Counted each: a floor box and its cover instead of a wall box, and usually conduit under the slab or a poke-through.",
    lookOutFor: ["F beside a plain plug symbol means the same thing"],
    count: "Floor receptacle",
  },

  // ── Switches and controls ───────────────────────────────────────────────
  {
    trade: E,
    name: "Single-pole switch",
    aka: ["switch", "light switch", "toggle"],
    picture: [{ text: [16, 23, "S"], size: 20 }],
    whatItIs: "A light switch that works a light from one place.",
    howBid:
      "Counted each: a box, the switch, a plate, and the switch leg to the lights it works.",
    lookOutFor: [
      "A small letter — which lights it switches",
      "A number after the S — a three-way or four-way",
    ],
    count: "Single-pole switch",
  },
  {
    trade: E,
    name: "Three-way switch",
    aka: ["3 way", "3-way", "three way", "s3"],
    picture: [
      { text: [13, 23, "S"], size: 20 },
      { text: [25, 28, "3"], size: 10 },
    ],
    whatItIs:
      "One of a pair of switches that work the same light from two places.",
    howBid:
      "Counted each, and they come in pairs: a three-way device each end, with the extra wire between them.",
    lookOutFor: ["A four-way between two three-ways — three places"],
    count: "Three-way switch",
  },
  {
    trade: E,
    name: "Four-way switch",
    aka: ["4 way", "4-way", "four way", "s4"],
    picture: [
      { text: [13, 23, "S"], size: 20 },
      { text: [25, 28, "4"], size: 10 },
    ],
    whatItIs: "The middle switch when a light works from three or more places.",
    howBid:
      "Counted each: always between two three-ways, with the extra wire through it.",
    lookOutFor: ["The two three-ways that go with it"],
    count: "Four-way switch",
  },
  {
    trade: E,
    name: "Dimmer switch",
    aka: ["dimmer", "sd"],
    picture: [
      { text: [13, 23, "S"], size: 20 },
      { text: [25, 28, "D"], size: 10 },
    ],
    whatItIs: "A switch that dims the lights.",
    howBid:
      "Counted each: a dimmer rated for the fixture type it runs — LED dimmers differ.",
    lookOutFor: ["A note naming the dimmer or a lighting control system"],
    count: "Dimmer switch",
  },
  {
    trade: E,
    name: "Occupancy sensor",
    aka: ["motion sensor", "occ sensor", "os", "vacancy sensor"],
    picture: [{ circle: [16, 16, 11] }, { text: [16, 20, "OS"], size: 10 }],
    whatItIs:
      "Turns lights on when someone comes in and off after they leave. On the ceiling or in place of a wall switch.",
    howBid:
      "Counted each: the sensor, often a power pack, and low-voltage wire between them.",
    lookOutFor: [
      "A wall-switch version drawn as S with OS",
      "VS — vacancy: on by hand, off by itself",
    ],
    count: "Occupancy sensor",
  },
  {
    trade: E,
    name: "Time clock",
    aka: ["timer", "tc", "time switch"],
    picture: [
      { circle: [16, 16, 11] },
      { line: [16, 16, 16, 9] },
      { line: [16, 16, 21, 19] },
    ],
    whatItIs: "Switches lights or equipment on a schedule.",
    howBid: "Counted each: the clock, a box or enclosure, and its circuits.",
    lookOutFor: ["A contactor with it, for many circuits at once"],
    count: "Time clock",
  },
  {
    trade: E,
    name: "Lighting contactor",
    aka: ["contactor", "lc"],
    picture: [{ rect: [5, 6, 22, 20] }, { text: [16, 21, "LC"], size: 11 }],
    whatItIs:
      "A big relay that switches many lighting circuits at once, usually from a time clock or photocell.",
    howBid:
      "Counted each: the contactor in its enclosure, and the circuits through it.",
    lookOutFor: ["How many poles — how many circuits it carries"],
    count: "Lighting contactor",
  },

  // ── Light fixtures ──────────────────────────────────────────────────────
  {
    trade: E,
    name: "2x4 troffer",
    aka: ["troffer", "lay-in", "2 by 4", "2x4 light", "flat panel"],
    picture: [{ rect: [3, 9, 26, 14] }, { line: [3, 9, 29, 23] }],
    whatItIs: "A rectangular light that lays into a drop ceiling grid.",
    howBid:
      "Counted each, by fixture type tag: the fixture (often priced by a supplier as a package), a whip, and wire to the next fixture.",
    lookOutFor: [
      "The type letter beside it — the fixture schedule names it",
      "EM or a shaded part — on battery or an emergency circuit",
    ],
    count: "2x4 troffer",
  },
  {
    trade: E,
    name: "2x2 troffer",
    aka: ["2 by 2", "2x2 light", "square troffer"],
    picture: [{ rect: [7, 7, 18, 18] }, { line: [7, 7, 25, 25] }],
    whatItIs: "A square light that lays into a drop ceiling grid.",
    howBid:
      "Counted each, by fixture type tag, with a whip and wire to the next fixture.",
    lookOutFor: ["The type letter", "EM — emergency"],
    count: "2x2 troffer",
  },
  {
    trade: E,
    name: "Downlight",
    aka: ["can", "can light", "recessed light", "pot light", "high hat"],
    // Two rings, never a ring and a dot: that is "conduit turning up".
    picture: [{ circle: [16, 16, 9] }, { circle: [16, 16, 5] }],
    whatItIs: "A small round light recessed into the ceiling.",
    howBid:
      "Counted each, by fixture type tag: the fixture or housing and trim, and wire to the next one.",
    lookOutFor: [
      "The type letter",
      "IC or a fire-rated ceiling — a rated housing",
    ],
    count: "Downlight",
  },
  {
    trade: E,
    name: "Ceiling fixture",
    aka: ["ceiling light", "surface light", "light"],
    picture: [
      { circle: [16, 16, 10] },
      { line: [9, 9, 23, 23] },
      { line: [23, 9, 9, 23] },
    ],
    whatItIs: "A light mounted on the ceiling surface.",
    howBid:
      "Counted each: a ceiling box, the fixture, and wire to the switch or next fixture.",
    lookOutFor: ["The type letter beside it"],
    count: "Ceiling fixture",
  },
  {
    trade: E,
    name: "Strip light",
    aka: ["strip", "linear", "wraparound", "shop light", "4 ft strip"],
    picture: [{ rect: [2, 13, 28, 6] }],
    whatItIs: "A long narrow light, surface mounted or hung.",
    howBid:
      "Counted each, by fixture type tag; a continuous row may be priced by the foot — the schedule says.",
    lookOutFor: ["A row drawn as one long bar — count the fixtures in it"],
    count: "Strip light",
  },
  {
    trade: E,
    name: "Wall pack",
    aka: ["wallpack", "outdoor wall light", "building light"],
    picture: [
      { line: [7, 4, 7, 28] },
      { path: "M7 9 L19 11 L19 21 L7 23 Z", fill: true },
    ],
    whatItIs: "A light mounted on an outside wall, lighting the ground.",
    howBid:
      "Counted each: the fixture, a weatherproof box or back box, and wire, usually on a photocell or time clock.",
    lookOutFor: ["A mounting height", "PC — has its own photocell"],
    count: "Wall pack",
  },
  {
    trade: E,
    name: "Exit sign",
    aka: ["exit", "exit light"],
    picture: [{ rect: [3, 9, 26, 14] }, { text: [16, 20, "EXIT"], size: 9 }],
    whatItIs: "A lit EXIT sign over a way out.",
    howBid:
      "Counted each: the sign (usually with a battery), a box, and wire from an unswitched circuit.",
    lookOutFor: [
      "Arrows or shaded faces — which way it points, one or two faces",
      "A combination exit and emergency light",
    ],
    count: "Exit sign",
  },
  {
    trade: E,
    name: "Emergency light",
    aka: ["bug eye", "bug eyes", "emergency unit", "battery light", "em light"],
    picture: [
      { rect: [7, 16, 18, 9] },
      { circle: [11, 12, 3.5] },
      { circle: [21, 12, 3.5] },
    ],
    whatItIs: "A battery light with two heads that comes on when power fails.",
    howBid:
      "Counted each: the unit, a box, and wire from an unswitched circuit.",
    lookOutFor: ["A remote head drawn on its own, wired back to this unit"],
    count: "Emergency light",
  },
  {
    trade: E,
    name: "Pole light",
    aka: ["site light", "parking lot light", "area light", "pole"],
    picture: [
      { rect: [12, 20, 8, 8], fill: true },
      { line: [16, 20, 16, 8] },
      { rect: [16, 5, 12, 5] },
    ],
    whatItIs: "A light on a pole, for a parking lot or site.",
    howBid:
      "Counted each: the pole, the head, a base (often by others — check), a handhole, and wire in conduit underground between poles.",
    lookOutFor: [
      "One head or two, drawn as one or two arms",
      "A note on who pours the base",
    ],
    count: "Pole light",
  },
  {
    trade: E,
    name: "Ceiling fan",
    aka: ["fan"],
    picture: [
      { circle: [16, 16, 3.5], fill: true },
      { line: [16, 16, 7, 7] },
      { line: [16, 16, 25, 7] },
      { line: [16, 16, 7, 25] },
      { line: [16, 16, 25, 25] },
    ],
    whatItIs: "A ceiling fan, often with a light.",
    howBid:
      "Counted each: a fan-rated box, the fan (often owner furnished — check), and wire, sometimes a separate switch for the light.",
    lookOutFor: ["OFCI or by owner — install only"],
    count: "Ceiling fan",
  },

  // ── Boxes ───────────────────────────────────────────────────────────────
  {
    trade: E,
    name: "Junction box",
    aka: ["j box", "jbox", "jb", "box"],
    picture: [{ circle: [16, 16, 10] }, { text: [16, 21, "J"], size: 14 }],
    whatItIs: "A box where wires are spliced or a connection is made.",
    howBid: "Counted each: the box, a cover, and connectors.",
    lookOutFor: ["A note saying what it feeds — often equipment by others"],
    count: "Junction box",
  },
  {
    trade: E,
    name: "Floor box",
    aka: ["floorbox", "fb", "floor outlet box"],
    picture: [{ rect: [5, 5, 22, 22] }, { rect: [10, 10, 12, 12] }],
    whatItIs: "A box set in the floor, often with power and data in one cover.",
    howBid:
      "Counted each: the box and its cover, the devices in it, and conduit under the slab or a poke-through.",
    lookOutFor: ["Power and data in one box — two systems to price"],
    count: "Floor box",
  },

  // ── Equipment ───────────────────────────────────────────────────────────
  {
    trade: E,
    name: "Panelboard",
    aka: ["panel", "breaker panel", "load center", "pnl"],
    picture: [{ rect: [3, 11, 26, 10], fill: true }],
    whatItIs:
      "A breaker panel. Filled in usually means flush in the wall; outlined means surface mounted.",
    howBid:
      "Counted each: the panel and its breakers from the panel schedule, and the feeder to it, which is traced.",
    lookOutFor: [
      "Its name — find its panel schedule",
      "(E) — existing panel, new breakers only",
    ],
    count: "Panelboard",
  },
  {
    trade: E,
    name: "Disconnect switch",
    aka: ["disconnect", "safety switch", "disc", "knife switch"],
    picture: [{ rect: [6, 6, 20, 20] }, { line: [9, 23, 23, 9] }],
    whatItIs: "A switch that cuts power to one piece of equipment.",
    howBid:
      "Counted each: the disconnect, fused or not, sized from the equipment; check whether the equipment brings its own.",
    lookOutFor: ["A size and fuse note", "NF — non-fused", "3R — outdoors"],
    count: "Disconnect switch",
  },
  {
    trade: E,
    name: "Motor connection",
    aka: ["motor", "m"],
    picture: [{ circle: [16, 16, 10] }, { text: [16, 21, "M"], size: 13 }],
    whatItIs: "A motor you connect power to — a pump, a fan.",
    howBid:
      "Counted each: the connection with flexible conduit, and often a disconnect and starter beside it.",
    lookOutFor: ["HP or a tag pointing to the equipment schedule"],
    count: "Motor connection",
  },
  {
    trade: E,
    name: "Transformer",
    aka: ["xfmr", "xformer"],
    picture: [{ rect: [5, 7, 22, 18] }, { text: [16, 21, "T"], size: 13 }],
    whatItIs: "Changes voltage, for example to feed a smaller-voltage panel.",
    howBid:
      "Counted each: the transformer, its pad or hangers, a ground, and the wire in and out, which is traced.",
    lookOutFor: ["KVA beside it — its size"],
    count: "Transformer",
  },
  {
    trade: E,
    name: "Equipment connection",
    aka: ["equipment", "hard wire", "hardwire", "direct connection"],
    picture: [
      { path: "M16 5 L26 11 L26 21 L16 27 L6 21 L6 11 Z" },
      { text: [16, 20, "EQ"], size: 9 },
    ],
    whatItIs: "Power wired straight into a piece of equipment, with no plug.",
    howBid:
      "Counted each: a box or whip at the equipment and the circuit to it. Who furnishes the equipment is in the notes.",
    lookOutFor: ["A number or letter pointing to the equipment schedule"],
    count: "Equipment connection",
  },

  // ── Systems ─────────────────────────────────────────────────────────────
  {
    trade: E,
    name: "Data outlet",
    aka: ["data", "data jack", "network", "cat6", "ethernet"],
    picture: [{ path: "M16 7 L26 25 L6 25 Z" }],
    whatItIs: "A network jack.",
    howBid:
      "Counted each. Often a box and a conduit stub only, with the cabling by others — the notes say which.",
    lookOutFor: ["A number inside — how many jacks"],
    count: "Data outlet",
  },
  {
    trade: E,
    name: "Telephone outlet",
    aka: ["phone", "phone jack", "tel"],
    picture: [{ path: "M16 7 L26 25 L6 25 Z", fill: true }],
    whatItIs: "A phone jack.",
    howBid:
      "Counted each, usually a box and conduit stub with the cabling by others.",
    lookOutFor: ["Combined data and phone, drawn half filled"],
    count: "Telephone outlet",
  },
  {
    trade: E,
    name: "TV outlet",
    aka: ["tv", "catv", "cable tv", "coax"],
    picture: [{ rect: [5, 8, 22, 16] }, { text: [16, 20, "TV"], size: 10 }],
    whatItIs: "A cable TV jack.",
    howBid:
      "Counted each, usually a box and conduit stub with the cabling by others.",
    lookOutFor: ["A note on who pulls the cable"],
    count: "TV outlet",
  },
  {
    trade: E,
    name: "Fire alarm pull station",
    aka: ["pull station", "manual pull", "fire alarm pull"],
    picture: [{ rect: [7, 7, 18, 18] }, { text: [16, 21, "F"], size: 13 }],
    whatItIs: "The handle you pull to sound the fire alarm.",
    howBid:
      "Counted each: a box and conduit at least; the device and its wiring are often by the fire alarm contractor.",
    lookOutFor: ["The fire alarm notes — who furnishes and who wires"],
    count: "Fire alarm pull station",
  },
  {
    trade: E,
    name: "Horn strobe",
    aka: ["strobe", "horn", "notification device", "hs"],
    picture: [{ rect: [5, 8, 22, 16] }, { text: [16, 20, "HS"], size: 10 }],
    whatItIs: "The fire alarm's sounder and flashing light.",
    howBid:
      "Counted each: a box and conduit at least; the device and wiring often by the fire alarm contractor.",
    lookOutFor: ["S only — a strobe with no horn", "A ceiling version"],
    count: "Horn strobe",
  },
  {
    trade: E,
    name: "Smoke detector",
    aka: ["smoke", "sd", "smoke alarm"],
    picture: [{ circle: [16, 16, 11] }, { text: [16, 20, "SD"], size: 10 }],
    whatItIs: "A smoke detector on the ceiling.",
    howBid:
      "Counted each. In a house, a hard-wired smoke alarm on a circuit, linked to the others; in a building, part of the fire alarm system.",
    lookOutFor: [
      "CO as well — a combination unit",
      "Duct detectors at HVAC units",
    ],
    count: "Smoke detector",
  },

  // ── Wiring ──────────────────────────────────────────────────────────────
  {
    trade: E,
    name: "Home run",
    aka: ["homerun", "home run arrow", "hr"],
    picture: [
      { line: [4, 26, 26, 6] },
      { path: "M26 6 L18 8 L24 14 Z", fill: true },
      { line: [9, 17, 13, 21] },
      { line: [12, 14, 16, 18] },
    ],
    whatItIs:
      "An arrow showing the circuit runs back to the panel from here. The small marks across the line count the wires; the numbers beside it are the circuits.",
    howBid:
      "Measured by the foot, not counted: trace it from the last device to the panel, and add the drop at each end.",
    lookOutFor: [
      "The panel name and circuit numbers by the arrow",
      "Hash marks — how many wires; a longer one is often the neutral",
    ],
  },
  {
    trade: E,
    name: "Conduit run",
    aka: ["conduit", "pipe", "raceway", "underground conduit"],
    picture: [{ line: [3, 11, 29, 11] }, { line: [3, 21, 29, 21], dash: true }],
    whatItIs:
      "A line between devices. Solid usually means hidden in the walls or ceiling; dashed usually means under the floor or underground.",
    howBid:
      "Measured by the foot, not counted: trace it, with fittings, supports and the wire inside.",
    lookOutFor: [
      "Size and type written beside it",
      "Solid, dashed and dotted mean different things on different sets",
    ],
  },
  {
    trade: E,
    name: "Conduit turning up or down",
    aka: ["conduit up", "conduit down", "turn up", "turn down", "riser"],
    picture: [{ circle: [16, 16, 9] }, { circle: [16, 16, 3], fill: true }],
    whatItIs:
      "Where a run leaves the floor plan going up to the floor above or down below.",
    howBid:
      "The vertical part is footage you will not see on the plan: add the height up or down to the run.",
    lookOutFor: [
      "Up and down are drawn several ways — a dot, a half-filled circle; the legend says which",
    ],
  },
];
