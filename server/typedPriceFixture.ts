import { priceWrite } from "../shared/packPricing";
import type { PricedWrite } from "./db";

/**
 * A per-unit price, typed by `actorUserId`, as the price door takes it
 * (db.updateMaterial / createMaterial). For tests: a fixture prices a row the
 * way the app does, through the door, so it cannot build a row the app could
 * not have written.
 */
export function typedPrice(amount: number, actorUserId: number): PricedWrite {
  return {
    write: priceWrite({ typed: "unit", amount }),
    why: { source: "typed", actorUserId },
  };
}
