/**
 * The takeoff as a spreadsheet: every count and every run type, per sheet and
 * for the whole bid. The "door out" to a supply house or a spreadsheet.
 *
 * ── Not the materials list, and not the accounting export ────────────────────
 * The materials list (shared/materialsList.ts) is what a supplier quotes from:
 * PARTS, with assemblies expanded, and traced runs lumped into one line of
 * conduit, one of cable and one of wire. The accounting export is the bid's
 * money. This file is neither. It is the TAKEOFF — what was counted and traced,
 * where, by type — so an estimator can check it, pivot it, or re-key it
 * somewhere else.
 *
 * ── Quantities only, and that is a choice, not an omission ──────────────────
 * Decided by the owner 2026-09-27: no prices in v1. A takeoff gets forwarded,
 * and a forwarded sheet should not carry the contractor's cost. When prices
 * come, they come as an explicit choice the person makes in the export, off by
 * default — not as columns that appear because a builder was copied.
 *
 * ── Prices arrived 2026-09-29, exactly that way ──────────────────────────────
 * This said "there is no field below a price could go in" until then. Now
 * there is one, `source.prices`, and it is filled only when the person ticks
 * "Include prices" — unticked every time, and refused by the server without
 * `pricing.view`. They are COSTS, as the bid's Cost column shows them (owner:
 * "it is a takeoff"), on the Whole bid rows only, and a footer ties them to
 * the bid's Direct cost. references/quote-app-panel-plan.md § 4.
 *
 * ── The whole-bid rows are SUMS of the sheet rows ────────────────────────────
 * Summed here, not computed separately, so the file always adds up in the
 * spreadsheet it lands in. That the sums also equal what the BID prices from
 * is checked against the database in server/takeoffExport.test.ts.
 *
 * ── A measurement nobody took is blank, never 0 ─────────────────────────────
 * CLAUDE.md § 6: zero is a legitimate length, so a run on a sheet with no
 * scale has an EMPTY quantity and a note saying why — not a 0 that reads as
 * "measured, and it was nothing".
 */
import { csvDocument } from "./csvWrite";

// ─── Input ───────────────────────────────────────────────────────────────────

export type TakeoffExportSheet = {
  sheetId: number;
  planFile: string;
  page: number;
  /** The sheet number read off the title block or typed, if any. */
  number: string | null;
  title: string;
};

/** One counted thing on one sheet. `key` identifies it across sheets. */
export type TakeoffExportCount = {
  sheetId: number;
  key: string;
  name: string;
  count: number;
  /**
   * The count's pin in words — "S3 diamond" (`pinCode`) — the same look
   * the takeoff screen draws (server/pinStyles.ts). NULL for marks that
   * belong to no count, which have no pin. Required, so a caller says which.
   */
  pin: string | null;
};

export type RunStatus = "draft" | "committed";

/**
 * One run type's footage on one sheet, for one status — the output of
 * `groupRunFootage` over exactly those runs, plus how many runs there were.
 */
export type TakeoffExportRuns = {
  sheetId: number;
  key: string;
  typeLabel: string;
  /** A cable's conductors are inside its jacket: Wire and Ground do not apply. */
  pathType: "conduit" | "cable";
  status: RunStatus;
  /** Non-suggested runs in this group, measured or not. */
  runCount: number;
  /** Raceway or cable to BUY: flat, vertical, extra (and a cable's makeup). */
  totalFeet: number;
  /** The vertical share of `totalFeet`. */
  verticalFeet: number;
  /** The share of `totalFeet` whose flat length was TYPED, not traced (§ 4c). */
  typedFeet: number;
  /** The EXTRA share of `totalFeet` — material only. */
  extraFeet: number;
  /** The MAKEUP share of `totalFeet` — a cable's tails. 0 on conduit. */
  makeupFeet: number;
  /** Insulated conductors to buy, every circuit, extra and makeup in. */
  wireFeet: number;
  /** Bare or green ground to buy. 0 on a cable type. */
  groundFeet: number;
  /** Measured runs with an extra nobody set — said in the note. */
  noExtraCount: number;
  /**
   * Drops from counted marks on this sheet (§ 3), and their feet — INSIDE
   * `verticalFeet` and `totalFeet` already. Said in the row's note, with the
   * fittings for them NOT counted (Q8).
   */
  markDropCount: number;
  markDropFeet: number;
  /** On a sheet with no usable scale, so not in the feet above. */
  unmeasurableCount: number;
  /**
   * Branch wiring the devices' whips carry (D18). Its wire is not in the feet;
   * on a conduit type its pipe is, and on a cable type nothing of it is.
   */
  branchCount: number;
  /** Nobody has said home run or branch yet — counted anyway. */
  unansweredCount: number;
  /** Measured runs with an end whose drop was not counted (no height). */
  endsNotCountedCount: number;
};

export type TakeoffExportSource = {
  bidName: string;
  preparedOn: Date;
  /** In the order they should appear — plan set, then page. */
  sheets: readonly TakeoffExportSheet[];
  counts: readonly TakeoffExportCount[];
  runs: readonly TakeoffExportRuns[];
  /** Runs traced with no type, which cannot be grouped (see router). */
  untypedRunCount: number;
  /**
   * The bid's COSTS, when the person ticked "Include prices" (owner,
   * 2026-09-29; references/quote-app-panel-plan.md § 4). Absent, the file is
   * exactly the quantities-only file it always was.
   */
  prices?: TakeoffPrices;
};

/**
 * One bid line, as the bid prices it — from `bidRollup`, never recomputed.
 *
 * `rowKey` says which whole-bid row it belongs to: a count's `group:<id>`, a
 * run type's key, or null for a line that did not come from the plans.
 */
export type TakeoffPricedLine = {
  rowKey: string | null;
  /** The quantity the line is priced on. Differs from the marks under a lock. */
  qty: number;
  /** The line's direct cost at quantity. Null: the engine cannot price it. */
  directCost: number | null;
  /** Its cost cell on the bid says "Not priced" (`lineNotPriced`). */
  notPriced: boolean;
  /**
   * Its HOURS cell on the bid says "Not priced" (`lineHoursUnset`) — a traced
   * part with no labor unit. Its material is priced and in the Cost column, so
   * it is here too, and the status says the labor is missing.
   */
  hoursNotSet: boolean;
  /** Parts with no price inside an otherwise priced line. */
  partsNotPriced: number;
};

export type TakeoffPrices = {
  lines: readonly TakeoffPricedLine[];
  /** Marked-up charges AT COST — the third part of the bid's Direct cost. */
  markedUpCharges: number;
  /** The bid's own Direct cost, which the footer must add up to. */
  directCost: number;
  /** Set when the bid's quantities are locked (shared/quantityLock.ts). */
  quantitiesLockedAt: Date | null;
};

// ─── Output ──────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<RunStatus, "Finished" | "Draft"> = {
  committed: "Finished",
  draft: "Draft",
};

export type TakeoffExportRow = {
  planFile: string;
  page: number | null;
  sheet: string;
  sheetTitle: string;
  kind: "Count" | "Run";
  item: string;
  /** Blank on a count; Finished or Draft on a run. */
  status: "" | "Finished" | "Draft";
  unit: "each" | "ft";
  /** Null when nothing in the row could be measured — blank, not 0. */
  quantity: number | null;
  /** Flat footage measured off the drawing. Typed lengths are NOT in it. */
  tracedFeet: number | null;
  /**
   * Flat footage the estimator typed (§ 4c).
   * Quantity = traced + typed + vertical + extra + makeup.
   */
  typedFeet: number | null;
  verticalFeet: number | null;
  /** Extra on the raceway or cable — material only. */
  extraFeet: number | null;
  /** Makeup inside a cable's figure. Blank on conduit, whose makeup is wire. */
  makeupFeet: number | null;
  wireFeet: number | null;
  groundFeet: number | null;
  note: string;
  /**
   * The LAST column (pin plan decision 11): a count's pin, "" on a run and
   * on a count with no pin. Required, so no row builder can leave it out.
   */
  pin: string;
  /** Whole-bid rows only, and only when prices were asked for. */
  price?: RowPrice;
};

/**
 * What the bid charges for a whole-bid row, at COST — the figure in the bid's
 * Cost column, before markup, overhead, profit and tax.
 *
 * A gap is BLANK with a status saying why, never $0 (owner, 2026-09-26: an
 * unpriced line never shows as $0).
 */
export type RowPrice = {
  status: string;
  /** The quantity the bid prices, for a count; null on a run type. */
  qtyOnBid: number | null;
  /** Line cost ÷ quantity, for a count; blank on a run type (several parts). */
  unitCost: number | null;
  lineCost: number | null;
};

/** The footer that ties the priced rows to the bid's Direct cost. */
export type PriceFooter = {
  /** The Line cost cells above, added up. */
  pricedRows: number;
  /** Lines marked Not priced, at what the bid counts for them so far. */
  notPricedCost: number;
  notPricedLines: number;
  /** Lines on the bid that did not come from the plans. */
  otherCost: number;
  otherLines: number;
  markedUpCharges: number;
  directCost: number;
  /** Lines the bid cannot price: in no figure, the bid's included. */
  cantPriceLines: number;
  partsNotPriced: number;
  quantitiesLockedAt: Date | null;
  /** A count's marks differ from what the bid prices (a lock). */
  qtyDiffers: boolean;
};

export type TakeoffExportDoc = {
  bidName: string;
  preparedOn: Date;
  bySheet: TakeoffExportRow[];
  wholeBid: TakeoffExportRow[];
  notes: string[];
  /** Present only when prices were asked for. */
  prices: PriceFooter | null;
};

// ─── Building it ─────────────────────────────────────────────────────────────

const round2 = (value: number) => Math.round(value * 100) / 100;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** What a run row says about the runs NOT in its feet. */
function runNote(runs: {
  pathType: "conduit" | "cable";
  unmeasurableCount: number;
  branchCount: number;
  unansweredCount: number;
  endsNotCountedCount: number;
  verticalFeet: number;
  noExtraCount: number;
  markDropCount: number;
  markDropFeet: number;
}): string {
  const parts: string[] = [];
  // Drops from marks, and the fittings NOT counted for them (Q8) — said on
  // the row, because this file leaves the app.
  if (runs.markDropCount > 0)
    parts.push(
      `Includes ${plural(runs.markDropCount, "drop", "drops")} to counted devices (${round2(runs.markDropFeet)} ft) — connectors and elbows for them are not counted`
    );
  // An unset extra whispers (§ 2.3); in a file that leaves the app it has to
  // be said on the row it affects.
  if (runs.noExtraCount > 0)
    parts.push(
      `No extra set — ${plural(runs.noExtraCount, "run carries", "runs carry")} none`
    );
  if (runs.endsNotCountedCount > 0)
    parts.push(
      runs.verticalFeet > 0
        ? `Vertical ft is short — ${plural(runs.endsNotCountedCount, "run has", "runs have")} an end with no mounting height`
        : `No drops counted — ${plural(runs.endsNotCountedCount, "run has", "runs have")} ends with no mounting height`
    );
  if (runs.unmeasurableCount > 0)
    parts.push(
      `${plural(runs.unmeasurableCount, "run", "runs")} not measured — no usable scale on the sheet`
    );
  // On a conduit type only the wire goes to the devices (D18); the pipe stays.
  if (runs.branchCount > 0)
    parts.push(
      runs.pathType === "conduit"
        ? `${plural(runs.branchCount, "run is", "runs are")} branch wiring — wire left out, the devices carry it; conduit counted`
        : `${plural(runs.branchCount, "run", "runs")} left out as branch wiring the devices already carry`
    );
  if (runs.unansweredCount > 0)
    parts.push(
      `${plural(runs.unansweredCount, "run", "runs")} not yet marked home run or branch — counted`
    );
  return parts.join("; ");
}

type RunTotals = Omit<TakeoffExportRuns, "sheetId">;

function runRow(
  runs: RunTotals,
  where: Pick<TakeoffExportRow, "planFile" | "page" | "sheet" | "sheetTitle">
): TakeoffExportRow {
  // A branch conduit run still has its pipe in the feet; a branch cable run
  // has nothing in them (runTypeFootageCore.ts).
  const measured =
    runs.runCount -
    runs.unmeasurableCount -
    (runs.pathType === "cable" ? runs.branchCount : 0);
  // Drops from marks are footage too — a type whose only feet on this sheet
  // are drops still has a quantity, not a blank.
  const hasFeet = measured > 0 || runs.markDropCount > 0;
  return {
    ...where,
    kind: "Run",
    item: runs.typeLabel,
    status: STATUS_LABEL[runs.status],
    unit: "ft",
    quantity: hasFeet ? round2(runs.totalFeet) : null,
    // Traced and typed apart: a length somebody typed and one the app
    // measured are different kinds of fact (§ 4c), and a column headed
    // "Traced" must not hold a number nobody traced.
    tracedFeet: hasFeet
      ? round2(
          runs.totalFeet -
            runs.verticalFeet -
            runs.typedFeet -
            runs.extraFeet -
            runs.makeupFeet
        )
      : null,
    typedFeet: hasFeet ? round2(runs.typedFeet) : null,
    extraFeet: hasFeet ? round2(runs.extraFeet) : null,
    makeupFeet:
      hasFeet && runs.pathType === "cable" ? round2(runs.makeupFeet) : null,
    // Blank when no drop was counted because an end has no height: that is
    // "not counted", and a 0 would say "counted, and there are none" — which
    // IS the answer for a run between boxes at run height, so 0 stays 0 there.
    verticalFeet:
      hasFeet && !(runs.verticalFeet === 0 && runs.endsNotCountedCount > 0)
        ? round2(runs.verticalFeet)
        : null,
    // Blank on a cable, not 0: its wire is not unmeasured, it is not a thing
    // this row has. A 0 would read as "no conductors in it".
    wireFeet:
      hasFeet && runs.pathType === "conduit" ? round2(runs.wireFeet) : null,
    groundFeet:
      hasFeet && runs.pathType === "conduit" ? round2(runs.groundFeet) : null,
    note: runNote(runs),
    // Runs have no pin; the cell is blank.
    pin: "",
  };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

// ─── Prices, when asked for ──────────────────────────────────────────────────

/**
 * Whether this person may take the bid's costs out in a file. The server
 * refuses `includePrices` on this, and the client hides the box on it.
 *
 * Every role carries `pricing.view` today (shared/permissions.ts), so no real
 * account is refused yet; the rule is here so a role without it is refused the
 * day one exists, rather than the day somebody notices.
 */
export function mayIncludePrices(capabilities: readonly string[]): boolean {
  return capabilities.includes("pricing.view");
}

const toCents = (dollars: number) => Math.round(dollars * 100);
const fromCents = (cents: number) => cents / 100;

/**
 * What the bid charges for one whole-bid row, from the lines behind it.
 *
 * A row's Line cost is the lines the bid has PRICED. A line the bid shows as
 * "Not priced" is left out of the cell and said in the status; the footer
 * then names what the bid counts for it so far, so the file still adds up to
 * the bid's Direct cost.
 */
function priceFor(
  lines: readonly TakeoffPricedLine[],
  kind: "Count" | "Run"
): RowPrice {
  const qtyOnBid =
    kind === "Count" && lines.length > 0
      ? lines.reduce((q, l) => q + l.qty, 0)
      : null;
  if (lines.length === 0)
    return {
      status: "Not on bid",
      qtyOnBid: null,
      unitCost: null,
      lineCost: null,
    };
  const priced = lines.filter(l => l.directCost !== null && !l.notPriced);
  const cant = lines.filter(l => l.directCost === null).length;
  if (priced.length === 0)
    return {
      status: cant === lines.length ? "Can't price" : "Not priced",
      qtyOnBid,
      unitCost: null,
      lineCost: null,
    };
  const cents = priced.reduce((c, l) => c + toCents(l.directCost ?? 0), 0);
  const parts = priced.reduce((p, l) => p + l.partsNotPriced, 0);
  const noHours = priced.filter(l => l.hoursNotSet).length;
  const status =
    priced.length < lines.length
      ? `Part not priced (${lines.length - priced.length} of ${lines.length})`
      : parts > 0
        ? `Priced, ${plural(parts, "part", "parts")} not priced`
        : noHours > 0
          ? `Priced, no labor hours on ${plural(noHours, "part", "parts")}`
          : "Priced";
  return {
    status,
    qtyOnBid,
    // A unit cost only where one line holds one kind of thing at a quantity.
    unitCost:
      kind === "Count" && priced.length === 1 && lines.length === 1 && qtyOnBid
        ? round2(fromCents(cents) / qtyOnBid)
        : null,
    lineCost: fromCents(cents),
  };
}

/**
 * Price the whole-bid rows, and build the footer that ties them to the bid.
 *
 * Every line with a figure lands in exactly one of four places — a row's
 * cell, "Not priced so far", "Other lines", or nowhere because the engine
 * cannot price it (as on the bid) — so the footer adds up to the bid's Direct
 * cost to the cent. server/takeoffExport.test.ts holds that.
 */
function applyPrices(
  keyed: readonly {
    key: string;
    status: RunStatus | null;
    row: TakeoffExportRow;
  }[],
  prices: TakeoffPrices
): PriceFooter {
  const rowKeys = new Set(keyed.map(k => k.key));
  const linesByKey = new Map<string, TakeoffPricedLine[]>();
  let otherCents = 0;
  let otherLines = 0;
  let notPricedCents = 0;
  let notPricedLines = 0;
  let cantPriceLines = 0;
  let partsNotPriced = 0;
  for (const line of prices.lines) {
    if (line.directCost === null) cantPriceLines++;
    if (line.rowKey === null || !rowKeys.has(line.rowKey)) {
      otherLines++;
      otherCents += toCents(line.directCost ?? 0);
      continue;
    }
    const list = linesByKey.get(line.rowKey) ?? [];
    list.push(line);
    linesByKey.set(line.rowKey, list);
    if (line.notPriced && line.directCost !== null) {
      notPricedLines++;
      notPricedCents += toCents(line.directCost);
    }
    if (!line.notPriced && line.directCost !== null)
      partsNotPriced += line.partsNotPriced;
  }

  /*
    A run type can have a Finished row AND a Draft row, and its bid lines are
    for both together — the bid prices drafts too. The price goes on ONE row
    (Finished when there is one) and the other says where it is, rather than
    splitting a cost the bid never split.
  */
  const pricedRunKeys = new Set<string>();
  const ordered = [...keyed].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "committed" ? -1 : 1
  );
  let rowCents = 0;
  let qtyDiffers = false;
  for (const { key, row } of ordered) {
    if (row.kind === "Run") {
      if (pricedRunKeys.has(key)) {
        row.price = {
          status: "On the Finished row",
          qtyOnBid: null,
          unitCost: null,
          lineCost: null,
        };
        continue;
      }
      pricedRunKeys.add(key);
    }
    row.price = priceFor(linesByKey.get(key) ?? [], row.kind);
    if (row.price.lineCost !== null) rowCents += toCents(row.price.lineCost);
    if (
      row.kind === "Count" &&
      row.price.qtyOnBid !== null &&
      row.price.qtyOnBid !== row.quantity
    )
      qtyDiffers = true;
  }

  return {
    pricedRows: fromCents(rowCents),
    notPricedCost: fromCents(notPricedCents),
    notPricedLines,
    otherCost: fromCents(otherCents),
    otherLines,
    markedUpCharges: prices.markedUpCharges,
    directCost: prices.directCost,
    cantPriceLines,
    partsNotPriced,
    quantitiesLockedAt: prices.quantitiesLockedAt,
    qtyDiffers,
  };
}

/** Finished before Draft, within one type. */
const runOrder = (a: RunTotals, b: RunTotals) =>
  a.typeLabel.localeCompare(b.typeLabel) ||
  (a.status === b.status ? 0 : a.status === "committed" ? -1 : 1);

export function buildTakeoffExport(
  source: TakeoffExportSource
): TakeoffExportDoc {
  const bySheet: TakeoffExportRow[] = [];

  for (const sheet of source.sheets) {
    const where = {
      planFile: sheet.planFile,
      page: sheet.page,
      sheet: sheet.number ?? "",
      sheetTitle: sheet.title,
    };
    const counts = source.counts
      .filter(c => c.sheetId === sheet.sheetId && c.count > 0)
      .sort(byName);
    for (const count of counts) {
      bySheet.push({
        ...where,
        kind: "Count",
        item: count.name,
        status: "",
        unit: "each",
        quantity: count.count,
        tracedFeet: null,
        typedFeet: null,
        verticalFeet: null,
        extraFeet: null,
        makeupFeet: null,
        wireFeet: null,
        groundFeet: null,
        note: "",
        pin: count.pin ?? "",
      });
    }
    const runs = source.runs
      .filter(r => r.sheetId === sheet.sheetId && r.runCount > 0)
      .sort(runOrder);
    for (const runs_ of runs) bySheet.push(runRow(runs_, where));
  }

  // ── Whole bid: sums of the sheet inputs, keyed across sheets ───────────────
  const allSheets = {
    planFile: "",
    page: null,
    sheet: "All sheets",
    sheetTitle: "",
  };
  const countTotals = new Map<
    string,
    { name: string; count: number; pin: string | null }
  >();
  for (const count of source.counts) {
    const total = countTotals.get(count.key) ?? {
      name: count.name,
      count: 0,
      pin: count.pin,
    };
    total.count += count.count;
    countTotals.set(count.key, total);
  }
  const runTotals = new Map<string, RunTotals>();
  for (const runs of source.runs) {
    const key = `${runs.key}|${runs.status}`;
    const total = runTotals.get(key) ?? {
      key: runs.key,
      typeLabel: runs.typeLabel,
      pathType: runs.pathType,
      status: runs.status,
      runCount: 0,
      totalFeet: 0,
      verticalFeet: 0,
      typedFeet: 0,
      extraFeet: 0,
      makeupFeet: 0,
      wireFeet: 0,
      groundFeet: 0,
      unmeasurableCount: 0,
      branchCount: 0,
      unansweredCount: 0,
      endsNotCountedCount: 0,
      noExtraCount: 0,
      markDropCount: 0,
      markDropFeet: 0,
    };
    total.runCount += runs.runCount;
    total.endsNotCountedCount += runs.endsNotCountedCount;
    total.totalFeet += runs.totalFeet;
    total.verticalFeet += runs.verticalFeet;
    total.typedFeet += runs.typedFeet;
    total.extraFeet += runs.extraFeet;
    total.makeupFeet += runs.makeupFeet;
    total.noExtraCount += runs.noExtraCount;
    total.markDropCount += runs.markDropCount;
    total.markDropFeet += runs.markDropFeet;
    total.wireFeet += runs.wireFeet;
    total.groundFeet += runs.groundFeet;
    total.unmeasurableCount += runs.unmeasurableCount;
    total.branchCount += runs.branchCount;
    total.unansweredCount += runs.unansweredCount;
    runTotals.set(key, total);
  }

  const keyed: {
    key: string;
    status: RunStatus | null;
    row: TakeoffExportRow;
  }[] = [
    ...Array.from(countTotals.entries())
      .map(([key, count]) => ({ key, ...count }))
      .filter(c => c.count > 0)
      .sort(byName)
      .map(count => ({
        key: count.key,
        status: null,
        row: {
          ...allSheets,
          kind: "Count",
          item: count.name,
          status: "",
          unit: "each",
          quantity: count.count,
          tracedFeet: null,
          typedFeet: null,
          verticalFeet: null,
          extraFeet: null,
          makeupFeet: null,
          wireFeet: null,
          groundFeet: null,
          note: "",
          pin: count.pin ?? "",
        } satisfies TakeoffExportRow,
      })),
    ...Array.from(runTotals.values())
      .filter(r => r.runCount > 0)
      .sort(runOrder)
      .map(runs => ({
        key: runs.key,
        status: runs.status,
        row: runRow(runs, allSheets),
      })),
  ];
  const prices = source.prices ? applyPrices(keyed, source.prices) : null;
  const wholeBid = keyed.map(k => k.row);

  // ── Notes: what the numbers mean, and what is not in them ──────────────────
  const notes: string[] = [
    "Run Quantity is raceway or cable to buy, in feet: Traced ft plus Typed ft plus Vertical ft (the drops and rises at run ends) plus Extra ft, plus Makeup ft on a cable. Typed ft is a flat length the estimator typed, usually on a sheet with no usable scale; it is not measured off the drawing. Wire ft is insulated conductors across every circuit; Ground ft is bare or green ground. A cable's conductors are inside its jacket, so a cable run has no Wire or Ground ft.",
    // Until 2026-09-27 this said the run totals count Finished runs only and
    // read lower while a run is a Draft. They now count what the bid prices.
    "Status: Finished runs are done; Draft runs are still being traced. The bid prices both, and so do the run totals on the Plans screen.",
    // Until 2026-09-29 this said "No extra is included". Extra and makeup
    // arrived then (held-migrations plan § 1); this says what they are.
    "Extra ft is added material — conduit extra on the run length only, cable extra on the run length and drops. Wire ft and Ground ft include the wire extra and the makeup (the tail left at each box and panel). Extra is material only: the bid puts no install hours on it. A row noted 'No extra set' carries none.",
    "Fittings counted from the runs (couplings, connectors, straps, elbows) are not in this file. They are on the Materials list.",
    "Runs the app suggested and nobody accepted are not included.",
  ];
  if (source.untypedRunCount > 0) {
    notes.push(
      `${plural(source.untypedRunCount, "traced run has", "traced runs have")} no run type, so ${
        source.untypedRunCount === 1 ? "it is" : "they are"
      } not in this file. Give ${
        source.untypedRunCount === 1 ? "it" : "them"
      } a type on the Takeoff screen.`
    );
  }
  if (bySheet.length === 0) {
    notes.unshift("Nothing has been counted or traced on this bid yet.");
  }
  if (prices) {
    notes.push(
      "Prices are COSTS, as the bid's Cost column shows them: material and labor, before material markup, overhead, profit and sales tax. This file is internal — do not send it to a customer or a supplier.",
      "Prices are on the Whole bid rows only. A count's Line cost is its bid line; a run type's is every bid line from that type added together — pipe or cable, wire, ground, and the fittings the bid counts for it — so a run type has no single Unit cost.",
      "A blank cost is not $0. The Price status says why: Not priced (nobody has priced it on the bid), Can't price (the bid cannot work it out), Not on bid (counted or traced but never sent), or On the Finished row (a type's Draft and Finished footage share one set of bid lines)."
    );
    if (prices.qtyDiffers || prices.quantitiesLockedAt)
      notes.push(
        `The bid's quantities are locked${
          prices.quantitiesLockedAt
            ? ` (since ${prices.quantitiesLockedAt.toISOString().slice(0, 10)})`
            : ""
        }: Qty on bid is what the bid prices, and can differ from the marks counted now.`
      );
  }

  return {
    bidName: source.bidName,
    preparedOn: source.preparedOn,
    bySheet,
    wholeBid,
    notes,
    prices,
  };
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

const HEADER = [
  "Plan file",
  "Page",
  "Sheet",
  "Sheet title",
  "Kind",
  "Item",
  "Status",
  "Unit",
  "Quantity",
  "Traced ft",
  "Typed ft",
  "Vertical ft",
  "Extra ft",
  "Makeup ft",
  "Wire ft",
  "Ground ft",
  "Note",
] as const;

/**
 * Pin plan decision 11: "Pin" is the LAST column of each table — after the
 * price columns where there are any — so a spreadsheet built on the file's
 * existing column order keeps working.
 */
const PIN_HEADER = "Pin";

const blankIfNull = (value: number | null) => (value === null ? "" : value);

function rowCells(row: TakeoffExportRow): (string | number)[] {
  return [
    row.planFile,
    blankIfNull(row.page),
    row.sheet,
    row.sheetTitle,
    row.kind,
    row.item,
    row.status,
    row.unit,
    blankIfNull(row.quantity),
    blankIfNull(row.tracedFeet),
    blankIfNull(row.typedFeet),
    blankIfNull(row.verticalFeet),
    blankIfNull(row.extraFeet),
    blankIfNull(row.makeupFeet),
    blankIfNull(row.wireFeet),
    blankIfNull(row.groundFeet),
    row.note,
  ];
}

/**
 * Two tables with the same columns — by sheet, then the whole bid — so either
 * can be selected and pivoted on its own, then the notes.
 *
 * With prices, the Whole bid table gains its price columns AT THE END, so
 * every quantity column stays where a spreadsheet built on the plain file
 * expects it, and a Prices block ties the cells to the bid's Direct cost.
 * Without prices the file is byte-for-byte the quantities-only file
 * (server/takeoffExport.test.ts, T8).
 */
export function takeoffExportCsv(doc: TakeoffExportDoc): string {
  const p = doc.prices;
  if (!p) {
    return csvDocument([
      ["Takeoff", doc.bidName],
      ["Prepared", doc.preparedOn.toISOString().slice(0, 10)],
      ["Quantities only — no pricing"],
      "",
      ["By sheet"],
      [...HEADER, PIN_HEADER],
      ...doc.bySheet.map(row => [...rowCells(row), row.pin]),
      "",
      ["Whole bid"],
      [...HEADER, PIN_HEADER],
      ...doc.wholeBid.map(row => [...rowCells(row), row.pin]),
      "",
      ["Notes"],
      ...doc.notes.map(note => [note]),
    ]);
  }
  const withQty = p.qtyDiffers || p.quantitiesLockedAt !== null;
  const priceHeader = [
    "Price status",
    ...(withQty ? ["Qty on bid"] : []),
    "Unit cost",
    "Line cost",
  ];
  const priceCells = (row: TakeoffExportRow): (string | number)[] => {
    const price = row.price;
    return [
      price?.status ?? "",
      ...(withQty ? [blankIfNull(price?.qtyOnBid ?? null)] : []),
      blankIfNull(price?.unitCost ?? null),
      blankIfNull(price?.lineCost ?? null),
    ];
  };
  const footer: (string | number)[][] = [
    ["Priced rows above, added up", p.pricedRows],
  ];
  if (p.notPricedLines > 0)
    footer.push([
      `Lines marked Not priced, as the bid counts them so far (${plural(p.notPricedLines, "line", "lines")})`,
      p.notPricedCost,
    ]);
  footer.push([
    `Other lines on the bid, not from the plans (${plural(p.otherLines, "line", "lines")})`,
    p.otherCost,
  ]);
  if (p.markedUpCharges !== 0)
    footer.push(["Marked-up charges, at cost", p.markedUpCharges]);
  footer.push(["Direct cost — the same figure as on the bid", p.directCost]);
  if (p.cantPriceLines > 0)
    footer.push([
      `${plural(p.cantPriceLines, "line", "lines")} the bid cannot price — in no figure here, and not in the bid's either`,
    ]);
  if (p.partsNotPriced > 0)
    footer.push([
      `${plural(p.partsNotPriced, "part", "parts")} inside priced lines have no price — the costs above are short by them`,
    ]);
  return csvDocument([
    ["Takeoff", doc.bidName],
    ["Prepared", doc.preparedOn.toISOString().slice(0, 10)],
    [
      "With prices — COSTS, before markup, overhead, profit and tax. Internal: do not send to a customer or supplier.",
    ],
    "",
    ["By sheet"],
    [...HEADER, PIN_HEADER],
    ...doc.bySheet.map(row => [...rowCells(row), row.pin]),
    "",
    ["Whole bid"],
    [...HEADER, ...priceHeader, PIN_HEADER],
    ...doc.wholeBid.map(row => [...rowCells(row), ...priceCells(row), row.pin]),
    "",
    ["Prices"],
    ...footer,
    "",
    ["Notes"],
    ...doc.notes.map(note => [note]),
  ]);
}

/**
 * `<bid>-takeoff-<date>.csv`, the same shape as the materials list's name —
 * `<bid>-takeoff-with-prices-<date>.csv` when it carries costs, so the name
 * says which file it is before anybody opens or forwards it.
 */
export function takeoffExportFilename(doc: TakeoffExportDoc): string {
  const slug =
    doc.bidName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bid";
  const what = doc.prices ? "takeoff-with-prices" : "takeoff";
  return `${slug}-${what}-${doc.preparedOn.toISOString().slice(0, 10)}.csv`;
}
