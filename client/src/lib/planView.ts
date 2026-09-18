/**
 * Zoom and pan for the plan viewer — the arithmetic, with no React in it.
 *
 * ── Two zooms, and they are not the same thing ───────────────────────────────
 * DISPLAY zoom is this file: a CSS transform over an already-rasterised page.
 * Instant and free, and it goes soft once magnified past the resolution the
 * page was drawn at.
 *
 * RENDER resolution is the other one — what the worker actually rasterises at.
 * Sharp at any magnification, and it costs real time.
 *
 * Keeping them separate is the whole design: stretch while moving, re-render
 * sharp once still. The old PlanPanel had only the first, which is exactly why
 * zooming into it went blurry. The bottom of this file is the second half —
 * which rectangle to redraw and at what resolution — and it deliberately knows
 * nothing about workers, React or canvases.
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

import { containsRegion, type PageRect } from "@shared/planRegion";

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
 * How much of the viewport the drawing must still cover, per axis, once it has
 * been panned past its own edge.
 *
 * **Panning past the edge is the point.** A sheet pinned so its edge can never
 * leave the pane cannot put its own corner where your eyes are — the middle of
 * the screen, which is the part anyone actually reads from — so the corner of a
 * zoomed drawing was only ever readable jammed against a bezel. It can be
 * dragged into the middle now, with empty ground behind it.
 *
 * **0.25, and per AXIS rather than by area.** A quarter of the width and a
 * quarter of the height must still have drawing on them:
 *
 * - Generous enough to do the job. Putting a corner of the sheet in the dead
 *   centre of the screen only needs half the viewport covered, so a quarter
 *   leaves real headroom past what the job asks for.
 * - Tight enough that the drawing is never a sliver. On the 1436x750 viewport
 *   focus mode gives, a quarter is 359 x 187 pixels — a large, obvious thing to
 *   grab and drag back, not a hairline against an edge.
 * - Per axis, because an AREA rule at the same number would permit a quarter of
 *   the width AND a quarter of the height at once: six percent of the screen, in
 *   one corner. Per axis always leaves a band across a whole edge.
 *
 * Fit still recentres exactly as it did, so there is always a way home — the
 * button, and the 0 key.
 */
export const MIN_VISIBLE_FRACTION = 0.25;

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
 *   someone shove a small sheet into a corner looks like a bug, not a feature,
 *   and a sheet small enough to see whole is not one anybody is repositioning.
 *
 *   Drawing LARGER — pan anywhere within it AND past its edges, with empty
 *   ground showing, until only `MIN_VISIBLE_FRACTION` of the viewport still has
 *   drawing on it. That last clause is the entire safety net: the drawing can
 *   be pushed aside but never away, so there is always a large piece of it on
 *   screen to drag back.
 *
 * Strict rather than elastic, still. The limit is a stop, not a rubber band —
 * an overshoot that springs back reads as slack on a screen whose whole job is
 * precision. What moved is where the stop is, not what happens when you reach
 * it.
 */
export function clampView(view: PlanView, bounds: ViewBounds): PlanView {
  const zoom = clampZoom(view.zoom);
  const scaledWidth = bounds.contentWidth * zoom;
  const scaledHeight = bounds.contentHeight * zoom;

  const axis = (offset: number, scaled: number, viewport: number): number => {
    if (!Number.isFinite(offset)) return 0;
    // Smaller than the viewport: centred, and the offset is not negotiable.
    if (scaled <= viewport) return (viewport - scaled) / 2;

    /*
      Larger. The drawing occupies [offset, offset + scaled] and the viewport is
      [0, viewport], so what has to stay above `keep` is the overlap between
      them. Reading that requirement backwards on each side gives both stops:

        pushed right — the overlap is (viewport - offset),
                       so offset <= viewport - keep
        pushed left  — the overlap is (offset + scaled),
                       so offset >= keep - scaled

      Setting keep = viewport reduces this to exactly the old clamp,
      [viewport - scaled, 0]. Edge-pinning was never a different rule — it was
      this one with the fraction set to all of it.
    */
    const keep = viewport * MIN_VISIBLE_FRACTION;
    return Math.min(viewport - keep, Math.max(keep - scaled, offset));
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

// ── Sharp re-render: which rectangle, at what resolution ─────────────────────
//
// Everything above is DISPLAY zoom — stretching a picture already drawn. What
// follows decides what to ask the worker to draw properly, and it is the other
// half of the design: stretch while moving, re-render sharp once still.
//
// The whole sheet cannot be the answer. Measured on a real 36x24 E-sheet, a
// page sharp enough for 260% zoom on an ordinary laptop needs 7.8x, which does
// not allocate at all — the browser refuses somewhere near a gigabyte of
// bitmap. A rectangle the size of the viewport costs about 26MB whatever the
// magnification, because the screen does not get bigger when you zoom in.
// See references/plan-viewer-overhaul.md § 4b.

/**
 * How much beyond the viewport to draw, as a fraction of the visible extent
 * added to each side.
 *
 * Purely about how often a render is triggered. Zero would re-render on every
 * pixel of pan; too much throws away the reason for drawing a region at all.
 * At 0.15 the bitmap is 1.69x the viewport's pixels — about 41MB on a 4K
 * screen at devicePixelRatio 2, comfortably inside `MAX_REGION_PIXELS` — and a
 * nudge of up to 15% of the screen costs nothing.
 */
export const REGION_MARGIN = 0.15;

/**
 * Wait this long after the last movement before asking for a sharp render.
 *
 * A wheel zoom or a drag throws off a stream of positions, and rendering for
 * each one would queue a minute of work for views nobody is looking at any
 * more. Long enough to sit out a gesture, short enough that stopping to read
 * something does not feel like waiting.
 */
export const REGION_SETTLE_MS = 150;

/**
 * How far the scale a bitmap was drawn at may sit from the scale wanted now
 * before it is redrawn, as a fraction.
 *
 * **This replaced rounding the scale up to a 0.25 step, and the reason was
 * measured rather than reasoned.** The step looked free: it kept a one-notch
 * wheel zoom from throwing away a perfectly good bitmap, and rounding UP meant
 * the picture was never coarser than asked for. But a bitmap DENSER than the
 * screen displays it is not sharper — the browser resamples it down, and a
 * one-pixel hairline resampled by a few percent turns grey. Measured live at
 * 97% zoom on a DPR-2 screen: the wanted scale was 2.91, the step gave 3.0,
 * and the patch was displayed at **1.0335 bitmap pixels per device pixel**.
 * Every line on the drawing softly resampled, on the one layer whose entire
 * job is to be sharp.
 *
 * So the scale asked for is exact now, and a bitmap counts as good only while
 * it is within this tolerance EITHER WAY. The tolerance exists so floating
 * point noise cannot make a region fail to match itself; it is deliberately
 * far tighter than a wheel notch, because a region render costs 25–96ms
 * (references/plan-viewer-overhaul.md § 4b) and a soft drawing costs the
 * estimator a miscount.
 */
export const SHARP_SCALE_TOLERANCE = 0.005;

/**
 * The part of the page on screen right now, in page points, grown by a margin.
 *
 * `baseScale` is the scale the backdrop canvas was drawn at, which is also what
 * turns its pixels into page points. Read it from the render that produced the
 * bitmap — never from a constant, which is the mistake this whole phase was
 * careful to design out.
 *
 * Returns a rect that may run past the page; the worker trims it, and reports
 * back what it actually drew.
 */
export function visibleRegion(
  view: PlanView,
  bounds: ViewBounds,
  baseScale: number,
  margin = REGION_MARGIN
): PageRect | null {
  if (!Number.isFinite(baseScale) || baseScale <= 0) return null;
  if (!Number.isFinite(view.zoom) || view.zoom <= 0) return null;
  if (!Number.isFinite(view.x) || !Number.isFinite(view.y)) return null;
  if (bounds.viewportWidth <= 0 || bounds.viewportHeight <= 0) return null;

  // A drawing point `p` lands at `view.x + p * zoom`, so the visible span is
  // that relationship read backwards — and then divided by `baseScale`, which
  // is how many canvas pixels one page point became.
  const toPoints = view.zoom * baseScale;
  const left = -view.x / toPoints;
  const top = -view.y / toPoints;
  const width = bounds.viewportWidth / toPoints;
  const height = bounds.viewportHeight / toPoints;

  return {
    x: left - width * margin,
    y: top - height * margin,
    width: width * (1 + margin * 2),
    height: height * (1 + margin * 2),
  };
}

/**
 * The render scale that makes the drawing 1:1 with the screen's real pixels.
 *
 * The backdrop canvas is displayed at its own pixel size in CSS pixels, so one
 * page point occupies `baseScale * zoom * devicePixelRatio` device pixels. A
 * bitmap drawn at exactly that is as sharp as the screen can show; anything
 * less is the softness this phase exists to remove.
 *
 * **devicePixelRatio is not optional here.** On a Retina or 4K laptop it is 2,
 * which doubles the scale needed for the same zoom — and it is why 260% looked
 * soft on the machine this was measured on while the arithmetic for a DPR-1
 * screen said it should have been fine.
 *
 * **Exact, never rounded.** Asking for more resolution than the screen can
 * show is not free insurance: the browser resamples the surplus away and the
 * drawing goes soft in the other direction. See `SHARP_SCALE_TOLERANCE`.
 */
export function sharpRenderScale(
  baseScale: number,
  zoom: number,
  devicePixelRatio: number
): number {
  const wanted = baseScale * zoom * devicePixelRatio;
  if (!Number.isFinite(wanted) || wanted <= 0) return 0;
  return wanted;
}

/**
 * Put a length in the untransformed drawing space onto a whole device pixel.
 *
 * `perDrawingPixel` is how many device pixels one unit of that space becomes
 * on screen — `zoom * devicePixelRatio` for anything inside the viewer's
 * single transform.
 *
 * **A bitmap drawn at exactly screen resolution is still resampled if its EDGE
 * falls between two device pixels.** Getting the scale right is half of 1:1;
 * getting the offset whole is the other half, and it is the half that is easy
 * to miss because all the arithmetic looks correct without it. Moving the
 * sharp patch by up to half a device pixel to land it on the grid is
 * invisible — it is a fraction of one screen pixel — and it is the difference
 * between a crisp line and a grey one.
 */
export function snapToDevicePixel(
  value: number,
  perDrawingPixel: number
): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(perDrawingPixel) || perDrawingPixel <= 0) return value;
  return Math.round(value * perDrawingPixel) / perDrawingPixel;
}

/**
 * What the sharp layer should be showing, or null when it should show nothing.
 *
 * Null is the ordinary case for a sheet fitted to the pane: the backdrop is
 * already drawn at a higher resolution than the screen is showing it at, so a
 * region render would cost seconds to change nothing. Zoomed out, there is
 * nothing to sharpen.
 */
export function wantedRegion(
  view: PlanView,
  bounds: ViewBounds,
  baseScale: number,
  devicePixelRatio: number
): { rect: PageRect; scale: number } | null {
  const scale = sharpRenderScale(baseScale, view.zoom, devicePixelRatio);
  // Not sharper than the backdrop already is — nothing to gain.
  if (scale <= baseScale) return null;
  const rect = visibleRegion(view, bounds, baseScale);
  if (!rect) return null;
  return { rect, scale };
}

/**
 * Is the region already drawn good enough for what is wanted now?
 *
 * Both halves matter: a bitmap that covers the view but was drawn for half
 * this zoom is soft, and one drawn sharply enough for a view 3,000 points
 * away is not on screen.
 *
 * **The scale test is two-sided**, which it was not. It used to accept
 * anything at least as sharp as wanted, and that quietly left an over-dense
 * bitmap on screen being resampled down — soft, for the opposite reason.
 * See `SHARP_SCALE_TOLERANCE`.
 *
 * `have` is the last ASK, never the bitmap that came back. The worker is
 * allowed to hand back a coarser scale than it was given when the budget says
 * so, and comparing against that would ask for the same impossible render for
 * ever.
 */
export function regionStillGood(
  have: { rect: PageRect; scale: number } | null,
  want: { rect: PageRect; scale: number },
  tolerance = SHARP_SCALE_TOLERANCE
): boolean {
  if (!have) return false;
  if (!(have.scale > 0) || !(want.scale > 0)) return false;
  if (Math.abs(have.scale / want.scale - 1) > tolerance) return false;
  return containsRegion(have.rect, want.rect);
}
