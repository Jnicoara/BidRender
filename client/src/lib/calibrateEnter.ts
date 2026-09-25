/**
 * What Enter means while a scale is being measured or checked.
 *
 * ── The fault this replaces, 2026-09-25 ──────────────────────────────────────
 * "After dropping the second point, Enter sometimes does not confirm." Enter
 * was handled ONLY by the distance box's own onKeyDown, and only when its text
 * parsed. So it silently did nothing whenever:
 *
 *   - focus was anywhere but that box — after clicking the card's padding, the
 *     "?" in the bar, or with focus left on the scale chip, where Radix puts it
 *     back when the menu closes. On the chip it was worse than nothing: Enter
 *     CLICKED the chip and reopened the scale menu over the drawing;
 *   - the text did not parse — "1,000" was refused outright — with nothing on
 *     screen to say so, which reads exactly like a key that did not register.
 *
 * Now the layer answers Enter itself, from a window listener, wherever focus
 * is, and this function decides what it does. It lives here rather than in the
 * component because `vitest` can reach `client/src/lib` and cannot reach a
 * React component (CLAUDE.md § "a rule with no red to go to").
 */

export type CalibrateEnterInput = {
  phase: "set" | "check";
  /** How many of the two points are down. */
  pointCount: number;
  /** The distance typed into the card that is showing, as typed. */
  text: string;
  /** Whether that text parses into something the card can act on. */
  ready: boolean;
  busy: boolean;
  /**
   * Focus is on one of the layer's own BUTTONS (Use this scale, Redo, Keep,
   * Set it again, Cancel, ?). Enter there means that button, natively.
   */
  focusOnOwnButton: boolean;
  /** An IME is mid-composition; its Enter commits the composition. */
  composing: boolean;
};

export type CalibrateEnterAction =
  /** Leave the key alone. */
  | { kind: "pass" }
  /** Eat the key and do nothing — a save is already on its way. */
  | { kind: "swallow" }
  /** Set phase: save the measured scale. */
  | { kind: "apply" }
  /** Check phase: record the check and close. */
  | { kind: "keep" }
  /** Put focus in the box and say what it needs. */
  | { kind: "needText"; message: string };

export function calibrateEnter(
  input: CalibrateEnterInput
): CalibrateEnterAction {
  if (input.composing) return { kind: "pass" };
  // Before both ends are down there is nothing to confirm.
  if (input.pointCount < 2) return { kind: "pass" };
  if (input.focusOnOwnButton) return { kind: "pass" };
  // Swallowed rather than passed: passing would let it reach whatever else has
  // focus — the scale chip, most often — while the save is still in flight.
  if (input.busy) return { kind: "swallow" };
  if (input.ready) return { kind: input.phase === "set" ? "apply" : "keep" };
  const typed = input.text.trim();
  return {
    kind: "needText",
    message: typed
      ? `Can't read "${typed}" — try 60, 24'-6" or 246".`
      : input.phase === "set"
        ? "Type the real distance first — e.g. 60 or 24'-6\"."
        : "Type what it should be first — e.g. 60 or 24'-6\".",
  };
}
