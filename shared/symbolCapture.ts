/**
 * How sharp a captured legend symbol is, and how big its picture may be.
 *
 * ── Why this exists, 2026-09-30 ─────────────────────────────────────────────
 * A captured symbol used to be cut out of the viewer's BACKDROP — the whole
 * sheet drawn once at 1.5x, which is 108 pixels per paper inch — and then
 * shrunk to at most 96 pixels on its long edge. Measured on a real capture
 * ("Junction Box", Weld 1 p1): a 0.40 in box saved as 43x42 px, while the same
 * symbol on screen at 179% on a 1.25-ratio display was about 240 px per inch.
 * The picture was softer than what the estimator had just looked at, and
 * methods (b) and (d) of the reader-accuracy test send exactly these pictures
 * to the model as "the legend".
 *
 * Now the box is rendered again from the PDF, at whichever is sharper of a
 * fixed floor and the screen the user was looking at, so the picture is never
 * softer than the drawing it was boxed on.
 */

/** Points (1/72 in) in a paper inch — PDF user space. */
const POINTS_PER_INCH = 72;

/**
 * The least resolution a captured symbol is rendered at, in pixels per paper
 * inch. Higher than any zoom most people box a legend at, so the picture is
 * sharper than the screen in the ordinary case. A 0.4 in symbol comes out at
 * 160 px.
 */
export const CAPTURE_MIN_PIXELS_PER_INCH = 400;

/**
 * The longest edge of a captured picture, in pixels. Only a box much bigger
 * than a legend symbol reaches it — 512 px at 400 per inch is 1.28 in.
 */
export const CAPTURE_MAX_EDGE = 512;

/**
 * The most characters a stored symbol picture (a data URL) may have.
 *
 * `takeoff_symbol_links.thumbnail` is a MySQL TEXT column, which holds 65,535
 * BYTES. The router used to accept 200,000 characters, so anything between
 * the two passed validation and then failed in the database. This is under
 * the column with room to spare, and the router and the capture both read it.
 */
export const SYMBOL_THUMBNAIL_MAX_CHARS = 60_000;

/** A box on the page in PDF points. Width or height may be negative. */
export type CaptureBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The same box with a positive width and height — dragged up-left or not. */
export function normaliseCaptureBox(box: CaptureBox): CaptureBox {
  return {
    x: Math.min(box.x, box.x + box.width),
    y: Math.min(box.y, box.y + box.height),
    width: Math.abs(box.width),
    height: Math.abs(box.height),
  };
}

/**
 * The render scale (pixels per PDF point) to draw a captured box at.
 *
 * `screenScale` is how many DEVICE pixels one point occupied on screen when
 * the box was drawn (`sharpRenderScale` in client/src/lib/planView.ts). The
 * picture is never softer than that, nor than the floor above, unless the box
 * is so large that the edge cap has to win. Returns 0 for a box with no area.
 */
export function captureRenderScale(
  box: CaptureBox,
  screenScale: number
): number {
  const { width, height } = normaliseCaptureBox(box);
  if (!(width > 0 && height > 0)) return 0;
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest)) return 0;
  const floor = CAPTURE_MIN_PIXELS_PER_INCH / POINTS_PER_INCH;
  const wanted = Math.max(
    floor,
    Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 0
  );
  return Math.min(wanted, CAPTURE_MAX_EDGE / longest);
}

/** The pixel size a box comes out at for a given render scale. */
export function capturePixelSize(
  box: CaptureBox,
  scale: number
): { width: number; height: number } {
  const { width, height } = normaliseCaptureBox(box);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
