/**
 * THE PACK EACH SHIPPED MATERIAL IS BOUGHT IN — written down per row, by
 * exact name, with where it came from. Owner, 2026-10-14
 * (`pricing/pack-label-scan.md` § E): the pricing sheet must never guess a
 * pack from words in a name.
 *
 * `qty` is how many `unitOfSale` units the pack holds — the number the sheet
 * divides the owner's typed pack price by. A per-foot row on a reel keeps
 * qty 1 and only NAMES the reel (owner, 2026-10-12): the owner types the
 * per-foot price there. A row with no entry is `each` / 1, or a per-foot
 * label at qty 1 (`packFor`, `pricing/starterSheetLayout.ts`).
 *
 * ── Who reads this ──────────────────────────────────────────────────────────
 * Today ONLY the pricing sheet builder (`pricing/buildStarterSheets.mts`).
 * Nothing at boot writes it to `materials.packQty` / `packLabel` (0157), and
 * **no pack-size offer goes to shops until this table has been through the
 * owner's sheet** (`references/track-a-handoff.md`). A shipped pack size is a
 * seed field (`pricing-safety-plan.md` § 0), which is why it lives here.
 *
 * ── Rules ───────────────────────────────────────────────────────────────────
 * - Every key is a shipped name; a rename moves its key in the same edit.
 *   `server/starterPacks.test.ts` fails on a stale key.
 * - `from` names the decision or the listing. "Guessed" is not a source.
 * - A row whose pack nobody could settle goes in `PACK_NOT_CHECKED`, not
 *   here: it ships `each` / 1 and the sheet says so on the row.
 * - A pack the owner TYPES on such a row comes back through the loader
 *   (starterPacksTyped.ts) and is folded in by `mergeTypedPacks` below.
 */
import { STARTER_PACKS_TYPED } from "./starterPacksTyped";

export type StarterPack = {
  /** The words on the sheet: "box of 25", "10 ft stick", "per foot (…)". */
  readonly label: string;
  /** Units of sale in the pack; the typed pack price divides by this. */
  readonly qty: number;
  /** Where this pack came from: a decision, or a store listing. */
  readonly from: string;
  /** Replaces the row's description in the sheet's Notes, where it would mislead. */
  readonly sheetNote?: string;
};

const SIZES = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
] as const;
type Size = (typeof SIZES)[number];
/** The sizes from `a` to `b`, inclusive, in trade-size order. */
const sizes = (a: Size, b: Size): Size[] =>
  SIZES.slice(SIZES.indexOf(a), SIZES.indexOf(b) + 1);

const entries: [string, StarterPack][] = [];
function put(
  names: string | readonly string[],
  label: string,
  qty: number,
  from: string,
  sheetNote?: string
) {
  for (const name of typeof names === "string" ? [names] : names)
    entries.push([
      name,
      { label, qty, from, ...(sheetNote ? { sheetNote } : {}) },
    ]);
}
const sized = (list: readonly Size[], make: (s: Size) => string) =>
  list.map(make);

const SCAN = "pack-label-scan.md";
const SCAN_ANSWERS = `${SCAN} "Owner's answers" 2026-10-13`;

// ── Conduit: rigid lengths and coils (§ E2; conduit-name-review "Flex packs")
put(
  [
    ...sized(sizes('1/2"', '4"'), s => `${s} EMT`),
    ...sized(sizes('1/2"', '4"'), s => `${s} PVC Sch 40`),
    ...sized(sizes('1/2"', '4"'), s => `${s} PVC Sch 80`),
    ...sized(sizes('1/2"', '4"'), s => `${s} rigid conduit`),
  ],
  "10 ft stick",
  10,
  `${SCAN} § E2: conduit is a 10 ft stick`
);

// ── Per-foot rows on a reel: qty 1, the label names the reel ─────────────────
put(
  "Underground warning tape",
  "per foot (from 1000 ft roll)",
  1,
  `${SCAN} A (669); underground-name-review Q3`
);
put(
  "Mule tape, 1800 lb",
  "per foot (from 3000 ft reel)",
  1,
  `${SCAN} A (664); underground-name-review Q3`
);
put(
  'Pull rope, 1/4"',
  "per foot (from 1000 ft reel)",
  1,
  `${SCAN} A (665); underground-name-review Q3`
);
put(
  "Tracer wire",
  "per foot (from 500 ft roll)",
  1,
  `${SCAN} D (666); underground-name-review Q3`
);
put("LED tape light", "per foot (from 16.4 ft reel)", 1, `${SCAN} A (1234)`);
put(
  ["14/3 SJOOW cord Copper", "12/3 SOOW cord Copper", "10/3 SOOW cord Copper"],
  "per foot (cut to length)",
  1,
  `${SCAN} A (68–70)`
);

// ── Raceway lengths ──────────────────────────────────────────────────────────
put(
  ["Surface raceway, 500 series", "Surface raceway, 700 series"],
  "10 ft length",
  10,
  `${SCAN_ANSWERS}: 10 ft lengths (surface raceway P1)`
);
put(
  "Overfloor raceway, 1500 series",
  "10 ft length",
  10,
  `${SCAN} A (636), as suggested`
);
put(
  "Surface raceway, 2400D series (divided)",
  "5 ft length",
  5,
  `${SCAN_ANSWERS}: 5 ft for 2400 (overrides surface raceway Q6's per foot)`,
  "Type the price of 5 ft of divided base PLUS one 5 ft cover (base is sold in 10 ft, cover in 5 ft)."
);

// ── Each, but sold in a bag, box, case or bundle (§ B) ───────────────────────
put("Grounding pigtail", "bag of 50", 50, `${SCAN} B (1322)`);
put("Arc flash label", "pack of 5", 5, `${SCAN} B (1693)`);
put(
  [
    "Butt splice, blue (16-14 AWG)",
    "Butt splice, red (22-18 AWG)",
    "Butt splice, yellow (12-10 AWG)",
    "Ring terminal, blue (16-14 AWG)",
    "Ring terminal, red (22-18 AWG)",
    "Ring terminal, yellow (12-10 AWG)",
  ],
  "bag of 100",
  100,
  "connectors-terminations-name-review Q8 (owner yes 2026-10-14)"
);
put(
  [
    "Spade terminal, blue (16-14 AWG)",
    "Spade terminal, red (22-18 AWG)",
    "Spade terminal, yellow (12-10 AWG)",
  ],
  "bag of 100",
  100,
  `${SCAN_ANSWERS}; connectors-terminations Q8`
);
put("Exothermic weld powder", "box of 10", 10, `${SCAN} B (1310)`);
put("Steel stud grommet", "bag of 100", 100, `${SCAN} B (772)`);
put(
  [
    "2 ft LED T8 tube, ballast compatible",
    "4 ft LED T8 tube, ballast compatible",
    "2 ft LED T8 tube, ballast bypass",
    "4 ft LED T8 tube, ballast bypass",
    "8 ft LED tube, R17d HO, ballast bypass",
  ],
  "case of 25",
  25,
  `${SCAN_ANSWERS}: case of 25`
);
put("12 ga ceiling hanger wire", "bundle of 100", 100, `${SCAN} B (1568)`);
put('Zip ties, 8", bag of 100', "bag of 100", 100, "the name says so (§ E1)");

// ── Owner's shelf answers, 2026-10-13/14 ─────────────────────────────────────
put(
  [
    "15A 250V receptacle, NEMA 6-15R",
    "20A 250V receptacle, NEMA 6-20R",
    "15A duplex receptacle",
    "20A duplex receptacle",
    "20A duplex receptacle, spec grade",
    "15A duplex receptacle, weather-resistant",
    "20A duplex receptacle, weather-resistant",
    "15A quad receptacle",
    "20A quad receptacle",
    "20A red emergency receptacle",
    "15A single receptacle",
    "20A single receptacle",
    "15A 3-way switch",
    "20A 3-way switch",
    "15A 4-way switch",
    "20A 4-way switch",
    "15A single-pole switch",
    "20A single-pole switch",
  ],
  "box of 10",
  10,
  "receptacles / switches name reviews: box of 10, right"
);
put(
  "Direct burial wire nut",
  "box of 100",
  100,
  "underground-name-review Q9 (owner yes)"
);
put(
  ["Ground wire staple", "Grounding screw"],
  "box of 100",
  100,
  "grounding-bonding-name-review Q10: staple and screw stay boxes (owner yes)"
);
put(
  [
    "Gas pipe bonding clamp",
    'Ground rod clamp, 5/8", direct burial',
    "Ground rod coupling",
    "Rebar ground clamp",
    "Water pipe bonding clamp",
  ],
  "each",
  1,
  "grounding-bonding-name-review Q10 (owner yes)"
);
put(
  "MC anti-short bushing",
  "bag of 100",
  100,
  "connectors-terminations Q8 (Platt package of 100)"
);
put(
  ['3/8" MC connector', '1/2" MC connector'],
  "box of 50",
  50,
  "connectors-terminations Q8"
);
put(
  [
    '3/4" MC connector',
    '1" MC connector',
    "Set-screw splice, #14-#2",
    "Set-screw splice, #14-#6",
    "Set-screw splice, #14-1/0",
    "Set-screw splice, #14-2/0",
    "Set-screw splice, #4-500 kcmil",
    "Set-screw splice, #6-250 kcmil",
    "Set-screw splice, #6-350 kcmil",
    "Set-screw splice, #6-4/0",
    '2" SE cable connector',
    "Ferrule kit",
  ],
  "each",
  1,
  "connectors-terminations Q8: each"
);
put("Coax F connector", "bag of 10", 10, "low-voltage-name-review Q13");
put("Cat6 RJ45 end", "bag of 50", 50, "low-voltage-name-review Q13");
put(
  [
    "Keystone wall plate, 1-port",
    "Keystone wall plate, 2-port",
    "Keystone wall plate, 4-port",
    "Keystone wall plate, 6-port",
    "Coax wall plate",
    "HDMI wall plate",
    "Speaker wall plate",
    "Thermostat wall plate",
  ],
  "each",
  1,
  "low-voltage-name-review Q13: low-voltage plates each"
);
put(
  "In-ceiling speaker",
  "pair",
  2,
  "low-voltage-name-review Q2 (MS10 keeps qty 1)"
);
put(
  [
    ...sized(sizes('1/2"', '4"'), s => `${s} strut conduit strap`),
    "Strut channel nut",
    "Strut wing connector",
  ],
  "each",
  1,
  "strut-supports-name-review Q8 (Platt sells each)"
);
put(
  [
    "Pole anchor bolt kit",
    "LED PL-pin lamp, G24",
    "Track light connector, straight",
    "Landscape hub connector",
  ],
  "each",
  1,
  "lighting-hardware-name-review P1 / Q10 (owner yes): the word was an accident"
);
put(
  ["Dishwasher whip", "Screwless wall plate"],
  "each",
  1,
  `${SCAN} § E: ACCIDENTAL word ("washer", "screw")`
);
put(
  '4" square mud ring, fixture',
  "each",
  1,
  "owner set each / 1 and typed a price (pack-label-scan E1)"
);

// ── Read at the stores, 2026-10-14 (A's pack pass) ──────────────────────────
// Home Depot, Platt and Stoneway; the listings are in pack-label-scan.md § F.
// Only a pack a listing SETTLED is here — the rest are in PACK_NOT_CHECKED.
const HD = "store check 2026-10-14";
put(
  ['4" square mud ring', '4" square mud ring, 2-gang'],
  "box of 25",
  25,
  `${HD}: HD RACO 8768 / 791 25-packs; Platt each`
);
put(
  'Nail plate, 1-1/2" x 5"',
  "pack of 100",
  100,
  `${HD}: HD Halex 62851B 100-pack`
);
put(
  "Wall plate screws",
  "pack of 100",
  100,
  `${HD}: HD Leviton 88000-PRT 100-pack`
);
put(
  "Device shim",
  "pack of 25",
  25,
  `${HD}: HD IDEAL 172451L 25-pack (wallplates P6)`
);
put(
  ["Raceway conduit connector", "Surface raceway support clip, 500/700 series"],
  "each",
  1,
  `${HD}: Platt V5785 / V5703 priced each`
);
put(
  "Surface raceway, low voltage",
  "5 ft length",
  5,
  `low-voltage Q12 (owner yes, after one listing); ${HD}: HD CordMate C10 5 ft`
);
put(
  '4" duct clamp, worm gear',
  "each",
  1,
  `${HD}: HD Everbilt MC4HD single; Platt each`
);
put(
  '1/2" liquidtight flexible conduit connector',
  "box of 25",
  25,
  `${HD}: HD Halex 16205B 25-pack`
);
put(
  [
    '1" liquidtight flexible conduit connector',
    '1/2" liquidtight 90-degree connector',
    '3/4" liquidtight 90-degree connector',
    '1" liquidtight 90-degree connector',
  ],
  "each",
  1,
  `${HD}: HD singles only (RACO 3404-8, 3422-8, Halex 66907)`
);
put(
  '3/4" flexible metal conduit connector',
  "box of 25",
  25,
  `${HD}: HD Halex 04207B 25-pack`
);
put(
  [
    '1" flexible metal conduit connector',
    '1-1/4" flexible metal conduit connector',
    ...sized(
      sizes('1/2"', '1-1/4"'),
      s => `${s} flexible metal conduit coupling`
    ),
  ],
  "each",
  1,
  `${HD}: HD Halex 04210 / 04212 / 9045x singles; Platt each`
);
put(
  '3/4" NM clamp connector',
  "box of 50",
  50,
  `${HD}: HD Halex 05107B 50-pack`
);
put('1" NM clamp connector', "box of 25", 25, `${HD}: HD Halex 05110B 25-pack`);
put(
  '3/4" snap-in NM connector',
  "pack of 25",
  25,
  `${HD}: HD Arlington NM95-25`
);
put(
  "Push-in wire connector",
  "bag of 100",
  100,
  `${HD}: HD Ideal 30-1032P/1033P 100`
);
put(
  ["Lever wire connector, 2-port", "Lever wire connector, 3-port"],
  "box of 50",
  50,
  `${HD}: HD Wago 221-412 / 221-413 50-packs`
);
put(
  "Lever wire connector, 5-port",
  "box of 25",
  25,
  `${HD}: HD Wago 221-415 25-pack`
);
put(
  ["Wire nut, 22-12 AWG (blue/orange)", "Wire nut, 22-8 AWG (tan/red)"],
  "bag of 100",
  100,
  `${HD}: HD Ideal 30-172P / 30-073P / 30-341P bags of 100`
);
put(
  '1/2" EMT set-screw connector',
  "box of 50",
  50,
  `${HD}: HD Halex 62705B / RACO 2002-J50 50-packs`
);
put(
  '3/4" EMT set-screw connector',
  "box of 25",
  25,
  `${HD}: HD Halex 12301B / 62707B 25-packs`
);
put(
  sized(sizes('1-1/4"', '2-1/2"'), s => `${s} EMT set-screw connector`),
  "each",
  1,
  `${HD}: HD singles only (Halex 62712 / 62720 / 62725)`
);
put(
  '1/2" EMT set-screw coupling',
  "box of 50",
  50,
  `${HD}: HD Halex 62805B / RACO 2022-J50 50-packs`
);
put(
  '3/4" EMT set-screw coupling',
  "box of 25",
  25,
  `${HD}: HD Halex 62807B 25-pack`
);
put(
  [
    ...sized(sizes('1-1/4"', '1-1/2"'), s => `${s} EMT set-screw coupling`),
    ...sized(sizes('2-1/2"', '3"'), s => `${s} EMT set-screw coupling`),
  ],
  "each",
  1,
  `${HD}: HD singles (Halex 62812 / 62825 / 62830); Platt each`
);
put(
  sized(sizes('1/2"', '3/4"'), s => `${s} EMT compression connector`),
  "box of 25",
  25,
  `${HD}: HD RACO 2902-J25 / Halex 62307B 25-packs`
);
put(
  sized(sizes('1"', '1-1/2"'), s => `${s} EMT compression connector`),
  "each",
  1,
  `${HD}: HD singles only (Halex 02310 / 62312 / 02315)`
);
put(
  '3/4" EMT compression coupling',
  "box of 25",
  25,
  `${HD}: HD Halex 02401B / 62407B 25-packs`
);
put(
  sized(sizes('1"', '2"'), s => `${s} EMT compression coupling`),
  "each",
  1,
  `${HD}: HD singles (62410, RACO 2924-8, Halex 02420)`
);
put(
  '3/4" EMT raintight compression connector',
  "pack of 20",
  20,
  `${HD}: HD Halex 62502B / RACO 2903RT-J20 20-packs`
);
put(
  '1/2" EMT raintight compression coupling',
  "pack of 35",
  35,
  `${HD}: HD Halex 62601B / CE FEPRS-50-35 35-packs`
);
put(
  '3/4" EMT raintight compression coupling',
  "pack of 20",
  20,
  `${HD}: HD Halex 62602B / CE FEPRS-75-20 20-packs`
);
put(
  sized(sizes('1-1/2"', '2"'), s => `${s} EMT raintight compression coupling`),
  "each",
  1,
  `${HD}: HD CE FEPRS-150-1 / -200-1 singles`
);
put(
  '1/2" EMT insulated set-screw connector',
  "box of 50",
  50,
  `${HD}: HD Halex 82705B 50-pack`
);
put('1/2" EMT offset connector', "each", 1, `${HD}: HD Halex 90371 single`);
put(
  sized(sizes('1/2"', '3/4"'), s => `${s} EMT one-hole strap`),
  "box of 100",
  100,
  `${HD}: HD CE FES1S-50-100 / -75-100, RACO 2082CP 100-packs`
);
put(
  '1" EMT one-hole strap',
  "box of 50",
  50,
  `${HD}: HD CE FES1S-100-50 / Halex 61510B 50-packs`
);
// Strut & Supports, Fasteners & Anchors (strut-supports Q8: "as A reads them")
put(
  [
    '1/4" flat washer',
    '3/8" flat washer',
    '1/4" lock washer',
    '3/8" lock washer',
    '1/2" lock washer',
    '1/4" hex nut',
    '3/8" hex nut',
  ],
  "pack of 100",
  100,
  `${HD}: HD Everbilt 100-packs; Platt package 100`
);
put('5/8" flat washer', "pack of 25", 25, `${HD}: HD Everbilt 807752 25-pack`);
put(
  ['1/2" hex nut', '5/8" hex nut'],
  "pack of 50",
  50,
  `${HD}: HD Everbilt 804710 / 801780 50-packs`
);
put(
  "MC one-hole strap, small",
  "pack of 100",
  100,
  `${HD}: HD RACO 2081-J100 100-pack`
);
put(
  "T-grid independent support clip",
  "each",
  1,
  `${HD}: Stoneway Caddy IDS $5.05 each; Platt priced each`
);
put(
  ["Drop-in anchor", "Sleeve anchor", '3/8" x 3" concrete wedge anchor'],
  "box of 50",
  50,
  `${HD}: HD Red Head 01891 / 11281 / 03014 50-packs`
);
put("Drywall anchor", "pack of 100", 100, `${HD}: HD E-Z Ancor 25410 100-pack`);
put(
  "Powder-actuated pin",
  "pack of 100",
  100,
  `${HD}: HD Ramset 00759 100-pack`
);
put(
  "Toggle bolt",
  "box of 50",
  50,
  `${SCAN} B (1580), owner yes; Platt Dottie TB43DS package 50`
);
// Flex is a COIL, never a stick (§ E2; conduit-name-review "Flex packs").
const FLEX_NOTE =
  "Home Depot prices the COIL; Platt prices flex per FOOT. Type the coil price here — or a per-foot price with Pack qty set to 1.";
put(
  [
    '1/2" liquidtight flexible conduit',
    '3/4" liquidtight flexible conduit',
    '1" liquidtight flexible conduit',
    '1/2" nonmetallic liquidtight conduit (LFNC)',
    '3/4" nonmetallic liquidtight conduit (LFNC)',
    '3/8" FMC (reduced wall)',
    '1/2" flexible metal conduit',
    '3/4" flexible metal conduit',
  ],
  "100 ft coil",
  100,
  `${HD}: 100 ft coils (HD Southwire 55093003 / 58046301 / 55082303, Platt 100' coils)`,
  FLEX_NOTE
);
put(
  [
    '1-1/4" liquidtight flexible conduit',
    '1" flexible metal conduit',
    '1-1/4" flexible metal conduit',
  ],
  "50 ft coil",
  50,
  `${HD}: 50 ft coils (Platt 114LTEFX50 / 1FSX50 / 114FSX50, HD Alflex 55092501 / 55092601)`,
  FLEX_NOTE
);
put(
  "Wireway coupling",
  "each",
  1,
  `${HD}: Stoneway Hoffman F44GUC; Elliott each`
);
put(
  "DIN rail",
  "each",
  1,
  `${SCAN} C: keep each; ${HD}: Platt 2 m rail priced each`
);
put(
  "Furniture feed connector",
  "each",
  1,
  `${HD}: not stocked at the three stores; every listing found is each (Crescent RFBA24FF, ABB FFPT4-C)`
);

// Wall plates — wallplates-misc-name-review Q5 (owner yes 2026-10-14). The
// generic "Wall plate" / "2-gang wall plate" follow the nylon rows Q2 retires
// them into.
put(
  [
    "Wall plate",
    "1-gang wall plate, blank, nylon",
    "1-gang wall plate, decorator, nylon",
    "1-gang wall plate, duplex, nylon",
    "1-gang wall plate, single receptacle, nylon",
    "1-gang wall plate, toggle, nylon",
    "2-gang wall plate",
    "2-gang wall plate, blank, nylon",
    "2-gang wall plate, decorator/decorator, nylon",
    "2-gang wall plate, duplex/decorator, nylon",
    "2-gang wall plate, duplex/duplex, nylon",
    "2-gang wall plate, toggle/decorator, nylon",
    "2-gang wall plate, toggle/duplex, nylon",
    "2-gang wall plate, toggle/toggle, nylon",
  ],
  "box of 25",
  25,
  "wallplates-misc Q5: standard nylon 1- and 2-gang stay box of 25"
);
put(
  [
    "1-gang wall plate, 30A/50A power receptacle, stainless",
    "1-gang wall plate, blank, nylon, midway",
    "1-gang wall plate, blank, stainless",
    "1-gang wall plate, blank, stainless, oversized",
    "1-gang wall plate, decorator, nylon, midway",
    "1-gang wall plate, decorator, stainless",
    "1-gang wall plate, decorator, stainless, oversized",
    "1-gang wall plate, duplex, nylon, midway",
    "1-gang wall plate, duplex, stainless",
    "1-gang wall plate, duplex, stainless, oversized",
    "1-gang wall plate, single receptacle, stainless",
    "1-gang wall plate, toggle, nylon, midway",
    "1-gang wall plate, toggle, stainless",
    "1-gang wall plate, toggle, stainless, oversized",
    "2-gang wall plate, blank, nylon, midway",
    "2-gang wall plate, blank, stainless",
    "2-gang wall plate, blank, stainless, oversized",
    "2-gang wall plate, decorator/decorator, nylon, midway",
    "2-gang wall plate, decorator/decorator, stainless",
    "2-gang wall plate, decorator/decorator, stainless, oversized",
    "2-gang wall plate, duplex/decorator, nylon, midway",
    "2-gang wall plate, duplex/decorator, stainless",
    "2-gang wall plate, duplex/duplex, nylon, midway",
    "2-gang wall plate, duplex/duplex, stainless",
    "2-gang wall plate, duplex/duplex, stainless, oversized",
    "2-gang wall plate, toggle/decorator, nylon, midway",
    "2-gang wall plate, toggle/decorator, stainless",
    "2-gang wall plate, toggle/decorator, stainless, oversized",
    "2-gang wall plate, toggle/duplex, nylon, midway",
    "2-gang wall plate, toggle/duplex, stainless",
    "2-gang wall plate, toggle/duplex, stainless, oversized",
    "2-gang wall plate, toggle/toggle, nylon, midway",
    "2-gang wall plate, toggle/toggle, stainless",
    "2-gang wall plate, toggle/toggle, stainless, oversized",
    "3-gang wall plate",
    "3-gang wall plate, blank, nylon",
    "3-gang wall plate, blank, stainless",
    "3-gang wall plate, decorator/decorator/decorator, nylon",
    "3-gang wall plate, decorator/decorator/decorator, stainless",
    "3-gang wall plate, duplex/duplex/duplex, nylon",
    "3-gang wall plate, duplex/duplex/duplex, stainless",
    "3-gang wall plate, toggle/decorator/decorator, nylon",
    "3-gang wall plate, toggle/decorator/decorator, stainless",
    "3-gang wall plate, toggle/duplex/duplex, nylon",
    "3-gang wall plate, toggle/duplex/duplex, stainless",
    "3-gang wall plate, toggle/toggle/decorator, nylon",
    "3-gang wall plate, toggle/toggle/decorator, stainless",
    "3-gang wall plate, toggle/toggle/duplex, nylon",
    "3-gang wall plate, toggle/toggle/duplex, stainless",
    "3-gang wall plate, toggle/toggle/toggle, nylon",
    "3-gang wall plate, toggle/toggle/toggle, stainless",
    "4-gang wall plate",
    "4-gang wall plate, blank, nylon",
    "4-gang wall plate, blank, stainless",
    "4-gang wall plate, decorator/decorator/decorator/decorator, nylon",
    "4-gang wall plate, decorator/decorator/decorator/decorator, stainless",
    "4-gang wall plate, duplex/duplex/duplex/duplex, nylon",
    "4-gang wall plate, duplex/duplex/duplex/duplex, stainless",
    "4-gang wall plate, toggle/toggle/toggle/toggle, nylon",
    "4-gang wall plate, toggle/toggle/toggle/toggle, stainless",
    "5-gang wall plate",
    "6-gang wall plate",
    "Jumbo wall plate",
    "Stainless steel wall plate",
  ],
  "each",
  1,
  "wallplates-misc Q5: stainless, midway, oversized and 3- to 6-gang plates each"
);

// PVC, rigid, locknuts and bushings. Platt prices all of them each; HD's
// packs change from size to size, so each size is read on its own.
put(
  [
    ...sized(sizes('1"', '4"'), s => `${s} PVC Sch 40/80 coupling`),
    ...sized(sizes('2-1/2"', '4"'), s => `${s} PVC two-hole strap`),
    ...sized(sizes('1/2"', '4"'), s => `${s} rigid conduit coupling`),
    '1/2" rigid conduit threadless compression connector',
    ...sized(
      sizes('1"', '4"'),
      s => `${s} rigid conduit threadless compression connector`
    ),
    ...sized(sizes('1-1/4"', '2-1/2"'), s => `${s} rigid one-hole strap`),
    '2" riser strap',
    '3" riser strap',
    ...sized(sizes('2-1/2"', '4"'), s => `${s} conduit locknut`),
    ...sized(sizes('1/2"', '4"'), s => `${s} grounding bushing`),
    ...sized(sizes('2-1/2"', '4"'), s => `${s} insulating bushing`),
  ],
  "each",
  1,
  `${HD}: HD singles with no pack option (Carlon E940F–L, Halex, CE); Platt each`
);
put(
  sized(sizes('1/2"', '3/4"'), s => `${s} rigid one-hole strap`),
  "box of 100",
  100,
  `${HD}: HD Halex 1/2" and 3/4" rigid straps, packs 4 / 100`
);
put('1" conduit locknut', "box of 100", 100, `${HD}: HD Halex, packs 2 / 100`);
put(
  ['1-1/4" conduit locknut', '2" conduit locknut'],
  "pack of 50",
  50,
  `${HD}: HD Halex, packs 2 / 50 and 2 / 10 / 50`
);

/**
 * Rows whose pack the store check could NOT settle (2026-10-14). They ship
 * `each` / 1 and the sheet's Notes say "PACK NOT CHECKED" on the row; the
 * reason is what was seen. The owner answers each, and it moves up into
 * STARTER_PACKS. Never a guess in the meantime.
 */
const notChecked: [string, string][] = [];
function unsure(names: string | readonly string[], why: string) {
  for (const name of typeof names === "string" ? [names] : names)
    notChecked.push([name, why]);
}
unsure(
  '1/2" knockout seal',
  "HD bulk packs are 100 (Halex 60795B) and 150 (CE FAKOS-50-150); Platt each"
);
unsure(
  'Nail plate, 1-1/2" x 3"',
  "HD single or box of 60; Platt package of 100"
);
unsure(
  "Old-work box support (F-clip)",
  "sold as a PAIR (HD Steel City 820D1U, Platt OWC = 1 pair); some Platt listings count single pieces"
);
unsure(
  '4-11/16" square mud ring',
  "HD single (Steel City 72C13); a RACO 25-pack seen only as a link; RACO 898 is a 20-pack"
);
unsure(
  '4-11/16" square mud ring, 2-gang',
  "HD singles only; no bulk pack found"
);
unsure("Device mounting screw", "HD Everbilt 25-piece; Platt Dottie 100-pack");
unsure("Wall plate gasket", "HD 6- and 14-packs; Platt Dottie WPI25 / WPI100");
unsure(
  [
    "Surface raceway coupling, 500 series",
    "Surface raceway coupling, 700 series",
  ],
  "owner said pack of 10 (surface raceway P3), but Platt prices the coupling (Wiremold 5701) each and V706 is the cover — confirm"
);
unsure(
  "Raceway divider clip, 2400D series",
  "no listing found at the three stores"
);
unsure(
  "Hook-and-loop cable strap",
  'HD VELCRO 8" 50-pack; Platt 75 ft rolls — a different product shape'
);
unsure(
  '3/4" liquidtight flexible conduit connector',
  "HD singles (Halex 86207) or RACO 3513-8 10-pack"
);
unsure(
  '1-1/4" liquidtight flexible conduit connector',
  "HD single (Arlington LT125-1) or Halex 96212B 4-pack"
);
unsure(
  [
    '1/2" nonmetallic liquidtight connector',
    '3/4" nonmetallic liquidtight connector',
    '1/2" nonmetallic liquidtight 90-degree connector',
    '3/4" nonmetallic liquidtight 90-degree connector',
  ],
  "HD singles, 5-, 20- and 25-packs; Platt each"
);
unsure(
  '1/2" flexible metal conduit connector',
  "Halex 04205B 25-pack seen at HD Supply only; HD 3-pack and 50-pack screw-ins"
);
unsure(
  sized(sizes('1/2"', '1-1/4"'), s => `${s} flexible conduit one-hole strap`),
  "no flex-only strap found; HD universal strap 75-pack, rigid straps 4-packs; Platt each"
);
unsure('3/8" NM clamp connector', "HD CE 100-pack and RACO 25-pack");
unsure('1/2" NM clamp connector', "no listing found at HD; Platt each");
unsure('1/2" snap-in NM connector', "HD 25-, 50- and 100-packs");
unsure(
  "Wing nut wire connector, 14-6 AWG (blue)",
  "HD Ideal 30-454P 25-pack; bag of 100 only elsewhere"
);
unsure(
  "Cable staple",
  "plastic: HD 100-pack; metal: HD 500-pack — which staple is this row?"
);
unsure('1" EMT set-screw connector', "HD Halex 20-pack, 15-pack and singles");
unsure(
  ['3" EMT set-screw connector', '4" EMT set-screw connector'],
  "HD 3-pack or 12-pack; Platt each"
);
unsure('1" EMT set-screw coupling', "HD 10-pack, RACO 50-pack and singles");
unsure(
  '2" EMT set-screw coupling',
  "HD singles; a Halex listing titled 50-pack shows $3.72"
);
unsure('4" EMT set-screw coupling', "no listing found");
unsure(
  sized(sizes('2"', '4"'), s => `${s} EMT compression connector`),
  "no plain listing found; probably each"
);
unsure(
  '1/2" EMT compression coupling',
  "HD Halex 35-pack (steel) or 45-pack (zinc)"
);
unsure(
  sized(sizes('2-1/2"', '4"'), s => `${s} EMT compression coupling`),
  'only the 3" seen (single)'
);
unsure(
  '1/2" EMT raintight compression connector',
  "HD 40-packs (Halex, CE) or RACO 50-pack"
);
unsure(
  '1" EMT raintight compression connector',
  "HD 15-pack, 10-pack or single"
);
unsure(
  sized(sizes('1-1/4"', '4"'), s => `${s} EMT raintight compression connector`),
  "singles probable; not every size found"
);
unsure(
  '1" EMT raintight compression coupling',
  "HD Halex 10-pack or CE single"
);
unsure(
  [
    '1-1/4" EMT raintight compression coupling',
    ...sized(
      sizes('2-1/2"', '4"'),
      s => `${s} EMT raintight compression coupling`
    ),
  ],
  "no listing found"
);
unsure('1/2" EMT to FMC transition coupling', "HD CE single and 2-pack");
unsure('1-1/4" EMT one-hole strap', "HD 4-packs only");
unsure(
  '1-1/2" EMT one-hole strap',
  "HD one 25-pack listing, otherwise 2-packs"
);
unsure('2" EMT one-hole strap', "HD 2-packs only");
unsure(
  sized(sizes('2-1/2"', '4"'), s => `${s} EMT one-hole strap`),
  "no listing found"
);
unsure('1/2" EMT two-hole strap', "HD Halex 100-pack or 25-pack");
unsure('3/4" EMT two-hole strap', "HD 50-, 20- and 200-packs");
unsure('1" EMT two-hole strap', "HD 4-pack only");
unsure(
  ['1/2" conduit clip', '3/4" conduit clip', "Rod hanger clip"],
  "HD 10-pack (Superstrut); Platt carton of 100 (Caddy K12); Crescent each"
);
unsure('1/2" flat washer', "HD Everbilt 25-pack or 50-pack");
unsure('5/8" lock washer', "HD 25-pack (out of stock); Platt package 100");
unsure("MC one-hole strap, large", "no listing found");
unsure(
  "T-grid fixture clip",
  "Platt Caddy 515A package 100, priced each; not at HD"
);
unsure(
  'Beam clamp, 3/8" rod',
  "HD 100-pack, 10-pack or single, by clamp style"
);
unsure("Masonry screw", "HD Tapcon 75, 150, 225; Platt 100");
unsure("Plastic conduit clip", "no listing found");
unsure(
  "Self-drilling screw",
  "#10: HD 140-pack; #12: HD 100-pack — the name has no size"
);
unsure(
  "8 ft LED tube, FA8 single-pin, ballast bypass",
  "HD 2-pack or 12-pack; Platt each; the owner's other tubes are a case of 25"
);
unsure(
  '1/2" PVC Sch 40/80 coupling',
  "HD packs of 1, 5, 12, 15 and 25; Platt each"
);
unsure(
  '3/4" PVC Sch 40/80 coupling',
  "HD packs of 1, 5, 15 and 20; Platt each"
);
unsure(
  sized(sizes('1/2"', '2"'), s => `${s} PVC one-hole strap`),
  'HD has only a 3/4" single; Platt each — too little seen to settle'
);
unsure(
  '3/4" rigid conduit threadless compression connector',
  "HD 2-pack only; Platt each"
);
unsure('1" rigid one-hole strap', "HD Halex packs of 1 and 50; Platt each");
unsure(
  ['3" rigid one-hole strap', '4" rigid one-hole strap'],
  "no listing found"
);
unsure('1/2" conduit locknut', "HD Halex packs of 4, 20 and 200");
unsure('3/4" conduit locknut', "HD packs of 1, 2, 4, 10 and 20");
unsure('1-1/2" conduit locknut', "HD 2-pack only; Platt each");
unsure(
  sized(sizes('1/2"', '2"'), s => `${s} insulating bushing`),
  "HD singles and 2-, 4- and 10-packs, different per size; Platt each"
);
unsure(
  [
    'Reducing washer, 1" to 1/2"',
    'Reducing washer, 1" to 3/4"',
    'Reducing washer, 3/4" to 1/2"',
  ],
  "HD 2- or 4-packs (pairs) or bags of 250; Platt prices ONE washer, and a fitting takes a pair"
);
unsure(
  "1-gang wall plate, 30A/50A power receptacle, nylon",
  "wallplates Q5 keeps STANDARD nylon plates a box of 25; a 30A/50A plate is a specialty plate, usually sold singly"
);

/** Builds a name-keyed map, refusing a name listed twice. */
function keyed<T>(list: readonly [string, T][], what: string) {
  const out: Record<string, T> = {};
  for (const [name, v] of list) {
    if (name in out) throw new Error(`${what}: "${name}" is listed twice`);
    out[name] = v;
  }
  return out;
}

/**
 * Fold the packs the owner TYPED on not-checked rows (starterPacksTyped.ts,
 * written by the loader) into the written packs, and take those names off
 * the not-checked list. A typed pack for a name that was not on that list
 * is refused here too: the sheet never moves a decided pack.
 */
export function mergeTypedPacks(
  written: Readonly<Record<string, StarterPack>>,
  unsureList: Readonly<Record<string, string>>,
  typed: Readonly<Record<string, { label: string; qty: number }>>
): {
  packs: Record<string, StarterPack>;
  notChecked: Record<string, string>;
} {
  const packs: Record<string, StarterPack> = { ...written };
  const left: Record<string, string> = { ...unsureList };
  for (const [name, t] of Object.entries(typed)) {
    if (!(name in unsureList))
      throw new Error(
        `STARTER_PACKS_TYPED: "${name}" was not PACK NOT CHECKED — its pack is decided in starterPacks.ts`
      );
    packs[name] = {
      label: t.label,
      qty: t.qty,
      from: "owner, typed in the pricing sheet",
    };
    delete left[name];
  }
  return { packs, notChecked: left };
}

/**
 * The lists AS DECIDED here, before any typed pack is folded in. The loader
 * judges a sheet row against these: a row typed last time is still a
 * not-checked row this time, so loading the same sheet twice keeps it
 * (the generated file is rebuilt whole on every load).
 */
export const STARTER_PACKS_DECIDED: Readonly<Record<string, StarterPack>> =
  keyed(entries, "STARTER_PACKS");
export const PACK_NOT_CHECKED_AS_FOUND: Readonly<Record<string, string>> =
  keyed(notChecked, "PACK_NOT_CHECKED");

const merged = mergeTypedPacks(
  STARTER_PACKS_DECIDED,
  PACK_NOT_CHECKED_AS_FOUND,
  STARTER_PACKS_TYPED
);

export const STARTER_PACKS: Readonly<Record<string, StarterPack>> =
  merged.packs;
export const PACK_NOT_CHECKED: Readonly<Record<string, string>> =
  merged.notChecked;
