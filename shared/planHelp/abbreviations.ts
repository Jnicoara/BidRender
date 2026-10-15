/**
 * Plan abbreviations — what the letters on a drawing mean, in plain words
 * (references/plan-reading-help-plan.md § 2).
 *
 * ── DRAFT — NEEDS THE OWNER'S REVIEW BEFORE BETA (§ 9 Q5) ───────────────────
 * Drafted by Track B on 2026-10-12. The owner approved "B drafts, the owner
 * reviews both lists before beta" — so this list does not go in front of a
 * beta user until somebody who bids electrical work for a living has read
 * every line of it. `ABBREVIATIONS_REVIEW` below says where it stands; change
 * it when the review is done, not before.
 *
 * ── Rules for an entry ──────────────────────────────────────────────────────
 * - **Every meaning, with the clue that tells them apart.** `HR` is a home
 *   run on a floor plan and an hour on a fire-rated wall. A guide that picks
 *   one meaning for an ambiguous abbreviation states a wrong thing in a
 *   confident voice.
 * - **`forTheBid` is words, never numbers** (§ 9 Q6): no hours, no prices,
 *   no percentages, no digits at all. A number in a help card is a number
 *   nobody chose, and it would be bid. `server/planHelpAbbreviations.test.ts`
 *   fails on a digit.
 * - **No spelling twice.** Spellings are compared ignoring case, dots,
 *   slashes, dashes, spaces and brackets, so `W/P`, `W.P.` and `WP` are one
 *   spelling — and two entries claiming it would be a guess.
 * - **This set's legend wins.** The lookup shows the set's own legend first;
 *   this list is "usually means", never "means".
 *
 * Keyed by `trade` from day one: plumbing is more entries, not more code.
 */
import type { TradeId } from "../trades";

export const ABBREVIATIONS_REVIEW = {
  status: "draft" as "draft" | "reviewed",
  note: "Draft - needs the owner's review before beta (plan-reading-help-plan.md § 9 Q5).",
};

export type AbbreviationMeaning = {
  meaning: string;
  /** The clue that says this meaning applies, when there is more than one. */
  when?: string;
};

export type Abbreviation = {
  trade: TradeId;
  /** How it is usually printed — the heading of its card. */
  abbr: string;
  /** Every way it is printed, `abbr` included. */
  spellings: string[];
  means: AbbreviationMeaning[];
  /** What it means for the person reading the drawing, in plain words. */
  plain: string;
  /** What it changes on the bid, in words. Never a number. */
  forTheBid?: string;
};

const E = "electrical";

export const ABBREVIATIONS: readonly Abbreviation[] = [
  // ── Heights and where things go ─────────────────────────────────────────
  {
    trade: E,
    abbr: "AFF",
    spellings: ["AFF", "A.F.F."],
    means: [{ meaning: "Above finished floor" }],
    plain:
      "A mounting height, measured up from the finished floor to the device or box.",
    forTheBid:
      "A device set higher than usual means a longer drop from the ceiling; check heights on the general notes.",
  },
  {
    trade: E,
    abbr: "AFG",
    spellings: ["AFG", "A.F.G."],
    means: [{ meaning: "Above finished grade" }],
    plain: "A mounting height outside, measured up from the finished ground.",
  },
  {
    trade: E,
    abbr: "AC",
    spellings: ["AC", "A/C"],
    means: [
      {
        meaning: "Above counter",
        when: "beside a receptacle or switch height",
      },
      {
        meaning: "Air conditioning (an AC unit)",
        when: "on a piece of equipment",
      },
      { meaning: "Armored cable", when: "in a wiring note" },
    ],
    plain: "Three common meanings — the note around it tells you which.",
  },
  {
    trade: E,
    abbr: "ABV",
    spellings: ["ABV"],
    means: [{ meaning: "Above" }],
    plain: "Mounted above something else, often a counter or a door.",
  },
  {
    trade: E,
    abbr: "CLG",
    spellings: ["CLG"],
    means: [{ meaning: "Ceiling" }],
    plain: "Mounted on or in the ceiling.",
  },
  {
    trade: E,
    abbr: "FLR",
    spellings: ["FLR"],
    means: [{ meaning: "Floor" }],
    plain: "Mounted in or on the floor.",
  },
  {
    trade: E,
    abbr: "F",
    spellings: ["F"],
    means: [
      {
        meaning: "Floor mounted",
        when: "a letter beside a receptacle or box symbol",
      },
      {
        meaning: "A fixture type",
        when: "a tag on a light fixture, listed in the fixture schedule",
      },
    ],
    plain:
      "Beside a device it usually means it sits in the floor. On a light it is the fixture's type letter.",
    forTheBid:
      "A floor device needs a floor box and usually a poke-through or under-slab conduit, not a wall box.",
  },
  {
    trade: E,
    abbr: "OC",
    spellings: ["OC", "O.C."],
    means: [
      { meaning: "On center", when: "spacing between things, e.g. supports" },
      { meaning: "Overcurrent", when: "protection, breakers and fuses" },
    ],
    plain: "Usually spacing measured centre to centre.",
  },

  // ── Notes that change a count ───────────────────────────────────────────
  {
    trade: E,
    abbr: "TYP",
    spellings: ["TYP", "TYP."],
    means: [{ meaning: "Typical" }],
    plain:
      "Applies to every one like it on the drawing, not only the one it is printed beside.",
    forTheBid:
      "Count every matching item, not just the one with the note. This is the note that most often changes a count.",
  },
  {
    trade: E,
    abbr: "UON",
    spellings: ["UON", "UNO", "U.O.N.", "U.N.O."],
    means: [{ meaning: "Unless otherwise noted" }],
    plain:
      "The rule applies everywhere, except where a drawing or note says something different.",
    forTheBid: "Look for the exceptions before you count the rule.",
  },
  {
    trade: E,
    abbr: "SIM",
    spellings: ["SIM", "SIM."],
    means: [{ meaning: "Similar" }],
    plain: "Built the same way as the one shown, with small differences.",
  },
  {
    trade: E,
    abbr: "NTS",
    spellings: ["NTS", "N.T.S."],
    means: [{ meaning: "Not to scale" }],
    plain: "Do not measure this drawing — lengths on it are not true.",
    forTheBid:
      "Take lengths from a scaled sheet or the dimensions written on it, never from measuring this one.",
  },
  {
    trade: E,
    abbr: "ALT",
    spellings: ["ALT", "ALT."],
    means: [{ meaning: "Alternate (a bid alternate)" }],
    plain:
      "Work the owner may or may not buy, priced on its own beside the base bid.",
    forTheBid: "Price it separately; do not fold it into the base bid.",
  },
  {
    trade: E,
    abbr: "NIC",
    spellings: ["NIC", "N.I.C."],
    means: [{ meaning: "Not in contract" }],
    plain: "Shown on the drawing but not part of this contract.",
    forTheBid:
      "Leave it out — but read the note for what IS yours, often the box, rough-in or connection.",
  },
  {
    trade: E,
    abbr: "FBO",
    spellings: ["FBO", "F.B.O."],
    means: [{ meaning: "Furnished by others" }],
    plain: "Somebody else supplies it; often you still install or connect it.",
    forTheBid:
      "Leave out the item itself; include the install or connection if the note says so.",
  },
  {
    trade: E,
    abbr: "OFCI",
    spellings: ["OFCI"],
    means: [{ meaning: "Owner furnished, contractor installed" }],
    plain: "The owner buys it, you put it in.",
    forTheBid: "Labor and connection only — no material for the item itself.",
  },
  {
    trade: E,
    abbr: "OFOI",
    spellings: ["OFOI"],
    means: [{ meaning: "Owner furnished, owner installed" }],
    plain: "The owner buys it and puts it in.",
    forTheBid: "Usually nothing of yours, unless a note asks for a connection.",
  },
  {
    trade: E,
    abbr: "CFCI",
    spellings: ["CFCI"],
    means: [{ meaning: "Contractor furnished, contractor installed" }],
    plain: "You buy it and you put it in.",
    forTheBid: "Material and labor.",
  },
  {
    trade: E,
    abbr: "CFOI",
    spellings: ["CFOI"],
    means: [{ meaning: "Contractor furnished, owner installed" }],
    plain: "You buy it; the owner puts it in.",
    forTheBid: "Material only.",
  },
  {
    trade: E,
    abbr: "BO",
    spellings: ["BO", "B.O."],
    means: [{ meaning: "By others" }],
    plain: "Another trade or the owner does it.",
    forTheBid: "Leave it out, unless a note gives you part of it.",
  },
  {
    trade: E,
    abbr: "RI",
    spellings: ["RI", "R.I."],
    means: [{ meaning: "Rough-in" }],
    plain:
      "Boxes, conduit and wire put in before the walls close — devices come later.",
    forTheBid:
      "Rough-in only: no device, no plate, no trim, unless a note adds them.",
  },
  {
    trade: E,
    abbr: "CO",
    spellings: ["CO", "C.O."],
    means: [
      { meaning: "Conduit only", when: "on a power or systems plan" },
      { meaning: "Cleanout", when: "on a plumbing drawing" },
    ],
    plain: "On an electrical sheet: an empty conduit, no wire in it.",
    forTheBid: "Conduit and a pull string; no wire.",
  },
  {
    trade: E,
    abbr: "EC",
    spellings: ["EC", "E.C."],
    means: [
      { meaning: "Electrical contractor", when: 'in a note: "by EC"' },
      { meaning: "Empty conduit", when: "beside a conduit run" },
    ],
    plain: "Usually means you — the electrical contractor.",
  },
  {
    trade: E,
    abbr: "GC",
    spellings: ["GC", "G.C."],
    means: [{ meaning: "General contractor" }],
    plain: "The builder running the job.",
    forTheBid: '"By GC" is not yours.',
  },
  {
    trade: E,
    abbr: "MC",
    spellings: ["MC"],
    means: [
      { meaning: "Metal clad cable", when: "in a wiring note" },
      { meaning: "Mechanical contractor", when: 'in a note: "by MC"' },
    ],
    plain: 'Usually the cable type. "By MC" means the mechanical contractor.',
  },

  // ── Existing, new and demolition ────────────────────────────────────────
  {
    trade: E,
    abbr: "(E)",
    spellings: ["(E)", "EX", "EXIST", "EXIST."],
    means: [{ meaning: "Existing" }],
    plain: "Already there before this job.",
    forTheBid:
      "Nothing new unless a note says to reconnect, relocate or replace it.",
  },
  {
    trade: E,
    abbr: "(N)",
    spellings: ["(N)"],
    means: [{ meaning: "New" }],
    plain: "New work on this job.",
  },
  {
    trade: E,
    abbr: "ETR",
    spellings: ["ETR", "E.T.R."],
    means: [{ meaning: "Existing to remain" }],
    plain: "Already there, and it stays.",
    forTheBid: "Protect it; nothing to buy or remove.",
  },
  {
    trade: E,
    abbr: "(R)",
    spellings: ["(R)"],
    means: [
      { meaning: "Relocated", when: "most sets" },
      { meaning: "Remove", when: "some demolition plans — the legend says" },
    ],
    plain:
      "Either moved to a new spot or taken out. Sets use it both ways — check this set's legend.",
  },
  {
    trade: E,
    abbr: "(X)",
    spellings: ["(X)"],
    means: [{ meaning: "Remove (demolish)", when: "on a demolition plan" }],
    plain: "Take it out.",
    forTheBid:
      "Demolition labor, and make safe whatever fed it back to the panel or the next device.",
  },
  {
    trade: E,
    abbr: "RELOC",
    spellings: ["RELOC", "RELOC."],
    means: [{ meaning: "Relocate" }],
    plain: "Take it down and put it back up in a new spot.",
    forTheBid: "Removal and reinstall labor, plus wire to reach the new spot.",
  },
  {
    trade: E,
    abbr: "DEMO",
    spellings: ["DEMO"],
    means: [{ meaning: "Demolition" }],
    plain: "Removal work.",
  },

  // ── Wiring, circuits and cable ──────────────────────────────────────────
  {
    trade: E,
    abbr: "HR",
    spellings: ["HR", "H.R."],
    means: [
      {
        meaning: "Home run",
        when: "on a floor plan: an arrow with circuit numbers",
      },
      {
        meaning: "Hour",
        when: 'in a schedule or a fire rating (a "1 HR" wall)',
      },
    ],
    plain:
      "On a floor plan, the wire from the last device back to the panel. The arrow points the way to the panel.",
    forTheBid:
      "A home run is a run: wire and conduit to the panel. Trace or measure it, and remember the drop to the panel.",
  },
  {
    trade: E,
    abbr: "CKT",
    spellings: ["CKT"],
    means: [{ meaning: "Circuit" }],
    plain: "One breaker and everything it feeds.",
  },
  {
    trade: E,
    abbr: "FDR",
    spellings: ["FDR"],
    means: [{ meaning: "Feeder" }],
    plain: "The large wire feeding a panel or a piece of equipment.",
  },
  {
    trade: E,
    abbr: "GND",
    spellings: ["GND", "GRD"],
    means: [{ meaning: "Ground" }],
    plain: "The grounding conductor or a grounding connection.",
  },
  {
    trade: E,
    abbr: "IG",
    spellings: ["IG", "I.G."],
    means: [{ meaning: "Isolated ground" }],
    plain:
      "A receptacle (often orange) with its own separate ground wire back to the panel.",
    forTheBid: "An IG device and an extra insulated ground wire in the run.",
  },
  {
    trade: E,
    abbr: "AWG",
    spellings: ["AWG"],
    means: [{ meaning: "American wire gauge" }],
    plain: "Wire size. The bigger the number, the thinner the wire.",
  },
  {
    trade: E,
    abbr: "KCMIL",
    spellings: ["KCMIL", "MCM"],
    means: [{ meaning: "Thousand circular mils" }],
    plain: "Wire size for wire bigger than four-aught. MCM is the older name.",
  },
  {
    trade: E,
    abbr: "THHN",
    spellings: ["THHN", "THWN", "THHN/THWN"],
    means: [{ meaning: "A building wire insulation type" }],
    plain: "Single wires pulled in conduit — the everyday building wire.",
  },
  {
    trade: E,
    abbr: "XHHW",
    spellings: ["XHHW"],
    means: [{ meaning: "A wire insulation type" }],
    plain: "Tougher insulation, common on feeders and aluminum wire.",
  },
  {
    trade: E,
    abbr: "NM",
    spellings: ["NM", "NM-B", "NMB"],
    means: [{ meaning: "Non-metallic sheathed cable (Romex)" }],
    plain: "Plastic-jacketed cable, mostly in houses.",
  },
  {
    trade: E,
    abbr: "SE",
    spellings: ["SE"],
    means: [{ meaning: "Service entrance", when: "SE cable, SER, SEU" }],
    plain: "The wiring that brings power in from the utility.",
  },
  {
    trade: E,
    abbr: "PH",
    spellings: ["PH", "PH.", "Ø"],
    means: [{ meaning: "Phase" }],
    plain: "Single phase or three phase power.",
  },
  {
    trade: E,
    abbr: "SP",
    spellings: ["SP", "S.P."],
    means: [
      { meaning: "Single pole", when: "on a switch or a breaker" },
      { meaning: "Spare", when: "in a panel schedule" },
    ],
    plain:
      "A single-pole switch or breaker. In a panel schedule it can mean a spare breaker.",
  },
  {
    trade: E,
    abbr: "DP",
    spellings: ["DP", "D.P."],
    means: [
      { meaning: "Double pole", when: "on a switch or a breaker" },
      {
        meaning: "Distribution panel",
        when: "as a panel's name on a one-line",
      },
    ],
    plain: "A two-pole breaker or switch, or a distribution panel's name.",
  },
  {
    trade: E,
    abbr: "3W",
    spellings: ["3W", "3-W", "3WAY", "3-WAY"],
    means: [
      { meaning: "Three-way switch", when: "beside a switch symbol" },
      { meaning: "Three-wire", when: "on a circuit or a feeder" },
    ],
    plain: "A switch used in pairs, so a light works from two places.",
  },
  {
    trade: E,
    abbr: "4W",
    spellings: ["4W", "4-W", "4WAY", "4-WAY"],
    means: [
      {
        meaning: "Four-way switch",
        when: "beside a switch symbol, between two three-ways",
      },
      { meaning: "Four-wire", when: "on a circuit or a feeder" },
    ],
    plain: "The switch in the middle when a light works from three places.",
  },
  {
    trade: E,
    abbr: "SPR",
    spellings: ["SPR"],
    means: [{ meaning: "Spare" }],
    plain: "In a panel schedule: a breaker installed but not used.",
    forTheBid: "A spare is a breaker you buy.",
  },
  {
    trade: E,
    abbr: "SPC",
    spellings: ["SPC"],
    means: [{ meaning: "Space" }],
    plain: "In a panel schedule: room for a breaker, none installed.",
    forTheBid: "Nothing to buy for a space.",
  },

  // ── Raceway ─────────────────────────────────────────────────────────────
  {
    trade: E,
    abbr: "C",
    spellings: ["C"],
    means: [{ meaning: "Conduit", when: 'after a size, e.g. 3/4" C' }],
    plain: "A pipe the wires are pulled through.",
  },
  {
    trade: E,
    abbr: "EMT",
    spellings: ["EMT"],
    means: [{ meaning: "Electrical metallic tubing" }],
    plain: "Thin-wall steel conduit, the everyday indoor pipe.",
  },
  {
    trade: E,
    abbr: "RMC",
    spellings: ["RMC", "RGS"],
    means: [{ meaning: "Rigid metal conduit (rigid galvanized steel)" }],
    plain: "Heavy threaded steel pipe.",
  },
  {
    trade: E,
    abbr: "GRC",
    spellings: ["GRC"],
    means: [{ meaning: "Galvanized rigid conduit" }],
    plain: "Heavy threaded steel pipe — same thing as RMC.",
  },
  {
    trade: E,
    abbr: "IMC",
    spellings: ["IMC"],
    means: [{ meaning: "Intermediate metal conduit" }],
    plain: "Threaded steel pipe, lighter than rigid.",
  },
  {
    trade: E,
    abbr: "PVC",
    spellings: ["PVC"],
    means: [{ meaning: "PVC (plastic) conduit" }],
    plain: "Plastic pipe, common underground and in slabs.",
  },
  {
    trade: E,
    abbr: "ENT",
    spellings: ["ENT"],
    means: [{ meaning: "Electrical non-metallic tubing (smurf tube)" }],
    plain: "Flexible plastic tubing, often blue.",
  },
  {
    trade: E,
    abbr: "FMC",
    spellings: ["FMC", "FLEX"],
    means: [{ meaning: "Flexible metal conduit" }],
    plain: "Bendable steel conduit, often the last few feet to a fixture.",
  },
  {
    trade: E,
    abbr: "LFMC",
    spellings: ["LFMC", "LFNC"],
    means: [{ meaning: "Liquidtight flexible conduit (Sealtite)" }],
    plain: "Flexible conduit with a plastic jacket, for wet spots and motors.",
  },
  {
    trade: E,
    abbr: "KO",
    spellings: ["KO", "K.O."],
    means: [{ meaning: "Knockout" }],
    plain: "A punched-out hole in a box or panel for a conduit or cable.",
  },
  {
    trade: E,
    abbr: "JB",
    spellings: ["JB", "J-BOX", "JBOX", "J.B."],
    means: [{ meaning: "Junction box" }],
    plain: "A box where wires are spliced or a connection is made.",
  },
  {
    trade: E,
    abbr: "PB",
    spellings: ["PB", "P.B."],
    means: [
      { meaning: "Pull box", when: "on a conduit run" },
      { meaning: "Push button", when: "beside a control or a door" },
    ],
    plain: "Usually a large box in a long conduit run to make the pull easier.",
  },
  {
    trade: E,
    abbr: "MH",
    spellings: ["MH"],
    means: [
      { meaning: "Manhole", when: "on a site plan" },
      { meaning: "Mounting height", when: "in a schedule or note" },
    ],
    plain: "On a site plan, an underground vault big enough to climb into.",
  },
  {
    trade: E,
    abbr: "HH",
    spellings: ["HH"],
    means: [{ meaning: "Handhole" }],
    plain: "A small underground box with a lid, on a site run.",
  },

  // ── Devices ─────────────────────────────────────────────────────────────
  {
    trade: E,
    abbr: "RECPT",
    spellings: ["RECPT", "RECEPT", "RECEP", "REC"],
    means: [{ meaning: "Receptacle" }],
    plain: "A plug-in outlet — a duplex receptacle unless it says otherwise.",
  },
  {
    trade: E,
    abbr: "GFCI",
    spellings: ["GFCI", "GFI"],
    means: [{ meaning: "Ground-fault circuit interrupter" }],
    plain:
      "Protection that trips when current leaks to ground — required near water and outdoors.",
    forTheBid:
      "Either a GFCI receptacle or a GFCI breaker protecting the circuit. The notes or the specs say which.",
  },
  {
    trade: E,
    abbr: "AFCI",
    spellings: ["AFCI"],
    means: [{ meaning: "Arc-fault circuit interrupter" }],
    plain: "Protection that trips on arcing, mostly on house bedroom circuits.",
    forTheBid: "Usually an AFCI breaker in place of a standard one.",
  },
  {
    trade: E,
    abbr: "WP",
    spellings: ["WP", "W/P", "W.P."],
    means: [{ meaning: "Weatherproof" }],
    plain: "Rated for outdoors or wet spots.",
    forTheBid:
      "Use a weatherproof (in-use) cover and a weather-resistant device. Outdoors it usually needs GFCI too.",
  },
  {
    trade: E,
    abbr: "WR",
    spellings: ["WR", "W.R."],
    means: [{ meaning: "Weather resistant" }],
    plain: "A device made to stand up to damp, required outdoors.",
  },
  {
    trade: E,
    abbr: "XP",
    spellings: ["XP", "EXP", "X-P"],
    means: [{ meaning: "Explosion proof" }],
    plain: "Built for a hazardous location — fuel, dust, fumes.",
    forTheBid:
      "Hazardous-location fittings, seals and devices cost far more than standard ones; price each item from a supplier.",
  },
  {
    trade: E,
    abbr: "SW",
    spellings: ["SW", "S"],
    means: [{ meaning: "Switch" }],
    plain: "A light switch, unless it names another kind.",
  },
  {
    trade: E,
    abbr: "DIM",
    spellings: ["DIM"],
    means: [{ meaning: "Dimmer" }],
    plain: "A switch that dims the light.",
  },
  {
    trade: E,
    abbr: "OS",
    spellings: ["OS", "OCC"],
    means: [{ meaning: "Occupancy sensor" }],
    plain: "Turns the lights on when someone comes in, off when they leave.",
  },
  {
    trade: E,
    abbr: "VS",
    spellings: ["VS", "VAC"],
    means: [{ meaning: "Vacancy sensor" }],
    plain: "Lights are turned on by hand and go off on their own.",
  },
  {
    trade: E,
    abbr: "PC",
    spellings: ["PC", "P.C."],
    means: [{ meaning: "Photocell" }],
    plain: "Turns outdoor lights on at dusk and off at dawn.",
  },
  {
    trade: E,
    abbr: "TC",
    spellings: ["TC", "T.C."],
    means: [
      { meaning: "Time clock", when: "on lighting controls" },
      { meaning: "Telecommunications", when: "on a systems plan" },
    ],
    plain: "Usually a time clock switching lights on a schedule.",
  },
  {
    trade: E,
    abbr: "LC",
    spellings: ["LC"],
    means: [{ meaning: "Lighting contactor" }],
    plain: "A big relay switching many lighting circuits at once.",
  },
  {
    trade: E,
    abbr: "NL",
    spellings: ["NL", "N.L."],
    means: [{ meaning: "Night light" }],
    plain: "A light left on all the time — not on the switch.",
    forTheBid: "Wire it ahead of the switch; it is not on the switch leg.",
  },
  {
    trade: E,
    abbr: "EM",
    spellings: ["EM", "EMER", "EMERG"],
    means: [
      {
        meaning: "Emergency",
        when: "beside a fixture tag: on battery backup or a generator circuit",
      },
      {
        meaning: "Electrical metallic",
        when: "rare, part of a conduit name like EMT",
      },
    ],
    plain:
      "A light that stays on when the power fails — by its own battery or an emergency circuit.",
    forTheBid:
      "A battery pack in the fixture or a separate emergency circuit; the fixture schedule says which.",
  },
  {
    trade: E,
    abbr: "WG",
    spellings: ["WG", "W/G"],
    means: [{ meaning: "Wire guard" }],
    plain: "A wire cage over a fixture or device, common in gyms.",
  },

  // ── Gear and distribution ───────────────────────────────────────────────
  {
    trade: E,
    abbr: "PNL",
    spellings: ["PNL", "PNLBD"],
    means: [{ meaning: "Panel (panelboard)" }],
    plain: "A breaker panel.",
  },
  {
    trade: E,
    abbr: "BKR",
    spellings: ["BKR", "BRKR"],
    means: [{ meaning: "Breaker" }],
    plain: "A circuit breaker.",
  },
  {
    trade: E,
    abbr: "CB",
    spellings: ["CB", "C.B."],
    means: [
      { meaning: "Circuit breaker", when: "on electrical gear" },
      { meaning: "Catch basin", when: "on a site plan" },
    ],
    plain: "Usually a circuit breaker.",
  },
  {
    trade: E,
    abbr: "MCB",
    spellings: ["MCB"],
    means: [{ meaning: "Main circuit breaker" }],
    plain: "The panel has a main breaker that shuts the whole panel off.",
  },
  {
    trade: E,
    abbr: "MLO",
    spellings: ["MLO"],
    means: [{ meaning: "Main lugs only" }],
    plain:
      "The panel has no main breaker — the feeder lands on lugs, and it is protected upstream.",
  },
  {
    trade: E,
    abbr: "MDP",
    spellings: ["MDP"],
    means: [{ meaning: "Main distribution panel" }],
    plain: "The main panel that feeds the other panels.",
  },
  {
    trade: E,
    abbr: "SWBD",
    spellings: ["SWBD", "SWBRD"],
    means: [{ meaning: "Switchboard" }],
    plain: "Large floor-standing gear at the service.",
  },
  {
    trade: E,
    abbr: "MCC",
    spellings: ["MCC"],
    means: [{ meaning: "Motor control center" }],
    plain: "Gear holding the starters for many motors in one place.",
  },
  {
    trade: E,
    abbr: "DISC",
    spellings: ["DISC", "DISC."],
    means: [{ meaning: "Disconnect (safety switch)" }],
    plain: "A switch that cuts power to one piece of equipment.",
    forTheBid:
      "Check whether the equipment comes with one; if not, the disconnect is yours.",
  },
  {
    trade: E,
    abbr: "XFMR",
    spellings: ["XFMR", "XFMER", "XFRM", "XFR"],
    means: [{ meaning: "Transformer" }],
    plain: "Changes the voltage, for example to feed a smaller-voltage panel.",
  },
  {
    trade: E,
    abbr: "ATS",
    spellings: ["ATS"],
    means: [{ meaning: "Automatic transfer switch" }],
    plain:
      "Switches the building to the generator when the power fails, and back.",
  },
  {
    trade: E,
    abbr: "GEN",
    spellings: ["GEN"],
    means: [{ meaning: "Generator" }],
    plain: "Backup power.",
  },
  {
    trade: E,
    abbr: "UPS",
    spellings: ["UPS"],
    means: [{ meaning: "Uninterruptible power supply" }],
    plain: "A battery unit that keeps equipment on through a power blip.",
  },
  {
    trade: E,
    abbr: "SPD",
    spellings: ["SPD", "TVSS"],
    means: [{ meaning: "Surge protective device" }],
    plain: "Protects against power surges. TVSS is the older name.",
  },
  {
    trade: E,
    abbr: "CT",
    spellings: ["CT"],
    means: [{ meaning: "Current transformer" }],
    plain: "Lets a meter read a large service — often in its own CT cabinet.",
  },
  {
    trade: E,
    abbr: "MTR",
    spellings: ["MTR"],
    means: [
      { meaning: "Meter", when: "at the service" },
      { meaning: "Motor", when: "on mechanical equipment" },
    ],
    plain: "Usually the utility meter.",
  },
  {
    trade: E,
    abbr: "VFD",
    spellings: ["VFD"],
    means: [{ meaning: "Variable frequency drive" }],
    plain: "Controls a motor's speed.",
    forTheBid:
      "Check who furnishes the drive; the wiring to and from it is often yours.",
  },
  {
    trade: E,
    abbr: "HOA",
    spellings: ["HOA", "H-O-A"],
    means: [{ meaning: "Hand-off-auto" }],
    plain: "A three-position switch on a motor starter or control.",
  },

  // ── Ratings on equipment ────────────────────────────────────────────────
  {
    trade: E,
    abbr: "MCA",
    spellings: ["MCA"],
    means: [{ meaning: "Minimum circuit ampacity" }],
    plain: "From the equipment's nameplate — sizes the wire to it.",
  },
  {
    trade: E,
    abbr: "MOCP",
    spellings: ["MOCP"],
    means: [{ meaning: "Maximum overcurrent protection" }],
    plain: "From the nameplate — the biggest breaker or fuse allowed for it.",
  },
  {
    trade: E,
    abbr: "FLA",
    spellings: ["FLA"],
    means: [{ meaning: "Full load amps" }],
    plain: "How much current the equipment draws running flat out.",
  },
  {
    trade: E,
    abbr: "KVA",
    spellings: ["KVA"],
    means: [{ meaning: "Kilovolt-amps" }],
    plain: "The size of a transformer or a load.",
  },
  {
    trade: E,
    abbr: "KW",
    spellings: ["KW"],
    means: [{ meaning: "Kilowatts" }],
    plain: "Power — the size of a heater or a generator.",
  },
  {
    trade: E,
    abbr: "HP",
    spellings: ["HP"],
    means: [{ meaning: "Horsepower" }],
    plain: "The size of a motor.",
  },
  {
    trade: E,
    abbr: "AIC",
    spellings: ["AIC", "KAIC"],
    means: [{ meaning: "Amps interrupting capacity" }],
    plain:
      "How big a fault a breaker can safely stop. Higher-rated breakers cost more.",
  },
  {
    trade: E,
    abbr: "NEMA",
    spellings: ["NEMA"],
    means: [{ meaning: "National Electrical Manufacturers Association" }],
    plain:
      "Names enclosure ratings (NEMA 1 indoor, NEMA 3R outdoor) and plug shapes.",
  },
  {
    trade: E,
    abbr: "NEC",
    spellings: ["NEC"],
    means: [{ meaning: "National Electrical Code" }],
    plain: "The code book the work must meet.",
  },

  // ── Equipment you connect ───────────────────────────────────────────────
  {
    trade: E,
    abbr: "AHU",
    spellings: ["AHU"],
    means: [{ meaning: "Air handling unit" }],
    plain: "A large fan unit moving air through the ductwork.",
    forTheBid:
      "Usually a power connection and a disconnect. Check whether the mechanical contractor brings the disconnect.",
  },
  {
    trade: E,
    abbr: "RTU",
    spellings: ["RTU"],
    means: [{ meaning: "Rooftop unit" }],
    plain: "Heating and cooling unit on the roof.",
    forTheBid:
      "A feeder to the roof, a disconnect and usually a service receptacle near it.",
  },
  {
    trade: E,
    abbr: "CU",
    spellings: ["CU"],
    means: [
      { meaning: "Copper", when: "on wire" },
      { meaning: "Condensing unit", when: "on mechanical equipment" },
    ],
    plain: "On wire, copper. On equipment, the outdoor AC unit.",
  },
  {
    trade: E,
    abbr: "EF",
    spellings: ["EF"],
    means: [{ meaning: "Exhaust fan" }],
    plain: "A fan pulling air out.",
  },
  {
    trade: E,
    abbr: "UH",
    spellings: ["UH", "EUH"],
    means: [{ meaning: "Unit heater" }],
    plain: "A hanging heater with a fan; EUH is an electric one.",
  },
  {
    trade: E,
    abbr: "CUH",
    spellings: ["CUH"],
    means: [{ meaning: "Cabinet unit heater" }],
    plain: "A heater in a cabinet, often at an entrance.",
  },
  {
    trade: E,
    abbr: "FCU",
    spellings: ["FCU"],
    means: [{ meaning: "Fan coil unit" }],
    plain: "A small heating or cooling unit with a fan.",
  },
  {
    trade: E,
    abbr: "VAV",
    spellings: ["VAV"],
    means: [{ meaning: "Variable air volume box" }],
    plain: "A box in the ductwork controlling air to one zone.",
  },
  {
    trade: E,
    abbr: "WH",
    spellings: ["WH", "EWH"],
    means: [{ meaning: "Water heater" }],
    plain: "EWH is an electric water heater.",
  },
  {
    trade: E,
    abbr: "EWC",
    spellings: ["EWC"],
    means: [{ meaning: "Electric water cooler" }],
    plain: "A drinking fountain with a chiller.",
    forTheBid: "A receptacle or a connection behind it, often GFCI.",
  },
  {
    trade: E,
    abbr: "DW",
    spellings: ["DW"],
    means: [{ meaning: "Dishwasher" }],
    plain: "A dishwasher connection.",
  },
  {
    trade: E,
    abbr: "REF",
    spellings: ["REF", "REFR", "REFRIG"],
    means: [
      { meaning: "Refrigerator", when: "beside a receptacle or in a kitchen" },
      { meaning: "Reference", when: "beside a sheet or detail number" },
    ],
    plain:
      'In a kitchen, a refrigerator receptacle (often its own circuit). Beside a sheet number, "see that sheet".',
  },
  {
    trade: E,
    abbr: "DISP",
    spellings: ["DISP"],
    means: [{ meaning: "Disposal (garbage disposal)" }],
    plain: "A disposal connection, often switched.",
  },
  {
    trade: E,
    abbr: "EV",
    spellings: ["EV", "EVSE", "EVCS"],
    means: [{ meaning: "Electric vehicle charger" }],
    plain: "A car charger, or the circuit for one.",
    forTheBid:
      "Check whether you supply the charger or only the circuit to it.",
  },
  {
    trade: E,
    abbr: "PV",
    spellings: ["PV"],
    means: [{ meaning: "Photovoltaic (solar)" }],
    plain: "Solar panels and their wiring.",
  },

  // ── Systems and low voltage ─────────────────────────────────────────────
  {
    trade: E,
    abbr: "LV",
    spellings: ["LV", "L.V."],
    means: [{ meaning: "Low voltage" }],
    plain: "Data, phone, security, controls — not line voltage.",
    forTheBid:
      "Often a box and a conduit stub only, with the cabling by others. The notes say which.",
  },
  {
    trade: E,
    abbr: "FA",
    spellings: ["FA", "F.A."],
    means: [{ meaning: "Fire alarm" }],
    plain: "The fire alarm system and its devices.",
  },
  {
    trade: E,
    abbr: "FACP",
    spellings: ["FACP"],
    means: [{ meaning: "Fire alarm control panel" }],
    plain: "The fire alarm system's main panel.",
    forTheBid: "Usually needs a dedicated circuit with a breaker lock.",
  },
  {
    trade: E,
    abbr: "SD",
    spellings: ["SD"],
    means: [{ meaning: "Smoke detector" }],
    plain: "A smoke detector.",
  },
  {
    trade: E,
    abbr: "HD",
    spellings: ["HD"],
    means: [{ meaning: "Heat detector" }],
    plain: "A heat detector.",
  },
  {
    trade: E,
    abbr: "TTB",
    spellings: ["TTB"],
    means: [{ meaning: "Telephone terminal board" }],
    plain: "A plywood backboard where phone and data lines land.",
  },
  {
    trade: E,
    abbr: "TEL",
    spellings: ["TEL", "TELE"],
    means: [{ meaning: "Telephone" }],
    plain: "A phone outlet.",
  },
  {
    trade: E,
    abbr: "COMM",
    spellings: ["COMM"],
    means: [{ meaning: "Communications" }],
    plain: "Data and phone.",
  },
  {
    trade: E,
    abbr: "CATV",
    spellings: ["CATV"],
    means: [{ meaning: "Cable television" }],
    plain: "A TV outlet.",
  },
  {
    trade: E,
    abbr: "CCTV",
    spellings: ["CCTV"],
    means: [{ meaning: "Closed-circuit TV (security cameras)" }],
    plain: "Security camera locations.",
  },

  // ── Sheet words ─────────────────────────────────────────────────────────
  {
    trade: E,
    abbr: "LTG",
    spellings: ["LTG"],
    means: [{ meaning: "Lighting" }],
    plain: "Lighting.",
  },
  {
    trade: E,
    abbr: "PWR",
    spellings: ["PWR"],
    means: [{ meaning: "Power" }],
    plain: "Power.",
  },
  {
    trade: E,
    abbr: "ELEC",
    spellings: ["ELEC", "ELEC."],
    means: [{ meaning: "Electrical" }],
    plain: "Electrical.",
  },
  {
    trade: E,
    abbr: "MECH",
    spellings: ["MECH", "MECH."],
    means: [{ meaning: "Mechanical" }],
    plain: "Mechanical — heating, cooling, ventilation.",
  },
];
