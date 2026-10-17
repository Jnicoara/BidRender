/**
 * The bracket editor's check (references/bid-methods-plan.md § 3, owner Q9):
 * brackets may leave a GAP, which falls to the company %, and may never
 * OVERLAP, because a price in two brackets has two markups and the walk would
 * silently take whichever comes first.
 *
 * Brackets are the existing `markup_rules` rows of kind `band` (`PriceBand`,
 * shared/materialMarkup.ts): min inclusive, max exclusive, max NULL = no top.
 * So "$0–$1" and "$1–$10" meet at $1 without overlapping — $1.00 is in the
 * second — exactly as `bandFor` reads them.
 */
import type { PriceBand } from "./materialMarkup";

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const top = (b: PriceBand) => b.maxPrice ?? Number.POSITIVE_INFINITY;

export type BracketCheck = {
  /** Refusals: the brackets cannot be saved while any is here. */
  problems: string[];
  /** Said beside the brackets, never a refusal (Q9). */
  gaps: string[];
};

export function checkBrackets(bands: readonly PriceBand[]): BracketCheck {
  const problems: string[] = [];
  const gaps: string[] = [];
  for (const b of bands) {
    if (!Number.isFinite(b.minPrice) || b.minPrice < 0)
      problems.push(`A bracket starts below $0.00 (${usd(b.minPrice)}).`);
    if (b.maxPrice !== null && b.maxPrice <= b.minPrice)
      problems.push(
        `The bracket ${usd(b.minPrice)}–${usd(b.maxPrice)} ends where it starts, or before.`
      );
    if (!Number.isFinite(b.pct) || b.pct < 0)
      problems.push(`A markup can't be below 0% (${usd(b.minPrice)} bracket).`);
  }
  const sorted = [...bands].sort((a, b) => a.minPrice - b.minPrice);
  if (sorted.length > 0 && sorted[0].minPrice > 0)
    gaps.push(`Items under ${usd(sorted[0].minPrice)} fall to the company %.`);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.minPrice < top(prev))
      problems.push(
        `Brackets overlap: ${label(prev)} and ${label(next)} both cover ${usd(next.minPrice)}.`
      );
    else if (next.minPrice > top(prev))
      gaps.push(
        `Items between ${usd(top(prev))} and ${usd(next.minPrice)} fall to the company %.`
      );
  }
  const last = sorted[sorted.length - 1];
  if (last && last.maxPrice !== null)
    gaps.push(`Items ${usd(last.maxPrice)} and over fall to the company %.`);
  return { problems, gaps };
}

function label(b: PriceBand): string {
  return b.maxPrice === null
    ? `${usd(b.minPrice)} and over`
    : `${usd(b.minPrice)}–${usd(b.maxPrice)}`;
}
