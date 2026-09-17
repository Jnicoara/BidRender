/**
 * The proposal, drawn on paper.
 *
 * ── Three layouts, one document ──────────────────────────────────────────────
 * This component renders whatever `buildProposal` decided, in whichever of the
 * three looks the user picked. The split is strict and worth stating, because
 * it is what keeps the layouts safe to add to:
 *
 *   shared/proposal.ts   decides WHAT is on the page
 *   this file            decides how it looks
 *
 * A layout may not filter, reorder or invent content. It reads
 * `doc.visibleSections` — already resolved server-side — and draws it. That is
 * why a fourth layout is a styling exercise rather than a fresh chance to leak
 * the contractor's overhead percentage to their customer.
 *
 * ── Always paper, never the app's theme ──────────────────────────────────────
 * Deliberately hard-coded to a white sheet with dark ink, in both light and
 * dark mode. This is not an app screen that happens to be printable — it is a
 * preview of a physical page, and it has to look on screen exactly like what
 * comes out of the printer. Inheriting dark mode here would show an estimator a
 * document they never sent and hide contrast problems in the one they did.
 *
 * The only colour that moves is the accent, which is the user's.
 */
import { Fragment } from "react";
import type {
  ProposalDocument,
  ProposalLayout,
  ProposalSectionId,
} from "@shared/proposal";
import { money } from "@/lib/money";

const qty = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);

/** Ink colours. Fixed, because paper is fixed. */
const INK = "#141414";
const INK_SOFT = "#5a5a5a";
const INK_FAINT = "#8a8a8a";
const RULE = "#d8d8d8";

/**
 * What differs between the three, in one table.
 *
 * Kept as data rather than three copies of the JSX below so a change to the
 * document's CONTENT lands in all three at once. The temptation is to write
 * three components; that is how "Minimal" ends up missing the section somebody
 * added last month.
 */
const LAYOUT: Record<
  ProposalLayout,
  {
    headingFont: string;
    bodyFont: string;
    /** Accent band across the very top of the sheet. */
    topBand: number;
    sectionHeading: React.CSSProperties;
    /** Whether the total sits in a filled panel or on the open page. */
    totalPanel: "filled" | "outlined" | "bare";
    tableHeadRule: number;
  }
> = {
  classic: {
    headingFont: "'Georgia', 'Times New Roman', serif",
    bodyFont: "'Georgia', 'Times New Roman', serif",
    topBand: 0,
    sectionHeading: {
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      paddingBottom: 4,
      marginBottom: 10,
      borderBottom: `1.5px solid ${INK}`,
    },
    totalPanel: "outlined",
    tableHeadRule: 1,
  },
  modern: {
    headingFont: "'Space Grotesk', 'Helvetica Neue', sans-serif",
    bodyFont: "'Space Grotesk', 'Helvetica Neue', sans-serif",
    topBand: 10,
    sectionHeading: {
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      marginBottom: 12,
    },
    totalPanel: "filled",
    tableHeadRule: 0,
  },
  minimal: {
    headingFont: "'Helvetica Neue', Arial, sans-serif",
    bodyFont: "'Helvetica Neue', Arial, sans-serif",
    topBand: 0,
    sectionHeading: {
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: INK_FAINT,
      marginBottom: 10,
    },
    totalPanel: "bare",
    tableHeadRule: 0,
  },
};

/** A missing field prints as a bracketed prompt — never as blank space. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "#B45309",
        background: "rgba(245, 158, 11, 0.12)",
        border: "1px dashed rgba(180, 83, 9, 0.5)",
        borderRadius: 3,
        padding: "0 4px",
        fontStyle: "italic",
      }}
    >
      {children}
    </span>
  );
}

const isPlaceholder = (text: string) =>
  text.startsWith("[Add ") && text.endsWith("]");

/** Text that is either real content or a visible prompt for what belongs there. */
function Field({ text }: { text: string }) {
  if (!text) return null;
  return isPlaceholder(text) ? <Placeholder>{text}</Placeholder> : <>{text}</>;
}

export function ProposalSheet({
  doc,
  className,
}: {
  doc: ProposalDocument;
  className?: string;
}) {
  const L = LAYOUT[doc.layout];
  const accent = doc.accentColor;

  const heading = (text: string) => (
    <h2
      style={{
        ...L.sectionHeading,
        fontFamily: L.headingFont,
        // Classic rules its headings in the accent; Modern colours the text
        // itself; Minimal leaves them grey and lets the accent appear once.
        ...(doc.layout === "classic"
          ? { borderBottom: `1.5px solid ${accent}` }
          : {}),
        color:
          doc.layout === "modern" ? accent : (L.sectionHeading.color ?? INK),
      }}
    >
      {text}
    </h2>
  );

  const section = (id: ProposalSectionId) => {
    switch (id) {
      // ── Letterhead ─────────────────────────────────────────────────────────
      case "letterhead":
        return (
          <header
            key={id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 24,
              paddingBottom: 18,
              marginBottom: 22,
              borderBottom:
                doc.layout === "minimal"
                  ? `1px solid ${RULE}`
                  : `2px solid ${accent}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              {doc.letterhead.logoUrl ? (
                <img
                  src={doc.letterhead.logoUrl}
                  alt=""
                  style={{
                    maxHeight: 64,
                    maxWidth: 220,
                    objectFit: "contain",
                    marginBottom: 10,
                    display: "block",
                  }}
                />
              ) : (
                // A logo nobody has uploaded is drawn as an empty frame that
                // says so. Leaving the space blank would look like a design
                // choice, and would be sent as one.
                <div
                  style={{
                    width: 150,
                    height: 56,
                    marginBottom: 10,
                    border: "1px dashed rgba(180, 83, 9, 0.5)",
                    background: "rgba(245, 158, 11, 0.10)",
                    color: "#B45309",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: 6,
                  }}
                >
                  [Add your logo]
                </div>
              )}
              <div
                style={{
                  fontFamily: L.headingFont,
                  fontSize: doc.layout === "minimal" ? 20 : 24,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: INK,
                }}
              >
                <Field text={doc.letterhead.companyName} />
              </div>
              {doc.letterhead.licenseNumber && (
                <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4 }}>
                  {isPlaceholder(doc.letterhead.licenseNumber) ? (
                    <Placeholder>{doc.letterhead.licenseNumber}</Placeholder>
                  ) : (
                    <>License #{doc.letterhead.licenseNumber}</>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                textAlign: "right",
                fontSize: 11,
                color: INK_SOFT,
                lineHeight: 1.65,
                whiteSpace: "nowrap",
              }}
            >
              {doc.letterhead.addressLines.map((line, i) => (
                <div key={i}>
                  <Field text={line} />
                </div>
              ))}
              {doc.letterhead.phone && (
                <div>
                  <Field text={doc.letterhead.phone} />
                </div>
              )}
              {doc.letterhead.email && <div>{doc.letterhead.email}</div>}
              {doc.letterhead.website && <div>{doc.letterhead.website}</div>}
            </div>
          </header>
        );

      // ── Prepared for ───────────────────────────────────────────────────────
      case "preparedFor":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Prepared for")}
            <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>
              <Field text={doc.preparedFor.clientName} />
            </div>
            {doc.preparedFor.siteAddress.map((line, i) => (
              <div key={i} style={{ fontSize: 12, color: INK_SOFT }}>
                {line}
              </div>
            ))}
          </section>
        );

      // ── Project summary ────────────────────────────────────────────────────
      case "summary":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Project")}
            <div
              style={{
                fontFamily: L.headingFont,
                fontSize: 16,
                fontWeight: 700,
                color: INK,
                marginBottom: 6,
              }}
            >
              {doc.summary.projectName}
            </div>
            <div style={{ fontSize: 11, color: INK_SOFT }}>
              {doc.summary.dateLabel}
              {doc.summary.validUntilLabel && (
                <> · This price is good through {doc.summary.validUntilLabel}</>
              )}
            </div>
            {doc.summary.note && (
              <p
                style={{
                  fontSize: 12.5,
                  color: INK,
                  lineHeight: 1.6,
                  marginTop: 10,
                  whiteSpace: "pre-wrap",
                }}
              >
                {doc.summary.note}
              </p>
            )}
          </section>
        );

      // ── Scope of work ──────────────────────────────────────────────────────
      case "scope":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Scope of work")}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    background:
                      doc.layout === "modern" ? `${accent}22` : "transparent",
                    borderBottom: L.tableHeadRule
                      ? `${L.tableHeadRule}px solid ${INK}`
                      : `1px solid ${RULE}`,
                  }}
                >
                  <th
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      fontWeight: 600,
                      color: INK_SOFT,
                      fontSize: 10.5,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Included work
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "6px 8px",
                      fontWeight: 600,
                      color: INK_SOFT,
                      fontSize: 10.5,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      width: 70,
                    }}
                  >
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.scope.map(group => (
                  <Fragment key={group.label ?? "__loose__"}>
                    {group.label && (
                      <tr>
                        <td
                          colSpan={2}
                          style={{
                            padding: "10px 8px 4px",
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            color: doc.layout === "minimal" ? INK_SOFT : accent,
                          }}
                        >
                          {group.label}
                        </td>
                      </tr>
                    )}
                    {group.lines.map((line, i) => (
                      <tr
                        key={`${group.label ?? "loose"}-${i}`}
                        style={{ borderBottom: `1px solid ${RULE}` }}
                      >
                        <td style={{ padding: "5px 8px", color: INK }}>
                          {line.name}
                        </td>
                        <td
                          style={{
                            padding: "5px 8px",
                            textAlign: "right",
                            color: INK_SOFT,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {qty(line.qty)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {/*
              Quantities, never unit costs. What a material cost this contractor
              is a fact about their supplier relationships, and putting it on a
              client's desk turns a proposal into a line-by-line negotiation of
              somebody else's margin.
            */}
          </section>
        );

      // ── Includes / excludes ────────────────────────────────────────────────
      //
      // Two columns where there is room for them, because the pairing is the
      // point: a reader compares what is covered against what is not, and
      // stacking them turns that comparison into scrolling. The excludes carry
      // the accent rule, since they are the half that prevents the argument.
      case "inclusions": {
        const { includes, excludes } = doc.inclusions;
        const column = (
          heading: string,
          items: string[],
          emphasise: boolean
        ) =>
          items.length === 0 ? null : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: L.headingFont,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: emphasise ? accent : INK_SOFT,
                  borderBottom: `1px solid ${emphasise ? accent : INK_SOFT}55`,
                  paddingBottom: 3,
                  marginBottom: 6,
                }}
              >
                {heading}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {items.map((text, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 11,
                      color: INK,
                      lineHeight: 1.5,
                      marginBottom: 2,
                    }}
                  >
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          );

        return (
          <section key={id} style={{ marginBottom: 20 }}>
            {heading("Includes & excludes")}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              {column("Included", includes, false)}
              {column("Not included", excludes, true)}
            </div>
          </section>
        );
      }

      // ── Labor summary ──────────────────────────────────────────────────────
      case "laborSummary":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Labor")}
            <div style={{ fontSize: 12.5, color: INK }}>
              Estimated at{" "}
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {doc.laborHours.toLocaleString("en-US")} labor hours
              </strong>{" "}
              of licensed work
              {doc.mode === "scope-only"
                ? "."
                : ", included in the price below."}
            </div>
          </section>
        );

      // ── Price per unit ─────────────────────────────────────────────────────
      case "unitPricing":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Price per unit")}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <tbody>
                {doc.unitPricing.map(unit => (
                  <tr
                    key={unit.label}
                    style={{ borderBottom: `1px solid ${RULE}` }}
                  >
                    <td style={{ padding: "5px 8px", color: INK }}>
                      {unit.label}
                    </td>
                    <td
                      style={{
                        padding: "5px 8px",
                        textAlign: "right",
                        color: INK,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {money(unit.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );

      // ── Total investment ───────────────────────────────────────────────────
      case "investment": {
        const filled = L.totalPanel === "filled";
        const outlined = L.totalPanel === "outlined";
        const tax = doc.investment.salesTax;
        const expenses = doc.investment.expenses;
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {/*
              Subtotal and tax, ABOVE the total, and only when there is tax.
              Without a tax line the document keeps its original shape — one
              figure, everything inside it. With one, the customer has to be
              able to see the three numbers separately: sales tax is the line
              they are most likely to check, and a total with it folded in is
              a total nobody can verify.
            */}
            {/*
              Flat charges, each named. A permit is its own line so the customer
              can see what they are paying for — a lump called "Fees" invites
              exactly the question the itemisation exists to answer.
            */}
            {expenses && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    fontSize: 11.5,
                    color: INK_SOFT,
                    padding: "3px 0",
                  }}
                >
                  <span>Work</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(doc.investment.workTotal)}
                  </span>
                </div>
                {expenses.lines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      fontSize: 11.5,
                      color: INK_SOFT,
                      padding: "3px 0",
                    }}
                  >
                    <span>{line.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {money(line.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tax && (
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    fontSize: 11.5,
                    color: INK_SOFT,
                    padding: "3px 0",
                  }}
                >
                  <span>Subtotal</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(doc.investment.subtotal)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    fontSize: 11.5,
                    color: INK_SOFT,
                    padding: "3px 0",
                    borderBottom: `1px solid ${INK_SOFT}40`,
                  }}
                >
                  <span>
                    {tax.exempt ? (
                      <>
                        Sales tax — exempt
                        {tax.exemptReason ? ` (${tax.exemptReason})` : ""}
                      </>
                    ) : (
                      <>
                        Sales tax
                        {tax.ratePct !== null ? ` (${tax.ratePct}%)` : ""}
                        {/* The stack, itemised — what makes the rate checkable
                            rather than a number the customer has to accept. */}
                        {tax.components.length > 1 && (
                          <span style={{ color: INK_SOFT }}>
                            {" · "}
                            {tax.components
                              .map(c => `${c.label} ${c.ratePct}%`)
                              .join(" + ")}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {money(tax.amount)}
                  </span>
                </div>
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
                padding: filled || outlined ? "14px 16px" : "14px 0",
                background: filled ? `${accent}1F` : "transparent",
                border: outlined ? `2px solid ${accent}` : "none",
                borderTop:
                  L.totalPanel === "bare" ? `2px solid ${INK}` : undefined,
                borderRadius: filled ? 6 : 0,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: L.headingFont,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: INK,
                  }}
                >
                  Total investment
                </div>
                <div style={{ fontSize: 10.5, color: INK_SOFT, marginTop: 3 }}>
                  {/*
                    One sentence instead of an overhead line and a profit line.
                    Both are real costs of doing the work and both belong inside
                    the number; itemising them invites a conversation about which
                    of them the client would like removed.
                  */}
                  {doc.investment.includesIndirect
                    ? "Includes all materials, labor, equipment and overhead."
                    : "Includes all materials and labor."}
                  {tax && !tax.exempt ? " Sales tax included above." : ""}
                </div>
              </div>
              <div
                style={{
                  fontFamily: L.headingFont,
                  fontSize: doc.layout === "minimal" ? 26 : 30,
                  fontWeight: 700,
                  color: INK,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {money(doc.investment.total)}
              </div>
            </div>
          </section>
        );
      }

      // ── Terms ──────────────────────────────────────────────────────────────
      case "terms":
        return (
          <section key={id} style={{ marginBottom: 22 }}>
            {heading("Terms")}
            <p
              style={{
                fontSize: 11.5,
                color: INK_SOFT,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
              }}
            >
              {doc.terms}
            </p>
          </section>
        );

      // ── Acceptance ─────────────────────────────────────────────────────────
      case "acceptance":
        return (
          <section key={id} style={{ marginTop: 30 }}>
            {heading("Acceptance")}
            <p style={{ fontSize: 11.5, color: INK_SOFT, marginBottom: 26 }}>
              Signing below authorises the work described above at the price
              stated.
            </p>
            <div style={{ display: "flex", gap: 28 }}>
              <div
                style={{
                  flex: 2,
                  borderTop: `1px solid ${INK}`,
                  paddingTop: 5,
                }}
              >
                <span style={{ fontSize: 10, color: INK_FAINT }}>
                  Client signature
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  borderTop: `1px solid ${INK}`,
                  paddingTop: 5,
                }}
              >
                <span style={{ fontSize: 10, color: INK_FAINT }}>Date</span>
              </div>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <article
      className={className}
      style={{
        // US Letter at 96dpi. The preview is the page, scaled — not an
        // approximation of it, so what is on screen is what prints.
        width: "8.5in",
        minHeight: "11in",
        background: "#ffffff",
        color: INK,
        fontFamily: L.bodyFont,
        boxSizing: "border-box",
        position: "relative",
        padding: L.topBand ? "0.75in 0.75in 0.9in" : "0.85in 0.75in 0.9in",
        // Accent fills and bands are the point of the design; browsers drop
        // backgrounds when printing unless told not to.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      {L.topBand > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: L.topBand,
            background: accent,
          }}
        />
      )}
      {L.topBand > 0 && <div style={{ height: 20 }} />}

      {doc.visibleSections.map(section)}
    </article>
  );
}
