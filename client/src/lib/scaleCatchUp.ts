/**
 * Scale detection for a page that was READ before its sheet row existed.
 *
 * ── The fault (found by the smoke test, 2026-10-01) ────────────────────────
 * A freshly uploaded plan is drawn before `ensureSheets` has made its sheet
 * rows. The page's text is extracted the moment it is drawn, and the scale is
 * read from that text — but with no sheet row to attach a reading to, the
 * Plans screen skipped it, trusting a comment that it "will be re-read the
 * next time it is shown". Nothing re-read it: a drawn page is cached, and
 * flipping away and back did not extract its text again. Sheet 1 of a set
 * with a printed scale sat on "Set scale" until the page was reloaded.
 *
 * ── The fix ────────────────────────────────────────────────────────────────
 * The text is kept, keyed by plan set AND page (so one set's page 1 can never
 * be read as another's), and when the sheet rows arrive every page that was
 * read early and still has no scale is detected then. Asked once per sheet,
 * so a refetch of the sheet list cannot send the same reading twice.
 */

export type SheetForScale = {
  id: number;
  pageNumber: number;
  scaleSource: string;
};

/** The key a page's early-read text is kept under. */
export function earlyTextKey(bidPdfId: number, pageNumber: number): string {
  return `${bidPdfId}:${pageNumber}`;
}

/**
 * The sheets whose scale should be detected now: read before their row
 * existed, still unscaled, and not already asked about.
 */
export function sheetsToCatchUp(
  bidPdfId: number,
  sheets: readonly SheetForScale[],
  earlyText: ReadonlyMap<string, string>,
  alreadyAsked: ReadonlySet<number>
): { sheetId: number; text: string }[] {
  const out: { sheetId: number; text: string }[] = [];
  for (const sheet of sheets) {
    if (sheet.scaleSource !== "none") continue;
    if (alreadyAsked.has(sheet.id)) continue;
    const text = earlyText.get(earlyTextKey(bidPdfId, sheet.pageNumber));
    if (text === undefined) continue;
    out.push({ sheetId: sheet.id, text });
  }
  return out;
}
