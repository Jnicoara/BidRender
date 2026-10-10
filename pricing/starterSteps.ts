/**
 * The starters' STEP lists as the app will price them — shared by the sheet
 * builder ("Step totals" tab) and the loader (which decides
 * STARTER_HOURS_CLEARED), so the two cannot compute a starter differently
 * (references/step-based-labor-plan.md § 14).
 *
 * The shapes are the app's own: `stepTotalHours` and `starterHoursClearable`
 * in shared/assemblyHoursSource.ts. The cable step reads the recipe's
 * foot-sold Wire & Cable lines at the material's labor unit (hours per FOOT,
 * as STARTER_LABOR_UNITS stores it) — the same filter server/db.ts uses.
 */
import { BASELINE_ASSEMBLIES } from "../server/seed/baselineAssemblies";
import { BASELINE_MATERIALS } from "../server/seed/materials";
import { starterPartName } from "../server/seed/starterParts";
import {
  STARTER_ASSEMBLY_STEPS,
  STARTER_LABOR_STEPS,
} from "../server/seed/starterLaborSteps";
import { STARTER_ASSEMBLY_HOURS } from "../server/seed/starterAssemblyHours";
import type { StepLine } from "../shared/assemblyHoursSource";

/** Hours per foot, by catalog name — STARTER_LABOR_UNITS' shape. */
export type LaborUnits = Readonly<
  Record<string, { laborHours?: string; fieldBendLaborHours?: string }>
>;

export type StarterWithSteps = {
  ref: string;
  name: string;
  category: string;
  /** What prices it today: a loaded sheet value, else the seed's own. */
  currentHours: number | null;
  /** Library steps (key, count), in order; the cable step is separate. */
  steps: { key: string; count: number }[];
  hasCableStep: boolean;
  /** The recipe's foot-sold cable: name and feet. */
  cable: { name: string; feet: number }[];
};

const material = new Map(BASELINE_MATERIALS.map(m => [m.name, m]));
const LIBRARY_KEYS = new Set(STARTER_LABOR_STEPS.map(s => s.key));

/** Every starter with a step list, in the starter list's order. */
export function startersWithSteps(): StarterWithSteps[] {
  const out: StarterWithSteps[] = [];
  for (const spec of BASELINE_ASSEMBLIES) {
    const lines = STARTER_ASSEMBLY_STEPS[spec.name];
    if (!lines) continue;
    const steps: { key: string; count: number }[] = [];
    let hasCableStep = false;
    for (const line of lines) {
      if ("cable" in line) {
        hasCableStep = true;
        continue;
      }
      if (!LIBRARY_KEYS.has(line.step))
        throw new Error(
          `${spec.ref}: step "${line.step}" is not in the library`
        );
      steps.push({ key: line.step, count: line.count });
    }
    const cable = spec.materials
      .map(l => ({ name: starterPartName(l.part), feet: l.qty }))
      .filter(c => {
        const m = material.get(c.name);
        return m?.unitOfSale === "foot" && m.category === "Wire & Cable";
      });
    const sheet = STARTER_ASSEMBLY_HOURS[spec.name];
    out.push({
      ref: spec.ref,
      name: spec.name,
      category: spec.category,
      currentHours:
        sheet !== undefined ? Number(sheet) : (spec.baseLaborHours ?? null),
      steps,
      hasCableStep,
      cable,
    });
  }
  const missing = Object.keys(STARTER_ASSEMBLY_STEPS).filter(
    name => !out.some(s => s.name === name)
  );
  if (missing.length)
    throw new Error(`step lists for no shipped starter: ${missing.join(", ")}`);
  return out;
}

/**
 * The cable step's hours: feet × hours per foot over the recipe's cable, or
 * NULL when any cable has no unit (NOT SET, never 0). No cable step, or a
 * cable step over no cable, is 0.
 */
export function cableHours(
  s: StarterWithSteps,
  units: LaborUnits
): number | null {
  // No cable STEP in the list: its cable is not part of the step total.
  if (!s.hasCableStep) return 0;
  let hours = 0;
  for (const c of s.cable) {
    const u = units[c.name]?.laborHours;
    if (u === undefined || u.trim() === "") return null;
    hours += Number(u) * c.feet;
  }
  return Math.round(hours * 10000) / 10000;
}

/** The app's StepLine list for one starter, fed the given minutes and units. */
export function stepLinesFor(
  s: StarterWithSteps,
  minutes: Readonly<Record<string, string>>,
  units: LaborUnits
): StepLine[] {
  const lines: StepLine[] = [];
  const spec = STARTER_ASSEMBLY_STEPS[s.name];
  for (const line of spec) {
    if ("cable" in line) {
      lines.push({
        kind: "cable",
        cableLines: s.cable.map(c => ({
          qty: c.feet,
          overrideLaborHours: null,
          laborHours: units[c.name]?.laborHours ?? null,
          isExample: true,
        })),
      });
      continue;
    }
    lines.push({
      kind: "step",
      minutes: minutes[line.step] ?? null,
      count: line.count,
      isExample: true,
    });
  }
  return lines;
}

/**
 * Suggested overhead (plan § 13b): the seven starters with typed hours get
 * the plan's figure (enough that step total + overhead ≥ current, on the
 * draft times); the rest 0.10 h for devices, demo and panels, 0.15 h for
 * fixtures and equipment — the owner's call either way.
 */
const SUGGESTED_13B: Readonly<Record<string, number>> = {
  DV1: 0.25,
  DV4: 0.15,
  DV2: 0.35,
  LT1: 0.05,
  DV5: 0.2,
  LT2: 0.35,
  DV3: 0.5,
};
export function suggestedOverhead(s: StarterWithSteps): number {
  if (s.ref in SUGGESTED_13B) return SUGGESTED_13B[s.ref];
  return /lighting|equipment/i.test(s.category) ? 0.15 : 0.1;
}
