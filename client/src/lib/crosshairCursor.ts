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

/**
 * EVEN, so the image's geometric centre lands on a whole number.
 *
 * ── This was 25, and that was half a pixel wrong ─────────────────────────────
 * Corrected 2026-09-24. An odd size gives a single centre PIXEL, index 12 of
 * 0..24 — which sounded right and is not, because a CSS hotspot is a
 * COORDINATE, not a pixel index. Pixel 12 spans 12.0 to 13.0, so its centre is
 * at 12.5, while the hotspot could only be declared as the integer 12. Every
 * point therefore landed half a CSS pixel up and to the left of where the
 * crosshair appeared to be — one whole device pixel at the 2x scaling this
 * machine runs at.
 *
 * The first verification missed it by measuring the ink centroid in INDEX
 * space, where the answer comes out as a clean 12 and looks like a pass. A
 * measurement in the wrong units is not a measurement.
 *
 * With an even size, the geometric centre of a 24px image is exactly 12.0, an
 * integer, so the hotspot can name it precisely. The arms are then 2px wide and
 * centred on that line, which keeps them crisp — spanning 11.0 to 13.0, whole
 * pixel columns, symmetric about 12.0.
 */
export const CROSSHAIR_SIZE = 24;

/** The image's exact geometric centre, and the hotspot. */
export const CROSSHAIR_CENTRE = 12;

/** Arms straddle the centre line, so 2 and 4 rather than 1 and 3. */
const CORE_WIDTH = 2;
const HALO_WIDTH = 4;

/**
 * Half the gap at the middle, in pixels.
 *
 * The arms stop short of the centre so the drawing under the exact point stays
 * visible. They no longer stop short of a HOLE, though — see CENTRE_DOT.
 */
const GAP = 3;

/**
 * A dot on the exact point, inside the gap.
 *
 * ── The open gap lost the spot ───────────────────────────────────────────────
 * Reported 2026-09-24. Four arms converging on emptiness makes the eye infer
 * the centre, and inferring is not aiming: on a busy sheet the gap fills with
 * linework and the precise pixel stops being obvious at all.
 *
 * So the gap keeps its job — the arms still do not cover the target — and a
 * single dot marks it. One pixel of dark core with a light ring, which is the
 * same contrast trick the arms use and for the same reason: it has to survive
 * both white paper and black line.
 *
 * Kept to r=1.6 for the ring and r=0.6 for the core. Bigger reads as a blob and
 * covers the thing it is pointing at, which is what the gap exists to avoid.
 */
const DOT_CORE_R = 0.6;
const DOT_RING_R = 1.6;

/** How far the arms reach. Slightly smaller than the drawn one it replaces. */
const ARM = CROSSHAIR_CENTRE;

const CORE = "#111827";
const HALO = "#FFFFFF";

/**
 * The centre line. THE HOTSPOT ITSELF, not half a pixel beside it.
 *
 * A 2px stroke centred here spans whole pixel columns either side, so the mark
 * is crisp AND its centre of area is the coordinate the hotspot names.
 */
const LINE = CROSSHAIR_CENTRE;

/** The four arm segments, as [x1, y1, x2, y2]. Symmetric about LINE. */
export function crosshairArms(): Array<[number, number, number, number]> {
  const near = CROSSHAIR_CENTRE - GAP;
  const far = CROSSHAIR_CENTRE + GAP;
  const start = CROSSHAIR_CENTRE - ARM;
  const end = CROSSHAIR_CENTRE + ARM;
  return [
    [start, LINE, near, LINE], // left
    [far, LINE, end, LINE], // right
    [LINE, start, LINE, near], // up
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
    `<g stroke="${HALO}" stroke-width="${HALO_WIDTH}" stroke-linecap="butt">${arms}</g>`,
    `<g stroke="${CORE}" stroke-width="${CORE_WIDTH}" stroke-linecap="butt">${arms}</g>`,
    // The centre dot, on the hotspot itself: light ring first, dark core over
    // it, so it reads on paper and on linework exactly as the arms do.
    `<circle cx="${LINE}" cy="${LINE}" r="${DOT_RING_R}" fill="${HALO}"/>`,
    `<circle cx="${LINE}" cy="${LINE}" r="${DOT_CORE_R}" fill="${CORE}"/>`,
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
 * Which pixels the ARMS paint, as a grid, for measuring the centre.
 *
 * A stand-in for rasterising the SVG, which jsdom cannot do. It walks the same
 * arm geometry the SVG is built from, so what it reports is what is drawn.
 *
 * ── Arms only, and that is the stricter measurement ─────────────────────────
 * The centre dot added on 2026-09-24 is drawn exactly on the hotspot, so
 * including it could only ever pull a centroid TOWARDS the right answer — it
 * would mask an arm that had drifted. Leaving it out means the symmetry test
 * is carried entirely by the four arms, which are the part that can be wrong.
 *
 * So `grid[CENTRE][CENTRE]` being false here says the ARMS leave the target
 * clear; it does not say the cursor paints nothing there. It paints a dot.
 * `armPath` is unused by the SVG itself and exists only to keep this honest if
 * the drawing ever moves to a path.
 */
export function crosshairInk(): boolean[][] {
  void armPath;
  const grid: boolean[][] = Array.from({ length: CROSSHAIR_SIZE }, () =>
    Array.from({ length: CROSSHAIR_SIZE }, () => false)
  );
  const half = CORE_WIDTH / 2;
  for (const [x1, y1, x2, y2] of crosshairArms()) {
    /*
      Every arm is axis-aligned. Along its length it covers the span between
      its ends; across its width it covers the stroke, which straddles the
      centre line — so the thin axis is a RANGE too, not a single column. That
      is the whole point of the even-sized image: the stroke sits symmetrically
      on the hotspot instead of one pixel to its side.
    */
    const xs = x1 === x2 ? range(x1 - half, x1 + half) : range(x1, x2);
    const ys = y1 === y2 ? range(y1 - half, y1 + half) : range(y1, y2);
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
