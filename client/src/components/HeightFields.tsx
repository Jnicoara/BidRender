/**
 * An elevation, as two fields — or as the words "not set" until somebody asks.
 *
 * ── Why this is one component and not two similar ones ───────────────────────
 * It was two. The Settings screen had the "not set" handling and the takeoff
 * popover did not, so the popover rendered **0 ft 0 in** under a caption
 * reading "not set — no vertical counted". That is the precise confusion this
 * whole phase exists to prevent, reintroduced by copying a layout and not the
 * behaviour with it. One component, used by both.
 *
 * ── Zero is a real height, so "not set" cannot be shown as zero ──────────────
 * A floor box is at 0'-0". An unset panel is not. `references/writing-style.md`
 * § 8 says an unset PRICE shows $0 and is flagged, because a blank reads as
 * "not applicable" — heights invert that, because zero is a legitimate answer
 * and would read as a considered one. So a null value shows words and no
 * fields, and the fields appear only when the estimator asks for them.
 *
 * ── Feet and inches, in two fields ───────────────────────────────────────────
 * One field would have to parse 10'-6", 10' 6", 10.5 and 126 and be right every
 * time. The failure is silent and it is measured in feet. Two fields cannot be
 * misread.
 *
 * ── Below the floor is entered as a positive DEPTH ───────────────────────────
 * An underground stub-up is stored as a negative elevation, but nobody types a
 * minus sign on a job. `18` meant as a stub below slab would otherwise read as
 * eighteen inches above it — an 11.5 ft error on every one. The sign is applied
 * here so the rest of the app never has to think about it.
 */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineNumberField } from "@/components/InlineNumberField";

/** Inches → whole feet and the remainder, for the two fields. */
export function splitInches(inches: number): { feet: number; inches: number } {
  const abs = Math.abs(inches);
  return { feet: Math.floor(abs / 12), inches: abs % 12 };
}

export function HeightFields({
  value,
  belowFloor,
  ariaPrefix,
  onSave,
  onClear,
  clearLabel = "Reset",
  compact = false,
  onDismiss,
}: {
  /** NULL means "not set" — no fields until asked for. Never rendered as 0. */
  value: number | null;
  belowFloor: boolean;
  ariaPrefix: string;
  onSave: (inches: number) => void;
  onClear?: () => void;
  /**
   * "Reset" and "Clear" are different promises and the button has to make the
   * right one. A shipped type RESETS — there is a value behind it to fall back
   * to. The distribution height has nothing behind it, so the same button
   * CLEARS, and clearing it stops every vertical on every job.
   */
  clearLabel?: string;
  /** Tighter sizing, for a popover rather than a settings page. */
  compact?: boolean;
  /** Rule 5: on a panel, the LAST field commits and closes. */
  onDismiss?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  if (value === null && !revealed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#F5C518]">
          {compact ? "Not set" : "Not set — no vertical counted"}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => setRevealed(true)}
        >
          {compact ? "Set" : "Set a height"}
        </Button>
      </div>
    );
  }

  const parts = splitInches(value ?? 0);
  const commit = (feet: number, inches: number) => {
    const total = feet * 12 + inches;
    onSave(belowFloor ? -total : total);
  };
  const size = compact ? "h-6 w-12 text-xs" : "h-7 w-14 text-xs";

  return (
    <div className="flex items-center gap-1.5">
      <InlineNumberField
        value={parts.feet}
        onSave={next => commit(next, parts.inches)}
        rules={{ min: 0, max: 50, allowEmpty: true }}
        className={size}
        ariaLabel={`${ariaPrefix} feet`}
        suffix="ft"
      />
      <InlineNumberField
        value={parts.inches}
        onSave={next => commit(parts.feet, next)}
        rules={{ min: 0, max: 11, allowEmpty: true }}
        className={size}
        ariaLabel={`${ariaPrefix} inches`}
        suffix="in"
        onDismiss={onDismiss}
      />
      {belowFloor && (
        <span className="text-[0.7rem] text-muted-foreground">below floor</span>
      )}
      {onClear && value !== null && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
          onClick={onClear}
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
