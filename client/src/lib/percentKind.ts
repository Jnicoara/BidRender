/**
 * Markup or margin — the word that goes INSIDE every profit-style % field, and
 * the other number shown live beside it.
 *
 * Part 4 of the bid-structure design (references/material-markup.md § Markup
 * vs margin): contractors mix the two up constantly, and getting it wrong
 * silently underprices every bid. So a field never says a bare "%". It says
 * "20 % markup", and beside it "= 16.7% margin" — a number, not a warning,
 * because a warning gets read past and a number does not.
 *
 * The decision lives here rather than in the component because vitest can
 * reach client/src/lib and cannot reach a React component. The arithmetic is
 * shared/pricing.ts's, so the caption can never disagree with the engine that
 * prices the bid.
 */
import { marginToMarkup, markupToMargin } from "@shared/pricing";

export type PercentKind = "markup" | "margin";

/** The word inside the field: "% markup", "% margin". */
export function percentKindSuffix(kind: PercentKind): string {
  return `% ${kind}`;
}

/** 16.666… → "16.7". One decimal, and no trailing ".0". */
function formatOne(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The caption beside a field, from whatever is TYPED in it right now.
 *
 * `typed` is the box's text, as a PERCENT ("20", not 0.20) — it follows the
 * draft keystroke by keystroke, so the other number moves while the user is
 * still deciding. Blank or unreadable text gives null: no caption, rather than
 * one computed from a number nobody entered.
 *
 *   ("markup", "20") → "= 16.7% margin"
 *   ("margin", "20") → "= 25% markup"
 */
export function otherPercentCaption(
  kind: PercentKind,
  typed: string
): string | null {
  const text = typed.trim();
  if (text === "") return null;
  const pct = Number(text);
  if (!Number.isFinite(pct) || pct < 0) return null;
  const fraction = pct / 100;
  if (kind === "markup") {
    return `= ${formatOne(markupToMargin(fraction) * 100)}% margin`;
  }
  // A margin of 100% or more has no finite price, so there is no markup to
  // show; the field's own rules refuse it on save.
  if (fraction >= 1) return null;
  return `= ${formatOne(marginToMarkup(fraction) * 100)}% markup`;
}
