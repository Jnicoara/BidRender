/**
 * Receptacles, switches and cover plates.
 *
 * ── The one rule this file exists to keep ────────────────────────────────────
 * A cover plate is NOT aliased to the device it covers, and a device is not
 * aliased to its plate. Cross-aliasing these two is the specific mistake that
 * once made searching "recep" rank "Wall plate" first. Everything in the plates
 * section below is aliased by what it *is* — cover, faceplate, blank — never by
 * what goes behind it.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const device = (
  category: "Receptacles" | "Switches" | "Wall Plates & Misc"
) => ({
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category,
});

// ─── Receptacles ──────────────────────────────────────────────────────────────

/** Nobody says "duplex receptacle" on a job — it is an outlet or a plug. */
const RECEP_SLANG = "outlet plug recep wall device nema";

export const RECEPTACLES: BaselineMaterial[] = [
  {
    ...device("Receptacles"),
    name: "Duplex receptacle",
    searchAliases: aliases(
      RECEP_SLANG,
      "15 amp 5-15r tamper resistant tr standard"
    ),
    description: "15A standard. The 20A version is a separate item.",
  },
  {
    ...device("Receptacles"),
    name: "20A duplex receptacle",
    searchAliases: aliases(
      RECEP_SLANG,
      "5-20r tamper resistant tr t-slot kitchen"
    ),
    description: "20A, T-slot. The 15A version is a separate item.",
  },
  {
    ...device("Receptacles"),
    name: "GFCI receptacle",
    searchAliases: aliases(
      "gfi ground fault interrupter",
      RECEP_SLANG,
      "bathroom kitchen wet location protected self test"
    ),
  },
  {
    ...device("Receptacles"),
    name: "AFCI receptacle",
    searchAliases: aliases(
      "arc fault",
      RECEP_SLANG,
      "bedroom branch feed through"
    ),
  },
  {
    ...device("Receptacles"),
    name: "Twist-lock receptacle",
    searchAliases: aliases(
      "twistlock locking turn",
      RECEP_SLANG,
      "l5-30r l14-30r generator"
    ),
  },
  {
    ...device("Receptacles"),
    name: "50A range receptacle",
    searchAliases: aliases(
      "stove oven cooktop",
      RECEP_SLANG,
      "14-50r 6-50 four prong surface"
    ),
  },
  {
    ...device("Receptacles"),
    name: "30A dryer receptacle",
    searchAliases: aliases(
      "laundry",
      RECEP_SLANG,
      "14-30r 10-30 four prong three prong"
    ),
  },
  {
    ...device("Receptacles"),
    name: "USB combo receptacle",
    searchAliases: aliases(
      "charger charging type c type-a",
      RECEP_SLANG,
      "port bedroom"
    ),
  },
  {
    ...device("Receptacles"),
    name: "Switch/receptacle combo device",
    searchAliases: aliases(
      "combination",
      RECEP_SLANG,
      "garage single gang two function"
    ),
  },
  /*
    ── Moved from the pricing sheet, 2026-09-25 ─────────────────────────────
    Same naming as the shipped rows above: the plain name is 15A and the 20A
    version says so. A weather-resistant receptacle is also tamper-resistant,
    which is why the TR/WR rows are the weather-resistant ones.
  */
  {
    ...device("Receptacles"),
    name: "20A GFCI receptacle",
    searchAliases: aliases(
      "gfi ground fault interrupter",
      RECEP_SLANG,
      "5-20r t-slot kitchen bathroom counter"
    ),
  },
  {
    ...device("Receptacles"),
    name: "GFCI receptacle, weather-resistant",
    searchAliases: aliases("gfi wr tr outdoor exterior", RECEP_SLANG, "15 amp"),
  },
  {
    ...device("Receptacles"),
    name: "20A GFCI receptacle, weather-resistant",
    searchAliases: aliases("gfi wr tr outdoor exterior", RECEP_SLANG, "5-20r"),
  },
  {
    ...device("Receptacles"),
    name: "Duplex receptacle, weather-resistant",
    searchAliases: aliases(
      "wr tr tr/wr tamper outdoor exterior",
      RECEP_SLANG,
      "15 amp 5-15r"
    ),
  },
  {
    ...device("Receptacles"),
    name: "20A duplex receptacle, weather-resistant",
    searchAliases: aliases(
      "wr tr tr/wr tamper outdoor exterior",
      RECEP_SLANG,
      "5-20r"
    ),
  },
  {
    ...device("Receptacles"),
    name: "Single receptacle",
    searchAliases: aliases("simplex", RECEP_SLANG, "15 amp dedicated"),
  },
  {
    ...device("Receptacles"),
    name: "20A single receptacle",
    searchAliases: aliases("simplex", RECEP_SLANG, "5-20r dedicated"),
  },
  {
    ...device("Receptacles"),
    name: "Quad receptacle",
    searchAliases: aliases("fourplex 4-plex", RECEP_SLANG, "15 amp"),
  },
  {
    ...device("Receptacles"),
    name: "20A quad receptacle",
    searchAliases: aliases("fourplex 4-plex", RECEP_SLANG, "5-20r"),
  },
  {
    ...device("Receptacles"),
    name: "Controlled duplex receptacle",
    searchAliases: aliases(
      "plug load control switched half energy code",
      RECEP_SLANG
    ),
  },
  {
    ...device("Receptacles"),
    name: "Surge-protective receptacle",
    searchAliases: aliases("spd suppression", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    name: "Hospital-grade receptacle",
    searchAliases: aliases("hg green dot medical healthcare", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    name: "Isolated-ground receptacle",
    searchAliases: aliases("ig orange triangle computer", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    // "device" ends the name on purpose: ending in "GFCI" made it the head
    // noun, and it then led every search for "gfci" ahead of the receptacle.
    name: "Dead-front GFCI device",
    searchAliases: aliases(
      "gfi ground fault interrupter blank face no outlet protection device"
    ),
  },
  ...[
    { nema: "L5-20", slang: "l5-20r 20 amp 125v" },
    { nema: "L6-30", slang: "l6-30r 30 amp 250v welder compressor" },
    { nema: "L14-30", slang: "l14-30r 30 amp generator inlet 4 wire" },
  ].map(({ nema, slang }) => ({
    ...device("Receptacles"),
    name: `${nema} receptacle`,
    searchAliases: aliases("twistlock locking", RECEP_SLANG, slang),
  })),
  {
    ...device("Receptacles"),
    name: "30A RV receptacle",
    searchAliases: aliases(
      "tt-30 tt30 camper travel trailer 125v",
      RECEP_SLANG
    ),
  },
  {
    ...device("Receptacles"),
    name: "50A RV receptacle",
    searchAliases: aliases("14-50 camper motorhome 125/250v", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    name: "Pop-up floor receptacle",
    searchAliases: aliases("popup countertop island tombstone", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    name: "Floor receptacle assembly",
    searchAliases: aliases(
      "box cover device complete brass tombstone",
      RECEP_SLANG
    ),
  },
  {
    ...device("Receptacles"),
    name: "Recessed clock receptacle",
    searchAliases: aliases("clock hanger", RECEP_SLANG),
  },
  {
    ...device("Receptacles"),
    name: "Recessed TV receptacle box",
    searchAliases: aliases(
      "media flush mount behind television low voltage pass through",
      RECEP_SLANG
    ),
  },
];

// ─── Switches ─────────────────────────────────────────────────────────────────

const SWITCH_SLANG = "light toggle device rocker decora 15 amp";

export const SWITCHES: BaselineMaterial[] = [
  {
    ...device("Switches"),
    name: "Single-pole switch",
    searchAliases: aliases("sp 1p one", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "3-way switch",
    searchAliases: aliases(
      "three 3way traveler stair hall two location",
      SWITCH_SLANG
    ),
  },
  {
    ...device("Switches"),
    name: "4-way switch",
    searchAliases: aliases(
      "four 4way traveler middle three location",
      SWITCH_SLANG
    ),
  },
  {
    ...device("Switches"),
    name: "Dimmer",
    searchAliases: aliases(
      "switch rheostat slide rotary knob light dimming decora rocker led compatible"
    ),
  },
  {
    ...device("Switches"),
    name: "Smart switch",
    searchAliases: aliases(
      "wifi wi-fi zwave z-wave app connected",
      SWITCH_SLANG
    ),
  },
  {
    ...device("Switches"),
    name: "Occupancy sensor switch",
    searchAliases: aliases("motion pir auto on vacancy detector", SWITCH_SLANG),
    description: "Turns on automatically. The vacancy version is manual-on.",
  },
  {
    ...device("Switches"),
    name: "Vacancy sensor switch",
    searchAliases: aliases(
      "motion pir manual on detector title 24",
      SWITCH_SLANG
    ),
    description:
      "Manual-on, auto-off. The occupancy version turns on by itself.",
  },
  {
    ...device("Switches"),
    name: "Photocell",
    searchAliases: aliases(
      // Not "daylight sensor": that is its own item since 2026-09-25, and an
      // alias spelling it out would compete with it.
      "photo eye cell dusk dawn daylight outdoor lighting control stem button twistlock"
    ),
  },
  {
    ...device("Switches"),
    name: "Timer switch",
    // Deliberately NOT aliased "time clock": that is the name of a different
    // material in this catalog, and aliasing to it would make this outrank the
    // thing a "time clock" query actually names.
    searchAliases: aliases(
      "countdown spring wound programmable bath fan control interval digital in-wall"
    ),
  },
  // ── Moved from the pricing sheet, 2026-09-25 ──
  ...[
    { name: "20A single-pole switch", slang: "sp 1p one" },
    { name: "20A 3-way switch", slang: "three 3way traveler" },
    { name: "20A 4-way switch", slang: "four 4way traveler" },
  ].map(({ name, slang }) => ({
    ...device("Switches"),
    name,
    searchAliases: aliases(
      slang,
      "light toggle device rocker decora 20 amp commercial spec grade"
    ),
  })),
  {
    ...device("Switches"),
    name: "30A double-pole switch",
    searchAliases: aliases("dp 2p two pole 240v 30 amp water heater manual"),
  },
  {
    ...device("Switches"),
    name: "Double switch",
    searchAliases: aliases("duplex two stacked single gang", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Triple switch",
    searchAliases: aliases("three stacked single gang", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Weatherproof toggle switch",
    searchAliases: aliases("wp outdoor exterior cover", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Illuminated switch",
    searchAliases: aliases("lighted glow locator", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Pilot-light switch",
    searchAliases: aliases("pilot indicator on attic garage", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Key switch",
    searchAliases: aliases("keyed lock tamper proof", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Momentary contact switch",
    searchAliases: aliases("push button spring return", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Low-voltage momentary switch",
    searchAliases: aliases("lv relay push button control", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Motor-rated toggle switch",
    searchAliases: aliases("manual starter horsepower hp", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Door jamb switch",
    searchAliases: aliases("closet pantry automatic plunger", SWITCH_SLANG),
  },
  {
    ...device("Switches"),
    name: "Combination fan/light control",
    searchAliases: aliases(
      "ceiling paddle speed separate light single gang device"
    ),
  },
  {
    ...device("Switches"),
    name: "Fan speed control",
    searchAliases: aliases("ceiling paddle 3 speed quiet device"),
  },
  // Dimmers named by the lamp or driver they are rated for.
  ...[
    { name: "3-way dimmer", slang: "three 3way multi location" },
    { name: "Smart dimmer", slang: "wifi wi-fi zwave z-wave app connected" },
    { name: "0-10V dimmer", slang: "0-10 zero to ten led driver commercial" },
    { name: "ELV dimmer", slang: "electronic low voltage reverse phase led" },
    { name: "MLV dimmer", slang: "magnetic low voltage forward phase" },
  ].map(({ name, slang }) => ({
    ...device("Switches"),
    name,
    searchAliases: aliases(slang, "light dimming decora rocker slide"),
  })),
  {
    ...device("Switches"),
    name: "Dual-tech occupancy sensor switch",
    searchAliases: aliases(
      "motion pir ultrasonic dual technology detector",
      SWITCH_SLANG
    ),
  },
  {
    ...device("Switches"),
    name: "Ceiling occupancy sensor, PIR",
    searchAliases: aliases(
      "motion passive infrared detector line voltage low voltage"
    ),
  },
  {
    ...device("Switches"),
    name: "Ceiling occupancy sensor, dual-tech",
    searchAliases: aliases(
      "motion pir ultrasonic dual technology detector line voltage low voltage"
    ),
  },
];

// ─── Cover plates ─────────────────────────────────────────────────────────────

/** What a plate IS. Never what sits behind it — see the file header. */
const PLATE_SLANG = "cover faceplate face trim midway";

export const COVER_PLATES: BaselineMaterial[] = [
  {
    ...device("Wall Plates & Misc"),
    name: "Wall plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "1g one gang single decora decorator toggle standard"
    ),
    description: "1-gang. The 2- and 3-gang plates are separate items.",
  },
  {
    ...device("Wall Plates & Misc"),
    name: "2-gang wall plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "two gang 2g double decora decorator toggle"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "3-gang wall plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "three gang 3g triple decora decorator toggle"
    ),
  },
  // Moved from the pricing sheet, 2026-09-25.
  ...[
    { gangs: "4", slang: "four gang 4g" },
    { gangs: "5", slang: "five gang 5g" },
    { gangs: "6", slang: "six gang 6g" },
  ].map(({ gangs, slang }) => ({
    ...device("Wall Plates & Misc"),
    name: `${gangs}-gang wall plate`,
    searchAliases: aliases(PLATE_SLANG, slang, "decora decorator toggle"),
  })),
  {
    ...device("Wall Plates & Misc"),
    name: "Duplex/toggle combo plate",
    searchAliases: aliases(PLATE_SLANG, "two gang 2g combination mixed"),
  },
  {
    // On the sheet's Distribution Equipment list (a restaurant job); it is a
    // cover, so it lives with the covers.
    ...device("Wall Plates & Misc"),
    name: "Stainless steel weatherproof cover",
    searchAliases: aliases(
      "ss wp in-use while in use kitchen washdown restaurant outdoor"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Jumbo wall plate",
    searchAliases: aliases(PLATE_SLANG, "oversize oversized large bad cut"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Screwless wall plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "snap on hidden screw decora decorator"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Stainless steel wall plate",
    searchAliases: aliases(PLATE_SLANG, "ss metal commercial kitchen"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "1-gang blank plate",
    searchAliases: aliases(PLATE_SLANG, "one gang 1g solid no hole abandoned"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "2-gang blank plate",
    searchAliases: aliases(PLATE_SLANG, "two gang 2g solid no hole abandoned"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "3-gang blank plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "three gang 3g solid no hole abandoned"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "4-gang blank plate",
    searchAliases: aliases(PLATE_SLANG, "four gang 4g solid no hole abandoned"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Cable entry plate",
    searchAliases: aliases(
      PLATE_SLANG,
      "brush pass through low voltage tv cord grommet"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Weatherproof flip cover",
    searchAliases: aliases(
      "wp outdoor exterior lid spring self closing not in use"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Wall plate gasket",
    searchAliases: aliases("foam insulating draft seal sealer"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Wall plate screws",
    searchAliases: aliases("6-32 oval head cover faceplate matching colour"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Device mounting screw",
    searchAliases: aliases("6-32 long yoke strap box screw"),
  },
  {
    ...device("Wall Plates & Misc"),
    // Not "Receptacle shim", which is the sheet's word: a name starting with
    // "Receptacle" outranked the Duplex receptacle for "recep". Not "Device
    // spacer" either: it then led a search for "spa".
    name: "Device shim",
    searchAliases: aliases("spacers receptacle outlet washer level flush"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Device wing bracket",
    searchAliases: aliases("madison bar strap old work support hold"),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Weatherproof in-use cover",
    searchAliases: aliases(
      "wp bubble while while-in-use outdoor exterior flip lid rain tight"
    ),
  },
  {
    ...device("Wall Plates & Misc"),
    name: "Panel filler plate",
    searchAliases: aliases(
      "blank breaker space knockout twist out load center filler strip"
    ),
    defaultQty: 4,
  },
];
