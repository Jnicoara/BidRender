/**
 * EXTRAS BY THE FOOT — underground warning tape, and anything a shop adds.
 *
 * references/per-foot-items-plan.md § 3a. A run type keeps its one raceway,
 * conductor and ground and gains a list of EXTRAS, each a foot-sold material
 * with a feet-per-foot and a choice of WHICH feet it follows:
 *
 *   flat   the traced horizontal length only. Tape and tracer wire lie in the
 *          trench; they do not go up the riser.
 *   all    every installed foot, verticals included. A pull rope or mule
 *          tape goes through every foot of pipe.
 *
 * ── Waste (owner, 2026-10-08, decision 5) ────────────────────────────────────
 * The run's resolved RACEWAY extra % (`extrasForRun(...).conduitPct`, which
 * already walks run → type → company → accepted starter) applies to every
 * extra as BOUGHT feet. Labor reads INSTALLED feet, as for the raceway: extra
 * is material only (held-migrations plan § 1).
 *
 * ── "Shared trench? Set this extra to 0" (decision 4) ────────────────────────
 * A bid line can override the type's feet per foot for every run of the type
 * on that bid (`bid_line_items.extraFeetPerFoot`, M2). NULL follows the type;
 * 0 is the shared-trench answer. `feetPerFootFor` is the one place that reads
 * the two together.
 *
 * ── Not wired yet ────────────────────────────────────────────────────────────
 * Pure arithmetic over a run's `RunQuantities`. Nothing calls it until
 * `takeoff_run_type_extras` (M1) exists and `groupRunFootage` sums it.
 */
import type { RunQuantities } from "./takeoffQuantities";

export const EXTRA_APPLIES_TO = ["flat", "all"] as const;
export type ExtraAppliesTo = (typeof EXTRA_APPLIES_TO)[number];

/** One extra on a run type, as the arithmetic needs it. */
export type PerFootExtra = {
  feetPerFoot: number;
  appliesTo: ExtraAppliesTo;
};

/**
 * The feet per foot that applies on THIS bid: the line's answer when it has
 * one, else the type's. A 0 on the line is an answer ("shared trench"), not
 * unset — `??`, never `||`.
 */
export function feetPerFootFor(
  extra: PerFootExtra,
  lineFeetPerFoot: number | null
): number {
  return lineFeetPerFoot ?? extra.feetPerFoot;
}

export type ExtraFeet = {
  /** Feet the extra follows × feet per foot. What its labor reads. */
  installedFeet: number;
  /** Installed + waste. What its material reads. */
  boughtFeet: number;
  /** The waste inside `boughtFeet`. Material only. */
  wasteFeet: number;
};

/**
 * One run's feet of one extra. NULL when the run could not be measured — a
 * sheet with no scale — which is unknown, never zero (`quantitiesForRun`
 * returns null for exactly that case, and this passes it through).
 */
export function extraFeetForRun(
  quantities: Pick<RunQuantities, "runFeet" | "verticalFeet"> | null,
  extra: PerFootExtra,
  /** The run's resolved raceway extra, as a fraction: 0.1 is 10%. */
  wastePct: number,
  lineFeetPerFoot: number | null = null
): ExtraFeet | null {
  if (quantities === null) return null;
  const followed =
    extra.appliesTo === "flat"
      ? quantities.runFeet
      : quantities.runFeet + quantities.verticalFeet;
  const installed = round2(followed * feetPerFootFor(extra, lineFeetPerFoot));
  const waste = round2(installed * wastePct);
  return {
    installedFeet: installed,
    boughtFeet: round2(installed + waste),
    wasteFeet: waste,
  };
}

/** One run's input to the type-level sum. */
export type ExtraRun = {
  quantities: Pick<RunQuantities, "runFeet" | "verticalFeet"> | null;
  wastePct: number;
};

export type ExtraFeetTotal = ExtraFeet & {
  /** Runs that could not be measured, and so are NOT in the feet. */
  unmeasurableCount: number;
  /** A sentence saying how the figure was reached. */
  why: string;
};

/**
 * Every run of one type, summed — what one extra line on the bid carries.
 * Waste is applied per run, because a run can carry its own extra %.
 */
export function extraFeetForRuns(
  runs: readonly ExtraRun[],
  extra: PerFootExtra,
  /** The bid line's override (M2): NULL follows the type, 0 is shared trench. */
  lineFeetPerFoot: number | null,
  /** For the sentence: "Underground warning tape". */
  name: string
): ExtraFeetTotal {
  let installed = 0;
  let waste = 0;
  let measured = 0;
  let unmeasurable = 0;
  for (const run of runs) {
    const feet = extraFeetForRun(
      run.quantities,
      extra,
      run.wastePct,
      lineFeetPerFoot
    );
    if (feet === null) {
      unmeasurable++;
      continue;
    }
    measured++;
    installed += feet.installedFeet;
    waste += feet.wasteFeet;
  }
  installed = round2(installed);
  waste = round2(waste);
  const bought = round2(installed + waste);
  const rate = feetPerFootFor(extra, lineFeetPerFoot);

  let why: string;
  if (lineFeetPerFoot === 0) {
    why = `0 ft of ${name} — shared trench (set on this bid)`;
  } else if (measured === 0 && unmeasurable === 0) {
    why = "Nothing traced";
  } else {
    const which =
      extra.appliesTo === "flat"
        ? "the flat length only, not the risers"
        : "every foot, risers included";
    const per = rate === 1 ? "" : ` × ${trim(rate)} per foot`;
    const wastePart = waste > 0 ? ` + ${trim(waste)} ft waste` : "";
    why = `${trim(bought)} ft of ${name}: ${trim(installed)} ft over ${plural(measured, "run")}, ${which}${per}${wastePart}`;
  }
  if (unmeasurable > 0)
    why += ` (${plural(unmeasurable, "run")} on a sheet with no scale — not counted)`;

  return {
    installedFeet: installed,
    boughtFeet: bought,
    wasteFeet: waste,
    unmeasurableCount: unmeasurable,
    why,
  };
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
