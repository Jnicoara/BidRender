/**
 * Build `pricing/starter-catalog-pricing.xlsx` from the live starter catalog.
 *
 *   npx tsx pricing/buildPricingSheet.mts          # writes rows.json beside it
 *
 * ── Why this is kept rather than thrown away ─────────────────────────────────
 * The sheet has been regenerated twice already. Keeping the generator makes the
 * workbook reproducible and, more importantly, makes it start from the REAL
 * catalog every time — so an item added to `server/seed/materials/*` cannot
 * quietly fall out of the pricing list, and a duplicate cannot be introduced by
 * anybody typing beside the catalog instead of from it.
 *
 * ── The additions are organised by JOB, not by category ──────────────────────
 * Walking categories produces a tidy list with holes in it. Walking a job —
 * rough-in, trim, service upgrade, a Dollar Tree remodel — produces the thing
 * somebody actually reaches for and then cannot find. Each block below is one
 * job type, and the comment says which job found it.
 *
 * Brands appear on panels and breakers ONLY (CLAUDE.md § Brands). Everything
 * else is generic by type and size.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE_MATERIALS } from "../server/seed/materials/index";
import { compareBySize } from "../shared/materialSizeOrder";

const HERE = path.dirname(fileURLToPath(import.meta.url));

type Row = {
  parent: string;
  category: string;
  name: string;
  size: string;
  unit: string;
  isNew: boolean;
  brand: string;
  job: string;
};

const rows: Row[] = [];
const seen = new Set<string>();
const jobTally = new Map<string, number>();

const add = (
  name: string,
  category: string,
  unit: string,
  isNew: boolean,
  job = ""
) => {
  const key = name.trim().toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  rows.push({
    parent: name,
    category,
    name,
    size: "",
    unit,
    isNew,
    brand: "",
    job,
  });
  if (isNew && job) jobTally.set(job, (jobTally.get(job) ?? 0) + 1);
  return true;
};
const E = "each";
const FT = "foot";
/** Add a whole list into one category, all attributed to one job. */
const addAll = (
  names: string[],
  category: string,
  unit: string,
  job: string
) => {
  for (const n of names) add(n, category, unit, true, job);
};

// ── 1. Every existing starter material, exactly as it is ────────────────────
for (const m of BASELINE_MATERIALS) {
  add(m.name, m.category ?? "Consumables", m.unitOfSale, false);
}
const existingCount = rows.length;

// ── 2. Round one: the category sweep from 2026-09-21 ────────────────────────
const canSizes = ['3"', '4"', '5"', '6"'];
for (const s of canSizes) {
  for (const h of [
    "new construction IC",
    "new construction non-IC",
    "remodel IC",
    "remodel non-IC",
    "airtight shallow",
    "sloped ceiling",
  ])
    add(
      `${s} recessed can, ${h}`,
      "Lighting Hardware",
      E,
      true,
      "Residential — rough-in"
    );
  for (const t of [
    "baffle trim",
    "reflector trim",
    "gimbal trim",
    "eyeball trim",
    "shower wet-rated trim",
    "adjustable trim",
    "open trim",
  ])
    add(`${s} ${t}`, "Lighting Hardware", E, true, "Residential — trim-out");
}
for (const s of ['2"', '3"', '4"', '5"', '6"', '8"']) {
  for (const v of ["CCT selectable", "slim", "gimbal", "wet rated"])
    add(
      `${s} wafer LED downlight, ${v}`,
      "Lighting Hardware",
      E,
      true,
      "Residential — trim-out"
    );
  add(
    `${s} canless LED downlight`,
    "Lighting Hardware",
    E,
    true,
    "Residential — trim-out"
  );
}
for (const s of ['4"', '5"', '6"', '7"']) {
  add(
    `${s} LED disc light`,
    "Lighting Hardware",
    E,
    true,
    "Residential — trim-out"
  );
  add(
    `${s} LED disc light, CCT selectable`,
    "Lighting Hardware",
    E,
    true,
    "Residential — trim-out"
  );
}
addAll(
  [
    "2x2 LED troffer",
    "2x4 LED troffer",
    "1x4 LED troffer",
    "2 ft LED strip fixture",
    "4 ft LED wraparound",
    "8 ft LED wraparound",
    "4 ft vapor tight fixture",
    "8 ft vapor tight fixture",
    "LED linear high bay",
    "LED round high bay",
    "LED canopy light",
    "LED area light",
    "LED wall sconce",
    "LED step light",
    "LED cylinder downlight",
    "LED pendant fixture",
    "Drum ceiling fixture",
    "Flush mount ceiling fixture",
    "Semi-flush ceiling fixture",
    "Vanity light bar",
    "LED mirror light",
    "Chandelier",
    "Recessed can conversion kit",
    "LED retrofit kit",
    "Photocell for wall pack",
    "Pole mounting arm",
    "Pole base cover",
    "Emergency battery backup pack",
    "Exit sign, double face",
    "Exit sign, remote head",
    "LED tape light power supply",
    "Tape light channel",
    "Track light end feed",
    "Track light connector",
    "Occupancy sensor, ceiling mount",
    "Occupancy sensor, high bay",
    "Daylight sensor",
    "Fixture whip, 4 ft",
    "Fixture whip, 8 ft",
  ],
  "Lighting Hardware",
  E,
  "Commercial — tenant improvement"
);

addAll(
  [
    "15A duplex receptacle",
    "15A tamper-resistant receptacle",
    "20A tamper-resistant receptacle",
    "15A weather-resistant receptacle",
    "20A weather-resistant receptacle",
    "15A TR/WR receptacle",
    "20A TR/WR receptacle",
    "15A single receptacle",
    "20A single receptacle",
    "15A quad receptacle",
    "20A quad receptacle",
    "15A GFCI receptacle",
    "20A GFCI receptacle",
    "15A GFCI receptacle, weather-resistant",
    "20A GFCI receptacle, weather-resistant",
    "Dead-front GFCI receptacle",
    "15A AFCI receptacle",
    "Hospital-grade receptacle",
    "Isolated-ground receptacle",
    "Controlled duplex receptacle",
    "USB-C combo receptacle",
    "Floor receptacle assembly",
    "Pop-up floor receptacle",
    "20A twist-lock receptacle",
    "30A twist-lock receptacle",
    "50A twist-lock receptacle",
    "L14-30 receptacle",
    "L5-20 receptacle",
    "L6-30 receptacle",
    "30A RV receptacle",
    "50A RV receptacle",
    "15A surge-protective receptacle",
    "Recessed clock receptacle",
    "Recessed TV receptacle box",
    "Self-test GFCI receptacle",
  ],
  "Receptacles",
  E,
  "Residential — trim-out"
);

addAll(
  [
    "20A single-pole switch",
    "20A 3-way switch",
    "20A 4-way switch",
    "Double switch",
    "Triple switch",
    "Pilot-light switch",
    "Illuminated switch",
    "Key switch",
    "Momentary contact switch",
    "Door jamb switch",
    "Rotary dimmer",
    "Slide dimmer",
    "3-way dimmer",
    "0-10V dimmer",
    "ELV dimmer",
    "MLV dimmer",
    "Smart dimmer",
    "Fan speed control",
    "Combination fan/light control",
    "Spring-wound timer switch",
    "Digital in-wall timer",
    "Astronomic time switch",
    "Dual-tech occupancy sensor switch",
    "Ceiling occupancy sensor, PIR",
    "Ceiling occupancy sensor, dual-tech",
    "Wall-mount vacancy sensor",
    "30A double-pole switch",
    "Motor-rated toggle switch",
    "Weatherproof toggle switch",
    "Low-voltage momentary switch",
  ],
  "Switches",
  E,
  "Residential — trim-out"
);

const PANEL_SPACES: Record<string, string[]> = {
  "60A": ["8-space", "12-space"],
  "100A": ["12-space", "20-space", "24-space"],
  "125A": ["20-space", "24-space", "30-space"],
  "150A": ["30-space", "40-space"],
  "200A": ["30-space", "40-space", "42-space"],
  "225A": ["42-space"],
  "400A": ["42-space"],
};
for (const [a, spaces] of Object.entries(PANEL_SPACES)) {
  for (const sp of spaces) {
    add(
      `${a} ${sp} main breaker panel`,
      "Panels",
      E,
      true,
      "Residential — service upgrade"
    );
    add(
      `${a} ${sp} main lug panel`,
      "Panels",
      E,
      true,
      "Specialty — shop/garage subpanel"
    );
  }
}
addAll(
  ["100A outdoor main breaker panel", "200A outdoor main breaker panel"],
  "Panels",
  E,
  "Residential — service upgrade"
);
addAll(
  [
    "Generator ready load center",
    "Combination meter-main panel",
    "Panel cover, flush",
    "Panel cover, surface",
    "Panel trim ring",
    "Feed-through lug kit",
    "Sub-feed breaker kit",
    "Panel ground bar",
    "Panel neutral bar",
    "Panelboard interior only",
  ],
  "Panels",
  E,
  "Residential — service upgrade"
);

for (const a of [
  "15A",
  "20A",
  "25A",
  "30A",
  "35A",
  "40A",
  "45A",
  "50A",
  "60A",
  "70A",
])
  add(`${a} 1-Pole breaker`, "Breakers", E, true, "Residential — rough-in");
for (const a of [
  "15A",
  "25A",
  "35A",
  "45A",
  "80A",
  "90A",
  "110A",
  "125A",
  "150A",
  "175A",
  "200A",
])
  add(
    `${a} 2-Pole breaker`,
    "Breakers",
    E,
    true,
    "Residential — service upgrade"
  );
for (const a of [
  "20A",
  "30A",
  "40A",
  "50A",
  "60A",
  "70A",
  "100A",
  "125A",
  "150A",
  "200A",
])
  add(
    `${a} 3-Pole breaker`,
    "Breakers",
    E,
    true,
    "Commercial — tenant improvement"
  );
addAll(
  [
    "25A AFCI breaker",
    "30A AFCI breaker",
    "15A dual-function breaker",
    "20A dual-function breaker",
    "30A GFCI breaker",
    "40A 2-Pole GFCI breaker",
    "100A 2-Pole main breaker",
    "125A 2-Pole main breaker",
    "150A 2-Pole main breaker",
    "200A 2-Pole main breaker",
    "20/15 tandem breaker",
    "30/30 tandem breaker",
    "15A quad tandem breaker",
    "20A quad tandem breaker",
    "Breaker lock-off",
    "Breaker handle tie",
    "Breaker filler plate",
  ],
  "Breakers",
  E,
  "Residential — service upgrade"
);

addAll(
  [
    "Ground rod, 10 ft",
    "Ground rod, 5/8 in x 8 ft",
    "Ground rod, 3/4 in x 10 ft",
    "Ground rod coupling",
    "Ground rod driving stud",
    "Acorn ground clamp",
    "Water pipe bonding clamp",
    "Gas line bonding clamp",
    "Exothermic weld mold",
    "Exothermic weld powder",
    "Ground lug, mechanical",
    "Ground lug, compression",
    "Ground busbar",
    "Ground plate electrode",
    "Rebar ground clamp",
    "Ground wire staple",
    "Grounding pigtail",
    "Grounding screw",
    "Intersystem bonding bridge",
  ],
  "Grounding & Bonding",
  E,
  "Residential — service upgrade"
);

addAll(
  [
    "Hardwired CO detector",
    "Heat detector",
    "Duct smoke detector",
    "Smoke detector base",
    "Fire alarm strobe",
    "Fire alarm speaker/strobe",
    "Fire alarm remote annunciator",
    "Fire alarm battery",
    "End-of-line resistor",
    "Dual-action pull station",
    "Addressable module",
    "Fire alarm relay module",
    "Beam detector",
    "Emergency exit light combo",
    "Fire alarm knox box",
  ],
  "Life Safety",
  E,
  "Commercial — tenant improvement"
);

addAll(
  [
    "Cat5e cable",
    "Cat6A cable",
    "Cat6 shielded cable",
    "Cat5e jack",
    "Cat6A jack",
    "Keystone wall plate, 1-port",
    "Keystone wall plate, 2-port",
    "Keystone wall plate, 4-port",
    "Keystone wall plate, 6-port",
    "Cat5e patch panel",
    "Fiber patch panel",
    "Fiber optic cable",
    "RG11 coax cable",
    "Coax wall plate",
    "Coax splitter",
    "18/2 thermostat wire",
    "18/5 thermostat wire",
    "18/8 thermostat wire",
    "22/4 security cable",
    "22/2 security cable",
    "Security camera cable",
    "Doorbell wire",
    "Video doorbell transformer",
    "Network rack, wall mount",
    "Structured media enclosure",
    "HDMI wall plate",
    "Speaker wall plate",
    "In-ceiling speaker",
    "Volume control",
    "Low-voltage mounting bracket",
  ],
  "Low Voltage",
  E,
  "Low voltage — data"
);

addAll(
  [
    "Water heater disconnect",
    "Garbage disposal cord",
    "Dishwasher whip",
    "Range cord, 3-wire",
    "Range cord, 4-wire",
    "Dryer cord, 3-wire",
    "Dryer cord, 4-wire",
    "Mini-split disconnect",
    "Heat pump disconnect",
    "AC condenser whip",
    "Hot tub GFCI panel",
    "Well pump control box",
    "Sump pump alarm",
    "Generator inlet box",
    "32A EV charger",
    "40A EV charger",
    "48A EV charger",
    "EV charger pedestal",
    "Ceiling fan remote kit",
    "Bath fan with light",
    "Inline duct fan",
    "Attic fan thermostat",
    "Baseboard heater",
    "Baseboard heater thermostat",
    "Unit heater",
    "Snow melt controller",
  ],
  "Equipment & Appliances",
  E,
  "Specialty — EV charger"
);

addAll(
  [
    "30A safety switch",
    "60A safety switch",
    "100A safety switch",
    "200A safety switch",
    "400A safety switch",
    "600A safety switch",
    "30A NEMA 3R safety switch",
    "60A NEMA 3R safety switch",
    "100A NEMA 3R safety switch",
    "200A NEMA 3R safety switch",
    "Current transformer cabinet",
    "Wireway, 4x4",
    "Wireway, 6x6",
    "Wireway elbow",
    "Wireway coupling",
    "Cable tray elbow",
    "Cable tray tee",
    "Cable tray support bracket",
    "Busway elbow",
    "Motor starter, size 0",
    "Motor starter, size 1",
    "Motor starter, size 2",
    "Combination motor starter",
    "Variable frequency drive",
    "Photocell contactor",
    "Panelboard, 208V 3-phase",
    "Panelboard, 480V 3-phase",
    "Step-down transformer, 15 kVA",
    "Step-down transformer, 30 kVA",
    "Step-down transformer, 45 kVA",
    "Step-down transformer, 75 kVA",
  ],
  "Distribution Equipment",
  E,
  "Commercial — tenant improvement"
);

addAll(
  [
    "4-gang wall plate",
    "5-gang wall plate",
    "6-gang wall plate",
    "1-gang decorator plate",
    "2-gang decorator plate",
    "3-gang decorator plate",
    "Jumbo wall plate",
    "Stainless steel wall plate",
    "Weatherproof flip cover",
    "Weatherproof cover, 2-gang",
    "Cable entry plate",
    "Blank plate, 4-gang",
    "GFCI wall plate",
    "Duplex/toggle combo plate",
    "Wall plate screws",
  ],
  "Wall Plates & Misc",
  E,
  "Residential — trim-out"
);

addAll(
  [
    "Wire pulling soap",
    "Cable lubricant gel",
    "Panel directory label",
    "Arc flash label",
    "Silicone sealant",
    "Expanding foam",
    "Thread sealant",
    "Wire nuts, assorted",
    "Push-in connectors",
    "Split bolt connector",
    "Electrical putty pad",
  ],
  "Consumables",
  E,
  "Residential — rough-in"
);

addAll(
  [
    "Sleeve anchor",
    "Drop-in anchor",
    "Powder-actuated pin",
    "Strut nut",
    "Strut spring nut",
    "All-thread rod, 3/8 in",
    "All-thread rod, 1/2 in",
    "Rod coupling nut",
    "Washer, flat",
    "Lock washer",
    "Hex nut",
    "Tapcon screw",
    "Plastic conduit clip",
    "Nail-on cable staple",
    "Insulated staple",
  ],
  "Fasteners & Anchors",
  E,
  "Commercial — tenant improvement"
);

addAll(
  [
    "Old-work single-gang box",
    "Old-work double-gang box",
    "Old-work triple-gang box",
    "4-gang box",
    "5-gang box",
    "Ceiling fan brace box",
    "Shallow round box",
    "Masonry box, single-gang",
    "Masonry box, double-gang",
    "Weatherproof box, triple-gang",
    "16x16 pull box",
    "24x24 pull box",
    "Junction box cover, 4 in",
    "Junction box cover, 4-11/16 in",
    "Extension ring, 4 in",
    "Extension ring, single-gang",
    "Box extender",
    "Low-voltage mud ring",
  ],
  "Boxes",
  E,
  "Residential — remodel"
);

addAll(
  [
    "10/3 NM-B",
    "8/3 NM-B",
    "6/3 NM-B",
    "14/3 NM-B",
    "12/3 NM-B",
    "10/2 UF-B",
    "12/2 UF-B",
    "14/2 UF-B",
    "12/3 MC cable",
    "10/2 MC cable",
    "10/3 MC cable",
    "8/3 MC cable",
    "Fire alarm cable, 14/2",
    "Fire alarm cable, 16/2",
    "Tray cable, 12/3",
    "SOOW cord, 12/3",
    "SOOW cord, 10/3",
    "SJOOW cord, 14/3",
    "Bare copper, #4",
    "Bare copper, #2",
    "Bare copper, 1/0",
    "XHHW-2, #2",
    "XHHW-2, 1/0",
    "XHHW-2, 4/0",
    "USE-2, 4/0",
    "Aluminum SER, 4/0",
    "Aluminum URD, 1/0",
  ],
  "Wire & Cable",
  FT,
  "Residential — rough-in"
);

addAll(
  ['4" EMT', '4" rigid conduit', '3-1/2" EMT', '3-1/2" PVC Sch 40'],
  "Conduit",
  FT,
  "Commercial — tenant improvement"
);
addAll(
  [
    '4" EMT connector',
    '4" EMT coupling',
    '4" rigid coupling',
    '3-1/2" EMT connector',
    '3-1/2" EMT coupling',
    'Conduit body, 4" LB',
    'Conduit body, 3-1/2" LB',
    "Reducing washer set",
    'Chase nipple, 4"',
  ],
  "Conduit Fittings",
  E,
  "Commercial — tenant improvement"
);
addAll(
  [
    "Mechanical lug, 4/0",
    "Mechanical lug, 350 kcmil",
    "Compression lug, 4/0",
    "Compression lug, 350 kcmil",
    "Polaris connector, 4/0",
    "Insulated multi-tap block",
    "Crimp sleeve, #2",
    "Crimp sleeve, 4/0",
    "Ferrule kit",
    "Terminal block",
    "Din rail",
  ],
  "Connectors & Terminations",
  E,
  "Residential — service upgrade"
);
addAll(
  [
    "Strut, 1-5/8 in x 1-5/8 in",
    "Strut, 1-5/8 in x 13/16 in",
    "Strut post base",
    "Strut wing connector",
    "Strut 90-degree fitting",
    "Strut flat plate",
    "Trapeze hanger kit",
    "Pipe strap, 4 in",
    "Unistrut end cap",
    "Threaded rod stiffener",
  ],
  "Strut & Supports",
  E,
  "Commercial — tenant improvement"
);

// ── 3. Round two: the JOB WALK, 2026-09-21 ──────────────────────────────────
// Each block is one real job, listing what you reach for and cannot find.

// Residential — rough-in. Protection and support is where the holes were.
addAll(
  [
    "Nail plate, 1-1/2 in",
    "Nail plate, 3 in",
    "Steel stud grommet",
    "Stud guard plate",
    "Cable protection plate, 5 in",
    "Romex staple, 1/2 in",
    "Romex staple, 3/4 in",
    "Stacker staple",
    "Drywall repair ring",
    "Plaster ring, 1/2 in",
    "Plaster ring, 5/8 in",
    "Wire pulling grip",
    "Cable support bushing",
    "Anti-short bushing",
    "Panel knockout seal",
  ],
  "Boxes",
  E,
  "Residential — rough-in"
);
addAll(
  [
    "Romex connector, 1/2 in",
    "Romex connector, 3/4 in",
    "Two-screw NM connector",
    "Snap-in NM connector",
    "MC cable connector, 3/8 in",
    "MC cable connector, 1/2 in",
    "AC/MC snap connector",
    "Duplex NM connector",
  ],
  "Conduit Fittings",
  E,
  "Residential — rough-in"
);

// Residential — trim-out.
addAll(
  [
    "Device mounting screw",
    "Screwless wall plate",
    "Wall plate gasket",
    "Outlet box spacer",
    "Receptacle shim",
    "Device wing bracket",
  ],
  "Wall Plates & Misc",
  E,
  "Residential — trim-out"
);

// Residential — service upgrade. The mast and the meter were missing entirely.
addAll(
  [
    "Service mast, 2 in",
    "Service mast, 2-1/2 in",
    "Service mast, 3 in",
    "Weatherhead, 2 in",
    "Weatherhead, 2-1/2 in",
    "Weatherhead, 3 in",
    "Service entrance cap",
    "Mast roof flashing",
    "Mast guy wire kit",
    "Riser strap, 2 in",
    "Riser strap, 3 in",
    "Meter socket hub",
    "Meter socket adapter ring",
    "Meter seal",
    "Service entrance elbow",
    "Ground rod access well",
    "Main bonding jumper kit",
  ],
  "Service Entrance",
  E,
  "Residential — service upgrade"
);
addAll(
  [
    "SEU cable, 2-2-4",
    "SEU cable, 4-4-6",
    "SER cable, 2-2-2-4",
    "SER cable, 4-4-4-6",
    "SER cable, 1/0-1/0-1/0-2",
  ],
  "Wire & Cable",
  FT,
  "Residential — service upgrade"
);

// Residential — bath fan. The duct is bought by the electrician.
addAll(
  [
    "Bath fan, 50 CFM",
    "Bath fan, 80 CFM",
    "Bath fan, 110 CFM",
    "Bath fan, 150 CFM",
    "Bath fan with heater",
    "Humidity sensor switch",
    "Bath fan grille",
    "Backdraft damper, 4 in",
    "Backdraft damper, 6 in",
    "Insulated flex duct, 4 in",
    "Insulated flex duct, 6 in",
    "Roof vent cap, 4 in",
    "Wall vent cap, 4 in",
    "Duct clamp",
    "Foil duct tape",
  ],
  "Equipment & Appliances",
  E,
  "Residential — bath fan"
);

// Residential — ceiling fan.
addAll(
  [
    "Fan downrod, 12 in",
    "Fan downrod, 24 in",
    "Fan downrod, 36 in",
    "Sloped ceiling fan adapter",
    "Fan mounting brace, adjustable",
    "Fan balancing kit",
    "Fan wall control",
  ],
  "Equipment & Appliances",
  E,
  "Residential — ceiling fan"
);

// Residential — doorbell. The chime and button were both missing.
addAll(
  [
    "Doorbell chime, wired",
    "Doorbell chime, wireless",
    "Doorbell button",
    "Lighted doorbell button",
    "Video doorbell",
    "Video doorbell chime kit",
    "Doorbell diode",
    "Chime extender kit",
  ],
  "Low Voltage",
  E,
  "Residential — doorbell"
);

// Residential — smoke/CO.
addAll(
  [
    "Hardwired smoke detector, 10-year",
    "Smoke detector interconnect harness",
    "Detector mounting bracket",
    "Detector relay module",
  ],
  "Life Safety",
  E,
  "Residential — smoke/CO"
);

// Residential — remodel.
addAll(
  [
    "Old-work ceiling box",
    "Old-work fan box",
    "Retrofit bar hanger",
    "Wall plate extender",
    "Box relocation kit",
  ],
  "Boxes",
  E,
  "Residential — remodel"
);

// Commercial — tenant improvement: the ceiling grid, which was absent.
addAll(
  [
    "T-bar grid clip",
    "Caddy clip, 1/2 in",
    "Caddy clip, 3/4 in",
    "Ceiling grid support clip",
    "Fixture hanger bar",
    "Grid box bracket",
    "Independent support wire clip",
    "Batwing hanger",
    "Rod hanger, 1/4-20",
  ],
  "Strut & Supports",
  E,
  "Commercial — tenant improvement"
);

// Commercial — retail remodel. Surface raceway was the single biggest hole.
addAll(
  [
    "Surface raceway base, 500 series",
    "Surface raceway cover, 500 series",
    "Surface raceway base, 700 series",
    "Surface raceway cover, 700 series",
    "Surface raceway, 1500 series",
    "Surface raceway, 2400 series two-channel",
    "Raceway inside elbow",
    "Raceway outside elbow",
    "Raceway flat elbow",
    "Raceway tee fitting",
    "Raceway coupling",
    "Raceway end cap",
    "Raceway entrance end fitting",
    "Raceway device box, 1-gang",
    "Raceway device box, 2-gang",
    "Raceway fixture box",
    "Raceway blank end plate",
    "Raceway conduit connector",
    "Raceway divider clip",
    "Raceway mounting strap",
  ],
  "Surface Raceway",
  E,
  "Commercial — retail remodel"
);
addAll(
  [
    "Poke-through device, 2-service",
    "Poke-through device, 4-service",
    "Tele-power pole, 10 ft",
    "Tele-power pole, 15 ft",
    "Power pole fitting kit",
    "Floor monument, 2-gang",
    "Signage circuit timer",
  ],
  "Distribution Equipment",
  E,
  "Commercial — retail remodel"
);

// Commercial — office.
addAll(
  [
    "Modular furniture whip, 6 ft",
    "Modular furniture whip, 10 ft",
    "Furniture feed connector",
    "Under-carpet flat cable",
    "Raised floor box",
    "Desk grommet outlet",
  ],
  "Distribution Equipment",
  E,
  "Commercial — office"
);

// Commercial — restaurant.
addAll(
  [
    "Shunt-trip breaker, 2-Pole",
    "Shunt-trip breaker, 3-Pole",
    "Hood control interface relay",
    "Ansul micro-switch",
    "Equipment shut-off relay",
    "Stainless steel weatherproof cover",
    "Grease-rated cord set",
  ],
  "Distribution Equipment",
  E,
  "Commercial — restaurant"
);

// Specialty — generator and transfer.
addAll(
  [
    "Generator cord, 30A",
    "Generator cord, 50A",
    "Generator plug, L14-30",
    "Generator plug, CS6365",
    "Power inlet box, 30A",
    "Power inlet box, 50A",
    "Transfer switch, 6-circuit",
    "Transfer switch, 10-circuit",
    "Generator pad",
    "Generator battery charger",
  ],
  "Equipment & Appliances",
  E,
  "Specialty — generator/transfer"
);

// Specialty — hot tub / spa and well pump.
addAll(
  [
    "Spa bonding wire, #8 solid",
    "Spa bonding lug",
    "Spa manual disconnect",
    "Well pump pressure switch",
    "Well pump pitless adapter",
    "Submersible pump splice kit",
    "Pump control relay",
  ],
  "Equipment & Appliances",
  E,
  "Specialty — hot tub/well pump"
);

// Specialty — outdoor, landscape and site lighting.
addAll(
  [
    "Landscape light stake",
    "In-ground junction box",
    "Direct burial splice kit",
    "Landscape hub connector",
    "Path light fixture",
    "Well light fixture",
    "In-grade uplight",
    "Flood light, adjustable knuckle",
    "Photocell, stem mount",
    "Pole anchor bolt kit",
    "Pole handhole cover",
    "Pole base grout",
    "Tenon adapter",
    "Pole wire harness",
  ],
  "Lighting Hardware",
  E,
  "Specialty — outdoor/site lighting"
);

// Specialty — underground and trenching.
addAll(
  [
    "Underground warning tape",
    "Conduit spacer, 2 in",
    "Conduit spacer, 4 in",
    "Mule tape, 1800 lb",
    "Pull rope, 1/4 in",
    "Tracer wire",
    "Tracer wire access box",
    'PVC sweep, 2" 36 in radius',
    'PVC sweep, 3" 36 in radius',
    'PVC sweep, 4" 36 in radius',
    "Duct bank spacer",
    "Trench marker post",
    "Direct burial wire nut",
  ],
  "Underground",
  E,
  "Specialty — underground/trenching"
);

// Low voltage — data, TV, security.
addAll(
  [
    "Cat6 patch cord, 3 ft",
    "Cat6 patch cord, 7 ft",
    "Horizontal cable manager",
    "Vertical cable manager",
    "Velcro cable strap",
    "D-ring cable guide",
    "Rack shelf",
    "Patch panel blank",
    "Cable tester",
    "Coax amplifier",
    "Coax ground block",
    "Security camera, dome",
    "Security camera, bullet",
    "NVR enclosure",
    "Keypad mounting plate",
    "Thermostat wall plate",
    "Wire mold for low voltage",
  ],
  "Low Voltage",
  E,
  "Low voltage — data/TV/security"
);

const genericCount = rows.length;

// ── 4. Brand variants for panels and breakers only (CLAUDE.md § Brands) ─────
type Line = { brand: string; line: string; tandems: boolean; boltOn: boolean };
const LINES: Line[] = [
  { brand: "Square D", line: "Homeline", tandems: true, boltOn: false },
  { brand: "Square D", line: "QO", tandems: true, boltOn: false },
  { brand: "Eaton", line: "BR", tandems: true, boltOn: false },
  { brand: "Eaton", line: "CH", tandems: true, boltOn: false },
  { brand: "Siemens", line: "Siemens", tandems: true, boltOn: false },
  { brand: "ABB", line: "ABB", tandems: true, boltOn: false },
  { brand: "Leviton", line: "Leviton", tandems: false, boltOn: false },
  { brand: "Square D", line: "QOB", tandems: false, boltOn: true },
  { brand: "Eaton", line: "BAB", tandems: false, boltOn: true },
  { brand: "Siemens", line: "BQD", tandems: false, boltOn: true },
  { brand: "ABB", line: "THQB", tandems: false, boltOn: true },
];
const brandRows: Row[] = [];
const addBrand = (
  name: string,
  category: string,
  parent: string,
  brand: string
) => {
  const key = name.trim().toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  brandRows.push({
    parent,
    category,
    name,
    size: "",
    unit: E,
    isNew: true,
    brand,
    job: "",
  });
};
const B1 = ["15A", "20A", "25A", "30A", "40A", "50A", "60A"];
const B2 = [
  "15A",
  "20A",
  "30A",
  "40A",
  "50A",
  "60A",
  "70A",
  "80A",
  "90A",
  "100A",
  "125A",
  "150A",
  "200A",
];
for (const L of LINES) {
  const tag = L.line === L.brand ? L.brand : `${L.brand} ${L.line}`;
  for (const a of B1)
    addBrand(
      `${tag} ${a} 1-Pole breaker`,
      "Breakers",
      `${a} 1-Pole breaker`,
      L.brand
    );
  for (const a of B2)
    addBrand(
      `${tag} ${a} 2-Pole breaker`,
      "Breakers",
      `${a} 2-Pole breaker`,
      L.brand
    );
  if (!L.boltOn) {
    for (const a of ["15A", "20A"]) {
      addBrand(
        `${tag} ${a} AFCI breaker`,
        "Breakers",
        `${a} AFCI breaker`,
        L.brand
      );
      addBrand(
        `${tag} ${a} GFCI breaker`,
        "Breakers",
        `${a} GFCI breaker`,
        L.brand
      );
      addBrand(
        `${tag} ${a} dual-function breaker`,
        "Breakers",
        `${a} dual-function breaker`,
        L.brand
      );
    }
    for (const a of ["20A", "30A", "50A"])
      addBrand(
        `${tag} ${a} 2-Pole GFCI breaker`,
        "Breakers",
        `${a} 2-Pole GFCI breaker`,
        L.brand
      );
    for (const a of ["20A", "30A"])
      addBrand(
        `${tag} ${a} 2-Pole AFCI breaker`,
        "Breakers",
        `${a} 2-Pole AFCI breaker`,
        L.brand
      );
  } else {
    for (const a of ["20A", "30A"])
      addBrand(
        `${tag} ${a} 2-Pole GFCI breaker`,
        "Breakers",
        `${a} 2-Pole GFCI breaker`,
        L.brand
      );
  }
  if (L.tandems)
    for (const t of ["15/15", "20/20", "15/20"])
      addBrand(
        `${tag} ${t} tandem breaker`,
        "Breakers",
        `${t} tandem breaker`,
        L.brand
      );
  if (!L.boltOn) {
    for (const a of ["100A", "125A", "150A", "200A"]) {
      const spaces = PANEL_SPACES[a] ?? ["20-space"];
      for (const sp of spaces)
        addBrand(
          `${tag} ${a} ${sp} main breaker panel`,
          "Panels",
          `${a} ${sp} main breaker panel`,
          L.brand
        );
      addBrand(
        `${tag} ${a} main lug panel`,
        "Panels",
        `${a} ${spaces[0]} main lug panel`,
        L.brand
      );
    }
    addBrand(
      `${tag} outdoor main breaker panel`,
      "Panels",
      "200A outdoor main breaker panel",
      L.brand
    );
  }
}

// ── 5. Size column, then sort by category and physical size ─────────────────
const SIZE_RX =
  /(#\d+|\d+\/0|\d+\s*kcmil|\d+(?:-\d+\/\d+)?(?:\s*\d+\/\d+)?\s*(?:"|in\b|ft\b)|\d+\/\d+\s*(?:"|in\b)|\d+A\b|\d+\s*kVA|\d+-space|\d+x\d+|\d+\s*CFM)/i;
for (const r of [...rows, ...brandRows]) {
  const m = r.name.match(SIZE_RX);
  r.size = m ? m[0].trim() : "";
}
const CATEGORY_ORDER = [
  "Wire & Cable",
  "Conduit",
  "Conduit Fittings",
  "Surface Raceway",
  "Underground",
  "Boxes",
  "Receptacles",
  "Switches",
  "Wall Plates & Misc",
  "Service Entrance",
  "Panels",
  "Breakers",
  "Lighting Hardware",
  "Grounding & Bonding",
  "Life Safety",
  "Low Voltage",
  "Connectors & Terminations",
  "Strut & Supports",
  "Fasteners & Anchors",
  "Equipment & Appliances",
  "Distribution Equipment",
  "Consumables",
];
const catRank = (c: string) => {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
};
const sortRows = (list: Row[]) =>
  [...list].sort((a, b) =>
    a.category !== b.category
      ? catRank(a.category) - catRank(b.category)
      : compareBySize(a.name, b.name)
  );

const generic = sortRows(rows);
const branded = sortRows(brandRows);

fs.writeFileSync(
  path.join(HERE, "rows.json"),
  JSON.stringify({ generic, branded }, null, 0)
);

// ── 6. Report ───────────────────────────────────────────────────────────────
const NEW_CATEGORIES = CATEGORY_ORDER.filter(
  c => !BASELINE_MATERIALS.some(m => m.category === c)
);
const byCat = new Map<string, { total: number; neu: number }>();
for (const r of generic) {
  const e = byCat.get(r.category) ?? { total: 0, neu: 0 };
  e.total++;
  if (r.isNew) e.neu++;
  byCat.set(r.category, e);
}
console.log(`existing starter rows: ${existingCount}`);
console.log(
  `generic total:         ${generic.length}  (new: ${generic.length - existingCount})`
);
console.log(`brand variants:        ${branded.length}`);
console.log(`\nNEW CATEGORIES: ${NEW_CATEGORIES.join(", ") || "(none)"}`);
console.log("\nGENERIC BY CATEGORY (total / new):");
for (const c of CATEGORY_ORDER) {
  const e = byCat.get(c);
  if (e)
    console.log(
      `  ${String(e.total).padStart(4)} / ${String(e.neu).padStart(3)}  ${c}`
    );
}
console.log("\nNEW ROWS BY JOB (round two attribution):");
for (const [j, n] of [...jobTally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${j}`);
}
const byBrand = new Map<string, number>();
for (const r of branded) byBrand.set(r.brand, (byBrand.get(r.brand) ?? 0) + 1);
console.log("\nBRAND VARIANTS BY BRAND:");
for (const [b, n] of [...byBrand.entries()].sort((a, b2) => b2[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${b}`);
}
process.exit(0);
