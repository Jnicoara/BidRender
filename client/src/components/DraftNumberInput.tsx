/**
 * A number box inside a form that keeps what is being TYPED, not the number.
 *
 * Rendering `value={String(qty)}` from the number loses every in-between
 * state: "2." becomes "2" before the next key arrives, so typing 2.25 stored
 * 225 (assembly components, kit items and assembly steps, found 2026-10-15).
 * This holds the text, hands the parent a number only when the text is one
 * (`draftNumber`), and on blur shows the number actually held — so a typo
 * reverts in front of the person instead of sitting there looking saved.
 */
import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { draftNumber, formatForEdit } from "@/lib/inlineEdit";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number;
  onValueChange: (n: number) => void;
  /** Which numbers this box takes. Default: 0 or more. */
  allow?: (n: number) => boolean;
};

export function DraftNumberInput({
  value,
  onValueChange,
  allow,
  onBlur,
  ...rest
}: Props) {
  const [text, setText] = useState(() => formatForEdit(value));

  // A value changed from outside (a row replaced, a reset) shows; the echo of
  // our own change does not, or "2." would still snap to "2".
  useEffect(() => {
    setText(current =>
      draftNumber(current, allow) === value ? current : formatForEdit(value)
    );
    // `allow` is usually an inline arrow; only the number should resync.
  }, [value]);

  return (
    <Input
      {...rest}
      value={text}
      onChange={e => {
        setText(e.target.value);
        const n = draftNumber(e.target.value, allow);
        if (n !== null && n !== value) onValueChange(n);
      }}
      onBlur={e => {
        setText(formatForEdit(value));
        onBlur?.(e);
      }}
    />
  );
}
