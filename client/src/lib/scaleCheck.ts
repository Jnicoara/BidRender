/**
 * SCALE CHECK — a wrong-length guard, by code, on VECTOR sheets.
 *
 * A wrong scale is the worst error the plans screen can make quietly: every
 * length traced on the sheet is wrong by one factor and nothing looks broken
 * (shared/planScale.ts says why detection is never applied silently). This
 * checks a scale that IS set against something drawn on the sheet whose real
 * size is known, and never changes anything: a doubt is shown, the person
 * fixes it in one click or keeps it.
 *
 * ── What it checks against, measured 2026-10-06 (track-c) ───────────────────
 * The plan was a drawn scale bar or a dimension line. NONE of the test sheets
 * has either: no scale-bar labels and no dimension strings on any plan of
 * Weld 1 or UNCC (the only feet values are the "1'-0"" in the scale notes).
 * So that check would have nothing real to be measured against, and is not
 * built. What every floor plan does carry is DOORS: a door swing is a quarter
 * circle whose radius is the leaf, 30–44" in practice. Halving or doubling
 * the scale moves every door far out of that range — 18" or 72" — so door
 * swings decide between a scale and its neighbours.
 *
 *   Weld 1 E-200, set 1/8": 106 of 121 quarter arcs are 36" — agrees.
 *   Weld 1 E-100, notes say 1/4": 0 door-sized arcs; at 1/8" 85 are 36" —
 *     and E-100 and E-200 draw the same building at the same size (door
 *     radius 27 pt on both). The guard's first real catch: E-100's note is
 *     very likely wrong. For the owner to confirm.
 *   UNCC E111 / E121, 1/4": doors agree (9 at 36"); the ceiling grid agrees
 *     independently (282 gaps of 36 pt = 24"). Must NOT warn, and does not.
 *   UNCC ED111, 1/8": 75 arcs 36" — agrees.
 *
 * The rule is deliberately one-sided: it warns only when the SET scale makes
 * almost no door-sized arcs (fewer than DOORS_AGREE) and another common
 * scale makes many (at least DOORS_SAY). Casework, toilet partitions and
 * symbol arcs also make quarter circles (UNCC E111 has 30 at 16"), so a set
 * scale with a handful of real doors is left alone rather than argued with.
 *
 * Scans: no line work, and their OCR misreads scale text ("1/4" read as
 * "114" on Old Blueridge), so the check says plainly it cannot run.
 */
import { COMMON_SCALES, type ScaleCandidate } from "@shared/planScale";

/** A door leaf, inches: the range a swing radius must read to be a door. */
export const DOOR_MIN_IN = 30;
export const DOOR_MAX_IN = 44;
/** At least this many door-sized arcs at the set scale: it agrees. */
export const DOORS_AGREE = 3;
/** At least this many at another scale before that scale is suggested. */
export const DOORS_SAY = 10;

/**
 * Radii, in page points, of every quarter-circle arc in the line work: a run
 * of segments joined end to start (as a path's curves are flattened) lying
 * on one circle and sweeping 80–100°. A door swing is one; so is some
 * casework, which the rule above allows for.
 */
export function quarterArcRadii(segs: Float32Array): number[] {
  const n = segs.length / 4;
  const out: number[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (
      j + 1 < n &&
      Math.hypot(
        segs[j * 4 + 2] - segs[(j + 1) * 4],
        segs[j * 4 + 3] - segs[(j + 1) * 4 + 1]
      ) < 0.01
    )
      j++;
    const pts: [number, number][] = [[segs[i * 4], segs[i * 4 + 1]]];
    for (let k = i; k <= j; k++) pts.push([segs[k * 4 + 2], segs[k * 4 + 3]]);
    i = j + 1;
    if (pts.length < 4) continue;
    const r = arcRadius(pts);
    if (r !== null) out.push(r);
  }
  return out;
}

/** The radius of a quarter-circle arc through these points, or null. */
function arcRadius(pts: readonly [number, number][]): number | null {
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length >> 1];
  const [cx, cy] = pts[pts.length - 1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;
  const r = Math.hypot(ax - ux, ay - uy);
  if (r < 5) return null;
  if (pts.some(([x, y]) => Math.abs(Math.hypot(x - ux, y - uy) - r) > 0.03 * r))
    return null;
  let sweep = 0;
  for (let k = 1; k < pts.length; k++) {
    let da =
      Math.atan2(pts[k][1] - uy, pts[k][0] - ux) -
      Math.atan2(pts[k - 1][1] - uy, pts[k - 1][0] - ux);
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    sweep += da;
  }
  const deg = (Math.abs(sweep) * 180) / Math.PI;
  return deg >= 80 && deg <= 100 ? r : null;
}

/** How many arcs read as a door at this scale (radius points -> inches). */
export function doorsAt(radii: readonly number[], ratio: number): number {
  return radii.filter(r => {
    const inches = (r / 72) * ratio;
    return inches >= DOOR_MIN_IN && inches <= DOOR_MAX_IN;
  }).length;
}

export type ScaleDoubt =
  /** A scan: no line work to check against. Said plainly, not hidden. */
  | { kind: "cannotCheck"; message: string }
  /** Nothing disagrees with the set scale. */
  | { kind: "agrees" }
  | {
      kind: "mayBeWrong";
      /** The one sentence shown in amber. */
      message: string;
      /** The scale the evidence points to: one click applies it. */
      suggest: { text: string; ratio: number };
    };

const short = (text: string) => text.replace(/\s*=\s*1'-0"$/, "");

/** Another scale must make MORE than this many times the doors to argue. */
export const DOORS_OUTVOTE = 3;

/**
 * Check a SET scale. `arcRadii` null = a scan (no line work).
 * `titleScales` = what the sheet's own text states (detectScaleFromText's
 * candidates); used only when they all name ONE scale.
 *
 * Measured on every vector test sheet at its true scale and set 2x off each
 * way (scripts/codeFirstCeiling.mts `scalecheck`): all 8 mis-settings are
 * caught with the right suggestion; at the true scales only Weld 1 E-100
 * warns — whose own note is very likely wrong (see the header).
 *
 *  1. The set scale IS the title's and real doors agree: fine.
 *  2. Doors argue: almost none read as doors at the set scale while another
 *     makes many, or another makes MORE than DOORS_OUTVOTE times as many and
 *     the set scale is not the title's. The suggestion is the title's scale
 *     when doors read right at it, else the scale doors like best.
 *  3. The title argues: the set scale is not the title's, and doors read
 *     right at the title's.
 */
export function checkScale(input: {
  ratio: number | null;
  text: string | null;
  arcRadii: readonly number[] | null;
  titleScales: readonly ScaleCandidate[];
}): ScaleDoubt {
  const { ratio, text, arcRadii, titleScales } = input;
  if (ratio === null || !text) return { kind: "agrees" };
  if (arcRadii === null)
    return {
      kind: "cannotCheck",
      message:
        "This sheet is a scan, so its scale cannot be checked by code — check it against a dimension you know.",
    };
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const set = short(text);
  const here = doorsAt(arcRadii, ratio);
  const statedRatios = Array.from(new Set(titleScales.map(c => c.ratio)));
  const title =
    statedRatios.length === 1
      ? {
          text: titleScales[0].text,
          ratio: titleScales[0].ratio,
          doors: doorsAt(arcRadii, titleScales[0].ratio),
        }
      : null;
  const isTitle = title !== null && same(title.ratio, ratio);
  if (isTitle && here >= DOORS_AGREE) return { kind: "agrees" };

  const best = COMMON_SCALES.filter(s => !same(s.ratio, ratio))
    .map(s => ({
      text: s.text,
      ratio: s.ratio,
      doors: doorsAt(arcRadii, s.ratio),
    }))
    .sort((p, q) => q.doors - p.doors)[0];
  const doorsArgue =
    best !== undefined &&
    best.doors >= DOORS_SAY &&
    (here < DOORS_AGREE || (!isTitle && best.doors > DOORS_OUTVOTE * here));
  if (doorsArgue) {
    const pick = title && !isTitle && title.doors >= DOORS_AGREE ? title : best;
    const inchesNow = medianDoorInches(arcRadii, ratio, pick.ratio);
    /*
      Say what the title says whenever it is not the set scale — agreeing with
      the doors it is the strongest half of the case, and naming a third
      scale it is something the person must see. When it IS the set scale,
      say that too: the doors are arguing with the sheet's own note.
    */
    const titleSays = !title
      ? "but "
      : isTitle
        ? "as the title says, but "
        : same(title.ratio, pick.ratio)
          ? `the title says ${short(title.text)}, and `
          : `the title says ${short(title.text)}, but `;
    return {
      kind: "mayBeWrong",
      message: `Scale may be wrong: set to ${set} — ${titleSays}${pick.doors} door swings read ${inchesNow}" wide at that scale; at ${short(pick.text)} they read a normal 30–44".`,
      suggest: { text: pick.text, ratio: pick.ratio },
    };
  }
  if (title && !isTitle && title.doors >= DOORS_AGREE)
    return {
      kind: "mayBeWrong",
      message: `Scale may be wrong: set to ${set}, but the title says ${short(title.text)} — and door swings read a normal width at ${short(title.text)}.`,
      suggest: { text: title.text, ratio: title.ratio },
    };
  return { kind: "agrees" };
}

/** The door-sized arcs at `better`, as wide as they read at `ratio` now. */
function medianDoorInches(
  radii: readonly number[],
  ratio: number,
  better: number
): number {
  const doors = radii
    .filter(r => {
      const i = (r / 72) * better;
      return i >= DOOR_MIN_IN && i <= DOOR_MAX_IN;
    })
    .map(r => (r / 72) * ratio)
    .sort((a, b) => a - b);
  return Math.round(doors[doors.length >> 1] ?? 0);
}
