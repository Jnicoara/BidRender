/**
 * WHICH HOURS PRICE AN ASSEMBLY — the typed number, its work steps, or
 * nothing (references/step-based-labor-plan.md § 3).
 *
 * ── One function, because three places now hold hours ──────────────────────
 * An assembly's typed `baseLaborHours`, its parts' labor units, and now its
 * work steps. ASSEMBLIES_PLAN.md § "What must come with it" 2: ownership is
 * decided in ONE function, as a guard, not a rule in a comment. This is it.
 * Every reader that prices an assembly — the bid snapshot, the assembly's own
 * cost panel, a kit's — goes through `assemblyHoursSource`.
 *
 * ── The order (owner, 2026-10-09) ────────────────────────────────────────────
 *   1. TYPED hours win, always. The steps then sit beside them as a quiet
 *      cross-check, never a warning (ASSEMBLIES_PLAN § 3; plan Q3).
 *   2. Otherwise the STEP TOTAL, when every step is timed — tagged "Example
 *      hours" while any step still carries a shipped time.
 *   3. Otherwise NOT SET. A partial step total is never priced: one step with
 *      no time makes the whole total not set, the same as a NULL typed hour
 *      (starter-assemblies-plan D1) — a smaller number would understate every
 *      line it touches.
 *
 * The result is a union, so a caller cannot read `hours` without having seen
 * `source`. Not a convention: a type.
 */
import { assemblyHours } from "./assemblyHours";
import { componentLaborUnit, type LaborUnit } from "./materialLabor";

/** One line of an assembly's step list, as the server resolved it. */
export type StepLine =
  | {
      kind: "step";
      /** Minutes for ONE count; NULL = not set (0 is a real answer). */
      minutes: string | number | null;
      count: string | number;
      /** A shipped time the shop has not accepted. */
      isExample: boolean;
    }
  | {
      /**
       * The part step (owner, Q1): the recipe's cable, each line at its OWN
       * labor unit — the same number a traced run reads — times its qty.
       */
      kind: "cable";
      cableLines: readonly CableLine[];
    };

/** A foot-sold Wire & Cable line of the recipe, for the cable step. */
export type CableLine = {
  qty: string | number;
  overrideLaborHours: LaborUnit;
  laborHours: LaborUnit;
  /** The cable's per-foot hours are a shipped example. */
  isExample: boolean;
};

/** What an assembly's steps add up to — or why they do not. */
export type StepTotal = {
  /** Hours, or NULL when any step (or any cable unit) is not set. */
  hours: number | null;
  /** Steps listed, and how many of them have a time. */
  steps: number;
  timed: number;
  /** Any shipped time not yet accepted feeds the total. */
  anyExample: boolean;
};

/** Not a number, blank or negative: NOT SET. */
function minutesOf(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The step total. Summed in MINUTES and divided by 60 once (a minute is
 * 0.0166… h), plus the cable step in hours. No steps at all is `steps: 0`
 * with hours NULL — "nothing to say", never 0 h.
 */
export function stepTotalHours(lines: readonly StepLine[]): StepTotal {
  let minutes = 0;
  let cableHours = 0;
  let timed = 0;
  let anyExample = false;
  for (const line of lines) {
    if (line.kind === "step") {
      const m = minutesOf(line.minutes);
      if (m === null) continue;
      timed += 1;
      minutes += m * Number(line.count);
      if (line.isExample) anyExample = true;
      continue;
    }
    let cableSet = true;
    for (const cable of line.cableLines) {
      const unit = componentLaborUnit(cable);
      if (unit === null) {
        cableSet = false;
        break;
      }
      cableHours += unit * Number(cable.qty);
      if (cable.isExample) anyExample = true;
    }
    if (cableSet) timed += 1;
  }
  const steps = lines.length;
  const complete = steps > 0 && timed === steps;
  return {
    hours: complete ? round4(minutes / 60 + cableHours) : null,
    steps,
    timed,
    anyExample: complete && anyExample,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Which number prices the assembly, and the quiet line beside it. */
export type AssemblyHoursSource =
  | {
      source: "typed";
      hours: number;
      /** The typed value is a shipped example (`assemblies.isExampleHours`). */
      isExample: boolean;
      /** The steps, shown beside as a cross-check — never a warning. */
      steps: StepTotal;
    }
  | { source: "steps"; hours: number; isExample: boolean; steps: StepTotal }
  | { source: "notSet"; hours: null; isExample: false; steps: StepTotal };

/**
 * THE decision. `typedIsExample` is `assemblies.isExampleHours`, which also
 * covers a shipped overhead (the loader stamps it with the overhead, plan
 * § 14) — so a step-priced starter whose overhead is shipped is an example
 * even after its steps are accepted.
 */
export function assemblyHoursSource(input: {
  baseLaborHours: string | number | null | undefined;
  isExampleHours: boolean | null | undefined;
  steps: readonly StepLine[];
}): AssemblyHoursSource {
  const steps = stepTotalHours(input.steps);
  const typed = assemblyHours(input.baseLaborHours);
  if (typed !== null) {
    return {
      source: "typed",
      hours: typed,
      isExample: input.isExampleHours === true,
      steps,
    };
  }
  if (steps.hours !== null) {
    return {
      source: "steps",
      hours: steps.hours,
      isExample: steps.anyExample || input.isExampleHours === true,
      steps,
    };
  }
  return { source: "notSet", hours: null, isExample: false, steps };
}

/**
 * Owner Q2 + Q7, as code: a starter's typed hours may be CLEARED (so its
 * steps price) only when its step total is set AND step total + overhead is
 * at least its current hours — "a little high beats low" — until the owner
 * reviews it. A starter with no typed hours has nothing to clear.
 *
 * Track A's loader decides with this, never with a spreadsheet cell
 * (plan § 14), and a seed test holds the shipped list to it.
 */
export function starterHoursClearable(input: {
  currentHours: string | number | null | undefined;
  stepTotal: number | null;
  overheadHours: string | number | null | undefined;
}): { clear: boolean; why: string } {
  const current = assemblyHours(input.currentHours);
  if (current === null) return { clear: false, why: "no typed hours to clear" };
  if (input.stepTotal === null)
    return { clear: false, why: "step total not set" };
  const overhead = assemblyHours(input.overheadHours) ?? 0;
  const total = round4(input.stepTotal + overhead);
  if (total < current)
    return {
      clear: false,
      why: `steps ${input.stepTotal} h + overhead ${overhead} h = ${total} h is below the current ${current} h`,
    };
  return {
    clear: true,
    why: `steps ${input.stepTotal} h + overhead ${overhead} h = ${total} h ≥ ${current} h`,
  };
}

/**
 * A step's time for the screen: "4 min", or NULL for NOT SET — which the
 * caller must render as words ("not set"), never as "0 min". Returning NULL
 * rather than a string makes that a decision at the call site.
 */
export function minutesText(value: string | number | null): string | null {
  const m = minutesOf(value);
  if (m === null) return null;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
}

/**
 * The quiet line beside an assembly's hours (plan § 7, owner Q3/Q6). Grey
 * text, no icon, never a warning — the gap between a typed number and the
 * steps is information, not an error. NULL when the assembly has no steps.
 */
export function stepCrossCheckText(steps: StepTotal): string | null {
  if (steps.steps === 0) return null;
  if (steps.hours === null)
    return `Steps: ${steps.timed} of ${steps.steps} timed`;
  return `Steps add to ${round2(steps.hours)} h`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
