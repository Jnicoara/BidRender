/**
 * What paper size a PDF page is, and whether that size makes a written scale
 * suspect. S8, decided as D5 (a) in references/takeoff-spec.md.
 *
 * ── The fault this exists for ────────────────────────────────────────────────
 * Every traced length is `size on the PDF page × the written scale`. The
 * written scale is only true when the page is the size the drawing was made
 * for. A 24×36 set saved or printed at 11×17 still says `1/4" = 1'-0"`, so
 * every length comes out at about half — and nothing on screen looks wrong:
 * the ratio is standard, the arithmetic is exact, and every number is quietly
 * half. The page size is the one signal the file does carry, so it is read
 * here and said beside the scale.
 *
 * ── A question, never a verdict ──────────────────────────────────────────────
 * Small drawing sets genuinely exist, so a reduced size is a prompt to check
 * against a known dimension, not an error. A scale set by MEASURING a known
 * dimension is immune to all of this, which is why the warning points there.
 *
 * Pure arithmetic on page points (1/72 inch, pdf.js scale 1). Nothing stored:
 * the viewer reads the size off the open page.
 */

/** PDF user-space units per inch. */
export const POINTS_PER_INCH = 72;

/**
 * How a named size matters to a written scale.
 *
 *   full    — a normal drawing sheet; a written scale is believable.
 *   reduced — a size plan sets are commonly shrunk TO. A written scale may
 *             read every length short.
 */
export type SheetSizeKind = "full" | "reduced";

type NamedSize = {
  /** Short side, long side, inches. */
  short: number;
  long: number;
  label: string;
  kind: SheetSizeKind;
};

/**
 * Explicit, not derived: which sizes are "normal" is a fact about how the
 * trade prints, not arithmetic.
 *
 * 18×24 and 17×22 are real drawing sizes on small jobs, and also exactly half
 * of 36×48 and 34×44. They warn, because the check that clears the warning is
 * one measurement and a half-length takeoff is a lost job.
 */
export const NAMED_SHEET_SIZES: readonly NamedSize[] = [
  { short: 22, long: 34, label: "22×34", kind: "full" },
  { short: 24, long: 36, label: "24×36", kind: "full" },
  { short: 30, long: 42, label: "30×42", kind: "full" },
  { short: 34, long: 44, label: "34×44", kind: "full" },
  { short: 36, long: 48, label: "36×48", kind: "full" },
  { short: 8.5, long: 11, label: "8.5×11", kind: "reduced" },
  { short: 8.5, long: 14, label: "8.5×14", kind: "reduced" },
  { short: 9, long: 12, label: "9×12", kind: "reduced" },
  { short: 11, long: 17, label: "11×17", kind: "reduced" },
  { short: 12, long: 18, label: "12×18", kind: "reduced" },
  { short: 15, long: 21, label: "15×21", kind: "reduced" },
  { short: 17, long: 22, label: "17×22", kind: "reduced" },
  { short: 18, long: 24, label: "18×24", kind: "reduced" },
];

/**
 * How far a side may be from a named size and still be it.
 *
 * PDF exports trim or pad a little, and scanned sets more. 0.4 in covers an
 * export; 3% covers a scan of a large sheet. Tight enough that 11×17 is never
 * read as 12×18 (1 in apart) and 22×34 never as 24×36 (2 in apart) — see the
 * tests, which pin every neighbouring pair.
 */
function tolerance(inches: number): number {
  return Math.max(0.4, inches * 0.03);
}

export type SheetSize = {
  /** Short side and long side, in inches, whichever way the page is turned. */
  shortInches: number;
  longInches: number;
  /** "11×17", or the measured inches when no named size matches. */
  label: string;
  /** NULL when the page is no named size at all — shown, never warned on. */
  kind: SheetSizeKind | null;
};

/** One decimal, with a trailing ".0" dropped: 17 → "17", 16.54 → "16.5". */
function inchText(inches: number): string {
  const rounded = Math.round(inches * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The paper size of a page, from its size in points. NULL for a size that is
 * not a real page (zero, negative, NaN) — the viewer has not drawn it yet.
 */
export function sheetSize(
  widthPoints: number,
  heightPoints: number
): SheetSize | null {
  if (
    !Number.isFinite(widthPoints) ||
    !Number.isFinite(heightPoints) ||
    widthPoints <= 0 ||
    heightPoints <= 0
  ) {
    return null;
  }
  const a = widthPoints / POINTS_PER_INCH;
  const b = heightPoints / POINTS_PER_INCH;
  const shortInches = Math.min(a, b);
  const longInches = Math.max(a, b);

  const match = NAMED_SHEET_SIZES.find(
    size =>
      Math.abs(shortInches - size.short) <= tolerance(size.short) &&
      Math.abs(longInches - size.long) <= tolerance(size.long)
  );
  if (match) {
    return { shortInches, longInches, label: match.label, kind: match.kind };
  }
  return {
    shortInches,
    longInches,
    label: `${inchText(shortInches)}×${inchText(longInches)}`,
    kind: null,
  };
}

/**
 * Should the scale control warn about this page's size?
 *
 * Only when all three hold:
 *   - the page is a size sets are commonly shrunk to;
 *   - a scale is set, so lengths are being computed from it (with no scale,
 *     nothing is measured and there is nothing to be wrong);
 *   - nobody has checked that scale against a known dimension. A check is the
 *     fix this warning points to, so once one is recorded the warning has done
 *     its job. It clears with the existing `scaleCheckedAt` stamp, which a new
 *     scale always resets (bidPdfsRouter `setSheetScale`).
 */
export function sheetSizeWarns(
  size: SheetSize | null,
  scale: { isSet: boolean; checked: boolean }
): boolean {
  return size?.kind === "reduced" && scale.isSet && !scale.checked;
}
