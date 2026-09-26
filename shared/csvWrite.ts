/**
 * Writing CSV that other people's software has to read.
 *
 * One implementation, because there are now two exports that leave this app —
 * the supplier materials list and the accounting export — and a second copy of
 * these six lines is how they drift until one of them mangles a name the other
 * handles.
 *
 * ── Every field is quoted, unconditionally ───────────────────────────────────
 * Not "quoted when it needs it". The catalog genuinely contains commas
 * (`#10 bare CU, stranded` is a shipped material) and inch marks
 * (`1/2" EMT`), and a quote-only-when-needed rule is one forgotten branch away
 * from splitting a name across two columns. This app has already shipped that
 * bug once, in the price importer, and paid for it — see
 * `shared/priceListParse.ts`. A few extra bytes removes the whole class.
 *
 * ── CRLF, because the reader is a spreadsheet ────────────────────────────────
 * RFC 4180 specifies it, Excel cares, and QuickBooks' importer is fed by people
 * who opened the file in Excel first.
 */

/** One field, RFC 4180 quoted. A `"` inside becomes `""`. */
export function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** One record. */
export function csvRow(cells: readonly (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * A whole file from rows of cells, with a trailing newline.
 *
 * An empty string passed as a row becomes a genuinely blank line — some
 * exports use them as section breaks, and quoting one would put `""` on screen.
 */
export function csvDocument(
  rows: readonly (readonly (string | number)[] | "")[]
): string {
  return `${rows.map(row => (row === "" ? "" : csvRow(row))).join("\r\n")}\r\n`;
}

/**
 * A byte-order mark, so Excel opens the file as UTF-8.
 *
 * Without it Excel reads a `"` in `1/2" EMT` fine but mangles anything
 * non-ASCII, and the first material with an accent or a degree sign comes out
 * as mojibake. Prepended when handing the file to a browser download, not
 * baked into the document, so tests compare clean text.
 */
export const UTF8_BOM = "﻿";
