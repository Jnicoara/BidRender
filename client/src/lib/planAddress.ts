/**
 * WHERE THE PLANS SCREEN IS LOOKING, IN THE ADDRESS BAR — and the zoom it was
 * at, in this tab.
 *
 * Found 2026-09-30 by the owner: on page 5 of the third plan set, F5 (or
 * reopening the link) landed on the FIRST set's FIRST page. The set and page
 * lived only in React state, so a reload had nothing to come back to.
 *
 * - The address carries `?set=<plan set id>&sheet=<page>`, so a refresh or a
 *   shared link opens that sheet. Written with `replaceState`, never pushed:
 *   flipping sheets must not fill Back with forty sheet flips, so Back from
 *   the Plans screen still goes where it went before (the bid).
 * - A set or sheet that no longer exists — deleted, or a link from before it
 *   was — falls back to the first sheet of the first set, with no error. The
 *   address was a convenience; a refusal would turn it into a dead end.
 * - Zoom and position are remembered per TAB (sessionStorage), for the sheet
 *   that was open. A refresh comes back to them; a new tab or a shared link
 *   fits the sheet, because somebody else's zoom is not a place.
 *
 * Pure apart from the two storage helpers, which wrap every access in
 * try/catch (CLAUDE.md § browser storage).
 */

import { clampView, type PlanView, type ViewBounds } from "@/lib/planView";

export type PlanAddress = {
  /** A plan set's id (bid_pdfs.id), or null when the address names none. */
  setId: number | null;
  /** A 1-based page in that set, or null. */
  sheet: number | null;
};

function positiveInt(raw: string | null): number | null {
  if (raw === null || !/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Read set and sheet from a hash such as `#/bids/12/plans?set=3&sheet=5`. */
export function readPlanAddress(hash: string): PlanAddress {
  const at = hash.indexOf("?");
  if (at < 0) return { setId: null, sheet: null };
  const query = new URLSearchParams(hash.slice(at + 1));
  return {
    setId: positiveInt(query.get("set")),
    sheet: positiveInt(query.get("sheet")),
  };
}

/** The hash for one bid's Plans screen on one sheet. */
export function planAddressHash(
  bidId: number,
  setId: number | null,
  sheet: number
): string {
  const base = `#/bids/${bidId}/plans`;
  return setId === null ? base : `${base}?set=${setId}&sheet=${sheet}`;
}

/**
 * Whether a hash is this bid's Plans screen. The address is only rewritten
 * while it is — a write landing after the person has moved to another screen
 * would drag them back.
 */
export function isPlansAddressFor(hash: string, bidId: number): boolean {
  const path = hash.replace(/^#\/?/, "").split("?")[0].replace(/\/$/, "");
  return path === `bids/${bidId}/plans`;
}

/**
 * Which set and page to open, given what was asked for and what exists.
 *
 * - The set must be one of this bid's; otherwise the first set, page 1.
 * - The page must be inside the set when its page count is known; otherwise
 *   page 1. An unknown count (a set never opened, so its count was never
 *   recorded) keeps the page for now; TakeoffPage drops to page 1 when the
 *   file reports a count the page is past (`pageBeyondSet` below, the guard
 *   beside the address effect). The viewer does NOT clamp on its own.
 */
export function resolvePlanAddress(
  asked: PlanAddress,
  sets: readonly { id: number; pageCount: number | null }[]
): { setId: number | null; page: number } {
  const set = sets.find(s => s.id === asked.setId);
  if (!set) return { setId: sets[0]?.id ?? null, page: 1 };
  const page = asked.sheet ?? 1;
  if (pageBeyondSet(page, set.pageCount)) {
    return { setId: set.id, page: 1 };
  }
  return { setId: set.id, page };
}

/** True when a page is past the end of a set whose count is known. */
export function pageBeyondSet(page: number, pageCount: number | null): boolean {
  return pageCount !== null && pageCount > 0 && page > pageCount;
}

// ── Zoom and position, per tab ───────────────────────────────────────────────

export const PLAN_VIEW_KEY = "bidrender.takeoff.planView";

/**
 * A view stored by the drawing point at the CENTRE of the pane, not by the
 * raw offsets. Offsets are relative to the pane's corner, so after a reload
 * at a slightly different size (a scrollbar, a panel width) they would land
 * somewhere else; the centre point is what the person was looking at.
 */
export type RememberedView = {
  setId: number;
  page: number;
  zoom: number;
  /** Drawing pixels at the pane's centre. */
  cx: number;
  cy: number;
  /** The raster it was measured on — a different one is a different sheet. */
  contentWidth: number;
  contentHeight: number;
};

export function rememberView(
  setId: number,
  page: number,
  view: PlanView,
  bounds: ViewBounds
): RememberedView {
  return {
    setId,
    page,
    zoom: view.zoom,
    cx: (bounds.viewportWidth / 2 - view.x) / view.zoom,
    cy: (bounds.viewportHeight / 2 - view.y) / view.zoom,
    contentWidth: bounds.contentWidth,
    contentHeight: bounds.contentHeight,
  };
}

/**
 * The view to come back to, or null to fit. Null unless the remembered view
 * is for THIS set and page on the same raster — anything else is a guess
 * about where somebody was looking on a different drawing.
 */
export function restoreView(
  saved: unknown,
  setId: number,
  page: number,
  bounds: ViewBounds
): PlanView | null {
  if (!saved || typeof saved !== "object") return null;
  const s = saved as Partial<RememberedView>;
  const nums = [s.zoom, s.cx, s.cy, s.contentWidth, s.contentHeight];
  if (!nums.every(n => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  if (s.setId !== setId || s.page !== page) return null;
  if (
    s.contentWidth !== bounds.contentWidth ||
    s.contentHeight !== bounds.contentHeight
  ) {
    return null;
  }
  if (!(s.zoom! > 0)) return null;
  return clampView(
    {
      zoom: s.zoom!,
      x: bounds.viewportWidth / 2 - s.cx! * s.zoom!,
      y: bounds.viewportHeight / 2 - s.cy! * s.zoom!,
    },
    bounds
  );
}

export function readRememberedView(): unknown {
  try {
    const raw = window.sessionStorage.getItem(PLAN_VIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Null forgets it — a fitted view is not a place worth coming back to. */
export function writeRememberedView(view: RememberedView | null): void {
  try {
    if (view === null) window.sessionStorage.removeItem(PLAN_VIEW_KEY);
    else window.sessionStorage.setItem(PLAN_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Blocked storage: a refresh fits the sheet, as it always did.
  }
}
