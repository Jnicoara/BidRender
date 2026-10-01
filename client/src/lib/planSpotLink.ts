/**
 * A link to ONE SPOT on one sheet: `#/bids/<id>/plans?pdf=<id>&page=<n>&x=<pt>&y=<pt>`.
 *
 * Added 2026-10-01 for the reader-accuracy review page, which lists every AI
 * find that is not in the hand count and needs to take the estimator to each
 * one to say whose mistake it was. The plans screen does the rest exactly as
 * the drops readout's jump does: open the plan set, open the page, centre the
 * spot zoomed in, ring it.
 *
 * Plan set and page rather than a sheet id, because those are what the
 * screen selects by (`setSelectedDocId`, `setPage`), and the review script
 * has both to hand. Points are page points, as every mark is stored.
 *
 * The screen strips these from the address once it has jumped, so a reload
 * does not jump again and a bookmark is the plain plans screen.
 */
export type PlanSpot = { pdfId: number; page: number; x: number; y: number };

export function planSpotHash(bidId: number, spot: PlanSpot): string {
  const q = new URLSearchParams({
    pdf: String(spot.pdfId),
    page: String(spot.page),
    x: spot.x.toFixed(1),
    y: spot.y.toFixed(1),
  });
  return `#/bids/${bidId}/plans?${q.toString()}`;
}

/** The spot a hash asks for, or null if it asks for none or for nonsense. */
export function readPlanSpot(hash: string): PlanSpot | null {
  const at = hash.indexOf("?");
  if (at < 0) return null;
  const q = new URLSearchParams(hash.slice(at + 1));
  const pdfId = Number(q.get("pdf"));
  const page = Number(q.get("page"));
  const x = Number(q.get("x"));
  const y = Number(q.get("y"));
  if (!Number.isInteger(pdfId) || pdfId <= 0) return null;
  if (!Number.isInteger(page) || page <= 0) return null;
  // A missing x reads as Number(null) = 0, which is a real point; refuse it.
  if (q.get("x") === null || q.get("y") === null) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { pdfId, page, x, y };
}

/** The same hash without the spot, other query params kept. */
export function withoutPlanSpot(hash: string): string {
  const at = hash.indexOf("?");
  if (at < 0) return hash;
  const q = new URLSearchParams(hash.slice(at + 1));
  for (const k of ["pdf", "page", "x", "y"]) q.delete(k);
  const rest = q.toString();
  return hash.slice(0, at) + (rest ? `?${rest}` : "");
}
