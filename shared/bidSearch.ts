/**
 * Finding a bid from years ago, out of thousands.
 *
 * ── Server-side, keyset-paginated, and why that is not over-engineering ──────
 * The tempting build is to fetch every bid and filter in the browser. It works
 * beautifully at 24 bids, which is what a developer has, and falls over at the
 * scale a real contractor reaches after a few years — by which point the fix is
 * a rewrite of the screen rather than a change to a query.
 *
 * Two decisions carry the weight:
 *
 *   FILTERING IN SQL. The database returns a page, never a table. Nothing here
 *   loads a list into Node to `.filter()` it.
 *
 *   KEYSET PAGINATION, not OFFSET. `LIMIT 20 OFFSET 10000` makes the database
 *   walk and discard ten thousand rows to hand back twenty; the deeper you
 *   page, the slower it gets, which is exactly backwards from what a person
 *   scrolling expects. A cursor says "the row after this one", so page 500
 *   costs what page 1 costs. It also cannot skip or repeat a row when
 *   something is inserted mid-scroll, which OFFSET does silently.
 *
 * ── The sort key must never be NULL ─────────────────────────────────────────
 * Keyset pagination compares `(sortValue, id)` against the cursor. A NULL sort
 * value has no position in that ordering, so rows with one would be dropped or
 * repeated depending on the direction. `dueDate` is nullable, so it is
 * available as a FILTER and deliberately not as a SORT. `createdAt` and
 * `updatedAt` are both NOT NULL and are the only sorts offered.
 *
 * ── Client identity lives in two places, and search has to read both ────────
 * A bid names its client as free text (`bids.clientName`) and/or by link
 * (`bids.clientId`), and `shared/bidClient.ts` resolves the two. Searching only
 * the text would miss every bid that carries just the link — which is every bid
 * created through the client picker. So the client and address filters match
 * either source. Getting this wrong produces a search that looks like it works
 * and quietly cannot find half the bids.
 */

/** Which timestamp a date range applies to. */
export const BID_DATE_FIELDS = ["created", "due"] as const;
export type BidDateField = (typeof BID_DATE_FIELDS)[number];

/** How results are ordered. Both columns are NOT NULL — see the header. */
export const BID_SORTS = ["recent", "created"] as const;
export type BidSort = (typeof BID_SORTS)[number];

/** Whether archived bids are included. */
export const ARCHIVE_SCOPES = ["live", "archived", "all"] as const;
export type ArchiveScope = (typeof ARCHIVE_SCOPES)[number];

export type BidSearchFilters = {
  /**
   * Free text across the bid name, the client (both sources) and the address.
   * The single-box search, for someone who remembers one word.
   */
  text?: string;
  /** Client identity only: the bid's typed name or the linked record's name. */
  client?: string;
  /** The bid's site address, or the linked client's address. */
  address?: string;
  /** One trade from `bids.trades`. */
  trade?: string;
  status?: string;
  dateField?: BidDateField;
  /** Inclusive, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  archive?: ArchiveScope;
  sort?: BidSort;
};

/** How many rows a page holds. Bounded so a caller cannot ask for everything. */
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

export function clampPageSize(requested: number | undefined): number {
  // `!requested` would swallow 0, which is a real if silly request and should
  // clamp to 1 rather than silently becoming a full default page.
  if (requested === undefined || !Number.isFinite(requested)) {
    return PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.max(Math.floor(requested), 1), PAGE_SIZE_MAX);
}

// ─── LIKE safety ──────────────────────────────────────────────────────────────

/**
 * Escape a user's text for use inside a LIKE pattern.
 *
 * Without this, `%` and `_` are wildcards rather than characters. A contractor
 * searching for a job called "50% deposit" would match every bid they own, and
 * one searching "A_1" would match "AB1" — both look like the search being
 * broken rather than the input being interpreted.
 *
 * The backslash is escaped first, or escaping the others would double-escape
 * it. Pair this with `ESCAPE '\\'` in the query.
 */
export function escapeLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** `%term%` — a contains match, with the term's own wildcards neutralised. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term.trim())}%`;
}

/**
 * Is this term worth querying for?
 *
 * An empty or whitespace-only box is not a filter, and treating it as one
 * (`LIKE '%%'`) forces a scan that returns everything — the most expensive way
 * to express "no filter".
 */
export function usableTerm(term: string | undefined | null): string | null {
  const trimmed = (term ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Cursors ──────────────────────────────────────────────────────────────────

/**
 * Where the last page stopped: a sort value and the id that breaks its ties.
 *
 * The id is not decoration. Two bids updated in the same second are common —
 * a bulk edit does it — and without a tiebreaker the comparison is ambiguous,
 * so those rows get repeated across pages or skipped between them.
 */
export type BidCursor = {
  /** Epoch milliseconds of the sort column. */
  at: number;
  id: number;
};

/**
 * Encode a cursor as an opaque string.
 *
 * Opaque on purpose. A readable cursor invites a client to construct one, and
 * a hand-made cursor is a way to ask for rows the query was not built to
 * return. It is not a security boundary — the scope is — but it keeps the
 * contract narrow: cursors come from this server, and go back to it unchanged.
 */
export function encodeCursor(cursor: BidCursor): string {
  return Buffer.from(`${cursor.at}.${cursor.id}`, "utf8").toString("base64url");
}

/** Decode a cursor, or null if it is not one this server produced. */
export function decodeCursor(raw: string | undefined | null): BidCursor | null {
  if (!raw) return null;
  try {
    const text = Buffer.from(raw, "base64url").toString("utf8");
    const match = /^(\d+)\.(\d+)$/.exec(text);
    if (!match) return null;
    const at = Number(match[1]);
    const id = Number(match[2]);
    if (!Number.isSafeInteger(at) || !Number.isSafeInteger(id)) return null;
    return { at, id };
  } catch {
    // A malformed cursor reads as "start from the beginning" rather than
    // throwing. A stale bookmark should show the first page, not an error page.
    return null;
  }
}

/**
 * Turn a page of rows into a page plus the cursor for the next one.
 *
 * Takes one MORE row than the page size and uses its existence as the answer to
 * "is there another page?". Counting the whole result set instead would mean a
 * second query that scans everything the first one avoided scanning.
 */
export function toPage<T extends { id: number }>(
  rows: T[],
  pageSize: number,
  sortValue: (row: T) => Date
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= pageSize) return { items: rows, nextCursor: null };
  const items = rows.slice(0, pageSize);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: encodeCursor({ at: sortValue(last).getTime(), id: last.id }),
  };
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` range as timestamps, with the end date INCLUSIVE.
 *
 * The inclusive end is the whole point of doing this in one place. A range of
 * 1 March to 31 March compared against a timestamp with `<= 2026-03-31` means
 * `<= 2026-03-31 00:00:00`, which silently drops everything that happened on
 * the last day — the most common off-by-one in date filtering, and one that
 * looks like missing data rather than a bug.
 */
export function dateRangeBounds(
  from: string | undefined,
  to: string | undefined
): { start: Date | null; end: Date | null } {
  const start =
    from && DATE_RE.test(from) ? new Date(`${from}T00:00:00Z`) : null;
  const end = to && DATE_RE.test(to) ? new Date(`${to}T00:00:00Z`) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 1); // exclusive upper bound
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

/** Is a from/to pair the wrong way round? Worth telling the user, not fixing. */
export function rangeIsBackwards(
  from: string | undefined,
  to: string | undefined
): boolean {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return false;
  return from > to;
}

// ─── Describing a search ──────────────────────────────────────────────────────

/** Is anything actually being filtered on? Drives "showing all" vs "N results". */
export function hasAnyFilter(filters: BidSearchFilters): boolean {
  return Boolean(
    usableTerm(filters.text) ||
      usableTerm(filters.client) ||
      usableTerm(filters.address) ||
      usableTerm(filters.trade) ||
      usableTerm(filters.status) ||
      usableTerm(filters.from) ||
      usableTerm(filters.to) ||
      (filters.archive && filters.archive !== "live")
  );
}

/** A plain-English summary of the active filters, for the results header. */
export function describeFilters(filters: BidSearchFilters): string {
  const parts: string[] = [];
  const text = usableTerm(filters.text);
  const client = usableTerm(filters.client);
  const address = usableTerm(filters.address);
  const trade = usableTerm(filters.trade);
  const status = usableTerm(filters.status);

  if (text) parts.push(`matching "${text}"`);
  if (client) parts.push(`for "${client}"`);
  if (address) parts.push(`at "${address}"`);
  if (trade) parts.push(trade);
  if (status) parts.push(status.toLowerCase());
  if (filters.from && filters.to) {
    parts.push(
      `${filters.dateField ?? "created"} ${filters.from} to ${filters.to}`
    );
  } else if (filters.from) {
    parts.push(`${filters.dateField ?? "created"} from ${filters.from}`);
  } else if (filters.to) {
    parts.push(`${filters.dateField ?? "created"} up to ${filters.to}`);
  }
  if (filters.archive === "archived") parts.push("archived only");
  if (filters.archive === "all") parts.push("including archived");

  return parts.join(", ");
}

// ─── Name cursors, for the client list ────────────────────────────────────────

/**
 * The clients list is sorted by NAME, not by a timestamp, because that is how
 * a person looks somebody up. So its cursor carries a name and an id — the id
 * again breaking ties, since two clients can share a name and often do
 * ("Smith", a landlord and their company).
 */
export function encodeNameCursor(name: string, id: number): string {
  return Buffer.from(JSON.stringify([name, id]), "utf8").toString("base64url");
}

export function decodeNameCursor(
  raw: string | undefined | null
): { name: string; id: number } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [name, id] = parsed;
    if (typeof name !== "string" || !Number.isSafeInteger(id)) return null;
    return { name, id: id as number };
  } catch {
    return null;
  }
}

/**
 * A timestamp as MySQL stores it: `YYYY-MM-DD HH:MM:SS`, in UTC.
 *
 * ── Why this exists, and it is not decoration ────────────────────────────────
 * Drizzle reads a TIMESTAMP back by parsing it as UTC, but a raw `Date` handed
 * to a `sql` template is formatted by the driver in the SERVER's local time.
 * The two disagree by the local UTC offset, so a keyset comparison lands a few
 * hours away from where it should — which skips exactly the rows inside that
 * window at every page boundary. Seven hours of offset against six-hourly rows
 * lost one bid per page, silently, and only a volume test could see it.
 *
 * Typed drizzle comparisons (`gte(column, date)`) go through the column's
 * mapper and are already correct. This is for the raw predicates that cannot.
 *
 * Since 2026-10-16 the app's pool also sends Dates as UTC (`timezone: "Z"`,
 * server/appPool.ts), so the driver half of the disagreement above is gone
 * for the app. This stays: it is right either way, and scripts and tests
 * that build their own connection still get the driver's default.
 */
export function toSqlTimestamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}
