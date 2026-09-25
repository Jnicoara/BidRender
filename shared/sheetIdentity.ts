/**
 * A sheet's NUMBER and TITLE — `E-101`, `Lighting Plan` — from the three
 * places a PDF can say them, and what the sheet list shows.
 * references/plan-viewer-overhaul.md § 17.4.
 *
 * ── The order, per field ─────────────────────────────────────────────────────
 * 1. The PDF's own PAGE LABELS, written by the CAD publisher
 *    (`E-001 - ELECTRICAL SPECIFICATIONS`). The best source when present.
 * 2. BOOKMARKS (the outline), when an entry carries a sheet number.
 * 3. The TITLE BLOCK on the page itself (shared/sheetTitleBlock.ts), only for a
 *    field the first two left empty.
 *
 * Per field rather than per page, so a bookmark that names the sheet but not
 * its number can still be joined by a number read off the title block.
 *
 * ── Blank, never a guess ─────────────────────────────────────────────────────
 * Every parser here returns null rather than something doubtful. A label that
 * is only a page number (`18`, from a bigger set) says nothing about the
 * sheet. A bookmark with no sheet number in it is a GROUP heading as often as
 * a sheet name (`GENERAL`, `Sheets`), and already becomes the sheet's name
 * through `ensureSheets`, so it is not repeated here as a "title".
 */

/** A discipline-shaped sheet number: E101, E-101, E1.01, E1.1A, ED-101B. */
export const SHEET_NUMBER_PATTERN =
  /^[A-Z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Z]?$/;

const MAX_NUMBER = 32;
const MAX_TITLE = 255;

/** The number as it should be stored, or null if it is not number-shaped. */
export function asSheetNumber(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").replace(/[–—]/g, "-");
  if (compact.length === 0 || compact.length > MAX_NUMBER) return null;
  return SHEET_NUMBER_PATTERN.test(compact) ? compact : null;
}

function cleanTitle(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const title = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—:]\s*/, "");
  if (!/[A-Za-z]{2}/.test(title)) return null;
  return title.slice(0, MAX_TITLE);
}

export type ParsedSheetName = { number: string | null; title: string | null };

/**
 * Split a page label or bookmark into number and title.
 *
 * Shapes seen on real sets (2026-09-25): `E-001 - ELECTRICAL SPECIFICATIONS`,
 * `[1] E-001 INDEX, LEGEND AND NOTES`, `E001 - ELECTRICAL SYMBOLS AND NOTES`,
 * and `24-6476_1017 & 1029 Brebeuf Rd_ELEC - E-001 - SPECS`, where the number
 * is the middle segment.
 *
 * `titleOnly` decides what a string with NO number in it gives: a page label
 * is a deliberate name for one page, so its words are a title; a bookmark
 * may be a group heading, so it gives nothing.
 */
export function parseSheetName(
  raw: string,
  { titleOnly }: { titleOnly: boolean }
): ParsedSheetName | null {
  const text = raw
    .replace(/^\[\d+\]\s*/, "")
    .replace(/\.pdf$/i, "")
    .trim();
  if (text.length === 0 || /^\d+$/.test(text)) return null;

  // "A - B - C": the first segment that IS a sheet number, and what follows.
  const segments = text.split(/\s+[-–—]\s+/);
  for (let i = 0; i < segments.length; i++) {
    const number = asSheetNumber(segments[i]);
    if (number)
      return { number, title: cleanTitle(segments.slice(i + 1).join(" - ")) };
  }

  // "E-001 INDEX, LEGEND AND NOTES": a number as the first word.
  const [first, ...rest] = text.split(/\s+/);
  const number = asSheetNumber(first);
  if (number) return { number, title: cleanTitle(rest.join(" ")) };

  if (!titleOnly) return null;
  // Four letters at least: a label like "iii" or "A" names nothing.
  if ((text.match(/[A-Za-z]/g) ?? []).length < 4) return null;
  return { number: null, title: cleanTitle(text) };
}

export type IdentitySource = "label" | "bookmark" | "titleblock";
export type ResolvedField = {
  value: string | null;
  source: IdentitySource | null;
};

/**
 * Which source supplies each field. Every field comes back, so a re-read can
 * write "nothing found" over an earlier reading instead of leaving it behind.
 */
export function resolveSheetIdentity(sources: {
  label: ParsedSheetName | null;
  bookmark: ParsedSheetName | null;
  titleBlock: ParsedSheetName | null;
}): { number: ResolvedField; title: ResolvedField } {
  const order: [IdentitySource, ParsedSheetName | null][] = [
    ["label", sources.label],
    ["bookmark", sources.bookmark],
    ["titleblock", sources.titleBlock],
  ];
  const pick = (field: keyof ParsedSheetName): ResolvedField => {
    for (const [source, parsed] of order) {
      const value = parsed?.[field];
      if (value) return { value, source };
    }
    return { value: null, source: null };
  };
  return { number: pick("number"), title: pick("title") };
}

/** What is stored for one page (see bid_pdf_sheet_identity). */
export type StoredSheetIdentity = {
  pageNumber: number;
  sheetNumber: string | null;
  sheetNumberSource: IdentitySource | "user" | null;
  sheetTitle: string | null;
  sheetTitleSource: IdentitySource | null;
};

/**
 * What the sheet list shows for one sheet.
 *
 * ── Hand edits win ───────────────────────────────────────────────────────────
 * A TITLE a person typed is `name` with `nameSource = 'user'`, and nothing read
 * off the PDF displaces it. A NUMBER a person typed is stored as `user` and is
 * never overwritten by a re-read (server/db.ts, `recordSheetReads`).
 *
 * Otherwise the read title, then the sheet's existing name — a bookmark, or
 * `Sheet N`, which is `provisional` so the list can show it as something to
 * fix rather than as the sheet's real name.
 */
export function sheetDisplay(
  sheet: {
    name: string;
    nameSource: "bookmark" | "default" | "user";
  },
  identity: Pick<StoredSheetIdentity, "sheetNumber" | "sheetTitle"> | undefined
): { number: string | null; title: string; provisional: boolean } {
  const number = identity?.sheetNumber ?? null;
  if (sheet.nameSource === "user")
    return { number, title: sheet.name, provisional: false };

  const read = identity?.sheetTitle ?? null;
  if (read) return { number, title: read, provisional: false };

  // A bookmark name that already starts with the number ("E1 - Power Plan")
  // would read "E1  E1 - Power Plan" beside it.
  let title = sheet.name;
  if (number) {
    const parsed = parseSheetName(title, { titleOnly: false });
    if (parsed?.number === number && parsed.title) title = parsed.title;
  }
  return { number, title, provisional: sheet.nameSource === "default" };
}

/** One line: `E-101  Lighting Plan`, or the title alone. */
export function sheetLabel(display: {
  number: string | null;
  title: string;
}): string {
  return display.number ? `${display.number}  ${display.title}` : display.title;
}
