/**
 * Turning an assembly's stored `modifierIds` into the modifiers it means.
 *
 * ── The bug, and why nobody could have reported it ───────────────────────────
 * An assembly stores the ids of the job-condition modifiers switched on for it.
 * Editing a SHIPPED modifier forks it — new row, new id — and the baseline is
 * then hidden from the user's library. The stored id matches nothing, so
 * `allModifiers.filter(m => ids.includes(m.id))` came back EMPTY and the
 * adjustment silently stopped applying.
 *
 * **Editing a modifier to the SAME VALUE kills it.** Open "Working at height",
 * save it at the 12% it already said, and every assembly carrying it quietly
 * loses 12% of its labor. There is nothing about that edit for anyone to
 * notice — no error, no change on the screen being edited, and the assembly
 * that moved is somewhere else entirely.
 *
 * Measured on 2026-09-20, `Ceiling fan standard` with "Working at height":
 *
 *   unforked    modifierPct 0.12   hoursAfterModifiers 1.68   applied [1]
 *   after fork  modifierPct 0      hoursAfterModifiers 1.50   applied []
 *
 * Found by auditing the fork seams after the same bug turned up in materials —
 * not by anybody hitting it, which is the only way it was ever going to be
 * found.
 *
 * ── Modifiers ADD, so a missing one is invisible in the total ────────────────
 * Job-condition modifiers sum rather than compounding, and they are usually a
 * modest percentage. A bid that has quietly lost one is not obviously wrong; it
 * is a few percent light, on labor, which is the half of an estimate nobody
 * re-derives by hand. That is why `missing` is carried out of here rather than
 * dropped — see `resolveForkedRows`.
 */
import {
  resolveForkedRow,
  resolveForkedRows,
  type ForkableRow,
} from "./forkedRows";

/** The subset of a modifier row needed to follow a fork. */
export type ResolvableModifier = ForkableRow;

/**
 * The modifier an assembly means by one stored id, following a fork.
 *
 * The list must already be merged — see `resolveForkedRow`, which explains why
 * a raw list holding both a baseline and its fork resolves to the wrong one.
 */
export function resolveModifier<T extends ResolvableModifier>(
  modifiers: readonly T[],
  modifierId: number | null | undefined
): T | undefined {
  return resolveForkedRow(modifiers, modifierId);
}

/**
 * Every modifier an assembly has switched on, in the order the LIBRARY lists
 * them, with any that no longer resolve reported rather than dropped.
 *
 * ── Replaces `all.filter(m => ids.includes(m.id))` everywhere ────────────────
 * That idiom reads naturally and is wrong for exactly one reason: it asks the
 * library which of its rows the assembly named, when the question is which row
 * each stored id now means. Those are the same thing right up until somebody
 * edits a shipped modifier.
 *
 * ── Order comes from the passed list, not from the stored ids ────────────────
 * Modifiers ADD, so order cannot change the arithmetic — but it changes what
 * the breakdown reads like, and a line whose reasons reshuffle between two
 * viewings looks untrustworthy. Taking it from the library list means every
 * screen shows them the same way round.
 */
export function appliedModifiers<T extends ResolvableModifier>(
  modifiers: readonly T[],
  modifierIds: readonly number[]
): { applied: T[]; missing: number[] } {
  const { resolved, missing } = resolveForkedRows(modifiers, modifierIds);
  const wanted = new Set(resolved.map(row => row.id));
  return {
    applied: modifiers.filter(row => wanted.has(row.id)),
    missing,
  };
}
