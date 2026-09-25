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
}

function getAliases(item: SearchableItem): string {
  const a = (item as { searchAliases?: string | string[] }).searchAliases;
  return Array.isArray(a) ? a.join(" ") : (a ?? "");
}

function buildIndex<T extends SearchableItem>(items: T[]): IndexedItem<T>[] {
  return items.map(item => {
    const descNorm = normalize(item.description);
    const text = normalize(
      [
        item.description,
        item.category ?? "",
        item.id ?? "",
        getAliases(item),
      ].join(" ")
    );
    const descWords = descNorm.split(/\s+/).filter(Boolean);
    return { item, text, descWords };
  });
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
}

function expandToken(token: string): TokenExpansion {
  const aliases = new Set<string>();

  // Direct key match (full or prefix of key)
  for (const [key, expansions] of Object.entries(ALIAS_MAP)) {
    const nk = normalize(key);
    // The typed token matches the alias key (starts-with for prefix typing)
    if (nk === token || nk.startsWith(token) || token.startsWith(nk)) {
      aliases.add(nk);
      for (const e of expansions) aliases.add(normalize(e));
    }
  }

  // Reverse lookup: token appears in an alias value
  for (const [key, expansions] of Object.entries(ALIAS_MAP)) {
    for (const exp of expansions) {
      const ne = normalize(exp);
      if (ne === token || ne.startsWith(token) || token.startsWith(ne)) {
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
  const wbRe = new RegExp(
    `(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  );
  if (wbRe.test(descNorm)) return 4;
  if (descNorm.includes(term)) return 5;
  // Tier 6 anchors at a word boundary rather than testing a raw substring.
  // The alias map holds two-letter manufacturer codes ("ch", "cb", "br"), and
  // an unanchored includes() found "ch" inside "switch" — which made searching
  // "breaker" return a single-gang box. Still prefix-friendly (a word may start
  // with the term), so typing "marret" continues to reach "marrette".
  if (wbRe.test(text)) return 6;
  return 0;
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
  const { text, descWords } = indexed;
  const descNorm = descWords.join(" ");

  let totalScore = 0;

  for (const { typed, aliases } of tokenExpansions) {
    let bestForToken =
      TYPED_POINTS[matchTier(typed, descNorm, descWords, text)];

    for (const alias of aliases) {
      if (alias.length < MIN_ALIAS_TERM_LENGTH) continue;
      const points = ALIAS_POINTS[matchTier(alias, descNorm, descWords, text)];
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
 */
export function smartSearchScored<T extends SearchableItem>(
  items: T[],
  query: string,
  maxResults = 100
): SmartSearchResult<T>[] {
  const q = normalize(query);
  if (!q) return [];

  // Rebuild index only when items reference changes
  if (items !== (_cachedItems as T[] | null)) {
    _cachedItems = items as SearchableItem[];
    _cachedIndex = buildIndex(items as SearchableItem[]);
  }
  const index = _cachedIndex as IndexedItem<T>[];

  // Split query into tokens and expand each independently
  const rawTokens = q.split(/\s+/).filter(Boolean);
  const tokenExpansions = rawTokens.map(expandToken);

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
