/**
 * A link to ONE SPOT on one sheet:
 * `#/bids/<id>/plans?set=<planSetId>&sheet=<page>&x=<pt>&y=<pt>`.
 *
 * Added 2026-10-01 for the reader-accuracy review page, which lists every AI
 * find that is not in the hand count and needs to take the estimator to each
 * one to say whose mistake it was.
 *
 * It is Track B's Plans address (@/lib/planAddress — `set` and `sheet`) with
 * a point added, so the screen's own address code opens the set and sheet,
 * on arrival and on a hash change alike; the plans screen then only centres
 * the point, zoomed in, and drops `x` and `y` from the address so a refresh
 * does not jump again. This used its own `pdf` / `page` names until the
 * address landed (merged 2026-10-01); two spellings for one place would have
 * been two pieces of code choosing the open sheet.
 *
 * Points are page points, as every mark is stored.
 */
import { planAddressHash, readPlanAddress } from "./planAddress";

export type PlanSpot = { pdfId: number; page: number; x: number; y: number };

export function planSpotHash(bidId: number, spot: PlanSpot): string {
  return (
    planAddressHash(bidId, spot.pdfId, spot.page) +
    `&x=${spot.x.toFixed(1)}&y=${spot.y.toFixed(1)}`
  );
}

/** The spot a hash asks for, or null if it asks for none or for nonsense. */
export function readPlanSpot(hash: string): PlanSpot | null {
  const at = hash.indexOf("?");
  if (at < 0) return null;
  const { setId, sheet } = readPlanAddress(hash);
  if (setId === null || sheet === null) return null;
  const q = new URLSearchParams(hash.slice(at + 1));
  // A missing x reads as Number(null) = 0, which is a real point; refuse it.
  const rawX = q.get("x");
  const rawY = q.get("y");
  if (rawX === null || rawY === null || rawX === "" || rawY === "") return null;
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { pdfId: setId, page: sheet, x, y };
}

/** The same hash without the point; the set and sheet stay. */
export function withoutPlanSpot(hash: string): string {
  const at = hash.indexOf("?");
  if (at < 0) return hash;
  const q = new URLSearchParams(hash.slice(at + 1));
  q.delete("x");
  q.delete("y");
  const rest = q.toString();
  return hash.slice(0, at) + (rest ? `?${rest}` : "");
}
