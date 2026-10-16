/**
 * A number box in a DRAFT form (one with its own Save button) that keeps the
 * text as typed. Every box that rebuilt its text from the number dropped the
 * point in "2." and turned "2.5" into 25 — see lib/draftNumberText.ts.
 */
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import {
  draftNumberFrom,
  typeDraftNumber,
  type DraftNumber,
} from "@/lib/draftNumberText";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | null;
  /** null is a blank box; the caller decides what blank means. */
  onValue: (next: number | null) => void;
  min?: number;
  max?: number;
};

export function DraftNumberInput({
  value,
  onValue,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  ...rest
}: Props) {
  const [draft, setDraft] = useState<DraftNumber>(() => draftNumberFrom(value));
  const [seen, setSeen] = useState(value);
  /** The next value change is this box's own edit coming back. */
  const [echo, setEcho] = useState(false);
  // Only a value changed from OUTSIDE (another row opened, a reset, a rounding
  // the caller applied) replaces the text. Checking against the draft instead
  // would redraw "2." as "2" again whenever a caller declined a value. And a
  // box just emptied stays empty when the caller stores blank as 0 — showing
  // that 0 made "clear, then type 2.5" read "02.5".
  if (value !== seen) {
    setSeen(value);
    setEcho(false);
    const blankEcho = echo && draft.value === null;
    if (value !== draft.value && !blankEcho) setDraft(draftNumberFrom(value));
  }
  return (
    <Input
      {...rest}
      value={draft.text}
      onChange={e => {
        const next = typeDraftNumber(draft, e.target.value, max, min);
        setDraft(next);
        if (next.value !== draft.value) {
          setEcho(true);
          onValue(next.value);
        }
      }}
    />
  );
}
