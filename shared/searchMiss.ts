/**
 * The no-match search log (todo.md § "Before beta: when the picker finds
 * nothing", item a, owner-approved 2026-10-08).
 *
 * When a picker search for an assembly or a material settles on NOTHING, the
 * words typed are recorded: the company, the words, the date. Nothing else —
 * no price, no bid, no line, no person. No AI reads the log or suggests from
 * it. It exists so the next catalog and starter work follows what people
 * actually look for and do not find.
 *
 * This module is the part both ends share: which pickers there are, and what
 * counts as words worth keeping. The server normalises again on the way in,
 * so a client that skipped this cannot store anything it would refuse.
 */

/** Which kind of picker came up empty. */
export const SEARCH_MISS_PICKERS = ["assembly", "material"] as const;
export type SearchMissPicker = (typeof SEARCH_MISS_PICKERS)[number];

/** The column is varchar(120); longer than that is not a search, it is a paste. */
export const SEARCH_MISS_MAX_LENGTH = 120;

/** One letter finds nothing useful and says nothing about the catalog. */
export const SEARCH_MISS_MIN_LENGTH = 2;

/**
 * How long a search has to sit on no results before it counts. Typing
 * "sealtite" passes through "sealt", which may find nothing for a moment;
 * that is a keystroke, not a search.
 */
export const SEARCH_MISS_SETTLE_MS = 2000;

/**
 * The words as they are stored: trimmed, inner whitespace collapsed, lower
 * case, control characters dropped. NULL when there is nothing worth keeping.
 *
 * Lower case so "Sealtite" and "sealtite" count as one search in the list.
 */
export function normalizeMissWords(query: string): string | null {
  const words = query
    // Control characters are never typed on purpose (a paste can carry them).
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (words.length < SEARCH_MISS_MIN_LENGTH) return null;
  return words.slice(0, SEARCH_MISS_MAX_LENGTH).trim();
}
