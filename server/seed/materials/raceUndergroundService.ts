/**
 * Surface raceway, underground and service entrance — the three shelves
 * migration 0117 added, first stocked 2026-10-07 from the owner-approved
 * materials review sheet (pricing/frozen-names.json, `adds`).
 *
 * ── 0117 must be on a database before this file's rows reach it ──────────────
 * `materials.category` is an ENUM, and these three values exist only since
 * 0117. Staging has it; LIVE DOES NOT (live-release-plan.md). A build with
 * this file booting against a database without 0117 fails its insert. That
 * is what the release plan's pairing line is for.
 *
 * Generic names, as everywhere outside panels and breakers (CLAUDE.md §
 * Brands). "Wiremold" is how the trade SAYS surface raceway, so it is a
 * search word here — the same way "halo juno" is on the cans — never a name.
 *
 * Rows the review sheet listed that are NOT here, and why, are in
 * shared/frozenAddsHeld.ts (FROZEN_ADDS_NOT_SEEDED): weatherheads and 36"
 * PVC sweeps the catalog already ships, and the meter socket hub that ships
 * as `2" meter hub`. The sheet's "Wire mold for low voltage" ships on Low
 * Voltage as "Surface raceway (wire mold), low voltage" (owner's name).
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const row = (
  category: "Surface Raceway" | "Underground" | "Service Entrance",
  unitOfSale: "each" | "foot",
  name: string,
  slang: string,
  description?: string
): BaselineMaterial => ({
  name,
  unitOfSale,
  costPerUnit: UNPRICED,
  category,
  searchAliases: aliases(slang),
  ...(description ? { description } : {}),
});

// ─── Surface raceway ──────────────────────────────────────────────────────────

// "wire mold" and "wiremold" on EVERY surface raceway item (owner,
// 2026-10-07): it is what the trade calls it, spelled both ways.
const SR = "wiremold wire mold surface metal raceway channel";
const sr = (unit: "each" | "foot", name: string, slang: string, d?: string) =>
  row("Surface Raceway", unit, name, `${slang} ${SR}`, d);

export const SURFACE_RACEWAY: BaselineMaterial[] = [
  sr(
    "foot",
    "Surface raceway base, 500 series",
    "500 v500 small single channel base",
    "The base half of two-piece raceway; the cover is its own row."
  ),
  sr(
    "foot",
    "Surface raceway cover, 500 series",
    "500 v500 small snap on cover",
    "The cover half of two-piece raceway; the base is its own row."
  ),
  /*
    ONE per-foot row for 700, not base + cover (owner, 2026-10-08;
    references/per-foot-items-plan.md § 3c). 700 is one-piece raceway in the
    field, and it is a RUN TYPE of its own, traced like EMT — so the row is
    the raceway that type prices. It was "Surface raceway base, 700 series"
    (renamed in place, shared/renamedMaterials.ts AFTER_FREEZE) and the cover
    row is retired (index.ts). Allowed because neither row had reached live.

    Its raceway facts feed the fitting count: 10 ft sticks joined by a
    coupling. The support-clip spacing and distance from a box ship NOT SET —
    the owner has not given a figure (plan § 7, Q1), and the count says
    "straps not counted" rather than inventing one.
  */
  {
    // "base" kept as a search word: the row's old name, and what the counter
    // still calls the channel, so a typed "700 base" lands here first.
    ...sr(
      "foot",
      "Surface raceway, 700 series",
      "700 v700 single channel base"
    ),
    raceway: {
      stickLengthFeet: 10,
      stickJoint: "coupling",
      strapSpacingFeet: null,
      strapFromBoxFeet: null,
    },
  },
  sr("foot", "Surface raceway, 1500 series", "1500 ds pancake low profile"),
  sr(
    "foot",
    "Surface raceway, 2400 series two-channel",
    "2400 dual two channel power data divided"
  ),
  sr("each", "Raceway blank end plate", "blank end closure cap plate"),
  sr("each", "Raceway conduit connector", "transition emt box connector"),
  sr("each", "Raceway coupling", "joiner splice cover clip"),
  sr(
    "each",
    "Raceway device box, 1-gang",
    "single gang one gang 1g receptacle"
  ),
  sr(
    "each",
    "Raceway device box, 2-gang",
    "double gang two gang 2g receptacle"
  ),
  sr("each", "Raceway divider clip", "barrier separator power data"),
  sr("each", "Raceway end cap", "end fitting closure terminate"),
  sr(
    "each",
    "Raceway entrance end fitting",
    "entry feed end box start from wall"
  ),
  sr("each", "Raceway fixture box", "round ceiling light octagon"),
  sr("each", "Raceway flat elbow", "90 ell turn flat"),
  sr("each", "Raceway inside elbow", "90 ell internal corner"),
  sr("each", "Raceway mounting strap", "clip clamp support"),
  sr("each", "Raceway outside elbow", "90 ell external corner"),
  sr("each", "Raceway tee fitting", "t branch split"),
  // The 700-series device box and plate, cover family 2026-10-08 (owner).
  // The plate is the part DV34 lists as missing (starterAssemblies.ts); the
  // recipe change that un-holds DV34 is Track B's, not this file's.
  {
    ...sr(
      "each",
      "Surface raceway device box, 700 series",
      "700 v700 shallow switch receptacle single gang one gang 1g"
    ),
    jobKind: "commercial",
  },
  {
    ...sr(
      "each",
      "Surface raceway device plate, 700 series",
      "700 v700 faceplate cover outlet duplex single gang one gang 1g"
    ),
    jobKind: "commercial",
  },
  /*
    The 700 run type's own fittings (per-foot items plan § 3e, owner
    2026-10-08), so a traced 700 run can buy 700 parts rather than the
    generic `Raceway …` rows, which stay for the other series. No 700 end cap:
    a 700 run ends in a device box or an entrance end. Which trace event buys
    which part (a plan corner an inside elbow, an end drop a flat elbow, the
    entrance end at the START only, a tee as a fitting) is the fitting
    family's code — plan § 3c — not this file.
  */
  ...(
    [
      ["coupling", "joiner splice connection"],
      ["flat elbow", "90 ell flat turn"],
      ["inside elbow", "90 ell internal corner"],
      ["outside elbow", "90 ell external corner"],
      ["tee", "t branch split"],
      ["entrance end fitting", "entry feed start from wall box"],
      ["support clip", "strap clamp mounting"],
    ] as const
  ).map(([part, slang]) => ({
    ...sr("each", `Surface raceway ${part}, 700 series`, `700 v700 ${slang}`),
    jobKind: "commercial" as const,
  })),
];

// ─── Underground ──────────────────────────────────────────────────────────────

const UG = "underground trench buried direct burial";
const ug = (unit: "each" | "foot", name: string, slang: string, d?: string) =>
  row("Underground", unit, name, `${slang} ${UG}`, d);

export const UNDERGROUND: BaselineMaterial[] = [
  ug(
    "each",
    'Conduit spacer, 2"',
    "2 two inch duct bank base interlocking support chair"
  ),
  ug(
    "each",
    'Conduit spacer, 4"',
    "4 four inch duct bank base interlocking support chair"
  ),
  ug(
    "each",
    "Duct bank spacer",
    "multi conduit concrete encasement support",
    "For a concrete-encased bank of several conduits."
  ),
  ug(
    "each",
    "Direct burial wire nut",
    "dbr waterproof gel filled splice connector wet"
  ),
  ug(
    "foot",
    "Mule tape, 1800 lb",
    "pull tape measuring tape polyester pulling line reel"
  ),
  ug(
    "foot",
    'Pull rope, 1/4"',
    "pull line polyrope string pulling 1/4 quarter"
  ),
  ug("foot", "Tracer wire", "locate locating wire 14 awg pvc conduit utility"),
  ug("each", "Tracer wire access box", "locate test station valve box"),
  ug("each", "Trench marker post", "warning marker sign utility locate"),
  ug(
    "foot",
    "Underground warning tape",
    "caution tape electric line buried below red marker detectable"
  ),
];

// ─── Service entrance ─────────────────────────────────────────────────────────

const SE = "service entrance overhead utility";
const se = (unit: "each" | "foot", name: string, slang: string, d?: string) =>
  row("Service Entrance", unit, name, `${slang} ${SE}`, d);

export const SERVICE_ENTRANCE: BaselineMaterial[] = [
  se(
    "each",
    "Service entrance cap",
    "se cap cable weather head ser seu",
    "For SE cable with no conduit — not a conduit weatherhead."
  ),
  se("each", "Service entrance elbow", "se ell 90 cable sill plate"),
  se("each", 'Service mast, 2"', "2 two inch riser rigid mast pipe stick"),
  se(
    "each",
    'Service mast, 2-1/2"',
    "2-1/2 2.5 two and a half inch riser rigid mast pipe stick"
  ),
  se("each", 'Service mast, 3"', "3 three inch riser rigid mast pipe stick"),
  se("each", "Mast guy wire kit", "guy cable anchor brace support"),
  se("each", "Meter seal", "utility tag lock seal ring"),
  se(
    "each",
    "Meter socket adapter ring",
    "extension spacer collar ring meter base"
  ),
  se(
    "each",
    "Main bonding jumper kit",
    "mbj bond screw strap neutral ground panel"
  ),
  se(
    "each",
    "Ground rod access well",
    "inspection well box ground rod test well gec"
  ),
  /*
    The review sheet's "Riser strap, 3"" — named the way the shipped 2" one
    is ('2" riser strap', the duplicate pair the owner settled as "keep A"),
    and shelved beside it on Conduit Fittings rather than here.
  */
  {
    name: '3" riser strap',
    unitOfSale: "each",
    costPerUnit: UNPRICED,
    category: "Conduit Fittings",
    searchAliases: aliases(
      "3 three inch mast strap clamp service entrance overhead"
    ),
  },
];
