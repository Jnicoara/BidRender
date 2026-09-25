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

const deviceBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: "Single-gang box",
    searchAliases: aliases("gem switch", DEVICE_BOX, "1g one gang plastic pvc"),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Single-gang metal box",
    searchAliases: aliases("gem switch", DEVICE_BOX, "1g one gang steel"),
    description: METAL_NOTE,
  },
  {
    ...each,
    name: "Double-gang box",
    searchAliases: aliases("2g two gang", DEVICE_BOX, "plastic pvc"),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Double-gang metal box",
    searchAliases: aliases("2g two gang", DEVICE_BOX, "steel"),
    description: METAL_NOTE,
  },
  {
    ...each,
    name: "Triple-gang box",
    searchAliases: aliases("3g three gang", DEVICE_BOX, "plastic pvc"),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Triple-gang metal box",
    searchAliases: aliases("3g three gang", DEVICE_BOX, "steel"),
    description: METAL_NOTE,
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
].map(({ gang, slang }) => ({
  ...each,
  name: `Masonry box, ${gang}`,
  searchAliases: aliases(slang, "block brick cmu concrete steel device deep"),
}));

const squareBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: '4" square box',
    // Universally "a 1900" — the one alias nobody's catalog can do without.
    searchAliases: aliases(
      "1900 four square 4in metal steel junction jbox j box"
    ),
  },
  {
    ...each,
    name: '4-11/16" square box',
    searchAliases: aliases(
      "4 11/16 five square 5 square jumbo metal steel junction jbox j box"
    ),
  },
  {
    ...each,
    name: '4" square mud ring',
    searchAliases: aliases(
      "1900 plaster ring cover raised device single gang 4in"
    ),
  },
  {
    ...each,
    name: '4-11/16" square mud ring',
    searchAliases: aliases(
      "4 11/16 plaster ring cover raised device gang five square"
    ),
  },
  // Moved from the pricing sheet, 2026-09-25.
  {
    ...each,
    name: '4" square extension ring',
    searchAliases: aliases("1900 4in deepen add depth steel box extension"),
  },
  {
    ...each,
    name: '4" square blank cover',
    searchAliases: aliases("1900 4in flat plate junction jbox j box steel lid"),
  },
  {
    ...each,
    name: '4-11/16" square blank cover',
    searchAliases: aliases(
      "4 11/16 five square flat plate junction jbox j box steel lid"
    ),
  },
];

const ceilingBoxes: BaselineMaterial[] = [
  {
    ...each,
    name: "Octagon box, plastic",
    // "pancake" moved to the shallow round box on 2026-09-25, which is the
    // part the word actually names.
    searchAliases: aliases("oct round ceiling light fixture new work pvc"),
    description: PLASTIC_NOTE,
  },
  {
    ...each,
    name: "Octagon box, metal",
    searchAliases: aliases("oct round ceiling light fixture steel"),
    description: METAL_NOTE,
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

const enclosures: BaselineMaterial[] = [
  {
    ...each,
    name: "Weatherproof box, single-gang",
    searchAliases: aliases(
      "wp outdoor exterior bell cast 1g one gang rain tight"
    ),
  },
  {
    ...each,
    name: "Weatherproof box, double-gang",
    searchAliases: aliases(
      "wp outdoor exterior bell cast 2g two gang rain tight"
    ),
  },
  {
    ...each,
    name: "Weatherproof box, triple-gang",
    searchAliases: aliases(
      "wp outdoor exterior bell cast 3g three gang rain tight"
    ),
  },
  {
    ...each,
    name: "Handy box",
    searchAliases: aliases(
      "utility 1900 shallow surface exposed steel single gang"
    ),
  },
  {
    ...each,
    name: "Floor box",
    searchAliases: aliases(
      "outlet monument poke through slab concrete brass tombstone"
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
        "bell weatherproof outdoor aluminum single gang shallow"
      ),
      description: "Shallow. FD is the deep version.",
    },
    {
      ...each,
      name: `${size} FD cast box`,
      searchAliases: aliases(
        sizeSlang,
        "bell weatherproof outdoor aluminum single gang deep"
      ),
      description: "Deep. FS is the shallow version.",
    },
  ];
});

const pullBoxes: BaselineMaterial[] = [
  "4x4",
  "6x6",
  "8x8",
  "12x12",
  "16x16",
  "24x24",
].map(size => ({
  ...each,
  name: `${size} pull box`,
  searchAliases: aliases(
    size.replace("x", " x "),
    "junction jbox j box nema screw cover trough wireway"
  ),
}));

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
];

export const BOXES: BaselineMaterial[] = [
  ...deviceBoxes,
  ...oldWorkBoxes,
  ...masonryBoxes,
  ...squareBoxes,
  ...ceilingBoxes,
  ...enclosures,
  ...castBoxes,
  ...pullBoxes,
  ...roughIn,
];
