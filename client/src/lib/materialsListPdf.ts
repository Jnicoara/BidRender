/**
 * The materials list as a PDF a supplier can print, mark up and quote against.
 *
 * ── Why this is not the proposal renderer ────────────────────────────────────
 * `components/proposal/` builds the customer document, and that one carries
 * money on purpose: prices, totals, a validity date. Reusing it here with the
 * money sections switched off would leave the contractor's cost and margin one
 * forgotten flag away from the people they buy from. This builder cannot make
 * that mistake, because it takes `MaterialsListDoc` — a type with no field a
 * price can live in — and never sees a cost at all.
 *
 * ── Deliberately plain ───────────────────────────────────────────────────────
 * No letterhead, no branding block, no cover page. A quote request is a working
 * document: a supplier's counter staff read it, key it in and fax it back with
 * numbers written on it. What it needs is a wide item column, quantities that
 * line up down the right, and enough white space to write a price beside each
 * row — which is exactly the column this document does not print.
 */
import { jsPDF } from "jspdf";
import {
  SUPPLIER_TO_PRICE_HEADING,
  SUPPLIER_TO_PRICE_NOTE,
  isEmptyList,
  unitLabel,
  type MaterialsListDoc,
} from "@shared/materialsList";

const INK = [24, 24, 24] as [number, number, number];
const MUTED = [110, 110, 110] as [number, number, number];
const RULE = [205, 205, 205] as [number, number, number];
const BAND = [245, 245, 245] as [number, number, number];

/** Build the document. Returned rather than saved, so callers can preview it. */
export function buildMaterialsListPdf(doc: MaterialsListDoc): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const PW = pdf.internal.pageSize.getWidth();
  const PH = pdf.internal.pageSize.getHeight();
  const ML = 54;
  const MR = 54;
  const CW = PW - ML - MR;

  let y = 0;
  let page = 1;

  const dateText = doc.preparedOn.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function footer() {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    // Restated on every page because pages get separated on a counter.
    pdf.text("Quantities only — no pricing", ML, PH - 30);
    pdf.text(`Page ${page}`, PW - MR, PH - 30, { align: "right" });
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.5);
    pdf.line(ML, PH - 42, PW - MR, PH - 42);
  }

  function newPage() {
    footer();
    pdf.addPage();
    page++;
    y = 58;
  }

  function room(needed: number) {
    if (y + needed > PH - 58) newPage();
  }

  // ── Heading ────────────────────────────────────────────────────────────────
  y = 58;
  pdf.setFontSize(17);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...INK);
  pdf.text("Materials list", ML, y);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.text(dateText, PW - MR, y, { align: "right" });

  y += 18;
  pdf.setFontSize(11);
  pdf.setTextColor(...INK);
  pdf.text(doc.bidName, ML, y);

  if (doc.jobAddress) {
    y += 13;
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    pdf.text(doc.jobAddress, ML, y);
  }

  // Said once here in full, and again in the footer of every page. A supplier
  // must never be left wondering whether a column was cropped off.
  y += 16;
  pdf.setFontSize(8.5);
  pdf.setTextColor(...MUTED);
  pdf.text(
    "Quantities only. This document carries no pricing — it is a request for a quote.",
    ML,
    y
  );

  y += 12;
  pdf.setDrawColor(...INK);
  pdf.setLineWidth(1);
  pdf.line(ML, y, PW - MR, y);
  y += 20;

  // ── Columns ────────────────────────────────────────────────────────────────
  // Item takes everything left over: a material name is long and a supplier
  // needs to read it without truncation. Qty and Unit are narrow and right-set
  // so the numbers form a column the eye can run down.
  const QTY_W = 62;
  const UNIT_W = 40;
  const ITEM_W = CW - QTY_W - UNIT_W;

  function tableHead(itemLabel: string) {
    room(26);
    pdf.setFillColor(...BAND);
    pdf.rect(ML, y - 11, CW, 17, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text(itemLabel.toUpperCase(), ML + 5, y);
    pdf.text("QTY", ML + ITEM_W + QTY_W - 5, y, { align: "right" });
    pdf.text("UNIT", ML + ITEM_W + QTY_W + 5, y);
    y += 18;
  }

  function row(name: string, qty: string, unit: string, sub?: string) {
    room(sub ? 26 : 17);
    pdf.setFontSize(9.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...INK);
    // Truncate rather than wrap: one row per item keeps the quantity column
    // readable, and a name long enough to wrap is long enough to be recognised
    // from its first sixty characters.
    const lines = pdf.splitTextToSize(name, ITEM_W - 10) as string[];
    pdf.text(lines[0], ML + 5, y);
    pdf.text(qty, ML + ITEM_W + QTY_W - 5, y, { align: "right" });
    pdf.setTextColor(...MUTED);
    pdf.text(unit, ML + ITEM_W + QTY_W + 5, y);

    if (sub) {
      y += 10;
      pdf.setFontSize(7.5);
      pdf.setTextColor(...MUTED);
      const subLines = pdf.splitTextToSize(sub, ITEM_W - 10) as string[];
      pdf.text(subLines[0], ML + 5, y);
    }

    y += 7;
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.4);
    pdf.line(ML, y, PW - MR, y);
    y += 11;
  }

  // ── Counted materials ──────────────────────────────────────────────────────
  if (doc.entries.length > 0) {
    tableHead("Item");
    for (const entry of doc.entries) {
      row(
        entry.name,
        String(entry.qty),
        unitLabel(entry.unit),
        entry.sources.length > 0 ? entry.sources.join(", ") : undefined
      );
    }
  }

  // ── Measured footage, visibly a different kind of line ─────────────────────
  if (doc.measured.length > 0) {
    room(50);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text("Measured from the drawing", ML, y);
    y += 6;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    y += 10;
    pdf.text(
      "Lengths taken off the plans. The specification is still to be confirmed.",
      ML,
      y
    );
    y += 16;
    tableHead("Measured");
    for (const entry of doc.measured) {
      row(entry.label, String(entry.feet), "ft", entry.note);
    }
  }

  // ── Counts with no parts list: the supplier's to price ────────────────────
  if (doc.forQuote.length > 0) {
    room(50);
    y += 10;
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text(SUPPLIER_TO_PRICE_HEADING, ML, y);
    y += 6;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    y += 10;
    pdf.text(SUPPLIER_TO_PRICE_NOTE, ML, y);
    y += 16;
    tableHead("Counted");
    for (const entry of doc.forQuote) {
      row(entry.name, String(entry.qty), unitLabel(entry.unit));
    }
  }

  if (isEmptyList(doc)) {
    pdf.setFontSize(10);
    pdf.setTextColor(...MUTED);
    pdf.text("Nothing has been taken off this bid yet.", ML, y);
    y += 20;
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (doc.notes.length > 0) {
    room(40);
    y += 12;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...INK);
    pdf.text("Notes", ML, y);
    y += 14;
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    for (const note of doc.notes) {
      const lines = pdf.splitTextToSize(`• ${note}`, CW) as string[];
      for (const line of lines) {
        room(12);
        pdf.text(line, ML, y);
        y += 11;
      }
      y += 3;
    }
  }

  footer();
  return pdf;
}
