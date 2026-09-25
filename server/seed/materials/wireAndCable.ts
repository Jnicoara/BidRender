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
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

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
    name: isKcmil ? `${size} kcmil XHHW aluminum` : `${size} XHHW aluminum`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      "al alum aluminium xhhw-2 thhn feeder service stranded",
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
    name: `${gauge} bare copper, solid`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
      gaugeAliases(gauge),
      "ground grounding earth bond bonding gec egc green"
    ),
  })),
  ...["#10", "#8", "#6", "#4", "#2", "#1/0", "#2/0"].map(gauge => ({
    name: `${gauge} bare copper, stranded`,
    unitOfSale: "foot" as const,
    costPerUnit: UNPRICED,
    category: "Wire & Cable" as const,
    searchAliases: aliases(
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
 */
const serCopper: BaselineMaterial[] = ["8-3", "6-3", "4-3", "2-3", "1-3"].map(
  size => ({
    name: `${size} SER copper`,
    unitOfSale: "foot",
    costPerUnit: UNPRICED,
    category: "Wire & Cable",
    searchAliases: aliases(
      size.replace("-", "/"),
      SE_SLANG,
      "range dryer subpanel"
    ),
  })
);

const serAluminum: BaselineMaterial[] = [
  { size: "1/0-3", note: undefined },
  { size: "2/0-3", note: undefined },
  { size: "3/0-3", note: "3 conductors with a 1/0 ground." },
  { size: "4/0-3", note: undefined },
  {
    size: "4/0-4/0-2/0",
    note: "The standard single-phase 200A residential service conductor set.",
  },
  { size: "4/0-4/0-4/0-2/0", note: undefined },
  { size: "250-250-250", note: undefined },
].map(({ size, note }) => ({
  name: `${size} SER aluminum`,
  unitOfSale: "foot" as const,
  costPerUnit: UNPRICED,
  category: "Wire & Cable" as const,
  searchAliases: aliases(
    size.replace(/-/g, "/"),
    "al alum aluminium",
    SE_SLANG,
    "mast riser",
    size === "4/0-4/0-2/0" ? "200a service" : ""
  ),
  description: note ? `${note} ${ALUMINUM_NOTE}` : ALUMINUM_NOTE,
}));

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
];
