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

// ─── Shapes ───────────────────────────────────────────────────────────────────

/**
 * Five shapes, and five is not an accident.
 *
 * They have to be told apart at a glance, at a size measured in millimetres, on
 * top of a black-on-white drawing that is already full of lines. Past five the
 * differences stop being differences: a heptagon and an octagon are both "a
 * blob with corners" at 14 pixels, and a shape nobody can name is a shape
 * nobody can match to a legend.
 */
export const MARK_SHAPES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "hexagon",
] as const;
export type MarkShape = (typeof MARK_SHAPES)[number];

/**
 * The five library categories, each with a shape that stays the same across
 * every job — so an estimator who learns "triangles are lighting" keeps that.
 *
 * A count with no category gets one from its id instead (see `shapeFor`), which
 * means a plain count can collide with a category's shape. That is accepted:
 * the shape narrows the field and the COLOUR separates within it, and the two
 * together give thirty combinations, which is more distinct marks than a sheet
 * can usefully carry anyway.
 */
const SHAPE_BY_CATEGORY: Record<string, MarkShape> = {
  Devices: "circle",
  Lighting: "triangle",
  Panels: "square",
  "Equipment Connections": "diamond",
  "Low Voltage/EMS": "hexagon",
};

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
    ? SHAPE_BY_CATEGORY[group.assemblyCategory]
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
export function markAppearance(mark: {
  groupId: number | null;
  assemblyId: number | null;
  assemblyCategory?: string | null;
}): { shape: MarkShape; color: MarkColor } {
  const id = mark.groupId ?? (mark.assemblyId !== null ? -mark.assemblyId : 0);
  return {
    shape: shapeFor({ id, assemblyCategory: mark.assemblyCategory }),
    color: colorFor({ id }),
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
