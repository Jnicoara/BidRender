/**
 * Searching the words ON the drawings, across a bid's plans. Viewer piece 4,
 * references/plan-viewer-overhaul.md § 17.6. Reads the page text the sheet
 * reader stored at upload (bid_pdf_sheet_text); stores nothing itself.
 *
 * ── Why the text and the query are both normalised ───────────────────────────
 * The stored text is pdf.js items joined by single spaces in DRAWING order, and
 * CAD output splits tokens: a panel called `RP-1` can arrive as `RP - 1`, and
 * a sheet number as `AD` `-` `101`. So spaces around `-`, `.` and `/` are
 * removed on both sides before comparing, and case is ignored. Without that,
 * `RP-1` misses exactly the sheets where it is printed.
 *
 * ── Two steps, so the database does the narrowing ────────────────────────────
 * MySQL first keeps only pages whose text contains every letter-or-digit run
 * of the query, in order (`likePattern`) — a loose test that cannot miss a real
 * match, run against an index-free MEDIUMTEXT but only over one bid's pages.
 * Then `findInText` does the exact normalised match on what came back, counts
 * it and cuts a snippet.
 */

/**
 * Spaces around - . / removed, and before an inch or foot mark (`1/2 "` is how
 * a split `1/2"` arrives, and people search `1/2" EMT`); runs of space
 * collapsed; lower case.
 */
export function normaliseForSearch(text: string): string {
  return text
    .replace(/\s*([-./])\s*/g, "$1")
    .replace(/\s+(["'′″])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The shortest query worth sending: one letter matches every sheet. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * A LIKE pattern keeping every page that COULD match: the query's
 * letter-or-digit runs, in order, anything between. `RP-1` → `%RP%1%`.
 * Wildcards the person typed are escaped, so `50%` searches for "50%".
 * Null when the query has no letters or digits at all.
 */
export function likePattern(query: string): string | null {
  // Latin letters with accents included; the repo's TS target has no /u.
  const runs = query.match(/[A-Za-z0-9À-ɏ]+/g);
  if (!runs || runs.length === 0) return null;
  const escaped = runs.map(r => r.replace(/[\\%_]/g, c => `\\${c}`));
  return `%${escaped.join("%")}%`;
}

/** How much text either side of the first hit the snippet shows. */
const SNIPPET_SIDE = 40;

/**
 * The exact test: how many times the normalised query appears in the
 * normalised text, and a snippet around the first. Null when it does not
 * appear — `likePattern` lets through near-misses on purpose.
 */
export function findInText(
  text: string,
  query: string
): { count: number; snippet: string } | null {
  const q = normaliseForSearch(query);
  if (q.length < MIN_SEARCH_LENGTH) return null;
  const t = normaliseForSearch(text);
  let count = 0;
  let first = -1;
  for (let at = t.indexOf(q); at !== -1; at = t.indexOf(q, at + q.length)) {
    if (first === -1) first = at;
    count++;
  }
  if (count === 0) return null;
  const start = Math.max(0, first - SNIPPET_SIDE);
  const end = Math.min(t.length, first + q.length + SNIPPET_SIDE);
  const snippet =
    (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "");
  return { count, snippet };
}
