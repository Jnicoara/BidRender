/**
 * COMPLETENESS PASS for the owner's review sheet (owner, 2026-10-07): what a
 * typical small commercial / retail job uses — a Dollar Tree retrofit, a
 * small office TI, a lighting retrofit, a panel change, a service upgrade —
 * checked against the catalog. An item is reported MISSING only when no
 * shipped or waiting row carries ALL of its `need` words (folded the way
 * shared/materialDuplicates.ts folds names, so "set screw" = "SS") and its
 * size. Missing items go on the Missing tab pre-filled "Add"; the owner
 * decides.
 *
 * The list is a starting point written by Track A from typical job scope,
 * not a supplier's catalog. A wrong "missing" costs a row the owner marks
 * Skip; that is why every item carries its reason.
 */
export type TypicalItem = {
  /** The name it would ship under, in the catalog's style. */
  name: string;
  category: string;
  /** Words (and size) a row must carry to count as already having it. */
  need: string[];
  reason: string;
  /**
   * Only a row's NAME counts, not its search words — where slang would
   * claim a different part (plain Cat6 lists "plenum" as a search word, but
   * plenum cable is its own product).
   */
  nameOnly?: boolean;
};

const RETAIL = "Dollar Tree / retail retrofit";
const OFFICE = "small office TI";
const LIGHTING = "lighting retrofit";
const PANEL = "panel change";
const SERVICE = "service upgrade";

const item = (
  name: string,
  category: string,
  need: string[],
  reason: string,
  nameOnly = false
): TypicalItem => ({ name, category, need, reason, nameOnly });

export const TYPICAL_ITEMS: TypicalItem[] = [
  // ── Wire & cable ──
  item(
    "12/2 MC cable with 16/2 dimming",
    "Wire & Cable",
    ["mc", "dimming"],
    `${LIGHTING}: 0-10V fixtures are fed with MC carrying a dimming pair`
  ),
  item(
    "12/2 MC-AP cable",
    "Wire & Cable",
    ["mc-ap"],
    `${OFFICE}: aluminum-armor MC with a bonding wire is the common TI cable`
  ),
  item(
    "18/2 shielded fire alarm cable, FPLP",
    "Wire & Cable",
    ["fire", "alarm", "18/2"],
    `${OFFICE}: plenum fire-alarm cable above lay-in ceilings (14-2 and 16-2 are listed, 18/2 is not)`
  ),
  item(
    "Cat6 plenum cable",
    "Low Voltage",
    ["cat6", "plenum"],
    `${OFFICE}: data drops above a return-air ceiling must be plenum (CMP); plain Cat6 only lists "plenum" as a search word`,
    true
  ),
  item(
    "#10 THHN stranded Copper",
    "Wire & Cable",
    ["thhn", "stranded"],
    `${PANEL}: stranded is pulled through conduit for 30A circuits`
  ),
  // ── Conduit and fittings ──
  item(
    '1/2" EMT insulated set-screw connector',
    "Conduit Fittings",
    ["emt", "insulated", "setscrew", "connector"],
    `${OFFICE}: insulated-throat connectors are spec'd on most TI jobs`
  ),
  item(
    '1/2" EMT to FMC transition coupling',
    "Conduit Fittings",
    ["emt", "transition"],
    `${OFFICE}: EMT drops changing to flex at the fixture`
  ),
  item(
    '1/2" FMC squeeze connector',
    "Conduit Fittings",
    ["flexible", "metal", "conduit", "connector"],
    `${LIGHTING}: the standard flex connector at a fixture`
  ),
  item(
    '3/8" FMC (reduced wall)',
    "Conduit",
    ['3/8"', "flexible"],
    `${LIGHTING}: 3/8" flex is the usual fixture whip conduit`
  ),
  item(
    '1/2" liquidtight 90-degree connector',
    "Conduit Fittings",
    ["liquidtight", "90", "connector"],
    `${SERVICE}: rooftop unit and condenser whips turn 90° at the unit`
  ),
  item(
    '1/2" PVC male adapter',
    "Conduit Fittings",
    ["pvc", "male", "adapter"],
    `${SERVICE}: PVC into a box or panel needs a male adapter`
  ),
  item(
    '1/2" PVC female adapter',
    "Conduit Fittings",
    ["pvc", "female", "adapter"],
    `${SERVICE}: PVC to a threaded fitting`
  ),
  item(
    '1/2" PVC expansion fitting',
    "Conduit Fittings",
    ["pvc", "expansion"],
    `${SERVICE}: exposed outdoor PVC runs need expansion fittings`
  ),
  item(
    '1/2" grounding bushing',
    "Grounding & Bonding",
    ["grounding", "bushing"],
    `${SERVICE}: required on concentric knockouts at service equipment`
  ),
  item(
    '1/2" knockout seal',
    "Conduit Fittings",
    ["knockout", "seal"],
    `${PANEL}: unused openings in a replaced panel must be closed`
  ),
  item(
    '3/4" to 1/2" reducing washer',
    "Conduit Fittings",
    ["reducing", "washer"],
    `${PANEL}: fitting a smaller conduit into an existing knockout`
  ),
  item(
    '1/2" EMT offset connector',
    "Conduit Fittings",
    ["emt", "offset"],
    `${RETAIL}: surface EMT into a box without bending an offset`
  ),
  item(
    '1/2" one-hole strap',
    "Strut & Supports",
    ["one-hole", "strap"],
    `${RETAIL}: surface conduit along walls and fixtures`
  ),
  item(
    '1/2" conduit hanger',
    "Strut & Supports",
    ["conduit", "hanger"],
    `${OFFICE}: EMT hung from threaded rod above a lay-in ceiling`
  ),
  // ── Boxes and covers ──
  item(
    '4" square box, 2-1/8" deep',
    "Boxes",
    ["4square", '2-1/8"'],
    `${OFFICE}: the deep 1900 box is the default for 20A devices`
  ),
  item(
    '4-11/16" square box',
    "Boxes",
    ['4-11/16"', "box"],
    `${OFFICE}: larger box where several circuits meet`
  ),
  item(
    '4" square blank cover',
    "Boxes",
    ["4square", "blank", "cover"],
    `${OFFICE}: every junction box above a ceiling closes with one`
  ),
  item(
    '4" octagon box',
    "Boxes",
    ["octagon"],
    `${LIGHTING}: ceiling fixture box`
  ),
  item(
    "T-bar box hanger",
    "Strut & Supports",
    ["box", "hanger"],
    `${OFFICE}: boxes in a lay-in grid hang from the T-bar (a grid clip and a fan bar hanger are listed, a box hanger is not)`,
    true
  ),
  item(
    '4" square mud ring, 1-gang',
    "Boxes",
    ["4square", "mud", "ring"],
    `${OFFICE}: single-device ring on a 1900 box (2-gang and fixture rings are listed)`
  ),
  item(
    "Box extension ring",
    "Boxes",
    ["extension", "ring"],
    `${RETAIL}: deepening an existing box after a wall is furred`
  ),
  // ── Devices and plates ──
  item(
    "20A duplex receptacle, tamper-resistant",
    "Receptacles",
    ["20a", "duplex", "tamper"],
    `${RETAIL}: required in many retail and office spaces`
  ),
  item(
    "20A single-pole switch, commercial",
    "Switches",
    ["20a", "1pole", "switch"],
    `${OFFICE}: the commercial 20A toggle`
  ),
  item(
    "Stainless steel wall plate, 1-gang",
    "Wall Plates & Misc",
    ["stainless", "plate"],
    `${RETAIL}: stainless plates are the retail/back-of-house norm`
  ),
  item(
    "Blank wall plate, 1-gang",
    "Wall Plates & Misc",
    ["blank", "plate"],
    `${RETAIL}: closing abandoned boxes after demo`
  ),
  item(
    "Weatherproof cover, 1-gang",
    "Wall Plates & Misc",
    ["weatherproof", "cover"],
    `${SERVICE}: exterior receptacles and switches`
  ),
  // ── Breakers and disconnects ──
  item(
    "Breaker handle lock",
    "Breakers",
    ["breaker", "lock-off"],
    `${RETAIL}: lighting and emergency circuits locked on`
  ),
  item(
    "Breaker filler plate",
    "Breakers",
    ["filler"],
    `${PANEL}: open spaces in a panel must be closed`
  ),
  item(
    "30A toggle disconnect",
    "Panels",
    ["motor-rated", "toggle"],
    `${RETAIL}: small motors and water heaters`
  ),
  item(
    "Manual motor starter",
    "Equipment & Appliances",
    ["motor-rated", "toggle"],
    `${OFFICE}: exhaust fans and small pumps`
  ),
  // ── Lighting and controls ──
  item(
    "LED tube, Type A (ballast compatible)",
    "Lighting Hardware",
    ["type", "tube"],
    `${LIGHTING}: plug-and-play retrofit tube`
  ),
  item(
    "LED emergency driver",
    "Lighting Hardware",
    ["emergency", "driver"],
    `${LIGHTING}: battery backup inside a fixture instead of a bug-eye`
  ),
  item(
    "Emergency light, two-head",
    "Life Safety",
    ["emergency", "light"],
    `${RETAIL}: egress lighting in back rooms`
  ),
  item(
    "Photocell, 120-277V",
    "Lighting Hardware",
    ["photocell"],
    `${RETAIL}: parking lot and sign lighting`
  ),
  item(
    "Low-voltage power pack",
    "Lighting Hardware",
    ["power", "pack"],
    `${OFFICE}: drives ceiling occupancy sensors`
  ),
  item(
    "Fixture hanging kit, aircraft cable",
    "Lighting Hardware",
    ["aircraft", "cable"],
    `${RETAIL}: pendant LED strips hung from open structure`
  ),
  item(
    'Fixture whip, 6 ft, 3/8" flex',
    "Lighting Hardware",
    ["whip", "fixture"],
    `${LIGHTING}: prefab whips save labor on every troffer`
  ),
  item(
    "Ceiling grid clip",
    "Lighting Hardware",
    ["grid", "clip"],
    `${LIGHTING}: seismic/earthquake clips on lay-in fixtures`
  ),
  // ── Supports and anchors ──
  item(
    'Beam clamp, 3/8"',
    "Strut & Supports",
    ["beam", "clamp"],
    `${RETAIL}: rod hung from bar joists`
  ),
  item(
    'Wedge anchor, 3/8"',
    "Fasteners & Anchors",
    ["wedge", "anchor"],
    `${RETAIL}: strut and equipment into concrete`
  ),
  item(
    'Concrete screw, 1/4"',
    "Fasteners & Anchors",
    ["concrete", "screw"],
    `${RETAIL}: straps and boxes on block walls`
  ),
  item(
    "Toggle bolt",
    "Fasteners & Anchors",
    ["toggle", "bolt"],
    `${OFFICE}: boxes and fixtures on drywall`
  ),
  item(
    "Ceiling hanger wire, 12 ga",
    "Strut & Supports",
    ["ceiling", "support", "wire"],
    `${OFFICE}: independent support for boxes above lay-in ceilings`
  ),
  item(
    "J-hook",
    "Strut & Supports",
    ["j-hook"],
    `${OFFICE}: supporting low-voltage cable above ceilings`
  ),
  item(
    'Rod coupling, 3/8"',
    "Strut & Supports",
    ["rod", "coupler"],
    `${OFFICE}: joining threaded rod`
  ),
  // ── Grounding ──
  item(
    "Ground rod clamp (acorn)",
    "Grounding & Bonding",
    ["acorn"],
    `${SERVICE}: every ground rod needs one`
  ),
  item(
    "Water pipe ground clamp",
    "Grounding & Bonding",
    ["pipe", "clamp"],
    `${SERVICE}: bonding the water service`
  ),
  item(
    "Intersystem bonding bridge",
    "Grounding & Bonding",
    ["intersystem"],
    `${SERVICE}: required at the service for telecom bonding`
  ),
  item(
    "Ground bar kit",
    "Grounding & Bonding",
    ["ground", "bar"],
    `${PANEL}: separating grounds in a subpanel`
  ),
  item(
    "Green ground screw",
    "Grounding & Bonding",
    ["ground", "screw"],
    `${OFFICE}: bonding metal boxes`
  ),
  // ── Consumables ──
  item(
    "Lever wire connector",
    "Connectors & Terminations",
    ["lever"],
    `${LIGHTING}: lever nuts are now common on retrofit splices`
  ),
  item(
    "Electrical tape",
    "Consumables",
    ["electrical", "tape"],
    `${PANEL}: used on every job`
  ),
  item(
    "Cable ties",
    "Consumables",
    ["cable", "tie"],
    `${PANEL}: dressing conductors in a new panel`
  ),
  item(
    "Wire pulling lubricant",
    "Consumables",
    ["lubricant"],
    `${SERVICE}: pulling service conductors`
  ),
  item(
    "Pull string",
    "Consumables",
    ["pull", "rope"],
    `${OFFICE}: left in empty conduits for low voltage`
  ),
  item(
    "Anti-short bushings (MC)",
    "Connectors & Terminations",
    ["anti-short"],
    `${OFFICE}: required at every cut end of MC`
  ),
  item(
    "Panel directory labels",
    "Consumables",
    ["directory"],
    `${PANEL}: a new panel needs a circuit directory`
  ),
  item(
    "Arc flash label",
    "Consumables",
    ["arc", "flash", "label"],
    `${SERVICE}: required on commercial service equipment`
  ),
  item(
    "Split bolt connector",
    "Connectors & Terminations",
    ["split-bolt"],
    `${SERVICE}: tapping and splicing large conductors`
  ),
  item(
    "Insulated multi-tap connector",
    "Connectors & Terminations",
    ["multi-tap"],
    `${PANEL}: tapping feeders in a panel change`
  ),
];
