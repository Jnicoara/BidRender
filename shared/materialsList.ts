/**
 * The materials list a supplier gets: what to quote, and how much of it.
 *
 * ── This document has no prices, and cannot be given any ─────────────────────
 * Not "prices are hidden here" — there is nowhere to put one. `MaterialsEntry`
 * has a name, a unit and a quantity, and no fourth field. Every function below
 * builds that type, the server procedure selects no cost column to fill it
 * from, and both exporters render it. A price cannot leak into a supplier list
 * by someone forgetting a flag, because there is no flag: it would take a new
 * field, on a type whose whole purpose is not having one.
 *
 * That matters more than it sounds. The thing being sent out is the
 * contractor's material take — their read of the drawing, which is most of the
 * skill in estimating. What must never travel with it is what they PAY, what
 * they charge, or what they add on top. A supplier who can see the contractor's
 * costs and margin is negotiating with the contractor's hand face up, and the
 * proposal document — which does carry money, deliberately — must stay a
 * different document with a different audience. Sharing a builder between them
 * is how a markup ends up on a quote request, so they do not share one.
 *
 * ── Counted and measured are kept apart ──────────────────────────────────────
 * Stamps are counted (12 receptacles) and traced runs are measured (340 ft of
 * raceway). `takeoffCounts.ts` already separates them for the on-screen list,
 * and this keeps that separation for the same reason: a number without its unit
 * is how a footage gets ordered as a piece count.
 *
 * There is a second reason here. A stamp resolves to real materials, because
 * the assembly behind it names them. A traced run reaches this list as a
 * FOOTAGE TOTAL — all conduit together, all cable together, all wire together —
 * because that is what `totalQuantities` returns, so there is no specification
 * attached to any one number by the time it arrives.
 *
 * CORRECTED 2026-09-19. This paragraph used to say the app "does not know
 * whether that path is 1/2-inch EMT or 2-inch rigid". That stopped being true
 * when run types shipped: a type names a raceway material, a conductor and a
 * conductor count, and a run carries its type. What is actually missing is that
 * nothing carries the type THROUGH to this list — a different and much smaller
 * problem than the one the comment described, and the sort of stale assertion
 * CLAUDE.md warns is worse than no comment, because the next reader takes it as
 * a reason not to try.
 *
 * Itemising by run type is real work and is not scheduled here: a run may carry
 * no type at all (traced before types existed, or its type retired), and a type
 * may itself still be unspecified — `takeoffRunTypesRouter` reports exactly that
 * as `needsSpecification`. Both cases have to read as themselves rather than
 * quietly joining a total. Until then the footage is reported as footage.
 *
 * ── Unmeasurable runs are reported, never dropped ────────────────────────────
 * A run on a sheet with no scale contributes no footage. It is counted into
 * `notes` rather than skipped, because a list that silently omits work reads as
 * complete when it is not — and the reader is a supplier who cannot tell.
 */

import { csvRow } from "./csvWrite";
import { renamedTo } from "./renamedMaterials";

/** How a material is bought. Mirrors MATERIAL_UNITS_OF_SALE. */
export type MaterialUnit = "each" | "foot" | "box";

/**
 * One orderable line.
 *
 * Three fields, and the omission is the design: see the header. `sources` is
 * provenance for the estimator reading their own list — it is what lets them
 * see that 48 connectors came from two different assemblies — and carries only
 * assembly names, never quantities of money.
 */
export type MaterialsEntry = {
  name: string;
  unit: MaterialUnit;
  qty: number;
  /** Shelf the material sits on, for grouping. Null if it has none. */
  category: string | null;
  /** Which assemblies contributed, by name, in first-seen order. */
  sources: string[];
};

/** Footage from traced runs, which name no material. See the header. */
export type MeasuredEntry = {
  /** "Conduit", "Cable", "Wire" — what was measured, not what to buy. */
  label: string;
  feet: number;
  /** Why this is not an orderable line yet. Shown verbatim in both exports. */
  note: string;
};

/**
 * A count with no assembly behind it — "A1 luminaire: 38" — for the supplier
 * to price as it stands (legend plan § 8a).
 *
 * Its own kind of row, kept apart from `entries`, because nothing in the app
 * knows what it is made of: it is a thing the supplier quotes, not a part the
 * app itemised. Like every row here it has no field a price could go in, so it
 * can never read as $0 — it reads as "the supplier prices this".
 */
export type ForQuoteEntry = {
  /** The count's name, as the estimator gave it on this job. */
  name: string;
  qty: number;
  /** Always each: a count is a number of things. */
  unit: "each";
};

/** The whole document, as both exporters consume it. */
export type MaterialsListDoc = {
  bidName: string;
  /** Job address, when the bid has one. Suppliers deliver to a place. */
  jobAddress: string | null;
  preparedOn: Date;
  entries: MaterialsEntry[];
  measured: MeasuredEntry[];
  /** Counts with no assembly, for the supplier to price. */
  forQuote: ForQuoteEntry[];
  /** Anything the reader must know to read the list correctly. */
  notes: string[];
};

/** A material as it sits inside an assembly — quantity per one assembly. */
export type AssemblyMaterialQty = {
  name: string;
  unit: MaterialUnit;
  category: string | null;
  /** How many of this material one of the assembly needs. */
  qty: number;
  /**
   * This line is the branch wire to the next device (D18).
   *
   * The ONLY thing the per-job whip dial scales. A building laid out tighter or
   * looser changes the cable between devices; it does not change how many boxes
   * or plates you buy, and it never touches measured footage.
   */
  isBranchWhip?: boolean;
};

/** One assembly appearing on the bid, and how many of it. */
export type CountedAssemblySource = {
  /** Assembly name as snapshotted — never re-read from the library. */
  name: string;
  /** How many. A stamp count, or a line item's qty. */
  count: number;
  materials: AssemblyMaterialQty[];
};

/**
 * Round a quantity for display without pretending to a precision it lacks.
 *
 * Two decimals, and trailing zeros dropped, so 12 stays "12" rather than
 * "12.00" — a supplier reading "12.00 each" wonders what the hundredths mean.
 */
export function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * The quantity a supplier is asked for: a piece or a box is bought WHOLE,
 * rounded UP; footage keeps its two decimals.
 *
 * Owner, 2026-09-29 (starter assemblies plan Q5): an assembly may carry a
 * fractional part — a quarter tube of firestop per penetration — but the
 * purchase list must never ask for 0.25 of an item. The fraction is kept
 * through the SUM and rounded once at the end, so four penetrations order one
 * tube, not four.
 *
 * Rounded to four places before the ceiling, because a float sum of 0.1 three
 * times is 0.30000000000000004 and 2 pieces summed that way would otherwise
 * order 3.
 *
 * This is whole PIECES, not whole PACKS: the catalog has no pack size yet
 * (references/material-markup.md D3). When it does, rounding to a pack
 * belongs here too — see todo.md.
 */
export function orderQty(unit: MaterialUnit, value: number): number {
  if (unit === "foot") return roundQty(value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(Math.round(value * 10_000) / 10_000);
}

/**
 * Roll assemblies into one list of materials.
 *
 * Keyed by name + unit, not by material id. Two rows that are the same material
 * to a person are the same line on a quote request, and the id is not in the
 * document anyway — a supplier has no use for it. Including the unit in the key
 * is a safeguard rather than an expectation: it means a name that somehow
 * carries two units becomes two lines instead of one line whose quantity is the
 * sum of feet and pieces.
 *
 * Order is first appearance, so the list does not reshuffle as more marks land.
 */
export function aggregateMaterials(
  sources: CountedAssemblySource[],
  /**
   * The bid's whip dial, as a signed fraction — how much tighter or looser this
   * building is laid out than the library assumes.
   *
   * Optional and defaulting to no adjustment, so every existing caller is
   * unchanged. It reaches lines marked `isBranchWhip` and nothing else: the
   * boxes, plates and devices are counted, not estimated, and measured footage
   * is handled by `measuredEntries` which this never touches.
   */
  whipAdjustPct: number = 0
): MaterialsEntry[] {
  const byKey = new Map<string, MaterialsEntry>();
  const adjust =
    Number.isFinite(whipAdjustPct) && whipAdjustPct !== 0 ? whipAdjustPct : 0;

  for (const source of sources) {
    // A zero or negative count contributes nothing rather than subtracting.
    const count =
      Number.isFinite(source.count) && source.count > 0 ? source.count : 0;
    if (count === 0) continue;

    for (const material of source.materials) {
      const raw =
        Number.isFinite(material.qty) && material.qty > 0 ? material.qty : 0;
      /*
        The dial, applied to the branch wire only, and floored at zero.

        Below -100% is not a tighter building — it is wire subtracted from
        somebody else's count. Same floor `totalBranchWireFeet` applies, for the
        same reason, because these two must not disagree about the same cable.
      */
      const per =
        material.isBranchWhip && adjust !== 0
          ? Math.max(0, raw * (1 + adjust))
          : raw;
      if (per === 0) continue;

      // Keyed by the CURRENT name of the part: a company's own copy keeps the
      // name it was forked under (the seed never renames a fork), so after a
      // catalog rename "12-2 NM-B" and the shipped "12/2 NM-B Copper" are one
      // product and must be one line on the supplier's list, not two halves
      // of the order (rename audit 2026-10-07, item 10).
      const current = renamedTo(material.name) ?? material.name;
      const key = `${current.trim().toLowerCase()} ${material.unit}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.qty += per * count;
        if (!existing.sources.includes(source.name)) {
          existing.sources.push(source.name);
        }
        continue;
      }
      byKey.set(key, {
        name: material.name,
        unit: material.unit,
        category: material.category,
        qty: per * count,
        sources: [source.name],
      });
    }
  }

  return Array.from(byKey.values()).map(entry => ({
    ...entry,
    qty: orderQty(entry.unit, entry.qty),
  }));
}

/** Footage totals, as the document's measured section. */
export function measuredEntries(totals: {
  /*
    BOUGHT footage — flat, vertical, extra and (wire, cable) makeup. This list
    is what somebody orders from, so it is the bought figure, and the notes
    say what is in it. Renamed from `conduitFeet` / `cableFeet` / `wireFeet`
    on 2026-09-29 so the meaning change could not pass unnoticed.
  */
  conduitBoughtFeet: number;
  cableBoughtFeet: number;
  wireBoughtFeet: number;
  /** The bare share OF wireBoughtFeet. */
  wireGroundBoughtFeet: number;
}): MeasuredEntry[] {
  const out: MeasuredEntry[] = [];
  if (totals.conduitBoughtFeet > 0) {
    out.push({
      label: "Conduit",
      feet: roundQty(totals.conduitBoughtFeet),
      note: "Every conduit type on this job combined — the run lengths, their drops, and any extra set. Not broken out by type or trade size.",
    });
  }
  if (totals.cableBoughtFeet > 0) {
    out.push({
      label: "Cable",
      feet: roundQty(totals.cableBoughtFeet),
      note: "Every cable type on this job combined — the run lengths, their drops, makeup and any extra set. Not broken out by type or size.",
    });
  }
  /*
    ── Insulated and bare are two lines, because they are two purchases ──────
    Bare copper cannot be ordered as THHN. A single wire figure answers "how
    much" and cannot answer "how much of WHICH", and a supplier quoting from
    one number has to guess — which is the whole reason the ground got its own
    column on 2026-09-20.

    The split is a SUBTRACTION, not an addition: `wireGroundFeet` is a share of
    `wireFeet`, so the insulated line is the remainder. Pushing both from the
    same total is what keeps them summing to what the run panel shows.
  */
  const bare = roundQty(Math.max(0, totals.wireGroundBoughtFeet));
  const insulated = roundQty(Math.max(0, totals.wireBoughtFeet - bare));

  if (insulated > 0) {
    out.push({
      label: "Wire, insulated",
      feet: insulated,
      note: "All insulated conductors, all circuits, every type combined. Not broken out by gauge or insulation.",
    });
  }
  if (bare > 0) {
    out.push({
      label: "Wire, bare ground",
      feet: bare,
      note: "Equipment grounds on traced conduit runs. A cable's ground is inside the cable and is already in the Cable figure. Not broken out by gauge.",
    });
  }
  return out;
}

/**
 * The section's heading and the sentence under it — ONE copy for the dialog,
 * the CSV and the PDF, so a supplier reading any of the three is told the same
 * thing: these were counted, not itemised, and the price is theirs to give.
 */
export const SUPPLIER_TO_PRICE_HEADING = "Supplier to price";
export const SUPPLIER_TO_PRICE_NOTE =
  "Counted on the drawings, with no parts list. Please quote as a package.";

/** Human unit label — "ft" reads better than "foot" against a number. */
export function unitLabel(unit: MaterialUnit): string {
  return unit === "foot" ? "ft" : unit === "box" ? "box" : "ea";
}

/** Is there anything at all to send? An empty list is not worth a file. */
export function isEmptyList(doc: MaterialsListDoc): boolean {
  return (
    doc.entries.length === 0 &&
    doc.measured.length === 0 &&
    doc.forQuote.length === 0
  );
}

/** Total distinct orderable lines — what the button badge counts. */
export function lineCount(doc: MaterialsListDoc): number {
  return doc.entries.length + doc.measured.length + doc.forQuote.length;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Quoting moved to shared/csvWrite.ts once the accounting export needed the
 * same rules. Two copies of RFC 4180 quoting is how one of them ends up
 * handling `#10 bare CU, stranded` and the other splitting it.
 */

/**
 * The document as CSV, for a supplier to paste into their quoting system.
 *
 * Columns are Item, Unit, Quantity, Category, From — and there is deliberately
 * no sixth. Anyone adding a price column here has to add a price field to
 * `MaterialsEntry` first, which is the point at which they should stop.
 *
 * \r\n line endings: Excel is the overwhelmingly likely reader, and it is the
 * one that cares.
 */
export function toCsv(doc: MaterialsListDoc): string {
  const rows: string[] = [];

  rows.push(csvRow(["Materials list", doc.bidName]));
  if (doc.jobAddress) rows.push(csvRow(["Job address", doc.jobAddress]));
  rows.push(csvRow(["Prepared", doc.preparedOn.toISOString().slice(0, 10)]));
  rows.push(csvRow(["Quantities only — no pricing"]));
  rows.push("");

  rows.push(csvRow(["Item", "Unit", "Quantity", "Category", "From"]));
  for (const entry of doc.entries) {
    rows.push(
      csvRow([
        entry.name,
        unitLabel(entry.unit),
        entry.qty,
        entry.category ?? "",
        entry.sources.join("; "),
      ])
    );
  }

  if (doc.measured.length > 0) {
    rows.push("");
    rows.push(csvRow(["Measured from the drawing"]));
    rows.push(csvRow(["Item", "Unit", "Quantity", "Note"]));
    for (const entry of doc.measured) {
      rows.push(csvRow([entry.label, "ft", entry.feet, entry.note]));
    }
  }

  if (doc.forQuote.length > 0) {
    rows.push("");
    rows.push(csvRow([SUPPLIER_TO_PRICE_HEADING]));
    rows.push(csvRow(["Item", "Unit", "Quantity", "Note"]));
    for (const entry of doc.forQuote) {
      rows.push(
        csvRow([
          entry.name,
          unitLabel(entry.unit),
          entry.qty,
          SUPPLIER_TO_PRICE_NOTE,
        ])
      );
    }
  }

  if (doc.notes.length > 0) {
    rows.push("");
    rows.push(csvRow(["Notes"]));
    for (const note of doc.notes) rows.push(csvRow([note]));
  }

  return rows.join("\r\n");
}

/**
 * A filename a contractor can find again in a downloads folder six weeks later.
 *
 * The bid name leads, because that is what they will search for, and
 * "materials-list" follows so it is distinguishable at a glance from the
 * proposal for the same job.
 */
export function exportFilename(doc: MaterialsListDoc, ext: string): string {
  const slug =
    doc.bidName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bid";
  return `${slug}-materials-list-${doc.preparedOn.toISOString().slice(0, 10)}.${ext}`;
}
