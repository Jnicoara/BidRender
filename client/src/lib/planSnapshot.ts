/**
 * Turning the page the viewer already drew into something the plan reader can
 * be sent.
 *
 * ── Reuse the raster, do not make a second one ───────────────────────────────
 * The worker has already spent 0.5–13 seconds rasterising this page. Rendering
 * it again at a different scale to feed the reader would pay that twice and put
 * a second decode on the main thread, so the canvas on screen IS the source.
 *
 * ── Why it is downscaled, and why the old reasoning was wrong ───────────────
 * A full-size E-sheet at 1.5× is several thousand pixels on the long edge and a
 * multi-megabyte PNG, so it is downscaled before being sent. What this used to
 * do was cap the long edge at a flat 1600px, on the reasoning that "past
 * roughly 1600px the extra pixels stop telling a vision model anything it did
 * not already have". Measured on the real Old Blueridge sheets, that was not
 * true and was costing real accuracy:
 *
 *   - Those sheets are 36x24 inches, and a receptacle symbol's circle measures
 *     0.17 inches across. At 1600px the sheet arrives at 44 pixels per paper
 *     inch, so that circle is 7.6 PIXELS WIDE. Filled versus hollow — which is
 *     the difference between two different devices — is a coin flip at that
 *     size, and the label beside it is gone entirely.
 *   - The model would happily have looked at more. Its own ceiling for one
 *     image of a 36x24 sheet is 2352x1568 (see `shared/visionImageLimits.ts`),
 *     which is 47% more detail in each direction for about half a cent.
 *
 * So the cap is no longer a constant. It is whatever the model being called
 * will actually look at, computed from the page's own shape. Sending more than
 * that is not an option worth having: the server shrinks an oversized image
 * back down and says nothing, so the extra bytes buy nothing at all.
 *
 * This still does not make a shrunk whole sheet good enough to count from. It
 * makes it as good as one image can be. Getting further means sending several
 * images of PARTS of the sheet, which is the tiling work.
 *
 * JPEG rather than PNG: line art compresses badly as JPEG in theory and still
 * lands far smaller in practice, and the quality here is chosen to stay above
 * the point where compression artefacts start inventing marks. Measured at the
 * new size on a real 36x24 scan, the encoded page is well under the router's
 * `MAX_IMAGE_CHARS` ceiling with room to spare.
 */
import { fitToModel, visionLimitsFor } from "@shared/visionImageLimits";

/** JPEG quality. High enough that compression does not create device symbols. */
export const SNAPSHOT_QUALITY = 0.82;

export type PlanSnapshot = {
  /** A data URL, ready to hand to the server. */
  image: string;
  /** The page's real size in PDF points, so 0–1 positions become page points. */
  pageWidthPoints: number;
  pageHeightPoints: number;
};

/**
 * Snapshot the drawn page.
 *
 * Returns null rather than throwing when the canvas is not ready or the browser
 * refuses to export it: a page that cannot be snapshotted simply cannot be read
 * yet, and the panel says so. Nothing else on the screen depends on this.
 */
export function snapshotPage(
  canvas: HTMLCanvasElement | null,
  renderScale: number,
  model: string
): PlanSnapshot | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  if (!Number.isFinite(renderScale) || renderScale <= 0) return null;

  // `fitToModel` never returns anything larger than it was given, so a canvas
  // already smaller than the model's ceiling passes through untouched rather
  // than being upscaled into detail the drawing never had.
  const fitted = fitToModel(
    canvas.width,
    canvas.height,
    visionLimitsFor(model)
  );
  const width = Math.max(1, fitted.width);
  const height = Math.max(1, fitted.height);

  try {
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const context = target.getContext("2d");
    if (!context) return null;
    // White underneath: a JPEG has no alpha, and an unpainted background
    // exports as black, which turns a plan into a negative.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);

    return {
      image: target.toDataURL("image/jpeg", SNAPSHOT_QUALITY),
      pageWidthPoints: canvas.width / renderScale,
      pageHeightPoints: canvas.height / renderScale,
    };
  } catch {
    return null;
  }
}
