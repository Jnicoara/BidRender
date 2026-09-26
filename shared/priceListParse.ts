/**
 * Reading a supply-house price sheet into name/price pairs.
 *
 * ── The failure this module exists to prevent ────────────────────────────────
 * The version this replaces did `line.split(",")` and took the LAST cell as the
 * price. On `4" square box,$1,250.00` that split into `$1` and `250.00`, took
 * `250.00`, and priced the material at $250 — then reported it as a success. A
 * wrong price that reports success is the worst outcome this app can produce:
 * it is indistinguishable on screen from one the contractor checked, so it gets
 * bid and won on. Every shipped material costs $0 precisely so that no unchecked
 * figure can reach a bid; a parser that invents one defeats that entirely.
 *
 * So the governing rule here is not "parse more formats". It is:
 *
 *   **Never produce a number this module is not certain of.** Anything
 *   ambiguous is REFUSED and reported by line, never guessed at.
 *
 * `parseMoney` returns null rather than a best effort, and every refusal
 * carries the original text so the user can see the line that was skipped. A
 * reported skip costs someone thirty seconds; a silent wrong price costs them a
 * job.
 *
 * ── RFC 4180 alone does not fix the thousands bug ────────────────────────────
 * Worth stating plainly, because it is the non-obvious part. Correct RFC 4180
 * splitting keeps `"$1,250.00"` in one field — but only if the sheet QUOTED it,
 * and plenty do not. An unquoted `$1,250.00` is genuinely two fields under the
 * spec, and no amount of standards compliance recovers it. That case is handled
 * separately by `repairSplitThousands`, which rejoins a field pair only when it
 * has the exact shape of a split group (`$1` + `250.00`) and refuses otherwise.
 *
 * ── Delimiter detection, because the common case is not a comma ──────────────
 * The dialog says "paste two columns", and the way people do that is to copy
 * cells out of Excel — which puts TAB-separated text on the clipboard. The old
 * parser split on commas, got one field, and skipped every row, so pasting a
 * spreadsheet imported nothing at all and said "0 rows ready". Tab, semicolon
 * and pipe are all detected.
 *
 * ── What is deliberately NOT supported ───────────────────────────────────────
 * European decimal commas. `1,25` is 1.25 in Germany and a malformed thousands
 * group in the US, and nothing in the text says which. Guessing makes this
 * module wrong by a factor of 100 on a real price. It is refused and reported.
 */

/** A field separator this module can recognise. */
export type Delimiter = "," | "\t" | ";" | "|";

export const DELIMITERS: readonly Delimiter[] = [",", "\t", ";", "|"];

/** One usable row: a material name and the price to write against it. */
export type PriceRow = {
  name: string;
  costPerUnit: number;
};

/** A line that could not be read, kept so the user sees what was skipped. */
export type PriceListProblem = {
  /** 1-based line number in the pasted text, so it can be pointed at. */
  line: number;
  /** The line as written, truncated for display. */
  text: string;
  reason: string;
};

export type PriceListParse = {
  rows: PriceRow[];
  problems: PriceListProblem[];
  delimiter: Delimiter;
  /** The header cells, if the first row was recognised as one. */
  header: string[] | null;
};

// ─── RFC 4180 field splitting ─────────────────────────────────────────────────

/**
 * Split delimited text into records of fields, per RFC 4180.
 *
 * A character-level state machine rather than a regex, because the rules are
 * genuinely stateful: a delimiter inside quotes is data, a newline inside
 * quotes is data, and `""` inside quotes is one literal quote. A regex that
 * looked right would be wrong on exactly the rows that matter — the ones with
 * `1/2" EMT` and `#10 bare CU, stranded` in them.
 *
 * Deviations from the spec, both toward accepting real files:
 *
 *   • A bare `"` inside an UNQUOTED field is kept as data. The spec leaves this
 *     undefined, and inch marks (`3/4" rigid`) are everywhere in this catalog.
 *   • An unterminated quote at end of input closes rather than throwing. The
 *     row is still reported if it does not yield a price.
 */
export function splitDelimited(raw: string, delimiter: Delimiter): string[][] {
  // A byte-order mark survives copy-paste and Excel exports, and would
  // otherwise become part of the first material's name.
  const text = raw.replace(/^﻿/, "");

  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    // Fields come back EXACTLY as written, padding included. RFC 4180 says
    // nothing about trimming, and this parser has a specific need for the
    // original bytes: when an unquoted comma inside a name splits it across
    // two fields, the name is put back together by rejoining them, and a trim
    // here would silently drop the space in `bare CU, stranded` and make
    // the reassembled name match nothing. Consumers trim individual fields.
    fields.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'; // "" is one escaped quote
          index += 2;
          continue;
        }
        inQuotes = false;
        index++;
        continue;
      }
      field += char;
      index++;
      continue;
    }

    if (char === '"' && field.trim() === "") {
      // Only opens a quoted field at the START of one. A quote later in the
      // field is an inch mark, not a delimiter.
      inQuotes = true;
      field = "";
      index++;
      continue;
    }

    if (char === delimiter) {
      endField();
      index++;
      continue;
    }

    if (char === "\r" || char === "\n") {
      endRecord();
      // CRLF is one line break, not two.
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += char;
    index++;
  }

  // Anything still buffered is a final record with no trailing newline.
  if (field !== "" || fields.length > 0) endRecord();

  // Drop rows that are entirely empty — blank lines and trailing newlines.
  return records.filter(row => row.some(cell => cell.trim() !== ""));
}

/**
 * Which separator this text uses.
 *
 * Two signals, because either alone picks wrong:
 *
 *   CONSISTENCY of the field count. Raw frequency is useless here — a comma
 *   appears inside material names and inside grouped prices, so counting
 *   occurrences picks comma for a tab-separated Excel paste every time.
 *
 *   Whether the LAST field parses as a price. This is the decisive one, and it
 *   is what separates the case consistency cannot: pasting
 *   `#10 bare CU, stranded<TAB>3.75` splits into exactly two fields under
 *   BOTH comma and tab, perfectly consistently. Only the tab split puts a
 *   readable price in the last field; the comma split leaves
 *   ` stranded<TAB>3.75` there, which is not a price. A separator that reveals
 *   prices is the structural one.
 *
 * Ties go to the earlier entry in DELIMITERS, which puts comma first — the
 * documented format wins when nothing distinguishes them.
 */
export function detectDelimiter(raw: string): Delimiter {
  let best: Delimiter = ",";
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const rows = splitDelimited(raw, delimiter).slice(0, 20);
    if (rows.length === 0) continue;

    const counts = rows.map(row => row.length);
    const modal = counts
      .slice()
      .sort(
        (a, b) =>
          counts.filter(c => c === b).length -
          counts.filter(c => c === a).length
      )[0];
    if (modal < 2) continue; // one field is not a split at all

    const consistent = counts.filter(c => c === modal).length / counts.length;

    // How often the split actually exposes a price. Rows are checked from the
    // right so a trailing notes column does not sink an otherwise good split.
    const priced =
      rows.filter(row =>
        row.some((_, i) => i > 0 && parseMoney(row[row.length - i]) !== null)
      ).length / rows.length;

    // A tab, semicolon or pipe left sitting INSIDE a field means that
    // character is the real separator and this candidate split the row in the
    // wrong place. Decisive, and asymmetric on purpose: those three never
    // occur inside a material name or a price, whereas a comma frequently
    // does — `#10 bare CU, stranded` is a real catalog row — so a comma
    // inside a field is not evidence of anything.
    const foreign = DELIMITERS.filter(d => d !== delimiter && d !== ",").some(
      other =>
        rows.filter(row => row.some(cell => cell.includes(other))).length >
        rows.length * 0.5
    );

    // Field count matters as a tiebreak, but only a little: two columns split
    // cleanly beats five columns split raggedly.
    const score =
      consistent * 100 + priced * 60 + Math.min(modal, 8) - (foreign ? 500 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

// ─── Money ────────────────────────────────────────────────────────────────────

/** Currency markers and per-unit suffixes a supply house writes beside a price. */
const CURRENCY = /[$£€]|\bUSD\b|\bCAD\b/gi;
const UNIT_SUFFIX =
  /\s*(?:\/|\bper\b)\s*(?:ea|each|ft|foot|feet|c|m|lf|cf|box|bx|pk|roll|rl)\b\.?\s*$/i;

/**
 * A price, or null if this module cannot be certain what the text means.
 *
 * Null is a real answer here, not a failure to try. Every branch below that
 * returns null is a case where a plausible-looking number could be produced and
 * would be wrong — see the module header.
 */
export function parseMoney(text: string): number | null {
  if (typeof text !== "string") return null;

  let value = text.trim();
  if (value === "") return null;

  // A parenthesised figure is accounting notation for a negative. Stripped to
  // be recognised, then refused below — a negative price is not a price.
  const parenthesised = /^\((.*)\)$/.exec(value);
  if (parenthesised) value = `-${parenthesised[1]}`;

  value = value.replace(CURRENCY, "").replace(UNIT_SUFFIX, "").trim();
  // Non-breaking and thin spaces arrive from web pages and PDFs, and are used
  // as group separators in some locales.
  value = value.replace(/[   ]/g, " ").trim();
  if (value === "") return null;

  if (value.startsWith("-")) return null; // negative: not a price
  if (value.startsWith("+")) value = value.slice(1).trim();

  // Plain: 1250, 1250.00, .42
  if (/^\d*\.?\d+$/.test(value)) {
    const plain = Number(value);
    return Number.isFinite(plain) ? plain : null;
  }

  // US grouped: 1,250 / 1,250.00 / 12,345,678.90
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) {
    const grouped = Number(value.replace(/,/g, ""));
    return Number.isFinite(grouped) ? grouped : null;
  }

  // Space-grouped: 1 250.00
  if (/^\d{1,3}( \d{3})+(\.\d+)?$/.test(value)) {
    const spaced = Number(value.replace(/ /g, ""));
    return Number.isFinite(spaced) ? spaced : null;
  }

  // Everything else contains a comma or a second point in a position this
  // module cannot read unambiguously — "1,25" is 1.25 in Europe and a broken
  // group in the US, and "1.250,00" is the mirror image. Guessing is wrong by
  // a factor of 100 on a real price, so it refuses.
  return null;
}

/**
 * Rejoin a price that an unquoted thousands separator split across two fields.
 *
 * This is the fix for the specific bug that motivated the rewrite. `$1,250.00`
 * written without quotes is two fields under RFC 4180 — `$1` and `250.00` — and
 * correct splitting cannot recover it, because the file really does say that.
 *
 * The repair only fires on the exact shape of a split group: a leading part of
 * one to three digits, and a trailing part of exactly three digits with an
 * optional decimal. `4.50` beside `EA` does not match; `$1` beside `250.00`
 * does. Anything less specific would start merging real adjacent columns.
 *
 * Only meaningful when the delimiter is a comma. A tab-separated sheet never
 * splits a price this way.
 */
export function repairSplitThousands(parts: string[]): number | null {
  if (parts.length < 2) return null;

  const head = parts[0].trim().replace(CURRENCY, "").trim();
  if (!/^\d{1,3}$/.test(head)) return null;

  // Every middle part must be a whole group. A million-dollar switchgear line
  // splits into three fields, not two, so this walks however many there are.
  for (let i = 1; i < parts.length - 1; i++) {
    if (!/^\d{3}$/.test(parts[i].trim())) return null;
  }

  const tail = parts[parts.length - 1].trim();
  if (!/^\d{3}(\.\d+)?$/.test(tail)) return null;

  return parseMoney([head, ...parts.slice(1).map(p => p.trim())].join(","));
}

// ─── Header ───────────────────────────────────────────────────────────────────

const PRICE_HEADER =
  /\b(price|cost|net|sell|amount|each|unit\s*price|list|rate)\b/i;
/**
 * What a material is CALLED. Preferred over the identifier columns below,
 * because a catalog number is the supplier's name for the item and the catalog
 * here is matched by the contractor's name for it.
 */
const NAME_HEADER = /\b(description|desc|material|product|name)\b/i;
/** Identifier columns — used only when there is no description column at all. */
const IDENTIFIER_HEADER = /\b(item|catalog|cat|part|sku|number|no|#)\b/i;

/**
 * Is this row a header, and if so which columns hold the name and the price?
 *
 * A row is a header when no cell in it parses as money. That test is better
 * than matching on words: a sheet whose header says "Net 30" still has no
 * price in it, and a data row whose first column is "Price tag hanger" is not
 * a header because its price column is a number.
 */
export function readHeader(
  cells: string[]
): { name: number; price: number } | null {
  if (cells.length < 2) return null;
  if (cells.some(cell => parseMoney(cell) !== null)) return null;
  if (cells.every(cell => cell.trim() === "")) return null;

  // Rightmost price-ish column: sheets that carry both "List" and "Net" mean
  // the one further right, which is what the contractor actually pays.
  let price = -1;
  for (let i = 0; i < cells.length; i++) {
    if (PRICE_HEADER.test(cells[i])) price = i;
  }
  if (price === -1) price = cells.length - 1;

  // A description column wins over an identifier column wherever it sits: on a
  // sheet reading "Catalog #, Description, UOM, List, Net", the column to match
  // against is Description, and taking the leftmost name-ish header would take
  // the SKU — which matches nothing in this catalog and would report the whole
  // sheet as unmatched.
  let name = -1;
  for (let i = 0; i < cells.length; i++) {
    if (i !== price && NAME_HEADER.test(cells[i])) {
      name = i;
      break;
    }
  }
  if (name === -1) {
    for (let i = 0; i < cells.length; i++) {
      if (i !== price && IDENTIFIER_HEADER.test(cells[i])) {
        name = i;
        break;
      }
    }
  }
  if (name === -1) name = price === 0 ? 1 : 0;
  return { name, price };
}

// ─── The parse ────────────────────────────────────────────────────────────────

const MAX_PROBLEM_TEXT = 120;

const truncate = (text: string) =>
  text.length > MAX_PROBLEM_TEXT ? `${text.slice(0, MAX_PROBLEM_TEXT)}…` : text;

/**
 * Find the price in a row that has no header to go by.
 *
 * Scans from the right, because the price is the last thing on a line in every
 * sheet format seen. Returns where it starts as well as its value, so the
 * caller knows how much of the row is the name.
 */
function findPriceFromRight(
  cells: string[],
  delimiter: Delimiter
): { value: number; startsAt: number } | null {
  for (let i = cells.length - 1; i >= 1; i--) {
    // The repair is tried FIRST, and that order is the whole fix. On
    // `100A main panel,$5,247.17` the rightmost field `247.17` parses
    // perfectly well as money — it is just the wrong money. Checking the
    // split-group shape before accepting a clean parse is what stops $5,247.17
    // being read as $247.17, which is the bug in its original form.
    //
    // Longest span first, so `$1,234,567.89` is read whole rather than as its
    // last two groups.
    if (delimiter === ",") {
      for (let span = Math.min(4, i); span >= 2; span--) {
        const start = i - span + 1;
        if (start < 1) continue;
        const repaired = repairSplitThousands(cells.slice(start, i + 1));
        if (repaired !== null) return { value: repaired, startsAt: start };
      }
    }

    const direct = parseMoney(cells[i]);
    if (direct !== null) return { value: direct, startsAt: i };
  }
  return null;
}

/**
 * Read a pasted price sheet.
 *
 * Returns usable rows and, separately, every line it refused — the two are
 * equally part of the answer. A caller that shows only the rows is hiding the
 * half the user needs to check.
 */
export function parsePriceList(raw: string): PriceListParse {
  const delimiter = detectDelimiter(raw);
  const records = splitDelimited(raw, delimiter);

  const rows: PriceRow[] = [];
  const problems: PriceListProblem[] = [];

  if (records.length === 0) {
    return { rows, problems, delimiter, header: null };
  }

  // A first row is only a header if there is data UNDER it. Without this, a
  // sheet whose prices this module refuses to read — a European one, say —
  // has no parseable money anywhere, so its first line looks exactly like a
  // header and the whole file is silently swallowed as one. Requiring a later
  // row with a readable price means an unreadable sheet reports every line
  // instead of disappearing.
  const hasDataBelow = records
    .slice(1)
    .some(row => row.some(cell => parseMoney(cell) !== null));
  const headerColumns = hasDataBelow ? readHeader(records[0]) : null;
  const header = headerColumns ? records[0] : null;
  const body = headerColumns ? records.slice(1) : records;
  const lineOffset = headerColumns ? 2 : 1;

  body.forEach((cells, index) => {
    const line = index + lineOffset;
    const original = cells.join(delimiter === "\t" ? "\t" : delimiter);

    if (cells.length < 2) {
      problems.push({
        line,
        text: truncate(original),
        reason: "Only one column — a name and a price are both needed.",
      });
      return;
    }

    let name: string;
    let cost: number | null = null;

    const linesUpWithHeader =
      headerColumns !== null && cells.length === header!.length;

    if (linesUpWithHeader) {
      // Widths agree, so the columns mean what the header says they mean.
      cost = parseMoney(cells[headerColumns!.price] ?? "");
      name = (cells[headerColumns!.name] ?? "").trim();
    } else if (headerColumns !== null && header!.length > 2) {
      // A row wider or narrower than a multi-column header has an unquoted
      // delimiter in it, and with three or more columns there is no way to
      // tell WHICH field moved. Refused rather than realigned by guess — see
      // the module header. With exactly two columns it is unambiguous, so that
      // case falls through to the scan below instead.
      problems.push({
        line,
        text: truncate(original),
        reason: `This row has ${cells.length} columns but the header has ${header!.length} — a comma inside a field needs quoting.`,
      });
      return;
    } else {
      const found = findPriceFromRight(cells, delimiter);
      cost = found?.value ?? null;
      // Everything left of the price is the name, rejoined with the delimiter.
      // That is what recovers a name whose own comma was never quoted:
      // `#10 bare CU, stranded,3.75` comes back whole.
      name =
        found === null
          ? ""
          : cells
              .slice(0, found.startsAt)
              .join(delimiter)
              .trim()
              .replace(/,$/, "");
    }

    if (cost === null) {
      problems.push({
        line,
        text: truncate(original),
        reason: /[,.]\d{1,2}$|^\d+[.,]\d+$/.test(
          (cells[cells.length - 1] ?? "").trim()
        )
          ? "The price could not be read without guessing — write it as 1250.00."
          : "No price found on this line.",
      });
      return;
    }
    if (!name) {
      problems.push({
        line,
        text: truncate(original),
        reason: "No material name on this line.",
      });
      return;
    }

    rows.push({ name, costPerUnit: cost });
  });

  return { rows, problems, delimiter, header };
}

/** How the delimiter reads in a sentence to a user. */
export function delimiterLabel(delimiter: Delimiter): string {
  return delimiter === "\t"
    ? "tab-separated"
    : delimiter === ";"
      ? "semicolon-separated"
      : delimiter === "|"
        ? "pipe-separated"
        : "comma-separated";
}
