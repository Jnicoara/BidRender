/**
 * WHERE A RUN MEETS A DEVICE — the connect point, from code defaults
 * (references/connect-point-plan.md; built 2026-10-01 without schema).
 *
 * A wall receptacle is drawn standing OFF the wall, and the count mark sits at
 * the symbol's centre because that is where the estimator clicks. The pipe
 * goes to the box, in the wall. A run snapped to the centre ends short by the
 * stand-off, at both ends, on every wall device — a wrong number on the bid
 * with nothing on screen to say so.
 *
 * ── What this decides, and what it cannot yet ───────────────────────────────
 * Per-symbol connect points need columns Track A has not added (plan § 5:
 * `connectDx/Dy` on the look, `rotation`/`mirrored` on the mark). Until then
 * the answer comes from two things that need no storage:
 *
 *  1. The device FAMILY (shared/deviceFamily.ts — the same name > assembly >
 *     category order the pin shapes use) says whether the device is WALL
 *     mounted at all. A light, a J-box or a panel is met in the middle; a
 *     receptacle, a switch or a data outlet is met at the wall.
 *  2. For a wall device, the drawing's own LINE WORK says where the wall is:
 *     the nearest long straight segment within reach, and the run end goes to
 *     the foot of the perpendicular on it (plan § 4.1).
 *
 * A scan has no line work, and a wall device with no wall in reach keeps the
 * centre. Neither is silent: the result says which it is, and the overlay
 * draws the end that way (`connectLabel`).
 *
 * ── Nothing already stored moves ────────────────────────────────────────────
 * This only decides where a NEW snap lands. Run length reads the run's own
 * stored points, so every run traced before this keeps its length (plan § 6).
 */
import type { DeviceFamily } from "./deviceFamily";
import type { PagePoint } from "./takeoffGeometry";

export type Mounting = "wall" | "centre";

/**
 * The code default per family. "other" is fire alarm, security and anything
 * unrecognised — some on walls, some on ceilings — so it takes the centre: a
 * wrong guess toward a wall would ADD footage nobody drew.
 */
export const FAMILY_MOUNTING: Record<DeviceFamily, Mounting> = {
  receptacle: "wall",
  switch: "wall",
  data: "wall",
  box: "centre",
  lighting: "centre",
  equipment: "centre",
  other: "centre",
};

/**
 * How far from the mark a wall is looked for, and how long a segment must be
 * to count as one — in PAGE POINTS, because a symbol is drawn at a fixed
 * paper size whatever the scale.
 *
 * Measured 2026-10-01 on Weld 1 E-200 against the owner's hand marks
 * (scripts/connectPointCheck.mts; results in references/connect-point-plan.md
 * § 7, "Step 0 — measured"): every true stand-off was 4.3–5.3 pt, so 9 pt
 * reaches all of them and stops short of the 13.1 pt room-name rule a 14 pt
 * reach took for a wall. A wall is far longer than any symbol stroke (≤ 12 pt).
 */
export const WALL_REACH_POINTS = 9;
export const WALL_MIN_LENGTH_POINTS = 30;
/**
 * A long line closer than this runs THROUGH the symbol (a dashed edge it was
 * drawn over), not along the wall it stands against; the wall is further out.
 */
export const WALL_MIN_STANDOFF_POINTS = 3;

/** Just the part of a sheet's line work this reads (@/lib/vectorGeometry). */
export type SheetLines = {
  /** x1, y1, x2, y2 per segment, page points. */
  segs: ArrayLike<number>;
};

export type WallFoot = {
  point: PagePoint;
  distance: number;
  /** Which segment (index into `segs` / 4) — for checking by eye. */
  segment: number;
};

/**
 * The foot of the perpendicular from `at` on the nearest long segment within
 * `reach`, or null. The foot must fall INSIDE the segment, not past an end: a
 * line that runs up to the symbol and stops (a circuit, a leader) points AT
 * the centre, and its extension is not a wall.
 */
export function findWallFoot(
  lines: SheetLines,
  at: PagePoint,
  reach = WALL_REACH_POINTS,
  minLength = WALL_MIN_LENGTH_POINTS
): WallFoot | null {
  const s = lines.segs;
  let best: WallFoot | null = null;
  const minSq = minLength * minLength;
  for (let i = 0; i + 3 < s.length; i += 4) {
    const x1 = s[i];
    const y1 = s[i + 1];
    const dx = s[i + 2] - x1;
    const dy = s[i + 3] - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < minSq) continue;
    // Cheap reject: the mark is nowhere near this segment's bounding box.
    if (
      at.x < Math.min(x1, x1 + dx) - reach ||
      at.x > Math.max(x1, x1 + dx) + reach ||
      at.y < Math.min(y1, y1 + dy) - reach ||
      at.y > Math.max(y1, y1 + dy) + reach
    )
      continue;
    const t = ((at.x - x1) * dx + (at.y - y1) * dy) / lenSq;
    if (t <= 0 || t >= 1) continue;
    const fx = x1 + t * dx;
    const fy = y1 + t * dy;
    const distance = Math.hypot(at.x - fx, at.y - fy);
    if (distance > reach || distance < WALL_MIN_STANDOFF_POINTS) continue;
    if (!best || distance < best.distance)
      best = { point: { x: fx, y: fy }, distance, segment: i / 4 };
  }
  return best;
}

export type ConnectPoint =
  /** Met in the middle, by the family's default. Not a guess. */
  | { kind: "centre"; point: PagePoint }
  /** A wall device, met at the wall line found in the drawing. */
  | { kind: "wall"; point: PagePoint; standOff: number }
  /**
   * A wall device met at its centre, and the overlay says why: a scan, no
   * long line in reach, or the drawing not read yet. Short by the stand-off.
   */
  | {
      kind: "no-wall";
      point: PagePoint;
      reason: "scan" | "none-in-reach" | "reading";
    };

/** One mark as the worker is asked about it. */
export type ConnectMark = {
  id: number;
  x: number;
  y: number;
  family: DeviceFamily;
};

/**
 * Where a run meets this mark. `lines` is null when the sheet has no line
 * work to read (a scan).
 */
export function connectPointFor(
  mark: PagePoint,
  family: DeviceFamily,
  lines: SheetLines | null
): ConnectPoint {
  const centre = { x: mark.x, y: mark.y };
  if (FAMILY_MOUNTING[family] === "centre")
    return { kind: "centre", point: centre };
  if (!lines) return { kind: "no-wall", point: centre, reason: "scan" };
  const foot = findWallFoot(lines, mark);
  if (!foot) return { kind: "no-wall", point: centre, reason: "none-in-reach" };
  return { kind: "wall", point: foot.point, standOff: foot.distance };
}

/** What the worker answered, with the mark positions it was asked about. */
export type ConnectRead = ReadonlyMap<
  number,
  { x: number; y: number; connect: ConnectPoint }
>;

/**
 * Every mark's connect point on one sheet. A centre-mounted family needs no
 * reading. A wall device takes the worker's answer only if the mark is still
 * where it was when asked — a mark moved since is "reading" again, never the
 * old mark's wall.
 */
export function markConnects(
  marks: readonly ConnectMark[],
  read: ConnectRead | null
): Map<number, ConnectPoint> {
  const out = new Map<number, ConnectPoint>();
  for (const m of marks) {
    const centre = { x: m.x, y: m.y };
    if (FAMILY_MOUNTING[m.family] === "centre") {
      out.set(m.id, { kind: "centre", point: centre });
      continue;
    }
    const got = read?.get(m.id);
    out.set(
      m.id,
      got && got.x === m.x && got.y === m.y
        ? got.connect
        : { kind: "no-wall", point: centre, reason: "reading" }
    );
  }
  return out;
}

/**
 * The few words drawn at the cursor beside the snap ring — short, because
 * they sit on the drawing. Null for a centre-mounted device: meeting a light
 * in the middle is what everyone expects, and saying so on every one is noise.
 */
export function connectShortLabel(c: ConnectPoint): string | null {
  switch (c.kind) {
    case "centre":
      return null;
    case "wall":
      return "at the wall";
    case "no-wall":
      switch (c.reason) {
        case "scan":
          return "centre — scan, no wall lines";
        case "none-in-reach":
          return "centre — no wall found";
        case "reading":
          return "centre — reading the drawing…";
      }
  }
}

/** What the ring says, in the estimator's words. */
export function connectLabel(c: ConnectPoint): string {
  switch (c.kind) {
    case "centre":
      return "Meets this device at its centre";
    case "wall":
      return "Meets this device at the wall";
    case "no-wall":
      switch (c.reason) {
        case "scan":
          return "At the symbol's centre — a scan has no wall lines to find; Alt places the point yourself";
        case "none-in-reach":
          return "At the symbol's centre — no wall found beside it; Alt places the point yourself";
        case "reading":
          return "At the symbol's centre — still reading the drawing for the wall";
      }
  }
}
