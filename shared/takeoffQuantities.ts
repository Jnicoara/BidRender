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
 *   GROUND  is counted ONCE PER PIPE — like the conduit, and unlike the wire.
 *           Conductors sharing a raceway share one equipment grounding
 *           conductor, sized for the largest circuit in it. See `runGrounds`.
 *           This was counted per circuit until 2026-09-24, which billed three
 *           grounds for a pipe that gets one.
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
import { uncountedEnds, type RunVerticals } from "./takeoffHeights";

/** What kind of raceway a traced run represents. */
export const RUN_PATH_TYPES = ["conduit", "cable"] as const;
export type RunPathType = (typeof RUN_PATH_TYPES)[number];

/** One circuit pulled through a run. */
export type RunCircuit = {
  /** What the estimator calls it — "Ckt 12", "Panel A-3". Display only. */
  name: string;
  /**
   * INSULATED conductors this circuit pulls. The ground is counted separately.
   *
   * Counted, not derived. Deriving it from a voltage or a breaker size would
   * be the app guessing at something the estimator knows.
   *
   * **This meaning changed on 2026-09-20 and the change is not visible in the
   * type.** It used to include the ground — a 2-wire-and-ground circuit was 3.
   * Now that circuit is `conductorCount: 2, groundCount: 1`, because a ground
   * is a different wire: often smaller, sometimes bare, and never orderable as
   * THHN. "2 #12 + ground" is how it is written on a drawing and said out loud,
   * and the app now stores it the same way.
   */
  conductorCount: number;
  /**
   * Grounds this circuit NEEDS. Usually one.
   *
   * ── It is a requirement, not a pull, and that changed on 2026-09-24 ───────
   * This used to be counted straight into the footage: every circuit pulled
   * its own ground the full length of the run, so a pipe with three circuits
   * was billed three grounds. That is not how the wire goes in — conductors
   * sharing a raceway share ONE equipment grounding conductor, sized for the
   * largest circuit in the pipe.
   *
   * So the run pulls the LARGEST of these once (`runGrounds`), and this number
   * sizes that pull rather than adding to it. A circuit that genuinely runs
   * its own — an isolated ground — says so with `separateGround`, and then
   * this count is pulled on top.
   *
   * ── REQUIRED, AND THAT IS THE POINT ────────────────────────────────────────
   * It was optional for one afternoon, so that a caller which had not been told
   * about grounds would keep producing the numbers it produced before. That is
   * a real property and it still holds — but as an OPTIONAL FIELD it was a
   * reminder rather than a mechanism, and three routers had already proved that
   * a field which can be left out will be left out. They dropped it, every
   * circuit in the app reported one conductor short, and a bid's wire went
   * 125.01 ft to 83.34 ft with nothing on screen to say so.
   *
   * So the property moved to where it can be enforced instead of hoped for:
   * `circuitWire` turns a stored NULL into 0, and nothing else constructs one of
   * these. Leaving this out is now a compile error, which is the difference
   * between a rule and a mechanism.
   */
  groundCount: number;
  /**
   * This circuit pulls its OWN ground instead of sharing the run's.
   *
   * REQUIRED for the same reason `groundCount` is: it decides a wire quantity,
   * and an optional field that decides a wire quantity is a reminder rather
   * than a mechanism. Every existing caller had to say which it meant, and
   * `circuitWire` is the one place that turns a stored NULL into `false`.
   */
  separateGround: boolean;
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
  /** Insulated conductors. Since 2026-09-20 this excludes the ground. */
  conductorCount: number;
  /**
   * Grounds THIS CIRCUIT pulls on its own. Zero for a circuit that shares.
   *
   * ── Renamed from `groundCount` on 2026-09-24, deliberately loudly ─────────
   * The old field meant "grounds this circuit has" and was counted into the
   * footage. The shared ground now belongs to the RUN (`RunQuantities.grounds`)
   * and only an isolated-ground circuit has one of its own, so the old name
   * over-reports on every sharing circuit — which is every circuit by default.
   *
   * Renaming rather than re-meaning is the point: a reader of the old name
   * gets a compile error instead of a number that is quietly too big. See
   * CLAUDE.md § "a label describing the OLD meaning is worse than no label".
   */
  ownGroundCount: number;
  /** The insulated conductors' share of `flatFeet`. */
  insulatedFeet: number;
  /** This circuit's own grounds' share. Zero when it shares the run's. */
  ownGroundFeet: number;
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
 * A stored circuit row, as it comes out of `takeoff_run_circuits`.
 *
 * Named here so the mapper below can take the row itself rather than a
 * hand-built object — see `circuitWire`.
 */
export type StoredCircuit = {
  name: string;
  conductorCount: number;
  groundCount: number | null;
  /** 0072. NULL reads as false — sharing — and carries no meaning of its own. */
  separateGround: boolean | null;
};

/**
 * Turn a stored circuit into the shape the arithmetic takes.
 *
 * ── Why this exists, and it is not tidiness ─────────────────────────────────
 * Three routers used to hand-map a circuit row into `{ name, conductorCount }`.
 * The moment 0063 split the ground out, every one of those became a circuit
 * reported ONE CONDUCTOR SHORT — not an error, not a missing field, just less
 * wire on every run, with nothing on screen to say so. A bid on the local
 * database went from 125.01 ft to 83.34 ft the instant the migration landed.
 *
 * So the mapping is a function, and it takes the ROW. `circuits.map(circuitWire)`
 * has nothing to destructure and therefore nothing to forget.
 *
 * ── And it is the ONLY place that knows what a missing ground means ─────────
 * `RunCircuit.groundCount` is REQUIRED, so a hand-mapped object no longer
 * compiles — which is what closes the hole this function was first written to
 * paper over. The "a row the backfill has not reached still reads as it always
 * did" property has not gone anywhere; it moved HERE, to the one line that
 * turns a stored NULL into a zero, where it is enforced rather than hoped for.
 *
 * That is the whole lesson of 2026-09-20 in one function: a partial forcing
 * function still has a hole, and a rule without a failure is not a mechanism.
 */
export function circuitWire(row: StoredCircuit): RunCircuit {
  return {
    name: row.name,
    conductorCount: row.conductorCount,
    // NULL is a row the backfill has not reached. Zero, never one — see the
    // type, and 0061 on why the column is nullable rather than defaulted.
    groundCount: row.groundCount ?? 0,
    // NULL is a circuit written before there was a question. Sharing is the
    // default and the physically correct answer, so false — see 0072.
    separateGround: row.separateGround ?? false,
  };
}

/**
 * THE GROUNDS ACTUALLY IN THE PIPE — once for everything that shares one.
 *
 * ── The rule, and why it is not per circuit ─────────────────────────────────
 * Conductors sharing a raceway share ONE equipment grounding conductor, sized
 * for the largest circuit in the pipe. Two #12 circuits down one 1/2" EMT pull
 * one ground, not two. Counting it per circuit is the same error as counting
 * the CONDUIT per circuit, which this module's header has refused from the
 * start — and it had been making it since grounds existed.
 *
 * ── "Sized to the largest" is a MAX, and today it is degenerate ─────────────
 * A run type names ONE conductor material, so every circuit on a run is the
 * same gauge and the largest is whatever they all are. The max is therefore
 * exact today AND stays correct if a per-circuit conductor size ever arrives,
 * which a `1` hard-coded here would not. It is written as the rule rather than
 * as the shortcut the current schema would allow.
 *
 * ── A separate ground is ON TOP, never instead ─────────────────────────────
 * An isolated-ground circuit runs its own EGC back to the panel AND the pipe
 * still carries the shared one for everything else in it. So the two are added.
 * The only case with no shared ground is one where EVERY circuit pulls its own.
 */
export type RunGrounds = {
  /** The shared pull: the largest ground count among sharing circuits. */
  sharedCount: number;
  /** Grounds belonging to circuits that run their own. Summed, not maxed. */
  separateCount: number;
  /** Ground conductors physically in the pipe. What multiplies a length. */
  totalCount: number;
};

export function runGrounds(circuits: readonly RunCircuit[]): RunGrounds {
  let sharedCount = 0;
  let separateCount = 0;
  for (const circuit of circuits) {
    const grounds = groundsOf(circuit);
    if (circuit.separateGround) separateCount += grounds;
    else sharedCount = Math.max(sharedCount, grounds);
  }
  return {
    sharedCount,
    separateCount,
    totalCount: sharedCount + separateCount,
  };
}
/**
 * Conductors this circuit actually pulls.
 *
 * A non-positive or non-finite count contributes nothing rather than NaN — one
 * bad row must not poison a whole total.
 */
function countOf(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Insulated conductors only. */
function insulatedOf(circuit: RunCircuit): number {
  return countOf(circuit.conductorCount);
}

/** Grounds only. Guarded like the conductor count: one bad row poisons nothing. */
function groundsOf(circuit: RunCircuit): number {
  return countOf(circuit.groundCount);
}

/**
 * Wires this circuit pulls ITSELF — its conductors, plus its own ground only.
 *
 * ── It used to be conductors + grounds, full stop ──────────────────────────
 * That was right while every circuit carried its own ground. Since 2026-09-24
 * the shared ground belongs to the RUN and is counted once there, so folding
 * it in here would count it again per circuit — which is the over-count this
 * whole change exists to remove.
 *
 * Every per-circuit footage goes through here, so there is no path on which
 * the flat and the vertical can disagree about what a circuit pulls.
 */
function ownWiresOf(circuit: RunCircuit): number {
  return insulatedOf(circuit) + ownGroundsOf(circuit);
}

/** A circuit's own grounds: what it pulls separately, or nothing if it shares. */
function ownGroundsOf(circuit: RunCircuit): number {
  return circuit.separateGround ? groundsOf(circuit) : 0;
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
): {
  perCircuit: CircuitWire[];
  /** The shared ground's traced footage — once for the pipe, not per circuit. */
  sharedGroundFeet: number;
  /** Every conductor, shared ground included. */
  totalFeet: number;
} | null {
  if (run.pathType !== "conduit") return null;
  const length = runFeet(run, ratio);
  if (length === null) return null;

  const perCircuit = circuits.map(circuit => {
    const insulated = insulatedOf(circuit);
    const ownGrounds = ownGroundsOf(circuit);
    /*
      Two footages and their sum, kept apart for the reason the vertical is
      kept apart from the traced length: they are different purchases. Bare
      copper cannot be ordered as THHN, and a ground is frequently a size down.

      The SHARED ground is not here at all — it belongs to the run, is pulled
      once, and is returned beside this list. Only a circuit that runs its own
      contributes ground footage of its own.
    */
    const insulatedFeet = round2(length * insulated);
    const ownGroundFeet = round2(length * ownGrounds);
    const flat = round2(insulatedFeet + ownGroundFeet);
    return {
      name: circuit.name,
      conductorCount: insulated,
      ownGroundCount: ownGrounds,
      insulatedFeet,
      ownGroundFeet,
      flatFeet: flat,
      // Traced wire only. Vertical wire is added by `quantitiesForRun`, which
      // is the one place that knows what is at the ends of this run.
      verticalFeet: 0,
      feet: flat,
    };
  });

  const sharedGroundFeet = round2(length * runGrounds(circuits).sharedCount);
  const totalFeet = round2(
    perCircuit.reduce((sum, c) => sum + c.feet, 0) + sharedGroundFeet
  );
  return { perCircuit, sharedGroundFeet, totalFeet };
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
): {
  perCircuit: { name: string; feet: number }[];
  /** The shared ground goes down the drop ONCE, like the pipe around it. */
  sharedGroundFeet: number;
  totalFeet: number;
} {
  const usable =
    Number.isFinite(verticalFeet) && verticalFeet > 0 ? verticalFeet : 0;
  const perCircuit = circuits.map(circuit => ({
    name: circuit.name,
    feet: round2(usable * ownWiresOf(circuit)),
  }));
  const sharedGroundFeet = round2(usable * runGrounds(circuits).sharedCount);
  return {
    perCircuit,
    sharedGroundFeet,
    totalFeet: round2(
      perCircuit.reduce((sum, c) => sum + c.feet, 0) + sharedGroundFeet
    ),
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
  /**
   * The ground conductors in this pipe, and where they came from.
   *
   * A run-level answer because the ground is a run-level thing: one shared
   * pull sized to the largest circuit, plus any circuit that runs its own.
   * `sharedCount` is 0 on a cable run — a cable's ground is inside the jacket.
   */
  grounds: RunGrounds;
  /**
   * BARE COPPER FOR THIS RUN — traced and vertical, shared and separate.
   *
   * The one number to read for ground footage. It used to be derived by
   * summing `wireByCircuit[].groundFeet`, which three separate callers did by
   * hand; the moment the shared ground stopped belonging to a circuit, every
   * one of those would have reported zero ground on an ordinary run. So it is
   * computed once, here, and the per-circuit field was renamed so the old
   * summation cannot compile. 0 for a cable run, never null: a conduit run
   * with no grounds really is zero bare copper.
   */
  groundFeet: number;
  /**
   * The TRACED share of all this run's wire — shared ground included.
   *
   * ── Here rather than summed from `wireByCircuit`, and that is the point ────
   * The panel printed `flat + vertical = total` by adding up the circuit rows
   * itself. The moment the shared ground stopped belonging to a circuit, those
   * two sums stopped adding to `totalWireFeet` — so the line would have shown
   * its own arithmetic failing, in public, on the screen whose job is showing
   * where every foot came from. Same class as the three hand-mapped circuit
   * rows of 2026-09-20: a total assembled by a caller goes stale silently when
   * what it is made of changes.
   *
   * So the split is computed once, where the shared ground is known, and
   * `wireFlatFeet + wireVerticalFeet === totalWireFeet` always.
   */
  wireFlatFeet: number;
  /** The VERTICAL share of all this run's wire — shared ground included. */
  wireVerticalFeet: number;
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
      // A cable's ground is inside the jacket and already paid for by
      // `cableFeet`. Counting one here would buy it twice.
      grounds: { sharedCount: 0, separateCount: 0, totalCount: 0 },
      groundFeet: 0,
      wireFlatFeet: 0,
      wireVerticalFeet: 0,
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

  /*
    Ground footage, added up in ONE place.

    The shared pull, flat and vertical, plus whatever the circuits running
    their own contribute. Every caller reads this rather than re-deriving it —
    see the field's comment for what happened to the three that used to.
  */
  const groundFeet = round2(
    (flatWire?.sharedGroundFeet ?? 0) +
      verticalWire.sharedGroundFeet +
      wireByCircuit.reduce((sum, c) => sum + c.ownGroundFeet, 0) +
      // An own ground's share of that circuit's vertical: its drops, once per
      // ground, which is exactly what `ownWiresOf` already counted for it.
      circuits.reduce(
        (sum, circuit) => sum + verticalFeet * ownGroundsOf(circuit),
        0
      )
  );

  return {
    pathType: "conduit",
    runFeet: length,
    verticalFeet,
    verticals,
    conduitFeet: round2(length + verticalFeet),
    cableFeet: null,
    wireByCircuit,
    grounds: runGrounds(circuits),
    groundFeet,
    wireFlatFeet: round2(flatWire?.totalFeet ?? 0),
    wireVerticalFeet: round2(verticalWire.totalFeet),
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
   * The bare-ground share of `wireFeet`, NOT a fourth quantity beside it.
   *
   * Bare copper and insulated conductor are separate purchases — one cannot be
   * ordered as the other — but they are both wire, so this is a share rather
   * than an addition. A reader who adds it to `wireFeet` has double-counted,
   * which is why it is named for what it is a part OF.
   */
  wireGroundFeet: number;
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
   * Measured runs where NEITHER end's vertical has been answered for.
   *
   * The zero has to shout. An unset height makes a total quietly low and
   * nothing on screen says so, which is the failure § 2.3 describes for an
   * unset allowance. This count is what lets the panel say "23 runs are
   * counted flat only" instead of leaving it to be noticed.
   *
   * ── It used to mean `verticalFeet <= 0`, and that was wrong BOTH ways ─────
   * Corrected 2026-09-20, the same day and for the same reason as the run row
   * (`uncountedEnds`). Testing the FOOTAGE rather than the ENDS both
   * over-reported and under-reported, and the two mistakes hid each other:
   *
   *   - a run passing through two boxes AT RUN HEIGHT counts nothing, which is
   *     correct, and was reported as a problem. A warning that fires on
   *     correct work is how people learn to read past the warning;
   *   - a run with ONE end unanswered was not counted here at all, because its
   *     footage is not zero — it is half. On the real fixture that meant one
   *     warning where four runs were incomplete.
   */
  flatOnlyCount: number;
  /**
   * Measured runs carrying SOME vertical footage with an end still unanswered.
   *
   * Separate from `flatOnlyCount` because the sentence has to be different: a
   * flat run says "no drops are in this number", and this one says the number
   * you are reading is LOW BY AN UNKNOWN AMOUNT — which is the more alarming
   * of the two and the one that had no way of being said.
   */
  partialVerticalCount: number;
} {
  let conduit = 0;
  let cable = 0;
  let wire = 0;
  /*
    The bare copper, kept apart from the rest of the wire.

    Only conduit runs contribute: `wireFeetByCircuit` refuses a cable run, and
    that refusal is what stops a cable's ground being counted twice — it is
    inside the jacket and already paid for by `cableFeet`.
  */
  let wireGround = 0;
  let conduitVertical = 0;
  let cableVertical = 0;
  let wireVertical = 0;
  let unmeasurable = 0;
  let flatOnly = 0;
  let partialVertical = 0;

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
    /*
      The run's own figure, not a sum over its circuits. The shared ground does
      not belong to any circuit, so summing them would report zero bare copper
      on an ordinary run — which is every run, by default.
    */
    wireGround += quantities.groundFeet;

    /*
      ASK THE ENDS, NEVER THE FOOTAGE — and ask through the same function the
      run row asks through, so a total and the row above it cannot disagree
      about whether a run is finished. See `uncountedEnds`.
    */
    const unanswered = quantities.verticals
      ? uncountedEnds(quantities.verticals).length
      : 2;
    if (unanswered > 0) {
      if (quantities.verticalFeet > 0) partialVertical++;
      else flatOnly++;
    }

    // A flat run still contributes nothing to the vertical shares below.
    if (quantities.verticalFeet <= 0) continue;
    if (quantities.pathType === "conduit") {
      conduitVertical += quantities.verticalFeet;
      for (const circuit of quantities.wireByCircuit)
        wireVertical += circuit.verticalFeet;
      /*
        The shared ground's drops, which belong to no circuit and so appear in
        none of the rows above. It goes down the drop once, like the pipe
        around it. Left out, this line's figure is short by exactly the
        vertical bare copper — the quiet kind of wrong, since the flat footage
        beside it would still look right.
      */
      wireVertical += quantities.verticalFeet * quantities.grounds.sharedCount;
    } else {
      cableVertical += quantities.verticalFeet;
    }
  }

  return {
    conduitFeet: round2(conduit),
    cableFeet: round2(cable),
    wireFeet: round2(wire),
    wireGroundFeet: round2(wireGround),
    conduitVerticalFeet: round2(conduitVertical),
    cableVerticalFeet: round2(cableVertical),
    wireVerticalFeet: round2(wireVertical),
    unmeasurableCount: unmeasurable,
    flatOnlyCount: flatOnly,
    partialVerticalCount: partialVertical,
  };
}
