/**
 * WHICH LAYOUT THE PLANS SCREEN IS IN — one rule, read through one hook.
 *
 * ── Three layouts since 2026-10-01 (references/device-audit.md) ─────────────
 * This overrides owner's answer 5 of
 * references/track-b-phone-and-readability-plan.md § 0 ("laptop layout held
 * sideways, phone layout held upright"). The owner's device brief of
 * 2026-10-01 asks for more: a tablet, EITHER way round, does everything —
 * counting, tracing, capture — with the drawing taking most of the screen and
 * the panel BESIDE it. An upright iPad given the phone's one-panel-at-a-time
 * layout could not see the drawing and the counts together.
 *
 * - PHONE when the window is narrower than 768 px, or a finger is the pointer
 *   and the SHORT side is under 600 px (a phone held sideways is still a
 *   phone: 844 x 390 has no room for a panel beside the drawing).
 * - TABLET when a finger is the pointer and the screen is bigger than that,
 *   held either way.
 * - LAPTOP otherwise — a mouse in a window 768 px or wider, as before.
 *
 * Here rather than as media queries in the page, so two components cannot
 * end up disagreeing about which layout they are in.
 */

export type PlansLayout = "phone" | "tablet" | "laptop";

export const PHONE_MAX_WIDTH = 767;

/** A finger device whose shorter side is below this is a phone. */
export const PHONE_MAX_SHORT_SIDE = 599;

export function plansLayout(input: {
  width: number;
  /** The window's height — with the width, which side is the short one. */
  height?: number;
  /** `(pointer: coarse)` — a finger is the main pointer. */
  coarse: boolean;
  /** `(orientation: portrait)`. Kept for callers; the short side decides. */
  portrait?: boolean;
}): PlansLayout {
  if (input.width <= PHONE_MAX_WIDTH) return "phone";
  if (!input.coarse) return "laptop";
  const shortSide = Math.min(input.width, input.height ?? input.width);
  return shortSide <= PHONE_MAX_SHORT_SIDE ? "phone" : "tablet";
}
