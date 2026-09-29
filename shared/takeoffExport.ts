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
 * default — not as columns that appear because a builder was copied. There is
 * no field below a price could go in.
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
};

export type TakeoffExportDoc = {
  bidName: string;
  preparedOn: Date;
  bySheet: TakeoffExportRow[];
  wholeBid: TakeoffExportRow[];
  notes: string[];
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
}): string {
  const parts: string[] = [];
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
  const hasFeet = measured > 0;
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
  };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

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
  const countTotals = new Map<string, { name: string; count: number }>();
  for (const count of source.counts) {
    const total = countTotals.get(count.key) ?? { name: count.name, count: 0 };
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
    };
    total.runCount += runs.runCount;
    total.endsNotCountedCount += runs.endsNotCountedCount;
    total.totalFeet += runs.totalFeet;
    total.verticalFeet += runs.verticalFeet;
    total.typedFeet += runs.typedFeet;
    total.extraFeet += runs.extraFeet;
    total.makeupFeet += runs.makeupFeet;
    total.noExtraCount += runs.noExtraCount;
    total.wireFeet += runs.wireFeet;
    total.groundFeet += runs.groundFeet;
    total.unmeasurableCount += runs.unmeasurableCount;
    total.branchCount += runs.branchCount;
    total.unansweredCount += runs.unansweredCount;
    runTotals.set(key, total);
  }

  const wholeBid: TakeoffExportRow[] = [
    ...Array.from(countTotals.values())
      .filter(c => c.count > 0)
      .sort(byName)
      .map(
        (count): TakeoffExportRow => ({
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
        })
      ),
    ...Array.from(runTotals.values())
      .filter(r => r.runCount > 0)
      .sort(runOrder)
      .map(runs => runRow(runs, allSheets)),
  ];

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

  return {
    bidName: source.bidName,
    preparedOn: source.preparedOn,
    bySheet,
    wholeBid,
    notes,
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
 */
export function takeoffExportCsv(doc: TakeoffExportDoc): string {
  return csvDocument([
    ["Takeoff", doc.bidName],
    ["Prepared", doc.preparedOn.toISOString().slice(0, 10)],
    ["Quantities only — no pricing"],
    "",
    ["By sheet"],
    [...HEADER],
    ...doc.bySheet.map(rowCells),
    "",
    ["Whole bid"],
    [...HEADER],
    ...doc.wholeBid.map(rowCells),
    "",
    ["Notes"],
    ...doc.notes.map(note => [note]),
  ]);
}

/** `<bid>-takeoff-<date>.csv`, the same shape as the materials list's name. */
export function takeoffExportFilename(doc: TakeoffExportDoc): string {
  const slug =
    doc.bidName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bid";
  return `${slug}-takeoff-${doc.preparedOn.toISOString().slice(0, 10)}.csv`;
}
