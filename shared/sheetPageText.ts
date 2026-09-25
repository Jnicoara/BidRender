/**
 * One page's pdf.js text, turned into what the sheet reader needs: the plain
 * text (stored for searching the set) and positioned items (for the title
 * block). One function for both the upload worker and the checks that run in
 * Node, so what was measured is what runs.
 */
import type { TitleBlockItem } from "./sheetTitleBlock";

/** The slice of a pdf.js text item this reads. */
export type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
};

/** The slice of a pdf.js viewport this reads (scale 1). */
export type PdfViewport = {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
};

/**
 * The page's text, items joined with single spaces in pdf.js drawing order —
 * the same join the viewer uses for scale detection. Drawing order is not
 * reading order, so a search over this must normalise (piece 4).
 */
export function joinPageText(items: PdfTextItem[]): string {
  return items
    .map(item => item.str ?? "")
    .filter(s => s.trim().length > 0)
    .join(" ");
}

/**
 * Items positioned as the page is DISPLAYED: viewport space, rotation applied.
 * `vert` compares the text direction with the page's own rotation, so text
 * drawn sideways on a `/Rotate 270` sheet reads as horizontal — which is how
 * the person looking at it sees it.
 */
export function positionedItems(
  items: PdfTextItem[],
  viewport: PdfViewport,
  rotate: number
): TitleBlockItem[] {
  const out: TitleBlockItem[] = [];
  for (const item of items) {
    const s = item.str ?? "";
    const t = item.transform;
    if (!s.trim() || !t || t.length < 6) continue;
    const [x, y] = viewport.convertToViewportPoint(t[4], t[5]);
    const sideways = Math.abs(t[1]) > Math.abs(t[0]);
    out.push({
      s,
      x,
      y,
      w: item.width ?? 0,
      h: Math.hypot(t[2], t[3]),
      vert: sideways !== (rotate % 180 !== 0),
    });
  }
  return out;
}
