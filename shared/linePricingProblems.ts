/**
 * A bid line the pricing engine cannot price, named, rather than a crash or a
 * quiet $0.
 *
 * ── What this closes ─────────────────────────────────────────────────────────
 * `calculateLineItem` throws on a negative quantity, rate, hours or markup, and
 * the rollup used to call it bare for every line. One such line therefore took
 * down the WHOLE bid screen — and because `bids.search` and `bids.archived`
 * price every bid on the page inside one `Promise.all`, it took down those lists
 * for every other bid too. Meanwhile the dashboard, which sums lines in SQL and
 * cannot throw, added the same line in as a plausible, wrong number.
 *
 * Every router input rejects these values (`min(0)` on qty, money, hours and
 * markup), so a line only gets here through a snapshot writer with a bug, a
 * migration, or hand-edited SQL. That is exactly the class of fault nobody
 * notices, which is why the answer is to SAY so, per line, and keep pricing the
 * rest.
 *
 * ── A broken line is left OUT of the totals, and the bid says so ─────────────
 * Not priced at $0, and not priced at its negative value. It has no trustworthy
 * value at all, so it contributes nothing and the bid is marked incomplete: the
 * screen names the line and its reference, the proposal and the accounting
 * export refuse. A total that is short and SAYS it is short can be acted on; a
 * total that is short and looks finished gets sent to a client.
 *
 * ── The SQL has to agree ─────────────────────────────────────────────────────
 * `costSums` in server/db.ts applies this same predicate to the dashboard and
 * analytics sums. `server/linePricingProblems.test.ts` prices bids both ways and
 * asserts they match, so a rule added here without its SQL twin goes red.
 *
 * Pure, so the screen, the server and the suite read one rule.
 */

/** Why a line cannot be priced. Stored in `pricing_problem_reports.code`. */
export const LINE_PROBLEM_CODES = [
  "negative-quantity",
  "negative-material-cost",
  "negative-labor-hours",
  "negative-labor-rate",
  "negative-markup",
  /** The engine threw for a reason the predicate above does not name. */
  "calculation-failed",
  /** The BID's overhead or profit settings have no finite price. */
  "bid-settings-invalid",
] as const;

export type LineProblemCode = (typeof LINE_PROBLEM_CODES)[number];

export type LineProblem = {
  code: LineProblemCode;
  /** The offending value, for the report. Numbers only — never job text. */
  detail: string;
};

/** The stored columns the predicate reads. A drizzle row fits as-is. */
export type PricedLineColumns = {
  qty: string | number;
  snapshotMaterialCost: string | number | null;
  snapshotLaborHours: string | number | null;
  snapshotLaborRate: string | number;
  snapshotMarkupPct: string | number | null;
};

/**
 * The first reason this line cannot be priced, or null when it can.
 *
 * NULL price and NULL hours are NOT problems: they are a free count nobody has
 * priced yet, which totals as 0 and is named by the warning strip
 * (shared/handPricedLines.ts). Only a value that is present and impossible is.
 *
 * The order matches `calculateLineItem`'s own checks so the code reported is
 * the one the engine would have thrown on first.
 */
export function lineProblem(line: PricedLineColumns): LineProblem | null {
  const qty = Number(line.qty);
  if (qty < 0) return { code: "negative-quantity", detail: `qty=${qty}` };

  const rate = Number(line.snapshotLaborRate);
  if (rate < 0) return { code: "negative-labor-rate", detail: `rate=${rate}` };

  if (line.snapshotLaborHours !== null) {
    const hours = Number(line.snapshotLaborHours);
    if (hours < 0)
      return { code: "negative-labor-hours", detail: `hours=${hours}` };
  }

  // The engine does not throw on this one — it would happily price a negative
  // material. That is the worse outcome, not the better one: a plausible
  // number that is wrong, and a total a few dollars short that nothing flags.
  if (line.snapshotMaterialCost !== null) {
    const cost = Number(line.snapshotMaterialCost);
    if (cost < 0)
      return { code: "negative-material-cost", detail: `cost=${cost}` };
  }

  if (line.snapshotMarkupPct !== null) {
    const markup = Number(line.snapshotMarkupPct);
    if (markup < 0)
      return { code: "negative-markup", detail: `markup=${markup}` };
  }

  return null;
}

/**
 * The engine's own message, trimmed for storage. The engine's errors carry the
 * label and the number ("quantity cannot be negative, received: -2"), never a
 * line's name, so storing them keeps the report free of job contents.
 */
export function thrownDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 480);
}

/** What the screen says, per code. Plain English, and says what to do. */
export function problemMessage(code: LineProblemCode): string {
  switch (code) {
    case "negative-quantity":
      return "Its quantity is negative.";
    case "negative-material-cost":
      return "Its material price is negative.";
    case "negative-labor-hours":
      return "Its labor hours are negative.";
    case "negative-labor-rate":
      return "Its labor rate is negative.";
    case "negative-markup":
      return "Its material markup is negative.";
    case "calculation-failed":
      return "The price could not be calculated.";
    case "bid-settings-invalid":
      return "This bid's overhead or profit settings cannot produce a price.";
  }
}

/**
 * What the estimator can do about it, on THIS line.
 *
 * Depends on where the bad value lives. A typed quantity and a hand-priced
 * line's price and hours are editable right there. Anything frozen from the
 * library — an assembly line's snapshot — cannot be typed over (R4), so the
 * way out is to remove the line and add it again, which re-snapshots it.
 */
export function problemFixHint(
  code: LineProblemCode,
  line: { quantityTypeable: boolean; pricedByHand: boolean }
): string {
  if (code === "negative-quantity" && line.quantityTypeable)
    return "Type the right quantity.";
  if (
    line.pricedByHand &&
    (code === "negative-material-cost" || code === "negative-labor-hours")
  )
    return "Type it again on the line.";
  if (code === "bid-settings-invalid")
    return "Check overhead and profit on this bid.";
  return "Remove the line and add it again.";
}

// ─── Reference numbers ──────────────────────────────────────────────────────

/**
 * A report's reference, from its row id: `ERR-1042`.
 *
 * The id rather than anything derived from the bid, because the row is what
 * somebody looks up and a derived code would have to be searched for. Stable
 * for the life of the problem: the same broken line reports under the same
 * reference however many times the bid is opened, and again if it breaks
 * again after being fixed (see `recordPricingProblems`).
 */
export function formatErrorRef(id: number): string {
  return `ERR-${id}`;
}

/**
 * The row id a typed reference names, or null. Forgiving about case, spaces
 * and a missing prefix, because it arrives read aloud over a phone.
 */
export function parseErrorRef(text: string): number | null {
  const match = /^\s*(?:err\s*-?\s*)?(\d{1,10})\s*$/i.exec(text);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The key one problem is recorded under, so re-opening a bid updates its row
 * rather than adding another. `bid` stands for a problem with no line.
 */
export function problemDedupeKey(
  bidId: number,
  lineId: number | null,
  code: LineProblemCode
): string {
  return `${bidId}:${lineId ?? "bid"}:${code}`;
}
