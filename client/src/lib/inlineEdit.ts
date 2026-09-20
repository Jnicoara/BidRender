/**
 * The behaviour every inline-edited field in this app shares.
 *
 * Kept as pure functions rather than living inside a component, for two
 * reasons: the rules are the part worth testing (a DOM is incidental), and a
 * single source means a new field cannot accidentally implement three of the
 * four behaviours.
 *
 * The four, in the order a user meets them:
 *   1. Focus       — the existing value is selected, so typing replaces it.
 *   2. Enter/blur  — commit.
 *   3. Escape      — abandon the edit and snap back to the last saved value.
 *   4. After save  — a brief confirmation, because this app prices real work
 *                    and "did that number take?" must never be a guess.
 *
 * Rule 2 says Enter and blur are equivalent, and that equivalence is about the
 * END STATE, not just the write — see `planFieldKey` for what that means for a
 * field living inside a panel that has to be dismissed.
 *
 * See CLAUDE.md § Editing fields.
 */

/** What committing a draft should actually do. */
export type CommitOutcome =
  /** The draft is valid and different — persist `value`. */
  | { action: "save"; value: number }
  /** The draft is unusable; the field snaps back and nothing is persisted. */
  | { action: "revert"; reason: string }
  /** Valid but unchanged — no write, and no save confirmation either. */
  | { action: "none" };

export type NumericFieldRules = {
  min?: number;
  max?: number;
  /** Treat blank as a real value (0)? Defaults to false — blank reverts. */
  allowEmpty?: boolean;
  /** Tolerance for "unchanged". Money is compared at 4dp, matching the columns. */
  epsilon?: number;
};

/** How a stored number is rendered into the input when editing starts. */
export function formatForEdit(value: number): string {
  if (!Number.isFinite(value)) return "";
  // String(Number) drops trailing zeros, so 0.6000 edits as "0.6" — which is
  // what someone expects to see, and re-parses identically.
  return String(value);
}

/**
 * Decide what Enter or blur means for a numeric field.
 *
 * Invalid input REVERTS rather than erroring. An inline field has nowhere to
 * put an error message, and silently keeping a bad draft on screen is how a
 * user ends up believing they saved something they did not.
 */
export function commitNumericEdit(
  draft: string,
  savedValue: number,
  rules: NumericFieldRules = {}
): CommitOutcome {
  const { min, max, allowEmpty = false, epsilon = 1e-9 } = rules;
  const trimmed = draft.trim();

  if (trimmed === "") {
    if (!allowEmpty) return { action: "revert", reason: "empty" };
    return nearlyEqual(0, savedValue, epsilon)
      ? { action: "none" }
      : { action: "save", value: 0 };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed))
    return { action: "revert", reason: "not a number" };
  if (min !== undefined && parsed < min)
    return { action: "revert", reason: `below ${min}` };
  if (max !== undefined && parsed > max)
    return { action: "revert", reason: `above ${max}` };

  // No write when nothing moved: a pointless round trip, and a confirmation
  // flash for a save that did not happen would be a lie.
  if (nearlyEqual(parsed, savedValue, epsilon)) return { action: "none" };

  return { action: "save", value: parsed };
}

/**
 * What an unset value looks like. The call site names the convention.
 *
 * Two of them, and both are deliberate:
 *
 *   "zero"       MONEY. Unset renders as 0 and shouts — an unpriced material
 *                is the one showing $0, and a blank would read as "not
 *                applicable".
 *   placeholder  MEASUREMENT. Unset must never render as 0, because zero is a
 *                legitimate answer and would read as a considered one.
 */
export type UnsetMode = "zero" | { placeholder: string };

/** `commitNumericEdit`, plus the one outcome a nullable field adds. */
export type NullableCommitOutcome =
  | CommitOutcome
  | { action: "clear"; reason: string };

/**
 * Decide what Enter or blur means for a field whose value may be UNSET.
 *
 * ── The one rule this exists to enforce ──────────────────────────────────────
 * **An emptied box in placeholder mode is never a zero.** `allowEmpty` makes a
 * blank commit as 0, which is correct for money and a lie for a measurement —
 * and the lie has shipped twice: `0 ft 0 in` under a caption reading "not set",
 * and an unset conductor count rendering as 0 in the field that decides how
 * much wire gets bought.
 *
 * It lives here rather than in the component because a component cannot be
 * tested in this repo — `vitest.config.ts` covers server, `client/src/lib` and
 * scripts. Putting the DECISION in a pure function is what gives the rule a red
 * to go to, which is the whole difference between a rule and a guard.
 */
export function commitNullableEdit(
  draft: string,
  savedValue: number | null,
  mode: UnsetMode,
  rules: NumericFieldRules = {}
): NullableCommitOutcome {
  const trimmed = draft.trim();

  // Money: a blank IS a zero here, and the call site said so.
  if (mode === "zero") return commitNumericEdit(draft, savedValue ?? 0, rules);

  if (trimmed === "") {
    // Already unset — emptying an empty box writes nothing and flashes nothing.
    if (savedValue === null) return { action: "none" };
    return { action: "clear", reason: "emptied" };
  }

  /*
    Compared against NaN when nothing is stored, and that is not a trick.

    A field showing its placeholder and then typed with "0" HAS moved: it went
    from "nobody said" to "somebody said zero", and those are different facts.
    Comparing against a stand-in 0 would call that no change and write nothing
    — the same conflation this function exists to stop, one level up. NaN
    equals nothing, so every valid entry counts as a change, and an invalid one
    still reverts.
  */
  return commitNumericEdit(draft, savedValue ?? Number.NaN, rules);
}

/**
 * What Escape does: the text the field should show, discarding the draft.
 *
 * Deliberately derives from the saved VALUE rather than remembering the text
 * the user started from — after a save the saved value has moved, and Escape
 * must return to what is actually stored, not to a stale starting point.
 */
export function revertToSaved(savedValue: number): string {
  return formatForEdit(savedValue);
}

function nearlyEqual(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Where the field sits, which is what decides whether committing ENDS the
 * interaction or merely saves within it.
 *
 *   "inline" — a row, table cell or form that stays put. Enter commits and
 *              keeps focus, so a column of figures can be typed straight down.
 *   "panel"  — a popover, dropdown or flyout the user would otherwise have to
 *              dismiss by hand.
 */
export type FieldSurface = "inline" | "panel";

/** What a keystroke should do. `pass` means the field does not handle it. */
export type KeyPlan =
  | { action: "commit"; keepFocus: boolean; dismiss: boolean }
  | { action: "abandon"; dismiss: boolean }
  | { action: "pass" };

/**
 * What Enter and Escape mean, given where the field lives.
 *
 * The reason this is not simply "Enter commits": rule 2 makes Enter and
 * clicking away equivalent, and equivalent means the same END STATE. Clicking
 * away from a panel closes it. So on a panel, an Enter that saves but leaves
 * the panel sitting there has done only half of what clicking away does, and
 * the user still has to dismiss it by hand — which is the exact friction the
 * rule exists to remove. Enter must therefore carry the dismiss too.
 *
 * Escape follows the same reasoning from the other end. Rule 3 is that Escape
 * abandons the edit; on a panel, abandoning includes leaving, or the user is
 * left staring at a panel they have already finished with.
 *
 * A panel with several fields dismisses on its LAST field only. Closing after
 * the first of two would strand the user outside a panel they had not finished
 * filling in, so earlier fields stay "inline" and commit in place.
 */
export function planFieldKey(key: string, surface: FieldSurface): KeyPlan {
  if (key === "Enter") {
    return surface === "panel"
      ? { action: "commit", keepFocus: false, dismiss: true }
      : { action: "commit", keepFocus: true, dismiss: false };
  }
  if (key === "Escape") {
    return { action: "abandon", dismiss: surface === "panel" };
  }
  return { action: "pass" };
}

/**
 * Percentages are stored as fractions (0.2) and edited as percents (20).
 * Converting at the edges keeps the rest of this module unit-agnostic.
 */
export const asPercent = (fraction: number): number => fraction * 100;
export const fromPercent = (percent: number): number => percent / 100;
