/**
 * Where a person lands after signing in.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * Routing is hash-based, and signing out does not touch the address. So someone
 * who signs out from Settings leaves `#/settings` sitting in the address bar,
 * the login form appears over the top, and the moment they sign back in the app
 * mounts onto that same address and drops them on Settings again. Nobody asked
 * to go there; it is simply where they happened to be standing.
 *
 * ── But a deep link IS a request ─────────────────────────────────────────────
 * Somebody who follows a link to `#/bids/12` while signed out, signs in, and
 * lands on the Dashboard has been ignored — they said exactly where they wanted
 * to go. So the rule cannot be "always the Dashboard".
 *
 * The two are told apart by WHEN the address was set, which is why this is two
 * functions rather than one clever guess:
 *
 *   • `addressAfterSignOut` runs at sign-out and wipes the leftover address, so
 *     what remains afterwards is only ever something the person asked for.
 *   • `landingAfterSignIn` then honours whatever is left, defaulting to the
 *     Dashboard when that is nothing in particular.
 *
 * Pure functions over the existing route model, so the rule can be tested
 * without a browser and cannot drift from what `pathToRoute` actually resolves.
 */
import { pathToRoute, routeToPath } from "./appRoutes";

/** Where the app opens when nothing specific was asked for. */
export const DEFAULT_LANDING = "/dashboard";

/**
 * The address to land on after a successful sign-in, given whatever the address
 * bar currently says.
 *
 * An unrecognised or retired address resolves to the Dashboard through
 * `pathToRoute`, so a stale bookmark cannot strand anyone — and the answer is
 * re-spelled through `routeToPath`, so what ends up in the address bar is the
 * canonical form of the screen rather than the raw text that was typed.
 */
export function landingAfterSignIn(hash: string | null | undefined): string {
  const asked = pathToRoute(hash ?? "");
  if (asked.route === "dashboard") return DEFAULT_LANDING;
  return routeToPath(asked.route, { id: asked.projectId, view: asked.view });
}

/**
 * What the address should say once somebody signs out.
 *
 * Deliberately not the screen they were on: they are no longer on it, and
 * leaving it there is what made the next sign-in land in the wrong place. It
 * also stops the address bar claiming a signed-out visitor is "on Settings".
 */
export function addressAfterSignOut(): string {
  return DEFAULT_LANDING;
}
