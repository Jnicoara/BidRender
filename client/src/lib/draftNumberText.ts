/**
 * A number typed into a DRAFT form field (one with its own Save button).
 *
 * The field keeps the TEXT the person typed, and the number is read from it.
 * Rebuilding the text from the number on every keystroke is what dropped the
 * decimal point in the run-type editor's extra box: "2." reads as 2, the box
 * redrew "2", the point was gone, and the next "5" made it 25 — a 25% extra
 * saved where 2.5% was typed, with nothing on screen to say so. The assembly
 * and kit part quantities had the same fault (2.25 stored as 225), found the
 * same week by Tracks B and C separately; this is the one copy that stayed
 * (`DraftNumberInput`).
 *
 * `null` is "blank" (follow the company). Text that is not a number yet keeps
 * the last good value, so a half-typed "." never becomes a zero. The text is
 * read the way a person means it (`draftNumber` → `parseTypedNumber`): "1,500"
 * and "$2.50" are read as typed, while "0x10" or "1,5" are not numbers at all
 * — plain `Number()` took "0x10" as 16.
 */
import { draftNumber } from "./inlineEdit";

export type DraftNumber = { text: string; value: number | null };

export function draftNumberFrom(value: number | null): DraftNumber {
  return { text: value === null ? "" : String(value), value };
}

export function typeDraftNumber(
  previous: DraftNumber,
  typed: string,
  max: number,
  min = 0
): DraftNumber {
  const raw = typed.trim();
  if (raw === "") return { text: typed, value: null };
  const next = draftNumber(raw, () => true);
  if (next === null) return { text: typed, value: previous.value };
  return { text: typed, value: Math.min(max, Math.max(min, next)) };
}
