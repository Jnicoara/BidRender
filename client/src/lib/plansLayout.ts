/**
 * WHICH LAYOUT THE PLANS SCREEN IS IN — one rule, read through one hook
 * (references/track-b-phone-and-readability-plan.md § 3, owner's answer 5:
 * "laptop layout held sideways, phone layout held upright").
 *
 * A plain width breakpoint cannot say that: an upright iPad is 768–834 px,
 * right on Tailwind's `md`. So:
 *
 * - PHONE when the window is narrower than 768 px, or the pointer is a finger
 *   AND the screen is upright;
 * - LAPTOP otherwise — including a sideways tablet.
 *
 * Here rather than as media queries in the page, so two components cannot
 * end up disagreeing about which layout they are in.
 */

export type PlansLayout = "phone" | "laptop";

export const PHONE_MAX_WIDTH = 767;

export function plansLayout(input: {
  width: number;
  /** `(pointer: coarse)` — a finger is the main pointer. */
  coarse: boolean;
  /** `(orientation: portrait)`. */
  portrait: boolean;
}): PlansLayout {
  if (input.width <= PHONE_MAX_WIDTH) return "phone";
  return input.coarse && input.portrait ? "phone" : "laptop";
}
