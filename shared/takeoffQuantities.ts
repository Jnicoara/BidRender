/**
 * What a traced run becomes on a bill of materials.
 *
 * ── The distinction this module exists for ───────────────────────────────────
 * A conduit run and the wire inside it are two different quantities measured
 * along the same line, and conflating them is a real, costly estimating error
 * in both directions:
 *
 *   CONDUIT is counted ONCE per physical run. Three circuits sharing one pipe
 *           still need one pipe. Counting it per circuit triples the pipe,
 *           the fittings and the labour to bend it.
 *
 *   WIRE    is counted PER CIRCUIT, and within a circuit per conductor. Three
 *           circuits of 3 conductors each in one 100ft run is 900 feet of
 *           wire, not 100 and not 300. Undercounting here is money the
 *           contractor spends and never quoted for.
 *
 * They are computed by separate functions taking separate inputs so there is
 * no path where one silently becomes the other.
 *
 * ── Verticals ride alongside, never inside ───────────────────────────────────
 * A traced line measures flat overhead distance only. The drops and rises at
 * a run's two ends are computed in `shared/takeoffHeights.ts` and handed in
 * here, and they stay a SEPARATE field the whole way through: a drop adds to
 * conduit once and to wire once per conductor, and § 7.1 gives the two
 * allowances different reach over it. Nothing in this module adds a vertical
 * into a traced length.
 *
 * ── Cable runs are a different shape, not a special case ─────────────────────
 * Romex and MC are their own raceway: the cable IS the run. There is no
 * conduit line, and asking for one would put a phantom pipe on the bid. So
 * `cableFootage` exists and `conduitFootage` refuses a cable run rather than
 * returning zero — zero would flow into a total as if it had been considered.
 */
import {
  isUsableScaleRatio,
  pathRealInches,
  toBillableFeet,
  type PagePoint,
} from "./takeoffGeometry";
import type { RunVerticals } from "./takeoffHeights";

/** What kind of raceway a traced run represents. */
export const RUN_PATH_TYPES = ["conduit", "cable"] as const;
export type RunPathType = (typeof RUN_PATH_TYPES)[number];

/** One circuit pulled through a run. */
export type RunCircuit = {
  /** What the estimator calls it — "Ckt 12", "Panel A-3". Display only. */
  name: string;
  /**
   * How many conductors this circuit pulls through the run.
   *
   * Counted, not derived. A 3-wire circuit might be 2 + ground, or 2 hots and
   * a neutral, and deriving it from a voltage or a breaker size would be the
   * app guessing at something the estimator knows.
   */
  conductorCount: number;
};

/**
 * Whether a sheet can be measured against at all.
 *
 * The hard gate for this phase. Every path out of it that is not `ok` must
 * stop the UI from producing a distance — not show a greyed-out number, not
 * show zero, not show a guess.
 */
export type MeasurabilityBlock =
  | { ok: false; reason: "no-scale"; message: string }
  | { ok: false; reason: "not-to-scale"; message: string };
export type Measurability = { ok: true; ratio: number } | MeasurabilityBlock;

/**
 * Can this sheet be measured?
 *
 * Two ways to be blocked, deliberately distinguished because the fix differs:
 *
 *   no-scale      nothing is set. Set one.
 *   not-to-scale  the sheet SAYS it is not to scale, and no human has
 *                 overridden that. A detected or absent scale on a sheet
 *                 marked N.T.S. is not evidence of anything — the drawing is
 *                 telling you its geometry is not trustworthy. Only an
 *                 explicit manual scale clears this, because only a person can
 *                 decide that measuring anyway is reasonable.
 */
export function measurabilityOf(sheet: {
  scaleRatio: number | null;
  scaleSource: "detected" | "manual" | "none";
  notToScale: boolean;
}): Measurability {
  if (sheet.notToScale && sheet.scaleSource !== "manual") {
    return {
      ok: false,
      reason: "not-to-scale",
      message:
        "This sheet is marked not to scale, so measuring it would produce a number the drawing " +
        "does not support. Set a scale by hand if you know what it should be.",
    };
  }

  if (!isUsableScaleRatio(sheet.scaleRatio)) {
    return {
      ok: false,
      reason: "no-scale",
      message:
        "This sheet has no scale set. Set one before tracing — nothing can be measured without it.",
    };
  }

  return { ok: true, ratio: sheet.scaleRatio };
}

/** A traced run, as the quantity functions need it. */
export type TracedRun = {
  pathType: RunPathType;
  points: PagePoint[];
};

/**
 * The measured length of a run in billable feet, or null if it cannot be
 * measured. Shared by both raceway types — the length is the length.
 */
export function runFeet(
  run: TracedRun,
  ratio: number | null | undefined
): number | null {
  const inches = pathRealInches(run.points, ratio);
  if (inches === null) return null;
  return toBillableFeet(inches);
}

/**
 * Conduit footage for a run: the traced length, ONCE.
 *
 * Takes no circuits argument, and that is the safeguard rather than an
 * oversight — there is no way to accidentally multiply this by anything,
 * because the number of circuits is not in scope.
 *
 * Refuses a cable run: a cable is its own raceway, and returning 0 would let a
 * phantom conduit line reach a bid as a considered zero rather than as the
 * "not applicable" it actually is.
 */
export function conduitFeet(
  run: TracedRun,
  ratio: number | null | undefined
): number | null {
  if (run.pathType !== "conduit") return null;
  return runFeet(run, ratio);
}

/**
 * Cable footage for a run: the traced length, once. No conduit alongside it.
 *
 * Refuses a conduit run for the mirror-image reason.
 */
export function cableFeet(
  run: TracedRun,
  ratio: number | null | undefined
): number | null {
  if (run.pathType !== "cable") return null;
  return runFeet(run, ratio);
}

/** Wire for one circuit: the full run length once per conductor. */
export type CircuitWire = {
  name: string;
  conductorCount: number;
  /** The traced length, once per conductor. */
  flatFeet: number;
  /**
   * The run's vertical footage, once per conductor.
   *
   * A drop adds to conduit ONCE and to wire once PER CONDUCTOR — see § 2.4.
   * Kept as its own field rather than added into `flatFeet`, because § 7.1
   * applies the wire allowance to this and the conduit allowance to neither.
   */
  verticalFeet: number;
  /** Both of the above. This is the number that goes on the bid. */
  feet: number;
};

/**
 * Conductors this circuit actually pulls.
 *
 * A non-positive or non-finite count contributes nothing rather than NaN — one
 * bad row must not poison a whole total.
 */
function conductorsOf(circuit: RunCircuit): number {
  return Number.isFinite(circuit.conductorCount) && circuit.conductorCount > 0
    ? Math.floor(circuit.conductorCount)
    : 0;
}

/**
 * Wire footage per circuit, and the total, for a conduit run.
 *
 * Each circuit gets the FULL run length times its own conductor count. A
 * circuit sharing the pipe does not share the wire — its conductors run the
 * whole way alongside the others.
 *
 * Returns null when the run cannot be measured, and an empty breakdown with a
 * zero total when there are simply no circuits yet — those are different
 * situations and the caller can tell them apart.
 */
export function wireFeetByCircuit(
  run: TracedRun,
  circuits: RunCircuit[],
  ratio: number | null | undefined
): { perCircuit: CircuitWire[]; totalFeet: number } | null {
  if (run.pathType !== "conduit") return null;
  const length = runFeet(run, ratio);
  if (length === null) return null;

  const perCircuit = circuits.map(circuit => {
    const conductors = conductorsOf(circuit);
    const flat = round2(length * conductors);
    return {
      name: circuit.name,
      conductorCount: conductors,
      flatFeet: flat,
      // Traced wire only. Vertical wire is added by `quantitiesForRun`, which
      // is the one place that knows what is at the ends of this run.
      verticalFeet: 0,
      feet: flat,
    };
  });

  const totalFeet = round2(perCircuit.reduce((sum, c) => sum + c.feet, 0));
  return { perCircuit, totalFeet };
}

/**
 * Vertical wire per circuit: the run's vertical footage, once per conductor.
 *
 * A separate function from `wireFeetByCircuit` rather than an extra argument to
 * it, for the reason this module's header gives about conduit and wire: they
 * are computed by separate functions taking separate inputs so there is no
 * path where one silently becomes the other. A vertical needs no scale and no
 * geometry — it is arithmetic between two elevations the estimator typed — so
 * it does not belong inside a function whose job is measuring a traced path.
 */
export function verticalWireFeetByCircuit(
  verticalFeet: number,
  circuits: RunCircuit[]
): { perCircuit: { name: string; feet: number }[]; totalFeet: number } {
  const usable =
    Number.isFinite(verticalFeet) && verticalFeet > 0 ? verticalFeet : 0;
  const perCircuit = circuits.map(circuit => ({
    name: circuit.name,
    feet: round2(usable * conductorsOf(circuit)),
  }));
  return {
    perCircuit,
    totalFeet: round2(perCircuit.reduce((sum, c) => sum + c.feet, 0)),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Everything a run contributes to a bill of materials.
 *
 * ── Flat, vertical and total are three fields, on purpose ────────────────────
 * `runFeet` is what was traced. `verticalFeet` is the drops and rises at the
 * two ends. `conduitFeet` / `cableFeet` / `totalWireFeet` are what actually
 * gets bought, which is both.
 *
 * The vertical is NEVER folded into `runFeet`, for two reasons. An estimator
 * has to be able to see where every foot came from (§ 2.4), and § 7.1 applies
 * the conduit allowance to the traced length ONLY while the wire allowance
 * covers everything — a rule that cannot be written at all once the two have
 * been added together.
 */
/**
 * "This run has no verticals to apply" — said out loud.
 *
 * Passed where no heights have been resolved: a sheet read before the settings
 * exist, a test fixture about traced length, a caller that genuinely has none.
 * It is a named value rather than a bare `null` so a reader of the call site
 * can tell a decision from an omission, and so this comment has somewhere to
 * live. See `quantitiesForRun` for why the argument is required at all.
 */
export const NO_VERTICALS: RunVerticals | null = null;

export type RunQuantities = {
  pathType: RunPathType;
  /** The traced length itself, in feet. Flat, overhead, no verticals. */
  runFeet: number;
  /** Drops and rises at the two ends, counted once each. 0 when none. */
  verticalFeet: number;
  /**
   * Both ends in full — which one is counted, which is not, and why not.
   * Null when no heights were supplied at all. The run breakdown renders this
   * line by line rather than showing a single vertical figure.
   */
  verticals: RunVerticals | null;
  /** Pipe to buy: traced plus vertical. Null for a cable run — not zero. */
  conduitFeet: number | null;
  /** Cable to buy: traced plus vertical. Null for a conduit run — not zero. */
  cableFeet: number | null;
  /** Wire per circuit, flat and vertical apart. Empty for a cable run. */
  wireByCircuit: CircuitWire[];
  /** All conductors, all circuits, verticals included. 0 for a cable run. */
  totalWireFeet: number;
};

/**
 * The full quantity breakdown for one run.
 *
 * Returns null when the sheet is not measurable, so a caller cannot get a
 * partial answer out of it and show that as a total. That refusal covers the
 * verticals too, even though a vertical needs no scale: showing the drops for
 * a run whose traced length is unknown would put a partial figure on screen,
 * and a partial total reads as a complete one. The run says so on its own row
 * instead — see § 5d.
 *
 * ── `verticals` is REQUIRED, and that is not an oversight to tidy up ─────────
 * It would be easy to default it to `null` and spare every existing caller a
 * line. Do not. An optional argument meaning "none" is one a future caller can
 * forget, and what they get back is a quietly low footage — no error, no
 * warning, and a bid that is under by however much vertical the job had.
 *
 * This is the exact shape of the bug `CLAUDE.md` § AI features describes in
 * `invokeAnthropic`: a field the type allowed, nothing complained about, and
 * whose only symptom was money. That one was found by accident, a year late,
 * while costing something else. This one's symptom is footage, which is worse
 * — a total that is too high gets queried, and a total that is too low looks
 * like a competitive bid.
 *
 * So every call site states its answer. `NO_VERTICALS` is what a caller with
 * no heights to apply passes, and it reads as the decision it is rather than
 * as a hole somebody left. The cost is a word at each call site; the thing it
 * buys is that adding a caller which SHOULD have verticals and does not is a
 * compile error rather than a wrong number.
 *
 * ── What the compiler does NOT cover, so nobody assumes it does ──────────────
 * `tsconfig.json` excludes every `.test.ts` file, and vitest does not
 * typecheck what it runs. A
 * TEST can therefore still omit the argument and get `undefined`, which reads
 * as none. Every test passes it anyway, by convention rather than by
 * enforcement — partly so the suite exercises the shape the app actually uses,
 * and partly because a test fixture that quietly means "none" is how a wrong
 * expectation comes to look like a passing one.
 */
export function quantitiesForRun(
  run: TracedRun,
  circuits: RunCircuit[],
  ratio: number | null | undefined,
  verticals: RunVerticals | null
): RunQuantities | null {
  const length = runFeet(run, ratio);
  if (length === null) return null;

  const verticalFeet = verticals?.feet ?? 0;

  if (run.pathType === "cable") {
    return {
      pathType: "cable",
      runFeet: length,
      verticalFeet,
      verticals,
      conduitFeet: null,
      cableFeet: round2(length + verticalFeet),
      wireByCircuit: [],
      totalWireFeet: 0,
    };
  }

  const flatWire = wireFeetByCircuit(run, circuits, ratio);
  const verticalWire = verticalWireFeetByCircuit(verticalFeet, circuits);
  const wireByCircuit = (flatWire?.perCircuit ?? []).map((circuit, index) => {
    const vertical = verticalWire.perCircuit[index]?.feet ?? 0;
    return {
      ...circuit,
      verticalFeet: vertical,
      feet: round2(circuit.flatFeet + vertical),
    };
  });

  return {
    pathType: "conduit",
    runFeet: length,
    verticalFeet,
    verticals,
    conduitFeet: round2(length + verticalFeet),
    cableFeet: null,
    wireByCircuit,
    totalWireFeet: round2((flatWire?.totalFeet ?? 0) + verticalWire.totalFeet),
  };
}

/**
 * Roll several runs into one bill of materials.
 *
 * The shared-run rule made explicit: conduit is summed once per RUN, wire is
 * summed across every circuit of every run. Runs that cannot be measured are
 * reported separately rather than contributing zero, because a total that
 * silently excludes an unmeasurable run reads as complete when it is not.
 */
export function totalQuantities(
  runs: {
    run: TracedRun;
    circuits: RunCircuit[];
    ratio: number | null | undefined;
    /**
     * Required, like the argument it is passed to. `NO_VERTICALS` where there
     * are none — see `quantitiesForRun` for why this may not be optional.
     */
    verticals: RunVerticals | null;
  }[]
): {
  /** Traced plus vertical. What gets bought. */
  conduitFeet: number;
  cableFeet: number;
  wireFeet: number;
  /**
   * The vertical share of each of the three above, so the totals panel can
   * print `1,240 flat + 255 vertical` rather than one figure to be trusted.
   */
  conduitVerticalFeet: number;
  cableVerticalFeet: number;
  wireVerticalFeet: number;
  /** How many runs could not be measured, and so are NOT in the totals above. */
  unmeasurableCount: number;
  /**
   * Measured runs carrying NO vertical footage at all.
   *
   * The zero has to shout. An unset height makes a total quietly low and
   * nothing on screen says so, which is the failure § 2.3 describes for an
   * unset allowance. This count is what lets the panel say "23 runs are
   * counted flat only" instead of leaving it to be noticed.
   */
  flatOnlyCount: number;
} {
  let conduit = 0;
  let cable = 0;
  let wire = 0;
  let conduitVertical = 0;
  let cableVertical = 0;
  let wireVertical = 0;
  let unmeasurable = 0;
  let flatOnly = 0;

  for (const entry of runs) {
    const quantities = quantitiesForRun(
      entry.run,
      entry.circuits,
      entry.ratio,
      entry.verticals
    );
    if (!quantities) {
      unmeasurable++;
      continue;
    }
    conduit += quantities.conduitFeet ?? 0;
    cable += quantities.cableFeet ?? 0;
    wire += quantities.totalWireFeet;

    if (quantities.verticalFeet <= 0) {
      flatOnly++;
      continue;
    }
    if (quantities.pathType === "conduit") {
      conduitVertical += quantities.verticalFeet;
      for (const circuit of quantities.wireByCircuit)
        wireVertical += circuit.verticalFeet;
    } else {
      cableVertical += quantities.verticalFeet;
    }
  }

  return {
    conduitFeet: round2(conduit),
    cableFeet: round2(cable),
    wireFeet: round2(wire),
    conduitVerticalFeet: round2(conduitVertical),
    cableVerticalFeet: round2(cableVertical),
    wireVerticalFeet: round2(wireVertical),
    unmeasurableCount: unmeasurable,
    flatOnlyCount: flatOnly,
  };
}
