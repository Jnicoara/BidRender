/**
 * A NEW assembly's hours start NOT SET, and the suggestion is only an offer.
 *
 * ── The decision (owner, 2026-10-06) ─────────────────────────────────────────
 * A company's new assembly opens with the hours box EMPTY — "not set" (D1) —
 * not pre-filled from shared/laborHourDefaults.ts. The suggested figure is
 * shown in grey beside the box with a "Use suggested" button; it becomes the
 * assembly's hours only when the user clicks that or types a number. Until
 * then nothing about it is saved.
 *
 * This replaces the editor's old behaviour, which wrote the suggestion INTO
 * the box (and re-wrote it on every name change until the box was touched),
 * so saving without looking stored a figure nobody chose — the plausible
 * number CLAUDE.md § "Starter content ships unpriced" exists to prevent.
 *
 * Pure and in `client/src/lib` so the suite can hold the rule: the editor is
 * a component, which vitest cannot reach.
 */
import { assemblyHours } from "@shared/assemblyHours";
import {
  defaultLaborHoursFor,
  type LaborHourDefault,
} from "@shared/laborHourDefaults";

/** What a new assembly's hours box holds when the editor opens: nothing. */
export function newAssemblyHoursDraft(): string {
  return "";
}

export type HoursOffer = {
  /** The suggested figure, for the grey text. */
  suggestion: LaborHourDefault;
  /** Whether "Use suggested" would change the box — hidden when it would not. */
  canUse: boolean;
};

/** The grey offer beside the hours box. */
export function hoursOffer(name: string, draftHours: string): HoursOffer {
  const suggestion = defaultLaborHoursFor(name);
  const typed = assemblyHours(draftHours);
  return {
    suggestion,
    canUse: typed === null || Math.abs(typed - suggestion.hours) > 1e-9,
  };
}

/** The box after "Use suggested" is clicked. */
export function suggestedHoursDraft(offer: HoursOffer): string {
  return String(offer.suggestion.hours);
}

/**
 * What gets SAVED: the box as typed, blank = NOT SET (NULL). Never the
 * suggestion — that only reaches here through `suggestedHoursDraft`, by a
 * click.
 */
export function hoursToSave(draftHours: string): number | null {
  return assemblyHours(draftHours);
}
