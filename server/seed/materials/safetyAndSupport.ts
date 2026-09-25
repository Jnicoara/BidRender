/**
 * Grounding and bonding, life safety, fasteners and anchors, and the equipment
 * that gets connected at the end of a residential job.
 *
 * These four groups share a file because each is small and none is
 * combinatorial — every row here is a one-off named for what it is.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const item = (
  category:
    | "Grounding & Bonding"
    | "Life Safety"
    | "Fasteners & Anchors"
    | "Equipment & Appliances"
) => ({
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category,
});

export const GROUNDING: BaselineMaterial[] = [
  {
    ...item("Grounding & Bonding"),
    // Named rod-first so that typing "ground rod" lands on the rod rather than
    // on the clamp that goes with it.
    name: "Ground rod, 8 ft",
    searchAliases: aliases(
      "8ft eight foot copper clad galvanized earth stake driven electrode"
    ),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Ground rod clamp",
    searchAliases: aliases("acorn direct burial bronze rod attachment gec"),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Grounding bushing",
    searchAliases: aliases(
      "insulated throat lug conduit bond myers hub set screw"
    ),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Bonding jumper",
    searchAliases: aliases("bond strap water pipe gas main green braided"),
  },
  {
    ...item("Grounding & Bonding"),
    name: "Ground bar kit",
    searchAliases: aliases(
      "bus bar strip panel egc terminal isolated neutral kit"
    ),
  },
];

export const LIFE_SAFETY: BaselineMaterial[] = [
  {
    ...item("Life Safety"),
    name: "Hardwired smoke detector",
    searchAliases: aliases(
      "smoke alarm interconnect 120v battery backup photoelectric ionization"
    ),
    description:
      "Smoke only. The combination smoke/CO unit is a separate item.",
  },
  {
    ...item("Life Safety"),
    name: "Hardwired smoke/CO detector",
    searchAliases: aliases(
      "smoke alarm carbon monoxide combo combination interconnect 120v backup"
    ),
    description: "Combination unit. The smoke-only version is a separate item.",
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm pull station",
    searchAliases: aliases(
      "manual pull double action red fa addressable initiating"
    ),
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm horn/strobe",
    searchAliases: aliases(
      "notification appliance nac audible visual candela wall ceiling fa"
    ),
  },
  {
    ...item("Life Safety"),
    name: "Fire alarm control panel",
    searchAliases: aliases(
      "facp addressable conventional zone annunciator fa head end"
    ),
  },
];

export const FASTENERS: BaselineMaterial[] = [
  {
    ...item("Fasteners & Anchors"),
    name: "Drywall anchor",
    searchAliases: aliases(
      "hollow wall plastic toggle sheetrock gypsum plug screw"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Toggle bolt",
    searchAliases: aliases(
      "butterfly spring wing hollow wall anchor snap heavy"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Concrete wedge anchor",
    // "drop in" came out 2026-09-25, when the drop-in anchor became its own
    // item: a wedge anchor is not one.
    searchAliases: aliases("stud red head expansion masonry bolt kwik"),
    defaultQty: 4,
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...item("Fasteners & Anchors"),
    name: "Drop-in anchor",
    searchAliases: aliases(
      "dropin concrete flush female internal thread set tool rod hanger"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Sleeve anchor",
    searchAliases: aliases("concrete masonry block brick expansion hex nut"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Powder-actuated pin",
    searchAliases: aliases(
      "shot pin ramset hilti pa fastener nail load concrete steel"
    ),
    defaultQty: 10,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Plastic conduit clip",
    searchAliases: aliases("snap emt nm cable holder nail on surface"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Masonry screw",
    searchAliases: aliases("tapcon concrete block brick blue hammer drill"),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Self-drilling screw",
    searchAliases: aliases("tek sheet metal stud zip point hex head"),
    defaultQty: 10,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Beam clamp",
    searchAliases: aliases("purlin i beam steel hanger rod c clamp structural"),
    defaultQty: 2,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Rod hanger clip",
    searchAliases: aliases(
      "caddy flange clip bat wing rod hanger threaded attachment"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "J-hook",
    searchAliases: aliases(
      "jhook cable support bridle ring low voltage batwing hanger"
    ),
    defaultQty: 4,
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Ceiling support wire",
    searchAliases: aliases(
      "tie wire grid t-bar independent support 12 gauge slack"
    ),
  },
  {
    ...item("Fasteners & Anchors"),
    name: "Conduit hanger with bolt",
    searchAliases: aliases("clamp rod threaded pipe ring support suspended"),
    defaultQty: 3,
  },
];

/**
 * The equipment a residential job connects at the end. Generic and unpriced —
 * a fan or an EVSE is chosen by the homeowner, and the row exists so the labor
 * and the connection materials do not get forgotten alongside it.
 */
export const EQUIPMENT: BaselineMaterial[] = [
  {
    ...item("Equipment & Appliances"),
    name: "Bath exhaust fan",
    searchAliases: aliases(
      "vent fan bathroom ceiling exhaust cfm humidity light combo"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Range hood fan",
    searchAliases: aliases("vent kitchen stove over exhaust ducted downdraft"),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Attic fan",
    searchAliases: aliases(
      "gable roof ventilator whole house thermostat exhaust"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "EV charger",
    searchAliases: aliases(
      "evse electric vehicle car level 2 charging station tesla j1772 40 amp"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Whole-house surge protector",
    searchAliases: aliases(
      "spd tvss panel mounted lightning suppressor type 2 service"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Generator interlock kit",
    searchAliases: aliases(
      "backfeed slide plate panel breaker portable standby"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Manual transfer switch",
    searchAliases: aliases(
      "generator portable standby 6 circuit 10 circuit inlet switchover"
    ),
  },
  {
    ...item("Equipment & Appliances"),
    name: "Doorbell transformer",
    searchAliases: aliases("chime 16v 24v low voltage bell xfmr ring nest"),
  },
];
