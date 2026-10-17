/**
 * User levels — how a person works, which decides which screens the NAV
 * lists for them (references/user-levels-plan.md § 1, owner 2026-10-16:
 * picked at signup, switchable any time, not a pricing tier).
 *
 * THREE RULES this module exists to keep in one place:
 *
 * 1. **A level hides, it never locks.** Nothing on the server reads it, and
 *    a screen a level does not list still opens by link, with a line saying
 *    which level it belongs to (UL5). Your ROLE still decides what you may
 *    change; the level only decides what the menu offers.
 * 2. **Every level reaches every bid's totals and print.** The bid screen
 *    and its proposal are per-bid surfaces, reached from the bid, and no
 *    level hides them (`workLevel.test.ts`). This overrides the plan's first
 *    table, which hid the Proposal from Takeoff (owner's brief, night 4).
 * 3. **Unset is Pro.** Every existing person, and anyone with the feature
 *    switched off, sees exactly the menu they see today.
 *
 * `NAV_LEVEL` is a `Record<Route, …>`, so a new screen does not compile
 * until somebody decides which level lists it.
 */
import type { Route } from "@/lib/appRoutes";

export const WORK_LEVELS = ["takeoff", "estimate", "pro"] as const;
export type WorkLevel = (typeof WORK_LEVELS)[number];

/** Copy only — the stored key never changes (UL9: names are the owner's). */
export const WORK_LEVEL_LABEL: Record<WorkLevel, string> = {
  takeoff: "Takeoff",
  estimate: "Estimate",
  pro: "Pro",
};

export const WORK_LEVEL_BLURB: Record<WorkLevel, string> = {
  takeoff: "Count and measure from the plans. Bids, plans and your library.",
  estimate: "Price the work too: adds clients and labor rates.",
  pro: "Everything, including how your bids performed.",
};

/** What somebody who has not chosen is offered first (UL7). */
export const SUGGESTED_WORK_LEVEL: WorkLevel = "estimate";

const RANK: Record<WorkLevel, number> = { takeoff: 0, estimate: 1, pro: 2 };

/**
 * The first level whose menu lists each screen. Screens the menu never
 * lists (a bid, its count, plans and proposal; the welcome screen) are
 * `takeoff` — reachable at every level, which is rule 2. Crew and Admin
 * are `takeoff` too: the ROLE decides those, not the level (UL2).
 */
const NAV_LEVEL: Record<Route, WorkLevel> = {
  dashboard: "takeoff",
  "bid-list": "takeoff",
  "plans-index": "takeoff",
  bids: "takeoff",
  count: "takeoff",
  takeoff: "takeoff",
  proposal: "takeoff",
  "bid-archive": "takeoff",
  trash: "takeoff",
  "library-materials": "takeoff",
  "library-assemblies": "takeoff",
  settings: "takeoff",
  team: "takeoff",
  admin: "takeoff",
  // The Field role's Jobs list (B, 2026-10-16): the ROLE decides it.
  jobs: "takeoff",
  welcome: "takeoff",
  clients: "estimate",
  "library-labor-rates": "estimate",
  analytics: "pro",
};

/** The level a stored value means. NULL, unknown or feature off → Pro. */
export function levelOf(
  stored: string | null | undefined,
  featureOn: boolean
): WorkLevel {
  if (!featureOn) return "pro";
  return (WORK_LEVELS as readonly string[]).includes(stored ?? "")
    ? (stored as WorkLevel)
    : "pro";
}

/** Whether this level's menu lists the screen. */
export function levelLists(level: WorkLevel, route: Route): boolean {
  return RANK[level] >= RANK[NAV_LEVEL[route]];
}

/** The level a screen belongs to — for "This is part of Estimate". */
export function levelFor(route: Route): WorkLevel {
  return NAV_LEVEL[route];
}
