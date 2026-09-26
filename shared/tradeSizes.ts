/**
 * The nine trade sizes every raceway family ships at, in ascending order.
 *
 * "Trade size" is a name, not a measurement — 1/2" EMT is neither 1/2" inside
 * nor out — so these strings are the identifiers, never numbers to compute on.
 *
 * Lives in shared/ (moved from server/seed/materials/types.ts, which still
 * re-exports it) because shared/renamedMaterials.ts builds the EMT fitting
 * renames from it, and shared code cannot reach into server/.
 */
export const TRADE_SIZES = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
] as const;

export type TradeSize = (typeof TRADE_SIZES)[number];
