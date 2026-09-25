/**
 * Grounding and bonding, life safety, fasteners and anchors, and the equipment
 * that gets connected at the end of a residential job.
 *
 * These four groups share a file because each is small and none is
 * combinatorial — every row here is a one-off named for what it is.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const item = (
  category:
    | "Grounding & Bonding"
    | "Life Safety"
    | "Fasteners & Anchors"
    | "Equipment & Appliances"
) => ({
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category,
});

export const GROUNDING: BaselineMaterial[] = [
  {
    ...item("Grounding & Bonding"),
    // Named rod-first so that typing "ground rod" lands on the rod rather than
    // on the clamp that goes with it.
    name: "Ground rod, 8 ft",
    searchAliases: aliases(
      "8ft eight foot 5/8 copper clad galvanized earth stake driven electrode"
    ),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Ground rod clamp",
    searchAliases: aliases("acorn direct burial bronze rod attachment gec"),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Grounding bushing",
    searchAliases: aliases(
      "insulated throat lug conduit bond myers hub set screw"
    ),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Bonding jumper",
    searchAliases: aliases("bond strap water pipe gas main green braided"),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Ground bar kit",
    searchAliases: aliases(
      "bus bar strip panel egc terminal isolated neutral kit busbar"
    ),
  },
  /*
    ── Moved from the pricing sheet, 2026-09-25 ─────────────────────────────
    Listed after the 8 ft rod on purpose: "ground rod" must still land on it
    first, and a tie falls to catalog order.
  */
  ...[
    { name: "Ground rod, 10 ft", slang: "10ft ten foot 5/8 copper clad" },
    {
      name: 'Ground rod, 3/4" x 10 ft',
      slang: "10ft ten foot 3/4 three quarter copper clad heavy",
    },
    { name: "Ground rod coupling", slang: "threaded compression join extend" },
    { name: "Ground rod driving stud", slang: "drive head cap sds hammer" },
    {
      name: "Ground plate electrode",
      slang: "plate copper buried earth grounding",
    },
    {
      name: "Water pipe bonding clamp",
      slang: "cold water gas pipe bond bronze gec",
    },
    {
      name: "Rebar ground clamp",
      slang: "ufer concrete encased electrode cee",
    },
    {
      name: "Intersystem bonding bridge",
      slang: "ibt termination telecom cable tv bond service",
    },
    { name: "Ground lug, mechanical", slang: "lay in set screw bond egc" },
    { name: "Ground lug, compression", slang: "crimp bond egc" },
    { name: "Grounding pigtail", slang: "green ground wire lead device" },
    { name: "Grounding screw", slang: "green 10-32 ground" },
    { name: "Ground wire staple", slang: "bare copper gec fastener" },
    { name: "Exothermic weld mold", slang: "cadweld thermoweld graphite" },
    { name: "Exothermic weld powder", slang: "cadweld thermoweld shot charge" },
  ].map(({ name, slang }) => ({
    ...item("Grounding & Bonding"),
    name,
    searchAliases: aliases(slang),
  })),
];

export const LIFE_SAFETY: BaselineMaterial[] = [
  {
    ...item("Life Safety"),
    name: "Hardwired smoke detector",
    searchAliases: aliases(
      "smoke alarm interconnect 120v battery backup photoelectric ionization"
    ),
    description:
      "Smoke only. The combination smoke/CO unit is a separate item.",
  },
  {
    ...item("Life Safety"),
    name: "Hardwired smoke/CO detector",
    searchAliases: aliases(
      "smoke alarm carbon monoxide combo combination interconnect 120v backup"
    ),
    description: "Combination unit. The smoke-only version is a separate item.",
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm pull station",
    searchAliases: aliases(
      "manual pull double action red fa addressable initiating"
    ),
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm horn/strobe",
    searchAliases: aliases(
      "notification appliance nac audible visual candela wall ceiling fa"
    ),
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm control panel",
    searchAliases: aliases(
      "facp addressable conventional zone annunciator fa head end"
    ),
  },
  /*
    ── Moved from the pricing sheet, 2026-09-25 ─────────────────────────────
    No name here starts with "Smoke": a name that begins with the words
    typed scores above one that does not, and "smoke detector" must still
    land on the hardwired detector rather than on a base or a harness.
  */
  ...[
    {
      name: "Hardwired smoke detector, 10-year",
      slang: "smoke alarm sealed lithium battery backup interconnect 120v",
    },
    {
      name: "Hardwired CO detector",
      slang: "carbon monoxide alarm interconnect 120v battery backup",
    },
    { name: "Heat detector", slang: "fixed temperature rate of rise garage" },
    {
      name: "Duct smoke detector",
      slang: "hvac air handler rtu shutdown housing sampling tube",
    },
    { name: "Beam detector", slang: "projected beam reflector atrium smoke" },
    { name: "Detector base", slang: "smoke head plug in twist addressable" },
    {
      name: "Detector mounting bracket",
      slang: "smoke alarm adapter plate ring",
    },
    {
      name: "Detector wiring harness",
      slang: "smoke alarm interconnect pigtail adapter plug",
    },
    {
      name: "Detector relay module",
      slang: "smoke alarm interconnect auxiliary contact hvac shutdown",
    },
    {
      name: "Addressable module",
      slang: "monitor input control output interface fa slc",
    },
    { name: "Fire alarm relay module", slang: "control output fa slc" },
    {
      name: "Fire alarm strobe",
      slang: "notification appliance nac visual candela fa",
    },
    {
      name: "Fire alarm speaker/strobe",
      slang: "notification appliance voice evac audible visual fa",
    },
    {
      name: "Fire alarm remote annunciator",
      slang: "facp display lcd fa lobby",
    },
    {
      name: "Fire alarm battery",
      slang: "sla sealed lead acid 12v 7ah 18ah facp standby",
    },
    { name: "End-of-line resistor", slang: "eol supervision zone fa" },
    {
      name: "Rapid-entry key box",
      slang: "knox box fire department lock vault",
    },
    {
      name: "Emergency exit light combo",
      slang: "egress battery backup running man twin head led",
    },
  ].map(({ name, slang }) => ({
    ...item("Life Safety"),
    name,
    searchAliases: aliases(slang),
  })),
];

export const FASTENERS: BaselineMaterial[] = [
  {
    ...item("Fasteners & Anchors"),
    name: "Drywall anchor",
    searchAliases: aliases(
      "hollow wall plastic toggle sheetrock gypsum plug screw"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Toggle bolt",
    searchAliases: aliases(
      "butterfly spring wing hollow wall anchor snap heavy"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Concrete wedge anchor",
    // "drop in" came out 2026-09-25, when the drop-in anchor became its own
    // item: a wedge anchor is not one.
    searchAliases: aliases("stud red head expansion masonry bolt kwik"),
    defaultQty: 4,
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...item("Fasteners & Anchors"),
    name: "Drop-in anchor",
    searchAliases: aliases(
      "dropin concrete flush female internal thread set tool rod hanger"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Sleeve anchor",
    searchAliases: aliases("concrete masonry block brick expansion hex nut"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Powder-actuated pin",
    searchAliases: aliases(
      "shot pin ramset hilti pa fastener nail load concrete steel"
    ),
    defaultQty: 10,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Plastic conduit clip",
    searchAliases: aliases("snap emt nm cable holder nail on surface"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Masonry screw",
    searchAliases: aliases("tapcon concrete block brick blue hammer drill"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Self-drilling screw",
    searchAliases: aliases("tek sheet metal stud zip point hex head"),
    defaultQty: 10,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Beam clamp",
    searchAliases: aliases("purlin i beam steel hanger rod c clamp structural"),
    defaultQty: 2,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Rod hanger clip",
    searchAliases: aliases(
      "caddy flange clip bat wing rod hanger threaded attachment"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "J-hook",
    searchAliases: aliases(
      "jhook cable support bridle ring low voltage batwing hanger"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Ceiling support wire",
    searchAliases: aliases(
      "tie wire grid t-bar independent support 12 gauge slack"
    ),
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Conduit hanger with bolt",
    searchAliases: aliases("clamp rod threaded pipe ring support suspended"),
    defaultQty: 3,
  },
];

/**
 * The equipment a residential job connects at the end. Generic and unpriced —
 * a fan or an EVSE is chosen by the homeowner, and the row exists so the labor
 * and the connection materials do not get forgotten alongside it.
 */
export const EQUIPMENT: BaselineMaterial[] = [
  {
    ...item("Equipment & Appliances"),
    name: "Bath exhaust fan",
    searchAliases: aliases(
      "vent fan bathroom ceiling exhaust cfm humidity light combo"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Range hood fan",
    searchAliases: aliases("vent kitchen stove over exhaust ducted downdraft"),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Attic fan",
    searchAliases: aliases(
      "gable roof ventilator whole house thermostat exhaust"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "EV charger",
    searchAliases: aliases(
      // "40 amp" came off on 2026-09-25, when the 32A, 40A and 48A chargers
      // joined as their own rows.
      "evse electric vehicle car level 2 charging station tesla j1772"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Whole-house surge protector",
    searchAliases: aliases(
      "spd tvss panel mounted lightning suppressor type 2 service"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Generator interlock kit",
    searchAliases: aliases(
      "backfeed slide plate panel breaker portable standby"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Manual transfer switch",
    searchAliases: aliases(
      "generator portable standby 6 circuit 10 circuit inlet switchover"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Doorbell transformer",
    searchAliases: aliases(
      "chime 16v 24v 30va video low voltage bell xfmr ring nest"
    ),
  },
  /*
    ── Moved from the pricing sheet, 2026-09-25 ─────────────────────────────
    What a residential job connects, by the job the sheet walked: bath fan,
    ceiling fan, EV charger, generator, spa, well pump. Aliases avoid the
    full names of the shipped fans and switches so none of these competes
    with the equipment it serves.
  */
  ...[
    ...["50", "80", "110", "150"].map(cfm => ({
      name: `Bath exhaust fan, ${cfm} CFM`,
      slang: `${cfm}cfm vent bathroom ceiling`,
    })),
    {
      name: "Bath exhaust fan, light combo",
      slang: "vent bathroom ceiling light",
    },
    {
      name: "Bath exhaust fan, heater combo",
      slang: "vent bathroom ceiling heat",
    },
    // Not the sheet's "Bath fan grille", nor "Exhaust fan replacement
    // grille": a name that starts with the words searched led that search.
    { name: "Replacement fan grille", slang: "bath exhaust vent cover" },
    { name: "Humidity sensor switch", slang: "bath vent auto control" },
    { name: "Inline duct fan", slang: "booster remote mount exhaust" },
    ...['4"', '6"'].map(size => ({
      name: `${size} backdraft damper`,
      slang: `${size.replace('"', "")} duct vent flap`,
    })),
    ...['4"', '6"'].map(size => ({
      name: `${size} insulated flex duct`,
      slang: `${size.replace('"', "")} vent exhaust flexible`,
    })),
    { name: '4" roof vent cap', slang: "4 exhaust jack termination" },
    { name: '4" wall vent cap', slang: "4 exhaust hood termination" },
    { name: "Duct clamp", slang: "hose clamp vent band" },
    { name: "Foil duct tape", slang: "aluminum hvac vent" },
    {
      name: "Fan balancing kit",
      slang: "wobble weights paddle blade",
    },
    ...['12"', '24"', '36"'].map(size => ({
      name: `${size} fan downrod`,
      slang: `${size.replace('"', "")} paddle extension pipe`,
    })),
    { name: "Sloped ceiling fan adapter", slang: "vaulted angled canopy" },
    { name: "Ceiling fan remote kit", slang: "paddle receiver handheld" },
    { name: "Attic fan thermostat", slang: "gable ventilator control" },
    { name: "Baseboard heater", slang: "electric heat 240v wall" },
    { name: "Baseboard heater thermostat", slang: "line voltage wall" },
    { name: "Unit heater", slang: "garage shop hanging electric heat" },
    { name: "Snow melt controller", slang: "heat trace de-icing sensor" },
    ...["32", "40", "48"].map(amps => ({
      name: `${amps}A EV charger`,
      slang: `${amps} amp evse electric vehicle car level 2 j1772`,
    })),
    // Not "EV charger pedestal": it led "ev charger" above the chargers.
    { name: "EVSE pedestal", slang: "ev charging mount post stand" },
    // No "disconnect": the whip runs FROM one, and the alias made it lead "ac
    // disconnect" above the pullout disconnect itself (2026-09-25).
    { name: "AC condenser whip", slang: "a/c liquidtight hvac flex" },
    { name: "Dishwasher whip", slang: "cord appliance hardwire flex" },
    { name: "Garbage disposal cord", slang: "disposer cord appliance plug" },
    ...["3", "4"].map(wires => ({
      name: `Dryer cord, ${wires}-wire`,
      slang: `${wires} prong pigtail appliance 30 amp`,
    })),
    ...["3", "4"].map(wires => ({
      name: `Range cord, ${wires}-wire`,
      slang: `${wires} prong pigtail stove oven 50 amp`,
    })),
    ...["30", "50"].map(amps => ({
      name: `${amps}A power inlet box`,
      slang: `${amps} amp generator inlet portable backfeed`,
    })),
    ...["30", "50"].map(amps => ({
      name: `${amps}A generator cord`,
      slang: `${amps} amp portable extension twist lock`,
    })),
    /*
      "Cord cap", the trade's word for the male end, rather than the sheet's
      "Generator plug": a name whose head noun is "plug" led every search for
      "plug", which on a job means a receptacle.
    */
    {
      name: "Generator cord cap, L14-30",
      slang: "plug l14-30p twist lock 30 amp male",
    },
    {
      name: "Generator cord cap, CS6365",
      slang: "plug cs6364 50 amp twist lock male",
    },
    { name: "Generator battery charger", slang: "standby trickle maintainer" },
    { name: "Generator pad", slang: "standby composite base mount" },
    { name: "Spa bonding lug", slang: "pool hot tub equipotential bond" },
    { name: "Pump control relay", slang: "well sump contactor" },
    { name: "Well pump control box", slang: "submersible 3 wire capacitor" },
    { name: "Well pump pressure switch", slang: "30/50 40/60 square d" },
    { name: "Well pump pitless adapter", slang: "casing submersible" },
    {
      name: "Submersible pump splice kit",
      slang: "well heat shrink waterproof",
    },
    { name: "Sump pump alarm", slang: "high water basement flood" },
  ].map(({ name, slang }) => ({
    ...item("Equipment & Appliances"),
    name,
    searchAliases: aliases(slang),
  })),
];
