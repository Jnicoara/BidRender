/**
 * A FOOT OF WIRE BELONGS TO EITHER THE ASSEMBLY OR THE RUN, NEVER BOTH.
 *
 * ── The decision this implements ─────────────────────────────────────────────
 * D18 in `references/takeoff-spec.md`, approved 2026-09-20, with the mechanism
 * in § 5f.3 of `references/plan-viewer-overhaul.md`. The wire is split the way
 * the trade already splits it:
 *
 *   - **DEVICES carry the branch wiring between each other.** A troffer
 *     includes an average whip of MC to the next fixture; a receptacle includes
 *     the cable to the next receptacle. That is what makes dropping devices
 *     fast, and it is why an assembly ships with wire inside it.
 *   - **TRACED RUNS are homeruns only** — first device on the circuit back to
 *     the panel.
 *
 * ── Why an ownership rule rather than a duplicate detector ───────────────────
 * The problem R3 flagged is real and measured: eight of eight starter device
 * assemblies carry 20–40 ft of cable, so stamping forty receptacles puts 1,000
 * ft of NM-B on a bid before anything is traced. Detecting that overlap
 * afterwards means comparing an assembly's contents against traced footage and
 * deciding which to believe — a reconciliation that is wrong whenever the two
 * disagree for a good reason.
 *
 * Splitting ownership instead means the overlap **cannot occur**. Each foot has
 * exactly one owner before anything is added up.
 *
 * ── Why ONE function, and why it takes BOTH sides ────────────────────────────
 * The obvious shape is a rule in the device total and another in the run total.
 * `totalVerticalFeet` in `shared/takeoffHeights.ts` already refused that shape
 * for the same reason, in its own words: a rule enforced in two places survives
 * until somebody edits one of them. So both sides arrive here and this function
 * decides what each one owns BEFORE it sums anything. A caller cannot add a
 * retired whip because there is no path on which one is returned.
 *
 * ── What is NOT here ─────────────────────────────────────────────────────────
 * Labour. **The whip is material only**, because the assembly's typed hours
 * already cover pulling it — that is what "0.45 h for a duplex rough-in" means,
 * the whole operation at once. Adding whip hours would be the parts-sum error
 * the assembly cross-check exists to refuse (`shared/materialLabor.ts`).
 */

import { DISTRIBUTION_KIND } from "./takeoffHeights";
import { kindAtEnd } from "./runNetwork";

/** Feet of whip, as the column stores it or as tRPC hands it over. */
export type WhipFeet = string | number | null | undefined;

/**
 * The height-type key that means "the panel", and the reason a run ending
 * there is a homerun rather than branch wiring.
 *
 * It is a shipped height type (`SHIPPED_HEIGHT_TYPES`) like a receptacle or a
 * switch, so "is this end a device?" cannot be answered by asking whether the
 * key is in the heights list — the panel is in it too. This is the one key that
 * settles a run's ownership on its own.
 */
export const PANEL_KIND = "panel";

/**
 * The whip as a number, or NULL when nobody has said.
 *
 * A non-numeric or negative value comes back NULL rather than being clamped, so
 * a broken row lands in the same worklist as an unanswered one instead of
 * passing silently as "no whip" — which would understate a bid without saying
 * so. Same treatment `laborUnitHours` gives a broken labour unit.
 */
export function whipFeetOf(value: WhipFeet): number | null {
  if (value == null) return null;
  const feet = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(feet) || feet < 0) return null;
  return feet;
}

/**
 * True when this assembly still needs the estimator's own whip length.
 *
 * **A whip of 0 is answered, not missing** — a commercial fixture that carries
 * no branch wire because every run is traced is a real and common answer, and
 * it must go quiet. That is the whole reason the column is nullable rather than
 * defaulting to zero, and it is the same distinction `needsLaborUnit` draws.
 */
export function needsWhip(value: WhipFeet): boolean {
  return whipFeetOf(value) === null;
}

// ── Which side owns a traced run ─────────────────────────────────────────────
/**
 * What a traced run's wire belongs to.
 *
 * `homerun`     — counts. The panel is at one end, so nothing else claims it.
 * `branch`      — excluded. The estimator said the devices already carry it.
 * `unanswered`  — devices at both ends and nobody has said which it is.
 */
export type RunWireOwnership = "homerun" | "branch" | "unanswered";

/**
 * Whose wire a traced run is, from its ends and the estimator's own answer.
 *
 * ── The recorded answer wins, always ─────────────────────────────────────────
 * `branchWiring` is what somebody said when the guard asked, and it is
 * consulted first. Re-deriving it from the ends would un-answer a settled
 * question the next time an end kind changed — the mistake `shouldSuggestStampLink`
 * names when it refuses to re-ask about a stamp that is already claimed.
 *
 * ── A PANEL at either end settles it with no question ────────────────────────
 * That is the definition of a homerun, so the guard must never fire on one. A
 * warning on correct work is as bad as silence, and these are the majority of
 * traced runs.
 *
 * ── An unanswered end is NOT device-to-device ────────────────────────────────
 * Null means nobody has said what is there, which is a different situation from
 * knowing it is a receptacle. Treating unknown as a device would fire the guard
 * across every half-finished run on the sheet. So both ends must be POSITIVELY
 * known non-panel kinds before this is ambiguous at all.
 *
 * A junction box does count as a device here, deliberately: in the field a
 * J-box is often mid-branch, which is exactly the case worth asking about.
 */
export function runWireOwnership(run: {
  startKind: string | null | undefined;
  endKind: string | null | undefined;
  /**
   * The tee each end sits on (D20). Required: a tee end is never a device
   * end, and a caller that could omit these would ask the branch question
   * about a leg whose "device" is the split. See `kindAtEnd`.
   */
  startTeeId: number | null | undefined;
  endTeeId: number | null | undefined;
  /** What the estimator answered when asked. NULL = never asked or skipped. */
  branchWiring?: boolean | null;
}): RunWireOwnership {
  if (run.branchWiring === true) return "branch";
  if (run.branchWiring === false) return "homerun";
  const start = kindAtEnd(run.startKind, run.startTeeId);
  const end = kindAtEnd(run.endKind, run.endTeeId);
  if (isPanel(start) || isPanel(end)) return "homerun";
  if (isDevice(start) && isDevice(end)) return "unanswered";
  return "homerun";
}

function isPanel(kind: string | null | undefined): boolean {
  return kind?.trim() === PANEL_KIND;
}

/**
 * A positively-known end that is not the panel and is not "carries on at run
 * height". Anything unanswered is not a device for this purpose — see above.
 */
function isDevice(kind: string | null | undefined): boolean {
  const key = kind?.trim();
  if (!key) return false;
  return key !== PANEL_KIND && key !== DISTRIBUTION_KIND;
}

/** Should the app ask whose wire this run is? Sugar, so a screen reads right. */
export function shouldAskAboutBranchWiring(run: {
  startKind: string | null | undefined;
  endKind: string | null | undefined;
  startTeeId: number | null | undefined;
  endTeeId: number | null | undefined;
  branchWiring?: boolean | null;
}): boolean {
  return runWireOwnership(run) === "unanswered";
}

// ── The totals ───────────────────────────────────────────────────────────────
/** One placed device, as the wire split needs it. */
export type WhippedDevice = {
  /** How many of this device are placed. */
  count: number;
  /** The assembly's own whip, per device. NULL means nobody has said. */
  whipFeet: WhipFeet;
  /**
   * Set when a ROUTED run already counts this device's branch wire.
   *
   * The retirement path, and the reason it is per device rather than per
   * assembly: routing one circuit of six troffers must not zero the whip for
   * the other forty on the job. Claimed, never inferred — the same
   * construction as `endStampId` claiming a vertical.
   */
  routedByRunId?: number | null;
};

/** One traced run's wire, and whose it is. */
export type TracedRunWire = {
  /** Wire feet this run contributes if it is counted at all. */
  wireFeet: number;
  ownership: RunWireOwnership;
};

export type BranchWireTotals = {
  /** Whips owned by the devices, after the job adjustment. */
  deviceFeet: number;
  /** Traced wire owned by the runs. Never adjusted — it is measured. */
  runFeet: number;
  /** Both. The number that goes on a bid. */
  totalFeet: number;
  /** Devices whose assembly has no whip set. `deviceFeet` is short by these. */
  unsetWhipCount: number;
  /** Devices whose whip a routed run has taken over. */
  retiredWhipCount: number;
  /** Runs the estimator said are branch wiring, so excluded here. */
  excludedRunCount: number;
  /**
   * Runs with devices at both ends that nobody has answered for.
   *
   * **These ARE counted**, and the caveat travels instead. A traced run is
   * measured work somebody drew across a drawing; dropping it because a
   * question is open would silently lose footage, which is the failure mode
   * that looks like a competitive bid. Counting it risks the double count the
   * guard exists to catch — so the number is included and the screen says how
   * many are unanswered, exactly as `flatOnlyCount` does for verticals.
   */
  unansweredRunCount: number;
};

/**
 * The whole wire picture, with ownership decided before anything is added.
 *
 * `adjustPct` is the per-BID dial for a building laid out tighter or looser: a
 * signed fraction, 0.10 for +10%. It touches the whips ONLY. Traced footage is
 * measured and § 5a forbids the app quietly padding it — so a caller cannot
 * apply this to `runFeet` even by mistake, because this function is the only
 * thing that applies it at all.
 *
 * It is applied as its own multiplication and written nowhere, the same way
 * `productivityPct` is, so setting it back to 0 returns every number exactly
 * where it was.
 */
export function totalBranchWireFeet(input: {
  devices: readonly WhippedDevice[];
  runs: readonly TracedRunWire[];
  /** Signed fraction. 0 or omitted means no adjustment. */
  adjustPct?: number | null;
}): BranchWireTotals {
  let whips = 0;
  let unsetWhipCount = 0;
  let retiredWhipCount = 0;

  for (const device of input.devices) {
    const count = countOf(device.count);
    if (count === 0) continue;

    /*
      RETIRED BEFORE MEASURED. A device whose branch wire a routed run has
      already counted owns none of it, so its whip never reaches the sum — and
      it is not reported as unset either, because nothing is missing about it.
    */
    if ((device.routedByRunId ?? null) !== null) {
      retiredWhipCount += count;
      continue;
    }

    const feet = whipFeetOf(device.whipFeet);
    if (feet === null) {
      unsetWhipCount += count;
      continue;
    }
    whips += feet * count;
  }

  let runFeet = 0;
  let excludedRunCount = 0;
  let unansweredRunCount = 0;

  for (const run of input.runs) {
    if (run.ownership === "branch") {
      excludedRunCount++;
      continue;
    }
    if (run.ownership === "unanswered") unansweredRunCount++;
    const feet = Number(run.wireFeet);
    if (Number.isFinite(feet) && feet > 0) runFeet += feet;
  }

  const deviceFeet = round2(applyAdjust(whips, input.adjustPct));
  const runTotal = round2(runFeet);
  return {
    deviceFeet,
    runFeet: runTotal,
    totalFeet: round2(deviceFeet + runTotal),
    unsetWhipCount,
    retiredWhipCount,
    excludedRunCount,
    unansweredRunCount,
  };
}

/**
 * The job adjustment, floored at zero feet.
 *
 * A dial below -100% would produce NEGATIVE footage, which is not a tighter
 * building — it is a number that would quietly subtract wire somebody else
 * counted. The floor is on the RESULT rather than on the input so there is one
 * place it can happen.
 */
function applyAdjust(
  feet: number,
  adjustPct: number | null | undefined
): number {
  const pct =
    typeof adjustPct === "number" && Number.isFinite(adjustPct) ? adjustPct : 0;
  return Math.max(0, feet * (1 + pct));
}

function countOf(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
