/**
 * Turning what an estimator TYPES into the spellings a catalog is stored under.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * Reported 2026-09-24: the conduit and cable pickers returned nothing for
 * "2 inch pvc" or "10/2". Two separate faults, and this file is the second.
 *
 * The first was that the pickers searched saved run types instead of the
 * catalog, so a plain 2" PVC run needed a type defined before it could be
 * traced. That is fixed in RunTypePicker.
 *
 * The second is that even against the catalog those queries miss, because the
 * catalog stores `2" PVC Sch 40` and `10-2 NM-B` while people type `2 inch pvc`
 * and `10/2`. Nobody types an inch mark. This expands a query into the forms
 * the rows are actually named in, and the caller searches for all of them.
 *
 * ── Expanding the QUERY, not the rows ────────────────────────────────────────
 * Deliberately one-directional. Rewriting catalog names to match queries would
 * change what is displayed and stored; rewriting the query changes only what is
 * looked for, which is inspectable and cannot corrupt anything. It is also
 * where `ALIAS_MAP` already works (CLAUDE.md § Materials), so there is one kind
 * of place this sort of knowledge lives.
 *
 * ── The hard part: a slash means two different things ────────────────────────
 * `1/2` is half an inch. `10/2` is ten-two cable. Both are a number, a slash
 * and a number, and getting them the wrong way round produces silence rather
 * than a wrong answer, which is why the pickers looked broken rather than
 * inaccurate.
 *
 * They are told apart by ARITHMETIC, not by a list:
 *
 *   x/0        an aught conductor size — 1/0, 2/0, 4/0. Left exactly alone.
 *   x < y      a fraction. 1/2, 3/4, 3/8 — half an inch, not three-eighths
 *              cable, because no cable has eight conductors.
 *   x > y      a cable spec. 10/2, 12/3, 14/2 — the first number is a gauge
 *              and the second a conductor count, and a conductor count is
 *              always small.
 *
 * That rule is exact for everything in this catalog and is asserted case by
 * case in server/tradeSizeQuery.test.ts, including the pairs that sit closest
 * to the boundary.
 */

/**
 * Spoken fractions, which nobody types as digits when they are talking.
 *
 * ── LONGEST FIRST, and that is not tidiness ─────────────────────────────────
 * These are applied in order, so a shorter phrase listed above a longer one
 * eats its own prefix. With `quarter` first, "three quarter inch" became
 * "three 1/4 inch" and then matched nothing at all — caught by the test, not
 * by reading it. Anything added here goes above every entry it contains.
 */
const SPOKEN_FRACTIONS: Array<[RegExp, string]> = [
  [/\bone[\s-]?and[\s-]?a[\s-]?half\b/g, "1-1/2"],
  [/\bthree[\s-]?quarters?\b/g, "3/4"],
  [/\bthree[\s-]?eighths?\b/g, "3/8"],
  [/\bhalf\b/g, "1/2"],
  [/\bquarter\b/g, "1/4"],
];

/** `2 inch`, `2in`, `2-inch`, `2 in.` — all of them mean `2"`. */
const INCH_WORDS = /(\d(?:[\d./-]*\d)?)\s*(?:-\s*)?(?:inches|inch|ins?\b\.?)/g;

/** `20 foot`, `20ft`, `20 feet` — the same idea one unit up. */
const FOOT_WORDS = /(\d(?:[\d./-]*\d)?)\s*(?:-\s*)?(?:feet|foot|fts?\b\.?)/g;

const normalise = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Every spelling worth searching for, the typed one first.
 *
 * The original is always included and always first, so a caller that ranks by
 * position never demotes what the person actually wrote. Duplicates are
 * removed; order is otherwise the order they were derived in.
 */
export function expandTradeQuery(query: string): string[] {
  const typed = normalise(query);
  if (!typed) return [];

  const out: string[] = [typed];
  const add = (candidate: string) => {
    const value = normalise(candidate);
    if (value && !out.includes(value)) out.push(value);
  };

  // Spoken fractions first, so "half inch" becomes "1/2 inch" and then picks
  // up the inch-mark rule below like any other size.
  let spoken = typed;
  for (const [pattern, digits] of SPOKEN_FRACTIONS) {
    spoken = spoken.replace(pattern, digits);
  }
  if (spoken !== typed) add(spoken);

  for (const base of [typed, spoken]) {
    // `2 inch` -> `2"`, and the bare number too: a row may be named either way
    // and the bare form is what "2 pvc" already looks like.
    if (INCH_WORDS.test(base)) {
      INCH_WORDS.lastIndex = 0;
      add(base.replace(INCH_WORDS, '$1"'));
      INCH_WORDS.lastIndex = 0;
      add(base.replace(INCH_WORDS, "$1"));
    }
    INCH_WORDS.lastIndex = 0;

    if (FOOT_WORDS.test(base)) {
      FOOT_WORDS.lastIndex = 0;
      add(base.replace(FOOT_WORDS, "$1'"));
      FOOT_WORDS.lastIndex = 0;
      add(base.replace(FOOT_WORDS, "$1 ft"));
    }
    FOOT_WORDS.lastIndex = 0;
  }

  // Slash and dash, for cable specs only. See the header for why this cannot
  // be applied to every slash.
  for (const form of [...out]) {
    const swapped = swapCableSeparator(form);
    if (swapped) add(swapped);
  }

  return out;
}

/**
 * `10/2` -> `10-2`, and `10-2` -> `10/2`. Null when there is nothing to swap.
 *
 * Only touches pairs that read as a conductor spec, never a fraction and never
 * an aught. Every pair in the string is converted together: "10/2 and 12/3" is
 * one query and both halves have to move or the result matches neither.
 */
export function swapCableSeparator(text: string): string | null {
  let changed = false;
  const swapped = text.replace(
    /(\d+)\s*([/-])\s*(\d+)/g,
    (whole, left: string, sep: string, right: string) => {
      if (!isCableSpec(left, right)) return whole;
      changed = true;
      return `${left}${sep === "/" ? "-" : "/"}${right}`;
    }
  );
  return changed ? swapped : null;
}

/**
 * Does `left`/`right` read as {gauge}/{conductors} rather than a fraction?
 *
 * `0` on the right is an aught — a conductor SIZE, not a count — and must be
 * left alone: "4/0" is 4/0, and "4-0" is not a thing anybody writes.
 */
function isCableSpec(left: string, right: string): boolean {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (b === 0) return false; // an aught
  return a > b;
}

/**
 * Does this catalog row answer the query, under any of its spellings?
 *
 * Substring on the normalised text, because the expansion has already done the
 * interesting work and what is left is a plain contains. Every word of the
 * query has to appear, so "2 inch pvc" does not match every 2" fitting in the
 * catalog — it has to be PVC too.
 */
export function matchesTradeQuery(name: string, query: string): boolean {
  const haystack = normalise(name);
  return expandTradeQuery(query).some(form =>
    form.split(" ").every(word => haystack.includes(word))
  );
}
