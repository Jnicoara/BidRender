/**
 * BENDS AND PULL POINTS COUNTED FROM THE TRACE — elbows, field bends, LBs and
 * pull boxes.
 *
 * ── The decision (owner, 2026-09-26) ─────────────────────────────────────────
 * Bends come from the trace geometry in plain code, no AI: each corner's
 * measured angle, plus one 90 at each counted vertical. Pull points are
 * PROPOSED where the degrees along a run tip over the company limit, and only
 * a person's answer is stored. D19 in `references/takeoff-spec.md` records the
 * design and the six answers that settled it.
 *
 * ── Geometry in, never the tool ──────────────────────────────────────────────
 * Like `runFittings.ts`, this reads points and ends and nothing else. A run
 * traced by hand and one an AI proposes are the same list of points and count
 * the same by construction; `server/runBends.test.ts` pins that.
 *
 * ── Wobble and sweeps: merge FIRST, then drop the small ones ────────────────
 * A hand trace is not a ruler. Twenty clicks along a straight wall each turn a
 * few degrees, and summed toward a 360° limit they would propose a pull point
 * on a straight run. So a corner under `MIN_BEND_DEGREES` is drawing wobble —
 * not a bend, not degrees.
 *
 * But the SAME small turns are how a sweep gets traced: three clicks of 30°
 * round a corner are one 90, not three pieces of wobble. So neighbouring turns
 * in the same direction less than `MERGE_WITHIN_FEET` apart are merged into one
 * bend first, and only then is the 15° floor applied. The order is the whole
 * rule — filter first and the sweep disappears.
 *
 * Merging needs a distance, and a distance needs a scale. On a sheet with no
 * scale nothing is merged: each corner stands on its own, which counts a traced
 * sweep as its pieces rather than inventing a distance.
 *
 * Both numbers are fixed defaults, not settings (owner, 2026-09-26).
 *
 * ── "At least", always ───────────────────────────────────────────────────────
 * Plans do not show the kicks and offsets at boxes, so every bend count is a
 * floor, and says so. Degrees toward a pull point are the MEASURED degrees; the
 * real total is higher, which is also why 270° is offered as a limit.
 */
import type { EndVertical } from "./takeoffHeights";
import type { PagePoint as Point } from "./takeoffGeometry";

/** A corner turning less than this is drawing wobble, not a bend. */
export const MIN_BEND_DEGREES = 15;

/** Same-direction turns closer together than this are one bend (a sweep). */
export const MERGE_WITHIN_FEET = 3;

/** The two limits offered. 360° is the code maximum between pull points. */
export const PULL_POINT_LIMITS = [360, 270] as const;
export type PullPointLimit = (typeof PULL_POINT_LIMITS)[number];

/**
 * The trade sizes a company can pick for either size setting: exactly the
 * sizes the catalog ships raceway in (`TRADE_SIZES` in the conduit seed), so
 * no setting can name a size no run can have. `runBendsSettings.test.ts`
 * fails if the two lists drift.
 */
export const BEND_SIZE_CHOICES = [
  '1/2"',
  '3/4"',
  '1"',
  '1-1/4"',
  '1-1/2"',
  '2"',
  '2-1/2"',
  '3"',
  '4"',
] as const;

/** Shipped defaults for the three company settings (NULL = these). */
export const DEFAULT_FACTORY_ELBOW_FROM = '1-1/4"';
export const DEFAULT_PULL_POINT_LIMIT: PullPointLimit = 360;
export const DEFAULT_PULL_BOX_FROM = '2"';

export function isPullPointLimit(value: unknown): value is PullPointLimit {
  return (PULL_POINT_LIMITS as readonly unknown[]).includes(value);
}

/** The company's three bend settings, each resolved to its shipped default. */
export type BendSettings = {
  factoryElbowFrom: string;
  pullPointLimit: PullPointLimit;
  pullBoxFrom: string;
};

export function resolveBendSettings(
  row: {
    factoryElbowFromSize: string | null;
    pullPointLimitDegrees: number | null;
    pullBoxFromSize: string | null;
  } | null
): BendSettings {
  return {
    factoryElbowFrom: row?.factoryElbowFromSize ?? DEFAULT_FACTORY_ELBOW_FROM,
    pullPointLimit: isPullPointLimit(row?.pullPointLimitDegrees)
      ? row.pullPointLimitDegrees
      : DEFAULT_PULL_POINT_LIMIT,
    pullBoxFrom: row?.pullBoxFromSize ?? DEFAULT_PULL_BOX_FROM,
  };
}

// ── The ends ─────────────────────────────────────────────────────────────────

/**
 * What is at one end of a run, as far as bends go.
 *
 *   counted  a vertical of known height — one 90, and its feet
 *   unknown  a vertical may be there and could not be counted, so every count
 *            built on it is a floor
 *   none     the run carries straight on at its own height ("level")
 */
export type EndDrop =
  | { state: "counted"; feet: number }
  | { state: "unknown" }
  | { state: "none" };

/**
 * The same three-way split `uncountedEnds` makes: counted, level, and
 * everything else. A run with no verticals at all (no heights context) has
 * nothing known at either end.
 */
export function endDropOf(end: EndVertical | null | undefined): EndDrop {
  if (!end) return { state: "unknown" };
  if (end.counted) return { state: "counted", feet: end.feet };
  if (end.reason === "level") return { state: "none" };
  return { state: "unknown" };
}

// ── Pull-point answers ───────────────────────────────────────────────────────

export const PULL_POINT_KINDS = ["lb", "pullBox"] as const;
export type PullPointKind = (typeof PULL_POINT_KINDS)[number];

/**
 * A person's answer to a proposed pull point, as stored.
 *
 * Keyed by WHERE on the drawing, not by vertex index: inserting a point earlier
 * in the run shifts every index after it, and an answer that followed the index
 * would silently move to a different corner. A position either still exists or
 * it does not — decision 5, 2026-09-26: keep answers whose corner still
 * exists, re-propose corners that are new or changed.
 */
export type PullPointAnswer = {
  id: number;
  /** A corner of the run, or the top of the drop at its end. */
  place: "corner" | "end-drop";
  x: number;
  y: number;
  kind: PullPointKind;
  status: "accepted" | "dismissed";
};

/** What this module needs of one leg. `FittingLeg` is a superset. */
export type BendLeg = {
  id: string;
  points: readonly Point[];
  /** Real feet per page point, or null when the sheet has no usable scale. */
  feetPerPoint: number | null;
  startDrop: EndDrop;
  endDrop: EndDrop;
  answers: readonly PullPointAnswer[];
};

/** Stored coordinates are the trace's own floats; an edit that did not move a
 *  vertex leaves them bit-identical. The tolerance is for a decimal column. */
const SAME_POINT = 0.01;

function samePoint(a: Point, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < SAME_POINT && Math.abs(a.y - b.y) < SAME_POINT;
}

/** Where an answer sits on the leg now: a vertex index, the end drop, or gone. */
export type AnswerPlace = { vertex: number } | { endDrop: true } | null;

/**
 * Find an answer on the leg as it is today.
 *
 * A corner answer matches an INTERIOR vertex at the same position — an end is a
 * box already, and a pull point there would be a second one. An end-drop
 * answer matches only while that end still has a drop and has not moved.
 */
export function placeAnswer(
  leg: Pick<BendLeg, "points" | "endDrop">,
  answer: PullPointAnswer
): AnswerPlace {
  const n = leg.points.length;
  if (answer.place === "end-drop") {
    if (leg.endDrop.state === "none" || n === 0) return null;
    return samePoint(leg.points[n - 1], answer) ? { endDrop: true } : null;
  }
  for (let i = 1; i < n - 1; i++) {
    if (samePoint(leg.points[i], answer)) return { vertex: i };
  }
  return null;
}

// ── Corners ──────────────────────────────────────────────────────────────────

/**
 * How far the path turns at `b`, in degrees, signed: positive one way,
 * negative the other, 0 straight on. NULL when either segment has no length,
 * because a doubled click has no direction to turn from.
 */
export function turnDegrees(a: Point, b: Point, c: Point): number | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return null;
  const cross = ux * vy - uy * vx;
  const dot = ux * vx + uy * vy;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
}

/** A turn this small is straight on — not a bend, and not wobble either. */
const STRAIGHT_DEGREES = 0.5;

export type BendPlace =
  | { kind: "corner"; vertex: number }
  | { kind: "drop"; end: "start" | "end" };

/** One bend: a merged corner, or the 90 at a counted drop. */
export type Bend = {
  place: BendPlace;
  /** Measured, merged, unsigned. A drop is 90. */
  degrees: number;
  /** Every vertex merged into this bend. Empty for a drop. */
  vertices: readonly number[];
  /** Where it is drawn: the middle merged vertex, or the run's end. */
  point: Point;
};

export type LegBends = {
  /** In order along the leg: start drop, corners, end drop. */
  bends: Bend[];
  /** Corners (after merging) under the floor — drawing wobble. */
  wobble: number;
  /** Ends whose drop could not be counted: the count is a floor. */
  unknownDrops: number;
};

/** Everything that turns along one leg, in order. */
export function legBends(leg: Omit<BendLeg, "answers" | "id">): LegBends {
  const p = leg.points;
  const bends: Bend[] = [];
  let wobble = 0;

  if (leg.startDrop.state === "counted" && p.length > 0) {
    bends.push({
      place: { kind: "drop", end: "start" },
      degrees: 90,
      vertices: [],
      point: p[0],
    });
  }

  // Group interior vertices: same sign, and within MERGE_WITHIN_FEET of the
  // previous member measured ALONG the path.
  type Group = { vertices: number[]; sum: number; sign: number };
  const groups: Group[] = [];
  let current: Group | null = null;
  let sinceLast = 0; // page points along the path since the group's last vertex
  for (let i = 1; i < p.length - 1; i++) {
    sinceLast += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    const t = turnDegrees(p[i - 1], p[i], p[i + 1]);
    if (t === null || Math.abs(t) < STRAIGHT_DEGREES) continue;
    const sign = Math.sign(t);
    const close =
      leg.feetPerPoint !== null &&
      sinceLast * leg.feetPerPoint < MERGE_WITHIN_FEET;
    if (current && current.sign === sign && close) {
      current.vertices.push(i);
      current.sum += t;
    } else {
      current = { vertices: [i], sum: t, sign };
      groups.push(current);
    }
    sinceLast = 0;
  }

  for (const g of groups) {
    const degrees = Math.abs(g.sum);
    if (degrees < MIN_BEND_DEGREES) {
      wobble++;
      continue;
    }
    const middle = g.vertices[Math.floor((g.vertices.length - 1) / 2)];
    bends.push({
      place: { kind: "corner", vertex: middle },
      degrees,
      vertices: g.vertices,
      point: p[middle],
    });
  }

  if (leg.endDrop.state === "counted" && p.length > 0) {
    bends.push({
      place: { kind: "drop", end: "end" },
      degrees: 90,
      vertices: [],
      point: p[p.length - 1],
    });
  }

  const unknownDrops =
    (leg.startDrop.state === "unknown" ? 1 : 0) +
    (leg.endDrop.state === "unknown" ? 1 : 0);
  return { bends, wobble, unknownDrops };
}

/**
 * The factory fittings one bend takes: 90s and 45s nearest its angle.
 *
 *   15–67°   a 45
 *   67–112°  a 90
 *   112–157° a 90 and a 45
 *   and so on up
 *
 * A drop is exactly one 90. Anything that counts as a bend at all takes at
 * least one fitting — a 20° corner is a 45 bent short, not nothing.
 */
export function fittingsForBend(bend: Pick<Bend, "place" | "degrees">): {
  n90: number;
  n45: number;
} {
  if (bend.place.kind === "drop") return { n90: 1, n45: 0 };
  const d = bend.degrees;
  const n90 = Math.floor((d + 22.5) / 90);
  const rest = d - 90 * n90;
  let n45 = rest >= 22.5 ? 1 : 0;
  if (n90 + n45 === 0) n45 = 1;
  return { n90, n45 };
}

// ── The pull-point walk ──────────────────────────────────────────────────────

/** Where a pull point sits, for the drawing and for storing an answer. */
export type PullPointSpot = {
  place: "corner" | "end-drop";
  point: Point;
  /** The vertex, for a corner. */
  vertex: number | null;
};

export type PullPointProposal = PullPointSpot & {
  /** Degrees since the last pull point, INCLUDING this bend. */
  degrees: number;
  /** A dismissal stored here, or null while unanswered. */
  answer: PullPointAnswer | null;
};

export type LegPullPoints = {
  /** Where the degrees tip over the limit and nothing is placed yet. */
  proposals: PullPointProposal[];
  /** Accepted pull points still on the drawing, wherever they are. */
  accepted: (PullPointSpot & { answer: PullPointAnswer })[];
  /** Degrees in each stretch between pull points, first to last. */
  sections: number[];
  /** Answers whose corner no longer exists. */
  orphaned: PullPointAnswer[];
};

/**
 * Walk one leg adding up degrees, and say where it tips over `limit`.
 *
 * ── The rules, each a decision ───────────────────────────────────────────────
 *   • An ACCEPTED pull point is a box: the stretch ends there and the count
 *     starts again from zero. If it sits on a bend, it makes that turn itself —
 *     an LB is an elbow you can pull through — so that bend adds nothing.
 *   • The bend that would carry the total PAST the limit is where the proposal
 *     goes, and it replaces that bend in the same way. Exactly the limit is
 *     allowed: four 90s is 360° and needs nothing.
 *   • The walk carries on AS IF each proposal were placed, so the second
 *     proposal on a long run is where it would tip over after the first.
 *   • A DISMISSED proposal means the estimator will pull through there. The
 *     count restarts after it too, so one "no" does not become a proposal on
 *     every bend that follows — and the stretch still reports its degrees, so
 *     the over-limit total stays on screen.
 *   • A dismissal on a corner that is no longer a tip-over is simply unused.
 */
export function walkPullPoints(
  leg: BendLeg,
  limit: number,
  bends: readonly Bend[]
): LegPullPoints {
  const accepted: LegPullPoints["accepted"] = [];
  const orphaned: PullPointAnswer[] = [];
  const acceptedAtVertex = new Map<number, PullPointAnswer>();
  let acceptedAtEndDrop: PullPointAnswer | null = null;
  const dismissedAtVertex = new Map<number, PullPointAnswer>();
  let dismissedAtEndDrop: PullPointAnswer | null = null;

  for (const answer of leg.answers) {
    const where = placeAnswer(leg, answer);
    if (where === null) {
      orphaned.push(answer);
      continue;
    }
    if ("endDrop" in where) {
      if (answer.status === "accepted") acceptedAtEndDrop = answer;
      else dismissedAtEndDrop = answer;
    } else if (answer.status === "accepted") {
      acceptedAtVertex.set(where.vertex, answer);
    } else {
      dismissedAtVertex.set(where.vertex, answer);
    }
  }

  // Accepted points that sit on no bend are still boxes along the path.
  type Item =
    | { at: number; bend: Bend }
    | { at: number; box: PullPointAnswer; vertex: number };
  const n = leg.points.length;
  const position = (b: Bend) =>
    b.place.kind === "drop"
      ? b.place.end === "start"
        ? -1
        : n
      : b.vertices[0];
  const items: Item[] = bends.map(bend => ({ at: position(bend), bend }));
  const onBend = new Set<number>(bends.flatMap(b => [...b.vertices]));
  acceptedAtVertex.forEach((answer, vertex) => {
    if (!onBend.has(vertex)) items.push({ at: vertex, box: answer, vertex });
  });
  items.sort((a, b) => a.at - b.at);

  const proposals: PullPointProposal[] = [];
  const sections: number[] = [];
  let total = 0;
  const close = () => {
    sections.push(round1(total));
    total = 0;
  };

  for (const item of items) {
    if ("box" in item) {
      accepted.push({
        place: "corner",
        point: leg.points[item.vertex],
        vertex: item.vertex,
        answer: item.box,
      });
      close();
      continue;
    }
    const { bend } = item;
    const spot = spotOf(bend);
    const acceptedHere =
      bend.place.kind === "drop"
        ? bend.place.end === "end"
          ? acceptedAtEndDrop
          : null
        : (bend.vertices.map(v => acceptedAtVertex.get(v)).find(Boolean) ??
          null);
    if (acceptedHere && spot) {
      accepted.push({ ...spot, answer: acceptedHere });
      close();
      continue;
    }
    if (total + bend.degrees > limit && spot !== null) {
      const dismissed =
        bend.place.kind === "drop"
          ? dismissedAtEndDrop
          : (bend.vertices.map(v => dismissedAtVertex.get(v)).find(Boolean) ??
            null);
      proposals.push({
        ...spot,
        degrees: round1(total + bend.degrees),
        answer: dismissed,
      });
      // A dismissal is pulled through: its degrees stay in the stretch it ends.
      if (dismissed) total += bend.degrees;
      close();
      continue;
    }
    total += bend.degrees;
  }
  close();

  // An end-drop acceptance whose drop is not counted any more has no bend to
  // attach to; `placeAnswer` has already sent a vanished drop to `orphaned`.
  return { proposals, accepted, sections, orphaned };
}

/** Where a pull point for this bend would go. The start drop is a box. */
function spotOf(bend: Bend): PullPointSpot | null {
  if (bend.place.kind === "drop") {
    return bend.place.end === "end"
      ? { place: "end-drop", point: bend.point, vertex: null }
      : null;
  }
  return { place: "corner", point: bend.point, vertex: bend.place.vertex };
}

// ── Counting across a run type's legs ────────────────────────────────────────

/**
 * How this raceway turns a corner. Decided by the caller from the raceway's
 * family and size against the company threshold (`bendMethodFor` in
 * `runFittingMaterials.ts`), and passed in with its sentence.
 */
export type BendMethod =
  | { method: "factory"; why: string }
  | { method: "field"; why: string }
  /** Flex: turns itself, no fitting and no bending labor. */
  | { method: "none"; why: string }
  | { method: "unknown"; why: string };

export const BEND_KINDS = [
  "elbow90",
  "elbow45",
  "fieldBend",
  "lb",
  "pullBox",
] as const;
export type BendKind = (typeof BEND_KINDS)[number];

/** Whether a bid line's run role is a bend or pull point (a count). */
export function isBendRole(role: string | null | undefined): role is BendKind {
  return (BEND_KINDS as readonly unknown[]).includes(role);
}

/** Same three shapes as `FittingCount`, over the bend kinds. */
export type BendCount =
  | {
      kind: BendKind;
      status: "counted";
      qty: number;
      atLeast: boolean;
      why: string;
    }
  | { kind: BendKind; status: "included"; why: string }
  | { kind: BendKind; status: "unknown"; why: string };

export type BendReport = {
  counts: Record<BendKind, BendCount>;
  /** Per leg, for the drawing and the run panel. */
  legs: { legId: string; bends: LegBends; pullPoints: LegPullPoints }[];
  /** Proposals nobody has answered, across every leg. */
  unansweredProposals: number;
};

const NO_KICKS = "plans do not show the kicks and offsets at boxes";

/**
 * Every bend kind for these legs of ONE raceway, plus the per-leg detail.
 *
 * Bends that an accepted pull point sits on are made by that LB or box and are
 * not counted as elbows — counting both would buy the turn twice.
 */
export function countBends(
  legs: readonly BendLeg[],
  method: BendMethod,
  limit: number
): BendReport {
  const perLeg = legs.map(leg => {
    const bends = legBends(leg);
    return {
      legId: leg.id,
      bends,
      pullPoints: walkPullPoints(leg, limit, bends.bends),
    };
  });

  /*
    The bends that still need a fitting or a bend of their own. An UNANSWERED
    or dismissed proposal still needs its elbow: until a person accepts the
    pull point, the turn is made in pipe.
  */
  const corners90: number[] = [];
  const corners45: number[] = [];
  const allCorners: number[] = [];
  let n90 = 0;
  let n45 = 0;
  let drops = 0;
  let replaced = 0;
  let wobble = 0;
  let unknownDrops = 0;
  for (const { bends, pullPoints } of perLeg) {
    wobble += bends.wobble;
    unknownDrops += bends.unknownDrops;
    for (const bend of bends.bends) {
      if (acceptedOnBend(bend, pullPoints)) {
        replaced++;
        continue;
      }
      const f = fittingsForBend(bend);
      n90 += f.n90;
      n45 += f.n45;
      if (bend.place.kind === "drop") {
        drops++;
      } else {
        const d = round0(bend.degrees);
        allCorners.push(d);
        if (f.n90 > 0) corners90.push(d);
        if (f.n45 > 0) corners45.push(d);
      }
    }
  }

  const notes: string[] = [];
  if (replaced > 0)
    notes.push(
      `${plural(replaced, "bend")} made by ${replaced === 1 ? "a pull point" : "pull points"} instead`
    );
  if (wobble > 0)
    notes.push(
      `${plural(wobble, "corner")} under ${MIN_BEND_DEGREES}° treated as drawing wobble`
    );
  if (unknownDrops > 0)
    notes.push(`${plural(unknownDrops, "end")} whose drop has no height yet`);
  notes.push(NO_KICKS);
  const tail = ` (${notes.join("; ")})`;

  const nothing = legs.length === 0;
  const counted = (
    kind: BendKind,
    qty: number,
    what: string,
    parts: string
  ): BendCount =>
    nothing
      ? {
          kind,
          status: "counted",
          qty: 0,
          atLeast: false,
          why: "Nothing traced",
        }
      : {
          kind,
          status: "counted",
          qty,
          atLeast: true,
          why:
            qty === 0
              ? `No ${what}s drawn${tail}`
              : `At least ${plural(qty, what)}: ${parts}${tail}`,
        };

  const partsFor = (degrees: number[], withDrops: number) => {
    const list: string[] = [];
    if (degrees.length > 0)
      list.push(
        `${plural(degrees.length, "corner")} (${degrees.map(d => `${d}°`).join(", ")})`
      );
    if (withDrops > 0) list.push(plural(withDrops, "drop"));
    return list.join(" + ");
  };

  const elbowBy = (kind: "elbow90" | "elbow45"): BendCount => {
    if (method.method === "unknown")
      return { kind, status: "unknown", why: method.why };
    if (method.method !== "factory")
      return { kind, status: "included", why: method.why };
    return kind === "elbow90"
      ? counted(kind, n90, "90° elbow", partsFor(corners90, drops))
      : counted(kind, n45, "45° elbow", partsFor(corners45, 0));
  };

  const fieldBend = ((): BendCount => {
    const kind = "fieldBend" as const;
    if (method.method === "unknown")
      return { kind, status: "unknown", why: method.why };
    if (method.method !== "field")
      return { kind, status: "included", why: method.why };
    // A corner past 112° is bent twice (a 90 and a 45), so the quantity can
    // exceed corners + drops; the sentence says so rather than not adding up.
    const twice = n90 + n45 - allCorners.length - drops;
    const parts =
      partsFor(allCorners, drops) +
      (twice > 0 ? `, ${plural(twice, "corner")} past 112° bent twice` : "");
    return counted(kind, n90 + n45, "field bend", `${parts} — ${method.why}`);
  })();

  const acceptedOf = (kind: PullPointKind) =>
    perLeg.reduce(
      (sum, l) =>
        sum + l.pullPoints.accepted.filter(a => a.answer.kind === kind).length,
      0
    );
  const unansweredProposals = perLeg.reduce(
    (sum, l) => sum + l.pullPoints.proposals.filter(p => !p.answer).length,
    0
  );
  const pending =
    unansweredProposals > 0
      ? ` — ${plural(unansweredProposals, "pull point")} proposed and not answered yet`
      : "";
  const pullPoint = (kind: PullPointKind): BendCount => {
    const qty = acceptedOf(kind);
    const label = kind === "lb" ? "LB" : "pull box";
    const many = kind === "lb" ? "LBs" : "pull boxes";
    return {
      kind,
      status: "counted",
      qty,
      atLeast: false,
      why:
        qty === 0
          ? `No ${many} accepted on the drawing${pending}`
          : `${plural(qty, label, many)} accepted on the drawing${pending}`,
    };
  };

  return {
    counts: {
      elbow90: elbowBy("elbow90"),
      elbow45: elbowBy("elbow45"),
      fieldBend,
      lb: pullPoint("lb"),
      pullBox: pullPoint("pullBox"),
    },
    legs: perLeg,
    unansweredProposals,
  };
}

/**
 * What ONE run says about its bends, in the panel under the run — the degrees
 * on the drawing and what they add up to, and anything over the limit.
 *
 * The type-level counts (`countBends`) say how many elbows the bid gets; this
 * says why THIS run proposes what it does, which is the question somebody
 * looking at a dashed marker on the drawing is asking.
 */
export function describeRunBends(
  bends: LegBends,
  walk: LegPullPoints,
  limit: number
): { summary: string | null; overLimit: string[] } {
  const corners = bends.bends.filter(b => b.place.kind === "corner").length;
  const drops = bends.bends.length - corners;
  const degrees = Math.round(bends.bends.reduce((s, b) => s + b.degrees, 0));
  const parts: string[] = [];
  if (corners > 0) parts.push(plural(corners, "corner"));
  if (drops > 0) parts.push(plural(drops, "drop"));
  const notes: string[] = [];
  if (bends.unknownDrops > 0)
    notes.push(`${plural(bends.unknownDrops, "drop")} not counted yet`);
  if (bends.wobble > 0)
    notes.push(
      `${plural(bends.wobble, "small corner")} under ${MIN_BEND_DEGREES}° ignored`
    );
  const summary =
    bends.bends.length === 0 && notes.length === 0
      ? null
      : `${degrees}° of bend on the drawing` +
        (parts.length > 0 ? ` (${parts.join(", ")})` : "") +
        (notes.length > 0 ? ` — ${notes.join("; ")}` : "") +
        `. At least that: kicks and offsets at boxes are not drawn.`;

  // A dismissed proposal leaves a stretch over the limit on purpose; say so,
  // so a "no" does not quietly look like a run that was fine.
  const overLimit = walk.proposals
    .filter(p => p.answer?.status === "dismissed")
    .map(
      p =>
        `${p.degrees}° pulled through with no pull point — past the ${limit}° limit, by your choice`
    );
  return { summary, overLimit };
}

/** Whether an accepted pull point sits on this bend and so makes the turn. */
function acceptedOnBend(bend: Bend, pullPoints: LegPullPoints): boolean {
  return pullPoints.accepted.some(a =>
    bend.place.kind === "drop"
      ? bend.place.end === "end" && a.place === "end-drop"
      : a.vertex !== null && bend.vertices.includes(a.vertex)
  );
}

function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

function round0(value: number): number {
  return Math.round(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
