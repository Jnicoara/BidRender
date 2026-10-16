/**
 * The one-time offer after an upload: "the titles say these sheets are
 * demolition — tag them?" (status-and-scope-plan.md § 2a, owner item 6,
 * 2026-10-15). Built 2026-10-16; the per-sheet menu and the banner shipped
 * earlier.
 *
 * Only sheets nobody has tagged, whose TITLE suggests a tag
 * (`suggestedWorkTag`), on a set uploaded in this tab. Nothing is tagged
 * until the estimator taps "Use these tags", and a tag moves no number: it
 * only decides what "Placing as" starts at on that sheet.
 */
import { suggestedWorkTag, type SheetWorkTag } from "@shared/sheetWorkTag";

export type WorkTagOfferRow = {
  sheetId: number;
  /** What the offer calls it: the sheet number and title, "E-101 DEMOLITION PLAN". */
  title: string;
  tag: SheetWorkTag;
};

export function workTagOffer(
  sheets: readonly { id: number; workTag?: SheetWorkTag | null }[],
  titleOf: (
    sheetId: number
  ) => { title: string; number?: string | null } | null | undefined
): WorkTagOfferRow[] {
  const rows: WorkTagOfferRow[] = [];
  for (const s of sheets) {
    if (s.workTag) continue;
    const read = titleOf(s.id);
    const tag = suggestedWorkTag(read?.title ?? "");
    if (!read || !tag) continue;
    const title = read.number ? `${read.number} ${read.title}` : read.title;
    rows.push({ sheetId: s.id, title, tag });
  }
  return rows;
}

/** The offer's sentence. */
export function workTagOfferText(rows: readonly WorkTagOfferRow[]): string {
  const n = rows.length;
  const names = rows
    .slice(0, 3)
    .map(r => r.title)
    .join(", ");
  const more = n > 3 ? ` and ${n - 3} more` : "";
  return n === 1
    ? `The title says ${names} is a demolition sheet. Tag it, so marks there start as Remove?`
    : `The titles say ${n} sheets are demolition: ${names}${more}. Tag them, so marks there start as Remove?`;
}
