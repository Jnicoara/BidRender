/**
 * The planned starter assemblies beyond the first 8 — 160 recipes, so the
 * shipped library reaches the 168 in references/starter-assemblies-plan.md
 * (decided by the owner 2026-09-29, D1–D7). `ref` is the row in that plan.
 *
 * ── What every recipe here holds to ──────────────────────────────────────────
 * - Parts by STABLE KEY (`starterParts.ts`), never by catalog name.
 * - Hours NOT SET (D1) — `starter()` writes null, never 0. Until Track A's
 *   0123 lets the column hold NULL, these are held back rather than seeded at
 *   zero; see `starterHolds` in `assemblyRecipe.ts`.
 * - The fixture or appliance is its own line, marked `fixture` (D2).
 * - `branchWhip` only where the plan marks the line a whip (D18); a line
 *   carrying its own home run is not one.
 * - DR and most MS rows use the two categories waiting on 0122 (D3), and are
 *   held until it lands.
 * - DV34 needs surface raceway, which the catalog does not carry (retail plan
 *   R3). Its missing parts are LISTED, never added, and it never seeds
 *   half-built.
 * - Owner-furnished equipment (the hand dryer, the sign, the RTU, the walk-in,
 *   the motor) is deliberately not a line: the assembly is the connection.
 *
 * Categories for the resi and commercial specials follow the plan's "its
 * natural category": appliances and dedicated equipment circuits are
 * Equipment Connections, receptacle-style rows are Devices, fire alarm and
 * doorbells are Low Voltage/EMS, the time clock is Lighting, the generator
 * inlet is Panels. That choice is this file's, not the plan's — edit freely.
 */
import { p, starter, type BaselineAssembly } from "./assemblyRecipe";

export const PLANNED_STARTER_ASSEMBLIES: BaselineAssembly[] = [
  // ── DV — Devices ──
  starter("DV6", "Duplex receptacle retrofit", "Devices", "both", [
    p("single-gang-old-work-box", 1),
    p("duplex-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV7", "20A duplex receptacle", "Devices", "both", [
    p("single-gang-box", 1),
    p("20a-duplex-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter(
    "DV8",
    "Outdoor GFCI receptacle, in-use cover",
    "Devices",
    "residential",
    [
      p("single-gang-box", 1),
      p("siding-mounting-block", 1),
      p("gfci-receptacle-weather-resistant", 1),
      p("weatherproof-in-use-cover", 1),
      p("12-2-nm-b", 25, { branchWhip: true }),
      p("wire-nuts", 3),
    ]
  ),
  starter("DV9", "AFCI receptacle", "Devices", "both", [
    p("single-gang-box", 1),
    p("afci-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV10", "USB combo receptacle", "Devices", "residential", [
    p("single-gang-box", 1),
    p("usb-combo-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV11", "Quad receptacle", "Devices", "both", [
    p("double-gang-box", 1),
    p("quad-receptacle", 1),
    p("2-gang-wall-plate", 1),
    p("12-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 4),
  ]),
  starter("DV12", "Switch/receptacle combo", "Devices", "residential", [
    p("single-gang-box", 1),
    p("switch-receptacle-combo-device", 1),
    p("wall-plate", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV13", "3-way switch", "Devices", "both", [
    p("single-gang-box", 1),
    p("3-way-switch", 1),
    p("wall-plate", 1),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV14", "4-way switch", "Devices", "both", [
    p("single-gang-box", 1),
    p("4-way-switch", 1),
    p("wall-plate", 1),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV15", "3-way dimmer", "Devices", "both", [
    p("single-gang-box", 1),
    p("3-way-dimmer", 1),
    p("wall-plate", 1),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV16", "Two switches, one box", "Devices", "both", [
    p("double-gang-box", 1),
    p("single-pole-switch", 2),
    p("2-gang-wall-plate", 1),
    p("14-2-nm-b", 40, { branchWhip: true }),
    p("wire-nuts", 5),
  ]),
  starter("DV17", "Three switches, one box", "Devices", "both", [
    p("triple-gang-box", 1),
    p("single-pole-switch", 3),
    p("3-gang-wall-plate", 1),
    p("14-2-nm-b", 60, { branchWhip: true }),
    p("wire-nuts", 7),
  ]),
  starter("DV18", "Fan/light combo control", "Devices", "residential", [
    p("single-gang-box", 1),
    p("combination-fan-light-control", 1),
    p("wall-plate", 1),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 4),
  ]),
  // DV19: swap the device for Smart switch or Vacancy sensor switch (one recipe, per STARTER_LIBRARY)
  starter("DV19", "Timer / smart / vacancy switch", "Devices", "residential", [
    p("single-gang-box", 1),
    p("timer-switch", 1),
    p("wall-plate", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("DV20", "Duplex receptacle, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("20a-duplex-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter("DV21", "GFCI receptacle, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("20a-gfci-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter("DV22", "Quad receptacle, MC", "Devices", "commercial", [
    p("4-11-16in-square-box", 1),
    p("4-11-16in-square-mud-ring-2-gang", 1),
    p("20a-duplex-receptacle", 2),
    p("2-gang-wall-plate", 1),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 2),
    p("wire-nuts", 4),
  ]),
  starter("DV23", "Dedicated 20A receptacle, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("20a-duplex-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 40),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("20a-single-pole-breaker", 1),
    p("wire-nuts", 3),
  ]),
  starter(
    "DV24",
    "Isolated-ground receptacle (cash wrap)",
    "Devices",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring", 1),
      p("isolated-ground-receptacle", 1),
      p("wall-plate", 1),
      p("12-2-mc-cable-isolated-ground", 50),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("20a-single-pole-breaker", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "DV25",
    "Controlled receptacle (plug load)",
    "Devices",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring", 1),
      p("controlled-duplex-receptacle", 1),
      p("wall-plate", 1),
      p("12-3-mc-cable", 25, { branchWhip: true }),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("grounding-pigtail", 1),
      p("wire-nuts", 4),
    ]
  ),
  starter("DV26", "Single-pole switch, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("20a-single-pole-switch", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 20, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter("DV27", "3-way switch, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("20a-3-way-switch", 1),
    p("wall-plate", 1),
    p("12-3-mc-cable", 20, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter("DV28", "Key switch, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("key-switch", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 20, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter("DV29", "Wall occupancy sensor, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("dual-tech-occupancy-sensor-switch", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 20, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 3),
  ]),
  starter(
    "DV30",
    "Ceiling occupancy sensor + power pack",
    "Devices",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring-fixture", 1),
      p("ceiling-occupancy-sensor-dual-tech", 1),
      p("sensor-power-pack-120-277v", 1),
      p("18-3-control-wire", 25),
      p("12-2-mc-cable", 10),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("grid-box-bracket", 1),
      p("wire-nuts", 4),
    ]
  ),
  starter("DV31", "0-10V dimmer, MC", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("0-10v-dimmer", 1),
    p("wall-plate", 1),
    p("12-2-mc-cable", 20, { branchWhip: true }),
    p("18-2-control-wire", 25),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("grounding-pigtail", 1),
    p("wire-nuts", 4),
  ]),
  starter("DV32", "Floor receptacle, poke-through", "Devices", "commercial", [
    p("poke-through-device-2-service", 1),
    p("20a-duplex-receptacle", 1),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("wire-nuts", 3),
  ]),
  // DV33: conduit and wire traced
  starter("DV33", "Floor box receptacle (slab)", "Devices", "commercial", [
    p("floor-box", 1),
    p("floor-box-cover", 1),
    p("20a-duplex-receptacle", 1),
    p("wire-nuts", 3),
  ]),
  // DV34: held until surface raceway is in the catalog (retail plan R3, which
  // waits on a materials category from Track A's 0117). Never seeded with
  // only the two parts that exist.
  starter(
    "DV34",
    "Surface raceway receptacle (block wall)",
    "Devices",
    "commercial",
    [p("20a-duplex-receptacle", 1), p("wire-nuts", 3)],
    {
      missingParts: [
        "Surface raceway, 10 ft",
        "Surface raceway device box",
        "Surface raceway cover plate",
        "Surface raceway entrance fitting",
      ],
    }
  ),

  // ── LT — Lighting ──
  starter("LT3", "Ceiling fan, retrofit brace", "Lighting", "residential", [
    p("ceiling-fan-brace-box", 1),
    p("ceiling-fan", 1, { fixture: true }),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 4),
  ]),
  starter("LT4", 'Recessed can new construction, 6"', "Lighting", "both", [
    p("6in-recessed-can-new-construction-ic", 1, { fixture: true }),
    p("5in-6in-led-retrofit-trim", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT5", 'Recessed can new construction, 4"', "Lighting", "both", [
    p("4in-recessed-can-new-construction-ic", 1, { fixture: true }),
    p("4in-led-retrofit-trim", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT6", 'Recessed can retrofit, 6"', "Lighting", "both", [
    p("6in-recessed-can-remodel-ic", 1, { fixture: true }),
    p("5in-6in-led-retrofit-trim", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT7", 'Wafer LED downlight, 6" (canless)', "Lighting", "both", [
    p("5in-6in-wafer-led-downlight", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 2),
  ]),
  starter("LT8", 'Wafer LED downlight, 4" (canless)', "Lighting", "both", [
    p("4in-wafer-led-downlight", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 2),
  ]),
  starter("LT9", "Shower light, wet-rated", "Lighting", "residential", [
    p("4in-recessed-can-new-construction-ic", 1, { fixture: true }),
    p("4in-shower-wet-rated-trim", 1),
    p("led-par20-bulb", 1),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT10", "Pendant light", "Lighting", "residential", [
    p("octagon-box-plastic", 1),
    p("led-pendant-fixture", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT11", "Chandelier, heavy bracing", "Lighting", "residential", [
    p("ceiling-fan-brace-box", 1),
    p("chandelier", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT12", "Vanity light", "Lighting", "residential", [
    p("octagon-box-plastic", 1),
    p("vanity-light-3-light", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT13", "Wall sconce", "Lighting", "residential", [
    p("octagon-box-plastic", 1),
    p("led-wall-sconce", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT14", "Under-cabinet light", "Lighting", "residential", [
    p("24in-under-cabinet-light-bar", 1, { fixture: true }),
    p("14-2-nm-b", 15, { branchWhip: true }),
    p("3-8in-cable-connector", 1),
    p("wire-nuts", 2),
  ]),
  starter("LT15", "Exterior porch light", "Lighting", "residential", [
    p("siding-mounting-block", 1),
    p("octagon-box-plastic", 1),
    p("led-wall-sconce", 1, { fixture: true }),
    p("14-2-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter("LT16", "Flood / security light", "Lighting", "both", [
    p("1-2in-weatherproof-round-box", 1),
    p("led-security-light-motion-activated-2-head", 1, { fixture: true }),
    p("14-2-nm-b", 25, { branchWhip: true }),
    p("wire-nuts", 3),
  ]),
  starter(
    "LT17",
    "Landscape transformer and circuit",
    "Lighting",
    "residential",
    [
      p("300w-landscape-transformer", 1),
      p("1-2in-weatherproof-box-single-gang", 1),
      p("gfci-receptacle-weather-resistant", 1),
      p("weatherproof-in-use-cover", 1),
      p("12-2-uf-b", 25),
      p("wire-nuts", 3),
    ]
  ),
  starter("LT18", "Landscape light, each", "Lighting", "residential", [
    p("landscape-light-fixture", 1, { fixture: true }),
    p("landscape-lighting-cable", 30),
    p("landscape-hub-connector", 1),
  ]),
  starter("LT19", "2x4 LED troffer, lay-in", "Lighting", "commercial", [
    p("2x4-led-troffer", 1, { fixture: true }),
    p("6ft-mc-whip", 1),
    p("t-bar-grid-clip", 4),
    p("ceiling-support-wire", 2),
    p("independent-support-wire-clip", 2),
    p("wire-nuts", 3),
  ]),
  starter("LT20", "2x2 LED troffer, lay-in", "Lighting", "commercial", [
    p("2x2-led-troffer", 1, { fixture: true }),
    p("6ft-mc-whip", 1),
    p("t-bar-grid-clip", 4),
    p("ceiling-support-wire", 2),
    p("independent-support-wire-clip", 2),
    p("wire-nuts", 3),
  ]),
  starter("LT21", "1x4 LED troffer, lay-in", "Lighting", "commercial", [
    p("1x4-led-troffer", 1, { fixture: true }),
    p("6ft-mc-whip", 1),
    p("t-bar-grid-clip", 4),
    p("ceiling-support-wire", 2),
    p("independent-support-wire-clip", 2),
    p("wire-nuts", 3),
  ]),
  starter(
    "LT22",
    "4 ft LED strip, surface / suspended",
    "Lighting",
    "commercial",
    [
      p("4-ft-led-strip-fixture", 1, { fixture: true }),
      p("6ft-mc-whip", 1),
      p("ceiling-support-wire", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "LT23",
    "8 ft LED strip (sales floor rows)",
    "Lighting",
    "commercial",
    [
      p("8-ft-led-strip-fixture", 1, { fixture: true }),
      p("8-ft-mc-whip", 1),
      p("ceiling-support-wire", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter("LT24", "4 ft LED wraparound (back room)", "Lighting", "commercial", [
    p("4-ft-led-wraparound", 1, { fixture: true }),
    p("4in-square-box", 1),
    p("4in-square-mud-ring-fixture", 1),
    p("wire-nuts", 3),
  ]),
  starter("LT25", "4 ft vapor tight (cooler, dock)", "Lighting", "commercial", [
    p("4-ft-vapor-tight-fixture", 1, { fixture: true }),
    p("6ft-mc-whip", 1),
    p("cord-grip", 1),
    p("wire-nuts", 3),
  ]),
  starter("LT26", "High bay", "Lighting", "commercial", [
    p("high-bay", 1, { fixture: true }),
    p("8-ft-mc-whip", 1),
    p("beam-clamp", 2),
    p("wire-nuts", 3),
  ]),
  starter("LT27", "Exit sign", "Lighting", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring-fixture", 1),
    p("exit-sign", 1, { fixture: true }),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("wire-nuts", 3),
  ]),
  // LT28: swap to Emergency light for a bug-eye
  starter("LT28", "Emergency light / exit combo", "Lighting", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring-fixture", 1),
    p("emergency-exit-light-combo", 1, { fixture: true }),
    p("12-2-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("wire-nuts", 3),
  ]),
  starter("LT29", "Exterior wall pack", "Lighting", "commercial", [
    p("wall-pack-full-cutoff", 1, { fixture: true }),
    p("1-2in-weatherproof-round-box", 1),
    p("1-2in-emt-raintight-connector", 1),
    p("silicone-sealant", 1),
    p("wire-nuts", 3),
  ]),
  starter("LT30", "Track light, 8 ft with 4 heads", "Lighting", "commercial", [
    p("octagon-box-metal", 1),
    p("8-ft-lighting-track", 1),
    p("track-light-end-feed", 1),
    p("track-light-head", 4, { fixture: true }),
    p("wire-nuts", 3),
  ]),

  // ── RS — Resi specials ──
  starter(
    "RS1",
    "Range receptacle, 50A",
    "Equipment Connections",
    "residential",
    [
      p("double-gang-box", 1),
      p("50a-range-receptacle", 1),
      p("6-3-nm-b", 40),
      p("50a-2-pole-breaker", 1),
      p("3-4in-cable-connector", 1),
      p("range-cord-4-wire", 1),
    ]
  ),
  starter(
    "RS2",
    "Dryer receptacle, 30A",
    "Equipment Connections",
    "residential",
    [
      p("double-gang-box", 1),
      p("30a-dryer-receptacle", 1),
      p("10-3-nm-b", 40),
      p("30a-2-pole-breaker", 1),
      p("1-2in-cable-connector", 1),
      p("dryer-cord-4-wire", 1),
    ]
  ),
  starter(
    "RS3",
    "Electric water heater connection",
    "Equipment Connections",
    "residential",
    [
      p("10-2-nm-b", 40),
      p("30a-2-pole-breaker", 1),
      p("breaker-lock-off", 1),
      p("1-2in-cable-connector", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "RS4",
    "Dishwasher connection",
    "Equipment Connections",
    "residential",
    [
      p("dishwasher-whip", 1, { fixture: true }),
      p("12-2-nm-b", 35),
      p("20a-single-pole-afci-gfci-combo-breaker", 1),
      p("3-8in-cable-connector", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "RS5",
    "Garbage disposal, switched",
    "Equipment Connections",
    "residential",
    [
      p("single-gang-box", 2),
      p("duplex-receptacle", 1),
      p("single-pole-switch", 1),
      p("wall-plate", 2),
      p("garbage-disposal-cord", 1, { fixture: true }),
      p("12-2-nm-b", 35),
      p("12-3-nm-b", 10),
      p("20a-single-pole-afci-gfci-combo-breaker", 1),
      p("wire-nuts", 5),
    ]
  ),
  starter(
    "RS6",
    "Range hood / microwave circuit",
    "Equipment Connections",
    "residential",
    [
      p("range-hood-fan", 1, { fixture: true }),
      p("14-2-nm-b", 20, { branchWhip: true }),
      p("3-8in-cable-connector", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "RS7",
    "Bath exhaust fan wiring",
    "Equipment Connections",
    "residential",
    [
      p("bath-exhaust-fan-80-cfm", 1, { fixture: true }),
      p("4in-insulated-flex-duct", 1),
      p("4in-roof-vent-cap", 1),
      p("duct-clamp", 2),
      p("14-3-nm-b", 20, { branchWhip: true }),
      p("3-8in-cable-connector", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "RS8",
    "Bath fan/light combo, humidity switch",
    "Equipment Connections",
    "residential",
    [
      p("bath-exhaust-fan-light-combo", 1, { fixture: true }),
      p("humidity-sensor-switch", 1),
      p("single-gang-box", 1),
      p("wall-plate", 1),
      p("4in-insulated-flex-duct", 1),
      p("4in-wall-vent-cap", 1),
      p("duct-clamp", 2),
      p("14-3-nm-b", 20, { branchWhip: true }),
      p("wire-nuts", 4),
    ]
  ),
  starter("RS9", "Combination smoke/CO detector", "Devices", "residential", [
    p("shallow-round-box", 1),
    p("hardwired-smoke-co-detector", 1, { fixture: true }),
    p("14-3-nm-b", 20, { branchWhip: true }),
    p("wire-nuts", 4),
  ]),
  starter("RS10", "Doorbell, wired", "Low Voltage/EMS", "residential", [
    p("doorbell-transformer", 1),
    p("doorbell-button", 1),
    p("doorbell-chime-wired", 1),
    p("18-2-control-wire", 50),
  ]),
  starter("RS11", "Video doorbell wiring", "Low Voltage/EMS", "residential", [
    p("video-doorbell", 1, { fixture: true }),
    p("video-doorbell-chime-kit", 1),
    p("doorbell-transformer", 1),
    p("18-2-control-wire", 30),
  ]),
  starter(
    "RS12",
    "EV charger circuit, 48A hardwired",
    "Equipment Connections",
    "residential",
    [
      p("48a-ev-charger", 1, { fixture: true }),
      p("6-3-nm-b", 40),
      p("60a-2-pole-breaker", 1),
      p("1in-cable-connector", 1),
    ]
  ),
  starter(
    "RS13",
    "EV / RV receptacle, 50A (NEMA 14-50)",
    "Equipment Connections",
    "residential",
    [
      p("4-11-16in-square-box", 1),
      p("50a-rv-receptacle", 1),
      p("6-3-nm-b", 40),
      p("50a-2-pole-gfci-breaker", 1),
      p("1in-cable-connector", 1),
    ]
  ),
  starter(
    "RS14",
    "Hot tub / spa connection",
    "Equipment Connections",
    "residential",
    [
      p("60a-gfci-spa-disconnect", 1),
      p("60a-2-pole-breaker", 1),
      p("3-4in-liquidtight-flexible-conduit", 6),
      p("3-4in-liquidtight-flexible-conduit-connector", 2),
      p("no6-thhn", 18),
      p("no10-thhn", 6),
      p("spa-bonding-lug", 1),
      p("no8-bare-cu-solid", 20),
    ]
  ),
  starter(
    "RS15",
    "Pool pump connection",
    "Equipment Connections",
    "residential",
    [
      p("30a-non-fused-disconnect-nema-3r", 1),
      p("20a-2-pole-gfci-breaker", 1),
      p("1-2in-liquidtight-flexible-conduit", 6),
      p("1-2in-liquidtight-flexible-conduit-connector", 2),
      p("no12-thhn", 18),
      p("no8-bare-cu-solid", 20),
      p("spa-bonding-lug", 1),
    ]
  ),
  starter(
    "RS16",
    "Well pump connection",
    "Equipment Connections",
    "residential",
    [
      p("well-pump-control-box", 1),
      p("well-pump-pressure-switch", 1),
      p("30a-2-pole-breaker", 1),
      p("10-2-nm-b", 30),
      p("submersible-pump-splice-kit", 1),
      p("12-2-submersible-pump-cable", 150),
    ]
  ),
  starter("RS17", "Sump pump circuit", "Equipment Connections", "residential", [
    p("single-gang-box", 1),
    p("20a-single-receptacle", 1),
    p("wall-plate", 1),
    p("12-2-nm-b", 35),
    p("20a-single-pole-gfci-breaker", 1),
    p("wire-nuts", 3),
  ]),
  starter("RS18", "Generator inlet and interlock", "Panels", "residential", [
    p("generator-interlock-kit", 1),
    p("30a-power-inlet-box", 1),
    p("30a-2-pole-breaker", 1),
    p("10-3-nm-b", 25),
    p("1-2in-cable-connector", 1),
    p("30a-generator-cord", 1, { fixture: true }),
  ]),
  starter(
    "RS19",
    "Baseboard heater, 240V",
    "Equipment Connections",
    "residential",
    [
      p("baseboard-heater", 1, { fixture: true }),
      p("baseboard-heater-thermostat", 1),
      p("single-gang-box", 1),
      p("12-2-nm-b", 35),
      p("20a-2-pole-breaker", 1),
      p("wire-nuts", 4),
    ]
  ),
  starter(
    "RS20",
    "Attic fan with thermostat",
    "Equipment Connections",
    "residential",
    [
      p("attic-fan", 1, { fixture: true }),
      p("attic-fan-thermostat", 1),
      p("14-2-nm-b", 25),
      p("3-8in-cable-connector", 1),
      p("wire-nuts", 3),
    ]
  ),

  // ── CS — Commercial specials ──
  starter(
    "CS1",
    "Sign circuit and disconnect",
    "Equipment Connections",
    "commercial",
    [
      p("20a-single-pole-breaker", 1),
      p("30a-non-fused-disconnect-nema-3r", 1),
      p("1-2in-liquidtight-flexible-conduit", 6),
      p("1-2in-liquidtight-flexible-conduit-connector", 2),
      p("no12-thhn", 18),
      p("1-2in-emt-raintight-connector", 1),
    ]
  ),
  starter(
    "CS2",
    "Time clock and lighting contactor",
    "Lighting",
    "commercial",
    [
      p("time-clock", 1),
      p("lighting-contactor", 1),
      p("photocell", 1),
      p("no14-thhn", 30),
      p("wire-nuts", 6),
    ]
  ),
  // CS3: the dryer itself is owner-furnished (plan § Gaps)
  starter("CS3", "Hand dryer", "Equipment Connections", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-blank-cover", 1),
    p("12-2-mc-cable", 40),
    p("20a-single-pole-breaker", 1),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("wire-nuts", 3),
  ]),
  starter(
    "CS4",
    "Drinking fountain / EWC",
    "Equipment Connections",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring", 1),
      p("20a-gfci-receptacle", 1),
      p("wall-plate", 1),
      p("12-2-mc-cable", 40),
      p("20a-single-pole-breaker", 1),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "CS5",
    "Reach-in cooler / freezer receptacle",
    "Equipment Connections",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring", 1),
      p("20a-single-receptacle", 1),
      p("wall-plate", 1),
      p("12-2-mc-cable", 40),
      p("20a-single-pole-breaker", 1),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter("CS6", "Twist-lock receptacle, L5-20", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-raised-cover-duplex", 1),
    p("l5-20-receptacle", 1),
    p("12-2-mc-cable", 40),
    p("20a-single-pole-breaker", 1),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
  ]),
  starter("CS7", "Twist-lock receptacle, L6-30", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-raised-cover-duplex", 1),
    p("l6-30-receptacle", 1),
    p("10-2-mc-cable", 40),
    p("30a-2-pole-breaker", 1),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
  ]),
  starter("CS8", "Twist-lock receptacle, L14-30", "Devices", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-raised-cover-duplex", 1),
    p("l14-30-receptacle", 1),
    p("10-3-mc-cable", 40),
    p("30a-2-pole-breaker", 1),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
  ]),
  starter("CS9", "Tele-power pole", "Devices", "commercial", [
    p("tele-power-pole-10-ft", 1),
    p("power-pole-fitting-kit", 1),
    p("12-3-mc-cable", 25, { branchWhip: true }),
    p("3-8in-mc-connector", 2),
    p("mc-anti-short-bushing", 2),
    p("wire-nuts", 4),
  ]),
  starter("CS10", "Modular furniture feed", "Devices", "commercial", [
    p("furniture-feed-connector", 1),
    p("modular-furniture-whip-6-ft", 1),
    p("4in-square-box", 1),
    p("4in-square-blank-cover", 1),
    p("wire-nuts", 4),
  ]),
  starter("CS11", "Fire alarm pull station", "Low Voltage/EMS", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring", 1),
    p("fire-alarm-pull-station", 1),
    p("14-2-fire-alarm-cable", 50),
  ]),
  starter("CS12", "Fire alarm horn/strobe", "Low Voltage/EMS", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-mud-ring-2-gang", 1),
    p("fire-alarm-horn-strobe", 1),
    p("14-2-fire-alarm-cable", 50),
  ]),
  starter(
    "CS13",
    "Fire alarm smoke detector (system)",
    "Low Voltage/EMS",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring-fixture", 1),
      p("detector-base", 1),
      p("14-2-fire-alarm-cable", 50),
      p("system-smoke-detector", 1),
    ]
  ),
  starter("CS14", "Duct smoke detector", "Low Voltage/EMS", "commercial", [
    p("duct-smoke-detector", 1),
    p("detector-relay-module", 1),
    p("14-2-fire-alarm-cable", 50),
    p("18-4-control-wire", 25),
  ]),
  starter(
    "CS15",
    "Kitchen hood shunt interface",
    "Equipment Connections",
    "commercial",
    [
      p("hood-suppression-micro-switch", 1),
      p("equipment-shut-off-relay", 1),
      p("shunt-trip-breaker-2-pole", 1),
      p("18-4-control-wire", 50),
      p("wire-nuts", 4),
    ]
  ),
  starter("CS16", "Knox box", "General", "commercial", [
    p("rapid-entry-key-box", 1),
    p("concrete-wedge-anchor", 4),
  ]),

  // ── PG — Power / gear ──
  starter("PG2", "Service upgrade 200A, overhead", "Panels", "residential", [
    p("200a-meter-base", 1),
    p("200a-main-panel-40-space", 1),
    p("2in-metal-weatherhead", 1),
    p("2in-rigid-conduit", 10),
    p("2in-rigid-conduit-coupling", 1),
    p("2in-conduit-locknut", 2),
    p("2in-conduit-bushing", 1),
    p("no4-0-xhhw-al", 20),
    p("no2-0-xhhw-al", 10),
    p("ground-rod-8-ft", 2),
    p("ground-rod-clamp", 2),
    p("no4-bare-cu-stranded", 30),
    p("water-pipe-bonding-clamp", 1),
    p("intersystem-bonding-bridge", 1),
    p("panel-directory-label", 1),
    p("2in-meter-hub", 1),
    p("2in-mast-roof-flashing", 1),
    p("2in-riser-strap", 2),
  ]),
  starter(
    "PG3",
    "Service upgrade 200A, meter-main outdoor",
    "Panels",
    "residential",
    [
      p("combination-meter-main", 1),
      p("4-0-4-0-4-0-2-0-ser-al", 10),
      p("ground-rod-8-ft", 2),
      p("ground-rod-clamp", 2),
      p("no4-bare-cu-stranded", 30),
      p("water-pipe-bonding-clamp", 1),
      p("intersystem-bonding-bridge", 1),
      p("panel-directory-label", 1),
      p("2in-se-cable-connector", 2),
    ]
  ),
  // PG4: breakers counted with PG7/PG8
  starter("PG4", "Panel replacement like-for-like, 200A", "Panels", "both", [
    p("200a-main-panel-40-space", 1),
    p("no12-thhn", 30),
    p("wire-nuts", 12),
    p("panel-knockout-seal", 4),
    p("panel-directory-label", 1),
  ]),
  starter("PG5", "Subpanel, 100A (resi, 60A feed)", "Panels", "residential", [
    p("100a-main-lug-sub-panel-24-space", 1),
    p("60a-2-pole-breaker", 1),
    p("6-3-nm-b", 30),
    p("ground-bar-kit", 1),
    p("1in-cable-connector", 1),
    p("panel-directory-label", 1),
  ]),
  // PG6: the old can becomes a junction box
  starter("PG6", "Load center relocate", "Panels", "both", [
    p("no12-thhn", 40),
    p("wire-nuts", 20),
    p("6x6-pull-box", 1),
    p("panel-knockout-seal", 4),
  ]),
  starter("PG7", "Breaker add, single-pole", "Panels", "both", [
    p("20a-single-pole-breaker", 1),
  ]),
  starter("PG8", "Breaker add, 2-pole", "Panels", "both", [
    p("30a-2-pole-breaker", 1),
  ]),
  starter("PG9", "Breaker swap to AFCI/GFCI", "Panels", "residential", [
    p("20a-single-pole-afci-gfci-combo-breaker", 1),
  ]),
  starter("PG10", "Whole-house surge protector", "Panels", "residential", [
    p("whole-house-surge-protector", 1),
    p("20a-2-pole-breaker", 1),
    p("1-2in-conduit-locknut", 1),
  ]),
  starter("PG11", "Grounding electrode system", "Panels", "both", [
    p("ground-rod-8-ft", 2),
    p("ground-rod-clamp", 2),
    p("no6-bare-cu-stranded", 30),
    p("water-pipe-bonding-clamp", 1),
    p("intersystem-bonding-bridge", 1),
  ]),
  starter("PG12", "Panelboard 225A 3-phase, main-lug", "Panels", "commercial", [
    p("225a-panelboard-3-phase-main-lug-42-space", 1),
    p("concrete-wedge-anchor", 4),
    p("panel-directory-label", 1),
    p("arc-flash-label", 1),
  ]),
  starter(
    "PG13",
    "Panelboard 225A 3-phase, main breaker",
    "Panels",
    "commercial",
    [
      p("225a-panelboard-3-phase-main-42-space", 1),
      p("concrete-wedge-anchor", 4),
      p("panel-directory-label", 1),
      p("arc-flash-label", 1),
    ]
  ),
  starter(
    "PG14",
    "Panelboard 400A 3-phase, main breaker",
    "Panels",
    "commercial",
    [
      p("400a-panelboard-3-phase-main-42-space", 1),
      p("concrete-wedge-anchor", 6),
      p("panel-directory-label", 1),
      p("arc-flash-label", 1),
    ]
  ),
  starter("PG15", "Feeder breaker, 3-pole", "Panels", "commercial", [
    p("100a-3-pole-breaker", 1),
    p("2-0-4-0-awg-crimp-lug", 4),
  ]),
  starter("PG16", "Dry-type transformer, 45 kVA", "Panels", "commercial", [
    p("45-kva-dry-type-transformer-480v-208y-120v-3-phase", 1),
    p("70a-3-pole-breaker", 1),
    p("1-1-4in-flexible-metal-conduit", 6),
    p("1-1-4in-flexible-metal-conduit-connector", 4),
    p("ground-lug-compression", 2),
    p("no4-bare-cu-stranded", 20),
    p("trapeze-hanger-kit", 1),
    p("1-2in-all-thread-rod-10-ft", 2),
  ]),
  starter("PG17", "Safety switch, 100A fused", "Panels", "both", [
    p("100a-fused-disconnect-nema-1", 1),
    p("100a-cartridge-fuse", 3),
    p("concrete-wedge-anchor", 4),
  ]),
  starter("PG18", "Building surge protective device", "Panels", "commercial", [
    p("surge-protective-device", 1),
    p("30a-3-pole-breaker", 1),
    p("no10-thhn", 12),
    p("3-4in-conduit-locknut", 1),
  ]),
  starter("PG19", "Standby generator hookup", "Panels", "residential", [
    p("automatic-transfer-switch", 1),
    p("generator-pad", 1),
    p("generator-battery-charger", 1),
    p("18-4-control-wire", 30),
    p("ground-rod-8-ft", 1),
    p("ground-rod-clamp", 1),
  ]),
  starter("PG20", "Temporary power pole", "Panels", "both", [
    p("100a-meter-base", 1),
    p("60a-main-panel-8-space", 1),
    p("gfci-receptacle-weather-resistant", 2),
    p("weatherproof-in-use-cover-2-gang", 1),
    p("1-2in-weatherproof-box-double-gang", 1),
    p("ground-rod-8-ft", 1),
    p("ground-rod-clamp", 1),
    p("no6-bare-cu-stranded", 10),
    p("temporary-pole-6x6-post", 1),
  ]),

  // ── MH — Motor / HVAC hookups ──
  starter(
    "MH1",
    "HVAC condenser disconnect + whip",
    "Equipment Connections",
    "both",
    [
      p("60a-non-fused-pullout-disconnect", 1),
      p("ac-condenser-whip", 1),
      p("30a-2-pole-breaker", 1),
      p("10-2-nm-b", 35),
      p("1-2in-cable-connector", 1),
      p("duct-seal", 1),
    ]
  ),
  starter(
    "MH2",
    "Furnace / air handler, 120V",
    "Equipment Connections",
    "residential",
    [
      p("handy-box", 1),
      p("handy-box-cover-single-toggle", 1),
      p("motor-rated-toggle-switch", 1),
      p("14-2-nm-b", 35),
      p("15a-single-pole-breaker", 1),
      p("3-8in-cable-connector", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "MH3",
    "Air handler with electric heat, 60A",
    "Equipment Connections",
    "residential",
    [
      p("60a-non-fused-disconnect-nema-1", 1),
      p("60a-2-pole-breaker", 1),
      p("6-3-nm-b", 35),
      p("1in-cable-connector", 2),
    ]
  ),
  starter(
    "MH4",
    "Mini-split connection",
    "Equipment Connections",
    "residential",
    [
      p("60a-non-fused-pullout-disconnect", 1),
      p("ac-condenser-whip", 1),
      p("20a-2-pole-breaker", 1),
      p("12-2-nm-b", 35),
      p("1-2in-cable-connector", 1),
      p("14-4-mini-split-cable", 25),
    ]
  ),
  starter(
    "MH5",
    "Rooftop unit (RTU) hookup",
    "Equipment Connections",
    "commercial",
    [
      p("60a-non-fused-disconnect-nema-3r", 1),
      p("3-4in-liquidtight-flexible-conduit", 6),
      p("3-4in-liquidtight-flexible-conduit-connector", 2),
      p("no6-thhn", 18),
      p("no10-thhn", 6),
      p("3-4in-emt-raintight-connector", 1),
      p("roof-flashing-boot", 1),
    ]
  ),
  starter(
    "MH6",
    "RTU service receptacle",
    "Equipment Connections",
    "commercial",
    [
      p("1-2in-weatherproof-box-single-gang", 1),
      p("20a-gfci-receptacle-weather-resistant", 1),
      p("weatherproof-in-use-cover", 1),
      p("1-2in-emt-raintight-connector", 1),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "MH7",
    "Walk-in cooler, condensing unit",
    "Equipment Connections",
    "commercial",
    [
      p("30a-non-fused-disconnect-nema-3r", 1),
      p("30a-3-pole-breaker", 1),
      p("3-4in-liquidtight-flexible-conduit", 6),
      p("3-4in-liquidtight-flexible-conduit-connector", 2),
      p("no10-thhn", 24),
    ]
  ),
  starter(
    "MH8",
    "Walk-in cooler, evaporator",
    "Equipment Connections",
    "commercial",
    [
      p("30a-non-fused-disconnect-nema-1", 1),
      p("20a-2-pole-breaker", 1),
      p("1-2in-liquidtight-flexible-conduit", 6),
      p("1-2in-liquidtight-flexible-conduit-connector", 2),
      p("no12-thhn", 18),
      p("cord-grip", 1),
    ]
  ),
  starter(
    "MH9",
    "Exhaust fan, commercial",
    "Equipment Connections",
    "commercial",
    [
      p("handy-box", 1),
      p("handy-box-cover-single-toggle", 1),
      p("motor-rated-toggle-switch", 1),
      p("1-2in-flexible-metal-conduit", 6),
      p("1-2in-flexible-metal-conduit-connector", 2),
      p("no12-thhn", 18),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "MH10",
    "Motor with starter, 3-phase",
    "Equipment Connections",
    "commercial",
    [
      p("motor-starter-size-1", 1),
      p("30a-non-fused-disconnect-nema-1", 1),
      p("30a-3-pole-breaker", 1),
      p("3-4in-liquidtight-flexible-conduit", 6),
      p("3-4in-liquidtight-flexible-conduit-connector", 2),
      p("no10-thhn", 24),
    ]
  ),
  starter("MH11", "Motor on VFD", "Equipment Connections", "commercial", [
    p("variable-frequency-drive", 1),
    p("30a-non-fused-disconnect-nema-1", 1),
    p("30a-3-pole-breaker", 1),
    p("3-4in-liquidtight-flexible-conduit", 6),
    p("3-4in-liquidtight-flexible-conduit-connector", 2),
    p("no10-thhn", 24),
  ]),
  starter("MH12", "Unit heater", "Equipment Connections", "commercial", [
    p("unit-heater", 1, { fixture: true }),
    p("30a-non-fused-disconnect-nema-1", 1),
    p("30a-2-pole-breaker", 1),
    p("1-2in-flexible-metal-conduit", 6),
    p("1-2in-flexible-metal-conduit-connector", 2),
    p("no10-thhn", 18),
    p("beam-clamp", 2),
    p("3-8in-all-thread-rod-10-ft", 1),
  ]),
  starter(
    "MH13",
    "Tankless electric water heater",
    "Equipment Connections",
    "residential",
    [
      p("40a-2-pole-breaker", 2),
      p("8-2-nm-b", 80),
      p("3-4in-cable-connector", 2),
    ]
  ),
  starter(
    "MH14",
    "Thermostat low-voltage wiring",
    "Equipment Connections",
    "both",
    [p("18-5-control-wire", 50), p("low-voltage-mud-ring", 1)]
  ),

  // ── DR — Demo / retrofit ──
  // DR1, DR2, DR16, DR17 are BOTH (owner, 2026-10-07; top-assemblies-draft.md
  // § 3): demoing a device, blanking a box and replacing a receptacle are
  // everyday residential remodel and service work too, not only retail.
  starter("DR1", "Demo fixture, blank the box", "Demo & Retrofit", "both", [
    p("4in-square-blank-cover", 1),
    p("wire-nuts", 3),
  ]),
  starter("DR2", "Demo device, blank plate", "Demo & Retrofit", "both", [
    p("1-gang-blank-plate", 1),
    p("wire-nuts", 3),
  ]),
  starter(
    "DR3",
    "Demo lay-in fixture, make safe above ceiling",
    "Demo & Retrofit",
    "commercial",
    [p("4in-square-blank-cover", 1), p("wire-nuts", 3)]
  ),
  starter(
    "DR4",
    "Demo circuit back to panel",
    "Demo & Retrofit",
    "commercial",
    [p("panel-filler-plate", 1), p("panel-directory-label", 1)]
  ),
  starter(
    "DR5",
    "Relocate lay-in troffer (≤6 ft)",
    "Demo & Retrofit",
    "commercial",
    [
      p("6ft-mc-whip", 1),
      p("t-bar-grid-clip", 4),
      p("independent-support-wire-clip", 2),
      p("wire-nuts", 3),
    ]
  ),
  starter(
    "DR6",
    "Replace troffer like-for-like",
    "Demo & Retrofit",
    "commercial",
    [
      p("2x4-led-troffer", 1, { fixture: true }),
      p("t-bar-grid-clip", 4),
      p("wire-nuts", 3),
    ]
  ),
  starter("DR7", "Troffer LED retrofit kit", "Demo & Retrofit", "commercial", [
    p("led-troffer-retrofit-kit", 1),
    p("wire-nuts", 4),
  ]),
  starter(
    "DR8",
    "4 ft fluorescent to LED, ballast bypass (2-lamp)",
    "Demo & Retrofit",
    "commercial",
    [
      p("4-ft-led-t8-tube-ballast-bypass", 2),
      p("non-shunted-lampholder", 4),
      p("wire-nuts", 4),
    ]
  ),
  starter(
    "DR9",
    "4 ft fluorescent to LED, plug-and-play (2-lamp)",
    "Demo & Retrofit",
    "commercial",
    [p("4-ft-led-t8-tube-ballast-compatible", 2)]
  ),
  starter(
    "DR10",
    "8 ft fluorescent to LED, single-pin (2-lamp)",
    "Demo & Retrofit",
    "commercial",
    [p("8-ft-led-t8-tube-ballast-bypass-single-pin", 2), p("wire-nuts", 4)]
  ),
  starter(
    "DR11",
    "8 ft HO fluorescent to LED (2-lamp)",
    "Demo & Retrofit",
    "commercial",
    [p("8-ft-led-t8-tube-ballast-bypass-ho", 2), p("wire-nuts", 4)]
  ),
  starter("DR12", "HID to LED corn lamp", "Demo & Retrofit", "commercial", [
    p("led-corn-bulb-e39", 1),
    p("wire-nuts", 2),
  ]),
  starter(
    "DR13",
    "Replace HID high bay with LED high bay",
    "Demo & Retrofit",
    "commercial",
    [p("high-bay", 1, { fixture: true }), p("wire-nuts", 3)]
  ),
  starter("DR14", "Replace wall pack", "Demo & Retrofit", "commercial", [
    p("wall-pack-full-cutoff", 1, { fixture: true }),
    p("silicone-sealant", 1),
    p("wire-nuts", 3),
  ]),
  starter(
    "DR15",
    "Replace exit / emergency light",
    "Demo & Retrofit",
    "commercial",
    [p("emergency-exit-light-combo", 1, { fixture: true }), p("wire-nuts", 3)]
  ),
  starter(
    "DR16",
    "Replace receptacle like-for-like",
    "Demo & Retrofit",
    "both",
    [p("20a-duplex-receptacle", 1), p("wall-plate", 1)]
  ),
  starter("DR17", "Replace receptacle with GFCI", "Demo & Retrofit", "both", [
    p("20a-gfci-receptacle", 1),
    p("wall-plate", 1),
  ]),
  starter(
    "DR18",
    "Replace switch with occupancy sensor",
    "Demo & Retrofit",
    "commercial",
    [
      p("dual-tech-occupancy-sensor-switch", 1),
      p("wall-plate", 1),
      p("wire-nuts", 2),
    ]
  ),
  starter(
    "DR19",
    "Relocate receptacle (wall move), MC",
    "Demo & Retrofit",
    "commercial",
    [
      p("4in-square-box", 1),
      p("4in-square-mud-ring", 1),
      p("20a-duplex-receptacle", 1),
      p("wall-plate", 1),
      p("12-2-mc-cable", 15),
      p("3-8in-mc-connector", 2),
      p("mc-anti-short-bushing", 2),
      p("4in-square-blank-cover", 1),
      p("wire-nuts", 6),
    ]
  ),
  starter(
    "DR20",
    "Recessed can LED retrofit (resi)",
    "Demo & Retrofit",
    "residential",
    [p("5in-6in-led-retrofit-trim", 1)]
  ),

  // ── MS — Misc and low voltage ──
  starter("MS1", 'Junction box, 4" square', "General", "both", [
    p("4in-square-box", 1),
    p("4in-square-blank-cover", 1),
    p("grounding-pigtail", 1),
    p("wire-nuts", 4),
  ]),
  starter("MS2", "Junction box above lay-in ceiling", "General", "commercial", [
    p("4in-square-box", 1),
    p("4in-square-blank-cover", 1),
    p("independent-support-wire-clip", 1),
    p("ceiling-support-wire", 1),
    p("grounding-pigtail", 1),
    p("wire-nuts", 4),
  ]),
  starter("MS3", "Pull box, 12x12", "General", "commercial", [
    p("12x12-pull-box", 1),
    p("concrete-wedge-anchor", 4),
  ]),
  // MS4: a tube does about four; the purchase list rounds up to whole, D5
  starter("MS4", "Firestop penetration", "General", "both", [
    p("firestop-caulk", 0.25),
  ]),
  starter(
    "MS5",
    "Conduit trapeze (strut rack), per hanger",
    "General",
    "commercial",
    [
      p("trapeze-hanger-kit", 1),
      p("3-8in-all-thread-rod-10-ft", 1),
      p("beam-clamp", 2),
      p("3-8in-hex-nut", 4),
      p("3-8in-flat-washer", 4),
    ]
  ),
  starter(
    "MS6",
    "Data drop, Cat6 (commercial)",
    "Low Voltage/EMS",
    "commercial",
    [
      p("low-voltage-mud-ring", 1),
      p("cat6-cable", 150),
      p("cat6-jack", 1),
      p("keystone-wall-plate-1-port", 1),
      p("j-hook", 3),
    ]
  ),
  starter("MS7", "Data drop, Cat6 (resi)", "Low Voltage/EMS", "residential", [
    p("low-voltage-mud-ring", 1),
    p("cat6-cable", 75),
    p("cat6-jack", 1),
    p("keystone-wall-plate-1-port", 1),
  ]),
  starter("MS8", "Cable TV drop", "Low Voltage/EMS", "residential", [
    p("low-voltage-mud-ring", 1),
    p("rg6-coax-cable", 75),
    p("coax-f-connector", 2),
    p("coax-wall-plate", 1),
  ]),
  starter("MS9", "Security camera drop", "Low Voltage/EMS", "both", [
    p("security-camera-dome", 1, { fixture: true }),
    p("cat6-cable", 100),
    p("cat6-jack", 1),
    p("cat6-rj45-end", 1),
  ]),
  starter("MS10", "In-ceiling speaker", "Low Voltage/EMS", "residential", [
    p("in-ceiling-speaker", 1, { fixture: true }),
    p("16-2-speaker-wire", 50),
  ]),
  starter(
    "MS11",
    "Network patch panel, 24-port",
    "Low Voltage/EMS",
    "commercial",
    [
      p("cat6-patch-panel", 1),
      p("network-rack-wall-mount", 1),
      p("horizontal-cable-manager", 1),
      p("cat6-patch-cord-3-ft", 24),
    ]
  ),
  starter(
    "MS12",
    "Structured media enclosure (resi)",
    "General",
    "residential",
    [
      p("structured-media-enclosure", 1),
      p("duplex-receptacle", 1),
      p("single-gang-box", 1),
      p("12-2-nm-b", 25),
    ]
  ),
  starter("MS13", "Panel labelling (existing panel)", "General", "both", [
    p("panel-directory-label", 1),
    p("arc-flash-label", 1),
  ]),
  starter("MS14", "Temporary lighting string, per 100 ft", "General", "both", [
    p("temporary-light-string-100-ft", 1),
  ]),
];
