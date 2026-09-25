/**
 * Going to a sheet by typing its number — `E-101`, `e101`, `e-1` — into the
 * sheet chip, or after pressing G. references/plan-viewer-overhaul.md § 17.5.
 *
 * ── Forgiving where people differ, strict where sheets differ ────────────────
 * Case, spaces, hyphens and LEADING ZEROS are all ignored: `e101`, `E 101` and
 * `e-101` all find `E-101`, and `e-1` finds `E-001`. The DOT is kept, and so
 * are zeros after it, because `E1.01` and `E101` — and `E1.1` and `E1.01` —
 * are different numbering schemes naming different sheets. Folding them
 * together would take somebody to the wrong drawing with nothing to say so.
 *
 * ── A duplicate is shown, never guessed ──────────────────────────────────────
 * Real sets repeat numbers (one Weld County set has `E1.0` on two sheets). So
 * Enter only jumps when exactly ONE sheet can be meant, or when the person has
 * moved the highlight onto a row themselves. Otherwise the list stays open.
 *
 * Sheets with no stored number never match by number. They can still match by
 * a word of their title, listed after every number match.
 */

export type JumpEntry = {
  bidPdfId: number;
  pageNumber: number;
  /** The stored sheet number, or null when none was read or typed. */
  number: string | null;
  /** What the sheet list shows as its title. */
  title: string;
};

export type JumpMatch = JumpEntry & { kind: "exact" | "prefix" | "title" };

/**
 * A number reduced to what identifies it: upper case, no spaces, hyphens or
 * underscores, and no leading zeros on a run of digits — except after a dot.
 */
export function normaliseSheetNumber(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s\-_–—]/g, "")
    .replace(/(^|[^.\d])0+(?=\d)/g, "$1");
}

/** How many rows the list shows at most. */
export const JUMP_LIMIT = 20;

export function jumpMatches(
  query: string,
  entries: readonly JumpEntry[],
  limit: number = JUMP_LIMIT
): JumpMatch[] {
  const q = normaliseSheetNumber(query);
  if (!q) return [];

  const exact: JumpMatch[] = [];
  const prefix: JumpMatch[] = [];
  for (const entry of entries) {
    if (!entry.number) continue;
    const n = normaliseSheetNumber(entry.number);
    if (n === q) exact.push({ ...entry, kind: "exact" });
    else if (n.startsWith(q)) prefix.push({ ...entry, kind: "prefix" });
  }

  // Title words, for a query that reads as words: every word must appear.
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2);
  const title: JumpMatch[] = [];
  if (words.length > 0 && /[a-z]{2}/i.test(query)) {
    const listed = new Set([...exact, ...prefix].map(keyOf));
    for (const entry of entries) {
      if (listed.has(keyOf(entry))) continue;
      const t = entry.title.toLowerCase();
      if (words.every(w => t.includes(w)))
        title.push({ ...entry, kind: "title" });
    }
  }

  return [...exact, ...prefix, ...title].slice(0, limit);
}

function keyOf(entry: Pick<JumpEntry, "bidPdfId" | "pageNumber">) {
  return `${entry.bidPdfId}:${entry.pageNumber}`;
}

/**
 * What Enter does with these matches: the one sheet to go to, or null to keep
 * the list open because the person has to choose.
 *
 * `chosen` is the row the person highlighted with the arrow keys, if they did
 * — an explicit pick. Without one, Enter jumps only when a single sheet can be
 * meant: one exact match, or one match of any kind at all.
 */
export function enterTarget(
  matches: readonly JumpMatch[],
  chosen: number | null
): JumpMatch | null {
  if (chosen !== null) return matches[chosen] ?? null;
  const exact = matches.filter(m => m.kind === "exact");
  if (exact.length === 1) return exact[0];
  if (exact.length === 0 && matches.length === 1) return matches[0];
  return null;
}
