/**
 * Whether Supplier pricing shows "Import price list". OFF since 2026-10-12.
 *
 * The parser keeps the number and drops the unit, so "$480.00/M" on #12 THHN
 * saves as $480 PER FOOT and "$12.50/C" on wire nuts as $12.50 each — and it
 * writes row by row with no preview and no undo
 * (references/pricing-safety-plan.md § 1.1, on track-c). A price in the wrong
 * unit does not look broken: it prices a 500 ft homerun at $240,000 in the
 * same font as a real number. The owner answered review-sheet Q5 "hide it
 * until its review screen with undo exists" (materials-review-sheet-plan.md).
 *
 * HIDDEN, not removed: the dialog, the parser and `materials.importPrices`
 * are untouched, and no price a shop already imported is changed. Turn this
 * back on only together with the per M / per C conversion, the preview and
 * the undo — `server/priceListImportHidden.test.ts` is what makes that a
 * decision rather than an accident.
 */
export const PRICE_LIST_IMPORT_SHOWN = false;
