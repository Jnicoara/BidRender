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
 *
 * ── Reversed 2026-09-24: a COLOURED core with a thin dark outline ────────────
 * The light halo is what made it wrong. On the app's dark chrome and on dark
 * areas of a sheet, a 4px white band round a dark line read as a glowing white
 * box rather than a cursor. The arms are now a saturated colour — brand yellow
 * by default — with a 1px dark outline each side (the same 4px/2px geometry,
 * colours swapped), which holds on white paper through the outline and on
 * black linework through the colour.
 *
 * The colour is a per-person setting (Settings → Display) because the
 * objection to yellow above is real for some sets: a sheet dense with yellow
 * marks is exactly where someone wants cyan or magenta instead. The centre dot
 * and every coordinate are unchanged — only the arm colours moved.
 *
 * ── And later the same day: the outline went too ─────────────────────────────
 * Yellow arms, a dark outline and blue alignment guides were three colours on
 * one pointer. The arms and the guides (CrosshairGuides, in TraceLayer and
 * CalibrateLayer) now both take the chosen colour, and the outline is replaced
 * by a very faint soft shadow — see SHADOW_BLUR. The centre dot is untouched.
 */

/** The choices offered in Settings. All saturated, all readable on white. */
export const CROSSHAIR_COLORS = {
  yellow: { label: "Yellow", hex: "#F5C518" },
  cyan: { label: "Cyan", hex: "#22D3EE" },
  magenta: { label: "Magenta", hex: "#FF2BD6" },
  red: { label: "Red", hex: "#FF3B30" },
  green: { label: "Green", hex: "#22E05A" },
} as const;

export type CrosshairColor = keyof typeof CROSSHAIR_COLORS;

export const DEFAULT_CROSSHAIR_COLOR: CrosshairColor = "yellow";

/** A stored value from an older build or a hand-edit falls back to default. */
export function asCrosshairColor(value: unknown): CrosshairColor {
  return typeof value === "string" && value in CROSSHAIR_COLORS
    ? (value as CrosshairColor)
    : DEFAULT_CROSSHAIR_COLOR;
}

/**
 * How big the crosshair is — a per-person setting beside the colour.
 *
 * ── Added 2026-09-25: arms 1.5x longer by default ────────────────────────────
 * The 24px cursor's arms were short enough to lose on a dense sheet. MEDIUM is
 * the new default and reaches 1.5x as far (36px image, 18px each way); SMALL
 * is the old cursor exactly, for anyone who preferred it; LARGE is 48px.
 *
 * Only the REACH changes. The stroke stays 2px, the gap and the centre dot
 * stay the same size in pixels, and every size is EVEN — see below — so the
 * hotspot is the exact geometric centre at all three. The tests loop over
 * every size rather than trusting that one passing implies the others.
 *
 * 48 is well under the 128px ceiling browsers put on cursor images. Chrome
 * hides a cursor over 32px while it overlaps the browser's own UI — at the
 * edge of the window — and falls back to the plain `crosshair` given in
 * `crosshairCursorValue`, which is the fallback working as intended.
 */
export const CROSSHAIR_SIZES = {
  small: { label: "Small", px: 24 },
  medium: { label: "Medium", px: 36 },
  large: { label: "Large", px: 48 },
} as const;

export type CrosshairSize = keyof typeof CROSSHAIR_SIZES;

export const DEFAULT_CROSSHAIR_SIZE: CrosshairSize = "medium";

/** A stored value from an older build or a hand-edit falls back to default. */
export function asCrosshairSize(value: unknown): CrosshairSize {
  return typeof value === "string" && value in CROSSHAIR_SIZES
    ? (value as CrosshairSize)
    : DEFAULT_CROSSHAIR_SIZE;
}

/**
 * The image's side, in CSS pixels. EVEN, so its geometric centre lands on a
 * whole number.
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
 * With an even size, the geometric centre is exactly size/2, an integer, so
 * the hotspot can name it precisely. The arms are then 2px wide and centred on
 * that line, which keeps them crisp — whole pixel columns, symmetric about it.
 */
export function crosshairPx(size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE) {
  return CROSSHAIR_SIZES[size].px;
}

/** The image's exact geometric centre, and the hotspot. */
export function crosshairCentre(
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): number {
  return crosshairPx(size) / 2;
}

/** The default image's side and centre, for callers that want a constant. */
export const CROSSHAIR_SIZE = crosshairPx();
export const CROSSHAIR_CENTRE = crosshairCentre();

/** Arms straddle the centre line, so 2 rather than 1. */
const CORE_WIDTH = 2;

/**
 * Half the gap at the middle, in pixels. The same at every size: it is there
 * to keep the target visible, and the target does not grow with the cursor.
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
 * Kept to r=1.6 for the ring and r=0.6 for the core, at every size. Bigger
 * reads as a blob and covers the thing it is pointing at.
 */
const DOT_CORE_R = 0.6;
const DOT_RING_R = 1.6;

/**
 * The centre dot's two colours. UNCHANGED by the 2026-09-24 recolour on
 * purpose: the dot is the aiming point and was specified as it is.
 */
const CORE = "#111827";
const HALO = "#FFFFFF";

/**
 * A very faint soft shadow under the arms — NOT an outline.
 *
 * Changed 2026-09-24, the same day the outline went in. A yellow core with a
 * dark 1px outline, beside blue alignment guides, put three colours on the
 * pointer and read as messy. The arms and the guides are now ONE colour, the
 * person's chosen one. What the outline did for white paper is done, barely,
 * by this: a blur with no edge, so it lifts a yellow line off white without
 * drawing a second line round it.
 *
 * Exported because the calibration span line wears the same shadow — see
 * MEASURE_SHADOW_PASSES below for how it is reproduced there.
 */
export const CROSSHAIR_SHADOW = { blur: 0.8, opacity: 0.45 } as const;

/**
 * The crosshair's shadow, rebuilt for a line drawn ON the drawing.
 *
 * The cursor can use a real blur because it is a fixed-size image. The span
 * line lives inside the viewer's zoom transform, where a filter's blur radius
 * would scale with the zoom — a hairline shadow at fit, a smear at 400%. So it
 * is drawn as two faint black strokes UNDER the coloured one, each with
 * non-scaling stroke so they are the same screen width at every zoom: 1px and
 * 2px of soft darkening either side of a 2px line, fading outward. That is the
 * same falloff the 0.8px blur gives the cursor's arms (measured in the
 * rendered cursor: about 11% against the arm, about 1% a pixel beyond).
 */
export const MEASURE_SHADOW_PASSES = [
  { width: 6, opacity: 0.05 },
  { width: 4, opacity: 0.12 },
] as const;

/** The four arm segments, as [x1, y1, x2, y2]. Symmetric about the centre. */
export function crosshairArms(
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): Array<[number, number, number, number]> {
  const c = crosshairCentre(size);
  // The arms reach the edge of the image — the size IS the reach.
  const near = c - GAP;
  const far = c + GAP;
  const start = 0;
  const end = crosshairPx(size);
  return [
    [start, c, near, c], // left
    [far, c, end, c], // right
    [c, start, c, near], // up
    [c, far, c, end], // down
  ];
}

function armPath(size: CrosshairSize): string {
  return crosshairArms(size)
    .map(([x1, y1, x2, y2]) => `M${x1} ${y1}H${x2}V${y2}`)
    .join("");
}

/**
 * The cursor as an SVG document.
 *
 * One pass of the arms in the chosen colour, with the soft shadow above as a
 * filter on that same pass — so there is no second geometry to drift.
 */
export function crosshairSvg(
  color: CrosshairColor = DEFAULT_CROSSHAIR_COLOR,
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): string {
  const ink = CROSSHAIR_COLORS[color].hex;
  const px = crosshairPx(size);
  const c = crosshairCentre(size);
  const arms = crosshairArms(size)
    .map(
      ([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
    )
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">`,
    `<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="${CROSSHAIR_SHADOW.blur}" flood-color="#000" flood-opacity="${CROSSHAIR_SHADOW.opacity}"/></filter></defs>`,
    `<g stroke="${ink}" stroke-width="${CORE_WIDTH}" stroke-linecap="butt" filter="url(#s)">${arms}</g>`,
    // The centre dot, on the hotspot itself: light ring first, dark core over
    // it, so it reads on paper and on linework exactly as the arms do.
    `<circle cx="${c}" cy="${c}" r="${DOT_RING_R}" fill="${HALO}"/>`,
    `<circle cx="${c}" cy="${c}" r="${DOT_CORE_R}" fill="${CORE}"/>`,
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
export function crosshairCursorValue(
  color: CrosshairColor = DEFAULT_CROSSHAIR_COLOR,
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): string {
  const encoded = encodeURIComponent(crosshairSvg(color, size));
  const c = crosshairCentre(size);
  return `url("data:image/svg+xml,${encoded}") ${c} ${c}, crosshair`;
}

/**
 * Ready to spread onto a style prop, one per colour and size, built once — so
 * a component re-rendering on every pointer move hands React the same object
 * and the browser never re-parses the cursor image.
 */
const STYLES = new Map<string, { cursor: string }>();
for (const c of Object.keys(CROSSHAIR_COLORS) as CrosshairColor[])
  for (const s of Object.keys(CROSSHAIR_SIZES) as CrosshairSize[])
    STYLES.set(`${c}:${s}`, { cursor: crosshairCursorValue(c, s) });

export function crosshairCursorStyle(
  color: CrosshairColor,
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): { cursor: string } {
  return STYLES.get(`${color}:${size}`)!;
}

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
export function crosshairInk(
  size: CrosshairSize = DEFAULT_CROSSHAIR_SIZE
): boolean[][] {
  void armPath;
  const px = crosshairPx(size);
  const grid: boolean[][] = Array.from({ length: px }, () =>
    Array.from({ length: px }, () => false)
  );
  const half = CORE_WIDTH / 2;
  for (const [x1, y1, x2, y2] of crosshairArms(size)) {
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
        if (x < 0 || y < 0 || x >= px || y >= px) continue;
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
