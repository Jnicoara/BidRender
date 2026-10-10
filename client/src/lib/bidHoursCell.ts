/**
 * What a bid line's HOURS cell says — one decision, read by `BidsPage`, kept
 * here because vitest can reach `client/src/lib` and cannot reach a page
 * (CLAUDE.md § "a rule with no red to go to is an instruction").
 *
 * Unset hours are never "0 h" (CLAUDE.md § Editing fields rule 6, D1). Each
 * kind of line has its own words because each has its own fix:
 *
 *   cannotPrice     the engine could not price the line at all
 *   runLaborUnset   a traced line whose part has no labor unit ("Not priced")
 *   handHoursNotSet a line priced BY HAND — a free count, or a remove /
 *                   relocate line — with no hours typed. Its fix is the hours
 *                   box on the line itself. This read "0 h" on a free count
 *                   until 2026-10-10: the branch existed for role lines only.
 *   assemblyHoursNotSet an assembly whose hours were not set when added
 *   inRunRate       a coupling, connector or strap — the run's rate pays it
 *   hours           a real figure, a typed 0 included
 */
import { canPriceByHand, lineNeedsHours } from "@shared/handPricedLines";
import { lineHoursNotSet, lineHoursUnset } from "@shared/lineNotPriced";
import { laborInRunRate } from "@shared/runFittings";

export type BidHoursCell =
  | "cannotPrice"
  | "runLaborUnset"
  | "handHoursNotSet"
  | "assemblyHoursNotSet"
  | "inRunRate"
  | "hours";

export function bidHoursCell(line: {
  breakdown: unknown;
  qty: string | number;
  assemblyId: number | null;
  takeoffRunTypeId: number | null;
  runMaterialRole: string | null;
  snapshotMaterialCost: string | number | null;
  snapshotLaborHours: string | number | null;
}): BidHoursCell {
  if (line.breakdown === null) return "cannotPrice";
  if (lineHoursUnset(line)) return "runLaborUnset";
  if (canPriceByHand(line) && lineNeedsHours(line)) return "handHoursNotSet";
  if (lineHoursNotSet(line)) return "assemblyHoursNotSet";
  if (line.takeoffRunTypeId !== null && laborInRunRate(line.runMaterialRole))
    return "inRunRate";
  return "hours";
}
