/**
 * Wire & cable.
 *
 * ── Solid and stranded are different materials, not a note on one ────────────
 * THHN is stocked solid up to 10 AWG and stranded from 10 up, which means 10
 * AWG is the one size that exists as both and the only one that needs saying so
 * in its name. Everywhere else the size settles it: there is no solid 4/0 and
 * no stranded 14, so "#4/0 THHN" is unambiguous and a "(stranded)" suffix would
 * be noise on 30 rows to disambiguate one.
 *
 * **Corrected 2026-09-29 (retail catalog plan § R6):** "no stranded 14" was
 * wrong. #14 and #12 THHN are stocked stranded as well — commercial pulls in
 * EMT commonly use it — so 14, 12 and 10 all exist both ways and all three
 * name the stranded row. The plain "#14 THHN" and "#12 THHN" stay the solid
 * rows, under the names the starter assemblies use.
 *
 * ── Aluminum is flagged, deliberately ────────────────────────────────────────
 * Aluminum feeder is priced on a different commodity curve than copper and
 * moves independently of it, sometimes sharply. Every aluminum row says so in
 * its description rather than relying on the name: an estimator pulling a
 * feeder price from a catalog they last touched in spring needs to be told, at
 * the moment they look at it, that this is the number most likely to be stale.
 *
 * ── EVERY wire and cable states its metal, spelled out, at the END ──────────
 * "#12 THHN Copper", "12/2 NM-B Copper", "4/0 XHHW Aluminum" — the owner's
 * naming rule, frozen 2026-10-07 from the materials review sheet
 * (pricing/frozen-names.json). It REPLACES the 2026-09-25 rule that wrote the
 * metal as AL / CU and left copper unsaid ("#12 THHN", "8-3 SER CU"), which is
 * history now and stays in RENAMED_BASELINE_MATERIALS so every older database
 * renames in place. With it:
 *   - a multi-conductor cable is written with a SLASH, "12/2", the way the
 *     trade writes it; the dash form ("12-2") stays a search word on the row;
 *   - a #3 four-wire is "#3/4", so it never reads as 3/4 inch;
 *   - aughts drop the "#" — "1/0", not "#1/0";
 *   - SER spells out the FULL conductor set (owner, 2026-10-07): see below.
 * The size reader understands every one of these (shared/materialSizeOrder.ts,
 * server/sizeReadingNewNames.test.ts). The short words AL / CU stay findable
 * as aliases on every row whose name used to carry them.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

/** What an estimator types for a metal — the word the name spells out, and its shorthand. */
const AL_WORDS = "al aluminium alum";
const CU_WORDS = "cu";

/** "12-2" -> "12/2": the slash form a name is written in. */
const slashed = (size: string) => size.replace("-", "/");

/** "#1/0" -> "1/0": aughts are written without the "#". */
const gaugeLabel = (gauge: string) => gauge.replace(/^#(\d\/0)$/, "$1");

// ─── THHN/THWN copper ─────────────────────────────────────────────────────────

/**
 * THHN and THWN-2 are the same spool.
 *
 * The wire is dual-rated and printed with both, so an estimator who was handed
 * a spec calling for THWN must find the row called THHN. Every copper building
 * wire below carries both.
 */
const BUILDING_WIRE = "thwn thwn-2 building wire pipe wire single conductor";

/** Gauge spellings a "#12 THHN"-style name does not already contain. */
function gaugeAliases(gauge: string): string {
  const bare = gauge.replace(/[#/]/g, "");
  return aliases(
    "awg gauge",
    // "12ga" for a #12, but NOTHING for an aught: stripping "1/0" gave
    // "10ga", so every 1/0, 2/0, 3/0 and 4/0 row answered "10ga" … "40ga"
    // and a search for #10 could surface 1/0 wire (owner's catalog review,
    // 2026-10-08, § 7). Nobody writes an aught in "ga".
    gauge.includes("/0") ? "" : `${bare}ga`,
    // "1/0" is read aloud as "one aught" and typed both ways.
    gauge.includes("/0") ? "aught ought" : ""
  );
}

const COPPER_SOLID = ["#14", "#12", "#10"];

const COPPER_STRANDED = [
  "#10",
  "#8",
  "#6",
  "#4",
  "#3",
  "#2",
  "#1",
  "#1/0",
  "#2/0",
  "#3/0",
  "#4/0",
];

const KCMIL = ["250", "300", "350", "400", "500"];

const copperThhn: BaselineMaterial[] = [
  ...COPPER_SOLID.map(gauge => ({
    // The SOLID rows: #14, #12 and #10 with no "stranded" in the name. Starter
    // assemblies reach them by part key (server/seed/starterParts.ts), which
    // follows the rename map, so the 2026-10-07 rename moved nothing there.
    name: `${gauge} THHN Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(gaugeAliases(gauge), BUILDING_WIRE, "solid"),
    description: "Solid. The stranded version is a separate item.",
  })),
  // The two stranded sizes added 2026-09-29 (§ R6); #10's is below.
  ...["#14", "#12"].map(gauge => ({
    name: `${gauge} THHN stranded Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(gaugeAliases(gauge), BUILDING_WIRE),
    description: "Stranded. The solid version is a separate item.",
  })),
  /*
    The GREEN #12 — the equipment ground pulled in a conduit run. Added in
    the owner's catalog review (2026-10-08) when #12 bare copper was
    withdrawn: it is the ground the shipped "#12 + ground" run types name
    now (baselineRunTypes.ts). Solid, like the #12 those types pull. Only
    the green ships as its own row because it is the one a run type names;
    other colors are bought on the plain row.
  */
  {
    name: "#12 THHN green Copper",
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      gaugeAliases("#12"),
      BUILDING_WIRE,
      "solid ground grounding egc equipment bond"
    ),
    description:
      "Solid, green insulation — the equipment ground in a conduit run.",
    jobKind: "commercial" as const,
  },
  ...COPPER_STRANDED.map(gauge => ({
    // Only 10 AWG needs the suffix — it is the single size stocked both ways.
    name:
      gauge === "#10"
        ? "#10 THHN stranded Copper"
        : `${gaugeLabel(gauge)} THHN Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      gaugeAliases(gauge),
      BUILDING_WIRE,
      gauge === "#10" ? "" : "stranded"
    ),
    ...(gauge === "#10"
      ? { description: "Stranded. The solid version is a separate item." }
      : {}),
  })),
  ...KCMIL.map(size => ({
    name: `${size} kcmil THHN Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    // MCM is the older name for the same unit and is still what most people
    // say and type — "500 MCM", never "500 kcmil".
    searchAliases: aliases(
      "mcm",
      `${size}mcm`,
      BUILDING_WIRE,
      "stranded feeder"
    ),
  })),
];

// ─── Aluminum feeder ──────────────────────────────────────────────────────────

const ALUMINUM_SIZES = [
  "#8",
  "#6",
  "#4",
  // #3 added back by the owner, 2026-10-07 (review sheet).
  "#3",
  "#2",
  "#1",
  "#1/0",
  "#2/0",
  "#3/0",
  "#4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
];

const ALUMINUM_NOTE =
  "Aluminum — priced on its own commodity curve, independent of copper. Re-check before bidding.";

const aluminumFeeder: BaselineMaterial[] = ALUMINUM_SIZES.map(size => {
  const isKcmil = !size.startsWith("#");
  return {
    name: isKcmil
      ? `${size} kcmil XHHW Aluminum`
      : `${gaugeLabel(size)} XHHW Aluminum`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      AL_WORDS,
      "xhhw-2 thhn feeder service stranded",
      isKcmil ? aliases("mcm", `${size}mcm`) : gaugeAliases(size)
    ),
    description: ALUMINUM_NOTE,
  };
});

// ─── NM-B (Romex) ─────────────────────────────────────────────────────────────

/**
 * Jacket color is how NM-B gets called out on a job — "grab a roll of yellow"
 * — so every size carries its color as slang. The colors are the NEC-era
 * industry convention: 14 white, 12 yellow, 10 orange, 8 and 6 black.
 */
const NM_COLOURS: Record<string, string> = {
  "14": "white",
  "12": "yellow",
  "10": "orange",
  "8": "black",
  "6": "black",
  "4": "black",
};

const NM_SIZES = [
  "14-2",
  "12-2",
  "10-2",
  "14-3",
  "12-3",
  "10-3",
  "8-2",
  "8-3",
  // 6/2 added in the owner's catalog review, 2026-10-08.
  "6-2",
  "6-3",
  // 4/3 added from the coverage check, 2026-10-09 (owner-approved): a 60A
  // EV or sub-panel feed in a house.
  "4-3",
];

const nmb: BaselineMaterial[] = NM_SIZES.map(size => {
  const gauge = size.split("-")[0];
  return {
    name: `${slashed(size)} NM-B Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      "romex",
      // The dash spelling the row was named in until 2026-10-07, and what
      // plenty of people still type.
      size,
      "nm nonmetallic sheathed house wire with ground",
      NM_COLOURS[gauge]
    ),
    ...(size === "6-2" || size === "4-3"
      ? { jobKind: "residential" as const }
      : {}),
  };
});

// ─── MC cable ─────────────────────────────────────────────────────────────────

/**
 * The sizes MC is actually manufactured in, which is not every combination.
 *
 * Steel-armoured MC runs 14 AWG through 2 AWG in the counts below; note 3 AWG
 * exists only as 3- and 4-conductor, and 2 AWG only as 2- and 3-conductor —
 * the gaps are real, not omissions, and inventing "3/2 MC" would put a part
 * number in the catalog that no supply house can fill.
 *
 * **This list claimed to be complete and was not, until 2026-09-29:** it had
 * no 14-4 or 12-4, and 12-4 is one of the most common MC cables sold — a
 * 208Y/120V building runs three-phase multiwire branch circuits (three hots,
 * one shared neutral) in it. An estimator reached for 12-3 and bought one
 * conductor in four too few (retail catalog plan § R2).
 */
const MC_SIZES = [
  "14-2",
  "14-3",
  "14-4",
  "12-2",
  "12-3",
  "12-4",
  "10-2",
  "10-3",
  "10-4",
  "8-2",
  "8-3",
  "8-4",
  "6-2",
  "6-3",
  "6-4",
  "4-2",
  "4-3",
  "3-3",
  "3-4",
  "2-2",
  "2-3",
];

/** For the Notes column and the Materials screen — the two added in § R2. */
const MC_DESCRIPTIONS: Record<string, string> = {
  "14-4":
    "Four conductors and a ground: three phases and a shared neutral, or two circuits.",
  "12-4":
    "Four conductors and a ground: three phases and a shared neutral, or two circuits.",
};

const mcCable: BaselineMaterial[] = [
  ...MC_SIZES.map(
    (size): BaselineMaterial => ({
      // A #3 says its conductor count in words — "#3 4-conductor", never
      // "#3/4" or "3/3", which read as fractions (owner's catalog review,
      // 2026-10-08; "#3/4" itself replaced "3-4" on Q2d, 2026-10-07).
      name: size.startsWith("3-")
        ? `#3 ${size.slice(2)}-conductor MC cable Copper`
        : `${slashed(size)} MC cable Copper`,
      unitOfSale: "foot",
      costPerUnit: UNPRICED,
      category: "Wire & Cable",
      // "BX" is the older armoured-cable name people still use for MC. The
      // dash spelling is the old name's; there is no "3/4" alias on the
      // #3/4 row, which would answer a 3/4" conduit search.
      searchAliases: aliases(
        size,
        // The #3 rows keep their 2026-10-07 spelling as a search word, so
        // the old name still finds them — no more exposed to a 3/4" conduit
        // search than that name itself was.
        size === "3-4" ? "#3/4" : size === "3-3" ? "3/3" : "",
        "metal clad armored armoured bx flexible feeder"
      ),
      ...(MC_DESCRIPTIONS[size] ? { description: MC_DESCRIPTIONS[size] } : {}),
    })
  ),
  /*
    What feeds a cash wrap's isolated-ground receptacles (§ R2): two
    conductors, an insulated green ground for the IG terminal, and the
    armour's bond. Priced by the foot like any cable; its grounds are inside
    the jacket, so nothing counts them apart.
  */
  {
    name: "12/2 MC cable isolated ground Copper",
    unitOfSale: "foot",
    costPerUnit: UNPRICED,
    category: "Wire & Cable",
    searchAliases: aliases(
      "12-2 ig orange computer register cash wrap dedicated insulated green metal clad armored armoured bx"
    ),
    description:
      "Two conductors, an insulated ground for the IG receptacle, and the bond.",
  },
  /*
    Healthcare-facility armored cable (coverage check, 2026-10-09,
    owner-approved): what feeds an exam or operatory receptacle, where the
    armour must be a listed ground path. "MC cable" in the name on purpose,
    so `mcFittingNames` buys MC connectors and straps for it, as for the IG
    cable above. Specialty (specialty.ts).
  */
  {
    name: "12/2 MC cable healthcare (HCF) Copper",
    unitOfSale: "foot",
    costPerUnit: UNPRICED,
    category: "Wire & Cable",
    searchAliases: aliases(
      "12-2 hcf mc-hcf ac-hcf hospital medical dental exam patient care green insulated ground metal clad armored armoured bx"
    ),
    description:
      "Two conductors, an insulated ground, and armour listed as a ground path.",
    jobKind: "commercial",
  },
];

// ─── UF-B and fixture wire ────────────────────────────────────────────────────

// 12/3 and 10/3 added in the owner's catalog review, 2026-10-08.
const ufb: BaselineMaterial[] = [
  "14-2",
  "12-2",
  "10-2",
  "8-2",
  "12-3",
  "10-3",
].map(size => ({
  name: `${slashed(size)} UF-B Copper`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(
    size,
    "underground feeder direct burial grey gray outdoor wet buried"
  ),
  ...(size.endsWith("-3") ? { jobKind: "residential" as const } : {}),
}));

const fixtureWire: BaselineMaterial[] = ["#16", "#18"].map(gauge => ({
  name: `${gauge} fixture wire Copper`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(
    gaugeAliases(gauge),
    "tffn tfn luminaire pigtail lead"
  ),
}));

// ─── Fire alarm cable, portable cord and tray cable ───────────────────────────
// Moved from the pricing sheet, 2026-09-25. Named the way the rest of this file
// names a multi-conductor cable — "14/2 … Copper" — with the dash form as an
// alias.
//
// The size is its OWN argument. It used to be read back out of the name with
// `name.match(/^\d+-\d+/)!`, which throws on a slash name while this module
// loads — taking the whole catalog, and the server boot, down with it
// (audit 2026-10-07).

const cable = (
  size: string,
  kind: string,
  slang: string
): BaselineMaterial => ({
  name: `${slashed(size)} ${kind} Copper`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(size, slang),
});

const fireAlarmCable: BaselineMaterial[] = ["14-2", "16-2"].map(size =>
  cable(
    size,
    "fire alarm cable",
    "fplp fplr fpl red plenum riser shielded fa power limited"
  )
);

/**
 * Portable cord by the foot, for equipment whips and temporary power. SOOW and
 * SJOOW differ in jacket rating (600V against 300V), which is why both exist.
 */
const portableCord: BaselineMaterial[] = [
  cable("14-3", "SJOOW cord", "sj 300v junior hard service portable flexible"),
  cable("12-3", "SOOW cord", "so 600v hard service portable flexible rubber"),
  cable("10-3", "SOOW cord", "so 600v hard service portable flexible rubber"),
];

const trayCable: BaselineMaterial[] = [
  cable("12-3", "tray cable", "tc tc-er power control cable tray industrial"),
];

/*
  Two cables the starter assemblies needed and the catalog lacked (plan
  § Gaps, 2026-09-29). Neither is MC, so `mcFittingNames` must not read
  either one as MC and buy MC connectors for it; its pattern needs
  "MC cable" in the name, which these do not have.
*/
/*
  Three cables from the review sheet's typical-job pass (owner-approved,
  2026-10-07, "… Copper" at the owner's word). The two MC ones take MC
  connectors and straps (`mcFittingNames` reads "MC cable" and "MC-AP
  cable"); the fire-alarm one is not MC.
*/
const typicalJobCable: BaselineMaterial[] = [
  {
    ...cable(
      "12-2",
      // "pair (0-10V)" in the name since the owner's catalog review,
      // 2026-10-08: the 16/2 is the dimming pair, not a second cable.
      "MC cable with 16/2 dimming pair (0-10V)",
      "0-10v 0-10 dimming pair lighting retrofit mc lumi metal clad armored bx"
    ),
    description:
      "Two conductors and a ground, plus a 16/2 pair for 0-10V dimming.",
  },
  {
    ...cable(
      "12-2",
      "MC-AP cable",
      "mcap aluminum armor bonding wire metal clad armored bx tenant improvement"
    ),
    description:
      "Aluminum armor with a bonding wire in place of a green ground.",
  },
  {
    ...cable(
      "18-2",
      "shielded fire alarm cable, FPLP",
      "fplp plenum shielded fa power limited red 18/2"
    ),
  },
];

const equipmentCable: BaselineMaterial[] = [
  {
    ...cable(
      "12-2",
      "submersible pump cable",
      "well drop flat jacketed direct burial 600v ground"
    ),
    description: "Well-pump drop cable: two conductors and a ground.",
  },
  {
    ...cable(
      "14-4",
      "mini-split cable",
      "minisplit ductless split system interconnect communication stranded heat pump"
    ),
    description: "Between a mini-split's outdoor and indoor units. Not MC.",
  },
];

// ─── Bare copper ground ───────────────────────────────────────────────────────

/*
  #14, #12 and #10 bare (solid, and #10 stranded) were withdrawn in the
  owner's catalog review, 2026-10-08 — retired, not deleted
  (shared/catalogReview20261008.ts) — and #6 solid was added.
*/
const bareCopper: BaselineMaterial[] = [
  ...["#8", "#6"].map(gauge => ({
    name: `${gauge} bare solid Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      CU_WORDS,
      gaugeAliases(gauge),
      "ground grounding earth bond bonding gec egc green",
      // #8 solid is what a pool or spa's equipotential bonding grid is run in.
      gauge === "#8" ? "pool spa equipotential wire" : "",
      // #6 solid is the electrode conductor to a ground rod.
      gauge === "#6" ? "gec rod electrode" : ""
    ),
    ...(gauge === "#6" ? { jobKind: "both" as const } : {}),
  })),
  ...["#8", "#6", "#4", "#2", "#1/0", "#2/0"].map(gauge => ({
    name: `${gaugeLabel(gauge)} bare stranded Copper`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      CU_WORDS,
      gaugeAliases(gauge),
      "ground grounding earth bond bonding gec egc green"
    ),
  })),
];

// ─── SER / SEU service entrance ───────────────────────────────────────────────

const SE_SLANG = "service entrance seu se cable feeder";

/**
 * Copper SE is stocked at the smaller sizes only.
 *
 * Above 1 AWG the product sold and stocked is aluminum, near-universally — a
 * copper 4/0 SER is a special order, not a catalog item, so it is deliberately
 * absent rather than listed and un-buyable.
 *
 * ── Every SER row is named by its FULL conductor set ─────────────────────────
 * Three insulated conductors, then the ground: "4-4-4-6", not "4-3". Owner's
 * decision, 2026-09-25. The "-3" shorthand hides the one number that differs
 * between otherwise identical-looking cables — the ground — and it is how the
 * catalog once shipped "4/0-3" beside "4/0-4/0-4/0-2/0" as two rows for one
 * cable. The shorthand stays an alias, in both spellings, so "6-3" and "6/3"
 * still find the row.
 *
 * **Re-confirmed by the owner 2026-10-07**, when the review sheet had proposed
 * the "/3" short form back ("8/3 SER Copper"): SER names spell out the full
 * set, now with the metal spelled out too — "4/0-4/0-4/0-2/0 SER Aluminum".
 *
 * The sets are the manufacturers', not derived: Southwire SPEC 10040 (copper
 * 6-6-6-6, 4-4-4-6, 2-2-2-4, 1-1-1-3) and its aluminum SER product pages
 * (1/0-1/0-1/0-2, 2/0-2/0-2/0-1, 3/0-3/0-3/0-1/0); Southwire makes no #8
 * copper SER, and 8-8-8-8 is the set other makers sell (checked 2026-09-25).
 * A ground size is not arithmetic — look it up before adding a size.
 */
const shorthandAliases = (shorthand?: string) =>
  shorthand ? `${shorthand} ${shorthand.replace(/-/g, "/")}` : "";

const serCopper: BaselineMaterial[] = [
  { size: "8-8-8-8", shorthand: "8-3" },
  { size: "6-6-6-6", shorthand: "6-3" },
  { size: "4-4-4-6", shorthand: "4-3" },
  { size: "2-2-2-4", shorthand: "2-3" },
  { size: "1-1-1-3", shorthand: "1-3" },
].map(({ size, shorthand }) => ({
  name: `${size} SER Copper`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(
    CU_WORDS,
    size.replace(/-/g, "/"),
    shorthandAliases(shorthand),
    SE_SLANG,
    "range dryer subpanel"
  ),
}));

const serAluminum: BaselineMaterial[] = [
  // Three insulated conductors and the reduced ground; see serCopper above.
  // The 60A and 100A subpanel feeders came from the pricing sheet already
  // written out, and have no shorthand in the catalog's history.
  { size: "4-4-4-6", note: undefined },
  { size: "2-2-2-4", note: undefined },
  { size: "1/0-1/0-1/0-2", shorthand: "1/0-3", note: undefined },
  { size: "2/0-2/0-2/0-1", shorthand: "2/0-3", note: undefined },
  { size: "3/0-3/0-3/0-1/0", shorthand: "3/0-3", note: undefined },
  /*
    Two 4/0 rows, and they are DIFFERENT cables — the thing to check before
    anyone merges them:
      4/0-4/0-2/0      THREE conductors: two hots and a reduced neutral. The
                       200A single-phase service entrance run to a meter.
      4/0-4/0-4/0-2/0  FOUR: three insulated conductors and a 2/0 ground. The
                       feeder to a 200A subpanel, where neutral and ground are
                       kept apart.
    There used to be a third, "4/0-3 SER aluminum", which was the four-wire
    one again in shorthand ("-3" = three insulated plus a ground). It was
    retired on 2026-09-25 (index.ts), and "4/0-3" is an alias on the full-set
    row so the shorthand still finds it.

    No "3 wire" / "4 wire" aliases on either: "4/0-3" is shorthand for the
    FOUR-wire cable, and a "3" alias on the three-wire one made it answer
    "4/0-3" first — the exact confusion this pair invites.
  */
  {
    size: "4/0-4/0-2/0",
    note: "Three conductors — the standard single-phase 200A residential service conductor set.",
  },
  {
    size: "4/0-4/0-4/0-2/0",
    shorthand: "4/0-3",
    note: "Four conductors — three insulated and a 2/0 ground; the 200A subpanel feeder.",
  },
  // Three conductors, no separate ground: a set, not shorthand.
  { size: "250-250-250", note: undefined },
].map(
  ({
    size,
    shorthand,
    note,
  }: {
    size: string;
    shorthand?: string;
    note?: string;
  }) => ({
    name: `${size} SER Aluminum`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      size.replace(/-/g, "/"),
      shorthandAliases(shorthand),
      AL_WORDS,
      SE_SLANG,
      "mast riser",
      size === "4/0-4/0-2/0" ? "200a service" : "",
      size === "4/0-4/0-4/0-2/0" ? "subpanel" : ""
    ),
    description: note ? `${note} ${ALUMINUM_NOTE}` : ALUMINUM_NOTE,
  })
);

/**
 * SEU: two insulated conductors inside a concentric bare neutral, flat. The
 * overhead-to-meter and range/dryer cable where no separate ground is needed.
 * Added from the pricing sheet, 2026-09-25, aluminum as it is stocked.
 */
const seuAluminum: BaselineMaterial[] = ["4-4-6", "2-2-4"].map(size => ({
  name: `${size} SEU Aluminum`,
  unitOfSale: "foot" as const,
  costPerUnit: UNPRICED,
  category: "Wire & Cable" as const,
  searchAliases: aliases(
    size.replace(/-/g, "/"),
    AL_WORDS,
    "service entrance se cable flat concentric"
  ),
  description: ALUMINUM_NOTE,
}));

/**
 * Direct-burial service conductors, metal stated in the name because both are
 * sold in copper and aluminum. The sheet named neither metal; these are the
 * aluminum ones, which is what a residential underground lateral is pulled
 * in — the same call the sheet's XHHW rows got (pricing/movedFromSheet.ts).
 */
const undergroundService: BaselineMaterial[] = [
  {
    name: "4/0 USE-2 Aluminum",
    unitOfSale: "foot",
    costPerUnit: UNPRICED,
    category: "Wire & Cable",
    searchAliases: aliases(
      gaugeAliases("#4/0"),
      AL_WORDS,
      "use rhh rhw-2 underground direct burial service lateral single conductor"
    ),
    description: ALUMINUM_NOTE,
  },
  {
    name: "1/0 URD triplex Aluminum",
    unitOfSale: "foot",
    costPerUnit: UNPRICED,
    category: "Wire & Cable",
    searchAliases: aliases(
      gaugeAliases("#1/0"),
      AL_WORDS,
      "underground residential distribution direct burial service lateral"
    ),
    description: ALUMINUM_NOTE,
  },
];

export const WIRE_AND_CABLE: BaselineMaterial[] = [
  ...copperThhn,
  ...aluminumFeeder,
  ...nmb,
  ...mcCable,
  ...ufb,
  ...fixtureWire,
  ...fireAlarmCable,
  ...portableCord,
  ...trayCable,
  ...equipmentCable,
  ...typicalJobCable,
  ...bareCopper,
  ...serCopper,
  ...serAluminum,
  ...seuAluminum,
  ...undergroundService,
];
