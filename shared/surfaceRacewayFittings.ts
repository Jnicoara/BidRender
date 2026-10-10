/**
 * THE 700 FAMILY — what a traced surface-raceway run buys.
 *
 * references/per-foot-items-plan.md § 3c (owner, 2026-10-08, decision 1):
 * Wiremold 700 is a run type of its own, traced like EMT, and its fittings
 * are counted off the same LEGS a pipe's are. Three rules differ from a pipe,
 * and each is here rather than in `countFittings` so a pipe cannot pick one up
 * by accident:
 *
 *   1. ONE ENTRANCE END PER RUN, AT ITS START. A pipe buys a connector at
 *      every conduit end; a 700 run's far end goes into the 700 device box,
 *      which takes the raceway directly, so only the start needs a part.
 *   2. A CORNER IS AN INSIDE ELBOW, AN END DROP IS A FLAT ELBOW. A turn along
 *      a wall is an inside corner far more often than an outside one, and
 *      turning down a wall stays in the wall's plane. An outside elbow is
 *      hand-added.
 *   3. A TEE IS A FITTING, NOT A BOX. Surface raceway branches with a tee
 *      fitting; a pipe's tee buys a box and maybe a cover (`teeBoxOwners`).
 *
 * Plus: factory fittings only — no field bend, no 45 (none is shipped), no
 * LB or pull box (the legs' pull-point answers are not read).
 *
 * ── 500 too (references/sch80-and-500-plan.md § 2c, owner 2026-10-09) ────────
 * Wiremold 500 counts by the same three rules with its OWN parts: the flat
 * and inside elbows are sold per series (plan § 5, Q2), so a 500 run is
 * priced from 500 rows only. `SURFACE_RACEWAY_SERIES` is a closed list, not a
 * pattern — 1500 and 2400 have no fitting family and stay off this path.
 *
 * ── Wired (2026-10-08) ───────────────────────────────────────────────────────
 * `fittingRowsByRunType` (server/db.ts) sends a type whose raceway is the
 * shipped 500 or 700 row here instead of to `countFittings`, and each part goes out
 * under the role `SURFACE_RACEWAY_PART_ROLE` names. The flat elbow has its own
 * role, `elbowFlat` (0139), because an inside elbow and a flat elbow are two
 * parts on one type and a line is one per type and role.
 */
import {
  MERGE_WITHIN_FEET,
  fittingsForBend,
  legBends,
  MIN_BEND_DEGREES,
} from "./runBends";
import {
  OPEN_NODE,
  sticksFor,
  strapsFor,
  type FittingCount,
  type FittingKind,
  type FittingLeg,
} from "./runFittings";
import type { FittingRow } from "./runFittingMaterials";
import { countTeeBoxes, type TeeRef } from "./runNetwork";

/** Every part a 700 run counts, in the order a screen lists them. */
export const SURFACE_RACEWAY_PARTS = [
  "coupling",
  "entranceEnd",
  "clip",
  "insideElbow",
  "flatElbow",
  "tee",
] as const;
export type SurfaceRacewayPart = (typeof SURFACE_RACEWAY_PARTS)[number];

export const SURFACE_RACEWAY_PART_LABELS: Record<
  SurfaceRacewayPart,
  { one: string; many: string }
> = {
  coupling: { one: "coupling", many: "couplings" },
  entranceEnd: { one: "entrance end", many: "entrance ends" },
  clip: { one: "support clip", many: "support clips" },
  insideElbow: { one: "inside elbow", many: "inside elbows" },
  flatElbow: { one: "flat elbow", many: "flat elbows" },
  tee: { one: "tee", many: "tees" },
};

/**
 * The series this counter knows — a CLOSED list, never a pattern, so
 * `Surface raceway, 1500 series` cannot match by containing "500".
 */
export const SURFACE_RACEWAY_SERIES = ["500", "700"] as const;
export type SurfaceRacewaySeries = (typeof SURFACE_RACEWAY_SERIES)[number];

/** The shipped raceway row a series' run type prices. */
export function surfaceRacewayName(series: SurfaceRacewaySeries): string {
  return `Surface raceway, ${series} series`;
}

/**
 * Which series a raceway is, by its SHIPPED name and that name exactly, so a
 * company's renamed fork of the row still counts. A raceway the company made
 * itself has no shipped name and is none (it falls to the pipe path, which
 * says "no catalog match" rather than guessing).
 */
export function surfaceRacewaySeries(
  baselineName: string | null
): SurfaceRacewaySeries | null {
  return (
    SURFACE_RACEWAY_SERIES.find(
      series => baselineName === surfaceRacewayName(series)
    ) ?? null
  );
}

/**
 * Which bid-line ROLE each part goes out under. A line is one per run type
 * and role, so the six must be six roles: the inside elbow is `elbow90` (a
 * 90 at a plan corner, as on a pipe) and the flat elbow has its own
 * `elbowFlat` (0139) — reusing `elbow45` would fit the database and lie on
 * every screen that labels the role.
 */
export const SURFACE_RACEWAY_PART_ROLE = {
  coupling: "coupling",
  entranceEnd: "connector",
  clip: "strap",
  insideElbow: "elbow90",
  flatElbow: "elbowFlat",
  tee: "teeBox",
} as const satisfies Record<SurfaceRacewayPart, FittingKind>;

const PART_NAME_WORDS: Record<SurfaceRacewayPart, string> = {
  coupling: "coupling",
  entranceEnd: "entrance end fitting",
  clip: "support clip",
  insideElbow: "inside elbow",
  flatElbow: "flat elbow",
  tee: "tee",
};

/**
 * The shipped catalog name of one part of one series (seed:
 * raceUndergroundService). The series is REQUIRED — a default is how a 500
 * run would quietly price 700 parts.
 */
export function surfaceRacewayPartName(
  part: SurfaceRacewayPart,
  series: SurfaceRacewaySeries
): string {
  // One clip (V5703) and one tee (V5715) fit both series: the 700 row was
  // renamed in place to "500/700" and the 500 row retired into it (catalog
  // reality check, batch 2, raceway — shared/catalogRealityCheck20261009.ts).
  if (SHARED_500_700_PARTS.includes(part))
    return `Surface raceway ${PART_NAME_WORDS[part]}, 500/700 series`;
  return `Surface raceway ${PART_NAME_WORDS[part]}, ${series} series`;
}

/** Parts one row serves for 500 and 700 alike. */
const SHARED_500_700_PARTS: readonly SurfaceRacewayPart[] = ["clip", "tee"];

/** A part as a pick needs it. */
type Part = { id: number; name: string; costPerUnit: string | number };

/**
 * A surface-raceway type's fitting ROWS for the bid — one per part, under
 * its role (`SURFACE_RACEWAY_PART_ROLE`). The type's own choice of part wins
 * where the type has a column for that role; otherwise the catalog row of
 * the SAME series.
 */
export function surfaceRacewayFittingRows(
  series: SurfaceRacewaySeries,
  counts: Record<SurfaceRacewayPart, SurfaceRacewayCount>,
  overrides: Partial<Record<SurfaceRacewayPart, Part | null>>,
  found: (name: string) => Part | undefined
): FittingRow[] {
  return SURFACE_RACEWAY_PARTS.map(part => {
    const c = counts[part];
    const role = SURFACE_RACEWAY_PART_ROLE[part];
    const count: FittingCount =
      c.status === "counted"
        ? {
            kind: role,
            status: "counted",
            qty: c.qty,
            atLeast: c.atLeast,
            why: c.why,
          }
        : { kind: role, status: "unknown", why: c.why };
    const override = overrides[part] ?? null;
    const wanted = surfaceRacewayPartName(part, series);
    const row = override ?? found(wanted);
    return {
      role,
      count,
      pick: row
        ? {
            ok: true as const,
            materialId: row.id,
            name: row.name,
            costPerUnit: row.costPerUnit,
            override: override !== null,
          }
        : { ok: false as const, why: `No catalog match for ${wanted}` },
      qty: count.status === "counted" ? count.qty : 0,
    };
  });
}

/** Same three shapes as `FittingCount`, over the 700 parts. */
export type SurfaceRacewayCount =
  | {
      part: SurfaceRacewayPart;
      status: "counted";
      qty: number;
      atLeast: boolean;
      why: string;
    }
  | { part: SurfaceRacewayPart; status: "unknown"; why: string };

/** What the count needs of the raceway row. Structural, not the row. */
export type SurfaceRacewaySpec = {
  /** For the sentences: `Surface raceway, 700 series`. */
  name: string;
  /** Whose parts the sentences name — "goes into the 500 box". */
  series: SurfaceRacewaySeries;
  /** 10 ft for 700. NULL is not set: couplings say so, never a quiet 0. */
  stickLengthFeet: number | null;
  /**
   * Clip spacing. Ships NULL ("not set") until the owner gives a figure —
   * plan § 7, Q1 — so the clip count says "not set" rather than guessing.
   */
  strapSpacingFeet: number | null;
  strapFromBoxFeet: number | null;
};

/**
 * Everything one 700 run type buys for these legs.
 *
 * `ownedTees` are the tees whose fitting THIS type buys (`teeBoxOwners`), for
 * the same reason `countFittings` takes them: a tee two groups both see must
 * be bought once.
 */
export function countSurfaceRacewayFittings(
  legs: readonly FittingLeg[],
  raceway: SurfaceRacewaySpec,
  ownedTees: readonly TeeRef[]
): Record<SurfaceRacewayPart, SurfaceRacewayCount> {
  return {
    coupling: countCouplings(legs, raceway),
    entranceEnd: countEntranceEnds(legs, raceway.series),
    clip: countClips(legs, raceway),
    ...countElbows(legs, raceway.series),
    tee: countTees(ownedTees, raceway.series),
  };
}

function nothingTraced(part: SurfaceRacewayPart): SurfaceRacewayCount {
  return {
    part,
    status: "counted",
    qty: 0,
    atLeast: false,
    why: "Nothing traced",
  };
}

function countCouplings(
  legs: readonly FittingLeg[],
  raceway: SurfaceRacewaySpec
): SurfaceRacewayCount {
  const part = "coupling" as const;
  if (legs.length === 0) return nothingTraced(part);
  const stick = raceway.stickLengthFeet;
  if (stick === null || !(stick > 0)) {
    return {
      part,
      status: "unknown",
      why: `No stick length set on ${raceway.name} — couplings not counted`,
    };
  }
  const measured = legs.filter(leg => leg.feet !== null);
  const unmeasured = runsIn(legs.filter(leg => leg.feet === null));
  if (measured.length === 0)
    return { part, status: "unknown", why: unmeasuredWhy(unmeasured) };
  // Sticks minus one PER LEG, as for pipe: each leg starts a fresh length.
  const qty = measured.reduce(
    (sum, leg) => sum + Math.max(0, sticksFor(leg.feet!, stick) - 1),
    0
  );
  const sticks = measured.reduce(
    (sum, leg) => sum + sticksFor(leg.feet!, stick),
    0
  );
  const feet = round2(measured.reduce((sum, leg) => sum + leg.feet!, 0));
  const atLeast = unmeasured > 0 || measured.some(leg => leg.feetIsFloor);
  return {
    part,
    status: "counted",
    qty,
    atLeast,
    why:
      `${lead(atLeast)}${plural(qty, "coupling")}: ${plural(sticks, "length")} of ${trim(stick)} ft over ${trim(feet)} ft` +
      tail(atLeast, unmeasured, legs),
  };
}

/**
 * Rule 1: one per RUN, at the start of its root leg. A branch leg starts at a
 * tee, which is the tee fitting's job, so it buys none. The start of a
 * QUANTITY trace with no approved drop is an `open:` node — nobody said
 * anything is there — and buys none either, the same rule a pipe's connector
 * follows (D21). Needs no scale: a run with no measurement still has a start.
 */
function countEntranceEnds(
  legs: readonly FittingLeg[],
  series: SurfaceRacewaySeries
): SurfaceRacewayCount {
  const part = "entranceEnd" as const;
  if (legs.length === 0) return nothingTraced(part);
  let qty = 0;
  let open = 0;
  for (const leg of legs) {
    if (leg.id !== leg.runId) continue; // a branch leg
    if (leg.from.startsWith(OPEN_NODE)) open++;
    else qty++;
  }
  const notes =
    open > 0
      ? ` (none at ${plural(open, "quantity-trace start")} with no drop approved)`
      : "";
  return {
    part,
    status: "counted",
    qty,
    atLeast: false,
    why:
      `${plural(qty, "entrance end")}: one at the start of each run — the far end goes into the ${series} box` +
      notes,
  };
}

function countClips(
  legs: readonly FittingLeg[],
  raceway: SurfaceRacewaySpec
): SurfaceRacewayCount {
  const part = "clip" as const;
  if (legs.length === 0) return nothingTraced(part);
  const spacing = raceway.strapSpacingFeet;
  const fromBox = raceway.strapFromBoxFeet;
  if (
    spacing === null ||
    !(spacing > 0) ||
    fromBox === null ||
    !(fromBox >= 0)
  ) {
    return {
      part,
      status: "unknown",
      why: `No clip spacing set on ${raceway.name} — support clips not counted`,
    };
  }
  const measured = legs.filter(leg => leg.feet !== null);
  const unmeasured = runsIn(legs.filter(leg => leg.feet === null));
  if (measured.length === 0)
    return { part, status: "unknown", why: unmeasuredWhy(unmeasured) };
  let qty = 0;
  for (const leg of measured) {
    const s = strapsFor(leg.feet!, spacing, fromBox);
    qty += s.nearBox + s.between;
  }
  const feet = round2(measured.reduce((sum, leg) => sum + leg.feet!, 0));
  const atLeast = unmeasured > 0 || measured.some(leg => leg.feetIsFloor);
  return {
    part,
    status: "counted",
    qty,
    atLeast,
    why:
      `${lead(atLeast)}${plural(qty, "support clip")}: within ${trim(fromBox)} ft of each end and every ${trim(spacing)} ft over ${trim(feet)} ft` +
      tail(atLeast, unmeasured, legs),
  };
}

/**
 * Rule 2. Corners and drops are read by `legBends`, the same reading a pipe's
 * elbows use, so the two cannot disagree about where a run turns.
 *
 * A corner is one inside elbow per 90 in it (`fittingsForBend`). The 45 part
 * of an angled corner has no 700 fitting, so it is NOT counted and the
 * sentence says how many corners that leaves short — never silently rounded
 * to a 90. A homerun's corners nobody drew (`extraCorners`) are corners too.
 */
function countElbows(
  legs: readonly FittingLeg[],
  series: SurfaceRacewaySeries
): Pick<
  Record<SurfaceRacewayPart, SurfaceRacewayCount>,
  "insideElbow" | "flatElbow"
> {
  if (legs.length === 0) {
    return {
      insideElbow: nothingTraced("insideElbow"),
      flatElbow: nothingTraced("flatElbow"),
    };
  }
  let inside = 0;
  let corners = 0;
  // Corners whose angle has a 45° part, by their drawn degrees.
  const angled: number[] = [];
  let wobble = 0;
  let drops = 0;
  let unknownDrops = 0;
  let extra = 0;
  for (const leg of legs) {
    const read = legBends(leg, MERGE_WITHIN_FEET);
    wobble += read.wobble;
    unknownDrops += read.unknownDrops;
    for (const bend of read.bends) {
      if (bend.place.kind === "drop") {
        drops++;
        continue;
      }
      const f = fittingsForBend(bend);
      corners++;
      inside += f.n90;
      if (f.n45 > 0) angled.push(Math.round(bend.degrees));
    }
    if (leg.extraCorners && leg.extraCorners.count > 0) {
      extra += leg.extraCorners.count;
      inside += leg.extraCorners.count;
    }
  }

  const insideNotes: string[] = [];
  if (angled.length > 0)
    insideNotes.push(
      `${plural(angled.length, "corner")} not square (${angled.map(d => `${d}°`).join(", ")}) — no ${series} elbow makes the 45° part, add it by hand`
    );
  if (wobble > 0)
    insideNotes.push(
      `${plural(wobble, "corner")} under ${MIN_BEND_DEGREES}° treated as drawing wobble`
    );
  const insideParts: string[] = [];
  if (corners > 0) insideParts.push(plural(corners, "corner"));
  if (extra > 0)
    insideParts.push(plural(extra, "homerun corner") + " set on the bid");
  const insideAtLeast = angled.length > 0;
  const insideElbow: SurfaceRacewayCount = {
    part: "insideElbow",
    status: "counted",
    qty: inside,
    atLeast: insideAtLeast,
    why:
      (inside === 0
        ? "No corners drawn"
        : `${lead(insideAtLeast)}${plural(inside, "inside elbow")}: ${insideParts.join(" + ")}`) +
      (insideNotes.length > 0 ? ` (${insideNotes.join("; ")})` : ""),
  };

  const flatAtLeast = unknownDrops > 0;
  const flatElbow: SurfaceRacewayCount = {
    part: "flatElbow",
    status: "counted",
    qty: drops,
    atLeast: flatAtLeast,
    why:
      (drops === 0
        ? "No drops at the run ends"
        : `${lead(flatAtLeast)}${plural(drops, "flat elbow")}: one where the run turns down the wall at each counted drop`) +
      (unknownDrops > 0
        ? ` (${plural(unknownDrops, "end")} whose drop has no height yet)`
        : ""),
  };
  return { insideElbow, flatElbow };
}

/**
 * Rule 3: a tee fitting at every tee this type owns, except one standing on a
 * counted mark — that mark is the box the branch leaves from, already bought.
 * A tee with no fitting chosen still buys a tee of the run's series: on surface raceway there
 * is nothing else it could be, so there is no question to leave unanswered.
 */
function countTees(
  owned: readonly TeeRef[],
  series: SurfaceRacewaySeries
): SurfaceRacewayCount {
  const part = "tee" as const;
  if (owned.length === 0)
    return {
      part,
      status: "counted",
      qty: 0,
      atLeast: false,
      why: "No branch tees",
    };
  const { boxes, onMarks, unanswered } = countTeeBoxes(owned);
  const qty = boxes + unanswered;
  const onMarkNote =
    onMarks > 0
      ? ` (${onMarks} ${onMarks === 1 ? "tee is" : "tees are"} on a box already counted)`
      : "";
  return {
    part,
    status: "counted",
    qty,
    atLeast: false,
    why: `${plural(qty, "tee")}: a ${series} tee fitting at each branch, not a box${onMarkNote}`,
  };
}

// ── Words ────────────────────────────────────────────────────────────────────

function runsIn(legs: readonly FittingLeg[]): number {
  return new Set(legs.map(leg => leg.runId)).size;
}

function unmeasuredWhy(unmeasured: number): string {
  return `${plural(unmeasured, "run")} on a sheet with no scale — not measurable`;
}

function tail(
  atLeast: boolean,
  unmeasured: number,
  legs: readonly FittingLeg[]
): string {
  if (!atLeast) return "";
  const notes: string[] = [];
  if (unmeasured > 0) notes.push(unmeasuredWhy(unmeasured).toLowerCase());
  const floors = runsIn(
    legs.filter(leg => leg.feet !== null && leg.feetIsFloor)
  );
  if (floors > 0)
    notes.push(
      `${plural(floors, "run")} ${floors === 1 ? "has" : "have"} a drop with no height, so ${floors === 1 ? "its" : "their"} length is short`
    );
  return notes.length > 0 ? ` (${notes.join("; ")})` : "";
}

function lead(atLeast: boolean): string {
  return atLeast ? "At least " : "";
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
