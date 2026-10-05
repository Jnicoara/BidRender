/**
 * What a counted mark looks like on the drawing: its shape, its colour, and
 * how big it is at a given zoom.
 *
 * Pure, and shared, for the same reason the pricing engine is: the legend in
 * the panel and the mark on the page must agree about what a count looks like,
 * and two implementations of "the colour for this group" is two chances to
 * disagree — in the one feature whose entire job is telling things apart.
 *
 * ── Shape and colour belong to the GROUP ─────────────────────────────────────
 * Decided 2026-09-18 (references/plan-viewer-overhaul.md § 5e). The earlier
 * plan derived shape from the assembly's Category, "which every stamp already
 * stores" — true while every mark carried an assembly, and false the moment
 * level 1 shipped. A category-derived shape covers three of the four levels and
 * leaves plain counts with nothing; a group-derived one covers all four,
 * because every level IS a group.
 *
 * The category still decides where it can: an assembly-backed count keeps a
 * shape that means something across jobs. Everything else takes a stable
 * assignment from its own id.
 *
 * ── Nothing here is stored, and that is deliberate for now ───────────────────
 * Both are computed from what the group already holds, so there is no column
 * to migrate and no setup to skip. § 5e's rule stands: a feature nobody
 * configures must work without being configured. An override — a colour picker
 * on a count — becomes two nullable columns on `takeoff_groups` when somebody
 * asks for it, and this file becomes the DEFAULT rather than the answer.
 */
import { CATEGORY_FAMILY, FAMILY_SHAPE } from "./deviceFamily";
import { markStatusOf, type MarkStatus } from "./markStatus";

// ─── Shapes ───────────────────────────────────────────────────────────────────

/**
 * Six shapes, and the count is not an accident.
 *
 * They have to be told apart at a glance, at a size measured in millimetres, on
 * top of a black-on-white drawing that is already full of lines. Past a handful
 * the differences stop being differences: a heptagon and an octagon are both "a
 * blob with corners" at 14 pixels, and a shape nobody can name is a shape
 * nobody can match to a legend.
 *
 * The sixth, `rect` — a 2:1 rectangle — joined 2026-10-01 for panels and
 * equipment, which plans draw as long rectangles (pin plan § 2, decision 2).
 * Looked at on screen at the 10 px floor beside a square before adopting it.
 */
export const MARK_SHAPES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "rect",
] as const;
export type MarkShape = (typeof MARK_SHAPES)[number];

/**
 * Each library category's shape, through its device family
 * (shared/deviceFamily.ts) — so the category default and a count's own family
 * cannot disagree about what "lighting" looks like.
 *
 * **Overrides § 5e's map (2026-10-01, pin plan § 2):** lighting was a triangle,
 * panels a square, equipment a diamond, low voltage a hexagon. Now lighting is
 * a square, panels and equipment a wide rectangle, data a triangle (the plan
 * symbol for a data outlet), and the diamond belongs to switches.
 *
 * Used for a mark whose count is NOT in the bid's pin map; every listed count
 * takes its shape from `pinStylesForBid`, which reads the count's own name
 * first.
 */
function shapeForCategory(category: string): MarkShape | undefined {
  const family = CATEGORY_FAMILY[category];
  return family ? FAMILY_SHAPE[family] : undefined;
}

// ─── Colours ──────────────────────────────────────────────────────────────────

/**
 * Six colours that are not already spoken for on this drawing.
 *
 * Three are unavailable and each for a hard reason:
 *   #F5C518  conduit yellow — and every warning in the app
 *   #4ADE80  cable green
 *   #34D399  the plan reader's high-confidence proposal
 *
 * **Stamps and traced runs must never share a colour** (§ 5e). A field of marks
 * in conduit yellow on top of a traced conduit run is the exact confusion this
 * whole pass exists to remove, and it is what shipped before it.
 *
 * Chosen to stay apart from each other AND from a black-on-white drawing: mid
 * saturation, none of them near white or near black, and no two adjacent in
 * hue. Red is included and is the one to watch — it reads as "wrong" to some
 * people — so it sits last, where the fewest counts will reach it.
 */
export const MARK_COLORS = [
  "#60A5FA", // blue
  "#F472B6", // pink
  "#A78BFA", // violet
  "#FB923C", // orange
  "#22D3EE", // cyan
  "#F87171", // red
] as const;
export type MarkColor = (typeof MARK_COLORS)[number];

/**
 * What each color is CALLED, for a label or a screen reader — American
 * spelling on screen (owner, 2026-09-27). Typed as a Record over the palette,
 * so a color added above without a name does not compile.
 */
export const MARK_COLOR_NAMES: Record<MarkColor, string> = {
  "#60A5FA": "Blue",
  "#F472B6": "Pink",
  "#A78BFA": "Violet",
  "#FB923C": "Orange",
  "#22D3EE": "Cyan",
  "#F87171": "Red",
};

/** Colours this drawing has already given a meaning to. Never in the palette. */
export const RESERVED_COLORS = ["#F5C518", "#4ADE80", "#34D399"] as const;

// ─── Assignment ───────────────────────────────────────────────────────────────

/**
 * A small, stable spread from an id.
 *
 * Ids are consecutive, so using one directly would give every count on a bid a
 * neighbouring colour — six groups made in a row would walk the palette in
 * order, which is fine, and then the seventh repeats the first. Multiplying by
 * a number coprime with both list lengths spreads them instead, and being pure
 * arithmetic it is stable: the same group is the same colour on every machine,
 * every session, with nothing stored.
 */
function spread(id: number, length: number): number {
  // 7 is coprime with 5 and 6, the two list lengths, so neither cycles early.
  //
  // The modulo is written the long way rather than with Math.abs, and a test
  // is why. `Math.abs` folds negatives onto positives, so the negated fallback
  // key in markAppearance — the thing that is supposed to keep group 8 and
  // assembly 8 apart — landed them on the same shape AND the same colour. The
  // comment claiming otherwise was wrong before this line was.
  const n = Math.trunc(id) * 7;
  return ((n % length) + length) % length;
}

/** What shape this count is drawn as. */
export function shapeFor(group: {
  id: number;
  assemblyCategory?: string | null;
}): MarkShape {
  const fromCategory = group.assemblyCategory
    ? shapeForCategory(group.assemblyCategory)
    : undefined;
  return fromCategory ?? MARK_SHAPES[spread(group.id, MARK_SHAPES.length)];
}

/** What colour this count is drawn in. */
export function colorFor(group: { id: number }): MarkColor {
  return MARK_COLORS[spread(group.id, MARK_COLORS.length)];
}

/**
 * Everything about how one mark looks, from what the mark itself carries.
 *
 * ── Why the key is not simply the group id ───────────────────────────────────
 * It is, for every mark placed since phase 6. A mark written BEFORE groups
 * existed and not yet reached by the backfill has none, and those still have to
 * look like something — and, more to the point, all the marks of one such count
 * have to look like the SAME something, or the drawing invents a difference
 * that is not there. So the assembly is the fallback key, negated to keep it
 * from colliding with a group id of the same number.
 *
 * A mark with neither falls to 0 and shares its appearance with any other in
 * the same position. That is the honest answer: nothing about it says what it
 * is counting, so nothing here can say it is different.
 */
export function markAppearance(
  mark: {
    groupId: number | null;
    assemblyId: number | null;
    assemblyCategory?: string | null;
    /** `takeoff_stamps.status` — NULL is new (shared/markStatus.ts). */
    status?: string | null;
  },
  /**
   * The bid's letters and first-use colours (`pinStylesForBid`,
   * shared/pinLetters.ts). Since 2026-10-01 the colour comes from there for
   * every count the bid lists, so two counts on one bid stop sharing a colour
   * by hash; the id hash below is left for a mark whose count is not in it.
   * Pass the SAME map to the drawing and the panel, or a swatch and its pins
   * disagree.
   */
  pins?: ReadonlyMap<
    number,
    { letter: string; color: MarkColor; shape: MarkShape }
  >
): {
  shape: MarkShape;
  color: MarkColor;
  letter: string | null;
  status: StatusLook;
} {
  const id = mark.groupId ?? (mark.assemblyId !== null ? -mark.assemblyId : 0);
  const pin = mark.groupId !== null ? pins?.get(mark.groupId) : undefined;
  return {
    status: statusLook(mark.status),
    // The COUNT's shape (its own name first), not its assembly's category:
    // two items on one assembly can be a duplex and a switch.
    shape:
      pin?.shape ?? shapeFor({ id, assemblyCategory: mark.assemblyCategory }),
    color: pin?.color ?? colorFor({ id }),
    letter: pin?.letter ?? null,
  };
}

/**
 * How a mark's STATUS is drawn (pin plan § 7, decision 8):
 *
 * | Status   | Fill                     | Extra                 |
 * | -------- | ------------------------ | --------------------- |
 * | new      | filled (~45%)            | —                     |
 * | existing | hollow, SOLID outline    | —                     |
 * | remove   | hollow                   | an X through it       |
 * | relocate | filled                   | an arrow badge        |
 *
 * Hollow is always a SOLID outline: dashed already means provisional (an
 * unconfirmed match, § 8), and "existing" must never be told apart from
 * "unconfirmed" by fill alone. The card says the split in words too
 * (shared/markStatus.ts), because a fill does not survive a printout.
 */
export type StatusLook = {
  status: MarkStatus;
  filled: boolean;
  cross: boolean;
  arrow: boolean;
  /**
   * `unconfirmed` (0103): DASHED and hollow — the drawing's one language for
   * provisional (§ 8). Hollow-solid is "existing"; the two never share a
   * line style, so they are never told apart by fill alone.
   */
  dashed: boolean;
};

export function statusLook(value: string | null | undefined): StatusLook {
  const status = markStatusOf(value);
  return {
    status,
    filled: status === "new" || status === "relocate",
    cross: status === "remove",
    arrow: status === "relocate",
    dashed: status === "unconfirmed",
  };
}

/**
 * Whether a pin of this on-screen diameter can carry its letter. Below it the
 * letter is noise on the symbol and shape + colour remain (pin plan § 3).
 * Looked at 2026-10-01 on the Blueridge set at 1536 px wide: at 92% a pin is
 * 16 px across and its "L" reads in a screenshot; at Fit (19%) the pin is at
 * the 10 px floor and no letter is drawn. 14 sits between the two and is a
 * judgement, not a measured edge — step 0 of the pin plan still owes that.
 */
export const LETTER_MIN_PX = 14;

/** Font size for a letter inside a pin of radius `r`, by its length. */
export function letterSize(r: number, letter: string): number {
  const scale =
    letter.length <= 1
      ? 1.15
      : letter.length === 2
        ? 0.9
        : letter.length === 3
          ? 0.68
          : 0.56;
  return r * scale;
}

/**
 * Where a letter sits in a shape, and how big — the shape's own centre is not
 * always where there is room. A triangle (`markPath`: apex at r above the
 * centre, base at r/2 below) is narrow at the middle, so a letter centred
 * there spilled over the base of a 20 px swatch (seen 2026-10-01). It goes
 * lower and smaller, into the wide part.
 */
export function letterFit(
  shape: MarkShape,
  r: number,
  letter: string
): { dy: number; size: number } {
  const size = letterSize(r, letter);
  if (shape === "triangle") return { dy: r * 0.12, size: size * 0.72 };
  // A 2:1 rectangle is only 0.89r tall (`markPath`), so a letter sized for
  // the circle would stand out of it top and bottom.
  if (shape === "rect") return { dy: 0, size: Math.min(size, r * 0.8) };
  return { dy: 0, size };
}

// ─── Traced runs ──────────────────────────────────────────────────────────────

/**
 * The two raceway kinds, drawn as line STYLE rather than as colour.
 *
 * ── Why the swap ────────────────────────────────────────────────────────────
 * Colour used to mean type: yellow conduit, green cable. That spends the
 * strongest grouping channel there is on a two-state fact, and leaves nothing
 * to say which of fifteen lines belong together — so three runs on a sheet
 * were the same colour, the same name, and indistinguishable on the drawing.
 *
 * Type is a permanent property of the thing and belongs in a channel that
 * cannot be reassigned. Grouping is a relationship between things and needs
 * many distinct values. Solid against dashed is a perfectly good two-state
 * channel, and it is how these are drawn on paper anyway.
 */
export const RUN_DASH: Record<"conduit" | "cable", string | undefined> = {
  /** Continuous, like the pipe. */
  conduit: undefined,
  /** Broken, like the sheath markings on a reel. */
  cable: "10 6",
};

/**
 * Colour a run by its TYPE, so runs of one kind read as one kind.
 *
 * Six homeruns sharing a colour is one useful fact. Fifteen colours for
 * fifteen runs is none — which is why this keys on the type rather than on the
 * run, and why the palette is the same one the counted marks use: a drawing
 * should not have two colour vocabularies on it.
 *
 * ── An untyped run keeps the old colours ────────────────────────────────────
 * A run traced before the palette existed has no type, so there is nothing to
 * group it by and it falls back to the yellow or green it has always been.
 * That is honest rather than tidy: inventing a group colour for a run with no
 * group would assert a relationship that does not exist.
 */
export const LEGACY_RUN_COLOR: Record<"conduit" | "cable", string> = {
  conduit: "#F5C518",
  cable: "#4ADE80",
};

/**
 * Which colour each run type gets ON ONE BID: the types in the order they
 * were first used there (T14, 2026-09-26).
 *
 * ── Why per bid, and not hashed from the id ─────────────────────────────────
 * Hashing the id into six colours put types 1 and 7 on the same colour, so
 * two types on one sheet could be drawn identically — the "which line is
 * which" fault colour-by-type exists to remove. Handing colours out in order
 * of first use means the first six types on a bid never share one.
 *
 * ── What it costs ────────────────────────────────────────────────────────────
 * A type can be a different colour on another bid, and deleting every run of
 * the earliest type moves the others up one. Both are accepted: colour has to
 * separate the lines on THIS drawing, and there is no stored colour to keep
 * stable yet. When a type carries a chosen colour (Part B, not built), that
 * colour follows it to every bid and only unchosen types take a slot here.
 *
 * Returned by `takeoffRuns.typeColors`, which `refreshRuns` invalidates, so a
 * new type's first run moves it from "next colour" to its own slot.
 *
 * ── Keyed by the RESOLVED type, and `sameAs` is why ─────────────────────────
 * Editing a shipped type forks it, and runs keep the shipped id while the
 * picker lists the fork (`shared/runTypeLookup.ts`). Keyed by raw id, the
 * picker called the fork "not on this bid" beside blue lines of that very
 * type — seen on screen 2026-09-26. So `order` holds resolved ids, and
 * `sameAs` maps each stored id that resolves elsewhere to the id it means.
 *
 * ── `chosen`: a color somebody picked (Part B, owner 2026-09-27) ────────────
 * `takeoff_run_types.color` (0088), keyed by resolved id, for every type the
 * company has — not only the ones on this bid, because a chosen color follows
 * its type everywhere and the picker shows it before the type is traced.
 * NULL (absent here) is automatic: the first-use slot above.
 */
export type RunTypeColors = {
  order: readonly number[];
  sameAs: Readonly<Record<number, number>>;
  chosen: Readonly<Record<number, string>>;
};

/** Nothing on the bid yet: every type would take the first colour. */
export const NO_RUN_TYPE_COLORS: RunTypeColors = {
  order: [],
  sameAs: {},
  chosen: {},
};

/** Whether a stored value is one of the six — anything else is not drawn. */
export function isMarkColor(value: unknown): value is MarkColor {
  return (MARK_COLORS as readonly unknown[]).includes(value);
}

/** The color a type CHOSE, if it chose one the palette still holds. */
export function chosenRunTypeColor(
  runTypeId: number,
  colors: Pick<RunTypeColors, "sameAs" | "chosen">
): MarkColor | null {
  const value = colors.chosen[runTypeColorKey(runTypeId, colors)];
  return isMarkColor(value) ? value : null;
}

/** The colour key of a type id: what it resolves to, or itself. */
export function runTypeColorKey(
  runTypeId: number,
  colors: Pick<RunTypeColors, "sameAs">
): number {
  return colors.sameAs[runTypeId] ?? runTypeId;
}

/**
 * The order types were first used, from a bid's run rows. Ids increase with
 * creation, so a type's first use is its lowest run id. A suggestion nobody
 * accepted is not a use; an untyped run has no type to order. `keyOf` turns a
 * stored id into the type it means, so a fork and its shipped row are one.
 */
export function runTypeColorOrder(
  runs: readonly {
    id: number;
    runTypeId: number | null;
    isSuggestion: boolean;
  }[],
  keyOf: (runTypeId: number) => number = id => id
): number[] {
  const first = new Map<number, number>();
  for (const run of runs) {
    if (run.runTypeId === null || run.isSuggestion) continue;
    const key = keyOf(run.runTypeId);
    const seen = first.get(key);
    if (seen === undefined || run.id < seen) first.set(key, run.id);
  }
  return Array.from(first.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([typeId]) => typeId);
}

/**
 * THE colour of a run type on this bid — the one function the drawing, the
 * runs panel, the drops readout, the route/quantity split and the type
 * picker all read, so a swatch cannot disagree with its line.
 *
 * A type not used on the bid yet gets the colour it WILL get: the next slot.
 * The seventh type wraps onto the first colour; six is the palette.
 *
 * ── A chosen color wins, and the automatic types step around it ─────────────
 * Owner, 2026-09-27: a type with a chosen color is that color on every bid;
 * the AUTOMATIC types take the colors left over by the chosen colors of types
 * on THIS bid, in first-use order. A choice made for a type that is not on
 * the bid reserves nothing here. Two types may choose the same color. When
 * every color is somebody's choice, the automatic types wrap over all six —
 * six is the palette (answer 5), and that is the one case that can collide.
 */
export function runTypeColor(
  runTypeId: number,
  colors: RunTypeColors
): MarkColor {
  const chosen = chosenRunTypeColor(runTypeId, colors);
  if (chosen) return chosen;

  const taken = new Set<MarkColor>();
  const automatic: number[] = [];
  for (const typeId of colors.order) {
    const c = chosenRunTypeColor(typeId, colors);
    if (c) taken.add(c);
    else automatic.push(typeId);
  }
  const left = MARK_COLORS.filter(c => !taken.has(c));
  const palette = left.length > 0 ? left : MARK_COLORS;

  const at = automatic.indexOf(runTypeColorKey(runTypeId, colors));
  const slot = at === -1 ? automatic.length : at;
  return palette[slot % palette.length];
}

/** The bid's colors as they would be if `typeId` chose `color` (null: automatic). */
export function withRunTypeChoice(
  colors: RunTypeColors,
  typeId: number,
  color: MarkColor | null
): RunTypeColors {
  const key = runTypeColorKey(typeId, colors);
  const chosen: Record<number, string> = { ...colors.chosen };
  if (color === null) delete chosen[key];
  else chosen[key] = color;
  return { ...colors, chosen };
}

/**
 * For each of the six, the OTHER types on this bid that would wear it if the
 * edited type chose it — the editor's "also used by X".
 *
 * ── Computed as if the choice were made, never from today's drawing ─────────
 * Found on screen 2026-09-27: picking violet said "also used by 12-2 MC
 * cable", which wore violet only because it was automatic, and rule 1 moves
 * an automatic type off a chosen color. A warning read off the current state
 * named a clash that saving would remove. So a type is named against a color
 * only if it would still be that color afterwards: one that chose it too, or
 * an automatic one when every color is taken.
 */
export function runTypeColorsInUse(
  colors: RunTypeColors,
  labels: ReadonlyMap<number, string>,
  editingTypeId: number
): Map<MarkColor, string[]> {
  const editing = runTypeColorKey(editingTypeId, colors);
  const out = new Map<MarkColor, string[]>();
  for (const candidate of MARK_COLORS) {
    const after = withRunTypeChoice(colors, editingTypeId, candidate);
    out.set(
      candidate,
      colors.order
        .filter(t => t !== editing && runTypeColor(t, after) === candidate)
        .map(t => labels.get(t) ?? "another type")
    );
  }
  return out;
}

/**
 * The types on this bid whose color would CHANGE if the edited type chose
 * `choice` — so the editor can say it, rather than the drawing quietly
 * recoloring three lines on Save. The edited type itself is left out.
 */
export function runTypeColorShiftsIf(
  colors: RunTypeColors,
  labels: ReadonlyMap<number, string>,
  editingTypeId: number,
  choice: MarkColor | null
): { label: string; from: MarkColor; to: MarkColor }[] {
  const editing = runTypeColorKey(editingTypeId, colors);
  const after = withRunTypeChoice(colors, editingTypeId, choice);
  const out: { label: string; from: MarkColor; to: MarkColor }[] = [];
  for (const t of colors.order) {
    if (t === editing) continue;
    const from = runTypeColor(t, colors);
    const to = runTypeColor(t, after);
    if (from !== to)
      out.push({ label: labels.get(t) ?? "another type", from, to });
  }
  return out;
}

/**
 * How a run is drawn. Takes the bid's colours FIRST and required, so no
 * caller can draw a run without saying which bid it is on.
 */
export function runAppearance(
  colors: RunTypeColors,
  run: {
    runTypeId: number | null;
    pathType: "conduit" | "cable";
  }
): { color: string; dash: string | undefined } {
  return {
    /*
      Keyed on the type, and NOT kept apart from the counted groups.

      Negating the key was tried, to stop group 12 and run type 12 sharing a
      colour. It does not hold: with six colours, a key and its negative land
      in the same place whenever the id is a multiple of six, so the guarantee
      would be true five times out of six and a test tuned to pass would hide
      that. Six colours cannot keep every pair of things on a sheet apart, and
      pretending otherwise is worse than not claiming it.

      It does not need to hold. A run is a LINE and a mark is a shape with a
      dot in it; they are told apart by what they are before colour is
      consulted at all. Colour groups within a kind, which is the job it was
      freed up to do.
    */
    color:
      run.runTypeId === null
        ? LEGACY_RUN_COLOR[run.pathType]
        : runTypeColor(run.runTypeId, colors),
    dash: RUN_DASH[run.pathType],
  };
}

// ─── Size ─────────────────────────────────────────────────────────────────────

/**
 * How big a mark is on screen, in CSS pixels, before and after the clamps.
 *
 * ── The measurement that produced these numbers ─────────────────────────────
 * Taken from the running app on 2026-09-18, because the plan's own premise was
 * wrong in both directions. § 5e said marks are "drawn at a fixed pixel size
 * today, so at 19% on a dense sheet they already overlap each other". Measured,
 * they are nothing of the kind: the overlay sits INSIDE the viewer's zoom
 * transform, so a mark tracks the drawing exactly.
 *
 *     19%   3.8px      92%  18.3px
 *     24%   4.8px     115%  22.9px
 *     47%   9.4px     143%  28.7px
 *
 * So the fault is the opposite of the one described, and it is at both ends.
 * Zoomed out to see a whole sheet, a mark is under four pixels — smaller than
 * a full stop, and there is no seeing what has been counted. Zoomed in to place
 * one accurately, at MAX_ZOOM, it passes 150 pixels and swallows the symbol it
 * is marking.
 *
 * ── So: scale with the drawing, but only between two stops ──────────────────
 * Between them a mark grows with the paper, which is what makes it feel stuck
 * to the symbol rather than floating over it. Outside them it stops, because
 * past those sizes the mark is no longer doing its job either way.
 *
 * MIN 10: the smallest thing a finger or a cursor can find and hit, and still
 * two distinguishable shapes wide apart from its neighbour.
 * MAX 26: about the size of the symbols on a 1/8" sheet at working zoom. Past
 * that the mark is bigger than the thing it marks.
 */
export const MARK_MIN_PX = 10;
export const MARK_MAX_PX = 26;
/** Diameter at 100% zoom, matching what shipped before this clamp existed. */
export const MARK_BASE_PX = 20;

export function markScreenDiameter(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return MARK_MIN_PX;
  return Math.min(MARK_MAX_PX, Math.max(MARK_MIN_PX, MARK_BASE_PX * zoom));
}

/**
 * The radius to draw with, in the overlay's own units.
 *
 * The overlay is inside the zoom transform, so everything in it is multiplied
 * by `zoom` on its way to the screen. Dividing by the same number is what makes
 * the clamp hold: the mark is specified in screen pixels and expressed in the
 * units it has to be drawn in. Without this the clamp would be applied to a
 * number that is then scaled again, which is no clamp at all.
 */
export function markRadiusInOverlay(zoom: number): number {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return markScreenDiameter(safe) / 2 / safe;
}

/**
 * Stroke width, in overlay units, for the same reason and by the same route.
 *
 * Kept proportional to the mark rather than fixed: a 2px line on a 10px shape
 * is a bold outline and on a 26px one is a hairline, and the shape has to stay
 * recognisable at both.
 */
export function markStrokeInOverlay(zoom: number): number {
  return markRadiusInOverlay(zoom) * 0.25;
}

/**
 * How wide a traced run is on screen, in CSS pixels, before and after clamps.
 *
 * ── The measurement, 2026-09-19 ─────────────────────────────────────────────
 * Taken the same way as the mark sizes above, and it found the same fault at
 * the thin end. A run is drawn at 3 units in an overlay that sits INSIDE the
 * zoom transform, so its width on screen is 3 x zoom, exactly — confirmed
 * across ten steps of the viewer's own zoom ladder rather than assumed:
 *
 *     19%  0.58px      59%  1.76px      143%  4.30px
 *     24%  0.72px      73%  2.20px      800%  24.0px  (MAX_ZOOM)
 *     30%  0.90px      92%  2.75px
 *     38%  1.13px     115%  3.44px
 *     47%  1.41px
 *
 * **At Fit on a D-size sheet — 19% — a run is 0.58 CSS pixels.** That is not a
 * thin line, it is a sub-pixel one: the browser cannot draw half a pixel, so it
 * spreads the colour across a whole one at partial alpha and the run fades into
 * the drawing. Sampling the sheet's own bitmap at the same moment put its
 * printed linework at 1 page unit, which is 0.19px there — so both the drawing
 * and the run are sub-pixel, and the drawing gets away with it only because
 * hundreds of its lines merge into a readable grey. One isolated run does not.
 *
 * ── Two stops, and only one of them is a bug fix ────────────────────────────
 * MIN 2: the first width that is a solid line at Fit rather than a suggestion
 * of one, and roughly ten times the drawing's own linework there, which is what
 * makes it read as something laid OVER the sheet instead of part of it.
 *
 * MAX 8: this end was not broken — the ratio to the drawing's linework is 3:1
 * at every zoom, so a run never gets proportionally fatter. It is capped
 * because past about 267% the zoom is being used to place a trace accurately,
 * and a line that keeps growing covers the route being traced. 8 is also under
 * a third of `MARK_MAX_PX`, which keeps a run reading as a LINE beside the
 * counted shapes rather than competing with them — `takeoffMarks.test.ts`
 * asserts that relationship, since it is the part a later change could break
 * without noticing.
 *
 * BASE 3 at 100%: what shipped before this clamp existed, looked at again at
 * 115% and still right — so the middle of the range is unchanged and only the
 * ends move.
 */
export const RUN_MIN_PX = 2;
export const RUN_MAX_PX = 8;
/** Width at 100% zoom, matching what shipped before this clamp existed. */
export const RUN_BASE_PX = 3;

export function runScreenWidth(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return RUN_MIN_PX;
  return Math.min(RUN_MAX_PX, Math.max(RUN_MIN_PX, RUN_BASE_PX * zoom));
}

/**
 * Any run-overlay width, in the overlay's own units.
 *
 * Same route as `markRadiusInOverlay` and for the same reason: the overlay is
 * inside the zoom transform, so a number specified in screen pixels has to be
 * divided by the zoom it is about to be multiplied by. Everything the trace
 * layer draws goes through here — the committed run, the line being drawn, the
 * rubber band, the vertex dots, the click target and the focus ring — because
 * they are all the same fault, and a clamp on some of them would mean tracing
 * an invisible line that appears once it is finished.
 */
export function runWidthInOverlay(zoom: number, screenPx: number): number {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return screenPx / safe;
}

/** The stroke a committed or in-progress run is drawn with, in overlay units. */
export function runStrokeInOverlay(zoom: number): number {
  return runWidthInOverlay(zoom, runScreenWidth(zoom));
}

/**
 * The points of a shape, as an SVG path, centred on (cx, cy).
 *
 * One function rather than five components: every shape has to answer the same
 * question at the same size, and a path string is what both the drawing overlay
 * and a legend swatch need. Radius is the circumradius, so every shape occupies
 * the same circle and no shape reads as systematically bigger than another.
 */
export function markPath(
  shape: MarkShape,
  cx: number,
  cy: number,
  r: number
): string {
  if (shape === "circle") {
    // Two arcs, because a circle has no vertices to list.
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`;
  }

  if (shape === "rect") {
    // 2:1, corners on the same circle as every other shape: half-width w and
    // half-height w/2 with w² + (w/2)² = r², so w = 2r/√5.
    const w = (2 * r) / Math.sqrt(5);
    const h = w / 2;
    const corners = [
      [cx - w, cy - h],
      [cx + w, cy - h],
      [cx + w, cy + h],
      [cx - w, cy + h],
    ].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`);
    return `M ${corners.join(" L ")} Z`;
  }

  const sides =
    shape === "triangle"
      ? 3
      : shape === "square"
        ? 4
        : shape === "diamond"
          ? 4
          : 6;
  // Diamond is a square on its point, which is the same polygon rotated 45°.
  const turn = shape === "square" ? Math.PI / 4 : -Math.PI / 2;

  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = turn + (i * 2 * Math.PI) / sides;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}
