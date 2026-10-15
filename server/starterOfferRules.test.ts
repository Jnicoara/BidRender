/**
 * The offer rules a shop's "Updates" read is built on (shared/starterChange.ts,
 * references/starter-offers-plan.md § 3a, § 2.4, § 2.6). No database.
 *
 * Tests 4 and 5 of the plan's § 6 live here in their pure form: both are RED
 * on the § 10a.3 spec as written (per-row `baselineVersion`, one change's old
 * value), and `collapseOffer` is the fix.
 */
import { describe, expect, it } from "vitest";
import {
  DOES_NOT_RECOUNT,
  EXAMPLE_COMPANIONS,
  STARTER_FIELDS,
  canAnswerStarterOffers,
  collapseOffer,
  exampleTagAfter,
  offerBucket,
  recountClassified,
  recountsDrafts,
  type LoggedOfferChange,
  type StarterTable,
} from "../shared/starterChange";

const change = (
  id: number,
  oldValue: unknown,
  newValue: unknown,
  answer: LoggedOfferChange["answer"] = null
): LoggedOfferChange => ({ id, oldValue, newValue, answer });

const TABLES = Object.keys(STARTER_FIELDS) as StarterTable[];

describe("one offer per field (§ 3a)", () => {
  it("a field changed twice is ONE offer, base → latest, and still an offer (plan test 5)", () => {
    const chain = [
      change(1, "0.4800", "0.5200"),
      change(2, "0.5200", "0.5500"),
    ];
    const offer = collapseOffer(chain, "0.48");
    expect(offer).toMatchObject({
      base: "0.4800",
      latest: "0.5500",
      bucket: "offer",
      latestChangeId: 2,
      unansweredIds: [1, 2],
    });
    // What § 10a.3 did: compare with the LAST change alone. Own-value — the
    // shop never typed a price. Kept so the difference stays visible.
    expect(
      offerBucket({ oldValue: "0.52", newValue: "0.55", companyValue: "0.48" })
    ).toBe("own-value");
  });

  it("answering one field never hides another field's change (plan test 4)", () => {
    // Price 4→5 and hours 5→6 are separate chains; accepting hours touches
    // only its own. The price chain is read on its own and is still listed.
    const price = [change(10, "1.0000", "1.2000")];
    const hours = [change(11, "0.2000", "0.2500", "accepted")];
    expect(collapseOffer(hours, "0.25")).toBeNull();
    expect(collapseOffer(price, "1")).toMatchObject({
      bucket: "offer",
      latestChangeId: 10,
    });
  });

  it("an ignored change, then a newer one, is a new offer (owner Q7)", () => {
    const chain = [
      change(1, "0.48", "0.52", "ignored"),
      change(2, "0.52", "0.55"),
    ];
    expect(collapseOffer(chain, "0.48")).toMatchObject({
      bucket: "offer",
      latest: "0.55",
      unansweredIds: [2],
      answer: null,
    });
  });

  it("an accepted change, then a newer one, is an offer — not own-value", () => {
    const chain = [
      change(1, "0.48", "0.52", "accepted"),
      change(2, "0.52", "0.55"),
    ];
    expect(collapseOffer(chain, "0.52")?.bucket).toBe("offer");
  });

  it("an ignored newest change stays listed, flagged for the Ignored fold", () => {
    const offer = collapseOffer([change(1, "1", "2", "ignored")], "1");
    expect(offer).toMatchObject({ answer: "ignored", unansweredIds: [] });
  });

  it("the shop's own typed value is own-value", () => {
    expect(collapseOffer([change(1, "1", "2")], "7")?.bucket).toBe("own-value");
  });

  it("undo (plan test 6): offered to a shop that accepted, nothing to one that ignored or never answered", () => {
    const accepted = [
      change(1, "0.48", "0.52", "accepted"),
      change(2, "0.52", "0.48"),
    ];
    const ignored = [
      change(1, "0.48", "0.52", "ignored"),
      change(2, "0.52", "0.48"),
    ];
    const silent = [change(1, "0.48", "0.52"), change(2, "0.52", "0.48")];
    expect(collapseOffer(accepted, "0.52")).toMatchObject({
      bucket: "offer",
      latest: "0.48",
    });
    expect(collapseOffer(ignored, "0.48")).toBeNull();
    expect(collapseOffer(silent, "0.48")).toBeNull();
  });

  it("nothing logged, or already on the latest: nothing", () => {
    expect(collapseOffer([], "1")).toBeNull();
    expect(collapseOffer([change(1, "1", "2")], "2.0000")).toBeNull();
  });

  it("a recipe line compares as a whole (supplied comparison)", () => {
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    const line = { qty: "1.0000" };
    expect(collapseOffer([change(1, null, line)], null, same)?.bucket).toBe(
      "offer"
    );
    expect(collapseOffer([change(1, null, line)], line, same)).toBeNull();
  });
});

describe("who may answer (owner Q1)", () => {
  it("owner and admins only; estimators and viewers see the count, not the buttons", () => {
    expect(canAnswerStarterOffers("owner")).toBe(true);
    expect(canAnswerStarterOffers("admin")).toBe(true);
    expect(canAnswerStarterOffers("estimator")).toBe(false);
    expect(canAnswerStarterOffers("viewer")).toBe(false);
  });
});

describe("the Example tag travels with its number (§ 2.6)", () => {
  it("every companion field is an offer field, and every tag is app-kept", () => {
    for (const [table, fields] of Object.entries(EXAMPLE_COMPANIONS) as [
      StarterTable,
      Record<string, string>,
    ][])
      for (const [field, tag] of Object.entries(fields)) {
        expect([table, field, STARTER_FIELDS[table][field]]).toEqual([
          table,
          field,
          "offer",
        ]);
        expect([table, tag, STARTER_FIELDS[table][tag]]).toEqual([
          table,
          tag,
          "not-editable",
        ]);
      }
  });

  it("a price is tagged only above zero — blank or $0 is Not priced", () => {
    expect(exampleTagAfter("materials", "costPerUnit", "0.5500", {})).toEqual({
      tag: "isExamplePrice",
      value: true,
    });
    expect(
      exampleTagAfter("materials", "costPerUnit", "0.0000", {})?.value
    ).toBe(false);
    expect(exampleTagAfter("materials", "costPerUnit", null, {})?.value).toBe(
      false
    );
  });

  it("hours stay tagged while either of the row's hours is set", () => {
    expect(
      exampleTagAfter("materials", "laborHours", null, {
        fieldBendLaborHours: "0.1000",
      })?.value
    ).toBe(true);
    expect(
      exampleTagAfter("materials", "laborHours", null, {
        fieldBendLaborHours: null,
      })?.value
    ).toBe(false);
    expect(
      exampleTagAfter("assemblies", "overheadLaborHours", "0.2500", {
        baseLaborHours: null,
      })
    ).toEqual({ tag: "isExampleHours", value: true });
  });

  it("a rate is always BidRidge's example; an untagged field has none", () => {
    expect(exampleTagAfter("laborRates", "baseWage", "40", {})).toEqual({
      tag: "isExampleRate",
      value: true,
    });
    expect(exampleTagAfter("materials", "name", "x", {})).toBeNull();
    expect(exampleTagAfter("runTypes", "wireExtraPct", "5", {})).toBeNull();
  });
});

describe("which offers re-count Drafts (§ 2.4)", () => {
  it("every offer field is decided — a new one fails here until someone picks a side", () => {
    for (const table of TABLES) {
      const offers = Object.entries(STARTER_FIELDS[table])
        .filter(([, kind]) => kind === "offer")
        .map(([f]) => f)
        .sort();
      expect([table, recountClassified(table).sort()]).toEqual([table, offers]);
    }
  });

  it("no field is on both sides", () => {
    for (const table of TABLES)
      for (const f of DOES_NOT_RECOUNT[table])
        expect([table, f, recountsDrafts(table, f)]).toEqual([table, f, false]);
  });

  it("raceway facts, run-type parts and mounting height re-count; prices and hours never", () => {
    expect(recountsDrafts("materials", "stickLengthFeet")).toBe(true);
    expect(recountsDrafts("runTypes", "wireExtraPct")).toBe(true);
    expect(recountsDrafts("assemblies", "mountHeightTypeKey")).toBe(true);
    expect(recountsDrafts("materials", "costPerUnit")).toBe(false);
    expect(recountsDrafts("assemblies", "baseLaborHours")).toBe(false);
    expect(recountsDrafts("laborRates", "hourlyCost")).toBe(false);
  });
});
