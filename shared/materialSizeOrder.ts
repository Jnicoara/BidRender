/**
 * Ordering materials by physical size, smallest to largest.
 *
 * ── Why none of this can be a numeric sort ───────────────────────────────────
 * American Wire Gauge runs BACKWARDS: a bigger number is a smaller wire, so 18
 * is the thinnest and 1 is far thicker. Then at 1/0 the whole scheme inverts —
 * 1/0 is bigger than 1, 4/0 is bigger than 1/0 — and above that it stops being
 * a gauge at all and becomes kcmil, which finally does count upwards.
 *
 * Sort those as numbers and you get 1, 2, 3, 4, 10, 12, 14, 18 — exactly
 * backwards. Sort them as text and "4/0" lands between "4" and "6", putting the
 * heaviest conductor in the catalog in the middle of the thin ones. Neither
 * failure looks like a bug on screen: the list is *sorted*, just wrongly, and an
 * estimator scanning for the next size up finds the wrong row where they expect
 * the right one.
 *
 * So the order is written out, once, as data.
 *
 * ── The marker decides the scale, never the bare number ──────────────────────
 * A leading number on its own is ambiguous and reading it as a gauge is a trap
 * that catches real rows: `1/2" EMT` starts with a 1, and `4 ft LED strip`
 * starts with a 4, and neither is a #1 or a #4 conductor. Both were mis-sorted
 * by an earlier version of this file that checked the number before the units.
 * So a size is only recognised through its MARKER — a `#`, an aught, a `kcmil`,
 * an inch mark, `ft`, an `A` — and a number with no marker is not a size.
 *
 * Different markers mean different scales, which are not comparable: AWG #4 and
 * 4 inches and 4 amps share a digit and nothing else. So the key carries its
 * scale, and rows sort by scale first. Within a category that is almost always
 * a single scale; where a category genuinely mixes them (Lighting has fixtures
 * sized in inches and tracks sized in feet) the effect is a sensible sub-group
 * per kind rather than a meaningless interleave.
 */

/**
 * Every conductor size the catalog carries, thinnest first.
 *
 * Read this as the physical sequence it is: #18 is bell wire, #14 and #12 are
 * branch circuits, 4/0 is a 200A service, 500 kcmil is a feeder you need two
 * people to pull. Add new sizes in position rather than at the end.
 */
export const CONDUCTOR_SIZES = [
  "18",
  "16",
  "14",
  "12",
  "10",
  "8",
  "6",
  "4",
  "3",
  "2",
  "1",
  "1/0",
  "2/0",
  "3/0",
  "4/0",
  "250",
  "300",
  "350",
  "400",
  "500",
  "600",
  "750",
  "1000",
] as const;

const CONDUCTOR_RANK = new Map<string, number>(
  CONDUCTOR_SIZES.map((size, index) => [size, index])
);

/**
 * Trade sizes for raceway, smallest first.
 *
 * The same trap in a smaller way: "1/2" and "3/4" sort after "1" as text, and
 * "1-1/4" sorts before "1/2".
 */
export const TRADE_SIZE_ORDER = [
  '3/8"',
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '3-1/2"',
  '4"',
  '5"',
  '6"',
] as const;

const TRADE_SIZE_RANK = new Map<string, number>(
  TRADE_SIZE_ORDER.map((size, index) => [size, index])
);

/**
 * Which scale a row's size is measured on. Ordered so that when a category does
 * mix them, the grouping reads sensibly: conductors, then raceway, then rated
 * equipment, then physical lengths, then everything unsized.
 */
const SCALE = {
  conductor: 0,
  tradeSize: 1,
  amps: 2,
  kva: 3,
  airflow: 4,
  dimension: 5,
  length: 6,
  none: 7,
} as const;

/**
 * A two-dimension size at the front — "4x4 pull box", "2x4 LED troffer".
 *
 * Its own scale, not a length: the unit is not stated (boxes are inches,
 * troffers are feet) and nothing needs the two compared. What matters is that
 * 4x4 sorts before 12x12, which alphabetical order gets backwards.
 */
const DIMENSION = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?=\s)/i;

/**
 * A size stated AFTER the name — "Bath exhaust fan, 50 CFM", "Ground rod,
 * 8 ft". The catalog's other naming convention: {type}, {size}.
 *
 * The whole remainder after the comma must be the size. "Ground rod, 3/4\" x
 * 10 ft" is a diameter and a length, and reading only the length would file it
 * as the plain 10 ft rod.
 */
const TRAILING = /,\s*(\d+(?:\.\d+)?)\s*(CFM|ft)$/i;

type SizeKey = {
  scale: number;
  /** Position on that scale. Meaningless across scales. */
  value: number;
  /** Conductor count in a cable spec — the 2 in "12-2 NM-B". 0 otherwise. */
  count: number;
};

const conductor = (size: string): SizeKey | null => {
  const rank = CONDUCTOR_RANK.get(size);
  return rank === undefined
    ? null
    : { scale: SCALE.conductor, value: rank, count: 0 };
};

/** "1-1/4" -> 1.25, "3/4" -> 0.75, "6" -> 6. */
function inchesOf(token: string): number | null {
  const mixed = token.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const whole = token.match(/^(\d+(?:\.\d+)?)$/);
  return whole ? Number(whole[1]) : null;
}

/**
 * Read the size out of a material name, or null when it states none.
 *
 * Ordered by how unambiguous the marker is, most first. Every branch requires
 * evidence of its unit; none of them settles for a bare number.
 */
function readSize(name: string): SizeKey | null {
  // A hashed gauge — "#12 THHN", "#4/0 XHHW aluminum". Unambiguous.
  const hashed = name.match(/^#(\d{1,4}\/0|\d{1,4})(?![\d/])/);
  if (hashed) return conductor(hashed[1]);

  // A conductor RANGE, named as such — "14-10 AWG crimp lug", "1-1/0 AWG".
  //
  // A lug is sold by the span of conductor its barrel accepts, not per gauge
  // (see LUG_RANGES in server/seed/materials/connectors.ts), so its size is a
  // pair. It sorts by the range's SMALLEST conductor, which is the physical
  // sequence: 14-10, 8-6, 4-2, 1-1/0, 2/0-4/0 runs thinnest to thickest.
  //
  // The trailing "AWG" is doing real work, and this branch must not drop it.
  // Without that marker "14-10" is indistinguishable from a cable spec, and
  // the branch below would read it as #14 wire with 10 conductors in it.
  // Three of the five ranges used to fall through to exactly that: "8-6 AWG"
  // read as a six-conductor #8 cable. The ORDER it produced happened to be
  // right — a range starts at its own first element — so nothing looked
  // wrong, while the other two ("1-1/0" and "14-10") matched no branch at all
  // and sorted to the end as sizeless, splitting one family of five into
  // three and two.
  const range = name.match(/^(\d{1,4}(?:\/0)?)-\d{1,4}(?:\/0)?\s+AWG\b/i);
  if (range) return conductor(range[1]);

  // kcmil, named as such — "250 kcmil THHN".
  const kcmil = name.match(/^(\d{2,4})\s*kcmil\b/i);
  if (kcmil) return conductor(kcmil[1]);

  // An aught with no hash — "4/0-3 SER aluminum", "1/0-3 SER aluminum".
  const aught = name.match(/^(\d\/0)(?![\d/])/);
  if (aught) {
    const key = conductor(aught[1]);
    if (key) return { ...key, count: cableCount(name) };
  }

  // A cable spec — "12-2 NM-B", "14-3 MC cable". The leading element is the
  // gauge; the element after the hyphen is how many conductors.
  //
  // The lookahead is what keeps `1-1/4" EMT` out of here: without it the "1-1"
  // reads as a #1 conductor with one conductor in it, and every mixed trade
  // size sorts among the wire.
  const cable = name.match(/^(\d{1,4})-(\d)(?![\d/])/);
  if (cable) {
    const key = conductor(cable[1]);
    if (key) return { ...key, count: Number(cable[2]) };
  }

  // A kcmil element list — "250-250-250 SER aluminum". Written as three sizes
  // rather than a gauge and a count, so it needs its own branch; the leading
  // element is still what determines how big the cable is.
  const kcmilSet = name.match(/^(\d{3,4})-\d{3,4}\b/);
  if (kcmilSet) return conductor(kcmilSet[1]);

  // An inch mark — either a raceway trade size or a plain measurement.
  const inch = name.match(/^(\d+(?:-\d+\/\d+)?(?:\/\d+)?)"/);
  if (inch) {
    const trade = TRADE_SIZE_RANK.get(`${inch[1]}"`);
    if (trade !== undefined)
      return { scale: SCALE.tradeSize, value: trade, count: 0 };
    const inches = inchesOf(inch[1]);
    if (inches !== null)
      return { scale: SCALE.length, value: inches, count: 0 };
  }

  // Feet — "4 ft LED strip fixture", "8 ft ground rod". Normalised to inches so
  // a fixture named in inches and one named in feet compare correctly.
  const feet = name.match(/^([\d.]+)\s*ft\b/i);
  if (feet)
    return { scale: SCALE.length, value: Number(feet[1]) * 12, count: 0 };

  // An amperage — "20A breaker", "100A main panel", "20/2 breaker". For a
  // two-pole breaker the "/2" is poles, not size, so 20/2 sorts with 20A.
  const amps = name.match(/^(\d{1,4})\s*(?:A\b|\/\d\b)/);
  if (amps) return { scale: SCALE.amps, value: Number(amps[1]), count: 0 };

  // Transformer rating — "15 kVA dry-type transformer". Without it 15, 30,
  // 45, 75 happen to sort, and a 112.5 kVA row would land first.
  const kva = name.match(/^(\d+(?:\.\d+)?)\s*kVA\b/i);
  if (kva) return { scale: SCALE.kva, value: Number(kva[1]), count: 0 };

  // Width then height — "4x4 pull box". The second dimension breaks a tie on
  // the first, so 2x2 sorts before 2x4; it is scaled down far enough that it
  // can never outweigh a whole step of the first.
  const dimension = name.match(DIMENSION);
  if (dimension)
    return {
      scale: SCALE.dimension,
      value: Number(dimension[1]) + Number(dimension[2]) / 10000,
      count: 0,
    };

  // Last, because it reads the END of the name: a leading size always wins.
  const trailing = name.match(TRAILING);
  if (trailing) {
    const value = Number(trailing[1]);
    return trailing[2].toLowerCase() === "cfm"
      ? { scale: SCALE.airflow, value, count: 0 }
      : { scale: SCALE.length, value: value * 12, count: 0 };
  }

  return null;
}

/** The conductor COUNT in a multi-element cable spec like "4/0-4/0-2/0". */
function cableCount(name: string): number {
  const match = name.match(/^(?:\d\/0)-(\d)\b/);
  return match ? Number(match[1]) : 0;
}

/**
 * A sortable key for one material, ordering by physical size within a category.
 *
 * The name is the final tiebreaker on purpose — two 3/4" fittings that differ
 * only in kind should land in a stable, predictable order rather than shuffling
 * between renders.
 *
 * Anything with no recognisable size sorts after everything that has one, by
 * name: a category holding "Wire nuts" and "#12 THHN" should lead with the
 * sized rows in size order rather than interleaving on alphabetical accident.
 */
export function materialSizeKey(
  name: string
): [number, number, number, string] {
  const trimmed = name.trim();
  const size = readSize(trimmed);
  return [
    size?.scale ?? SCALE.none,
    size?.value ?? 0,
    size?.count ?? 0,
    trimmed.toLowerCase(),
  ];
}

/** Compare two materials by size within a category. */
export function compareBySize(a: string, b: string): number {
  const [aScale, aValue, aCount, aName] = materialSizeKey(a);
  const [bScale, bValue, bCount, bName] = materialSizeKey(b);
  if (aScale !== bScale) return aScale - bScale;
  if (aValue !== bValue) return aValue - bValue;
  if (aCount !== bCount) return aCount - bCount;
  return aName < bName ? -1 : aName > bName ? 1 : 0;
}

/** True when the name states a size this module understands. */
export function hasSize(name: string): boolean {
  return readSize(name.trim()) !== null;
}

/**
 * The leading size token, as TEXT — "#12", "1-1/4\"", "20A", "12-2".
 *
 * ── Why this lives here and not where the grouping does ──────────────────────
 * `readSize` above already knows every shape a size can take in this catalog,
 * and there must not be a second list that drifts from it: a grouping rule with
 * its own idea of what a size looks like would put "1-1/4\" EMT" in a different
 * family from "1/2\" EMT" the first time somebody added a branch to one and not
 * the other. So the patterns are written once, here, and both the ordering and
 * the grouping read them.
 *
 * Returns null when the name states no size, which is the honest answer for
 * "Wire nuts" and is what stops such a row being grouped at all.
 */
const SIZE_PREFIXES: RegExp[] = [
  // A conductor range — "14-10 AWG crimp lug". Consumes the unit word, so the
  // five lug ranges all derive the same type and list as one family.
  /^\d{1,4}(?:\/0)?-\d{1,4}(?:\/0)?\s+AWG\s+/i,
  // Multi-element aught cables — "4/0-4/0-2/0 SER aluminum".
  /^#?\d\/0(?:-\d(?:\/0)?)*\s+/,
  // kcmil, named — "250 kcmil THHN". Consumes the unit word too.
  /^\d{2,4}\s*kcmil\s+/i,
  // kcmil element lists — "250-250-250 SER aluminum".
  /^\d{3,4}(?:-\d{3,4})+\s+/,
  // A plain-gauge conductor set — "2-2-2-4 SER aluminum", "4-4-6 SEU
  // aluminum". Before the two-element cable spec below, which would take only
  // "2-2" and leave "-2-4 SER aluminum" as the type.
  /^\d{1,2}(?:-\d{1,2}(?:\/0)?){2,}\s+/,
  // Cable specs — "12-2 NM-B", "14-3 MC cable".
  /^\d{1,4}-\d(?![\d/])\s*/,
  // A hashed gauge — "#12 THHN".
  /^#\d{1,4}\s+/,
  // Raceway trade size or a plain measurement — "1-1/4\" EMT", "4\" square box".
  // An optional SECOND measurement is part of the size: a dual-size part like
  // "5\"/6\" wafer LED downlight" fits either opening. Without it the type came
  // out as "/6\" wafer LED downlight", a family of one that sorted to the top
  // of the Lighting shelf, away from the 4" row (found 2026-09-25).
  /^\d+(?:-\d+\/\d+)?(?:\/\d+)?"(?:\/\d+(?:-\d+\/\d+)?(?:\/\d+)?")?\s*/,
  // Feet — "4 ft LED strip fixture".
  /^[\d.]+\s*ft\s+/i,
  // Amperage — "20A breaker".
  /^\d{1,4}\s*A\s+/,
  // Transformer rating — "15 kVA dry-type transformer".
  /^\d+(?:\.\d+)?\s*kVA\s+/i,
  // Dimensions — "12x12 pull box" -> "pull box".
  /^\d+(?:\.\d+)?x\d+(?:\.\d+)?\s+/i,
  // A size after the name — "Bath exhaust fan, 50 CFM" -> "Bath exhaust fan".
  TRAILING,
];

/**
 * A material's name with its leading size removed — its TYPE.
 *
 * "#12 THHN" -> "THHN", "1/2\" EMT coupling" -> "EMT coupling",
 * "20A 2-Pole breaker" -> "2-Pole breaker".
 *
 * Null when the name has no leading size, or when removing it would leave
 * nothing behind. Both cases mean the row has no type to group under and should
 * be listed on its own.
 *
 * A tandem breaker — "15/20 tandem breaker" — is one of those: "15/20" is two
 * circuits in a slot rather than a size, `readSize` deliberately does not read
 * it as one, and so tandems list flat. They still cluster, because
 * materialOrder ranks the tandem class together ahead of single-pole.
 */
export function materialTypeName(name: string): string | null {
  const trimmed = name.trim();
  if (!hasSize(trimmed)) return null;
  for (const pattern of SIZE_PREFIXES) {
    const stripped = trimmed.replace(pattern, "").trim();
    if (stripped !== trimmed && stripped.length > 0) return stripped;
  }
  return null;
}
