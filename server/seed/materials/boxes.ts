/**
 * Boxes.
 *
 * ── Plastic is the unsuffixed one, on purpose ────────────────────────────────
 * "Single-gang box" already exists in the shipped catalog and the starter
 * assemblies reference it by that name, so it keeps it and means the plastic
 * one — which is also what an estimator means nine times out of ten on a
 * residential job. The steel version says "metal" in its name and both carry a
 * description, because that is exactly the pair a user could pick wrong from a
 * list and never notice until the inspector does.
 */
import { aliases, UNPRICED, type BaselineMaterial } from "./types";

const each = {
  unitOfSale: "each" as const,
  costPerUnit: UNPRICED,
  category: "Boxes" as const,
};

/** Trade slang shared by every rough-in device box, whatever its gang count. */
const DEVICE_BOX = "device nail on new work old work rough in remodel cut in";

const PLASTIC_NOTE = "Plastic. The steel version is a separate item.";
const METAL_NOTE = "Steel. The plastic version is a separate item.";

/*
  Brand names as ALIASES only, the owner's choice from the boxes audit
  (2026-09-27, references/materials-track-c-plan.md question F) — the same
  pattern as the lighting audit. The names stay generic (CLAUDE.md § Brands):
  these only let a search for the brand a counter calls the part by find it.
*/
const PLASTIC_BRANDS = "carlon";
const STEEL_BRANDS = "raco steel city";
const WP_BRANDS = "red dot bell";
const CAST_BRANDS = "crouse hinds red dot";

const deviceBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: "Single-gang box",
    searchAliases: aliases(
      "gem switch",
      DEVICE_BOX,
      "1g one gang plastic pvc",
      PLASTIC_BRANDS
    ),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Single-gang metal box",
    searchAliases: aliases(
      "gem switch",
      DEVICE_BOX,
      "1g one gang steel",
      STEEL_BRANDS
    ),
    description: METAL_NOTE,
  },
  {
    ...each,
    name: "Double-gang box",
    searchAliases: aliases(
      "2g two gang",
      DEVICE_BOX,
      "plastic pvc",
      PLASTIC_BRANDS
    ),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Double-gang metal box",
    searchAliases: aliases("2g two gang", DEVICE_BOX, "steel", STEEL_BRANDS),
    description: METAL_NOTE,
  },
  {
    ...each,
    name: "Triple-gang box",
    searchAliases: aliases(
      "3g three gang",
      DEVICE_BOX,
      "plastic pvc",
      PLASTIC_BRANDS
    ),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Triple-gang metal box",
    searchAliases: aliases("3g three gang", DEVICE_BOX, "steel", STEEL_BRANDS),
    description: METAL_NOTE,
  },
  // Boxes audit, 2026-09-27: the 22+ cubic inch box a GFCI, a dimmer or a
  // smart switch needs room in. Plastic, like every unsuffixed device box.
  {
    ...each,
    name: "Single-gang box, deep",
    searchAliases: aliases(
      "1g one gang",
      DEVICE_BOX,
      "plastic pvc extra large cubic inch cu in box fill gfci smart",
      PLASTIC_BRANDS
    ),
  },
  {
    ...each,
    name: "Double-gang box, deep",
    searchAliases: aliases(
      "2g two gang",
      DEVICE_BOX,
      "plastic pvc extra large cubic inch cu in box fill",
      PLASTIC_BRANDS
    ),
  },
  // Moved from the pricing sheet, 2026-09-25. Plastic, like every unsuffixed
  // device box in this file.
  {
    ...each,
    name: "4-gang box",
    searchAliases: aliases("4g four gang quad", DEVICE_BOX, "plastic pvc"),
  },
  {
    ...each,
    name: "5-gang box",
    searchAliases: aliases("5g five gang", DEVICE_BOX, "plastic pvc"),
  },
];

/**
 * Old-work boxes clamp to the drywall with wings or ears instead of nailing
 * to a stud — a different part from the new-work box, bought for remodels.
 * Moved from the pricing sheet, 2026-09-25.
 */
const OLD_WORK = "remodel cut in retrofit wings ears swing clamp drywall";
const oldWorkBoxes: BaselineMaterial[] = [
  { gang: "Single-gang", slang: "1g one gang" },
  { gang: "Double-gang", slang: "2g two gang" },
  { gang: "Triple-gang", slang: "3g three gang" },
].map(({ gang, slang }) => ({
  ...each,
  name: `${gang} old-work box`,
  searchAliases: aliases(slang, OLD_WORK, "oldwork device plastic"),
}));

const masonryBoxes: BaselineMaterial[] = [
  { gang: "single-gang", slang: "1g one gang" },
  { gang: "double-gang", slang: "2g two gang" },
  // Boxes audit, 2026-09-27.
  { gang: "triple-gang", slang: "3g three gang" },
].map(({ gang, slang }) => ({
  ...each,
  name: `Masonry box, ${gang}`,
  searchAliases: aliases(slang, "block brick cmu concrete steel device deep"),
}));

/*
  ── Depth and gang are written into the name only on the ADDED row ──────────
  `4" square box`, `4-11/16" square box` and both blank covers are named by
  shared/runFittingMaterials.ts as the tee box and cover, and `4" square box`
  by a starter assembly, so the boxes audit (2026-09-27) left every existing
  name alone and said what it is in a description instead. The existing box is
  the 1-1/2" deep one and the existing mud ring is single-gang; the rows added
  beside them carry the difference in their names.

  Mud ring DEPTHS stay merged — "Plaster ring, 1/2 in" and "5/8 in" were folded
  into the one ring on 2026-09-25 (pricing/movedFromSheet.ts). Gang count is
  split because it is functional: two devices need a 2-gang ring.
*/
const SQUARE_BOX = "junction jbox j box metal steel";
/** Surface covers for exposed work — a device mounts straight to the cover. */
const RAISED_COVER = "industrial exposed surface work shop garage steel";
const squareBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: '4" square box',
    // Universally "a 1900" — the one alias nobody's catalog can do without.
    searchAliases: aliases("1900 four square 4in", SQUARE_BOX, STEEL_BRANDS),
    description: '1-1/2" deep. The 2-1/8" deep box is a separate item.',
  },
  {
    ...each,
    name: '4" square box, 2-1/8" deep',
    searchAliases: aliases(
      "1900 four square 4in 21/8 extra box fill",
      SQUARE_BOX,
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4-11/16" square box',
    searchAliases: aliases(
      "4 11/16 five square 5 square jumbo",
      SQUARE_BOX,
      STEEL_BRANDS
    ),
    // How it is normally bought; said so the 4" pair's depth note is not the
    // only one on the shelf (plan § 6, 2026-09-27).
    description: '2-1/8" deep.',
  },
  {
    ...each,
    name: '4" square mud ring',
    searchAliases: aliases(
      "1900 plaster ring cover raised device single gang 1g 4in",
      STEEL_BRANDS
    ),
    description: "Single-gang. The 2-gang ring is a separate item.",
  },
  {
    ...each,
    name: '4" square mud ring, 2-gang',
    searchAliases: aliases(
      "1900 plaster ring cover raised device two double 2g 4in",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4" square mud ring, fixture',
    searchAliases: aliases(
      "1900 plaster ring round opening light ceiling 4in",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4-11/16" square mud ring',
    searchAliases: aliases(
      "4 11/16 plaster ring cover raised device single gang 1g five square",
      STEEL_BRANDS
    ),
    description: "Single-gang. The 2-gang ring is a separate item.",
  },
  {
    ...each,
    name: '4-11/16" square mud ring, 2-gang',
    searchAliases: aliases(
      "4 11/16 plaster ring cover raised device two double 2g five square",
      STEEL_BRANDS
    ),
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...each,
    name: '4" square extension ring',
    searchAliases: aliases(
      "1900 4in deepen add depth steel box extension",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4-11/16" square extension ring',
    searchAliases: aliases(
      "4 11/16 five square deepen add depth steel box extension",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4" square blank cover',
    searchAliases: aliases(
      "1900 4in flat plate junction jbox j box steel lid",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4-11/16" square blank cover',
    searchAliases: aliases(
      "4 11/16 five square flat plate junction jbox j box steel lid",
      STEEL_BRANDS
    ),
  },
  // Raised covers, boxes audit 2026-09-27.
  ...[
    { kind: "duplex", slang: "receptacle outlet" },
    { kind: "single toggle", slang: "switch 1 one" },
    { kind: "decorator", slang: "decora gfci gfi rocker paddle" },
    { kind: "two toggle", slang: "switch 2 double" },
  ].map(({ kind, slang }) => ({
    ...each,
    name: `4" square raised cover, ${kind}`,
    searchAliases: aliases("1900 4in", slang, RAISED_COVER, STEEL_BRANDS),
  })),
  ...[
    { kind: "2-gang decorator", slang: "decora gfci gfi rocker paddle 2g" },
    { kind: "two duplex", slang: "receptacle outlet double 2g" },
  ].map(({ kind, slang }) => ({
    ...each,
    name: `4-11/16" square raised cover, ${kind}`,
    searchAliases: aliases(
      "4 11/16 five square",
      slang,
      RAISED_COVER,
      STEEL_BRANDS
    ),
  })),
];

const ceilingBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: "Octagon box, plastic",
    // "pancake" moved to the shallow round box on 2026-09-25, which is the
    // part the word actually names.
    searchAliases: aliases(
      "oct round ceiling light fixture new work pvc",
      PLASTIC_BRANDS
    ),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Octagon box, metal",
    searchAliases: aliases(
      "oct round ceiling light fixture steel",
      STEEL_BRANDS
    ),
    description:
      'Steel, 1-1/2" deep. The plastic and the 2-1/8" deep boxes are separate items.',
  },
  // Boxes audit, 2026-09-27 — same depth split as the 4" square box.
  {
    ...each,
    name: 'Octagon box, metal, 2-1/8" deep',
    searchAliases: aliases(
      "oct round ceiling light fixture steel 21/8 extra box fill",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4" round blank cover',
    searchAliases: aliases(
      "octagon oct ceiling flat plate lid junction jbox j box steel abandoned fixture",
      STEEL_BRANDS
    ),
  },
  {
    ...each,
    name: '4" round extension ring',
    searchAliases: aliases(
      "octagon oct ceiling deepen add depth furred steel box extension",
      STEEL_BRANDS
    ),
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...each,
    name: "Shallow round box",
    searchAliases: aliases("pancake 1/2 inch half deep ceiling light steel"),
  },
  {
    ...each,
    name: "Old-work ceiling box",
    searchAliases: aliases(
      "round light fixture remodel cut in retrofit oldwork plastic"
    ),
  },
  {
    ...each,
    name: "Ceiling fan brace box",
    searchAliases: aliases(
      "retrofit saf-t-brace expandable adjustable mounting bar joist old work remodel paddle rated"
    ),
  },
  {
    ...each,
    name: "Retrofit bar hanger",
    searchAliases: aliases(
      "remodel old work joist expandable can recessed support"
    ),
  },
  {
    ...each,
    name: "Fan-rated ceiling box",
    searchAliases: aliases(
      "brace octagon oct round light pancake saf-t-brace support paddle"
    ),
  },
];

const WP = "wp outdoor exterior rain tight";
const enclosures: BaselineMaterial[] = [
  {
    ...each,
    name: "Weatherproof box, single-gang",
    searchAliases: aliases(WP, "cast 1g one gang", WP_BRANDS),
  },
  {
    ...each,
    name: "Weatherproof box, double-gang",
    searchAliases: aliases(WP, "cast 2g two gang", WP_BRANDS),
  },
  {
    ...each,
    name: "Weatherproof box, triple-gang",
    searchAliases: aliases(WP, "cast 3g three gang", WP_BRANDS),
  },
  // Boxes audit, 2026-09-27. The device covers (flip, in-use) are on Wall
  // Plates & Misc; these close a box that has no device in it.
  {
    ...each,
    name: "Weatherproof round box",
    searchAliases: aliases(
      WP,
      "cast 4in 4 inch light fixture camera flood",
      WP_BRANDS
    ),
  },
  {
    ...each,
    name: "Weatherproof blank cover, single-gang",
    searchAliases: aliases(WP, "flat plate lid 1g one gang fs", WP_BRANDS),
  },
  {
    ...each,
    name: "Weatherproof blank cover, double-gang",
    searchAliases: aliases(WP, "flat plate lid 2g two gang fs", WP_BRANDS),
  },
  {
    ...each,
    name: "Weatherproof lampholder cover",
    searchAliases: aliases(
      WP,
      "keyless porcelain socket bulb light flood round",
      WP_BRANDS
    ),
  },
  // PVC LAST in the name, and that was measured: led by "PVC", this row took
  // the top of a bare "pvc" search from the conduit (materialSearchRank.test.ts).
  {
    ...each,
    name: "Weatherproof box, single-gang, PVC",
    searchAliases: aliases(
      WP,
      "fs plastic nonmetallic hub glue solvent 1g one gang",
      PLASTIC_BRANDS
    ),
  },
  // Plan § 6, Tier 2.5 (2026-09-27): every exterior light or receptacle on
  // vinyl siding sits on one, and nothing else in the catalog is one.
  {
    ...each,
    name: "Siding mounting block",
    searchAliases: aliases(
      "vinyl jblock j-block split mount kit exterior outdoor light fixture receptacle lap"
    ),
  },
  {
    ...each,
    name: "Handy box",
    searchAliases: aliases(
      "utility 1900 shallow surface exposed steel single gang"
    ),
  },
  // Plan § 6, Tier 2.5 (2026-09-27): the handy box shipped with no cover, and
  // the 4" square raised covers do not fit it, so it could not be finished.
  ...[
    { kind: "blank", slang: "flat plate lid" },
    { kind: "duplex", slang: "receptacle outlet" },
    { kind: "single toggle", slang: "switch 1 one" },
    { kind: "decorator", slang: "decora gfci gfi rocker paddle" },
  ].map(({ kind, slang }) => ({
    ...each,
    name: `Handy box cover, ${kind}`,
    searchAliases: aliases(
      "utility industrial raised surface exposed steel",
      slang
    ),
  })),
  {
    ...each,
    name: "Floor box",
    // "brass" moved to the cover on 2026-09-27: it names the lid, and on the
    // box it would lead a search for the cover with the box.
    searchAliases: aliases(
      "outlet monument poke through slab concrete tombstone"
    ),
    description: "The box only. The cover is a separate item.",
  },
  {
    ...each,
    name: "Floor box cover",
    searchAliases: aliases(
      "brass flip lid duplex outlet plate flush carpet flange"
    ),
  },
];

/**
 * Cast boxes are sized by the conduit that lands on them, not by gang count —
 * same pattern as every other threaded fitting, which is why they stop at 1".
 */
const castBoxes: BaselineMaterial[] = ['1/2"', '3/4"', '1"'].flatMap(size => {
  const sizeSlang =
    size === '1/2"'
      ? "1/2 half 0.5"
      : size === '3/4"'
        ? "3/4 three quarter 0.75"
        : "1 one inch";
  return [
    {
      ...each,
      name: `${size} FS cast box`,
      searchAliases: aliases(
        sizeSlang,
        "bell weatherproof outdoor aluminum single gang shallow",
        CAST_BRANDS
      ),
      description: "Shallow. FD is the deep version.",
    },
    {
      ...each,
      name: `${size} FD cast box`,
      searchAliases: aliases(
        sizeSlang,
        "bell weatherproof outdoor aluminum single gang deep",
        CAST_BRANDS
      ),
      description: "Deep. FS is the shallow version.",
    },
  ];
});
// Boxes audit, 2026-09-27: the 2-gang FS. No 2-gang FD — rarer, held.
const twoGangCastBoxes: BaselineMaterial[] = [
  { size: '1/2"', slang: "1/2 half 0.5" },
  { size: '3/4"', slang: "3/4 three quarter 0.75" },
].map(({ size, slang }) => ({
  ...each,
  name: `${size} FS cast box, 2-gang`,
  searchAliases: aliases(
    slang,
    "bell weatherproof outdoor aluminum two double 2g shallow",
    CAST_BRANDS
  ),
}));

/*
  The six squares are the indoor screw-cover boxes `pullBoxFor`
  (shared/runFittingMaterials.ts) proposes at a bend, by exact name, so they
  keep their names. The NEMA 3R rows beside three of them are for outdoor
  runs; the takeoff never proposes one, the estimator picks it. Adding a new
  SIZE here would change what the takeoff proposes, which is why the boxes
  audit held 10x10, 18x18 and up (references/materials-track-c-plan.md).
*/
const HAS_3R = new Set(["6x6", "8x8", "12x12"]);
const pullBoxes: BaselineMaterial[] = [
  "4x4",
  "6x6",
  "8x8",
  "12x12",
  "16x16",
  "24x24",
].flatMap(size => {
  const indoor: BaselineMaterial = {
    ...each,
    name: `${size} pull box`,
    searchAliases: aliases(
      size.replace("x", " x "),
      "junction jbox j box nema screw cover trough wireway steel"
    ),
    // Every size says what it is; only the ones with a 3R sibling point at it
    // (plan § 6, 2026-09-27 — the other three said nothing).
    description: HAS_3R.has(size)
      ? "Screw cover, NEMA 1 (indoor). The NEMA 3R box is a separate item."
      : "Screw cover, NEMA 1 (indoor).",
  };
  if (!HAS_3R.has(size)) return [indoor];
  return [
    indoor,
    {
      ...each,
      name: `${size} pull box, NEMA 3R`,
      searchAliases: aliases(
        size.replace("x", " x "),
        "junction jbox j box screw cover outdoor exterior weatherproof wp raintight rain tight steel"
      ),
    },
  ];
});

/*
  Nonmetallic junction boxes for PVC runs, outdoors and underground. Their own
  rows rather than a variant of the steel pull boxes, so `pullBoxFor` keeps
  proposing steel (boxes audit, 2026-09-27, question D).

  Named "PVC pull box", not "PVC junction box", and that was measured: with
  "junction box" in the NAME, a search for "j box" led with all four of these
  ahead of the steel 1900 an estimator means by it. Named like the steel rows,
  they tie with them on the alias instead and sort in beside them by size.
*/
const pvcPullBoxes: BaselineMaterial[] = ["4x4", "6x6", "8x8", "12x12"].map(
  size => ({
    ...each,
    name: `${size} PVC pull box`,
    searchAliases: aliases(
      size.replace("x", " x "),
      "junction jbox j box plastic nonmetallic nema 4x outdoor underground screw cover",
      PLASTIC_BRANDS
    ),
    description: "Nonmetallic, NEMA 4X.",
  })
);

/*
  ── Rough-in accessories ──────────────────────────────────────────────────────
  Moved from the pricing sheet, 2026-09-25. What goes on or around a box while
  it is roughed in and trimmed out.
*/
const NAIL_PLATE = "stud guard protector shield steel cable protection";
const roughIn: BaselineMaterial[] = [
  ...['1-1/2"', '3"', '5"'].map(size => ({
    ...each,
    name: `${size} nail plate`,
    searchAliases: aliases(size.replace('"', ""), NAIL_PLATE),
  })),
  {
    ...each,
    name: "Single-gang box extender",
    searchAliases: aliases(
      "extension ring goof ring tile backsplash recessed deep device",
      // The pricing sheet's "Wall plate extender" is this part (2026-09-25).
      // Not the full phrase: "wall plate" is another row's name, and the
      // catalog test forbids aliasing to one (materialsCatalog.test.ts).
      "plate extender"
    ),
  },
  {
    ...each,
    name: "Drywall repair ring",
    searchAliases: aliases("oversize cut out fix bad hole sheetrock"),
  },
  {
    ...each,
    name: "Low-voltage mud ring",
    searchAliases: aliases(
      "lv bracket old work data cat6 tv low voltage mounting open back"
    ),
  },
  {
    ...each,
    name: "Panel knockout seal",
    searchAliases: aliases("ko plug closure cap hole snap in"),
  },
  {
    ...each,
    name: "Steel stud grommet",
    searchAliases: aliases("bushing insert metal stud hole cable protect"),
  },
  // Boxes audit, 2026-09-27. Holds a box between studs, commercial metal-stud
  // work. The T-bar version is "Grid box bracket", on Strut & Supports.
  {
    ...each,
    name: "Box support bracket",
    searchAliases: aliases(
      "stud span between studs h bar hanger metal stud commercial caddy garvin"
    ),
  },
];

export const BOXES: BaselineMaterial[] = [
  ...deviceBoxes,
  ...oldWorkBoxes,
  ...masonryBoxes,
  ...squareBoxes,
  ...ceilingBoxes,
  ...enclosures,
  ...castBoxes,
  ...twoGangCastBoxes,
  ...pullBoxes,
  ...pvcPullBoxes,
  ...roughIn,
];
