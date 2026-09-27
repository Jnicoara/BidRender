/**
 * WHERE A NEW LEG STARTS (D20, answer 5) — the snap, as a pure function.
 *
 * The first click of a new leg is resolved here, in this order:
 *
 *   1. A MARK within reach. If it sits along a leg of this run, the branch
 *      tees off there and the mark IS the box ("mark": nothing new bought).
 *      Otherwise the leg starts at the mark, as a run end links to one.
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
export type SnapStamp = { id: number; x: number; y: number };

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
  const stamp = stamps
    .map(s => ({ s, d: dist(at, s) }))
    .filter(c => c.d <= tolerance)
    .sort((a, b) => a.d - b.d)[0]?.s;
  if (stamp) {
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
    return {
      kind: "stamp",
      stampId: stamp.id,
      point: { x: stamp.x, y: stamp.y },
    };
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
