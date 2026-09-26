/**
 * FITTINGS COUNTED FROM THE TRACE — couplings, connectors and straps.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * D17(b) in `references/takeoff-spec.md` chose a fixed labour amount per
 * counted end as an INTERIM, "the stop, the strap, the connector and the box at
 * a termination", to retire to zero once a run type could count its fittings.
 * This is that counting. The interim was never built, so nothing retires in
 * code; what changes is that the fittings now exist as their own lines.
 *
 * ── Geometry in, never the tool ──────────────────────────────────────────────
 * Everything here reads LEGS and NODES: lengths and which ends meet. A run
 * traced by hand and one an AI proposes later arrive as the same shape, so they
 * count the same by construction. Nothing here knows how a leg was drawn.
 *
 * A LEG is one continuous length of pipe between two nodes. A NODE is a place
 * conduit ends — a box, a panel, a line end. Today every run is one leg, and
 * its ends are nodes of their own unless a stamp links them (two runs linked to
 * the same stamp meet there). When branch legs land (`plan-viewer-overhaul.md`
 * § 5k), a tee splits its parent into two legs meeting at the branch's start
 * node, and this module needs no change — the tests below already build that
 * shape by hand.
 *
 * Nodes are joined ONLY by an explicit link, never by two ends happening to lie
 * close together; § 5d refuses snapping to a nearby symbol for the same reason.
 *
 * ── Every number says how it was worked out ──────────────────────────────────
 * No count leaves this file without its sentence. The sentences are built here
 * rather than in a component because `vitest` can reach `shared/` and cannot
 * reach React — CLAUDE.md § "prefer a forcing function to a reminder".
 *
 * ── Where elbows and pull points plug in ─────────────────────────────────────
 * `FittingKind` is the extension point: an "elbow" kind reads each leg's
 * `points` (corner angles) and `drops` (one 90 per counted vertical), and a
 * pull-point proposal walks the same corners accumulating degrees. Legs carry
 * both today so that build adds a kind rather than reshaping the input. See
 * `todo.md` § "Bends and pull points".
 */
import type { PagePoint as Point } from "./takeoffGeometry";

/**
 * How one stick of this raceway joins the next.
 *
 *   coupling           plain ends; a coupling between every pair of sticks
 *   belled             one end is belled and takes the next stick directly
 *   coupling_on_stick  sold with one coupling threaded on (rigid, IMC)
 *   continuous         a coil, not sticks (flex) — nothing to join
 *
 * All four are editable defaults on the MATERIAL, not rules: a company that
 * buys plain-end PVC changes the row and the count follows.
 */
export const STICK_JOINTS = [
  "coupling",
  "belled",
  "coupling_on_stick",
  "continuous",
] as const;
export type StickJoint = (typeof STICK_JOINTS)[number];

/** A stored varchar that is one of the four, or not. */
export function isStickJoint(value: unknown): value is StickJoint {
  return (STICK_JOINTS as readonly unknown[]).includes(value);
}

/** What this module needs to know about the pipe. Structural, not the row. */
export type RacewayFittingSpec = {
  /** For the sentences: `1/2" EMT`. */
  name: string;
  stickLengthFeet: number | null;
  /** NULL reads as "coupling" — plain ends are the ordinary case. */
  stickJoint: StickJoint | null;
  /** Maximum distance between straps along the run. NULL is not set. */
  strapSpacingFeet: number | null;
  /** How close to a box the first strap goes. NULL is not set. */
  strapFromBoxFeet: number | null;
};

export type FittingLeg = {
  /** Stable, for the per-run breakdown. The run id today. */
  id: string;
  /** Node keys. Equal keys on two legs mean those ends meet. */
  from: string;
  to: string;
  /**
   * Pipe along this leg — traced plus every vertical that was counted. NULL
   * when the sheet has no usable scale: unknown, never zero.
   */
  feet: number | null;
  /**
   * True when an end's vertical could not be counted, so `feet` is a floor and
   * every count built on it is "at least".
   */
  feetIsFloor: boolean;
  /** For the elbow build: the traced corners. Page units, as stored. */
  points: readonly Point[];
  /** For the elbow build: how many counted verticals (each a 90). */
  drops: number;
};

export const FITTING_KINDS = ["coupling", "connector", "strap"] as const;
export type FittingKind = (typeof FITTING_KINDS)[number];

/** Whether a bid line's run role is a fitting (a count) rather than footage. */
export function isFittingRole(
  role: string | null | undefined
): role is FittingKind {
  return (FITTING_KINDS as readonly unknown[]).includes(role);
}

/**
 * One kind of fitting, counted.
 *
 *   counted    a quantity, with how it was worked out
 *   included   the raceway already brings it — no line, but still said
 *   unknown    cannot be counted, and why — never a quiet zero
 *
 * `counted` may carry a partial answer: some legs counted, some unknown. Then
 * `qty` is what WAS counted, `atLeast` is true and `why` names what is missing.
 */
export type FittingCount =
  | {
      kind: FittingKind;
      status: "counted";
      qty: number;
      atLeast: boolean;
      why: string;
    }
  | { kind: FittingKind; status: "included"; why: string }
  | { kind: FittingKind; status: "unknown"; why: string };

// ── The arithmetic ───────────────────────────────────────────────────────────

/**
 * Sticks to cover a length, rounded UP — a 94 ft leg is 10 sticks, not 9.4.
 * The epsilon keeps an exact 20.00 ft from becoming 3 sticks through a float
 * tail in the stored decimal.
 */
export function sticksFor(feet: number, stickLengthFeet: number): number {
  if (!(feet > 0) || !(stickLengthFeet > 0)) return 0;
  return Math.ceil(feet / stickLengthFeet - 1e-9);
}

/**
 * Straps on one leg: one within `fromBox` of each box end, then enough between
 * them that no gap exceeds `spacing`.
 *
 * A leg short enough that one strap sits within `fromBox` of BOTH boxes gets
 * one strap, not two — a 4 ft nipple between boxes is not strapped twice.
 */
export function strapsFor(
  feet: number,
  spacing: number,
  fromBox: number
): { nearBox: number; between: number } {
  if (!(feet > 0) || !(spacing > 0) || !(fromBox >= 0)) {
    return { nearBox: 0, between: 0 };
  }
  if (feet <= 2 * fromBox) return { nearBox: 1, between: 0 };
  const span = feet - 2 * fromBox;
  return {
    nearBox: 2,
    between: Math.max(0, Math.ceil(span / spacing - 1e-9) - 1),
  };
}

// ── Counting a network ───────────────────────────────────────────────────────

/** How many conduit ends meet at each node. */
export function nodeDegrees(legs: readonly FittingLeg[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const leg of legs) {
    degree.set(leg.from, (degree.get(leg.from) ?? 0) + 1);
    degree.set(leg.to, (degree.get(leg.to) ?? 0) + 1);
  }
  return degree;
}

/**
 * Everything counted for these legs of one raceway.
 *
 * Legs of DIFFERENT raceways must be counted separately — a coupling is sized
 * to its pipe — so the caller groups first (by run type today).
 */
export function countFittings(
  legs: readonly FittingLeg[],
  raceway: RacewayFittingSpec
): Record<FittingKind, FittingCount> {
  return {
    coupling: countCouplings(legs, raceway),
    connector: countConnectors(legs),
    strap: countStraps(legs, raceway),
  };
}

function countCouplings(
  legs: readonly FittingLeg[],
  raceway: RacewayFittingSpec
): FittingCount {
  const kind = "coupling" as const;
  const joint = raceway.stickJoint ?? "coupling";
  const stick = raceway.stickLengthFeet;

  if (joint === "continuous") {
    return {
      kind,
      status: "included",
      why: `${raceway.name} comes in a coil — no couplings`,
    };
  }
  if (legs.length === 0) {
    return {
      kind,
      status: "counted",
      qty: 0,
      atLeast: false,
      why: "Nothing traced",
    };
  }
  if (stick === null || !(stick > 0)) {
    return {
      kind,
      status: "unknown",
      why: `No stick length set on ${raceway.name} — couplings not counted`,
    };
  }

  const measured = legs.filter(leg => leg.feet !== null);
  const unmeasured = legs.length - measured.length;
  const sticks = measured.reduce(
    (sum, leg) => sum + sticksFor(leg.feet!, stick),
    0
  );
  const feet = measured.reduce((sum, leg) => sum + leg.feet!, 0);
  const atLeast = unmeasured > 0 || measured.some(leg => leg.feetIsFloor);

  if (measured.length === 0) {
    return { kind, status: "unknown", why: unmeasuredWhy(unmeasured) };
  }

  const stickText = `${plural(sticks, "stick")} of ${trim(stick)} ft`;
  if (joint === "belled") {
    return {
      kind,
      status: "included",
      why:
        `${stickText}, belled end — sticks join without couplings` +
        tail(atLeast, unmeasured, legs),
    };
  }
  if (joint === "coupling_on_stick") {
    return {
      kind,
      status: "included",
      why:
        `${stickText} — a coupling comes on each stick` +
        tail(atLeast, unmeasured, legs),
    };
  }

  // Sticks minus one PER LEG: each leg starts a fresh stick at its box.
  const qty = measured.reduce(
    (sum, leg) => sum + Math.max(0, sticksFor(leg.feet!, stick) - 1),
    0
  );
  const perLeg = measured.length > 1 ? ", counted per leg" : "";
  return {
    kind,
    status: "counted",
    qty,
    atLeast,
    why:
      `${prefix(atLeast)}${plural(qty, "coupling")}: ${stickText} over ${trim(round2(feet))} ft${perLeg}` +
      tail(atLeast, unmeasured, legs),
  };
}

function countConnectors(legs: readonly FittingLeg[]): FittingCount {
  const kind = "connector" as const;
  if (legs.length === 0) {
    return {
      kind,
      status: "counted",
      qty: 0,
      atLeast: false,
      why: "Nothing traced",
    };
  }
  // One per conduit end, which is the sum of the degrees — and the degrees are
  // what the sentence explains, because "in and out of a box is two" is the
  // part a reader wants to check.
  const byDegree = new Map<number, number>();
  let qty = 0;
  for (const degree of Array.from(nodeDegrees(legs).values())) {
    byDegree.set(degree, (byDegree.get(degree) ?? 0) + 1);
    qty += degree;
  }
  const parts = Array.from(byDegree.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([degree, nodes]) => {
      if (degree === 1) return plural(nodes, "line end");
      if (degree === 2)
        return `${plural(nodes, "in-and-out box", "in-and-out boxes")} (2 each)`;
      return `${plural(nodes, "box", "boxes")} where ${degree} conduits meet`;
    });
  return {
    kind,
    status: "counted",
    qty,
    atLeast: false,
    why: `${plural(qty, "connector")}: one per conduit end — ${parts.join(", ")}`,
  };
}

function countStraps(
  legs: readonly FittingLeg[],
  raceway: RacewayFittingSpec
): FittingCount {
  const kind = "strap" as const;
  const spacing = raceway.strapSpacingFeet;
  const fromBox = raceway.strapFromBoxFeet;
  if (legs.length === 0) {
    return {
      kind,
      status: "counted",
      qty: 0,
      atLeast: false,
      why: "Nothing traced",
    };
  }
  if (
    spacing === null ||
    !(spacing > 0) ||
    fromBox === null ||
    !(fromBox >= 0)
  ) {
    return {
      kind,
      status: "unknown",
      why: `No strap spacing set on ${raceway.name} — straps not counted`,
    };
  }
  const measured = legs.filter(leg => leg.feet !== null);
  const unmeasured = legs.length - measured.length;
  if (measured.length === 0) {
    return { kind, status: "unknown", why: unmeasuredWhy(unmeasured) };
  }
  let nearBox = 0;
  let between = 0;
  for (const leg of measured) {
    const s = strapsFor(leg.feet!, spacing, fromBox);
    nearBox += s.nearBox;
    between += s.between;
  }
  const qty = nearBox + between;
  const atLeast = unmeasured > 0 || measured.some(leg => leg.feetIsFloor);
  const feet = measured.reduce((sum, leg) => sum + leg.feet!, 0);
  return {
    kind,
    status: "counted",
    qty,
    atLeast,
    why:
      `${prefix(atLeast)}${plural(qty, "strap")}: ${nearBox} within ${trim(fromBox)} ft of a box` +
      ` + ${between} at ${trim(spacing)} ft spacing over ${trim(round2(feet))} ft, drops included` +
      tail(atLeast, unmeasured, legs),
  };
}

// ── Building legs from today's runs ──────────────────────────────────────────

/**
 * One run as one leg.
 *
 * `feet` is the run's PIPE — `conduitFeet` from `quantitiesForRun`, traced
 * plus counted verticals — so couplings and straps include the drops, per the
 * decision of 2026-09-26. `uncountedEnds` is how many ends have a vertical
 * that could not be counted; any makes the figure a floor.
 *
 * An end linked to a stamp becomes that stamp's node, so two runs meeting at
 * one box share it. An unlinked end is a node of its own: a line end.
 */
export function legFromRun(run: {
  id: number;
  startStampId: number | null;
  endStampId: number | null;
  points: readonly Point[];
  conduitFeet: number | null;
  countedDrops: number;
  uncountedEnds: number;
}): FittingLeg {
  return {
    id: String(run.id),
    from:
      run.startStampId !== null
        ? `stamp:${run.startStampId}`
        : `run:${run.id}:start`,
    to:
      run.endStampId !== null ? `stamp:${run.endStampId}` : `run:${run.id}:end`,
    feet: run.conduitFeet,
    feetIsFloor: run.uncountedEnds > 0,
    points: run.points,
    drops: run.countedDrops,
  };
}

// ── Words ────────────────────────────────────────────────────────────────────

/** The quantity a line prints: "9", or "at least 9" when a leg was short. */
export function fittingQtyText(count: FittingCount): string | null {
  if (count.status !== "counted") return null;
  return (count.atLeast ? "at least " : "") + String(count.qty);
}

function prefix(atLeast: boolean): string {
  return atLeast ? "At least " : "";
}

function tail(
  atLeast: boolean,
  unmeasured: number,
  legs: readonly FittingLeg[]
): string {
  const notes: string[] = [];
  if (unmeasured > 0) notes.push(unmeasuredWhy(unmeasured).toLowerCase());
  const floors = legs.filter(
    leg => leg.feet !== null && leg.feetIsFloor
  ).length;
  if (floors > 0) {
    notes.push(
      `${plural(floors, "run")} ${floors === 1 ? "has" : "have"} a drop with no height, so ${floors === 1 ? "its" : "their"} length is short`
    );
  }
  return atLeast && notes.length > 0 ? ` (${notes.join("; ")})` : "";
}

function unmeasuredWhy(unmeasured: number): string {
  return `${plural(unmeasured, "run")} on a sheet with no scale — not measurable`;
}

function plural(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function trim(value: number): string {
  return String(round2(value));
}
