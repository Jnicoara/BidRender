/**
 * Connectors, terminations and the consumables that go in every van.
 *
 * ── Wire nuts keep their generic name ────────────────────────────────────────
 * "Wire nuts" is what the shipped catalog calls them and what several starter
 * assemblies reference, so it stays — and it means the orange/medium size,
 * which is the one that goes on most splices. The small and large sizes say so
 * in their names and all three carry the colour, because nobody at a counter
 * asks for a "medium wire nut": they ask for a red one.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const part = (category: "Connectors & Terminations" | "Consumables") => ({
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category,
});

const CONN = part("Connectors & Terminations");

const wireNuts: BaselineMaterial[] = [
  {
    ...CONN,
    name: "Wire nuts",
    searchAliases: aliases(
      "nut connector marrette marette twist on twister splice cap winged orange medium"
    ),
    description: "Medium/orange — the general-purpose size.",
    defaultQty: 3,
  },
  {
    ...CONN,
    name: "Wire nuts, small",
    searchAliases: aliases(
      "nut connector marrette marette twist on splice cap red yellow low voltage"
    ),
    description: "Red/yellow, for small conductor counts.",
    defaultQty: 3,
  },
  {
    ...CONN,
    name: "Wire nuts, large",
    searchAliases: aliases(
      "nut connector marrette marette twist on splice cap grey gray blue big"
    ),
    description: "Gray/blue, for large conductor counts.",
    defaultQty: 3,
  },
];

/**
 * Cable connectors are sized by the OUTSIDE DIAMETER of the jacket, not by the
 * conductor gauge inside it — one 3/8" connector takes 14/2 and 12/2 NM alike.
 * This is why there are four of these and not one per cable size: pairing them
 * 1:1 with conductor gauges would invent forty rows for four real parts.
 */
const cableConnectors: BaselineMaterial[] = ['3/8"', '1/2"', '3/4"', '1"'].map(
  size => ({
    ...CONN,
    name: `${size} cable connector`,
    // No "mc" since 2026-09-29: MC has connectors of its own below, and this
    // row answering "mc connector" first sent MC runs to the NM clamp.
    searchAliases: aliases(
      size.replace('"', ""),
      "romex nm ser se clamp box fitting snap in duplex saddle two screw"
    ),
    description: "Sized by cable outside diameter, not by conductor gauge.",
    defaultQty: 2,
  })
);

/**
 * MC cable connectors, by knockout size (retail catalog plan § R1,
 * 2026-09-29).
 *
 * What the counter sells as "MC connectors" (snap-in, squeeze, set-screw) and
 * prices apart from the NM clamp above. Sized by the cable's outside diameter
 * like any cable connector; which cable takes which is `mcFittingNames`
 * (shared/runFittingMaterials.ts), and each description says the same.
 * An MC run counts one at each end, so these are what its type buys.
 */
const MC_CONNECTORS: Array<{ size: string; fits: string }> = [
  { size: '3/8"', fits: "14 and 12 AWG cable, and 10-2 and 10-3" },
  { size: '1/2"', fits: "10-4 and 8 AWG cable" },
  { size: '3/4"', fits: "6 and 4 AWG cable" },
  { size: '1"', fits: "3 and 2 AWG cable" },
];

const mcConnectors: BaselineMaterial[] = MC_CONNECTORS.map(
  ({ size, fits }) => ({
    ...CONN,
    name: `${size} MC connector`,
    searchAliases: aliases(
      size.replace('"', ""),
      "bx armored armoured metal clad ac snap in squeeze tite bite fitting"
    ),
    description: `Fits ${fits}. Sized by cable outside diameter.`,
    defaultQty: 2,
  })
);

/**
 * Lugs are sold by the RANGE of conductor they accept, not per gauge.
 *
 * One barrel takes 14 through 10 AWG; the counter sells it as a 14-10 lug and
 * that is what the box says. Listing a lug per gauge invented rows nobody can
 * order and, worse, implied a precision that does not exist — an estimator
 * hunting for a "#3 lug" would find nothing while the part they need sits
 * under 4-2. Six ranges cover a device pigtail up to a 350 kcmil feeder.
 *
 * Above that, a compression lug is sold per conductor size, so the 400 and
 * 500 kcmil rows are single sizes with their own description (2026-09-26).
 */
const LUG_RANGES: Array<{
  range: string;
  /** After a comma in the name — only where the plain name is unusable. */
  qualifier?: string;
  slang: string;
  /** Only where the shared "sized by range" description would be untrue. */
  description?: string;
}> = [
  { range: "14-10 AWG", slang: "14 12 10 small device" },
  { range: "8-6 AWG", slang: "8 6 feeder" },
  { range: "4-2 AWG", slang: "4 3 2 feeder" },
  { range: "1-1/0 AWG", slang: "1 1/0 aught ought service" },
  { range: "2/0-4/0 AWG", slang: "2/0 3/0 4/0 aught ought service large" },
  /*
    Added 2026-09-25, when the pricing sheet's 350 kcmil lugs needed a range
    to fold into and there was none: the per-size 250/350/500 kcmil lugs were
    retired when lugs moved to ranges (index.ts), and nothing covered kcmil
    after them. 400 and 500 kcmil were added as single sizes on 2026-09-26,
    below.
  */
  {
    range: "250-350 kcmil",
    slang: "250 300 350 mcm kcmil feeder service large",
  },
  /*
    Added 2026-09-26 for the 400 kcmil THHN and XHHW AL the catalog ships.
    Above 350 kcmil a compression lug is sold for ONE conductor size, not a
    span: checked that day, Crescent Electric lists a 1-hole copper 400 kcmil
    compression lug, Platt an Ilsco CLWS-400-38, and Graybar Burndy's YA32
    series at 400. So this row is a single size, and says so — no supplier
    found sells a "350-500" lug, and inventing one is the fault the ranges
    above were introduced to remove.

    Renamed the same day from "400 kcmil crimp lug" to carry ", single size"
    like the 500 below (owner). Through RENAMED_BASELINE_MATERIALS, so the
    row keeps its id and the old name still finds it.
  */
  {
    range: "400 kcmil",
    qualifier: "single size",
    slang: "400 mcm kcmil feeder service large",
    description:
      "Sized for one conductor, 400 kcmil — sold per size, not by range.",
  },
  /*
    Added 2026-09-26 for the 500 kcmil THHN and XHHW AL: a common part —
    Graybar and Lowe's both stock Burndy's YA34 series at 500 kcmil.

    NAMED WITH A QUALIFIER ON PURPOSE. The pattern above would make it
    "500 kcmil crimp lug", which is in RETIRED_BASELINE_MATERIALS, and the
    seeder at the time never re-activated a retired row: a database that
    still held that row would have kept it hidden and inserted nothing, while
    this file claimed to ship it. A new name inserts a new row everywhere.
    Owner, 2026-09-26: a new name, same pattern, one size. The seeder was
    fixed later that day (reactivateBaselineMaterials, server/db.ts); the
    name stays, because it is the clearer one and a rename is churn.
  */
  {
    range: "500 kcmil",
    qualifier: "single size",
    slang: "500 mcm kcmil feeder service large",
    description:
      "Sized for one conductor, 500 kcmil — sold per size, not by range.",
  },
];

const lugs: BaselineMaterial[] = LUG_RANGES.map(
  ({ range, qualifier, slang, description }) => ({
    ...CONN,
    name: `${range} crimp lug${qualifier ? `, ${qualifier}` : ""}`,
    searchAliases: aliases(
      slang,
      "gauge compression terminal ring one hole two hole copper barrel mechanical"
    ),
    description:
      description ??
      "Sized by the conductor range it accepts, not by a single gauge.",
    defaultQty: 2,
  })
);

const terminations: BaselineMaterial[] = [
  {
    ...CONN,
    name: "Push-in wire connector",
    searchAliases: aliases("stab quick splice inline 2 port 3 port wago style"),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Lever wire connector, 2-port",
    searchAliases: aliases("wago lever nut compact splice reusable clamp two"),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Lever wire connector, 3-port",
    searchAliases: aliases(
      "wago lever nut compact splice reusable clamp three"
    ),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Lever wire connector, 5-port",
    searchAliases: aliases("wago lever nut compact splice reusable clamp five"),
    defaultQty: 2,
  },
  {
    ...CONN,
    name: "Terminal block",
    // "din", not "din rail": DIN rail is its own item since 2026-09-25, and
    // the block must not answer to the rail's full name.
    searchAliases: aliases("din strip barrier feed through control panel"),
  },
  {
    ...CONN,
    name: "DIN rail",
    searchAliases: aliases("35mm top hat mounting channel control panel"),
  },
  {
    ...CONN,
    name: "Ferrule kit",
    searchAliases: aliases(
      "wire end sleeve crimp stranded bootlace assortment"
    ),
  },
  {
    ...CONN,
    name: "Insulated multi-tap block",
    searchAliases: aliases(
      "polaris multitap connector insulated tap splice service lug"
    ),
  },
  /*
    Compression splice sleeves, by the conductor they join. Moved from the
    pricing sheet, 2026-09-25; the two sizes a service job uses.
  */
  ...["#2", "#4/0"].map(gauge => ({
    ...CONN,
    name: `${gauge} crimp sleeve`,
    searchAliases: aliases(
      gauge.includes("/0") ? "aught ought" : "",
      "compression splice butt barrel inline service copper"
    ),
  })),
  {
    ...CONN,
    name: "Ring terminal",
    searchAliases: aliases("crimp lug eye connector insulated stud screw"),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Spade terminal",
    searchAliases: aliases(
      "crimp fork connector insulated screw quick disconnect"
    ),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Butt splice",
    searchAliases: aliases(
      "crimp inline connector insulated heat shrink barrel joiner"
    ),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "H-tap",
    searchAliases: aliases(
      "htap compression tap c crimp irreversible service splice"
    ),
  },
  {
    ...CONN,
    name: "Split-bolt connector",
    searchAliases: aliases(
      "splitbolt bug tap bolt splice copper mechanical service"
    ),
  },
  {
    ...CONN,
    name: "Cord grip",
    searchAliases: aliases(
      "strain relief connector liquid tight romex whip flexible gland"
    ),
  },
  {
    ...CONN,
    name: "MC anti-short bushing",
    searchAliases: aliases(
      "red head redhead armored bx cable protector insert throat"
    ),
    defaultQty: 4,
  },
  {
    ...CONN,
    name: "Cable staple",
    // "romex" earns its place here — it is what these hold, and it is how
    // "romex staple" finds them — but it must be the ONLY place it appears for
    // this row. ALIAS_MAP used to expand "staple" to "romex staple" as well,
    // and the two signals together ranked this staple above the cable itself
    // for a bare "romex". One signal ranks it correctly: below the NM-B rows
    // for "romex", first for "romex staple". See the note in smartSearch.ts.
    searchAliases: aliases(
      "romex nm insulated plastic nail stack strap fastener"
    ),
    defaultQty: 10,
  },
];

// ─── Consumables ──────────────────────────────────────────────────────────────

const CONS = part("Consumables");

export const CONSUMABLES: BaselineMaterial[] = [
  {
    ...CONS,
    name: "PVC cement",
    searchAliases: aliases(
      "glue solvent weld primer purple conduit plastic can dauber"
    ),
  },
  {
    ...CONS,
    name: "Duct seal",
    searchAliases: aliases(
      "putty compound conduit sealant rodent air barrier grey gray"
    ),
  },
  {
    ...CONS,
    name: "Firestop caulk",
    searchAliases: aliases(
      // "putty" stays, "pad" went on 2026-09-25: the putty pad is its own
      // item now, and a caulk answering to it would compete with it.
      "fire stop penetration red sealant rated wall putty"
    ),
  },
  {
    ...CONS,
    name: "Underground splice kit",
    searchAliases: aliases(
      "waterproof direct burial resin gel epoxy wet location repair"
    ),
  },
  {
    ...CONS,
    name: "Electrical tape",
    searchAliases: aliases("vinyl 33 super 88 roll colored phase black scotch"),
    defaultQty: 2,
  },
  {
    ...CONS,
    name: "Heat shrink tubing",
    searchAliases: aliases(
      "wrap adhesive lined dual wall insulation sleeve marine"
    ),
  },
  {
    ...CONS,
    name: "Pulling lube",
    searchAliases: aliases("wire lubricant soap gel yellow 77 slick jelly"),
  },
  {
    ...CONS,
    name: "Zip ties",
    searchAliases: aliases("cable tie wrap ty rap nylon bundle uv black"),
    defaultQty: 10,
  },
  {
    ...CONS,
    name: "Anti-oxidant compound",
    searchAliases: aliases(
      "antiox noalox penetrox alumin aluminum joint paste grease"
    ),
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...CONS,
    name: "Electrical putty pad",
    searchAliases: aliases(
      "fire rated box pad firestop moldable wrap back of box"
    ),
  },
  {
    ...CONS,
    name: "Expanding foam",
    searchAliases: aliases("spray foam can seal gap penetration great stuff"),
  },
  {
    ...CONS,
    name: "Silicone sealant",
    searchAliases: aliases("caulk clear weatherproof tube exterior rtv"),
  },
  {
    ...CONS,
    name: "Thread sealant",
    searchAliases: aliases("pipe dope tape teflon ptfe threaded conduit"),
  },
  {
    ...CONS,
    name: "Arc flash label",
    searchAliases: aliases("warning sticker nfpa 70e hazard equipment"),
  },
  {
    ...CONS,
    name: "Panel directory label",
    searchAliases: aliases("circuit schedule card index sticker breaker"),
  },
  {
    // On the sheet's Boxes list; it is a pulling aid, so it lives here.
    ...CONS,
    name: "Wire pulling grip",
    searchAliases: aliases("kellems basket sock cable mesh eye pull"),
  },
];

/**
 * The connector an SER or SEU service cable lands through (starter
 * assemblies plan § Gaps, 2026-09-29). The 3/8"–1" cable connectors above
 * are NM clamps and do not take a 4/0 service cable; before this row the
 * catalog shipped SER with nothing to terminate it. One size, named by the
 * knockout it fits, because the service assemblies use one.
 */
const seConnector: BaselineMaterial = {
  ...CONN,
  name: '2" SE cable connector',
  searchAliases: aliases(
    "2in ser seu service entrance watertight raintight fitting clamp"
  ),
  description:
    "For SER/SEU into a box or meter base. Check the cable's diameter against the connector's range.",
};

export const CONNECTORS: BaselineMaterial[] = [
  ...wireNuts,
  ...cableConnectors,
  ...mcConnectors,
  seConnector,
  ...lugs,
  ...terminations,
];
