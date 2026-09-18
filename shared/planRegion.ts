/**
 * planRegion — what part of a sheet to draw, and how big the result may be.
 *
 * The viewer's sharp zoom and the plan reader's tiling are the same operation
 * asked twice: draw THIS rectangle of THIS page at THIS resolution. Neither
 * knows about the other, and neither tells the worker about "the current view"
 * — a worker that understood viewports would be useless to the tiler and the
 * work would be written twice. See references/plan-viewer-overhaul.md § 4b.
 *
 * ── The coordinate space ─────────────────────────────────────────────────────
 * A rect is in PAGE POINTS (1/72 inch), origin at the page's top-left — the
 * same space `PagePoint` uses in `shared/takeoffGeometry.ts`, and the same
 * space a pdf.js viewport at scale 1 uses. Never screen pixels: those change
 * with zoom, the window size and the display, and a stored measurement that
 * moves when the window is resized is worthless.
 *
 * ── Why the scale must travel back ───────────────────────────────────────────
 * The worker may not be able to give the scale it was asked for — see
 * `fitScaleToBudget`. So it returns the scale it ACTUALLY used alongside the
 * bitmap, and callers read it from there rather than from a constant they hold.
 * A constant kept in step by hand is the bug waiting to happen, and it has
 * already been noted once against `snapshotPage`.
 */

/** A rectangle of a page, in page points, origin at the page's top-left. */
export type PageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The most pixels one bitmap may be.
 *
 * Measured on 2026-09-17 against a real 36x24 E-sheet: a whole page at 7x is
 * 219 Mpx / 837 MB and takes 2.4 seconds; at 8x `createImageBitmap` refuses to
 * allocate. Chrome threw cleanly there, but an 800 MB allocation that SUCCEEDS
 * on a laptop with a plan set open is the one that gets the tab killed, so the
 * ceiling sits well below where the failure was seen.
 *
 * 96 Mpx is about 366 MB. For scale: a 4K screen at devicePixelRatio 2 has a
 * viewport of roughly 33 Mpx, so a region plus a generous margin still fits
 * with room to spare. Nothing that draws what a person is looking at should
 * ever come close to this.
 */
export const MAX_REGION_PIXELS = 96_000_000;

/**
 * The rect covering a whole page.
 *
 * `width`/`height` are the page's size in points as pdf.js reports it for a
 * scale-1 viewport, so page rotation is already accounted for.
 */
export function wholePage(pageWidth: number, pageHeight: number): PageRect {
  return { x: 0, y: 0, width: pageWidth, height: pageHeight };
}

/**
 * Trim a rect to the page, because asking past the edge wastes pixels on blank
 * paper and quietly shifts where everything lands.
 *
 * Returns null when nothing of the rect is on the page at all — the caller has
 * scrolled somewhere that does not exist, which is not an error worth throwing
 * over but is definitely not something to render.
 */
export function clampRegion(
  rect: PageRect,
  pageWidth: number,
  pageHeight: number
): PageRect | null {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    !Number.isFinite(pageWidth) ||
    !Number.isFinite(pageHeight) ||
    pageWidth <= 0 ||
    pageHeight <= 0
  ) {
    return null;
  }

  const left = Math.max(0, Math.min(rect.x, pageWidth));
  const top = Math.max(0, Math.min(rect.y, pageHeight));
  const right = Math.min(pageWidth, Math.max(0, rect.x + rect.width));
  const bottom = Math.min(pageHeight, Math.max(0, rect.y + rect.height));

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  return { x: left, y: top, width, height };
}

/** How big the bitmap for this rect at this scale would be, in device pixels. */
export function regionPixelSize(
  rect: PageRect,
  scale: number
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(rect.width * scale)),
    height: Math.max(1, Math.ceil(rect.height * scale)),
  };
}

/**
 * The sharpest scale this rect can be drawn at without breaking the budget.
 *
 * Degrades rather than refuses. A slightly softer sheet is a sheet someone can
 * still work from; an error where a drawing should be is not. The caller finds
 * out it happened because the scale comes back with the bitmap — this must
 * never be silent, which is why `renderRegion` says so in the console when the
 * ask and the answer differ.
 *
 * Never returns more than `desiredScale`: this is a ceiling, not a target.
 */
export function fitScaleToBudget(
  rect: PageRect,
  desiredScale: number,
  maxPixels: number = MAX_REGION_PIXELS
): number {
  if (!Number.isFinite(desiredScale) || desiredScale <= 0) return 0;
  const area = rect.width * rect.height;
  if (!Number.isFinite(area) || area <= 0) return 0;

  const wanted = area * desiredScale * desiredScale;
  if (wanted <= maxPixels) return desiredScale;
  return Math.sqrt(maxPixels / area);
}
