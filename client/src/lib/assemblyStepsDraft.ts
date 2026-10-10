/**
 * An assembly's WORK STEPS as the editor holds them, turned into what
 * `assemblyHoursSource` reads — so the screen's quiet line says exactly what
 * the server will price (references/step-based-labor-plan.md § 3, § 7).
 *
 * Here, not in the component, because the suite can reach client/src/lib and
 * not a React component: the rule that one untimed step leaves the total NOT
 * SET has a test that goes red, not just a sentence.
 */
import {
  assemblyHoursSource,
  stepCrossCheckText,
  type AssemblyHoursSource,
  type StepLine,
} from "@shared/assemblyHoursSource";

/** A step-list line in the draft — what the editor saves. */
export type DraftStep =
  | { kind: "step"; laborStepId: number; count: number }
  | { kind: "cable" };

/** A library step as `laborSteps.list` returns it. */
export type LibraryStep = {
  id: number;
  baselineId: number | null;
  name: string;
  unit: string;
  minutes: string | null;
  reasoning: string | null;
  isExample: boolean;
  usedBy: number;
};

/** A recipe line as the editor holds it — what the cable step reads. */
export type DraftRecipeLine = {
  qty: number;
  unitOfSale: string;
  category: string | null;
  laborHours: string | null;
  overrideLaborHours: string | null;
};

/**
 * The library row a stored step id MEANS for this company: the row itself,
 * or the company's fork of that shipped step.
 */
export function resolveLibraryStep(
  library: readonly LibraryStep[],
  storedId: number
): LibraryStep | undefined {
  return (
    library.find(step => step.id === storedId) ??
    library.find(step => step.baselineId === storedId)
  );
}

/**
 * The draft as `StepLine`s. A step the library no longer has reads as NOT
 * SET — never dropped, which would quietly make the total smaller.
 */
export function draftStepLines(
  steps: readonly DraftStep[],
  library: readonly LibraryStep[],
  recipe: readonly DraftRecipeLine[]
): StepLine[] {
  return steps.map((line): StepLine => {
    if (line.kind === "cable")
      return {
        kind: "cable",
        cableLines: recipe
          .filter(r => r.unitOfSale === "foot" && r.category === "Wire & Cable")
          .map(r => ({
            qty: r.qty,
            laborHours: r.laborHours,
            overrideLaborHours: r.overrideLaborHours,
            // The shop's own recipe screen does not carry the cable's example
            // flag; the server's answer (which does) is what the bid freezes.
            isExample: false,
          })),
      };
    const step = resolveLibraryStep(library, line.laborStepId);
    return {
      kind: "step",
      minutes: step?.minutes ?? null,
      count: line.count,
      isExample: step?.isExample === true,
    };
  });
}

/** What the editor shows beside the hours box, from the draft as it stands. */
export function draftHoursSource(input: {
  typedHours: string;
  steps: readonly DraftStep[];
  library: readonly LibraryStep[];
  recipe: readonly DraftRecipeLine[];
}): { source: AssemblyHoursSource; crossCheck: string | null } {
  const source = assemblyHoursSource({
    baseLaborHours: input.typedHours,
    isExampleHours: null,
    steps: draftStepLines(input.steps, input.library, input.recipe),
  });
  return { source, crossCheck: stepCrossCheckText(source.steps) };
}
