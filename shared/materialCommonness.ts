/**
 * How COMMON a material is: what an estimator most likely means when two
 * search results match the words typed equally well.
 *
 * ── It only ever breaks a tie, and that is the whole safety of it ────────────
 * "20A breaker" matches eight breakers equally: every one has "20A" and
 * "breaker" in it. Before this, the tie fell to whatever order the rows
 * arrived in, alphabetical on the Materials screen, which put the plain
 * single-pole breaker 7th behind four 2-pole variants. Commonness settles that
 * tie. It is never allowed to beat a BETTER match: "90A 3-Pole breaker" is
 * rare, but typing "90a 3 pole" names it, and it comes first.
 *
 * Applying a popularity signal to every comparison was tried once already with
 * a different signal (family size, shared/materialSearchRank.ts) and moved 20
 * of 58 sweep queries, most of them wrongly. So this sits below match quality,
 * role and relevance score in compareByRole, and nowhere else.
 *
 * ── Three sources, added together ────────────────────────────────────────────
 *   1. STARTER — a shipped guess at what is used on most jobs. Keyed by the
 *      shipped NAME, which a company's own fork of the row keeps, so their copy
 *      ranks like ours. A row the company created itself has no starter rank;
 *      it earns one through use instead.
 *   2. USAGE — how many of THIS COMPANY'S bids the material is on. Read per
 *      company on the server (materials.usage), never pooled across
 *      companies, so one contractor's habits never reorder another's search.
 *   3. RECENCY — a small bump for something on a bid in the last 30 days.
 *
 * The points are chosen so the company's own habit outgrows the shipped guess:
 * two bids' worth of use equals a "core" starter rank, and three passes it.
 *
 * ── THE STARTER LIST IS A FIRST PASS, NOT A DECISION ─────────────────────────
 * Written 2026-09-24 from general trade knowledge, and awaiting review by the
 * owner. Two tiers only — "core" (on nearly every job) and "common" (on many) —
 * because finer grades would be precision nobody has. Unlisted means neutral,
 * not rare. materialsCatalog.test.ts fails on any key that is not a shipped
 * name, so a rename cannot quietly strand an entry.
 */

export type StarterCommonness = "core" | "common";

export const STARTER_COMMONNESS: Readonly<Record<string, StarterCommonness>> = {
  // ── Breakers ──
  "15A Single-Pole breaker": "core",
  "20A Single-Pole breaker": "core",
  "20A 2-Pole breaker": "core",
  "30A 2-Pole breaker": "core",
  "30A Single-Pole breaker": "common",
  "40A 2-Pole breaker": "common",
  "50A 2-Pole breaker": "common",
  "60A 2-Pole breaker": "common",
  // 70–125A two-pole: subpanel feeds, heat strips, large A/C. Common, so a
  // "90a breaker" leads with the two-pole rather than the rarer 3-pole that
  // matches it equally well.
  "70A 2-Pole breaker": "common",
  "80A 2-Pole breaker": "common",
  "90A 2-Pole breaker": "common",
  "100A 2-Pole breaker": "common",
  "110A 2-Pole breaker": "common",
  "125A 2-Pole breaker": "common",
  "15A Single-Pole AFCI breaker": "common",
  "20A Single-Pole AFCI breaker": "common",
  "20A Single-Pole GFCI breaker": "common",
  "15A Single-Pole AFCI/GFCI combo breaker": "common",
  "20A Single-Pole AFCI/GFCI combo breaker": "common",
  "50A 2-Pole GFCI breaker": "common",
  "15/15 tandem breaker": "common",
  "20/20 tandem breaker": "common",

  // ── Panels: the service-upgrade pair ──
  // Added 2026-09-25, when the pricing sheet's spaced and specialty panels
  // joined the catalog. Every one of those ties the plain main panels on
  // relevance for "panel" or "meter", and the tie then fell to the
  // alphabet, which put "Generator-ready main panel" and "Meter-main combo"
  // first.
  "200A main panel": "common",
  "100A main panel": "common",
  "200A meter base": "common",
  "100A meter base": "common",

  // ── Wire & Cable ──
  "14-2 NM-B": "core",
  "12-2 NM-B": "core",
  "12-2 MC cable": "core",
  "#12 THHN": "core",
  "14-3 NM-B": "common",
  "12-3 NM-B": "common",
  "10-2 NM-B": "common",
  "10-3 NM-B": "common",
  "6-3 NM-B": "common",
  "12-3 MC cable": "common",
  "#14 THHN": "common",
  "#10 THHN": "common",
  "#8 THHN": "common",
  "#6 THHN": "common",

  // ── Conduit ──
  '1/2" EMT': "core",
  '3/4" EMT': "core",
  '1" EMT': "common",
  '1/2" PVC Sch 40': "common",
  '3/4" PVC Sch 40': "common",
  '1" PVC Sch 40': "common",
  '2" PVC Sch 40': "common",
  '1/2" flexible metal conduit': "common",
  '1/2" liquidtight flexible conduit': "common",

  // ── Conduit fittings: the EMT pair that goes with the core pipe ──
  '1/2" EMT connector': "core",
  '3/4" EMT connector': "core",
  '1/2" EMT coupling': "core",
  '3/4" EMT coupling': "core",
  '1" EMT connector': "common",
  '1" EMT coupling': "common",
  "EMT strap": "common",

  // ── Boxes ──
  "Single-gang box": "core",
  "Double-gang box": "core",
  '4" square box': "core",
  "Single-gang metal box": "common",
  "Double-gang metal box": "common",
  "Triple-gang box": "common",
  "Fan-rated ceiling box": "common",
  "Octagon box, plastic": "common",
  "Octagon box, metal": "common",
  '4" square mud ring': "common",
  "Handy box": "common",
  "Weatherproof box, single-gang": "common",

  // ── Devices ──
  "Duplex receptacle": "core",
  "GFCI receptacle": "core",
  "Single-pole switch": "core",
  "3-way switch": "core",
  // Core, not common: every kitchen, bath, laundry and garage circuit is 20A.
  // Listed after the plain duplex so a bare "receptacle" still leads with it.
  "20A duplex receptacle": "core",
  // Added 2026-09-25 with the rows themselves: the 20A GFCI is on every
  // kitchen and bath counter, and the weather-resistant one outside every
  // door. Without these "gfci" led with breakers ahead of the 20A device.
  "20A GFCI receptacle": "common",
  "GFCI receptacle, weather-resistant": "common",
  "USB combo receptacle": "common",
  "30A dryer receptacle": "common",
  "50A range receptacle": "common",
  "4-way switch": "common",
  // So "20a switch" leads with the single-pole, as "switch" does (2026-09-25).
  "20A single-pole switch": "common",
  Dimmer: "common",
  "Occupancy sensor switch": "common",

  // ── Lighting: the 4 ft tube is the one most retrofits buy ──
  // Added 2026-09-25 with the tubes. Without it "fluorescent" and "t8" led
  // with the 2 ft tube, which only wins the size sort.
  "4 ft LED T8 tube, ballast bypass": "common",
  "4 ft LED T8 tube, ballast compatible": "common",

  // ── Lighting: the residential downlight ──
  // Added 2026-09-25, when "LED cylinder downlight" arrived from the pricing
  // sheet and led "downlight" on the alphabet.
  '5"/6" wafer LED downlight': "common",
  '4" wafer LED downlight': "common",

  // ── Life safety: what a residential and a small commercial job count ──
  // Added 2026-09-25 with the duct smoke detector, beam detector and FA
  // modules, which tied these on "smoke" and "fire alarm" and led on the
  // alphabet ("Duct …", "Fire alarm battery").
  "Hardwired smoke detector": "common",
  "Hardwired smoke/CO detector": "common",
  "Fire alarm horn/strobe": "common",
  "Fire alarm pull station": "common",

  // ── Generator: the part most residential generator jobs buy ──
  // Added 2026-09-25, when the generator-ready panel, cords and pad arrived
  // and "Generator-ready main panel" led "generator" on the alphabet.
  "Generator interlock kit": "common",

  // ── Grounding: on every service ──
  "Ground rod, 8 ft": "common",
};

/**
 * Where each name sits in the list above. WITHIN A TIER, LISTED FIRST MEANS
 * MORE COMMON, and that is deliberate rather than tidy: without it, two "core"
 * rows tied and fell to the catalog's alphabetical type order, which put the
 * 3-way switch above the single-pole switch and the double-gang box above the
 * single-gang box. Measured on the spot-check sweep, 2026-09-24.
 */
const STARTER_ORDER = new Map(
  Object.keys(STARTER_COMMONNESS).map((name, index) => [name, index])
);

/** What this company's own bids say about one material. */
export type MaterialUsage = {
  /** How many distinct bids the material appears on. */
  bids: number;
  /** When it was last put on a bid, or null if never. */
  lastUsedAt: Date | null;
};

const STARTER_POINTS: Record<StarterCommonness, number> = {
  core: 20,
  common: 10,
};
/** Per distinct bid, capped so one habit cannot run away with the ranking. */
const POINTS_PER_BID = 10;
const MAX_USAGE_POINTS = 50;
/** The "small bump" for something on a bid lately. */
const RECENT_POINTS = 5;
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A material's commonness, in points; higher sorts first among equal matches.
 *
 * `now` is a parameter, never Date.now(), so "used 29 days ago" and "used 31
 * days ago" can both be tested without waiting a month.
 */
export function commonnessPoints(
  name: string,
  usage: MaterialUsage | undefined,
  now: Date
): number {
  const starter = STARTER_COMMONNESS[name];
  let points = starter ? STARTER_POINTS[starter] : 0;
  /*
    List order, worth LESS THAN ONE POINT in total, so it only ever orders
    rows the whole points already tie — it cannot lift a "common" row over a
    "core" one, or outweigh a single bid of the company's own use.
  */
  const index = STARTER_ORDER.get(name);
  if (index !== undefined)
    points += (STARTER_ORDER.size - index) / (STARTER_ORDER.size + 1);
  if (usage) {
    points += Math.min(usage.bids * POINTS_PER_BID, MAX_USAGE_POINTS);
    if (
      usage.lastUsedAt &&
      now.getTime() - usage.lastUsedAt.getTime() <= RECENT_WINDOW_MS
    ) {
      points += RECENT_POINTS;
    }
  }
  return points;
}
