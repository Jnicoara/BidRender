/**
 * ONE crosshair, drawn by the operating system, so it cannot lag.
 *
 * ── The fault this replaces ──────────────────────────────────────────────────
 * Tracing and calibrating showed TWO crosshairs: the small system cursor, and a
 * big yellow one drawn into the SVG overlay from React state. The drawn one is
 * the one the eye follows, and it arrives a frame or more late — the pointer
 * moves, React re-renders, the overlay repaints. On a dense sheet, where the
 * render worker is already busy, it trails visibly behind the real pointer.
 * Reported 2026-09-21.
 *
 * A cursor image cannot do that. The compositor draws it with the pointer, on
 * the pointer's own clock, whatever the page is doing.
 *
 * ── The geometry is exact, not approximate ───────────────────────────────────
 * A cursor hotspot off by a pixel or two puts EVERY point on the sheet in the
 * wrong place, quietly, and it is the same class of error as a wrong scale: it
 * multiplies. So the numbers here are chosen so the hotspot and the drawn
 * centre are the same pixel, rather than nearly:
 *
 *   SIZE is ODD, so there is a single centre PIXEL (index 12 of 0..24) rather
 *   than a boundary between two.
 *
 *   The lines are drawn at CENTRE + 0.5 with a stroke width of 1, which covers
 *   exactly that one pixel column and row — crisp, and symmetric about it.
 *
 *   The hotspot is declared as CENTRE, which selects that same pixel.
 *
 * `crosshairInk` exists so a test can rasterise this and confirm the drawn
 * centroid really is the hotspot, rather than taking the arithmetic on trust.
 *
 * ── Visible on white paper AND on black linework ─────────────────────────────
 * A plan is white with black lines, so a single-colour cursor disappears
 * against one or the other. This is a dark core with a light halo: the dark
 * shows against paper, the halo shows against linework, and against grey it has
 * both. Yellow was rejected — it is the colour of marks, and a cursor that
 * looks like a mark is a cursor you lose among them.
 */

/** Odd, so there is one centre pixel rather than a seam between two. */
export const CROSSHAIR_SIZE = 25;

/** The centre pixel's index, and the hotspot. */
export const CROSSHAIR_CENTRE = 12;

/**
 * Half the gap at the middle, in pixels.
 *
 * The arms stop short so the pixel being aimed at is never covered by the
 * cursor aiming at it. Four arms converging on a hole locate a point more
 * precisely than a solid plus does.
 */
const GAP = 3;

/** How far the arms reach. Slightly smaller than the drawn one it replaces. */
const ARM = CROSSHAIR_CENTRE;

const CORE = "#111827";
const HALO = "#FFFFFF";

/** Where a line sits to cover exactly the centre pixel. */
const LINE = CROSSHAIR_CENTRE + 0.5;

/** The four arm segments, as [x1, y1, x2, y2]. */
export function crosshairArms(): Array<[number, number, number, number]> {
  const near = CROSSHAIR_CENTRE - GAP;
  const far = CROSSHAIR_CENTRE + GAP + 1;
  const end = CROSSHAIR_CENTRE + ARM + 1;
  return [
    [LINE - ARM - 0.5, LINE, near, LINE], // left
    [far, LINE, end, LINE], // right
    [LINE, LINE - ARM - 0.5, LINE, near], // up
    [LINE, far, LINE, end], // down
  ];
}

function armPath(): string {
  return crosshairArms()
    .map(([x1, y1, x2, y2]) => `M${x1} ${y1}H${x2}V${y2}`)
    .join("");
}

/**
 * The cursor as an SVG document.
 *
 * Two passes of the SAME path: a wide light one, then a narrow dark one over
 * it. One geometry, so the halo cannot drift away from the core.
 */
export function crosshairSvg(): string {
  const arms = crosshairArms()
    .map(
      ([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
    )
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CROSSHAIR_SIZE}" height="${CROSSHAIR_SIZE}" viewBox="0 0 ${CROSSHAIR_SIZE} ${CROSSHAIR_SIZE}">`,
    `<g stroke="${HALO}" stroke-width="3" stroke-linecap="butt">${arms}</g>`,
    `<g stroke="${CORE}" stroke-width="1" stroke-linecap="butt">${arms}</g>`,
    `</svg>`,
  ].join("");
}

/**
 * The value for the CSS `cursor` property.
 *
 * `crosshair` is the fallback, for the moment a browser refuses the image —
 * over the size limit, or a data URI blocked by policy. Losing the nice cursor
 * is survivable; losing the crosshair entirely would leave an arrow pointing at
 * a drawing, so the fallback is never omitted.
 */
export function crosshairCursorValue(): string {
  const encoded = encodeURIComponent(crosshairSvg());
  return `url("data:image/svg+xml,${encoded}") ${CROSSHAIR_CENTRE} ${CROSSHAIR_CENTRE}, crosshair`;
}

/** Ready to spread onto a style prop. */
export const crosshairCursorStyle = { cursor: crosshairCursorValue() };

/**
 * Which pixels the crosshair paints, as a grid, for measuring the centre.
 *
 * A stand-in for rasterising the SVG, which jsdom cannot do. It walks the same
 * arm geometry the SVG is built from, so what it reports is what is drawn —
 * and a test can then assert that the ink's centroid and bounding box agree
 * with the declared hotspot. `armPath` is unused by the SVG itself and exists
 * only to keep this honest if the drawing ever moves to a path.
 */
export function crosshairInk(): boolean[][] {
  void armPath;
  const grid: boolean[][] = Array.from({ length: CROSSHAIR_SIZE }, () =>
    Array.from({ length: CROSSHAIR_SIZE }, () => false)
  );
  for (const [x1, y1, x2, y2] of crosshairArms()) {
    // Every arm is axis-aligned, so one of the two spans is a single pixel.
    const xs = x1 === x2 ? [CROSSHAIR_CENTRE] : range(x1, x2);
    const ys = y1 === y2 ? [CROSSHAIR_CENTRE] : range(y1, y2);
    for (const x of xs) {
      for (const y of ys) {
        if (x < 0 || y < 0 || x >= CROSSHAIR_SIZE || y >= CROSSHAIR_SIZE) {
          continue;
        }
        grid[y][x] = true;
      }
    }
  }
  return grid;
}

/** The pixel columns a span from `a` to `b` covers. */
function range(a: number, b: number): number[] {
  const lo = Math.round(Math.min(a, b));
  const hi = Math.round(Math.max(a, b));
  const out: number[] = [];
  for (let i = lo; i < hi; i++) out.push(i);
  return out;
}
