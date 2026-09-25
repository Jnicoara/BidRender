/**
 * A markup or margin field for a DRAFT form — one with its own Save button, or
 * one that saves on blur by hand — where InlineNumberField is the wrong tool.
 *
 * Carries the same promise InlineNumberField's `percentKind` does, from the
 * same module: the word "markup" or "margin" is inside the box, and the other
 * number is beside it, live, from what is typed. references/material-markup.md
 * § Markup vs margin. Two fields showing the same thing share the behaviour,
 * not a copy of it (CLAUDE.md § "Copying a layout does not copy the behaviour").
 */
import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  otherPercentCaption,
  percentKindSuffix,
  type PercentKind,
} from "@/lib/percentKind";

export function PercentKindInput({
  kind,
  value,
  onChange,
  onBlur,
  onKeyDown,
  ariaLabel,
  placeholder,
  whenBlank,
  disabled,
  className,
}: {
  kind: PercentKind;
  /** The text in the box, as a PERCENT ("20"), not a fraction. */
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel: string;
  placeholder?: string;
  /**
   * What an EMPTY box means, said beside it in place of the conversion — "no
   * markup set", "follows the rules". For a field where blank is a real
   * answer that is not 0%; a placeholder inside would collide with the word.
   */
  whenBlank?: string;
  disabled?: boolean;
  /** Width and height; the room for the word inside is added here. */
  className?: string;
}) {
  const caption =
    value.trim() === "" && whenBlank
      ? whenBlank
      : otherPercentCaption(kind, value);
  return (
    <span className="inline-flex items-center">
      <span className="relative inline-flex">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={selectOnFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          inputMode="decimal"
          aria-label={`${ariaLabel} (percent ${kind})`}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("text-right pr-[4.25rem]", className)}
        />
        <span
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {percentKindSuffix(kind)}
        </span>
      </span>
      {caption && (
        <span className="ml-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {caption}
        </span>
      )}
    </span>
  );
}
