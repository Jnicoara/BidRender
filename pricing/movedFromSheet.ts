/**
 * Pricing-sheet rows that moved into the shipped catalog under ANOTHER name.
 *
 *   pricing sheet name  ->  shipped name
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `buildPricingSheet.mts` starts from the shipped catalog and then adds its own
 * rows, skipping any name already shipped. That is what marks a moved row as
 * moved — but only when the names match exactly. A row that moved under a new
 * name, or was folded into a row that already existed, would otherwise come
 * back as NEW beside its shipped self and be priced twice.
 *
 * Two kinds of entry, kept apart because they mean different things:
 *
 *   MERGED — the sheet row was the SAME PRODUCT as a row already shipped,
 *            worded another way ("10/2 MC cable" is "10-2 MC cable"). Nothing
 *            was added; the shipped row's aliases carry the sheet's wording
 *            where it was not already findable.
 *   RENAMED — the sheet row was added, under the catalog's naming ("Romex
 *            staple, 1/2 in" style becomes the `1/2"` style the rest of the
 *            catalog uses).
 *
 * Moved in batches on 2026-09-25. Rows the sheet still lists as NEW were left
 * there on purpose — a recorded decision, a blocked category, or a question for
 * the owner (see the commit messages for each batch).
 *
 * Every value must be a shipped name and no key may be one; the sheet builder
 * refuses to run otherwise, and `server/pricingSheetMoves.test.ts` asserts the
 * same so it is checked on every test run rather than only when somebody
 * regenerates the sheet.
 */

export const MERGED_FROM_SHEET: Record<string, string> = {
  // ── Batch 1: wire, conduit fittings, connectors, consumables, fasteners, strut
  "10/2 MC cable": "10-2 MC cable",
  "10/3 MC cable": "10-3 MC cable",
  "12/3 MC cable": "12-3 MC cable",
  "8/3 MC cable": "8-3 MC cable",
  "10/3 NM-B": "10-3 NM-B",
  "12/3 NM-B": "12-3 NM-B",
  "14/3 NM-B": "14-3 NM-B",
  "6/3 NM-B": "6-3 NM-B",
  "8/3 NM-B": "8-3 NM-B",
  "10/2 UF-B": "10-2 UF-B",
  "12/2 UF-B": "12-2 UF-B",
  "Bare copper, #2": "#2 bare CU, stranded",
  "Bare copper, #4": "#4 bare CU, stranded",
  "Bare copper, 1/0": "#1/0 bare CU, stranded",
  // The sheet does not say copper or aluminum. XHHW-2 at these sizes is
  // bought as aluminum feeder, and the catalog ships it only that way.
  "XHHW-2, #2": "#2 XHHW AL",
  "XHHW-2, 1/0": "#1/0 XHHW AL",
  "XHHW-2, 4/0": "#4/0 XHHW AL",
  '4" rigid coupling': '4" rigid conduit coupling',
  // The four cable connectors are sized by jacket diameter and already stand
  // for every style — snap-in, two-screw, duplex — see connectors.ts.
  "AC/MC snap connector": '3/8" cable connector',
  "Duplex NM connector": '3/8" cable connector',
  "Snap-in NM connector": '3/8" cable connector',
  "Two-screw NM connector": '3/8" cable connector',
  "MC cable connector, 3/8 in": '3/8" cable connector',
  "MC cable connector, 1/2 in": '1/2" cable connector',
  "Romex connector, 1/2 in": '1/2" cable connector',
  "Romex connector, 3/4 in": '3/4" cable connector',
  "Compression lug, 4/0": "2/0-4/0 AWG crimp lug",
  "Mechanical lug, 4/0": "2/0-4/0 AWG crimp lug",
  // Polaris is a brand of insulated multi-tap connector.
  "Polaris connector, 4/0": "Insulated multi-tap block",
  "Cable lubricant gel": "Pulling lube",
  "Wire pulling soap": "Pulling lube",
  "Push-in connectors": "Push-in wire connector",
  "Split bolt connector": "Split-bolt connector",
  "Wire nuts, assorted": "Wire nuts",
  "All-thread rod, 3/8 in": '3/8" all-thread rod, 10 ft',
  "All-thread rod, 1/2 in": '1/2" all-thread rod, 10 ft',
  // Unsized duplicates of the four sized rod-hardware families; folded into
  // 3/8", the size most hangers are hung on.
  "Hex nut": '3/8" hex nut',
  "Lock washer": '3/8" lock washer',
  "Washer, flat": '3/8" flat washer',
  "Rod coupling nut": '3/8" rod coupler',
  "Insulated staple": "Cable staple",
  "Nail-on cable staple": "Cable staple",
  "Strut nut": "Strut channel nut",
  "Strut spring nut": "Strut channel nut",
  "Tapcon screw": "Masonry screw",
  "Batwing hanger": "Rod hanger clip",
  "Rod hanger, 1/4-20": "Rod hanger clip",
  "Ceiling grid support clip": "T-bar grid clip",
  "Fixture hanger bar": "Fixture mounting bracket",
  "Pipe strap, 4 in": '4" strut conduit strap',
  "Strut 90-degree fitting": "Strut angle bracket",
  "Strut, 1-5/8 in x 1-5/8 in": '1-5/8" x 1-5/8" strut channel, 10 ft',
  "Strut, 1-5/8 in x 13/16 in": '1-5/8" x 13/16" strut channel, 10 ft',
  "Unistrut end cap": "Strut end cap",

  // ── Batch 2: boxes, wall plates, receptacles, switches
  "Anti-short bushing": "MC anti-short bushing",
  "Box extender": "Single-gang box extender",
  "Old-work fan box": "Ceiling fan brace box",
  // Mud ring depths; the shipped ring already answers to "plaster ring".
  "Plaster ring, 1/2 in": '4" square mud ring',
  "Plaster ring, 5/8 in": '4" square mud ring',
  "Romex staple, 1/2 in": "Cable staple",
  "Romex staple, 3/4 in": "Cable staple",
  "Stacker staple": "Cable staple",
  "Stud guard plate": '1-1/2" nail plate',
  "1-gang decorator plate": "Wall plate",
  "2-gang decorator plate": "2-gang wall plate",
  "3-gang decorator plate": "3-gang wall plate",
  // A decorator plate is what goes on a GFCI; the plate is not aliased to
  // the device (devices.ts header).
  "GFCI wall plate": "Wall plate",
  "Outlet box spacer": "Device shim",
  "15A AFCI receptacle": "AFCI receptacle",
  "15A duplex receptacle": "Duplex receptacle",
  "15A GFCI receptacle": "GFCI receptacle",
  "Self-test GFCI receptacle": "GFCI receptacle",
  // Every shipped duplex is already tamper-resistant (its aliases say so).
  "15A tamper-resistant receptacle": "Duplex receptacle",
  "20A tamper-resistant receptacle": "20A duplex receptacle",
  "15A weather-resistant receptacle": "Duplex receptacle, weather-resistant",
  "20A weather-resistant receptacle":
    "20A duplex receptacle, weather-resistant",
  "USB-C combo receptacle": "USB combo receptacle",
  "Astronomic time switch": "Time clock",
  "Digital in-wall timer": "Timer switch",
  "Spring-wound timer switch": "Timer switch",
  "Rotary dimmer": "Dimmer",
  "Slide dimmer": "Dimmer",
  "Wall-mount vacancy sensor": "Vacancy sensor switch",

  // ── Batch 3: panels, breakers, distribution, grounding
  "Breaker filler plate": "Panel filler plate",
  "Panel ground bar": "Ground bar kit",
  "Ground busbar": "Ground bar kit",
  "Photocell contactor": "Lighting contactor",
  "Signage circuit timer": "Time clock",
  "Acorn ground clamp": "Ground rod clamp",
  "Gas line bonding clamp": "Water pipe bonding clamp",
  // The shipped 8 ft rod is the 5/8" one.
  "Ground rod, 5/8 in x 8 ft": "Ground rod, 8 ft",

  // ── Batch 4: lighting and life safety
  "Direct burial splice kit": "Underground splice kit",
  "Drum ceiling fixture": "Surface-mount ceiling fixture",
  "Flush mount ceiling fixture": "Surface-mount ceiling fixture",
  "Flood light, adjustable knuckle": "Flood light",
  // The shipped landscape fixture already stands for path, well and up
  // lights (its aliases say so), and the high bay for linear and UFO.
  "Path light fixture": "Landscape light fixture",
  "Well light fixture": "Landscape light fixture",
  "In-grade uplight": "Landscape light fixture",
  "LED linear high bay": "High bay",
  "LED round high bay": "High bay",
  "Occupancy sensor, ceiling mount": "Ceiling occupancy sensor, PIR",
  "Photocell for wall pack": "Photocell",
  "Photocell, stem mount": "Photocell",
  "Dual-action pull station": "Fire alarm pull station",

  // ── Batch 5: low voltage, equipment and appliances
  "18/2 thermostat wire": "18/2 control wire",
  "Doorbell wire": "18/2 control wire",
  "Low-voltage mounting bracket": "Low-voltage mud ring",
  "Video doorbell transformer": "Doorbell transformer",
  "Fan mounting brace, adjustable": "Ceiling fan brace box",
  "Fan wall control": "Fan speed control",
  "Spa bonding wire, #8 solid": "#8 bare CU, solid",
  // The shipped manual transfer switch already stands for both sizes.
  "Transfer switch, 6-circuit": "Manual transfer switch",
  "Transfer switch, 10-circuit": "Manual transfer switch",

  // ── Batch 6: the held questions, answered by the owner 2026-09-25
  // "-3" is three insulated conductors and the reduced ground, so these are
  // the shipped rows written out in full.
  "Aluminum SER, 4/0": "4/0-4/0-4/0-2/0 SER AL",
  "SER cable, 1/0-1/0-1/0-2": "1/0-1/0-1/0-2 SER AL",
  // At 400A and 600A a safety switch is the fused one the catalog ships.
  "400A safety switch": "400A fused disconnect",
  "600A safety switch": "600A fused disconnect",
  // Appliance disconnects, given real specs by the owner.
  "Heat pump disconnect": "60A non-fused pullout disconnect",
  "Mini-split disconnect": "60A non-fused pullout disconnect",
  "Water heater disconnect": "30A non-fused disconnect, NEMA 1",
  "Spa manual disconnect": "50A GFCI spa disconnect",
  "Hot tub GFCI panel": "50A GFCI spa disconnect",
  "20A twist-lock receptacle": "L5-20 receptacle",
  // The wafer's two-size rule: 5", 6" and 7" discs are one 5"/6" row.
  '6" LED disc light': '5"/6" LED disc light',
  '7" LED disc light': '5"/6" LED disc light',
  "Wall plate extender": "Single-gang box extender",
};

export const RENAMED_FROM_SHEET: Record<string, string> = {
  // ── Batch 1
  "14/2 UF-B": "14-2 UF-B",
  "Fire alarm cable, 14/2": "14-2 fire alarm cable",
  "Fire alarm cable, 16/2": "16-2 fire alarm cable",
  "SJOOW cord, 14/3": "14-3 SJOOW cord",
  "SOOW cord, 10/3": "10-3 SOOW cord",
  "SOOW cord, 12/3": "12-3 SOOW cord",
  "Tray cable, 12/3": "12-3 tray cable",
  "Crimp sleeve, #2": "#2 crimp sleeve",
  "Crimp sleeve, 4/0": "#4/0 crimp sleeve",
  "Din rail": "DIN rail",
  "Caddy clip, 1/2 in": '1/2" conduit clip',
  "Caddy clip, 3/4 in": '3/4" conduit clip',

  // ── Batch 2
  "Extension ring, single-gang": "Single-gang box extender",
  "Extension ring, 4 in": '4" square extension ring',
  "Junction box cover, 4 in": '4" square blank cover',
  "Junction box cover, 4-11/16 in": '4-11/16" square blank cover',
  "Nail plate, 1-1/2 in": '1-1/2" nail plate',
  "Nail plate, 3 in": '3" nail plate',
  "Cable protection plate, 5 in": '5" nail plate',
  "Old-work single-gang box": "Single-gang old-work box",
  "Old-work double-gang box": "Double-gang old-work box",
  "Old-work triple-gang box": "Triple-gang old-work box",
  "Blank plate, 4-gang": "4-gang blank plate",
  // The plain name is the 15A one, as with every shipped receptacle.
  "15A GFCI receptacle, weather-resistant":
    "GFCI receptacle, weather-resistant",
  "15A TR/WR receptacle": "Duplex receptacle, weather-resistant",
  "20A TR/WR receptacle": "20A duplex receptacle, weather-resistant",
  "15A single receptacle": "Single receptacle",
  "15A quad receptacle": "Quad receptacle",
  "15A surge-protective receptacle": "Surge-protective receptacle",
  // "Receptacle …" as a name outranked the Duplex receptacle for "recep".
  "Receptacle shim": "Device shim",
  // It has no receptacle: a GFCI with a blank face, protecting downstream.
  // Ends in "device" so it is not read as THE GFCI for a search of "gfci".
  "Dead-front GFCI receptacle": "Dead-front GFCI device",

  // ── Batch 3
  "15A quad breaker, two 2-pole circuits": "15A 2-Pole quad breaker",
  "20A quad breaker, two 2-pole circuits": "20A 2-Pole quad breaker",
  "Ansul micro-switch": "Hood suppression micro-switch",
  // A name holding "plug" led a search for "plug", above every receptacle.
  // The six brand variants follow it as their parent.
  "Plug-on surge protective device": "Breaker-style surge protective device",
  // These two led "panel", "meter" and "load center" ahead of the everyday
  // panels and meter bases.
  "Combination meter-main panel": "Combination meter-main",
  "Generator ready load center": "Generator-ready main panel",
  "Wireway, 4x4": "4x4 wireway",
  "Wireway, 6x6": "6x6 wireway",
  "Panelboard, 208V 3-phase": "208V 3-phase panelboard",
  "Panelboard, 480V 3-phase": "480V 3-phase panelboard",
  "Ground rod, 3/4 in x 10 ft": 'Ground rod, 3/4" x 10 ft',
  // Panels take the catalog's "main panel" / "main-lug sub-panel" wording.
  ...Object.fromEntries(
    [
      ["60", ["8", "12"]],
      ["100", ["12", "20", "24"]],
      ["125", ["20", "24", "30"]],
      ["150", ["30", "40"]],
      ["200", ["30", "40", "42"]],
      ["225", ["42"]],
      ["400", ["42"]],
    ].flatMap(([amps, spaces]) =>
      (spaces as string[]).flatMap(n => [
        [
          `${amps}A ${n}-space main breaker panel`,
          `${amps}A main panel, ${n}-space`,
        ],
        [
          `${amps}A ${n}-space main lug panel`,
          `${amps}A main-lug sub-panel, ${n}-space`,
        ],
      ])
    )
  ),
  "100A outdoor main breaker panel": "100A outdoor main panel",

  // ── Batch 4
  // Led a search for "j box", above every pull box.
  "In-ground junction box": "In-ground splice box",
  "Fixture whip, 4 ft": "4 ft MC whip",
  "Fixture whip, 8 ft": "8 ft MC whip",
  "LED retrofit kit": "LED troffer retrofit kit",
  // A remote head is an emergency-light part, not an exit sign.
  "Exit sign, remote head": "Emergency light remote head",
  // Knox is a brand; the catalog is generic.
  "Fire alarm knox box": "Rapid-entry key box",
  // A name starting "Smoke detector" led a search for "smoke detector".
  "Smoke detector base": "Detector base",
  "Smoke detector interconnect harness": "Detector wiring harness",

  // ── Batch 5
  "18/5 thermostat wire": "18/5 control wire",
  "18/8 thermostat wire": "18/8 control wire",
  // Velcro is a brand.
  "Velcro cable strap": "Hook-and-loop cable strap",
  "Bath fan, 50 CFM": "Bath exhaust fan, 50 CFM",
  "Bath fan, 80 CFM": "Bath exhaust fan, 80 CFM",
  "Bath fan, 110 CFM": "Bath exhaust fan, 110 CFM",
  "Bath fan, 150 CFM": "Bath exhaust fan, 150 CFM",
  "Bath fan with light": "Bath exhaust fan, light combo",
  "Bath fan with heater": "Bath exhaust fan, heater combo",
  // Names that led a search they should not have: "bath fan", "plug",
  // "ev charger".
  "Bath fan grille": "Replacement fan grille",
  "Generator plug, L14-30": "Generator cord cap, L14-30",
  "Generator plug, CS6365": "Generator cord cap, CS6365",
  "EV charger pedestal": "EVSE pedestal",
  "Backdraft damper, 4 in": '4" backdraft damper',
  "Backdraft damper, 6 in": '6" backdraft damper',
  "Insulated flex duct, 4 in": '4" insulated flex duct',
  "Insulated flex duct, 6 in": '6" insulated flex duct',
  "Roof vent cap, 4 in": '4" roof vent cap',
  "Wall vent cap, 4 in": '4" wall vent cap',
  "Fan downrod, 12 in": '12" fan downrod',
  "Fan downrod, 24 in": '24" fan downrod',
  "Fan downrod, 36 in": '36" fan downrod',
  "Generator cord, 30A": "30A generator cord",
  "Generator cord, 50A": "50A generator cord",
  "Power inlet box, 30A": "30A power inlet box",
  "Power inlet box, 50A": "50A power inlet box",
  "200A outdoor main breaker panel": "200A outdoor main panel",

  // ── Batch 6
  // SE cable by its full conductor set, metal stated. The sheet named no
  // metal; these are stocked in aluminum (wireAndCable.ts).
  "SER cable, 2-2-2-4": "2-2-2-4 SER AL",
  "SER cable, 4-4-4-6": "4-4-4-6 SER AL",
  "SEU cable, 2-2-4": "2-2-4 SEU AL",
  "SEU cable, 4-4-6": "4-4-6 SEU AL",
  "USE-2, 4/0": "#4/0 USE-2 AL",
  "Aluminum URD, 1/0": "1/0 URD triplex AL",
  '5" LED disc light': '5"/6" LED disc light',
  ...Object.fromEntries(
    ["15", "30", "45", "75"].map(kva => [
      `Step-down transformer, ${kva} kVA`,
      `${kva} kVA dry-type transformer, 480V-208Y/120V 3-phase`,
    ])
  ),
  "Weatherproof cover, 2-gang": "Weatherproof in-use cover, 2-gang",
};

/** Every sheet name that moved under a different name, whichever kind. */
export const MOVED_FROM_SHEET: Record<string, string> = {
  ...MERGED_FROM_SHEET,
  ...RENAMED_FROM_SHEET,
};

/**
 * Pricing-sheet rows the owner decided NOT to carry, with the reason.
 *
 * Kept as a list rather than deleted from buildPricingSheet.mts, so the next
 * person who walks a job and thinks "the sheet is missing a 4\" LB" finds that
 * it was considered and why it went. The builder skips these, and refuses to
 * run if one is no longer generated (a stale entry) or has since shipped.
 */
export const DROPPED_FROM_SHEET: Record<string, string> = {
  // ── Batch 6, 2026-09-25
  'Conduit body, 4" LB': "No raceway type — EMT, rigid and PVC LBs differ.",
  'Chase nipple, 4"': "A lone size with no family behind it.",
  "30A twist-lock receptacle":
    "Is L6-30 or L14-30; both shipped rows answer to 30A twist-lock.",
  "50A twist-lock receptacle": "Dropped by the owner.",
  "Generator inlet box":
    "Is the shipped 30A or 50A power inlet box, both aliased generator inlet.",
  // Superseded by the fused / non-fused x NEMA 1 / NEMA 3R disconnect family.
  ...Object.fromEntries(
    ["30", "60", "100", "200"].flatMap(amps => [
      [`${amps}A safety switch`, "Superseded by the disconnect family."],
      [
        `${amps}A NEMA 3R safety switch`,
        "Superseded by the disconnect family.",
      ],
    ])
  ),
  "Box relocation kit": "Dropped by the owner.",
  "Cable support bushing": "Dropped by the owner.",
  "Grease-rated cord set": "Dropped by the owner.",
  "Cable tester": "A tool, not a material.",
};
