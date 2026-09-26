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
 * ── Aluminum is flagged, deliberately ────────────────────────────────────────
 * Aluminum feeder is priced on a different commodity curve than copper and
 * moves independently of it, sometimes sharply. Every aluminum row says so in
 * its description rather than relying on the name: an estimator pulling a
 * feeder price from a catalog they last touched in spring needs to be told, at
 * the moment they look at it, that this is the number most likely to be stale.
 *
 * ── The metal is written AL / CU in a name ───────────────────────────────────
 * Decided by the owner 2026-09-25: "#4/0 XHHW AL", "#12 bare CU, solid", "8-3
 * SER CU" — the short form a supply house writes. Every row that states its
 * metal does it this way; a row that does not (THHN, NM-B) is copper and says
 * nothing, as it always has. The full words stay findable as aliases (AL_WORDS,
 * CU_WORDS), and the rows were renamed in place through
 * RENAMED_BASELINE_MATERIALS, so every id — and everything pointing at one —
 * is the row it was.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

/** What an estimator types for a metal the name writes as AL / CU. */
const AL_WORDS = "aluminum aluminium alum";
const CU_WORDS = "copper";

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
    `${bare}ga`,
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
    // #14, #12 and #10 keep the plain names the catalog shipped with, so the
    // starter assemblies that reference them by name keep resolving.
    name: `${gauge} THHN`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(gaugeAliases(gauge), BUILDING_WIRE, "solid"),
    ...(gauge === "#10"
      ? { description: "Solid. The stranded version is a separate item." }
      : {}),
  })),
  ...COPPER_STRANDED.map(gauge => ({
    // Only 10 AWG needs the suffix — it is the single size stocked both ways.
    name: gauge === "#10" ? "#10 THHN stranded" : `${gauge} THHN`,
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
    name: `${size} kcmil THHN`,
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
    name: isKcmil ? `${size} kcmil XHHW AL` : `${size} XHHW AL`,
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
 * Jacket colour is how NM-B gets called out on a job — "grab a roll of yellow"
 * — so every size carries its colour as slang. The colours are the NEC-era
 * industry convention: 14 white, 12 yellow, 10 orange, 8 and 6 black.
 */
const NM_COLOURS: Record<string, string> = {
  "14": "white",
  "12": "yellow",
  "10": "orange",
  "8": "black",
  "6": "black",
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
  "6-3",
];

const nmb: BaselineMaterial[] = NM_SIZES.map(size => {
  const gauge = size.split("-")[0];
  return {
    name: `${size} NM-B`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      "romex",
      size.replace("-", "/"),
      "nm nonmetallic sheathed house wire with ground",
      NM_COLOURS[gauge]
    ),
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
 */
const MC_SIZES = [
  "14-2",
  "14-3",
  "12-2",
  "12-3",
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

const mcCable: BaselineMaterial[] = MC_SIZES.map(size => ({
  name: `${size} MC cable`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  // "BX" is the older armoured-cable name people still use for MC.
  searchAliases: aliases(
    size.replace("-", "/"),
    "metal clad armored armoured bx flexible feeder"
  ),
}));

// ─── UF-B and fixture wire ────────────────────────────────────────────────────

const ufb: BaselineMaterial[] = ["14-2", "12-2", "10-2", "8-2"].map(size => ({
  name: `${size} UF-B`,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(
    size.replace("-", "/"),
    "underground feeder direct burial grey gray outdoor wet buried"
  ),
}));

const fixtureWire: BaselineMaterial[] = ["#16", "#18"].map(gauge => ({
  name: `${gauge} fixture wire`,
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
// names a multi-conductor cable — "14-2 …" — with the slash form as an alias.

const cable = (name: string, slang: string): BaselineMaterial => ({
  name,
  unitOfSale: "foot",
  costPerUnit: UNPRICED,
  category: "Wire & Cable",
  searchAliases: aliases(name.match(/^\d+-\d+/)![0].replace("-", "/"), slang),
});

const fireAlarmCable: BaselineMaterial[] = ["14-2", "16-2"].map(size =>
  cable(
    `${size} fire alarm cable`,
    "fplp fplr fpl red plenum riser shielded fa power limited"
  )
);

/**
 * Portable cord by the foot, for equipment whips and temporary power. SOOW and
 * SJOOW differ in jacket rating (600V against 300V), which is why both exist.
 */
const portableCord: BaselineMaterial[] = [
  cable("14-3 SJOOW cord", "sj 300v junior hard service portable flexible"),
  cable("12-3 SOOW cord", "so 600v hard service portable flexible rubber"),
  cable("10-3 SOOW cord", "so 600v hard service portable flexible rubber"),
];

const trayCable: BaselineMaterial[] = [
  cable("12-3 tray cable", "tc tc-er power control cable tray industrial"),
];

// ─── Bare copper ground ───────────────────────────────────────────────────────

const bareCopper: BaselineMaterial[] = [
  ...["#14", "#12", "#10", "#8"].map(gauge => ({
    name: `${gauge} bare CU, solid`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      CU_WORDS,
      gaugeAliases(gauge),
      "ground grounding earth bond bonding gec egc green",
      // #8 solid is what a pool or spa's equipotential bonding grid is run in.
      gauge === "#8" ? "pool spa equipotential wire" : ""
    ),
  })),
  ...["#10", "#8", "#6", "#4", "#2", "#1/0", "#2/0"].map(gauge => ({
    name: `${gauge} bare CU, stranded`,
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
  name: `${size} SER CU`,
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
    name: `${size} SER AL`,
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
  name: `${size} SEU AL`,
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
    name: "#4/0 USE-2 AL",
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
    name: "1/0 URD triplex AL",
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
  ...bareCopper,
  ...serCopper,
  ...serAluminum,
  ...seuAluminum,
  ...undergroundService,
];
