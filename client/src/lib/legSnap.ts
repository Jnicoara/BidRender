/**
 * WHERE A NEW LEG STARTS (D20, answer 5) — the snap, as a pure function.
 *
 * The first click of a new leg is resolved here, in this order:
 *
 *   1. A MARK within reach. If it sits along a leg of this run, the branch
 *      tees off there and the mark IS the box ("mark": nothing new bought).
 *      Otherwise the leg starts at the mark's CONNECT POINT — at the wall for
 *      a wall device (shared/connectPoint.ts, 2026-10-01), as a run end
 *      links to one.
 *   2. An END of a leg of this run: a tee at that end (a box where the route
 *      carries on, or a cross if a tee is already there).
 *   3. A point ALONG a leg of this run: a tee there, cutting the leg.
 *   4. Nothing in reach: a free start, with a line end of its own.
 *
 * Alt skips all of it and places a free point. Only THIS run's legs are
 * candidates — snapping onto another run is not offered (answer 5).
 *
 * The same function answers the hover preview and the click, so what the ring
 * shows before the click is what the click does. In `client/src/lib` so the
 * suite can reach it; the rule is the part worth a test.
 */
import { projectOntoPath } from "@shared/runNetwork";
import type { PagePoint } from "@shared/takeoffGeometry";
import { markIsSnapTarget, type MarkStatus } from "@shared/markStatus";

export type LegSnap =
  | {
      kind: "free";
      point: PagePoint;
      /**
       * On a QUANTITY trace (D21): the start landed on the trace itself. It
       * is still a free start — no tee, no box — but the ring says it joins,
       * and no drop is proposed there.
       */
      joined?: true;
    }
  | { kind: "stamp"; stampId: number; point: PagePoint }
  | {
      kind: "tee";
      hostRunId: number;
      /** Where the tee goes: ON the host's path, never where the click was. */
      point: PagePoint;
      /** "end" when the tee stands at an end of the host rather than cutting it. */
      where: "along" | "end";
      fitting: "box" | "mark";
      stampId: number | null;
    };

export type SnapLeg = { id: number; points: readonly PagePoint[] };
export type SnapStamp = {
  id: number;
  x: number;
  y: number;
  /**
   * The mark's status (NULL = new). REQUIRED, not optional, on purpose: every
   * list of snap targets must say it, so a new caller cannot forget it and
   * quietly let a run snap to an unconfirmed mark (shared/markStatus.ts).
   */
  status: MarkStatus | null;
  /**
   * Where a run MEETS this device (shared/connectPoint.ts) — at the wall for a
   * wall receptacle, switch or data outlet whose wall was found in the
   * drawing. Omitted, the run meets it at the mark, as before.
   */
  connect?: PagePoint;
};

/**
 * The mark a click lands on, and the point the run takes from it: its connect
 * point, never blindly its centre. ONE function for every place a run snaps to
 * a mark — a leg's start, an ordinary trace click and an end dragged and let
 * go — so a click and a drag can never put the same end in two places.
 *
 * Judged by distance to the MARK, which is what the estimator aims at; the
 * point returned may be a few points away from it, at the wall.
 */
export function snapToMark(
  at: PagePoint,
  tolerance: number,
  stamps: readonly SnapStamp[]
): { stamp: SnapStamp; point: PagePoint } | null {
  let best: SnapStamp | null = null;
  let bestD = tolerance;
  for (const s of stamps) {
    // Never an UNCONFIRMED mark: a snap copies the mark's spot into the run,
    // so a misplaced AI mark would become a wrong length (shared/markStatus.ts
    // rule 2; todo.md WRONG-NUMBER RISK). The click lands where it was made.
    if (!markIsSnapTarget(s.status)) continue;
    const d = Math.hypot(at.x - s.x, at.y - s.y);
    if (d <= bestD && (!best || d < bestD)) {
      best = s;
      bestD = d;
    }
  }
  if (!best) return null;
  const point = best.connect ?? { x: best.x, y: best.y };
  return { stamp: best, point: { x: point.x, y: point.y } };
}

export function resolveLegStart(input: {
  at: PagePoint;
  /** Snap reach in PAGE points — the screen radius divided by the zoom. */
  tolerance: number;
  legs: readonly SnapLeg[];
  stamps: readonly SnapStamp[];
  free: boolean;
}): LegSnap {
  const { at, tolerance, legs, stamps } = input;
  if (input.free) return { kind: "free", point: { ...at } };

  const dist = (a: PagePoint, b: PagePoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const ends = (leg: SnapLeg) =>
    leg.points.length === 0
      ? []
      : [leg.points[0], leg.points[leg.points.length - 1]];

  // 1. A mark.
  const onMark = snapToMark(at, tolerance, stamps);
  if (onMark) {
    const stamp = onMark.stamp;
    for (const leg of legs) {
      const hit = projectOntoPath(leg.points, stamp);
      if (!hit || hit.distance > tolerance) continue;
      const atEnd = ends(leg).some(e => dist(e, hit.point) <= tolerance);
      if (!atEnd)
        return {
          kind: "tee",
          hostRunId: leg.id,
          point: hit.point,
          where: "along",
          fitting: "mark",
          stampId: stamp.id,
        };
    }
    // At its connect point: a leg that starts at a wall receptacle starts at
    // the box in the wall, not at the middle of the drawing of it.
    return { kind: "stamp", stampId: stamp.id, point: onMark.point };
  }

  // 2. An end of a leg.
  let bestEnd: { leg: SnapLeg; point: PagePoint; d: number } | null = null;
  for (const leg of legs) {
    for (const end of ends(leg)) {
      const d = dist(at, end);
      if (d <= tolerance && (!bestEnd || d < bestEnd.d))
        bestEnd = { leg, point: end, d };
    }
  }
  if (bestEnd)
    return {
      kind: "tee",
      hostRunId: bestEnd.leg.id,
      point: { ...bestEnd.point },
      where: "end",
      fitting: "box",
      stampId: null,
    };

  // 3. Along a leg.
  let bestAlong: { leg: SnapLeg; point: PagePoint; d: number } | null = null;
  for (const leg of legs) {
    const hit = projectOntoPath(leg.points, at);
    if (
      hit &&
      hit.distance <= tolerance &&
      (!bestAlong || hit.distance < bestAlong.d)
    )
      bestAlong = { leg, point: hit.point, d: hit.distance };
  }
  if (bestAlong) {
    /*
      A corner within reach wins over the path beside it. A tee a hair off a
      corner would cut there, leave the corner on one piece and count an
      elbow the box already makes; on the corner, the box turns the pipe.
    */
    const corner = bestAlong.leg.points
      .slice(1, -1)
      .find(p => dist(p, bestAlong!.point) <= tolerance);
    return {
      kind: "tee",
      hostRunId: bestAlong.leg.id,
      point: corner ? { ...corner } : bestAlong.point,
      where: "along",
      fitting: "box",
      stampId: null,
    };
  }

  // 4. Free.
  return { kind: "free", point: { ...at } };
}

/** What the pill says the next click will do, in the estimator's words. */
/**
 * The same snap on a QUANTITY trace (D21, answer 2): a leg that starts on the
 * trace joins it with no tee and no box, and one that starts on a mark does
 * not claim the mark — a quantity trace has no end identity to link. Both
 * become free starts at the snapped point, so the drawing still lines up.
 */
export function quantitySnap(snap: LegSnap): LegSnap {
  if (snap.kind === "free") return snap;
  if (snap.kind === "tee")
    return { kind: "free", point: { ...snap.point }, joined: true };
  return { kind: "free", point: { ...snap.point } };
}

/**
 * How a NEW run's start is saved (owner, 2026-10-07, case a: "run passes
 * THROUGH a box = TWO drops there").
 *
 * A first click that snapped onto a MARK starts at that box: the start is
 * linked to the mark and saved with NO kind, so it reads what the mark's
 * count says the device is and counts the rise back up — the second of the
 * two drops a pass-through makes. Any other start keeps the toolbar's
 * "From". A quantity trace is level at every unanswered end (D21) and is
 * never linked here.
 *
 * Until 2026-10-07 every start took the sticky "From" (Nothing by default),
 * so a run through a receptacle counted one drop.
 */
export function newRunStart(input: {
  snap: LegSnap | null;
  fromKind: string | null;
  quantity: boolean;
}): { startKind: string | null; startStampId: number | null } {
  if (input.quantity) return { startKind: null, startStampId: null };
  if (input.snap?.kind === "stamp")
    return { startKind: null, startStampId: input.snap.stampId };
  return { startKind: input.fromKind, startStampId: null };
}

/** The claim each MOVED end of an edited run sends; an absent end did not move. */
export type EndClaims = {
  startStampId?: number | null;
  endStampId?: number | null;
};

/**
 * Which mark each end of an edited run sits on, for the ends that MOVED
 * (Track B Gap 1, 2026-10-07). A run end that claims a mark takes that box's
 * drop and holds back the box's own; the claim used to stay put when the end
 * was dragged away, so the drop came from a box the run no longer touched.
 *
 * An end that moved claims the mark it now sits on — the one whose connect
 * point it was snapped to, else the one `snapToMark` finds in reach (so an
 * unconfirmed mark never) — or NOTHING, which is sent as null so the server
 * lets the old one go. An end that did not move is left out and keeps its
 * claim. A tee end belongs to no mark (D20) and is never sent.
 */
export function endClaimsAfterEdit(input: {
  before: readonly PagePoint[];
  after: readonly PagePoint[];
  teeEnds: { start: boolean; end: boolean };
  tolerance: number;
  stamps: readonly SnapStamp[];
}): EndClaims {
  const { before, after, stamps } = input;
  const claimAt = (p: PagePoint): number | null => {
    // Exactly on a mark's meeting point: the drag's snap put it there.
    const exact = stamps.find(s => {
      if (!markIsSnapTarget(s.status)) return false;
      const at = s.connect ?? s;
      return at.x === p.x && at.y === p.y;
    });
    if (exact) return exact.id;
    return snapToMark(p, input.tolerance, stamps)?.stamp.id ?? null;
  };
  const same = (a: PagePoint | undefined, b: PagePoint | undefined) =>
    !!a && !!b && a.x === b.x && a.y === b.y;
  const claims: EndClaims = {};
  if (after.length === 0) return claims;
  const start = after[0];
  const end = after[after.length - 1];
  if (!input.teeEnds.start && !same(before[0], start))
    claims.startStampId = claimAt(start);
  if (!input.teeEnds.end && !same(before[before.length - 1], end))
    claims.endStampId = claimAt(end);
  return claims;
}

export function legSnapLabel(snap: LegSnap): string {
  switch (snap.kind) {
    case "free":
      return snap.joined
        ? "Joins the trace here — no box, no drop"
        : "New start — not joined to the run";
    case "stamp":
      return "Starts at this mark";
    case "tee":
      if (snap.fitting === "mark")
        return "Branch — tees off at this mark's box";
      return snap.where === "end"
        ? "Branch — box at this end of the run"
        : "Branch — box on the run here";
  }
}
