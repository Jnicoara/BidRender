/**
 * A bid set to a tax area that is later ARCHIVED (break-it, 2026-10-15).
 *
 * The rate falls through to matching the job address (resolveTaxRate), and
 * with no address the bid says "not set" — honest. But the reason it gave
 * was "This bid has no job address", which sends the person to the address
 * when what happened is that the area they picked went away.
 */
import { describe, expect, it } from "vitest";
import { explainTaxStatus } from "../shared/salesTax";
import { resolveTaxRate } from "./bidPricing";

describe("the tax note when the bid's own tax area was archived", () => {
  it("falls through to matching, and finds nothing without an address", () => {
    const rate = resolveTaxRate(
      { taxJurisdictionId: 7, taxRateOverridePct: null, siteAddress: null },
      [] // area 7 archived: not among the live ones
    );
    expect(rate.source).toBe("none");
  });

  it("says the chosen area was archived, not that the address is missing", () => {
    const note = explainTaxStatus("no-rate", null, true);
    expect(note).toMatch(/chosen for this bid has been archived/);
    expect(note).not.toMatch(/no job address/);
  });

  it("keeps the address wording when no area was chosen", () => {
    expect(explainTaxStatus("no-rate", null)).toMatch(/no job address/);
    expect(explainTaxStatus("no-rate", null, false)).toMatch(/no job address/);
  });

  it("says nothing extra when tax is fine", () => {
    expect(explainTaxStatus("ok", null, true)).toBe(null);
  });
});
