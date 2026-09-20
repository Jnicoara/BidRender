/**
 * InlineNumberField — the one numeric field that saves as you go.
 *
 * Implements all five editing rules from CLAUDE.md § Editing fields so a screen
 * cannot pick up four of them and miss the fifth:
 *
 *   • select-on-focus  — typing replaces the value; no manual clearing
 *   • Enter / blur     — commit
 *   • Escape           — abandon the edit, snap back to the saved value
 *   • save flash       — a brief tick confirming the write landed
 *   • panel dismiss    — in a popover, Enter and Escape also close it, so
 *                        neither leaves the user to click away by hand
 *                        (pass `onDismiss`)
 *
 * The decision logic is in @/lib/inlineEdit and is tested there; this file is
 * the wiring. Use it for any field that persists on its own. Fields inside an
 * explicit Save/Cancel form are a different pattern — those want
 * `selectOnFocus` alone (see @/lib/selectOnFocus).
 *
 * ── A value that may be UNSET, and the two conventions ───────────────────────
 * Added 2026-09-20, after an unset conductor count shipped rendering as `0` —
 * in the field that decides how much wire gets bought, and for the second time
 * in this app after `0 ft 0 in` under a caption reading "not set".
 *
 * The cause is upstream of either field: `value` was `number`, so every caller
 * with a nullable column had to write `?? something`, and `?? 0` is the
 * shortest thing to write. Four call sites did. Three were safe only because a
 * sibling field made null unreachable — a claim about code elsewhere, which is
 * the class CLAUDE.md now has a rule about.
 *
 * **There is no single right answer, because this app has two opposite
 * conventions and both are deliberate:**
 *
 *   MONEY        unset renders as 0 and SHOUTS. An unpriced material is the one
 *                showing $0 and the Materials screen filters to exactly those;
 *                a blank would read as "not applicable".
 *   MEASUREMENT  unset must NEVER render as 0, because zero is a legitimate
 *                answer — a floor box really is at 0'-0" — so a zero reads as a
 *                considered one.
 *
 * So the fix is not to pick one. It is to make the choice impossible to skip:
 * pass a nullable `value` and the type system requires `whenUnset`, which names
 * the convention at the call site where a reader can see it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  commitNullableEdit,
  commitNumericEdit,
  formatForEdit,
  planFieldKey,
  revertToSaved,
  type NumericFieldRules,
  type UnsetMode,
} from "@/lib/inlineEdit";

/** How long the confirmation tick stays up. Long enough to notice, short
 *  enough not to linger while tabbing down a column of figures. */
const FLASH_MS = 1100;

type BaseProps = {
  /** Called only when the draft is valid AND different. */
  onSave: (next: number) => void;
  rules?: NumericFieldRules;
  className?: string;
  ariaLabel: string;
  /** Static text after the field, e.g. "%" or "h". */
  suffix?: string;
  disabled?: boolean;
  /**
   * Close the panel this field sits in. Supplying it makes the field a "panel"
   * field: Enter commits AND closes, Escape reverts AND closes, so neither
   * leaves the user to dismiss the panel by hand (CLAUDE.md § Editing fields,
   * rule 5). Omit it for a field in a row or form that stays put.
   *
   * On a panel with several fields, pass this to the LAST one only.
   */
  onDismiss?: () => void;
  /**
   * Put the field back to unset. Only reachable in `placeholder` mode, where
   * emptying the box means "I have not said" rather than "zero".
   *
   * Without it, emptying a nullable field reverts to whatever was there — which
   * is right when there is no way to express unset, and wrong when there is.
   */
  onClear?: () => void;
};

/*
  The union is the forcing function, and it is worth understanding.

  A caller passing a plain `number` matches the first member and never sees
  `whenUnset`. A caller passing `number | null` cannot match it — null is not
  assignable to number — so it falls to the second, where `whenUnset` is
  REQUIRED. Nothing existing breaks, and nothing new can quietly choose zero.
*/
type Props =
  | (BaseProps & {
      /** The saved value. Escape and invalid input both snap back to this. */
      value: number;
      whenUnset?: undefined;
    })
  | (BaseProps & {
      /** Null is "nobody has said". What that LOOKS like is `whenUnset`. */
      value: number | null;
      whenUnset: UnsetMode;
    });

export function InlineNumberField({
  value,
  onSave,
  rules,
  className,
  ariaLabel,
  suffix,
  disabled,
  onDismiss,
  onClear,
  whenUnset,
}: Props) {
  /*
    Blank when unset, and only in placeholder mode.

    In "zero" mode a null is rendered as 0 on purpose — that IS the money
    convention, and the call site said so. Everywhere below reads `shown`
    rather than `value`, so there is one place that knows what an unset value
    looks like.
  */
  const blankWhenUnset = value === null && whenUnset !== "zero";
  const shown = value ?? 0;

  const [draft, setDraft] = useState(() =>
    blankWhenUnset ? "" : formatForEdit(shown)
  );
  const [flash, setFlash] = useState(false);
  const editing = useRef(false);
  const flashTimer = useRef<number | null>(null);
  // Set when a keystroke has already settled the field, so the blur that
  // follows a closing panel does not commit the same draft a second time and
  // fire a duplicate write. Any further typing clears it — see onChange.
  const settledByKey = useRef(false);

  // Follow the saved value when it changes underneath us — a refetch, an
  // optimistic rollback — but never while the user is mid-edit, which would
  // yank the text out from under them.
  useEffect(() => {
    if (editing.current) return;
    setDraft(blankWhenUnset ? "" : formatForEdit(shown));
  }, [shown, blankWhenUnset]);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    []
  );

  const showFlash = useCallback(() => {
    setFlash(true);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), FLASH_MS);
  }, []);

  const commit = useCallback(() => {
    /*
      The DECISION is in @/lib/inlineEdit, which the suite can reach; this is
      the wiring, which it cannot. `commitNullableEdit` is what guarantees an
      emptied box in placeholder mode never becomes a zero — the trapdoor this
      change exists to close, and the one that has now shipped twice.
    */
    const outcome =
      whenUnset === undefined
        ? commitNumericEdit(draft, shown, rules)
        : commitNullableEdit(draft, value, whenUnset, rules);

    if (outcome.action === "save") {
      onSave(outcome.value);
      setDraft(formatForEdit(outcome.value));
      showFlash();
      return;
    }
    if (outcome.action === "clear") {
      // Nothing to clear TO if the caller cannot express unset, so the field
      // goes back to what is stored rather than writing a number nobody typed.
      if (onClear) {
        onClear();
        showFlash();
        setDraft("");
        return;
      }
      setDraft(blankWhenUnset ? "" : revertToSaved(shown));
      return;
    }
    // Both "revert" and "none" put the field back in step with what is stored.
    // Neither flashes: nothing was written, and a tick would claim otherwise.
    setDraft(blankWhenUnset ? "" : revertToSaved(shown));
  }, [
    draft,
    shown,
    blankWhenUnset,
    whenUnset,
    value,
    onClear,
    rules,
    onSave,
    showFlash,
  ]);

  return (
    <span className="inline-flex items-center">
      <Input
        value={draft}
        disabled={disabled}
        onChange={e => {
          settledByKey.current = false;
          setDraft(e.target.value);
        }}
        onFocus={e => {
          editing.current = true;
          // Select the lot so the first keystroke replaces it.
          e.target.select();
        }}
        onBlur={() => {
          editing.current = false;
          if (settledByKey.current) return;
          commit();
        }}
        onKeyDown={e => {
          const plan = planFieldKey(e.key, onDismiss ? "panel" : "inline");
          if (plan.action === "pass") return;

          e.preventDefault();
          const input = e.target as HTMLInputElement;

          if (plan.action === "commit") {
            commit();
            if (plan.keepFocus) {
              // Entering a column of numbers should not need a re-click after
              // every one.
              input.select();
            }
            if (plan.dismiss) {
              settledByKey.current = true;
              editing.current = false;
              onDismiss?.();
            }
            return;
          }

          // Abandon: snap back to what is stored and write nothing.
          // stopPropagation so Escape settles the field without also reaching
          // whatever encloses it; closing is this field's call to make, below.
          e.stopPropagation();
          setDraft(blankWhenUnset ? "" : revertToSaved(shown));
          editing.current = false;
          settledByKey.current = true;
          if (plan.dismiss) {
            onDismiss?.();
            return;
          }
          input.blur();
        }}
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={
          whenUnset !== undefined && whenUnset !== "zero"
            ? whenUnset.placeholder
            : undefined
        }
        // The confirmation is on the field itself rather than a floating tick:
        // it cannot be clipped by a scrolling row, it shifts no layout, and it
        // is unmissable next to the number that just changed.
        data-saved={flash ? "true" : undefined}
        className={cn(
          "text-right transition-colors duration-200",
          flash && "border-emerald-500 bg-emerald-500/10 text-emerald-300",
          className
        )}
      />
      {suffix && (
        <span className="ml-1 text-xs text-muted-foreground">{suffix}</span>
      )}
      {/* Announce the save to assistive tech, which cannot see the colour. */}
      <span className="sr-only" role="status" aria-live="polite">
        {flash ? `${ariaLabel} saved` : ""}
      </span>
    </span>
  );
}
