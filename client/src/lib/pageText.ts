/**
 * The words read off each page, kept for the plan reader — per PLAN SET.
 *
 * ── The fault (found 2026-10-02) ───────────────────────────────────────────
 * The Plans screen kept each page's extracted text in a map keyed by PAGE
 * NUMBER alone, and never cleared it when the plan set changed. Page 1 of the
 * electrical set and page 1 of the lighting set share a key, so the plan
 * reader — and the "ask about this sheet" box — could be sent one set's title
 * block, notes and printed scale alongside another set's picture. A reader
 * given the wrong printed scale proposes against the wrong one, and nothing
 * on screen would say the words came from a different drawing.
 *
 * ── The fix ────────────────────────────────────────────────────────────────
 * The key is (plan set, page). A page whose text was read under another set
 * is simply not found, and the reader gets an empty string — the same as a
 * page with no text layer — rather than somebody else's words.
 */

export function pageTextKey(bidPdfId: number, pageNumber: number): string {
  return `${bidPdfId}:${pageNumber}`;
}

/** Remember what was read off one page of one plan set. */
export function rememberPageText(
  store: Map<string, string>,
  bidPdfId: number,
  pageNumber: number,
  text: string
): void {
  store.set(pageTextKey(bidPdfId, pageNumber), text);
}

/**
 * The text read off THIS plan set's page, or "" — never another set's.
 * No plan set open (`null`) is "" too.
 */
export function pageTextFor(
  store: ReadonlyMap<string, string>,
  bidPdfId: number | null | undefined,
  pageNumber: number
): string {
  if (bidPdfId == null) return "";
  return store.get(pageTextKey(bidPdfId, pageNumber)) ?? "";
}
