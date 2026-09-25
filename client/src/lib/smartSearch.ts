/**
 * smartSearch.ts  — v2
 *
 * Precise real-time search for electrical materials.
 *
 * Key improvements over v1:
 *  - Per-token alias expansion: each typed word is expanded independently,
 *    so "outl cov" expands "outl" → outlet/receptacle AND "cov" → cover/plate.
 *  - Prefix-aware scoring: typing "outl" scores items whose description starts
 *    with a token that begins with "outl" (e.g. "outlet") — feels instant.
 *  - Tiered scoring: exact > description-starts-with > word-starts-with >
 *    word-boundary-contains > anywhere-contains.
 *  - Typed words outrank aliases: the same tier ladder is priced twice, once
 *    for what the user typed and once, lower, for anything the alias map
 *    reached. See TYPED_POINTS / ALIAS_POINTS.
 *  - All-tokens-must-match filter: every typed token (or its alias expansion)
 *    must appear somewhere in the item — no more noise from partial alias hits.
 *  - Rich alias map with trade slang, abbreviations, and brand names.
 */

// ─── Normalize ────────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[″"]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Trade Alias Map ──────────────────────────────────────────────────────────
// Key: a normalized term (or prefix) the user might type.
// Value: additional normalized terms that should be treated as equivalent.
// The engine expands EACH token in the query against this map.

const ALIAS_MAP: Record<string, string[]> = {
  // ── Boxes ──────────────────────────────────────────────────────────────────
  "4 square": ["4-11/16", "4 inch square", "junction box", "square box"],
  "4s": ["4-11/16", "4 inch square", "junction box", "square box"],
  "four square": ["4-11/16", "4 inch square", "junction box", "square box"],
  "4x4": ["4-11/16", "4 inch square", "junction box", "square box"],
  "4 11/16": ["4-11/16 square box"],
  "411": ["4-11/16 square box"],
  jbox: ["junction box", "pull box", "outlet box"],
  "j-box": ["junction box", "pull box", "outlet box"],
  "j box": ["junction box", "pull box", "outlet box"],
  "handy box": ["utility box", "2x4 box", "handy"],
  handy: ["utility box", "2x4 box"],
  "old work": ["old-work", "remodel box", "cut-in box"],
  "new work": ["new-work", "nail-on box"],
  "cut in": ["old-work", "remodel box", "cut-in"],
  "mud ring": ["extension ring", "raised cover", "plaster ring"],
  "plaster ring": ["mud ring", "extension ring", "raised cover"],
  "extension ring": ["mud ring", "plaster ring", "raised cover"],
  "raised cover": ["mud ring", "plaster ring", "extension ring"],
  "single gang": ["1-gang", "device box", "switch box"],
  "double gang": ["2-gang", "device box"],
  "two gang": ["2-gang", "device box"],
  "three gang": ["3-gang", "device box"],
  "triple gang": ["3-gang", "device box"],
  "quad gang": ["4-gang", "device box"],
  "four gang": ["4-gang", "device box"],
  octagon: ["oct box", "4 inch round", "ceiling box", "fan box"],
  oct: ["octagon box", "4 inch round", "ceiling box"],
  "round box": ["octagon", "ceiling box", "fan box"],
  "fan box": ["ceiling box", "octagon", "brace"],
  "pull box": ["junction box", "wireway", "handhole"],
  wireway: ["pull box", "trough", "gutter"],
  gutter: ["wireway", "auxiliary gutter", "pull box"],
  weatherproof: ["WP", "outdoor box", "in-use cover", "rain tight"],
  wp: ["weatherproof", "outdoor", "rain tight"],
  "in use": ["in-use cover", "weatherproof cover", "while-in-use"],
  "while in use": ["in-use cover", "weatherproof cover"],
  "gem box": ["1-gang box", "device box", "switch box"],
  "switch box": ["device box", "gem box", "1-gang box"],
  "outlet box": ["device box", "gem box", "1-gang box"],
  "remodel box": ["old work box", "cut-in box", "retrofit box"],
  "nail on": ["new work box", "new construction box", "nail-on box"],
  "junction box": ["j-box", "jbox", "4-square", "4 square"],
  "ceiling box": ["octagon box", "round box", "fan box", "light box"],
  "fan rated": ["fan-rated box", "ceiling fan box", "fan box"],
  "utility box": ["handy box", "surface box"],
  "weatherproof box": ["WP box", "outdoor box", "in-use cover", "bubble cover"],
  "in use cover": ["weatherproof cover", "bubble cover", "WP cover"],
  "bubble cover": ["in-use cover", "weatherproof cover", "WP cover"],
  "pvc box": ["PVC device box", "plastic conduit box"],
  "vapor barrier": ["vapor box", "airtight box"],
  "pancake box": ["shallow box", "shallow ceiling box"],

  // ── Conduit ────────────────────────────────────────────────────────────────
  emt: ["electrical metallic tubing", "thin wall", "thinwall"],
  "thin wall": ["EMT", "electrical metallic tubing"],
  thinwall: ["EMT", "electrical metallic tubing"],
  rigid: ["RMC", "rigid metal conduit", "galvanized rigid", "GRC"],
  rmc: ["rigid metal conduit", "galvanized rigid", "GRC"],
  imc: ["intermediate metal conduit", "intermediate"],
  pvc: [
    "polyvinyl chloride conduit",
    "plastic conduit",
    "schedule 40",
    "schedule 80",
  ],
  "sch 40": ["schedule 40", "PVC schedule 40"],
  "sch 80": ["schedule 80", "PVC schedule 80"],
  "schedule 40": ["sch 40", "PVC"],
  "schedule 80": ["sch 80", "PVC"],
  flex: ["FMC", "flexible metal conduit", "greenfield"],
  fmc: ["flexible metal conduit", "greenfield", "flex"],
  greenfield: ["FMC", "flexible metal conduit", "flex"],
  "liquid tight": ["LFMC", "LFNC", "liquidtight", "liquid-tight"],
  liquidtight: ["LFMC", "LFNC", "liquid tight"],
  lfmc: ["liquid tight flexible metal conduit", "liquidtight"],
  lfnc: ["liquid tight flexible nonmetallic", "liquidtight"],
  sealtite: ["LFMC", "liquid tight", "liquidtight"],
  ent: ["electrical nonmetallic tubing", "smurf tube", "blue flex"],
  "smurf tube": ["ENT", "electrical nonmetallic tubing", "blue flex"],
  "blue flex": ["ENT", "smurf tube"],
  grc: ["galvanized rigid conduit", "RMC", "rigid"],
  "pvc conduit": ["PVC", "schedule 40", "schedule 80", "grey conduit"],

  // ── Conduit Fittings ───────────────────────────────────────────────────────
  connector: [
    "fitting",
    "conduit connector",
    "EMT connector",
    "set screw",
    "compression",
  ],
  "set screw": ["connector", "coupling", "EMT set screw"],
  compression: ["connector", "coupling", "EMT compression", "rain tight"],
  coupling: ["conduit coupling", "EMT coupling", "RMC coupling"],
  sweep: ["90 degree", "90 sweep", "conduit bend", "elbow"],
  elbow: ["sweep", "90 degree", "conduit bend", "LB", "LR", "LL"],
  "90": ["sweep", "elbow", "90 degree bend"],
  lb: ["conduit body", "LB body", "back pull"],
  lr: ["conduit body", "LR body"],
  ll: ["conduit body", "LL body"],
  "c body": ["conduit body", "C type"],
  "conduit body": ["LB", "LR", "LL", "C body", "T body"],
  offset: ["conduit offset", "EMT offset"],
  nipple: ["close nipple", "conduit nipple", "threaded nipple"],
  bushing: ["reducing bushing", "conduit bushing", "grounding bushing"],
  locknut: ["lock nut", "conduit locknut", "chase nipple"],
  "chase nipple": ["locknut", "reducing bushing"],
  strut: ["unistrut", "channel", "slotted channel", "P1000", "P1001"],
  unistrut: ["strut", "channel", "slotted channel"],
  kindorf: ["strut", "unistrut", "channel"],
  channel: ["strut", "unistrut", "slotted channel"],
  "beam clamp": ["strut clamp", "beam attachment"],
  "pipe clamp": ["conduit clamp", "one hole strap", "two hole strap"],
  "one hole": ["1-hole strap", "conduit strap", "pipe clamp"],
  "two hole": ["2-hole strap", "conduit strap", "pipe clamp"],
  strap: ["conduit strap", "pipe strap", "one hole", "two hole"],
  "pulling elbow": ["conduit body", "LB", "sweep"],

  // ── Wire & Cable ───────────────────────────────────────────────────────────
  romex: ["NM-B", "nonmetallic sheathed", "house wire"],
  "nm-b": ["romex", "nonmetallic sheathed", "house wire"],
  nm: ["NM-B", "romex", "nonmetallic sheathed"],
  "nm cable": ["Romex", "NM-B", "nonmetallic sheathed"],
  "house wire": ["NM-B", "romex"],
  thhn: ["THWN", "THWN-2", "building wire", "single conductor"],
  thwn: ["THHN", "THWN-2", "building wire"],
  "building wire": ["THHN", "THWN", "single conductor"],
  "mc cable": ["metal clad", "armored cable", "MC"],
  "metal clad": ["MC cable", "MC", "armored cable"],
  armored: ["MC cable", "metal clad", "BX"],
  "armored cable": ["MC cable", "AC cable", "BX", "metal clad"],
  bx: ["MC cable", "armored cable", "metal clad"],
  "ac cable": ["armored cable", "BX", "MC cable"],
  ser: ["service entrance", "SER cable", "service cable"],
  seu: ["service entrance", "SEU cable"],
  "service entrance": ["SER", "SEU", "service cable"],
  "se cable": ["SER", "service entrance", "service cable"],
  "service cable": ["SER", "SE cable", "service entrance cable"],
  urd: ["underground", "direct burial", "URD cable"],
  "direct burial": ["URD", "underground", "USE-2"],
  "use-2": ["URD", "direct burial", "underground"],
  xhhw: ["XHHW-2", "aluminum wire", "aluminum conductor"],
  "aluminum wire": ["XHHW", "XHHW-2", "Al wire"],
  cat6: ["category 6", "ethernet", "data cable", "network cable"],
  "cat 6": ["category 6", "ethernet", "data cable"],
  cat5: ["Cat 5", "ethernet cable", "data cable"],
  ethernet: ["CAT6", "category 6", "data cable"],
  coax: ["coaxial", "RG6", "RG59", "cable TV"],
  "low voltage": ["LV", "data", "control wire", "thermostat wire"],
  "thermostat wire": ["low voltage", "control wire", "18/5", "18/8"],
  "control wire": ["low voltage", "thermostat wire"],
  "tray cable": ["TC cable", "TC-ER", "tray"],
  "tc cable": ["tray cable", "TC-ER"],
  "vfd cable": ["VFD wire", "motor lead", "variable frequency drive cable"],
  "data cable": ["Cat6", "Cat5", "ethernet", "network cable"],
  "14 gauge": ["14 AWG", "#14", "14/2", "14/3"],
  "12 gauge": ["12 AWG", "#12", "12/2", "12/3"],
  "10 gauge": ["10 AWG", "#10", "10/2", "10/3"],
  "8 gauge": ["8 AWG", "#8"],
  "6 gauge": ["6 AWG", "#6"],
  "4 gauge": ["4 AWG", "#4"],
  "2 gauge": ["2 AWG", "#2"],
  "1/0": ["1/0 AWG", "one ought", "0 gauge"],
  "2/0": ["2/0 AWG", "two ought"],
  "3/0": ["3/0 AWG", "three ought"],
  "4/0": ["4/0 AWG", "four ought"],
  "250 mcm": ["250 KCMIL", "250 MCM"],
  "350 mcm": ["350 KCMIL", "350 MCM"],
  "500 mcm": ["500 KCMIL", "500 MCM"],
  kcmil: ["MCM", "thousand circular mils"],
  mcm: ["KCMIL", "thousand circular mils"],

  // ── Distribution / Panels ──────────────────────────────────────────────────
  panel: ["load center", "breaker panel", "distribution panel", "panelboard"],
  "load center": ["panel", "breaker panel", "distribution panel"],
  "breaker panel": ["load center", "panel", "distribution panel"],
  "main panel": ["main breaker", "load center", "200 amp panel"],
  "sub panel": ["subpanel", "sub-panel", "load center", "distribution panel"],
  subpanel: ["sub panel", "sub-panel", "distribution panel"],
  meter: ["meter base", "meter socket", "meter can", "metering"],
  "meter base": ["meter socket", "meter can", "meter"],
  "meter socket": ["meter base", "meter can"],
  "meter can": ["meter base", "meter socket"],
  disconnect: [
    "safety switch",
    "fusible disconnect",
    "non-fusible",
    "pull-out",
  ],
  "safety switch": ["disconnect", "fusible disconnect"],
  "pull out": ["disconnect", "meter combo", "pull-out"],
  breaker: ["circuit breaker", "CB", "OCPD"],
  cb: ["circuit breaker", "breaker"],
  "single pole": ["1-pole", "1P", "SP breaker"],
  "double pole": ["2-pole", "2P", "DP breaker", "240V breaker"],
  "2 pole": ["double pole", "2P", "240V breaker"],
  "gfci breaker": ["GFCI circuit breaker", "ground fault breaker"],
  "afci breaker": ["AFCI circuit breaker", "arc fault breaker"],
  "dual function": ["DFCI", "AFCI/GFCI", "combination breaker"],
  tandem: ["twin breaker", "slimline breaker", "half-size breaker"],
  twin: ["tandem breaker", "slimline", "half-size"],
  "half size": ["tandem breaker", "slim breaker"],
  "square d": ["Square-D", "QO", "HOM", "Homeline"],
  qo: ["Square D", "QO breaker"],
  homeline: ["HOM", "Square D", "Homeline breaker"],
  hom: ["Homeline", "Square D"],
  eaton: ["Cutler-Hammer", "CH", "BR", "Eaton breaker"],
  "cutler hammer": ["Eaton", "CH breaker"],
  ch: ["Eaton", "Cutler-Hammer", "CH breaker"],
  br: ["Eaton", "BR breaker"],
  siemens: ["ITE", "Siemens breaker", "QP"],
  ite: ["Siemens", "ITE breaker"],
  schneider: ["Square D", "Schneider Electric"],
  ge: ["General Electric", "GE breaker", "THQL"],
  thql: ["GE breaker", "General Electric"],
  fuse: ["fuse holder", "fuse block", "cartridge fuse", "class R"],
  "fuse block": ["fuse holder", "fuse", "cartridge fuse"],
  "service panel": ["load center", "panel", "main panel", "breaker box"],
  "breaker box": ["load center", "panel", "service panel"],
  "main breaker": ["main disconnect", "main CB", "main circuit breaker"],
  "transfer switch": ["generator transfer", "ATS", "automatic transfer switch"],
  ats: ["automatic transfer switch", "transfer switch"],
  "surge protector": ["SPD", "surge protection device", "whole house surge"],
  spd: ["surge protector", "surge protection device"],

  // ── Devices & Trim ─────────────────────────────────────────────────────────
  outlet: ["receptacle", "duplex", "plug", "NEMA 5-15R", "device"],
  receptacle: ["outlet", "duplex", "plug", "device"],
  duplex: ["receptacle", "outlet", "duplex outlet", "plug"],
  plug: ["receptacle", "outlet", "duplex", "NEMA 5-15R"],
  device: ["receptacle", "outlet", "switch", "plug", "duplex"],
  "gfci outlet": ["GFCI receptacle", "ground fault outlet", "GFI"],
  gfi: ["GFCI", "ground fault", "GFCI outlet", "GFCI receptacle"],
  "ground fault": ["GFCI", "GFI", "GFCI outlet", "GFCI receptacle"],
  gfci: ["GFI", "ground fault", "GFCI outlet", "GFCI receptacle"],
  afci: ["arc fault", "AFCI breaker", "arc fault circuit interrupter"],
  "arc fault": ["AFCI", "AFCI breaker", "arc fault circuit interrupter"],
  switch: ["single pole switch", "3-way switch", "toggle switch", "device"],
  toggle: ["toggle switch", "single pole switch"],
  "3 way": ["3-way switch", "three-way", "traveler"],
  "three way": ["3-way switch", "three-way", "traveler"],
  "4 way": ["4-way switch", "four-way"],
  "four way": ["4-way switch", "four-way"],
  dimmer: ["dimmer switch", "dimmer control", "rheostat"],
  decorator: ["decora", "rocker switch", "paddle switch"],
  decora: ["decorator", "rocker switch", "paddle"],
  rocker: ["decorator", "decora", "rocker switch", "paddle switch"],
  paddle: ["decora", "rocker switch", "decorator"],
  // Cover plates / wall plates
  plate: ["wall plate", "cover plate", "faceplate"],
  "cover plate": ["wall plate", "faceplate", "plate"],
  faceplate: ["wall plate", "cover plate", "plate"],
  "wall plate": ["cover plate", "faceplate", "plate"],
  "outlet cover": [
    "wall plate",
    "cover plate",
    "receptacle plate",
    "duplex plate",
    "faceplate",
  ],
  "outlet plate": [
    "wall plate",
    "cover plate",
    "receptacle plate",
    "duplex plate",
  ],
  "switch cover": ["wall plate", "toggle plate", "switch plate", "cover plate"],
  "switch plate": ["wall plate", "toggle plate", "cover plate"],
  cover: ["wall plate", "cover plate", "blank cover", "faceplate"],
  blank: ["blank plate", "blank cover", "blank wall plate"],
  midway: ["mid-size wall plate", "midway cover plate", "standard cover plate"],
  "mid size": ["midway", "mid-size wall plate", "standard cover plate"],
  "mid-size": ["midway", "mid-size wall plate", "standard cover plate"],
  "double gang plate": [
    "2-gang wall plate",
    "2 gang cover plate",
    "double gang cover",
  ],
  "triple gang plate": [
    "3-gang wall plate",
    "3 gang cover plate",
    "triple gang cover",
  ],
  "quad plate": ["4-gang wall plate", "4 gang cover plate", "quad gang cover"],
  "2 gang plate": [
    "2-gang wall plate",
    "double gang wall plate",
    "2 gang cover plate",
  ],
  "3 gang plate": [
    "3-gang wall plate",
    "triple gang wall plate",
    "3 gang cover plate",
  ],
  "4 gang plate": [
    "4-gang wall plate",
    "quad gang wall plate",
    "4 gang cover plate",
  ],
  usb: ["USB outlet", "USB receptacle", "USB-C", "USB-A", "charger outlet"],
  charger: ["USB outlet", "USB receptacle", "USB-C", "USB-A"],
  "tamper resistant": [
    "TR outlet",
    "tamper-resistant",
    "child proof",
    "childproof",
    "TR receptacle",
  ],
  "tamper proof": [
    "TR outlet",
    "tamper-resistant",
    "child proof",
    "TR receptacle",
  ],
  tr: ["tamper resistant", "tamper-resistant outlet", "TR receptacle"],
  "child proof": ["tamper resistant", "TR outlet", "TR receptacle"],
  "spec grade": ["commercial grade", "specification grade", "heavy duty"],
  "commercial grade": [
    "spec grade",
    "specification grade",
    "heavy duty",
    "20A",
  ],
  "hospital grade": ["HG receptacle", "hospital grade outlet", "red outlet"],
  hg: ["hospital grade", "hospital grade outlet"],
  "20a": ["20 amp", "20-amp", "20A receptacle", "20A outlet"],
  "15a": ["15 amp", "15-amp", "15A receptacle", "15A outlet"],
  "nema 5-15": ["15A outlet", "standard outlet", "duplex receptacle"],
  "nema 5-20": ["20A outlet", "20A receptacle", "T-slot outlet"],
  "nema 6-20": ["240V outlet", "240V receptacle", "dryer outlet"],
  "nema 14-30": ["dryer outlet", "30A 240V", "dryer receptacle"],
  "nema 14-50": ["range outlet", "50A 240V", "EV outlet", "stove outlet"],
  ev: ["electric vehicle", "EV charger", "EVSE", "level 2 charger"],
  evse: ["EV charger", "electric vehicle supply equipment"],
  "level 2": ["EV charger", "240V charger", "EVSE"],

  // ── Lighting ───────────────────────────────────────────────────────────────
  led: ["LED light", "LED fixture", "LED downlight", "LED strip"],
  recessed: ["can light", "downlight", "pot light", "recessed fixture"],
  "can light": ["recessed", "downlight", "pot light"],
  "pot light": ["recessed", "can light", "downlight"],
  downlight: ["recessed", "can light", "pot light"],
  wafer: ["wafer light", "LED wafer", "slim downlight", "ultra thin"],
  retrofit: ["retrofit kit", "LED retrofit", "can retrofit"],
  troffer: ["2x4 troffer", "2x2 troffer", "fluorescent troffer", "LED troffer"],
  "2x4": ["2x4 troffer", "2x4 fixture", "48 inch fixture"],
  "2x2": ["2x2 troffer", "2x2 fixture", "24 inch fixture"],
  "strip light": ["LED strip", "shop light", "vapor tight"],
  "vapor tight": ["vapor proof", "wet location fixture", "strip light"],
  "exit sign": ["exit light", "emergency exit", "egress light"],
  emergency: ["emergency light", "exit sign", "battery backup"],
  occupancy: ["occupancy sensor", "motion sensor", "vacancy sensor"],
  "motion sensor": ["occupancy sensor", "PIR sensor", "vacancy sensor"],
  photocell: ["dusk to dawn", "photo eye", "light sensor"],
  "dusk to dawn": ["photocell", "photo eye", "outdoor sensor"],
  ballast: ["fluorescent ballast", "HID ballast", "electronic ballast"],
  fluorescent: ["T8", "T5", "T12", "fluorescent lamp", "fluorescent fixture"],
  t8: ["T8 lamp", "T8 tube", "fluorescent T8"],
  t5: ["T5 lamp", "T5 tube", "fluorescent T5"],
  hid: ["high intensity discharge", "metal halide", "high pressure sodium"],
  "metal halide": ["HID", "MH lamp", "metal halide fixture"],
  "high bay": ["high bay light", "warehouse light", "LED high bay"],
  "low bay": ["low bay light", "shop light", "LED low bay"],

  // ── Grounding & Bonding ────────────────────────────────────────────────────
  "ground rod": ["grounding electrode", "copper clad rod", "ground stake"],
  "ground clamp": ["grounding clamp", "rod clamp", "acorn clamp"],
  "acorn clamp": ["ground clamp", "grounding clamp"],
  grounding: ["ground wire", "ground rod", "grounding electrode"],
  bonding: ["bonding jumper", "bonding wire", "equipotential bond"],
  "bare copper": ["ground wire", "bare ground", "solid bare copper"],

  // ── Rough-In Hardware ──────────────────────────────────────────────────────
  // "romex staple" is deliberately absent, and the reason generalises.
  //
  // This table expands the ITEM's text as well as the query, so a phrase here
  // stacks on top of whatever the material already carries. The Cable staple
  // row names "romex" in its own searchAliases — correctly, that is what it
  // holds — and adding it a second time from here made a bare "romex" rank the
  // staple ABOVE the NM-B cable, the accessory beating the product. One signal
  // ranks it right; two double-counted it. When a per-material alias already
  // covers a term, this table should stay out of it.
  staple: ["cable staple", "wire staple", "NM staple"],
  "nail plate": ["nail guard", "protection plate", "stud plate"],
  "protection plate": ["nail plate", "nail guard", "stud protector"],
  "wire nut": ["wire connector", "twist-on connector", "marrette"],
  marrette: ["wire nut", "wire connector", "twist-on"],
  "push in": ["push-in connector", "wago", "lever connector"],
  wago: ["push-in connector", "lever connector", "spring connector"],
  "lever connector": ["wago", "push-in connector", "spring connector"],
  "fish tape": ["pull tape", "wire fish", "snake"],
  "pull string": ["pull line", "fish tape", "wire pull"],
  "box fill": ["fill calculation", "conductor fill"],
  "low voltage ring": [
    "LV ring",
    "low voltage bracket",
    "low voltage mud ring",
  ],
  "lv bracket": ["low voltage bracket", "low voltage ring", "old work bracket"],
};

// ─── Build a pre-computed index for each item ─────────────────────────────────
export interface SearchableItem {
  id: string;
  description: string;
  category?: string | null;
  unit?: string | null;
  [key: string]: unknown;
}

interface IndexedItem<T extends SearchableItem> {
  item: T;
  /** Full normalized searchable text (description + category + aliases) */
  text: string;
  /** Individual normalized words from the description only */
  descWords: string[];
  /** The description, normalized — `descWords` joined, computed once. */
  descNorm: string;
  /** sizeKey() of each size-normalized description word, in order. */
  descSizes: string[];
  /** The same, only the words written in INCHES ('1/2"', "1/2 in"). */
  descInches: Set<string>;
  /** sizeKey() of every word in the size text that carries a digit. */
  textSizes: Set<string>;
  /** The same, only the words written in inches. */
  textInches: Set<string>;
}

function getAliases(item: SearchableItem): string {
  const a = (item as { searchAliases?: string | string[] }).searchAliases;
  return Array.isArray(a) ? a.join(" ") : (a ?? "");
}

function buildIndex<T extends SearchableItem>(items: T[]): IndexedItem<T>[] {
  return items.map(item => {
    const descNorm = normalize(item.description);
    /*
      No `item.id` in the searchable text — it used to be here. Every caller
      passes an internal database id, which no user ever sees or types, so its
      only effect was to let a typed number match whichever row happened to
      have that id: "1900" could find item 1900. Removed 2026-09-25 with the
      size rules, which forbid exactly that kind of numeric accident.
    */
    const text = normalize(
      [item.description, item.category ?? "", getAliases(item)].join(" ")
    );
    const descWords = descNorm.split(/\s+/).filter(Boolean);
    /*
      Sizes come from the name, category and aliases — NOT the id, which
      `text` carries: a typed "2" or "12" matched row ids, which is how "2
      pole" led with a light pole in a test catalog. And the text goes
      through the same size spelling as the query, so an alias written
      "1 1/4 inch" is ONE size, 1-1/4 — as two words it offered a bare
      "1/4", and "quarter inch" found 1-1/4" EMT.
    */
    const sizeText = normalizeSizeWords(
      normalize(
        [item.description, item.category ?? "", getAliases(item)].join(" ")
      )
    );
    const textSizes = new Set<string>();
    const textInches = new Set<string>();
    for (const word of sizeText.split(" ")) {
      if (!HAS_DIGIT.test(word)) continue;
      for (const s of sizesOf(word)) {
        textSizes.add(s);
        if (isInches(word)) textInches.add(s);
      }
    }
    const descSizeWords = normalizeSizeWords(descWords.join(" ")).split(" ");
    return {
      item,
      text,
      descWords,
      descNorm: descWords.join(" "),
      // Every size each word stands for — see sizesOf.
      descSizes: descSizeWords.flatMap(sizesOf),
      descInches: new Set(descSizeWords.filter(isInches).flatMap(sizesOf)),
      textSizes,
      textInches,
    };
  });
}

// ─── Sizes: matched whole, never inside one another ──────────────────────────
/*
  Added 2026-09-25, with "inch" spelled out. A size was matched like any other
  text, and the lowest tier is "appears anywhere", so every size matched
  inside every size that CONTAINS it: "1/2 emt" returned 1-1/2" and 2-1/2"
  EMT, '4" box' returned 3/4" cast boxes, '2" pvc' returned 1/2" pipe. They
  ranked below the right size, which is why nobody saw them — and they broke
  the rule that a number is never fuzzed: 4 must find 4, never 3/4 or 4-11/16.

  So a term with a digit in it is compared by sizeKey, WHOLE:
    - a complete size ("4", "1/2", "1-1/4", "20a", "#12") must EQUAL an item's
      size word — '4"', "4 in", "4-inch" and plain "4" all key to "4";
    - a size still being typed ("1-", "1/", "1-1", "12-2", "4x") may be the
      START of one, so the list keeps up keystroke by keystroke — but never
      the middle of one.
*/
const HAS_DIGIT = /\d/;

/**
 * Is the item's size `item` the size that was typed as `typed`? Equal, or the
 * same number with a gauge "#" the typist left off — "12" is #12 wire, but a
 * typed "#12" is a gauge and does not match a 12" light bar.
 */
function sameSize(typed: string, item: string): boolean {
  return item === typed || (!typed.startsWith("#") && item === "#" + typed);
}

/** A size word written in inches: a digit, then the mark. */
function isInches(word: string): boolean {
  return /\d"[),.;:]*$/.test(word);
}

/** A size a person has finished typing — see sizeTier. */
const COMPLETE_SIZE = /^#?\d+(?:-\d+\/\d+|\/\d+)?(?:"|a|v|w|ft|mm)?$/;

/**
 * A word's size, in one spelling: trailing punctuation off, the inch mark
 * off, and a hyphenated word suffix off — so '1/2"', "1/2", "1/2," key alike,
 * and "90-degree" or "3-pole" key as "90" and "3" (a typed "90" still finds
 * the 90-degree elbow, "3 pole" the 3-pole breaker). Everything else — "#",
 * "a" for amps, "x" in 4x4 — is kept, because it is part of what the size IS.
 */
function sizeKey(word: string): string {
  return word
    .replace(/^[("'[]+|[)\],.;:]+$/g, "")
    .replace(/(\d)-[a-z].*$/, "$1")
    .replace(/(\d)"$/, "$1");
}

/**
 * matchTier's answer for a term that carries a digit — see the note above.
 * Same tiers, so the points and the rest of the ranking are unchanged; only
 * "somewhere inside a word" (tier 5) is gone, because for a size that is
 * exactly the fuzz the rule forbids.
 */
function sizeTier(term: string, indexed: IndexedItem<SearchableItem>): number {
  const { descNorm, descWords, descSizes, textSizes, text } = indexed;
  if (descNorm === term) return 1;
  const key = sizeKey(term);
  if (COMPLETE_SIZE.test(key)) {
    /*
      A term that SAYS inches ('3/4"', or "3/4 inch" rewritten to it) only
      matches sizes written in inches. Without the mark, "3/4" is also how a
      3-4 MC cable is spelled, and "three quarter inch" listed it. A bare
      "3/4" still matches both, as it always did.
    */
    const inSet = (set: Set<string>) =>
      set.has(key) || (!key.startsWith("#") && set.has("#" + key));
    if (isInches(term)) {
      if (sameSize(key, descSizes[0] ?? "") && inSet(indexed.descInches))
        return 2;
      if (inSet(indexed.descInches)) return 3;
      if (inSet(indexed.textInches)) return 6;
      return 0;
    }
    if (sameSize(key, descSizes[0] ?? "")) return 2;
    if (descSizes.some(s => sameSize(key, s))) return 3;
    if (inSet(textSizes)) return 6;
    return 0;
  }
  // Still being typed: the START of a size, never the middle.
  if (descWords[0]?.startsWith(key)) return 2;
  if (descWords.some(w => w.startsWith(key))) return 3;
  if (startsAWord(text, key)) return 6;
  return 0;
}

/**
 * A COUNT, not a measurement: "2-gang", "3-way", "2-pole", "1-hole". The
 * number says how many, and the word is the thing — so these are matched as
 * words, the way they were before sizes became strict. As sizes they lost
 * every item that spells the count out ("Double-gang box" for "2 gang box").
 * The query joins "2 gang" into "2-gang" first; see normalizeQuerySizes.
 */
const COUNT_TOKEN = /^\d+-(?:gang|pole|way|hole|head|light|space|circuit)s?$/;

/**
 * A term carrying a digit that is matched as a SIZE (not a count).
 *
 * One WORD only. An alias phrase with a number in it — "2-gang wall plate",
 * '4" square' — is a phrase and is matched as one. Put through sizeKey
 * whole, "2-gang wall plate" lost everything after "2-" and became the size
 * 2, which matched #2 THHN and every 2" fitting from "2 gang box".
 */
function isSizeTerm(term: string): boolean {
  return (
    HAS_DIGIT.test(term) &&
    !term.includes(" ") &&
    !COUNT_TOKEN.test(term) &&
    // A number joined to a WORD — "4-square", "90-degree", "3-pole" — is a
    // name, not a measurement. As a size, the map's "4-square" (an alias of
    // "junction box") keyed as 4 and put every 4" conduit connector in "j box".
    !/\d-[a-z]/.test(term)
  );
}

/** The tier for any term: sizes by sizeTier, words by matchTier. */
function termTier(term: string, indexed: IndexedItem<SearchableItem>): number {
  return isSizeTerm(term)
    ? sizeTier(term, indexed)
    : matchTier(term, indexed.descNorm, indexed.descWords, indexed.text);
}

/**
 * The conductor size at the front of a cable spec — "2/0" of "2/0-3", "12"
 * of "12-2", "4/0" of "4/0-4/0-2/0" — or null. A spec is a size followed by
 * counts or more sizes, and it answers to its leading size too: "2/0 ser"
 * must find "2/0-3 SER aluminum", and did before sizes became strict.
 */
/**
 * The sizes one size WORD stands for: itself, both halves of a dual size
 * ('5"/6"' is a 5" part and a 6" part — "6 wafer" must find it), and a cable
 * spec's leading conductor (see leadingConductor).
 */
function sizesOf(word: string): string[] {
  const key = sizeKey(word);
  const dual = /^(\d+(?:-\d+\/\d+)?)"\/(\d+(?:-\d+\/\d+)?)$/.exec(key);
  if (dual) return [key, dual[1], dual[2]];
  const lead = leadingConductor(key);
  return lead ? [key, lead] : [key];
}

function leadingConductor(key: string): string | null {
  // Every element whole or an aught size ("2/0"): so "1-1/4" and "4-11/16",
  // which are ONE measurement, are never split into a lead of 1 or 4.
  const m = /^(#?\d+(?:\/0)?)(?:-\d+(?:\/0)?)+$/.exec(key);
  return m ? m[1] : null;
}

/*
  ── "Inch" spelled out, and the sizes people say out loud ────────────────────
  The catalog writes inches with the mark — 1/2" EMT, 4" square box — and a
  search for "1/2 inch emt" found NOTHING, because "inch" is a word no item
  contains; "4 inch box" was worse, returning connectors. Rewritten into the
  mark here, in the QUERY only, before anything is matched:

    1/2 inch, 1/2inch, 1/2 in, 1/2 in., 1/2 inches, 1/2-inch  →  1/2"
    1 1/4 inch (a space in the mixed number)                   →  1-1/4"
    half inch, quarter inch, three quarter inch                →  1/2" 1/4" 3/4"
    inch and a half, inch and a quarter                        →  1-1/2" 1-1/4"

  The spoken fractions need an "inch" after them: a bare "half" is also how
  a half-size breaker is described, and must stay a word.
*/
const INCH = `(?:inch(?:es|s|e)?|in\\.?|")`;
const SPOKEN_INCHES: Array<[RegExp, string]> = [
  [new RegExp(`\\binch(?:es)? and a half\\b`, "g"), '1-1/2"'],
  [new RegExp(`\\binch(?:es)? and a quarter\\b`, "g"), '1-1/4"'],
  [new RegExp(`\\bthree[- ]quarters?[- ]?${INCH}(?=\\s|$)`, "g"), '3/4"'],
  [new RegExp(`\\bquarter[- ]?${INCH}(?=\\s|$)`, "g"), '1/4"'],
  [new RegExp(`\\bhalf[- ]?${INCH}(?=\\s|$)`, "g"), '1/2"'],
];
const NUMBER_INCHES = new RegExp(
  `(^|\\s)(\\d+(?:[- ]\\d+\\/\\d+)?(?:\\/\\d+)?)\\s*-?\\s*${INCH}(?=\\s|$)`,
  "g"
);

/**
 * A mixed number written with a space — "1 1/4" — is one size, 1-1/4. Only
 * a whole number followed by a proper fraction qualifies, so "12 2" or
 * "4 x 4" are left alone.
 */
const MIXED_NUMBER = /(^|\s)(\d+) (\d+\/\d+)(?=["\s]|$)/g;

/**
 * Text with every spelling of inches turned into the mark, and mixed numbers
 * joined. Applied to the QUERY and to each item's size text alike, so the two
 * are compared in one spelling.
 */
export function normalizeSizeWords(text: string): string {
  let q = text;
  for (const [pattern, size] of SPOKEN_INCHES) q = q.replace(pattern, size);
  q = q.replace(
    NUMBER_INCHES,
    (_, lead: string, size: string) => `${lead}${size.replace(" ", "-")}"`
  );
  q = q.replace(MIXED_NUMBER, "$1$2-$3");
  return q.replace(/\s+/g, " ").trim();
}

/** Words that make the number before them a COUNT — "2 gang", "3 way". */
const COUNT_NOUN = /^(?:gang|pole|way|hole|head|light|space|circuit)s?$/;

/**
 * A cable spec typed with a space — "12 2", "6 3", "10 3" — is the spec
 * 12-2, 6-3, 10-3. Only a building-wire gauge followed by 2, 3 or 4
 * conductors, so "4 11" or "20 3" (a 20 A 3-pole?) are left alone.
 */
const SPOKEN_CABLE = /(^|\s)(14|12|10|8|6|4|2) ([234])(?=\s|$)/g;

/**
 * The QUERY's spelling: normalizeSizeWords, plus the join only a person typing
 * needs — a cable spec typed with a space. Not applied to item text.
 */
export function normalizeQuerySizes(query: string): string {
  return normalizeSizeWords(query).replace(SPOKEN_CABLE, "$1$2-$3");
}

// ─── Expand a single token against the alias map ─────────────────────────────
/**
 * What one typed word matched, kept split by provenance.
 *
 * The split matters because alias expansion is lossy in one direction: an entry
 * matches if ANY of its values matches, and then ALL of its values join the set.
 * So typing "recep" pulls in "wall plate", because "outlet cover" happens to
 * list both "receptacle plate" and "wall plate". That association is real and
 * worth keeping — it is what makes "outl cov" find wall plates — but it is much
 * weaker evidence than the word the user actually typed, and scoreItem prices
 * the two differently.
 */
interface TokenExpansion {
  /** Exactly what the user typed, normalized. */
  typed: string;
  /** Everything reached through ALIAS_MAP. Never includes `typed`. */
  aliases: string[];
  /**
   * A number that is a COUNT, not a size — the "2" of "2 gang box", because
   * the next word is a count noun (COUNT_NOUN). Matched as a word, exactly as
   * before sizes became strict: "Double-gang box" spells its count out, and
   * strict size matching lost it.
   */
  asWord?: boolean;
}

/** Each query word, expanded — counts flagged by the word after them. */
function expandTokens(tokens: string[]): TokenExpansion[] {
  return tokens.map((token, i) =>
    expandTokenCached(
      token,
      HAS_DIGIT.test(token) && COUNT_NOUN.test(tokens[i + 1] ?? "")
    )
  );
}

/**
 * expandToken, remembered. The same few words are expanded on every keystroke
 * — "recep" is expanded again when "recept" is typed after it, and "breaker"
 * on every search that contains it — and each expansion walks the whole alias
 * map twice. The map is a constant, so the answer for a word never changes.
 */
const expansionCache = new Map<string, TokenExpansion>();
function expandTokenCached(token: string, asWord = false): TokenExpansion {
  const cacheKey = asWord ? `${token} #count` : token;
  let hit = expansionCache.get(cacheKey);
  if (!hit) {
    hit = asWord
      ? { ...expandToken(token, true), asWord: true }
      : expandToken(token);
    expansionCache.set(cacheKey, hit);
  }
  return hit;
}

/**
 * Does the typed word run ON from `term` — "romexes" from "romex"?
 *
 * Only for terms of MIN_ALIAS_TERM_LENGTH or more. The map holds two-letter
 * line codes ("br", "ch", "qo", "cb"), and every word that merely starts with
 * one was treated as naming it: "brakr" became Eaton BR and returned a page of
 * Eaton panels instead of breakers, and "brace" and "chase" did the same.
 * Found 2026-09-25, because it also hid "brakr" from typo correction — it
 * "matched" something, so nothing looked misspelled. Typing the code itself
 * still reaches it through the equality test.
 */
function runsOnFrom(token: string, term: string): boolean {
  return term.length >= MIN_ALIAS_TERM_LENGTH && token.startsWith(term);
}

function expandToken(token: string, asWord = false): TokenExpansion {
  const aliases = new Set<string>();

  /*
    A finished SIZE expands only through a key that is exactly it. The prefix
    tests below are for words being typed; for a size they are a fuzz: "4"
    started the key "4-11/16" and so "4 box" offered the 4-11/16" square box
    (2026-09-25). A size still being typed ("1-", "1/") keeps the prefix
    behaviour like any partial word.
  */
  if (!asWord && isSizeTerm(token) && COMPLETE_SIZE.test(sizeKey(token))) {
    /*
      ...and only to phrases that CONTAIN that same size. A size is satisfied
      by that size or not at all: the map's "4 square" entry also lists
      "4-11/16" and "junction box", and either one, reached from a typed "4",
      put the 4-11/16" box in "4 inch box"; "1-hole strap" keys as size 1 and
      dragged in "one hole", which put crimp lugs in "1 inch emt". Kept: the
      phrases that restate the size another way — "12 gauge" gives "#12", so
      "12 thhn" finds #12 THHN.
    */
    const key = sizeKey(token);
    const inches = isInches(token);
    const carries = (phrase: string) =>
      normalizeSizeWords(phrase)
        .split(" ")
        .some(
          w =>
            HAS_DIGIT.test(w) &&
            sameSize(key, sizeKey(w)) &&
            (!inches || isInches(w))
        );
    for (const [k, expansions] of Object.entries(ALIAS_MAP)) {
      const phrases = [k, ...expansions].map(normalize);
      if (!phrases.some(carries)) continue;
      for (const p of phrases) if (carries(p)) aliases.add(p);
    }
    aliases.delete(token);
    return { typed: token, aliases: Array.from(aliases) };
  }

  // Direct key match (full or prefix of key)
  for (const [key, expansions] of Object.entries(ALIAS_MAP)) {
    const nk = normalize(key);
    // The typed token matches the alias key (starts-with for prefix typing)
    if (nk === token || nk.startsWith(token) || runsOnFrom(token, nk)) {
      aliases.add(nk);
      for (const e of expansions) aliases.add(normalize(e));
    }
  }

  // Reverse lookup: token appears in an alias value
  for (const [key, expansions] of Object.entries(ALIAS_MAP)) {
    for (const exp of expansions) {
      const ne = normalize(exp);
      if (ne === token || ne.startsWith(token) || runsOnFrom(token, ne)) {
        aliases.add(normalize(key));
        for (const e2 of expansions) aliases.add(normalize(e2));
        break;
      }
    }
  }

  aliases.delete(token);
  return { typed: token, aliases: Array.from(aliases) };
}

// ─── Score a single indexed item against all expanded token sets ──────────────

/**
 * How strongly a term matches an item. 0 = not at all; 1 is strongest.
 *
 *   1 — exact full description match
 *   2 — description starts with the term
 *   3 — a description word starts with the term (prefix match — great for typing)
 *   4 — the term appears at a word boundary (only reachable by multi-word terms,
 *       which tier 3 cannot see because descWords holds single words)
 *   5 — the term appears anywhere in the description
 *   6 — the term appears only in category / id / alias text
 */
function matchTier(
  term: string,
  descNorm: string,
  descWords: string[],
  text: string
): number {
  if (!term) return 0;
  if (descNorm === term) return 1;
  if (descNorm.startsWith(term)) return 2;
  if (descWords.some(w => w.startsWith(term))) return 3;
  if (startsAWord(descNorm, term)) return 4;
  if (descNorm.includes(term)) return 5;
  // Tier 6 anchors at a word boundary rather than testing a raw substring.
  // The alias map holds two-letter manufacturer codes ("ch", "cb", "br"), and
  // an unanchored includes() found "ch" inside "switch" — which made searching
  // "breaker" return a single-gang box. Still prefix-friendly (a word may start
  // with the term), so typing "marret" continues to reach "marrette".
  if (startsAWord(text, term)) return 6;
  return 0;
}

/**
 * Does `term` occur in `hay` at the start of a word — at 0, or after a space?
 *
 * The same test as the regex `(^|\s)term` this used to build, and after
 * `normalize` the only whitespace left is a single space. It was a NEW RegExp
 * per call, and this is called for every item, for every typed word and every
 * alias it expands to: on a 2,000-row catalog, typing "r" built tens of
 * thousands of them and took ~120 ms per keystroke (measured 2026-09-25).
 */
function startsAWord(hay: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(term, from);
    if (at === -1) return false;
    if (at === 0 || hay.charCodeAt(at - 1) === 32) return true;
    from = at + 1;
  }
}

/** Points per tier for the word the user actually typed. Index 0 is unused. */
const TYPED_POINTS = [0, 200, 120, 80, 50, 25, 10];

/**
 * Points per tier for a term reached through the alias map.
 *
 * The whole band sits below TYPED_POINTS[3]: even a perfect alias match (70)
 * loses to an item whose own name merely starts one of its words with what was
 * typed (80). That ordering is the point of this table — without it, searching
 * "recep" ranked "Wall plate" (an exact hit on the alias "wall plate", dragged
 * in via "outlet cover") above "Duplex receptacle" (a real prefix hit on the
 * typed word). Keep ALIAS_POINTS[1] < TYPED_POINTS[3] or that returns.
 *
 * Alias matches stay well above zero because they are often the ONLY signal —
 * "romex" finds "14-2 NM-B" purely by association, and must still rank.
 */
const ALIAS_POINTS = [0, 70, 60, 50, 30, 15, 5];

/**
 * Alias-derived terms shorter than this are ignored.
 *
 * ALIAS_MAP carries two-letter manufacturer and spec codes — "ch", "cb", "br",
 * "qo", "tr", "hg". Typed deliberately they are useful; dragged in by
 * association they are noise, because a two-letter fragment starts a great many
 * ordinary words. Typing "breaker" reaches the "eaton" entry and so inherits
 * "br", which then matched "brace" and put a fan box above the panel.
 *
 * Only ALIAS terms are filtered. Typing "ch" yourself still searches for "ch".
 */
const MIN_ALIAS_TERM_LENGTH = 3;

function scoreItem<T extends SearchableItem>(
  indexed: IndexedItem<T>,
  tokenExpansions: TokenExpansion[]
): number {
  let totalScore = 0;

  for (const { typed, aliases, asWord } of tokenExpansions) {
    // A count ("2" of "2 gang") is matched as a word — see TokenExpansion.
    const tier = (term: string) =>
      asWord
        ? matchTier(term, indexed.descNorm, indexed.descWords, indexed.text)
        : termTier(term, indexed);
    let bestForToken = TYPED_POINTS[tier(typed)];

    // No alias can score more than ALIAS_POINTS[1], so once the typed word
    // has reached it the alias loop cannot change the answer. Skipping it is
    // what keeps a one-letter query — which expands to hundreds of aliases —
    // inside a frame on a 2,000-row catalog.
    if (bestForToken >= ALIAS_POINTS[1]) {
      totalScore += bestForToken;
      continue;
    }

    for (const alias of aliases) {
      if (alias.length < MIN_ALIAS_TERM_LENGTH) continue;
      const points = ALIAS_POINTS[tier(alias)];
      if (points > bestForToken) bestForToken = points;
    }

    // If neither the typed word nor any alias matched, this item doesn't qualify
    if (bestForToken === 0) return 0;
    totalScore += bestForToken;
  }

  return totalScore;
}

// ─── Main search function ─────────────────────────────────────────────────────
export interface SmartSearchResult<T extends SearchableItem> {
  item: T;
  score: number;
}

// Cache the last index to avoid rebuilding on every keystroke when items don't change
let _cachedItems: SearchableItem[] | null = null;
let _cachedIndex: IndexedItem<SearchableItem>[] | null = null;
let _cachedVocabulary: Map<string, number> | null = null;

function indexFor<T extends SearchableItem>(items: T[]): IndexedItem<T>[] {
  if (items !== (_cachedItems as T[] | null)) {
    _cachedItems = items as SearchableItem[];
    _cachedIndex = buildIndex(items as SearchableItem[]);
    _cachedVocabulary = null; // rebuilt on the first typo that needs it
  }
  return _cachedIndex as IndexedItem<T>[];
}

export function smartSearch<T extends SearchableItem>(
  items: T[],
  query: string,
  maxResults = 100
): T[] {
  const q = normalize(query);
  if (!q) return items.slice(0, maxResults);
  return smartSearchScored(items, query, maxResults).map(r => r.item);
}

/**
 * smartSearch, with each hit's score.
 *
 * The score is what tells a REAL tie from an accidental one. smartSearch's own
 * order breaks a tie by whatever order the items arrived in, and that differs
 * between callers: the Materials screen hands over rows sorted by name, the
 * spot-check script hands over seed order. So "20A breaker" listed the plain
 * single-pole row 7th on screen and 1st in the script, from identical scores.
 * A caller that ranks further (shared/materialSearchRank.ts) needs the number,
 * so equal scores can be settled by something that means something.
 *
 * An empty query matches nothing here, unlike smartSearch, which returns the
 * list unfiltered: with no query there is no score to report.
 *
 * Typo-tolerant — see smartSearchCorrected, which this is the results of.
 */
export function smartSearchScored<T extends SearchableItem>(
  items: T[],
  query: string,
  maxResults = 100
): SmartSearchResult<T>[] {
  return smartSearchCorrected(items, query, maxResults).results;
}

/** What a search found, and the query it actually answered if it corrected one. */
export interface CorrectedSearch<T extends SearchableItem> {
  results: SmartSearchResult<T>[];
  /**
   * The query with its misspelled words replaced — "receptacle" for
   * "recepticle" — when, and ONLY when, the results came from a correction.
   * Null when the query was answered as typed. Screens show it as "Showing
   * results for …", and rank with it rather than with the misspelling.
   */
  correctedQuery: string | null;
  /**
   * The query as it was actually MATCHED: inches rewritten to the mark
   * ("1/2 inch emt" → '1/2" emt') and any typo correction applied. Always
   * set. Callers rank with this, so ranking and matching read one query.
   * Unlike correctedQuery it is not shown: rewriting "inch" as " is the same
   * search, not a different one.
   */
  searchedQuery: string;
}

/**
 * Search, correcting typos — but only where nothing matched as typed.
 *
 * ── The rules, and how each one is kept ─────────────────────────────────────
 * Added 2026-09-25: "recepticle", "disconect", "romax", "flourescent" and
 * "brakr" should find what they obviously mean.
 *
 *  1. Exact, starts-with and alias matches always rank above typo matches.
 *     Kept structurally rather than by weighting: correction runs ONLY when
 *     the query as typed matched nothing at all, and only on the words that
 *     matched nothing anywhere in the catalog. So a typo match can never sit
 *     beside, let alone above, a real one — they cannot both exist for the
 *     same query.
 *  2. Never fuzz numbers or sizes. Only an all-LETTER word is ever corrected,
 *     and it is only ever corrected TO an all-letter word. "20a", "1/2", "#12"
 *     and "3/4" cannot enter or leave the corrector, so "20a" can never find
 *     30A — it finds 20A, or nothing.
 *  3. No correction below MIN_TYPO_LENGTH letters, where one edit reaches too
 *     many real words ("emt" is one letter from "ent", "emp", "met"…).
 *  4. The caller is TOLD (correctedQuery), so a screen can say "Showing
 *     results for receptacle" instead of silently answering a different
 *     question.
 *
 * The vocabulary is the catalog's own words — names and aliases of the rows
 * passed in, so a shop's own items correct as well as shipped ones — plus the
 * shared ALIAS_MAP, which is how "romax" reaches "romex".
 */
export function smartSearchCorrected<T extends SearchableItem>(
  items: T[],
  query: string,
  maxResults = 100
): CorrectedSearch<T> {
  // Inches spelled out become the mark first — see normalizeSizeWords.
  const q = normalizeQuerySizes(normalize(query));
  const none = { results: [], correctedQuery: null, searchedQuery: q };
  if (!q) return none;
  const index = indexFor(items);
  const rawTokens = q.split(/\s+/).filter(Boolean);

  const asTyped = runSearch(index, rawTokens, maxResults);
  if (asTyped.length > 0)
    return { results: asTyped, correctedQuery: null, searchedQuery: q };

  // Nothing matched. Which words matched NOTHING, anywhere? Only those are
  // candidates — a word that matches something is spelled right, and the
  // query is empty because the combination does not exist ("romex 400a").
  const expansions = expandTokens(rawTokens);
  const dead = rawTokens.map(
    (_, i) => !index.some(indexed => scoreItem(indexed, [expansions[i]]) > 0)
  );
  if (!dead.some(Boolean)) return none;

  if (!_cachedVocabulary) _cachedVocabulary = buildVocabulary(index);
  const vocabulary = _cachedVocabulary;

  // Every dead word must be correctable, or there is no honest answer.
  const options = rawTokens.map((token, i) =>
    dead[i] ? correctionsFor(token, vocabulary) : [token]
  );
  if (options.some(list => list.length === 0)) return none;

  // The best-ranked correction that actually finds something. Tried in order
  // for each dead word, so a closer-but-empty candidate cannot win.
  for (let attempt = 0; attempt < MAX_CORRECTIONS_TRIED; attempt++) {
    const tokens = options.map(
      list => list[Math.min(attempt, list.length - 1)]
    );
    const results = runSearch(index, tokens, maxResults);
    if (results.length > 0) {
      const corrected = tokens.join(" ");
      return { results, correctedQuery: corrected, searchedQuery: corrected };
    }
  }
  return none;
}

function runSearch<T extends SearchableItem>(
  index: IndexedItem<T>[],
  tokens: string[],
  maxResults: number
): SmartSearchResult<T>[] {
  // Split query into tokens and expand each independently
  const tokenExpansions = expandTokens(tokens);
  const scored: { item: T; score: number }[] = [];
  for (const indexed of index) {
    const score = scoreItem(indexed, tokenExpansions);
    if (score > 0) {
      scored.push({ item: indexed.item, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

// ─── Typo correction ──────────────────────────────────────────────────────────

/** Shorter words are never corrected — rule 3 in smartSearchCorrected. */
export const MIN_TYPO_LENGTH = 4;

/** How many alternatives per dead word are tried before giving up. */
const MAX_CORRECTIONS_TRIED = 3;

/** A word the corrector may touch, or offer: letters only, long enough. */
const CORRECTABLE = /^[a-z]+$/;

/**
 * Every correctable word the catalog uses, with how often it appears.
 *
 * The count breaks ties between two equally close words in favour of the one
 * the catalog is full of: "brakr" is two edits from "breaker" and from a rarer
 * word or two, and "breaker" is on 60-odd rows.
 */
function buildVocabulary(
  index: IndexedItem<SearchableItem>[]
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (source: string, weight: number) => {
    for (const word of normalize(source).split(/[^a-z]+/)) {
      if (word.length >= MIN_TYPO_LENGTH && CORRECTABLE.test(word))
        counts.set(word, (counts.get(word) ?? 0) + weight);
    }
  };
  for (const { text } of index) add(text, 1);
  // The shared trade vocabulary counts too, lightly: it is how a misspelled
  // slang word ("romax") reaches the slang ("romex") that then expands.
  for (const [key, values] of Object.entries(ALIAS_MAP)) {
    add(key, 0.5);
    for (const value of values) add(value, 0.5);
  }
  return counts;
}

/**
 * The words `token` is probably a misspelling of, best first.
 *
 * Distance is optimal-string-alignment (Levenshtein plus adjacent swaps, so
 * "flourescent" is ONE edit from "fluorescent", not two). The budget grows
 * with the word: one edit at four letters, two from five. The first letter
 * must match — people misspell the middle of a word, rarely its start, and
 * requiring it removes most of the wrong answers a two-edit budget allows.
 *
 * A word being typed is compared with the START of catalog words as well, at
 * a half-edit penalty, so the correction appears while typing ("recepti" →
 * receptacle) rather than only once the word is finished.
 */
function correctionsFor(
  token: string,
  vocabulary: Map<string, number>
): string[] {
  if (token.length < MIN_TYPO_LENGTH || !CORRECTABLE.test(token)) return [];
  const budget = token.length === MIN_TYPO_LENGTH ? 1 : 2;
  const found: { word: string; cost: number; count: number }[] = [];
  vocabulary.forEach((count, word) => {
    if (word[0] !== token[0] || word === token) return;
    let cost = osaDistance(token, word, budget);
    if (token.length >= 5 && word.length > token.length) {
      for (let len = token.length - 1; len <= token.length + 1; len++) {
        if (len > word.length) break;
        const prefixCost = osaDistance(token, word.slice(0, len), budget) + 0.5;
        if (prefixCost < cost) cost = prefixCost;
      }
    }
    if (cost <= budget) found.push({ word, cost, count });
  });
  found.sort(
    (a, b) =>
      a.cost - b.cost ||
      b.count - a.count ||
      a.word.length - b.word.length ||
      (a.word < b.word ? -1 : 1)
  );
  return found.slice(0, MAX_CORRECTIONS_TRIED).map(f => f.word);
}

/**
 * Optimal string alignment distance, giving up past `max` (returns max + 1).
 *
 * Exported for the tests, which pin the five reported misspellings to their
 * distances rather than trusting the arithmetic.
 */
export function osaDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// ─── Category-aware search ────────────────────────────────────────────────────
export function smartSearchGrouped<T extends SearchableItem>(
  items: T[],
  query: string,
  maxResults = 200
): Map<string, T[]> {
  const results = smartSearch(items, query, maxResults);
  const grouped = new Map<string, T[]>();
  for (const item of results) {
    const cat = item.category ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }
  return grouped;
}
