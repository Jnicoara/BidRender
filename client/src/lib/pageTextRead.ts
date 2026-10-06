/**
 * Pull a drawn page's text ONCE, for scale detection, and never lose it.
 *
 * ── The fault (local smoke test, 2026-10-06) ───────────────────────────────
 * The Plans screen marked a page "read" when it STARTED pulling the text, then
 * delivered the text only if the effect that started it was still alive. That
 * effect re-ran whenever the screen's handler changed — which it does when the
 * sheet list arrives. On a fast machine the rows arrived mid-pull: the old run
 * was cancelled, the new run saw "already read" and stopped, and the text went
 * nowhere. No scale was ever detected; a fresh upload sat on "Set scale" (flow
 * test 2, about 4 runs in 5 on a laptop, never on the slower staging). Flipping
 * away from a page before its text arrived lost it the same way.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * A page counts as read when its text is DELIVERED, not when it is asked for.
 * A cancelled pull delivers nothing and marks nothing, so the next run asks
 * again. Two pulls in flight deliver once.
 */
export type PageTextReads = { delivered: Set<number> };

export function startPageTextRead(
  reads: PageTextReads,
  page: number,
  extract: () => Promise<string>,
  deliver: (page: number, text: string) => void
): () => void {
  if (reads.delivered.has(page)) return () => {};
  let cancelled = false;
  extract()
    .then(text => {
      if (cancelled || reads.delivered.has(page)) return;
      reads.delivered.add(page);
      deliver(page, text);
    })
    // Detection is a convenience. A page whose text will not extract simply
    // stays unscaled until someone sets it.
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}
