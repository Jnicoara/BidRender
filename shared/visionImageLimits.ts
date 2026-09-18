/**
 * How big an image is worth sending, and what it will cost.
 *
 * ── The ceiling is the point ─────────────────────────────────────────────────
 * A vision model does not charge by the pixel without limit. It cuts the image
 * into 28x28 squares and charges one token per square — so the cost is
 * `ceil(w/28) * ceil(h/28)` — and it refuses to look at more squares than its
 * budget allows. An image over that budget is not rejected; it is silently
 * SHRUNK until it fits, and the reply comes back as if nothing happened.
 *
 * That last sentence is the whole reason this file exists. Sending a bigger
 * picture past the ceiling costs upload time and JPEG bytes and buys nothing,
 * and nothing anywhere reports it. The only way to know is to do the
 * arithmetic first, which is what `fitToModel` is for.
 *
 * ── Measured consequences, so the numbers are arguable ───────────────────────
 * On a 36x24 inch E-sheet (the real size of every sheet in the Old Blueridge
 * set), with a receptacle symbol's circle measured at 0.17 inches across:
 *
 *   - Sent whole at the old 1600px cap: 44 px per paper inch, and that symbol
 *     arrives 7.6 pixels wide. The filled-vs-hollow distinction is a coin flip
 *     and the label beside it is gone.
 *   - Sent whole at this file's answer for Sonnet 5: 2352x1568, which is 65 px
 *     per paper inch and an 11-pixel symbol, for about half a cent more.
 *   - There is no third option. 2352x1568 IS the ceiling for one image of a
 *     36x24 sheet on this model. Past it the server shrinks it back.
 *
 * Getting more detail than that means sending several images of PARTS of the
 * sheet — which is the tiling work, and which will size its tiles with
 * `largestSquareTile` below rather than with a second copy of this arithmetic.
 *
 * ── These limits are a local copy and they go stale ──────────────────────────
 * Same standing as `shared/aiPricing.ts`: copied from Anthropic's published
 * documentation, with nothing here that would notice them changing. An unknown
 * model falls back to the SMALLER (standard) tier on purpose — under-sending
 * wastes some detail, over-sending gets silently shrunk and wastes the upload,
 * and of the two, the one that still produces a correct answer is the right
 * default.
 */

/** What one model tier will look at. */
export type VisionLimits = {
  /** Neither side may exceed this, in pixels. */
  maxEdge: number;
  /** Nor may `ceil(w/28) * ceil(h/28)` exceed this. */
  maxTokens: number;
};

/** The square the model's cost is counted in. */
export const VISION_PATCH_PX = 28;

/**
 * Models before Opus 4.7 / Sonnet 5.
 *
 * Note how tight this is: 1568 tokens is about 39x39 patches, so the biggest
 * SQUARE image such a model will look at is roughly 1092x1092. That is a third
 * of the high-resolution tier's area, and it is why a cheaper model is not
 * automatically a cheaper reading — it needs about four times as many tiles to
 * cover the same drawing, which eats most of the per-token saving.
 */
export const STANDARD_TIER: VisionLimits = { maxEdge: 1568, maxTokens: 1568 };

/** Opus 4.7 and later, and Sonnet 5. Roughly three times the area. */
export const HIGH_RESOLUTION_TIER: VisionLimits = {
  maxEdge: 2576,
  maxTokens: 4784,
};

/**
 * Which tier each model the app can be pointed at sits in.
 *
 * Keyed by the exact id sent, including any pinned date suffix, for the same
 * reason `shared/aiPricing.ts` is: a model swap must not silently keep the old
 * model's geometry. An id that is not here is treated as standard tier — see
 * the file header for why that direction is the safe one.
 */
export const MODEL_VISION_LIMITS: Record<string, VisionLimits> = {
  "claude-sonnet-5": HIGH_RESOLUTION_TIER,
  "claude-opus-5": HIGH_RESOLUTION_TIER,
  "claude-haiku-4-5": STANDARD_TIER,
  "claude-haiku-4-5-20251001": STANDARD_TIER,
};

/** The limits for a model id, defaulting down rather than up. */
export function visionLimitsFor(model: string): VisionLimits {
  return MODEL_VISION_LIMITS[model] ?? STANDARD_TIER;
}

/** True when this model's image geometry is being guessed rather than known. */
export function unknownVisionModel(model: string): boolean {
  return !MODEL_VISION_LIMITS[model];
}

/** What an image of this size costs, in visual tokens. */
export function countImageTokens(width: number, height: number): number {
  return (
    Math.ceil(width / VISION_PATCH_PX) * Math.ceil(height / VISION_PATCH_PX)
  );
}

/** Whether an image of this size passes through untouched. */
function fits(width: number, height: number, limits: VisionLimits): boolean {
  return (
    Math.ceil(width / VISION_PATCH_PX) * VISION_PATCH_PX <= limits.maxEdge &&
    Math.ceil(height / VISION_PATCH_PX) * VISION_PATCH_PX <= limits.maxEdge &&
    countImageTokens(width, height) <= limits.maxTokens
  );
}

/**
 * Round half to even.
 *
 * `Math.round` rounds a .5 up; the server rounds it to the even neighbour. The
 * difference is one pixel, on the small number of aspect ratios that land
 * exactly on a half — and one pixel is enough to make the size computed here
 * disagree with the size the server actually used, which moves every position
 * the model reports. Cheap to get right, annoying to find later.
 */
function roundTiesToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The largest version of this image the model will look at whole.
 *
 * Returns the size unchanged when it already fits, so a caller can compare and
 * skip the resize. Never returns something LARGER than it was given: this
 * answers "how much of what I have is worth sending", not "how big should I
 * render" — upscaling a raster invents detail that was never on the drawing,
 * which is exactly the kind of confident-looking wrongness the plan reader's
 * confidence rules exist to prevent.
 */
export function fitToModel(
  width: number,
  height: number,
  limits: VisionLimits
): { width: number; height: number } {
  if (fits(width, height, limits)) return { width, height };

  if (height > width) {
    const flipped = fitToModel(height, width, limits);
    return { width: flipped.height, height: flipped.width };
  }

  // Binary search the long edge for the largest aspect-preserving size that
  // fits. Solving it directly looks tempting and gets the ceilings wrong at the
  // boundary, because both constraints are step functions in units of 28.
  const aspect = width / height;
  let lo = 1; // always fits
  let hi = width; // never fits
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid, Math.max(roundTiesToEven(mid / aspect), 1), limits)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { width: lo, height: Math.max(roundTiesToEven(lo / aspect), 1) };
}

/**
 * The biggest square tile this model takes without shrinking it.
 *
 * For the tiling work (§10-11 of the plan viewer overhaul). A tile any bigger
 * is shrunk back to this on arrival, so this is the size at which a tile
 * carries the most drawing per token — 1932px on Sonnet 5, 1092px on Haiku.
 */
export function largestSquareTile(limits: VisionLimits): number {
  let patches = 1;
  while (
    (patches + 1) * VISION_PATCH_PX <= limits.maxEdge &&
    (patches + 1) * (patches + 1) <= limits.maxTokens
  ) {
    patches++;
  }
  return patches * VISION_PATCH_PX;
}
