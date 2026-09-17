/**
 * Zoom and pan for the plan viewer — the arithmetic, with no React in it.
 *
 * ── Two zooms, and they are not the same thing ───────────────────────────────
 * DISPLAY zoom is this file: a CSS transform over an already-rasterised page.
 * Instant and free, and it goes soft once magnified past the resolution the
 * page was drawn at.
 *
 * RENDER resolution is the other one — what the worker actually rasterises at,
 * `RENDER_SCALE` in TakeoffPage. Sharp at any magnification and costs 0.5–13s
 * on a dense sheet. **It is deliberately NOT part of this phase.** The plan
 * (references/plan-viewer-overhaul.md) holds it back until the ceiling can be
 * chosen against a real E-sheet.
 *
 * Keeping them separate is the whole design. The old PlanPanel had only the
 * first, which is exactly why zooming into it went blurry.
 *
 * ── Why the maths lives here ─────────────────────────────────────────────────
 * Zoom-toward-the-cursor and pan clamping are the two things that feel wrong
 * immediately when they are subtly wrong, and neither needs a browser to test.
 * A component that owns them can only be checked by hand.
 *
 * ── The coordinate story ─────────────────────────────────────────────────────
 * `x`/`y` translate the drawing inside the viewport, in CSS pixels, applied
 * BEFORE the scale — `translate(x, y) scale(zoom)` with origin `0 0`. So a
 * point `p` on the drawing lands at `x + p * zoom` on screen, and that single
 * relationship is every function below.
 *
 * Nothing here knows about PDF points, feet, or the sheet scale. A measurement
 * is taken from the overlay's own coordinate space (see `screenToPagePoints`),
 * which is why zooming cannot change a traced length.
 */

export type PlanView = {
  /** Screen pixels per drawing pixel. */
  zoom: number;
  /** Offset of the drawing's top-left corner inside the viewport, in CSS px. */
  x: number;
  y: number;
};

/** Viewport and drawing sizes, both in CSS pixels. */
export type ViewBounds = {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
};

/**
 * How far in and out the display zoom may go.
 *
 * The ceiling is generous on purpose: this phase stretches rather than
 * re-renders, so the honest limit is "when does it get too blurry to click
 * accurately", which is a judgement to make against a real drawing rather than
 * a number to assert here.
 */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** Fit-to-view leaves this much breathing room, in CSS pixels. */
const FIT_PADDING = 24;

/**
 * Only NaN falls back to 1 — an infinity is clamped like any other overshoot.
 *
 * The distinction is deliberate. NaN carries no direction, so there is nothing
 * to clamp toward and a neutral answer is the only honest one; an infinity says
 * "further than the limit", which is exactly what the limit is for. Treating
 * both as nonsense would silently reset the view to 100% instead of stopping at
 * the stop.
 */
export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Keep the drawing on screen.
 *
 * Two cases, and they want opposite behaviour:
 *
 *   Drawing SMALLER than the viewport — centre it, and ignore any pan. Letting
 *   someone shove a small sheet into a corner looks like a bug, not a feature.
 *
 *   Drawing LARGER — allow panning anywhere within it, but never past an edge.
 *   No empty gutters, and no dragging the sheet off into nowhere and wondering
 *   where it went.
 *
 * Strict rather than elastic, deliberately. A rubber-band overshoot reads as
 * slack on a screen whose whole job is precision.
 */
export function clampView(view: PlanView, bounds: ViewBounds): PlanView {
  const zoom = clampZoom(view.zoom);
  const scaledWidth = bounds.contentWidth * zoom;
  const scaledHeight = bounds.contentHeight * zoom;

  const axis = (offset: number, scaled: number, viewport: number): number => {
    if (!Number.isFinite(offset)) return 0;
    // Smaller than the viewport: centred, and the offset is not negotiable.
    if (scaled <= viewport) return (viewport - scaled) / 2;
    // Larger: anywhere from "right edge flush" to "left edge flush".
    return Math.min(0, Math.max(viewport - scaled, offset));
  };

  return {
    zoom,
    x: axis(view.x, scaledWidth, bounds.viewportWidth),
    y: axis(view.y, scaledHeight, bounds.viewportHeight),
  };
}

/**
 * The view that fits the whole sheet, centred.
 *
 * Also the answer to "I am lost" — which is why it is one button and one
 * keystroke rather than something to reconstruct by scrolling.
 */
export function fitView(bounds: ViewBounds): PlanView {
  if (bounds.contentWidth <= 0 || bounds.contentHeight <= 0) {
    return { zoom: 1, x: 0, y: 0 };
  }
  const usableWidth = Math.max(1, bounds.viewportWidth - FIT_PADDING * 2);
  const usableHeight = Math.max(1, bounds.viewportHeight - FIT_PADDING * 2);
  const zoom = clampZoom(
    Math.min(
      usableWidth / bounds.contentWidth,
      usableHeight / bounds.contentHeight
    )
  );
  return clampView({ zoom, x: 0, y: 0 }, bounds);
}

/**
 * Zoom about a fixed point on screen — the pointer, or the viewport centre.
 *
 * **The point under the cursor must not move.** That one property is the
 * difference between a viewer that feels like paper under your hand and one
 * that feels like a slideshow, and it is why zoom cannot simply multiply a
 * number and leave the offset alone.
 *
 * The drawing point beneath the cursor is `(anchor - offset) / zoom`. Holding
 * it still at the new zoom gives `offset' = anchor - point * zoom'`, which is
 * the whole derivation.
 */
export function zoomAbout(
  view: PlanView,
  bounds: ViewBounds,
  factor: number,
  anchor: { x: number; y: number }
): PlanView {
  const nextZoom = clampZoom(view.zoom * factor);
  // Already at a stop — do not drift the offset for a zoom that cannot happen.
  if (nextZoom === view.zoom) return clampView(view, bounds);

  const pointX = (anchor.x - view.x) / view.zoom;
  const pointY = (anchor.y - view.y) / view.zoom;

  return clampView(
    {
      zoom: nextZoom,
      x: anchor.x - pointX * nextZoom,
      y: anchor.y - pointY * nextZoom,
    },
    bounds
  );
}

/**
 * A wheel notch turned into a zoom factor.
 *
 * Exponential rather than additive, so every notch changes the view by the
 * same PROPORTION. Adding a constant would crawl when zoomed out and leap when
 * zoomed in — the same wheel movement meaning two different things depending
 * on where you already were.
 */
export function wheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  // Clamped because a trackpad's momentum can deliver one enormous delta, and
  // a single flick should not cross the entire zoom range.
  const clamped = Math.max(-200, Math.min(200, deltaY));
  return Math.exp(-clamped * 0.002);
}

/** One press of the zoom-in or zoom-out button. */
export const BUTTON_ZOOM_STEP = 1.25;

/** For the readout. 1 → "100%". */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
