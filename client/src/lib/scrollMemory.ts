/**
 * "Back returns where you were" (owner, 2026-10-14) — including how far down
 * the list you were. Measured 2026-10-16: open the 4th bid down a scrolled
 * Dashboard, press Back, and the Dashboard came back at the top (1259 px →
 * 0), so the bid you just left had to be found again.
 *
 * The shell remembers each list's scroll position by its address and puts
 * it back when you come back to that list FROM A BID — by its Back button or
 * the browser's. Opening a list fresh from the menu starts at the top, as it
 * always did. The DOM half (which element scrolls, waiting for the rows to
 * arrive) lives in the shell; the decisions are here, where the suite can
 * reach them.
 */
import type { Route } from "@/lib/appRoutes";

/** The screens that belong to one bid. */
const BID_SCREENS: ReadonlySet<Route> = new Set<Route>([
  "bids",
  "takeoff",
  "count",
  "proposal",
]);

/** Whether arriving at `next` from `prev` should put the old position back. */
export function shouldRestoreScroll(prev: Route, next: Route): boolean {
  return BID_SCREENS.has(prev) && !BID_SCREENS.has(next);
}

/** Positions by address, newest kept; a handful is all Back ever needs. */
export function createScrollMemory(limit = 20) {
  const saved = new Map<string, number>();
  return {
    save(address: string, top: number) {
      saved.delete(address);
      saved.set(address, Math.max(0, Math.round(top)));
      while (saved.size > limit) {
        const oldest = saved.keys().next().value;
        if (oldest === undefined) break;
        saved.delete(oldest);
      }
    },
    get(address: string): number | null {
      return saved.get(address) ?? null;
    },
  };
}

/**
 * Where to scroll, given what has loaded so far: the saved position once the
 * list is tall enough to hold it, else null (wait for more rows). After the
 * wait runs out, as far as the list now goes — a list that shrank (a bid
 * deleted) must not leave somebody stranded below its end.
 */
export function restoreTarget(
  saved: number,
  scrollHeight: number,
  clientHeight: number,
  gaveUp: boolean
): number | null {
  const reachable = Math.max(0, scrollHeight - clientHeight);
  if (reachable >= saved) return saved;
  return gaveUp ? reachable : null;
}
