/**
 * THE ONE REFRESH for BidRidge starter updates (references/starter-offers-
 * plan.md § 3c). Every Accept, Accept all, Ignore and un-ignore goes through
 * this, never its own invalidate, so the Dashboard's "N starter updates
 * available", every Updates tab, the library lists the update wrote into, and
 * any Draft total it re-counted all let go together.
 *
 * Whole routers rather than single queries, on purpose: an Accept can write
 * a material, an assembly's recipe, a labor rate, a modifier or a run type,
 * and re-count a Draft's quantities. Naming each query is how a list added
 * next month gets missed and states yesterday's number (CLAUDE.md § "A test
 * that calls the server cannot see a screen showing yesterday's answer").
 */
import { useCallback } from "react";
import { trpc } from "@/lib/trpc";

export function useRefreshStarterOffers() {
  const utils = trpc.useUtils();
  return useCallback(
    () =>
      Promise.all([
        utils.starterOffers.invalidate(),
        utils.materials.invalidate(),
        utils.assemblies.invalidate(),
        utils.laborRates.invalidate(),
        utils.modifiers.invalidate(),
        utils.takeoffRunTypes.invalidate(),
        utils.bids.invalidate(),
        utils.takeoffSummary.invalidate(),
      ]),
    [utils]
  );
}
